/**
 * CogCalculationViewModel — MobX state management for the COG Zonal Calculation tool.
 *
 * Coordinates the workflow: drawing → configuring → calculating → results.
 */

import i18next from "i18next";
import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
  reaction,
  IReactionDisposer
} from "mobx";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import type { Polygon } from "geojson";
import type CogCatalogItem from "../Models/Catalog/CatalogItems/CogCatalogItem";
import CogTimeSeriesCatalogItem from "../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import ChartableMixin, {
  axesMatch,
  ChartAxis
} from "../ModelMixins/ChartableMixin";
import {
  calculateZonalStatistics,
  ZonalStatistics,
  ZonalCalculationResult
} from "../Core/CogZonalEngine";
import {
  calculateTimeSeriesZonalStatistics,
  estimateTimeSeriesWork,
  TimeStepResult,
  TimeSeriesProgress
} from "../Core/CogTimeSeriesCalculator";
import proxyCatalogItemUrl from "../Models/Catalog/proxyCatalogItemUrl";
import CommonStrata from "../Models/Definition/CommonStrata";
import {
  calendarPeriod,
  inclusiveDateEnd,
  periodBoundary,
  periodInput
} from "../Core/cogAnalysisPeriod";
import createAreaPolygon from "../Core/createAreaPolygon";
import UserDrawing from "../Models/UserDrawing";
import { BaseModel } from "../Models/Definition/Model";
import Terria from "../Models/Terria";
import type ViewState from "./ViewState";

// ─── Types ──────────────────────────────────────────────────────

export type CalculationPhase =
  | "idle"
  | "drawing"
  | "configuring"
  | "calculating"
  | "results"
  | "error";

export type CogItem = CogCatalogItem | CogTimeSeriesCatalogItem;

export interface TimeSeriesResultEntry {
  time: string;
  tag?: string;
  statistics: ZonalStatistics;
}

const STAT_LABELS: Record<keyof ZonalStatistics, string> = {
  mean: "Mean",
  min: "Minimum",
  max: "Maximum",
  sum: "Sum",
  count: "Valid pixels",
  noDataCount: "NoData pixels",
  median: "Median",
  stddev: "Std. deviation"
};

export interface AreaResultContext {
  resolutionId?: string;
  resolutionName: string;
  period: string;
  unit?: string;
}

const TIME_CHART_AXIS: ChartAxis = { name: "Time", scale: "time" };

// ─── ViewModel ──────────────────────────────────────────────────

export default class CogCalculationViewModel {
  @observable phase: CalculationPhase = "idle";
  @observable polygon: Polygon | undefined = undefined;
  @observable drawnPoints: Cartesian3[] = [];
  @observable selectedItemId: string | undefined = undefined;
  @observable selectedBand: number = 1;
  @observable selectedStatistic: keyof ZonalStatistics = "mean";
  @observable startDate: string | undefined = undefined;
  @observable endDate: string | undefined = undefined;
  @observable subsampleStep: number = 1;
  @observable overviewLevel: number | undefined = undefined;

  @observable isLoadingResolution = false;
  @observable resolutionError: string | undefined = undefined;
  @observable.ref resultContext: AreaResultContext | undefined = undefined;

  // Progress
  @observable progress: TimeSeriesProgress | undefined = undefined;
  @observable isCalculating: boolean = false;

  // Results
  @observable singleResult: ZonalCalculationResult | undefined = undefined;
  @observable timeSeriesResults: TimeStepResult[] | undefined = undefined;
  @observable error: string | undefined = undefined;

  private _contextVersion = 0;
  private _calculationVersion = 0;
  private _disposed = false;
  private _disposers: IReactionDisposer[] = [];
  private _abortController: AbortController | undefined = undefined;
  private _userDrawing: UserDrawing | undefined = undefined;
  readonly terria: Terria;
  readonly viewState: ViewState;

  constructor(viewState: ViewState, itemId?: string) {
    this.terria = viewState.terria;
    this.viewState = viewState;
    this.selectedItemId = itemId;
    makeObservable(this);
    this._disposers.push(
      reaction(
        () =>
          [
            this.selectedItem,
            this.selectedTimeSeriesItem?.activeResolution?.id,
            this.selectedTimeSeriesItem?.activeBand?.band ??
              this.selectedTimeSeriesItem?.renderOptions?.single?.band ??
              1
          ] as const,
        ([item, id, band], previous) => {
          if (
            previous &&
            item === previous[0] &&
            id === previous[1] &&
            band === previous[2]
          )
            return;
          (
            previous?.[0] as CogTimeSeriesCatalogItem | undefined
          )?.clearTemporaryAreaChart?.();
          this.syncResolution();
        },
        { fireImmediately: true }
      )
    );
    this._disposers.push(
      reaction(
        () => viewState.currentTool?.toolName,
        (name) => {
          if (name !== "cog-calculation-tool") this.dispose();
        }
      )
    );
  }

