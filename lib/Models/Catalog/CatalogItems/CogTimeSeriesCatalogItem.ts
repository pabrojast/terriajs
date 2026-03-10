import i18next from "i18next";
import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  reaction,
  runInAction
} from "mobx";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import DiscretelyTimeVaryingMixin, {
  DiscreteTimeAsJS
} from "../../../ModelMixins/DiscretelyTimeVaryingMixin";
import MappableMixin, { MapItem } from "../../../ModelMixins/MappableMixin";
import CogTimeSeriesCatalogItemTraits from "../../../Traits/TraitsClasses/CogTimeSeriesCatalogItemTraits";
import { RectangleTraits } from "../../../Traits/TraitsClasses/MappableTraits";
import { FeatureInfoTemplateTraits } from "../../../Traits/TraitsClasses/FeatureInfoTraits";
import CreateModel from "../../Definition/CreateModel";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import StratumOrder from "../../Definition/StratumOrder";
import Terria from "../../Terria";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";
import loadJson from "../../../Core/loadJson";
import TerriaError from "../../../Core/TerriaError";
import { CogTimeEntryTraits } from "../../../Traits/TraitsClasses/CogTimeSeriesCatalogItemTraits";
import TerriaFeature from "../../Feature/Feature";
import {
  TimeSeriesFeatureInfoContext,
  TimeSeriesContext
} from "../../../Table/tableFeatureInfoContext";

/**
 * Cached imagery provider entry for a specific time step.
 */
interface CachedProvider {
  /** The time step key (ISO 8601 string) */
  timeKey: string;
  /** One or more TIFFImageryProviders (one per COG URL in the mosaic) */
  providers: TIFFImageryProvider[];
  /** Timestamp of last access for LRU eviction */
  lastAccess: number;
}

/**
 * Structure expected when loading time entries from a remote JSON URL.
 */
interface TimeSeriesJsonDefinition {
  times: Array<{
    time: string;
    cogs: string[];
    tag?: string;
  }>;
}

/**
 * Structure expected when loading precalculated area calculation values.
 */
interface PrecalculatedValuesJson {
  values: Array<{
    time: string;
    value: number;
  }>;
}

/**
 * State for a point-based time series extracted on click.
 */
interface PointTimeSeriesState {
  loading: boolean;
  totalSteps: number;
  loadedSteps: number;
  data: Array<{ time: string; tag?: string; value: number }>;
}

/** Max concurrent COG pixel reads for time series extraction */
const POINT_TS_CONCURRENCY = 8;

/**
 * Run async tasks with a concurrency limit, calling onResult for each completed item.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, index: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      const result = await fn(items[idx], idx);
      results[idx] = result;
      onResult?.(result, idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Loadable stratum for CogTimeSeriesCatalogItem.
 * Loads time entries from a remote JSON URL and area calculation values.
 */
