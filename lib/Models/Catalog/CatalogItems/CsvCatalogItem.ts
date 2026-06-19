import i18next from "i18next";
import {
  action,
  computed,
  makeObservable,
  observable,
  override,
  runInAction
} from "mobx";
import isDefined from "../../../Core/isDefined";
import TerriaError from "../../../Core/TerriaError";
import { ChartItem } from "../../../ModelMixins/ChartableMixin";
import AutoRefreshingMixin from "../../../ModelMixins/AutoRefreshingMixin";
import TableMixin from "../../../ModelMixins/TableMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import Csv from "../../../Table/Csv";
import TableAutomaticStylesStratum from "../../../Table/TableAutomaticStylesStratum";
import CsvCatalogItemTraits from "../../../Traits/TraitsClasses/CsvCatalogItemTraits";
import { AccumulatedSeries } from "../../../ReactViews/Custom/Chart/ChartJs/ChartJsTypes";
import CreateModel from "../../Definition/CreateModel";
import { BaseModel } from "../../Definition/Model";
import { SelectableDimension } from "../../SelectableDimensions/SelectableDimensions";
import StratumOrder from "../../Definition/StratumOrder";
import HasLocalData from "../../HasLocalData";
import Terria from "../../Terria";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";

/** Maximum number of accumulated per-feature series kept at once. */
export const MAX_ACCUMULATED = 12;

// Types of CSVs:
// - Points - Latitude and longitude columns or address
// - Regions - Region column
// - Chart - No spatial reference at all
// - Other geometry - e.g. a WKT column