  // ─── Computed ──────────────────────────────────────────────

  @computed
  get cogItemsInWorkbench(): CogItem[] {
    return this.terria.workbench.items.filter(
      (item: any) => item.type === "cog" || item.type === "cog-time-series"
    ) as unknown as CogItem[];
  }

  @computed
  get selectedItem(): CogItem | undefined {
    if (!this.selectedItemId) return this.cogItemsInWorkbench[0];
    return this.cogItemsInWorkbench.find(
      (item: any) => item.uniqueId === this.selectedItemId
    );
  }

  @computed
  get isTimeSeries(): boolean {
    return this.selectedItem?.type === "cog-time-series";
  }

  @computed
  get selectedTimeSeriesItem(): CogTimeSeriesCatalogItem | undefined {
    return this.selectedItem instanceof CogTimeSeriesCatalogItem
      ? this.selectedItem
      : undefined;
  }

  @computed
  get timeEntries(): readonly {
    time: string;
    cogs: readonly string[];
    tag?: string;
  }[] {
    if (!this.isTimeSeries) return [];
    const item = this.selectedItem as any;
    return item.timeEntries ?? [];
  }

  @computed
  get estimatedWork(): { timeSteps: number; totalCogs: number } {
    if (!this.isTimeSeries || this.timeEntries.length === 0) {
      return { timeSteps: 0, totalCogs: 0 };
    }
    return estimateTimeSeriesWork(
      this.timeEntries as any,
      this.startDate,
      inclusiveDateEnd(this.endDate),
      this.subsampleStep
    );
  }

  @computed
  get hasCogItems(): boolean {
    return this.cogItemsInWorkbench.length > 0;
  }

  @computed
  get isTimeSeriesResultExpandedInChartPanel(): boolean {
    return (
      this.selectedTimeSeriesItem?.isTemporaryAreaChartExpandedInChartPanel ??
      false
    );
  }

  @computed get resolutions() {
    return (
      this.selectedTimeSeriesItem?.resolutions.filter(
        (r) => r.id !== undefined
      ) ?? []
    );
  }
  @computed get resolutionId() {
    return this.selectedTimeSeriesItem?.activeResolution?.id;
  }
  @computed get periodType() {
    return calendarPeriod(this.resolutionId);
  }
  @computed get resolutionName(): string {
    const resolution = this.selectedTimeSeriesItem?.activeResolution;
    return (
      resolution?.name ??
      resolution?.id ??
      i18next.t("models.cogCalculation.originalResolution")
    );
  }
  @computed get availableYears(): string[] {
    return Array.from(
      new Set(this.timeEntries.map((e) => e.time.slice(0, 4)))
    ).sort();
  }
  @computed get analysisUnit(): string | undefined {
    const item = this.selectedTimeSeriesItem;
    return (
      item?.availableBands.find((b) => b.band === this.selectedBand)?.unit ??
      item?.unit
    );
  }
  @computed get periodLabel(): string {
    const dates = this.timeEntries
      .map((e) => e.time)
      .filter((t) => Number.isFinite(Date.parse(t)))
      .sort();
    const start = this.startDate ?? dates[0]?.slice(0, 10);
    const end = this.endDate ?? dates[dates.length - 1]?.slice(0, 10);
    if (!start || !end) return i18next.t("models.cogCalculation.noPeriod");
    const first = periodInput(start, this.resolutionId),
      last = periodInput(end, this.resolutionId);
    return first === last ? first : `${first} – ${last}`;
  }

  @action private invalidateCalculation(): void {
    this.selectedTimeSeriesItem?.clearTemporaryAreaChart();
    this._calculationVersion++;
    this._abortController?.abort();
    this._abortController = undefined;
    this.isCalculating = false;
    this.singleResult = undefined;
    this.timeSeriesResults = undefined;
    this.resultContext = undefined;
    this.progress = undefined;
    this.error = undefined;
    if (this.polygon) this.phase = "configuring";
  }

