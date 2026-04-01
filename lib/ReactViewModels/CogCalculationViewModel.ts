/**
 * CogCalculationViewModel — MobX state management for the COG Zonal Calculation tool.
 *
 * Coordinates the workflow: drawing → configuring → calculating → results.
 */

import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction
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

  // Progress
  @observable progress: TimeSeriesProgress | undefined = undefined;
  @observable isCalculating: boolean = false;

  // Results
  @observable singleResult: ZonalCalculationResult | undefined = undefined;
  @observable timeSeriesResults: TimeStepResult[] | undefined = undefined;
  @observable error: string | undefined = undefined;

  private _abortController: AbortController | undefined = undefined;
  private _userDrawing: UserDrawing | undefined = undefined;
  readonly terria: Terria;
  readonly viewState: ViewState;

  constructor(viewState: ViewState) {
    this.terria = viewState.terria;
    this.viewState = viewState;
    makeObservable(this);
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
      this.endDate,
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

  // ─── Actions ──────────────────────────────────────────────

  @action
  startDrawing(): void {
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
      messageHeader: "COG Zonal Statistics",
      allowPolygon: true,
      onPointClicked: () => {},
      onPointMoved: () => {},
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

  @action
  private _onDrawingComplete(points: Cartesian3[]): void {
    if (points.length < 3) {
      this.error = "Se necesitan al menos 3 puntos para formar un polígono";
      this.phase = "error";
      return;
    }

    this.drawnPoints = points;

    // Convert Cartesian3 points to GeoJSON Polygon (EPSG:4326)
    const coordinates = points.map((point) => {
      const carto = Cartographic.fromCartesian(point);
      return [
        CesiumMath.toDegrees(carto.longitude),
        CesiumMath.toDegrees(carto.latitude)
      ];
    });
    // Close the ring
    coordinates.push([...coordinates[0]]);

    this.polygon = {
      type: "Polygon",
      coordinates: [coordinates]
    };

    this.phase = "configuring";
  }

  @action
  setSelectedItem(itemId: string): void {
    this.selectedItemId = itemId;
  }

  @action
  setBand(band: number): void {
    this.selectedBand = band;
  }

  @action
  setStatistic(stat: keyof ZonalStatistics): void {
    this.selectedStatistic = stat;
  }

  @action
  setDateRange(start: string | undefined, end: string | undefined): void {
    this.startDate = start;
    this.endDate = end;
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
    if (!this.polygon || !this.selectedItem) {
      this.error = "Selecciona una capa y dibuja un polígono primero";
      this.phase = "error";
      return;
    }

    this.phase = "calculating";
    this.isCalculating = true;
    this.error = undefined;
    this.singleResult = undefined;
    this.timeSeriesResults = undefined;
    this._abortController = new AbortController();

    try {
      if (this.isTimeSeries) {
        await this._calculateTimeSeries();
      } else {
        await this._calculateSingle();
      }

      runInAction(() => {
        this.phase = "results";
        this.isCalculating = false;
      });
    } catch (e: any) {
      runInAction(() => {
        if (e?.name === "AbortError") {
          this.phase = "configuring";
          this.error = undefined;
        } else {
          this.phase = "error";
          this.error = e?.message ?? "Error durante el cálculo";
        }
        this.isCalculating = false;
      });
    }
  }

  private async _calculateSingle(): Promise<void> {
    const item = this.selectedItem as any;
    // For a single COG, get the URL
    let cogUrl: string;
    if (item.type === "cog") {
      cogUrl = item.url;
    } else {
      // Shouldn't happen but handle it
      const entries = item.timeEntries;
      if (!entries || entries.length === 0)
        throw new Error("No hay COGs disponibles");
      cogUrl = entries[0].cogs[0];
    }

    const result = await calculateZonalStatistics({
      cogUrl,
      polygon: this.polygon!,
      band: this.selectedBand,
      overviewLevel: this.overviewLevel,
      signal: this._abortController?.signal,
      onProgress: (fraction) => {
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

    runInAction(() => {
      this.singleResult = result;
    });
  }

  private async _calculateTimeSeries(): Promise<void> {
    const item = this.selectedItem as any;
    const entries = item.timeEntries;
    if (!entries || entries.length === 0) {
      throw new Error("No hay time entries disponibles");
    }

    const results = await calculateTimeSeriesZonalStatistics({
      timeEntries: entries,
      polygon: this.polygon!,
      band: this.selectedBand,
      startDate: this.startDate,
      endDate: this.endDate,
      subsampleStep: this.subsampleStep,
      overviewLevel: this.overviewLevel,
      concurrency: 2,
      signal: this._abortController?.signal,
      onProgress: (progress) => {
        runInAction(() => {
          this.progress = progress;
        });
      }
    });

    runInAction(() => {
      this.timeSeriesResults = results;
    });
  }

  @action
  cancelCalculation(): void {
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
    const header = `time,${stat}\n`;
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
    this.reset();
  }
}

function unselectChartItemsWithXAxisNotMatching(
  items: BaseModel[],
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