class CogTimeSeriesStratum extends LoadableStratum(
  CogTimeSeriesCatalogItemTraits
) {
  static stratumName = "cog-time-series-stratum";

  @observable
  private _loadedTimeEntries:
    | StratumFromTraits<CogTimeEntryTraits>[]
    | undefined;
  private _loadedAreaValues: Map<
    string,
    Array<{ time: string; value: number }>
  > = new Map();
  @observable
  private _rectangle: StratumFromTraits<RectangleTraits> | undefined =
    undefined;

  constructor(readonly model: CogTimeSeriesCatalogItem) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new CogTimeSeriesStratum(model as CogTimeSeriesCatalogItem) as this;
  }

  @computed
  get shortReport(): string | undefined {
    if (this.model.terria.currentViewer.type === "Leaflet") {
      return i18next.t("models.commonModelErrors.3dTypeIn2dMode", this);
    }
    return undefined;
  }

  /**
   * Default feature info template that renders a time series chart
   * when the user clicks on the map.
   */
  @computed
  get featureInfoTemplate(): StratumFromTraits<FeatureInfoTemplateTraits> {
    console.log("[COG-TS] featureInfoTemplate getter called");
    return createStratumInstance(FeatureInfoTemplateTraits, {
      template:
        '<div style="min-height:80px">' +
        "{{#terria.timeSeries.chart}}" +
        "{{{terria.timeSeries.chart}}}" +
        "{{/terria.timeSeries.chart}}" +
        "{{^terria.timeSeries.chart}}" +
        "<p><em>Click to load time series…</em></p>" +
        "{{/terria.timeSeries.chart}}" +
        "</div>"
    });
  }

  @computed
  get timeEntries(): StratumFromTraits<CogTimeEntryTraits>[] | undefined {
    return this._loadedTimeEntries;
  }

  @computed
  get rectangle(): StratumFromTraits<RectangleTraits> | undefined {
    return this._rectangle;
  }

  setRectangle(rect: StratumFromTraits<RectangleTraits>) {
    runInAction(() => {
      this._rectangle = rect;
    });
  }

  /**
   * Load time entries from a remote JSON URL.
   */
  async loadTimeEntries(): Promise<void> {
    if (!this.model.url) {
      return;
    }

    const url = proxyCatalogItemUrl(this.model, this.model.url);
    try {
      const json = await loadJson<TimeSeriesJsonDefinition>(url);
      if (json && Array.isArray(json.times)) {
        runInAction(() => {
          this._loadedTimeEntries = json.times.map((entry) =>
            createStratumInstance(CogTimeEntryTraits, {
              time: entry.time,
              cogs: entry.cogs as any,
              tag: entry.tag
            })
          );
        });
      }
    } catch (e) {
      throw TerriaError.from(e, {
        title: i18next.t("models.cogTimeSeries.loadTimeEntriesErrorTitle"),
        message: i18next.t("models.cogTimeSeries.loadTimeEntriesErrorMessage", {
          url: this.model.url
        })
      });
    }
  }

  /**
   * Load precalculated area calculation values from remote URLs.
   */
  async loadAreaCalculationValues(): Promise<void> {
    const areaCalcs = this.model.areaCalculations;
    if (!areaCalcs || areaCalcs.length === 0) {
      return;
    }

    const promises = areaCalcs
      .filter((calc) => calc.precalculatedUrl && calc.name)
      .map(async (calc) => {
        try {
          const url = proxyCatalogItemUrl(this.model, calc.precalculatedUrl!);
          const json = await loadJson<PrecalculatedValuesJson>(url);
          if (json && Array.isArray(json.values)) {
            runInAction(() => {
              this._loadedAreaValues.set(calc.name!, json.values);
            });
          }
        } catch (e) {
          // Non-fatal: area calculations are optional
          console.warn(
            `Failed to load area calculation values for "${calc.name}":`,
            e
          );
        }
      });

    await Promise.all(promises);
  }

  /**
   * Get loaded area values for a given calculation name.
   */
  getAreaValues(
    name: string
  ): Array<{ time: string; value: number }> | undefined {
    return this._loadedAreaValues.get(name);
  }
}

StratumOrder.addLoadStratum(CogTimeSeriesStratum.stratumName);

/**
 * A time-varying Cloud Optimised GeoTIFF catalog item.
 *
 * Supports:
 * - Timeline navigation across discrete time steps
 * - Multiple COG files per time step (mosaics)
 * - Area calculations with precalculated values
 * - All COG rendering options (color scales, bands, domain, etc.)
 */