  @action private syncResolution(): void {
    this.invalidateCalculation();
    this.startDate = periodBoundary(this.startDate, this.resolutionId);
    this.endDate = periodBoundary(this.endDate, this.resolutionId, true);
    this.selectedBand =
      this.selectedTimeSeriesItem?.activeBand?.band ??
      this.selectedTimeSeriesItem?.renderOptions?.single?.band ??
      1;
    void this.loadResolution();
  }

  @action async loadResolution(): Promise<void> {
    const version = ++this._contextVersion;
    const item = this.selectedTimeSeriesItem;
    this.resolutionError = undefined;
    this.isLoadingResolution = !!item;
    try {
      await item?.loadTimeSeriesMetadata();
    } catch (_error) {
      if (version === this._contextVersion && !this._disposed)
        runInAction(() => {
          this.resolutionError = i18next.t(
            "models.cogCalculation.resolutionLoadError"
          );
        });
    } finally {
      if (version === this._contextVersion && !this._disposed)
        runInAction(() => {
          this.isLoadingResolution = false;
        });
    }
  }

  @action setResolution(id: string): void {
    const item = this.selectedTimeSeriesItem;
    if (!item || !this.resolutions.some((r) => r.id === id)) return;
    item.setActiveResolution(CommonStrata.user, id);
  }

  // ─── Actions ──────────────────────────────────────────────

  @action
  startDrawing(): void {
    this.invalidateCalculation();
    // Clean up any existing drawing before starting a new one
    if (this._userDrawing) {
      this._userDrawing.endDrawing();
      this._userDrawing = undefined;
    }

    this.phase = "drawing";
    this.polygon = undefined;
    this.drawnPoints = [];
    this.singleResult = undefined;
    this.timeSeriesResults = undefined;
    this.error = undefined;
    this.progress = undefined;

    this._userDrawing = new UserDrawing({
      terria: this.terria,
      messageHeader: i18next.t("models.cogCalculation.toolName"),
      allowPolygon: true,
      invisible: true,
      polygonStyle: { stroke: "#0F6B82", fill: "rgba(15,107,130,0.18)" },
      completeOnClose: true,
      retainDrawingOnFinish: true,
      canComplete: (points) => !!this.polygonFromPoints(points),
      onPointClicked: () => this.updateDrawingPoints(),
      onPointMoved: () => this.updateDrawingPoints(),
      onDrawingComplete: ({ points }) => {
        this._onDrawingComplete(points);
      },
      onCleanUp: () => {
        if (this.phase === "drawing") {
          runInAction(() => {
            this.phase = "idle";
          });
        }
      }
    });
    this._userDrawing.enterDrawMode();
  }

  private polygonFromPoints(points: Cartesian3[]): Polygon | undefined {
    return createAreaPolygon(
      points.map((point) => {
        const carto = Cartographic.fromCartesian(point);
        return [
          CesiumMath.toDegrees(carto.longitude),
          CesiumMath.toDegrees(carto.latitude)
        ];
      })
    );
  }

  @computed get canFinishDrawing(): boolean {
    return !!this.polygonFromPoints(this.drawnPoints);
  }

  @action private updateDrawingPoints(): void {
    this.drawnPoints = this._userDrawing?.getPointsForShape() ?? [];
    this.error =
      this.drawnPoints.length >= 3 && !this.canFinishDrawing
        ? i18next.t("models.cogCalculation.invalidArea")
        : undefined;
  }

  @action finishDrawing(): void {
    if (!this._userDrawing?.finishDrawing()) {
      this.error = i18next.t("models.cogCalculation.invalidArea");
    }
  }

  @action undoDrawing(): void {
    this._userDrawing?.undoLastPoint();
  }

  @action
  private _onDrawingComplete(points: Cartesian3[]): void {
    const polygon = this.polygonFromPoints(points);
    if (!polygon) return;
    this.drawnPoints = points;
    this.polygon = polygon;
    this.error = undefined;
    this.phase = "configuring";
  }

  @action
  setSelectedItem(itemId: string): void {
    this.selectedItemId = itemId;
  }

  @action
  setBand(band: number): void {
    this.invalidateCalculation();
    this.selectedBand = band;
    const item = this.selectedTimeSeriesItem;
    const selected = item?.availableBands.find((b) => b.band === band);
    if (selected?.id) item?.setActiveBand(CommonStrata.user, selected.id);
  }

  @action
  setStatistic(stat: keyof ZonalStatistics): void {
    this.invalidateCalculation();
    this.selectedStatistic = stat;
  }