// Types of time varying:
// - ID+time column -> point moves, region changes (continuously?) over time
// - points, no ID, time -> "blips" with a duration (perhaps provided by another column)
//
export default class CsvCatalogItem
  extends AutoRefreshingMixin(
    TableMixin(UrlMixin(CreateModel(CsvCatalogItemTraits)))
  )
  implements HasLocalData
{
  static get type() {
    return "csv";
  }

  private _csvFile?: File;

  /**
   * Per-feature time-series accumulated by clicking map features while the
   * interactive Chart.js renderer (`useChartJsTimeSeries`) is enabled. Drives
   * the non-blocking bottom dock so multiple features can be compared without
   * re-opening a modal. Shallow because each entry is a plain, immutable-by-
   * convention value object (we replace, never mutate, entries).
   */
  @observable.shallow
  accumulatedChartSeries: AccumulatedSeries[] = [];

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference: BaseModel | undefined
  ) {
    super(id, terria, sourceReference);
    makeObservable(this);
    this.strata.set(
      TableAutomaticStylesStratum.stratumName,
      new TableAutomaticStylesStratum(this)
    );
  }

  get type() {
    return CsvCatalogItem.type;
  }

  setFileInput(file: File) {
    this._csvFile = file;
  }

  /**
   * Add (or replace) an accumulated per-feature series. De-duplicates by `key`
   * so re-clicking the same feature never produces duplicate datasets, and caps
   * the total at {@link MAX_ACCUMULATED}, dropping the oldest entries first.
   */
  @action
  addAccumulatedSeries(series: AccumulatedSeries) {
    const existingIndex = this.accumulatedChartSeries.findIndex(
      (s) => s.key === series.key
    );
    if (existingIndex >= 0) {
      // Replace in place so the freshest data wins without re-ordering.
      this.accumulatedChartSeries.splice(existingIndex, 1, series);
      return;
    }
    this.accumulatedChartSeries.push(series);
    if (this.accumulatedChartSeries.length > MAX_ACCUMULATED) {
      this.accumulatedChartSeries.splice(
        0,
        this.accumulatedChartSeries.length - MAX_ACCUMULATED
      );
    }
  }

  /** Remove all accumulated per-feature series. */
  @action
  clearAccumulatedSeries() {
    this.accumulatedChartSeries = [];
  }

  /** Remove a single accumulated per-feature series by its `key`. */
  @action
  removeAccumulatedSeries(key: string) {
    this.accumulatedChartSeries = this.accumulatedChartSeries.filter(
      (s) => s.key !== key
    );
  }

  /**
   * Map the accumulated series to full {@link ChartItem}s so they can be fed
   * straight to `ChartJsLineChart` via its `chartItemsOverride` prop. The
   * x-axis is always time (the accumulation only runs for CSVs that have a time
   * column).
   */
  @computed
  get accumulatedChartItems(): ChartItem[] {
    const timeColumnTitle = this.activeTableStyle.timeColumn?.title ?? "Date";
    return this.accumulatedChartSeries.map((series) => ({
      id: series.key,
      name: series.name,
      key: series.key,
      item: this,
      type: "line" as const,
      units: series.units,
      showInChartPanel: true,
      isSelectedInWorkbench: false,
      xAxis: { name: timeColumnTitle, scale: "time" as const },
      points: series.points.map((p) => ({ x: p.x, y: p.y })),
      domain: {
        x: series.points.map((p) => p.x),
        y: series.points.map((p) => p.y)
      },
      getColor: () => series.color,
      updateIsSelectedInWorkbench: () => {}
    }));
  }

  @computed
  get hasLocalData(): boolean {
    return isDefined(this._csvFile);
  }

  @override
  get _canExportData() {
    return (
      isDefined(this._csvFile) ||
      isDefined(this.csvString) ||
      isDefined(this.url)
    );
  }

  @override
  get cacheDuration() {
    return super.cacheDuration || "1d";
  }

  /**
   * Append a workbench checkbox to toggle the interactive Chart.js renderer for
   * per-feature time-series charts (see the `useChartJsTimeSeries` trait). Only
   * shown when the CSV has a time column, i.e. when time-series charts are
   * actually produced in the feature info panel.
   */
  @override
  get selectableDimensions(): SelectableDimension[] {
    return [
      ...super.selectableDimensions,
      this.chartJsTimeSeriesDimension
    ].filter(isDefined);
  }

  @computed
  get chartJsTimeSeriesDimension(): SelectableDimension | undefined {
    if (this.activeTableStyle.timeColumn === undefined) {
      return undefined;
    }
    // Same label for both states so the checkbox text stays stable; the
    // checkbox itself indicates whether the mode is on.
    const label = i18next.t("models.csv.useChartJsTimeSeries");
    return {
      id: "useChartJsTimeSeries",
      type: "checkbox",
      options: [
        { id: "true" as const, name: label },
        { id: "false" as const, name: label }
      ],
      selectedId: this.useChartJsTimeSeries ? "true" : "false",
      setDimensionValue: (
        stratumId: string,
        value: "true" | "false" | undefined
      ) => {
        this.setTrait(stratumId, "useChartJsTimeSeries", value === "true");
      }
    };
  }

  protected async _exportData() {
    if (isDefined(this._csvFile)) {
      return {
        name: (this.name || this.uniqueId)!,
        file: this._csvFile
      };
    }
    if (isDefined(this.csvString)) {
      return {
        name: (this.name || this.uniqueId)!,
        file: new Blob([this.csvString])
      };
    }

    if (isDefined(this.url)) {
      return this.url;
    }

    throw new TerriaError({
      sender: this,
      message: "No data available to download."
    });
  }

  /*
   * The polling URL to use for refreshing data.
   */
  @computed get refreshUrl() {
    return this.polling.url || this.url;
  }

  /*
   * Called by AutoRefreshingMixin to get the polling interval
   */
  @override
  get refreshInterval() {
    if (this.refreshUrl) {
      return this.polling.seconds;
    }
  }

  /*
   * Hook called by AutoRefreshingMixin to refresh data.
   *
   * The refresh happens only if a `refreshUrl` is defined.
   * If `shouldReplaceData` is true, then the new data replaces current data,
   * otherwise new data is appended to current data.
   */
  refreshData() {
    if (!this.refreshUrl) {
      return;
    }

    Csv.parseUrl(
      proxyCatalogItemUrl(this, this.refreshUrl),
      true,
      this.ignoreRowsStartingWithComment
    ).then((dataColumnMajor) => {
      runInAction(() => {
        if (this.polling.shouldReplaceData) {
          this.dataColumnMajor = dataColumnMajor;
        } else {
          this.append(dataColumnMajor);
        }
      });
    });
  }

  protected forceLoadTableData(): Promise<string[][]> {
    if (this.csvString !== undefined) {
      return Csv.parseString(
        this.csvString,
        true,
        this.ignoreRowsStartingWithComment
      );
    } else if (this._csvFile !== undefined) {
      return Csv.parseFile(
        this._csvFile,
        true,
        this.ignoreRowsStartingWithComment
      );
    } else if (this.url !== undefined) {
      return Csv.parseUrl(
        proxyCatalogItemUrl(this, this.url),
        true,
        this.ignoreRowsStartingWithComment
      );
    } else {
      return Promise.reject(
        new TerriaError({
          sender: this,
          title: i18next.t("models.csv.unableToLoadItemTitle"),
          message: i18next.t("models.csv.unableToLoadItemMessage")
        })
      );
    }
  }
}

StratumOrder.addLoadStratum(TableAutomaticStylesStratum.stratumName);