export default class CogTimeSeriesCatalogItem extends DiscretelyTimeVaryingMixin(
  MappableMixin(CatalogMemberMixin(CreateModel(CogTimeSeriesCatalogItemTraits)))
) {
  static readonly type = "cog-time-series";

  /** Cache of TIFFImageryProviders keyed by time step */
  private _providerCache: CachedProvider[] = [];

  /** Currently active imagery providers for the displayed time step */
  @observable
  private _currentProviders: TIFFImageryProvider[] = [];

  /** The stratum handling data loading */
  private _stratum: CogTimeSeriesStratum;

  /**
   * Observable cache for point-click time series extraction.
   * Key: "lat,lon" rounded to 6 decimals.
   */
  @observable.shallow
  private _pointTimeSeriesCache = new Map<string, PointTimeSeriesState>();

  /** Track which point load is in progress so we can ignore stale results */
  private _activePointLoadKey: string | undefined;

  /** Reprojector function (same as CogCatalogItem) */
  reprojector = reprojector;

  get type() {
    return CogTimeSeriesCatalogItem.type;
  }

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel | undefined
  ) {
    super(id, terria, sourceReference);
    makeObservable(this);

    this._stratum = new CogTimeSeriesStratum(this);
    this.strata.set(CogTimeSeriesStratum.stratumName, this._stratum);

    // Destroy providers when mapItems is no longer observed
    onBecomeUnobserved(this, "mapItems", () => {
      this._destroyAllProviders();
    });

    // Re-create providers if mapItems is observed again
    onBecomeObserved(this, "mapItems", () => {
      if (this._currentProviders.length === 0 && !this.isLoadingMapItems) {
        this.loadMapItems(true);
      }
    });

    // Watch for render option changes and reload
    reaction(
      () => ({
        colorScale: this.renderOptions?.single?.colorScale,
        colors: this.renderOptions?.single?.colors,
        type: this.renderOptions?.single?.type,
        domain: this.renderOptions?.single?.domain,
        displayRange: this.renderOptions?.single?.displayRange,
        applyDisplayRange: this.renderOptions?.single?.applyDisplayRange,
        clampLow: this.renderOptions?.single?.clampLow,
        clampHigh: this.renderOptions?.single?.clampHigh,
        band: this.renderOptions?.single?.band,
        reverseColorScale: this.renderOptions?.single?.reverseColorScale,
        noDataColor: this.renderOptions?.single?.noDataColor,
        nodata: this.renderOptions?.nodata
      }),
      () => {
        if (this._currentProviders.length > 0 && !this.isLoadingMapItems) {
          // Clear cache because render options changed
          this._destroyAllProviders();
          this.loadMapItems(true);
        }
      }
    );

    // React to time changes
    reaction(
      () => this.currentDiscreteTimeTag,
      () => {
        if (!this.isLoadingMapItems) {
          this._updateProvidersForCurrentTime();
        }
      }
    );
  }

  // ──────────────────────────────────────────────
  // DiscretelyTimeVaryingMixin implementation
  // ──────────────────────────────────────────────

  /**
   * Returns the discrete time steps derived from inline timeEntries or loaded from URL.
   */
  @computed
  get discreteTimes(): DiscreteTimeAsJS[] | undefined {
    const entries = this.timeEntries;
    if (!entries || entries.length === 0) {
      return undefined;
    }

    return entries
      .filter((entry) => entry.time !== undefined)
      .map((entry) => ({
        time: entry.time!,
        tag: entry.tag || entry.time
      }));
  }

  // ──────────────────────────────────────────────
  // MappableMixin implementation
  // ──────────────────────────────────────────────

  /**
   * Load time entries and area calculation data.
   */
  protected async forceLoadMapItems(): Promise<void> {
    // Load time entries from URL if not defined inline
    if ((!this.timeEntries || this.timeEntries.length === 0) && this.url) {
      await this._stratum.loadTimeEntries();
    }

    // Load precalculated area values
    await this._stratum.loadAreaCalculationValues();

    // Create imagery providers for the current time step
    await this._updateProvidersForCurrentTime();
  }

  /**
   * Returns map items (imagery layers) for the current time step.
   * Each COG in the time step becomes a separate ImageryParts entry (mosaic support).
   * Each provider uses its own rectangle as clipping rectangle to avoid
   * Cesium rendering crashes when mosaic tiles cover different geographic areas.
   */
  @computed
  get mapItems(): MapItem[] {
    if (this._currentProviders.length === 0) {
      return [];
    }

    return this._currentProviders
      .filter((provider) => provider.rectangle !== undefined)
      .map((provider) => ({
        show: this.show,
        alpha: this.opacity,
        imageryProvider: provider as any,
        clippingRectangle: provider.rectangle
      }));
  }

  // ──────────────────────────────────────────────
  // Area Calculation Accessors
  // ──────────────────────────────────────────────

  /**
   * Get all area calculations with their values for the current time step.
   */
  @computed
  get currentAreaCalculationResults(): Array<{
    name: string;
    value: number | undefined;
    unit: string | undefined;
    statistic: string | undefined;
  }> {
    const results: Array<{
      name: string;
      value: number | undefined;
      unit: string | undefined;
      statistic: string | undefined;
    }> = [];

    const areaCalcs = this.areaCalculations;
    if (!areaCalcs || areaCalcs.length === 0) {
      return results;
    }

    const currentJulian = this.currentDiscreteJulianDate;
    if (!currentJulian) {
      return results;
    }
    const currentTimeIso = JulianDate.toIso8601(currentJulian);

    // Helper to match time strings — compare both raw strings and parsed JulianDates
    // to handle format differences (e.g., "2024-01-01T00:00:00Z" vs "2024-01-01T00:00:00.000Z")
    const timeMatches = (valueTime: string | undefined): boolean => {
      if (!valueTime) return false;
      if (valueTime === currentTimeIso) return true;
      try {
        return JulianDate.equals(
          JulianDate.fromIso8601(valueTime),
          currentJulian
        );
      } catch {
        return false;
      }
    };

    for (const calc of areaCalcs) {
      if (!calc.name) continue;

      let value: number | undefined;

      // Check inline values first
      if (calc.values && calc.values.length > 0) {
        const match = calc.values.find((v) => timeMatches(v.time));
        value = match?.value;
      }

      // Then check loaded values from URL
      if (value === undefined) {
        const loadedValues = this._stratum.getAreaValues(calc.name);
        if (loadedValues) {
          const match = loadedValues.find((v) => timeMatches(v.time));
          value = match?.value;
        }
      }

      results.push({
        name: calc.name,
        value,
        unit: calc.unit,
        statistic: calc.statistic
      });
    }

    return results;
  }

  /**
   * Get area calculation chart data for displaying in the chart panel.
   * Returns time series of values for each area calculation.
   */
  getAreaCalculationTimeSeries(
    calculationName: string
  ): Array<{ time: string; value: number }> | undefined {
    const calc = this.areaCalculations?.find((c) => c.name === calculationName);
    if (!calc) return undefined;

    // Prefer inline values
    if (calc.values && calc.values.length > 0) {
      return calc.values
        .filter((v) => v.time !== undefined && v.value !== undefined)
        .map((v) => ({ time: v.time!, value: v.value! }));
    }

    // Fall back to loaded values
    return this._stratum.getAreaValues(calculationName);
  }

  // ──────────────────────────────────────────────
  // Feature Info — click to extract time series
  // ──────────────────────────────────────────────

  /**
   * Implements FeatureInfoContext.
   * When the user clicks on the map, reads the pixel value at that point
   * from every time step and returns a chart with the time series.
   */
  @computed
  get featureInfoContext(): (
    feature: TerriaFeature
  ) => TimeSeriesFeatureInfoContext {
    return (feature: TerriaFeature): TimeSeriesFeatureInfoContext => {
      console.log(
        "[COG-TS] featureInfoContext called, feature name:",
        (feature as any).name
      );
      const latLon = this._extractLatLonFromFeature(feature);
      if (!latLon) {
        console.log("[COG-TS] Could not extract lat/lon from feature");
        return {};
      }
      console.log("[COG-TS] Extracted lat/lon:", latLon);

      const key = `${latLon.lat.toFixed(6)},${latLon.lon.toFixed(6)}`;
      const cached = this._pointTimeSeriesCache.get(key);

      if (!cached) {
        // Schedule loading outside the MobX computed derivation
        queueMicrotask(() =>
          this._loadPointTimeSeries(latLon.lat, latLon.lon, key)
        );
        return this._buildLoadingContext("Loading…");
      }

      if (cached.data.length === 0 && cached.loading) {
        return this._buildLoadingContext(`Loading… (0/${cached.totalSteps})`);
      }

      // Build CSV from collected data
      const sorted = [...cached.data].sort((a, b) =>
        a.time.localeCompare(b.time)
      );
      const csvLines = [
        "time,value",
        ...sorted.map((d) => `${d.tag || d.time},${d.value.toFixed(4)}`)
      ];
      const csvData = csvLines.join("\n");
      const title = this.name || "Time Series";
      const featureId = `cog-ts-${key}`;
      const progress = cached.loading
        ? ` (${cached.loadedSteps}/${cached.totalSteps})`
        : "";

      const chartTitle = title + progress;

      const timeSeries: TimeSeriesContext = {
        title: chartTitle,
        xName: "time",
        yName: "value",
        id: featureId,
        data: csvData,
        chart: `<chart identifier="${featureId}" title="${chartTitle}">${csvData}</chart>`
      };

      return { terria: { timeSeries } };
    };
  }

  /**
   * Build a loading placeholder context for the feature info template.
   */
  private _buildLoadingContext(message: string): TimeSeriesFeatureInfoContext {
    return {
      terria: {
        timeSeries: {
          title: message,
          data: "",
          chart: ""
        }
      }
    };
  }

  /**
   * Extract lat/lon in degrees from the picked feature.
   * TIFFImageryProvider sets feature.name to "lon:X.XXXXXX, lat:Y.YYYYYY".
   */
  private _extractLatLonFromFeature(
    feature: TerriaFeature
  ): { lat: number; lon: number } | undefined {
    // Entity.name typing varies across Cesium versions
    const name = (feature as any).name as string | undefined;
    if (!name) return undefined;

    const match = name.match(/lon:\s*([-\d.]+),\s*lat:\s*([-\d.]+)/);
    if (match) {
      return { lon: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
    return undefined;
  }

  /**
   * Load pixel values from all time step COGs at the given lat/lon.
   * Updates `_pointTimeSeriesCache` progressively so the chart refreshes.
   */
  private async _loadPointTimeSeries(
    lat: number,
    lon: number,
    key: string
  ): Promise<void> {
    const entries = this.timeEntries;
    if (!entries || entries.length === 0) return;

    // Mark this as the active load
    this._activePointLoadKey = key;

    // Initialize state
    const state: PointTimeSeriesState = {
      loading: true,
      totalSteps: entries.length,
      loadedSteps: 0,
      data: []
    };

    runInAction(() => {
      // Keep only this key in cache to avoid memory bloat
      this._pointTimeSeriesCache.clear();
      this._pointTimeSeriesCache.set(key, state);
    });

    // Build task list: one item per time entry, first COG in each mosaic
    const tasks = entries
      .filter((e) => e.time && e.cogs && e.cogs.length > 0)
      .map((e) => ({
        time: e.time!,
        tag: e.tag,
        cogUrl: e.cogs![0]
      }));

    const band = this.renderOptions?.single?.band ?? 1;
    const nodata = this.renderOptions?.nodata;

    await mapWithConcurrency(
      tasks,
      POINT_TS_CONCURRENCY,
      async (task) => {
        // Abort if a newer load started
        if (this._activePointLoadKey !== key) return undefined;

        try {
          const value = await this._readPixelFromCog(
            task.cogUrl,
            lat,
            lon,
            band,
            nodata
          );
          return value !== undefined
            ? { time: task.time, tag: task.tag, value }
            : undefined;
        } catch {
          return undefined;
        }
      },
      (result) => {
        if (this._activePointLoadKey !== key) return;
        runInAction(() => {
          state.loadedSteps++;
          if (result !== undefined) {
            state.data.push(result);
          }
          // Replace entry to trigger MobX shallow observation
          this._pointTimeSeriesCache.set(key, { ...state });
        });
      }
    );

    if (this._activePointLoadKey !== key) return;

    runInAction(() => {
      state.loading = false;
      this._pointTimeSeriesCache.set(key, { ...state });
    });
  }

  /**
   * Read a single pixel value from a COG at the given WGS84 lat/lon.
   * Uses geotiff.js with HTTP range requests — only transfers the
   * TIFF header + the one tile containing the pixel.
   */
  private async _readPixelFromCog(
    cogUrl: string,
    lat: number,
    lon: number,
    band: number = 1,
    nodata?: number
  ): Promise<number | undefined> {
    const proxiedUrl = proxyCatalogItemUrl(this, cogUrl);

    const [{ fromUrl }, proj4Module] = await Promise.all([
      import("geotiff"),
      import("proj4-fully-loaded")
    ]);
    const proj4 = proj4Module.default;

    const tiff = await fromUrl(proxiedUrl, { allowFullFile: true });
    const image = await tiff.getImage(0);

    // Determine CRS
    const geoKeys = image.getGeoKeys();
    const epsg =
      geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey ?? 4326;

    // Reproject click point from WGS84 to COG CRS
    let geoX = lon;
    let geoY = lat;
    if (epsg !== 4326) {
      try {
        const projector = proj4("EPSG:4326", `EPSG:${epsg}`);
        [geoX, geoY] = projector.forward([lon, lat]);
      } catch {
        return undefined;
      }
    }

    // Geo transform
    const origin = image.getOrigin();
    const resolution = image.getResolution();
    const px = Math.floor((geoX - origin[0]) / resolution[0]);
    const py = Math.floor((geoY - origin[1]) / resolution[1]);

    const width = image.getWidth();
    const height = image.getHeight();
    if (px < 0 || px >= width || py < 0 || py >= height) {
      return undefined;
    }

    const rasters = await image.readRasters({
      window: [px, py, px + 1, py + 1],
      samples: [band - 1]
    });

    const val = (rasters[0] as ArrayLike<number>)[0];
    const nd = nodata ?? image.getGDALNoData() ?? undefined;
    if (nd !== undefined && val === nd) return undefined;
    if (isNaN(val)) return undefined;

    return val;
  }

  // ──────────────────────────────────────────────
  // Provider Management
  // ──────────────────────────────────────────────

  /**
   * Update imagery providers for the current time step.
   */
  @action
  private async _updateProvidersForCurrentTime(): Promise<void> {
    const currentTime = this.currentDiscreteTimeTag;
    if (!currentTime) {
      runInAction(() => {
        this._currentProviders = [];
      });
      return;
    }

    const cogUrls = this._getCogUrlsForTime(currentTime);
    if (!cogUrls || cogUrls.length === 0) {
      runInAction(() => {
        this._currentProviders = [];
      });
      return;
    }

    // Check cache first
    const cached = this._providerCache.find((c) => c.timeKey === currentTime);
    if (cached) {
      cached.lastAccess = Date.now();
      runInAction(() => {
        this._currentProviders = cached.providers;
      });
      this._updateRectangleFromProviders(cached.providers);
      return;
    }

    // Create new providers for all COG URLs in this time step
    try {
      const providers = await Promise.all(
        cogUrls.map((url) => this._createImageryProvider(url))
      );

      const validProviders = providers.filter(
        (p): p is TIFFImageryProvider => p !== undefined
      );

      // Cache them
      this._addToCache(currentTime, validProviders);

      runInAction(() => {
        this._currentProviders = validProviders;
      });

      if (validProviders.length > 0) {
        this._updateRectangleFromProviders(validProviders);
      }
    } catch (e) {
      throw TerriaError.from(e, {
        title: i18next.t("models.cogTimeSeries.loadImageryErrorTitle"),
        message: i18next.t("models.cogTimeSeries.loadImageryErrorMessage")
      });
    }
  }

  /**
   * Get the COG URLs for a given time step.
   */
  private _getCogUrlsForTime(timeTag: string): readonly string[] | undefined {
    const entries = this.timeEntries;
    if (!entries) return undefined;

    const entry = entries.find((e) => e.time === timeTag || e.tag === timeTag);
    return entry?.cogs;
  }

  /**
   * Create a TIFFImageryProvider for a single COG URL.
   * Reuses the same logic as CogCatalogItem.
   */
  private async _createImageryProvider(
    url: string
  ): Promise<TIFFImageryProvider | undefined> {
    const proxiedUrl = proxyCatalogItemUrl(this, url);

    const [{ default: TIFFImageryProvider }, { default: proj4 }] =
      await Promise.all([
        import("terriajs-tiff-imagery-provider"),
        import("proj4-fully-loaded")
      ]);

    const renderOptions = this._buildRenderOptions();

    const imageryProvider = await runInAction(() =>
      TIFFImageryProvider.fromUrl(proxiedUrl, {
        credit: this.credit,
        tileSize: this.tileSize,
        maximumLevel: this.maximumLevel,
        minimumLevel: this.minimumLevel,
        enablePickFeatures: this.allowFeaturePicking,
        hasAlphaChannel: this.hasAlphaChannel,
        projFunc: this.reprojector(proj4),
        renderOptions:
          Object.keys(renderOptions).length > 0 ? renderOptions : undefined
      })
    );

    return imageryProvider;
  }

  /**
   * Build render options from traits (same logic as CogCatalogItem).
   */
  private _buildRenderOptions(): any {
    const singleOptions = this.renderOptions?.single;
    const singleRenderOptions: any = {};

    if (singleOptions?.band !== undefined)
      singleRenderOptions.band = singleOptions.band;
    if (singleOptions?.colorScale !== undefined)
      singleRenderOptions.colorScale = singleOptions.colorScale;
    if (singleOptions?.colors !== undefined)
      singleRenderOptions.colors = singleOptions.colors;
    if (singleOptions?.useRealValue !== undefined)
      singleRenderOptions.useRealValue = singleOptions.useRealValue;
    if (singleOptions?.type !== undefined)
      singleRenderOptions.type = singleOptions.type;
    if (singleOptions?.domain !== undefined)
      singleRenderOptions.domain = singleOptions.domain;
    if (singleOptions?.displayRange !== undefined)
      singleRenderOptions.displayRange = singleOptions.displayRange.slice();
    if (singleOptions?.applyDisplayRange !== undefined)
      singleRenderOptions.applyDisplayRange = singleOptions.applyDisplayRange;
    if (singleOptions?.clampLow !== undefined)
      singleRenderOptions.clampLow = singleOptions.clampLow;
    if (singleOptions?.clampHigh !== undefined)
      singleRenderOptions.clampHigh = singleOptions.clampHigh;
    if (singleOptions?.expression !== undefined)
      singleRenderOptions.expression = singleOptions.expression;
    if (singleOptions?.noDataColor !== undefined)
      singleRenderOptions.noDataColor = singleOptions.noDataColor;

    const renderOptions: any = {};

    if (Object.keys(singleRenderOptions).length > 0) {
      renderOptions.single = singleRenderOptions;
    }

    if (this.renderOptions?.nodata !== undefined)
      renderOptions.nodata = this.renderOptions.nodata;
    if (this.renderOptions?.convertToRGB !== undefined)
      renderOptions.convertToRGB = this.renderOptions.convertToRGB;
    if (this.renderOptions?.resampleMethod !== undefined)
      renderOptions.resampleMethod = this.renderOptions.resampleMethod;

    return renderOptions;
  }

  /**
   * Update the rectangle from the union of all providers' bounds.
   */
  private _updateRectangleFromProviders(
    providers: TIFFImageryProvider[]
  ): void {
    if (providers.length === 0) return;

    let unionRect: Rectangle | undefined;
    for (const provider of providers) {
      const rect = provider.rectangle;
      if (!rect) continue;
      if (!unionRect) {
        unionRect = Rectangle.clone(rect);
      } else {
        Rectangle.union(unionRect, rect, unionRect);
      }
    }

    if (!unionRect) return;

    this._stratum.setRectangle({
      west: CesiumMath.toDegrees(unionRect.west),
      south: CesiumMath.toDegrees(unionRect.south),
      east: CesiumMath.toDegrees(unionRect.east),
      north: CesiumMath.toDegrees(unionRect.north)
    });
  }

  /**
   * Add providers to the LRU cache, evicting old entries if needed.
   */
  private _addToCache(timeKey: string, providers: TIFFImageryProvider[]): void {
    const maxSize = this.providerCacheSize ?? 3;

    // Remove existing entry for this time key
    const existingIdx = this._providerCache.findIndex(
      (c) => c.timeKey === timeKey
    );
    if (existingIdx >= 0) {
      const old = this._providerCache.splice(existingIdx, 1)[0];
      old.providers.forEach((p) => p.destroy());
    }

    // Evict oldest if at capacity
    while (this._providerCache.length >= maxSize) {
      const oldest = this._providerCache.reduce((min, c) =>
        c.lastAccess < min.lastAccess ? c : min
      );
      const idx = this._providerCache.indexOf(oldest);
      if (idx >= 0) {
        this._providerCache.splice(idx, 1);
        oldest.providers.forEach((p) => p.destroy());
      }
    }

    this._providerCache.push({
      timeKey,
      providers,
      lastAccess: Date.now()
    });
  }

  /**
   * Destroy all cached providers and clear the cache.
   */
  private _destroyAllProviders(): void {
    for (const cached of this._providerCache) {
      cached.providers.forEach((p) => p.destroy());
    }
    this._providerCache = [];
    runInAction(() => {
      this._currentProviders = [];
    });
  }
}

/**
 * Function returning a custom reprojector (same as CogCatalogItem).
 */
function reprojector(proj4: any) {
  return (code: number) => {
    if (![4326, 3857, 900913].includes(code)) {
      try {
        const prj = proj4("EPSG:4326", `EPSG:${code}`);
        if (prj)
          return {
            project: prj.forward,
            unproject: prj.inverse
          };
      } catch (e) {
        console.error(e);
      }
    }
  };
}