  @action
  setDateRange(start: string | undefined, end: string | undefined): void {
    this.invalidateCalculation();
    this.startDate = periodBoundary(start, this.resolutionId);
    this.endDate = periodBoundary(end, this.resolutionId, true);
  }

  @action
  setSubsampleStep(step: number): void {
    this.subsampleStep = Math.max(1, step);
  }

  @action
  setOverviewLevel(level: number | undefined): void {
    this.overviewLevel = level;
  }

  @action
  async startCalculation(): Promise<void> {
    if (this._disposed || this.isLoadingResolution || this.resolutionError)
      return;
    if (
      this.isTimeSeries &&
      (!this.estimatedWork.timeSteps ||
        (this.startDate && this.endDate && this.startDate > this.endDate))
    )
      return;
    if (!this.polygon || !this.selectedItem) {
      this.error = i18next.t("models.cogCalculation.selectLayerAndPolygon");
      this.phase = "error";
      return;
    }

    this.phase = "calculating";
    this.isCalculating = true;
    this.error = undefined;
    this.singleResult = undefined;
    this.timeSeriesResults = undefined;
    this._abortController?.abort();
    const controller = (this._abortController = new AbortController());
    const version = ++this._calculationVersion;
    this.resultContext = {
      resolutionId: this.resolutionId,
      resolutionName: this.resolutionName,
      period: this.periodLabel,
      unit:
        this.selectedStatistic === "count"
          ? i18next.t("models.cogCalculation.pixels")
          : this.analysisUnit
    };
    const current = () =>
      version === this._calculationVersion &&
      !controller.signal.aborted &&
      !this._disposed;

    try {
      if (this.isTimeSeries) {
        const result = await this._calculateTimeSeries(controller);
        if (!current()) return;
        runInAction(() => {
          this.timeSeriesResults = result;
        });
      } else {
        const result = await this._calculateSingle(controller);
        if (!current()) return;
        runInAction(() => {
          this.singleResult = result;
        });
      }

      runInAction(() => {
        this.phase = "results";
        this.isCalculating = false;
      });
    } catch (e: any) {
      if (!current()) return;
      runInAction(() => {
        if (e?.name === "AbortError") {
          this.phase = "configuring";
          this.error = undefined;
        } else {
          this.phase = "error";
          this.error =
            e?.message ?? i18next.t("models.cogCalculation.calculationError");
        }
        this.isCalculating = false;
      });
    }
  }

  private async _calculateSingle(
    controller: AbortController
  ): Promise<ZonalCalculationResult> {
    const item = this.selectedItem as any;
    // For a single COG, get the URL
    let cogUrl: string;
    if (item.type === "cog") {
      cogUrl = item.url;
    } else {
      // Shouldn't happen but handle it
      const entries = item.timeEntries;
      if (!entries || entries.length === 0)
        throw new Error(i18next.t("models.cogCalculation.noCogs"));
      cogUrl = entries[0].cogs[0];
    }
    // Same URL the imagery uses: a cross-origin COG that renders through the
    // proxy must be read through it too, or the calculation fails on CORS.
    cogUrl = proxyCatalogItemUrl(item, cogUrl);

    const result = await calculateZonalStatistics({
      cogUrl,
      polygon: this.polygon!,
      band: this.selectedBand,
      valueScale: item.valueScale,
      valueOffset: item.valueOffset,
      noDataValues: item.noDataValues,
      overviewLevel: this.overviewLevel,
      signal: controller.signal,
      onProgress: (fraction) => {
        if (controller !== this._abortController || controller.signal.aborted)
          return;
        runInAction(() => {
          this.progress = {
            completed: Math.floor(fraction * 100),
            total: 100,
            currentTime: "",
            fraction
          };
        });
      }
    });

    return result;
  }

  private async _calculateTimeSeries(
    controller: AbortController
  ): Promise<TimeStepResult[]> {
    const item = this.selectedItem as any;
    const entries = item.timeEntries;
    if (!entries || entries.length === 0) {
      throw new Error(i18next.t("models.cogCalculation.noTimeEntries"));
    }

    const results = await calculateTimeSeriesZonalStatistics({
      timeEntries: entries.map((entry: any) => ({
        time: entry.time,
        tag: entry.tag,
        cogs: (entry.cogs ?? []).map((url: string) =>
          proxyCatalogItemUrl(item, url)
        )
      })),
      polygon: this.polygon!,
      band: this.selectedBand,
      valueScale: item.valueScale,
      valueOffset: item.valueOffset,
      noDataValues: item.noDataValues,
      startDate: this.startDate,
      endDate: inclusiveDateEnd(this.endDate),
      subsampleStep: this.subsampleStep,
      overviewLevel: this.overviewLevel,
      concurrency: 2,
      signal: controller.signal,
      onProgress: (progress) => {
        if (controller !== this._abortController || controller.signal.aborted)
          return;
        runInAction(() => {
          this.progress = progress;
        });
      }
    });

    return results;
  }

  @action
  cancelCalculation(): void {
    this._calculationVersion++;
    this._abortController?.abort();
    this._abortController = undefined;
    this.isCalculating = false;
    this.phase = "configuring";
  }

  @action
  editPolygon(): void {
    this.phase = "drawing";
    this.startDrawing();
  }

  @action
  reset(): void {
    this.cancelCalculation();
    if (this._userDrawing) {
      this._userDrawing.endDrawing();
      this._userDrawing = undefined;
    }
    this.phase = "idle";
    this.polygon = undefined;
    this.drawnPoints = [];
    this.singleResult = undefined;
    this.timeSeriesResults = undefined;
    this.error = undefined;
    this.progress = undefined;
    this.startDate = undefined;
    this.endDate = undefined;
    this.subsampleStep = 1;
  }

  @action
  toggleTimeSeriesResultChartPanel(): void {
    const item = this.selectedTimeSeriesItem;
    if (
      !item ||
      !this.timeSeriesResults ||
      this.timeSeriesResults.length === 0
    ) {
      return;
    }

    const shouldExpand = !item.isTemporaryAreaChartExpandedInChartPanel;
    if (!shouldExpand) {
      item.setTemporaryAreaChartExpandedInChartPanel(false);
      return;
    }

    const values = this.timeSeriesResults
      .map((result) => ({
        time: result.time,
        value: (result.statistics as any)[this.selectedStatistic] as number
      }))
      .filter((entry) => isFinite(entry.value));

    if (values.length === 0) {
      item.clearTemporaryAreaChart();
      return;
    }

    item.setTemporaryAreaChart({
      name: `Area ${
        STAT_LABELS[this.selectedStatistic] ?? this.selectedStatistic
      } · ${this.resultContext?.resolutionName ?? this.resolutionName} · ${
        this.resultContext?.period ?? this.periodLabel
      }`,
      values
    });
    item.setTemporaryAreaChartExpandedInChartPanel(true);

    unselectChartItemsWithXAxisNotMatching(
      this.terria.workbench.items,
      TIME_CHART_AXIS
    );
  }

  exportCsv(): void {
    if (!this.timeSeriesResults || this.timeSeriesResults.length === 0) return;

    const stat = this.selectedStatistic;
    const item = this.selectedTimeSeriesItem;
    const header = [
      `# Analysis: user-drawn polygon; not a water-body core statistic`,
      `# Source: ${item?.name ?? "COG"}`,
      `# Temporal resolution: ${
        this.resultContext?.resolutionName ?? this.resolutionName
      } (${this.resultContext?.resolutionId ?? "original"})`,
      `# Period: ${this.resultContext?.period ?? this.periodLabel}`,
      `# Unit: ${this.resultContext?.unit ?? "not specified"}; band: ${
        this.selectedBand
      }`,
      `# Values converted to physical units before aggregation; nodata excluded`,
      `# Overview: ${
        this.overviewLevel ??
        "automatic (approximate; resolution may vary by date)"
      }`,
      `# Polygon: ${JSON.stringify(this.polygon)}`,
      `time,${stat}\n`
    ].join("\n");
    const rows = this.timeSeriesResults
      .map((r) => `${r.time},${(r.statistics as any)[stat]}`)
      .join("\n");

    const csvContent = header + rows;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `zonal_${stat}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    // Delay revoke to ensure browser has initiated the download
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._contextVersion++;
    this._disposers.forEach((dispose) => dispose());
    this._disposers = [];
    this.reset();
  }
}

function unselectChartItemsWithXAxisNotMatching(
  items: readonly BaseModel[],
  requiredAxis: ChartAxis
) {
  items.forEach((item) => {
    if (ChartableMixin.isMixedInto(item)) {
      item.chartItems.forEach((chartItem) => {
        if (!axesMatch(chartItem.xAxis, requiredAxis)) {
          chartItem.updateIsSelectedInWorkbench(false);
        }
      });
    }
  });
}
