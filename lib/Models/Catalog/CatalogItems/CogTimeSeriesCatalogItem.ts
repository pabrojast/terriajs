import dateFormat from "dateformat";
import i18next from "i18next";
import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  override,
  reaction,
  runInAction
} from "mobx";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import Icon from "../../../Styled/Icon";
import {
  SelectableDimension,
  SelectableDimensionEnum,
  SelectableDimensionGroup
} from "../../SelectableDimensions/SelectableDimensions";
import { ViewingControl } from "../../ViewingControls";
import { runWorkflow } from "../../Workflows/SelectableDimensionWorkflow";
import CogStylingWorkflow from "../../Workflows/CogStylingWorkflow";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import getChartColorForId from "../../../Charts/getChartColorForId";
import filterOutUndefined from "../../../Core/filterOutUndefined";
import {
  ChartItem,
  ChartPoint,
  calculateDomain
} from "../../../ModelMixins/ChartableMixin";
import DiscretelyTimeVaryingMixin, {
  DiscreteTimeAsJS
} from "../../../ModelMixins/DiscretelyTimeVaryingMixin";
import MappableMixin, { MapItem } from "../../../ModelMixins/MappableMixin";
import CogTimeSeriesCatalogItemTraits, {
  CogSeriesBandTraits,
  CogSeriesResolutionTraits
} from "../../../Traits/TraitsClasses/CogTimeSeriesCatalogItemTraits";
import { RectangleTraits } from "../../../Traits/TraitsClasses/MappableTraits";
import { FeatureInfoTemplateTraits } from "../../../Traits/TraitsClasses/FeatureInfoTraits";
import CreateModel from "../../Definition/CreateModel";
import CommonStrata from "../../Definition/CommonStrata";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import Model, { BaseModel } from "../../Definition/Model";
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
import {
  CogRenderOptionsTraits,
  SingleRenderOptionsTraits
} from "../../../Traits/TraitsClasses/CogCatalogItemTraits";
import {
  CogPointSeriesProgress,
  CogValueTransform,
  loadCogPointSeries,
  outwardOrder,
  readCogStepPointValue
} from "../../../Core/CogPointReader";
import { getCogBandStats, openCogSource } from "../../../Core/CogSourceCache";
import type { ChartDockContext } from "../../ChartSeriesAccumulator";
import { paletteColor } from "../../../ReactViews/Custom/Chart/ChartJs/chartJsPalette";
import type { AccumulatedSeries } from "../../../ReactViews/Custom/Chart/ChartJs/ChartJsTypes";
import {
  createCogImageryProvider,
  destroyCogImageryProvider,
  getCogProviderNativeDomain,
  getCogProviderUrl,
  hasCogConstructionDomain,
  setCogProviderNativeDomain
} from "./CogProviderFactory";
import { applyCogNoDataColor } from "./CogRasterPostProcessor";
import { createCogColorScaleDimension } from "./CogStyleDimensions";
import {
  buildCogRenderOptions,
  CogEffectiveStyle,
  CogRange,
  finalizeCogProviders,
  getCogRebuildReactionSnapshot,
  getCogStyleReactionSnapshot,
  getValidDomain,
  toRawRange
} from "./CogRenderStyle";
import { CogTimeSeriesLegendStratum } from "./CogLegendStratum";

/**
 * A built time step: the imagery providers of every COG in it, ready to show.
 */
interface CachedStep {
  /**
   * Identity of the step: its COG URLs. Never the display tag — tags such as
   * "Jan 2023" are labels, can repeat, and change between resolutions.
   */
  key: string;
  /** One or more TIFFImageryProviders (one per COG URL in the mosaic) */
  providers: TIFFImageryProvider[];
  /** Resolved domain and palette shared by every COG in the timestep. */
  effectiveStyle: CogEffectiveStyle | undefined;
  /** Monotonic counter of last use, for LRU eviction */
  lastAccess: number;
}

/** A time entry with its parsed time, in the mixin's sorted order. */
interface SortedTimeEntry {
  time: JulianDate;
  cogs: readonly string[];
}

/** What an item-owned pick stores on the picked feature's `data`. */
interface CogPickData {
  cogTimeSeriesPick: true;
  /** Degrees. */
  longitude: number;
  latitude: number;
  /** Physical value at the displayed date; null when the pixel holds no data. */
  value: number | null;
  unit?: string;
  /** ISO 8601 time of the displayed step. */
  date?: string;
  dateLabel?: string;
  band: number;
  /** Name of the statistic (band) read, when the item offers several. */
  statistic?: string;
}

/** Time series being read (or read) at a clicked point. */
export interface CogPointSeriesState {
  /** Rounded "lat,lon". */
  key: string;
  /** P1, P2… */
  label: string;
  lat: number;
  lon: number;
  color: string;
  status: "loading" | "done" | "error" | "cancelled";
  loaded: number;
  total: number;
  /** Time steps that could not be read (network, CORS…). */
  errors: number;
  noData: number;
  outside: number;
  /** Ascending by `x` (epoch milliseconds); `y` in physical units. */
  points: { x: number; y: number }[];
  /** True when the label is a place name rather than an automatic P-number. */
  named?: boolean;
  /**
   * Set when only the dates nearest to the displayed one were read
   * (`pointSeriesMaxSteps`): the span read and how many dates exist in all.
   */
  window?: { firstX: number; lastX: number; available: number };
}

/** Same cap as the CSV accumulator: more lines than this stop being readable. */
const MAX_POINT_SERIES = 12;
/** Progress of a point series reaches the UI at most this often. */
const POINT_SERIES_FLUSH_MS = 250;
/**
 * A point with no value on this many dates around the displayed one is not a
 * data point (land, or outside the mask): stop reading and drop the series.
 */
const POINT_SERIES_GIVE_UP_AFTER = 12;
/** …or this share of the dates to read, whichever is more (cloudy seasons). */
const POINT_SERIES_GIVE_UP_SHARE = 0.1;
/** Header prefetch: wait for the map to settle, stay off most connections. */
const PREFETCH_DELAY_MS = 2500;
const PREFETCH_CONCURRENCY = 2;
const PREFETCH_MAX_STEPS = 200;
/** Half-size of the view when a place has no `bbox` (~3 km at the equator). */
const PLACE_ZOOM_MARGIN_DEGREES = 0.03;
/** Picks of the same click by the other COGs of a mosaic arrive within this. */
const PICK_DEDUPE_MS = 300;

function getCogPickData(feature: TerriaFeature): CogPickData | undefined {
  const data = feature.data as Partial<CogPickData> | undefined;
  return data?.cogTimeSeriesPick === true &&
    typeof data.latitude === "number" &&
    typeof data.longitude === "number"
    ? (data as CogPickData)
    : undefined;
}

/** Up to four significant decimals, without trailing zeros. */
function formatCogValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  return String(Number(value.toFixed(decimals)));
}

/**
 * Value of a trait that some stratum actually sets, ignoring the trait's
 * default — a model read cannot tell "unset" from "set to the default".
 */
function getExplicitTraitValue<T = unknown>(
  model: BaseModel | undefined,
  trait: string
): T | undefined {
  if (!model) return undefined;
  for (const stratum of model.strataTopToBottom.values()) {
    const value = (stratum as any)?.[trait];
    if (value !== undefined) return value as T;
  }
  return undefined;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Steps whose providers are kept built. */
const DEFAULT_PROVIDER_CACHE_SIZE = 6;
/** Rendered tiles kept per provider (the library default of 100 is ~100 MB at 512px). */
const DEFAULT_TILE_CACHE_SIZE = 64;
/** Wait this long before building an uncached step, so scrubbing skips intermediate dates. */
const STEP_BUILD_DEBOUNCE_MS = 150;
/** Let the displayed step start loading its tiles before neighbours compete for the network. */
const PRELOAD_DELAY_MS = 500;

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

interface TemporaryAreaChartState {
  name: string;
  unit?: string;
  values: Array<{ time: string; value: number }>;
}

/**
 * Loadable stratum for CogTimeSeriesCatalogItem.
 * Loads time entries from a remote JSON URL and area calculation values.
 */
class CogTimeSeriesStratum extends LoadableStratum(
  CogTimeSeriesCatalogItemTraits
) {
  static stratumName = "cog-time-series-stratum";

  /** Time steps loaded from a JSON definition, keyed by that JSON's URL. */
  @observable.shallow
  private _loadedTimeEntries = new Map<
    string,
    StratumFromTraits<CogTimeEntryTraits>[]
  >();
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
    const resolution = this.model.activeResolution;
    if (resolution?.hint) return resolution.hint;
    if (resolution?.partialCoverage) {
      return i18next.t("models.cogTimeSeries.partialCoverageHint");
    }
    return undefined;
  }

  /**
   * Default feature info template that renders a time series chart
   * when the user clicks on the map, with the current time step value.
   */
  @computed
  get featureInfoTemplate(): StratumFromTraits<FeatureInfoTemplateTraits> {
    return createStratumInstance(FeatureInfoTemplateTraits, {
      template:
        '<div style="min-height:64px">' +
        // Headline: value at the displayed date
        '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
        "{{#terria.timeSeries.currentValue}}" +
        '<span style="font-size:22px;font-weight:700">{{terria.timeSeries.currentValue}}</span>' +
        "{{#terria.timeSeries.unit}}" +
        '<span style="font-size:13px">{{terria.timeSeries.unit}}</span>' +
        "{{/terria.timeSeries.unit}}" +
        "{{/terria.timeSeries.currentValue}}" +
        "{{#terria.timeSeries.noValue}}" +
        '<span style="font-size:16px;font-weight:600;opacity:0.75">' +
        i18next.t("models.cogTimeSeries.noDataAtPoint") +
        "</span>" +
        "{{/terria.timeSeries.noValue}}" +
        "{{#terria.timeSeries.currentDate}}" +
        '<span style="font-size:12px;opacity:0.7">{{terria.timeSeries.currentDate}}</span>' +
        "{{/terria.timeSeries.currentDate}}" +
        "</div>" +
        '<div style="font-size:12px;opacity:0.7;margin-bottom:6px">' +
        "{{#terria.timeSeries.pointLabel}}<strong>{{terria.timeSeries.pointLabel}}</strong> · {{/terria.timeSeries.pointLabel}}" +
        "{{#terria.timeSeries.statistic}}{{terria.timeSeries.statistic}} · {{/terria.timeSeries.statistic}}" +
        "{{terria.timeSeries.coordinates}}" +
        "</div>" +
        "{{#terria.timeSeries.windowNote}}" +
        '<p style="font-size:12px;opacity:0.7"><em>{{terria.timeSeries.windowNote}}</em></p>' +
        "{{/terria.timeSeries.windowNote}}" +
        // Series progress / problems
        "{{#terria.timeSeries.progress}}" +
        "<p><em>{{terria.timeSeries.progress}}</em></p>" +
        "{{/terria.timeSeries.progress}}" +
        "{{#terria.timeSeries.warning}}" +
        "<p><em>{{terria.timeSeries.warning}}</em></p>" +
        "{{/terria.timeSeries.warning}}" +
        // Chart, once the series is complete
        "{{#terria.timeSeries.chart}}" +
        "{{{terria.timeSeries.chart}}}" +
        "{{/terria.timeSeries.chart}}" +
        "</div>"
    });
  }

  /** URL of the JSON that lists the time steps currently in use. */
  @computed
  get timeEntriesUrl(): string | undefined {
    const resolution = this.model.activeResolution;
    return resolution ? resolution.url : this.model.url;
  }

  /**
   * Time steps of the active resolution (or of the item when it has no
   * resolutions): inline ones first, otherwise the ones loaded from its URL.
   */
  @computed
  get timeEntries(): StratumFromTraits<CogTimeEntryTraits>[] | undefined {
    const inline = this.model.activeResolution?.timeEntries;
    if (inline && inline.length > 0) {
      return inline.map((entry) =>
        createStratumInstance(CogTimeEntryTraits, {
          time: entry.time,
          cogs: entry.cogs ? [...entry.cogs] : undefined,
          tag: entry.tag
        })
      );
    }
    const url = this.timeEntriesUrl;
    return url ? this._loadedTimeEntries.get(url) : undefined;
  }

  // What the active resolution sets applies while it is active. These sit in
  // a load stratum, so anything configured on the item itself (definition) or
  // edited by the user still wins.

  @computed
  get dateFormat(): string | undefined {
    return this.model.activeResolution?.dateFormat;
  }

  @computed
  get fromContinuous(): string | undefined {
    return this.model.activeResolution?.fromContinuous;
  }

  @computed
  get valueScale(): number | undefined {
    return this.model.activeResolution?.valueScale;
  }

  @computed
  get valueOffset(): number | undefined {
    return this.model.activeResolution?.valueOffset;
  }

  @computed
  get unit(): string | undefined {
    return this.model.activeResolution?.unit;
  }

  @computed
  get pointSeriesMaxSteps(): number | undefined {
    return this.model.activeResolution?.pointSeriesMaxSteps;
  }

  @computed
  get noDataValues(): number[] | undefined {
    const values = this.model.activeResolution?.noDataValues;
    return values && values.length > 0 ? [...values] : undefined;
  }

  /**
   * Render options of the active resolution (typically its `single.domain`).
   *
   * Time series are almost always continuous fields (indices, concentrations),
   * where nearest-neighbour upsampling looks blocky, so resampling defaults to
   * bilinear. Catalogs with categorical rasters should set
   * `renderOptions.resampleMethod: "nearest"`.
   */
  @computed
  get renderOptions(): StratumFromTraits<CogRenderOptionsTraits> {
    const options = this.model.activeResolution?.renderOptions;
    const activeBand = this.model.activeBand;
    const bandOptions = activeBand?.renderOptions;

    // The active band's style goes over the resolution's, key by key, and the
    // band number is the band's own.
    const singleValues: Record<string, unknown> = {};
    for (const single of [options?.single, bandOptions?.single]) {
      if (!single) continue;
      for (const trait of Object.keys(SingleRenderOptionsTraits.traits)) {
        const value = (single as any)[trait];
        if (value === undefined) continue;
        singleValues[trait] = Array.isArray(value)
          ? value.map((entry) => (Array.isArray(entry) ? [...entry] : entry))
          : value;
      }
    }
    if (activeBand?.band !== undefined) singleValues.band = activeBand.band;

    return createStratumInstance(CogRenderOptionsTraits, {
      // `resampleMethod` has a trait default, so only an explicit value counts.
      resampleMethod:
        getExplicitTraitValue(bandOptions, "resampleMethod") ??
        getExplicitTraitValue(options, "resampleMethod") ??
        "bilinear",
      nodata: bandOptions?.nodata ?? options?.nodata,
      convertToRGB: bandOptions?.convertToRGB ?? options?.convertToRGB,
      color: bandOptions?.color ?? options?.color,
      single:
        Object.keys(singleValues).length > 0
          ? createStratumInstance(SingleRenderOptionsTraits, singleValues)
          : undefined
    });
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
    const sourceUrl = this.timeEntriesUrl;
    // Each resolution's list is loaded once and kept, so switching back is instant.
    if (!sourceUrl || this._loadedTimeEntries.has(sourceUrl)) {
      return;
    }

    const url = proxyCatalogItemUrl(this.model, sourceUrl);
    try {
      const json = await loadJson<TimeSeriesJsonDefinition>(url);
      if (json && Array.isArray(json.times)) {
        runInAction(() => {
          this._loadedTimeEntries.set(
            sourceUrl,
            json.times.map((entry) =>
              createStratumInstance(CogTimeEntryTraits, {
                time: entry.time,
                cogs: entry.cogs as any,
                tag: entry.tag
              })
            )
          );
        });
      }
    } catch (e) {
      throw TerriaError.from(e, {
        title: i18next.t("models.cogTimeSeries.loadTimeEntriesErrorTitle"),
        message: i18next.t("models.cogTimeSeries.loadTimeEntriesErrorMessage", {
          url: sourceUrl
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
StratumOrder.addLoadStratum(CogTimeSeriesLegendStratum.stratumName);

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

  /** Built time steps, keyed by their COG URLs. */
  private _stepCache = new Map<string, CachedStep>();

  /** Steps being built, so concurrent requests for a step share one build. */
  private _inflightSteps = new Map<string, Promise<CachedStep | undefined>>();

  /** The displayed time step. */
  @observable.ref
  private _currentStep: CachedStep | undefined;

  /** Neighbouring steps published invisibly so their tiles are already loaded. */
  @observable.ref
  private _preloadedSteps: readonly CachedStep[] = [];

  /** True while the step for a newly selected date is being built. */
  @observable
  private _isSteppingTime = false;

  @observable.ref
  private _effectiveCogStyle: CogEffectiveStyle | undefined;

  /**
   * Clip rectangle per provider. A new rectangle identity makes Cesium drop the
   * layer's tiles (needed after a restyle); a stable one lets a preloaded step
   * keep its layer and loaded tiles when it becomes the displayed step.
   */
  private _clipRectangles = new WeakMap<TIFFImageryProvider, Rectangle>();

  /** Bumped when `_clipRectangles` changes, since a WeakMap is not observable. */
  @observable
  private _clipRectangleVersion = 0;

  /** Only the latest step request may publish; older ones still get cached. */
  private _stepToken = 0;
  private _stepDebounce: ReturnType<typeof setTimeout> | undefined;
  private _preloadTimer: ReturnType<typeof setTimeout> | undefined;
  private _lastStepIndex: number | undefined;
  private _stepDirection: 1 | -1 = 1;
  private _accessCounter = 0;
  /** Bumped by `_destroyAllProviders` so builds in flight discard their result. */
  private _providerGeneration = 0;
  private _reportedStepErrors = new Set<string>();
  /** Identifies the set of time steps whose headers were (or are being) prefetched. */
  private _prefetchKey: string | undefined;
  /** False until the first load, and again after the providers are torn down. */
  private _hasLoadedSteps = false;

  @computed
  get effectiveCogStyle(): CogEffectiveStyle | undefined {
    return this._effectiveCogStyle;
  }

  private get _currentProviders(): TIFFImageryProvider[] {
    return this._currentStep?.providers ?? [];
  }

  /** True while imagery for a newly selected date is loading. */
  @computed
  get isSteppingTime(): boolean {
    return this._isSteppingTime;
  }

  @override
  get isLoading(): boolean {
    return super.isLoading || this._isSteppingTime;
  }

  /** The stratum handling data loading */
  private _stratum: CogTimeSeriesStratum;

  /** Time series of the clicked points (P1, P2…). Entries are replaced, never mutated. */
  @observable.shallow
  private _pointSeries: CogPointSeriesState[] = [];

  /** One controller per point series being read, so each can really be cancelled. */
  private _pointSeriesAborts = new Map<string, AbortController>();
  private _pointLabelCounter = 0;
  /** Separate from the P-counter: named places take a colour but no number. */
  private _nextPointColorIndex = 0;

  /** Last answered click, to answer once when several COGs of a mosaic are asked. */
  private _lastPick: { key: string; step: CachedStep; at: number } | undefined;

  /** Ephemeral zonal-statistics chart data produced by the calculation tool. */
  @observable.ref
  private _temporaryAreaChart: TemporaryAreaChartState | undefined = undefined;

  /** Whether the temporary zonal-statistics chart is shown in the bottom chart panel. */
  @observable
  private _showTemporaryAreaChartInChartPanel = false;

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
    this.strata.set(
      CogTimeSeriesLegendStratum.stratumName,
      new CogTimeSeriesLegendStratum(this)
    );

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

    // Restyle every built step in place. Rebuilding every COG is only needed
    // when there is nothing loaded yet (or after a full destroy).
    reaction(
      () => ({
        ...getCogStyleReactionSnapshot(this.renderOptions),
        valueScale: this.valueScale,
        valueOffset: this.valueOffset
      }),
      () => {
        if (this._applyLiveCogStyle()) return;
        if (this._currentProviders.length > 0 && !this.isLoadingMapItems) {
          this._destroyAllProviders();
          this.loadMapItems(true);
        }
      }
    );

    // Options the provider only reads while being built (band, no-data,
    // resampling): every built step is stale, so rebuild.
    reaction(
      () => getCogRebuildReactionSnapshot(this.renderOptions),
      () => {
        if (this._stepCache.size === 0 || this.isLoadingMapItems) return;
        this._destroyAllProviders();
        this.loadMapItems(true);
      }
    );

    // A different resolution means different time steps (usually not loaded
    // yet) and different values at the clicked points.
    reaction(
      () => this.activeResolution?.id,
      () => {
        if (!this._hasLoadedSteps) return;
        this._reportedStepErrors.clear();
        this.loadMapItems(true).then((result) =>
          result.raiseError(this.terria)
        );
        this._reloadPointSeries();
      }
    );

    // Another statistic is another band: the providers rebuild on their own
    // (band is a build-time option); the clicked points must be read again.
    reaction(
      () => this.renderOptions?.single?.band,
      () => {
        if (this._pointSeries.length > 0) this._reloadPointSeries();
      }
    );

    // React to time changes. Keyed on the step's COG URLs rather than its tag,
    // so it also fires when the entries themselves change.
    reaction(
      () => this._currentStepKey,
      () => {
        // Nothing to update until the item has been loaded onto a map.
        if (this._hasLoadedSteps && !this.isLoadingMapItems) {
          this._scheduleStepUpdate();
        }
      }
    );
  }

  // ──────────────────────────────────────────────
  // Temporal resolutions
  // ──────────────────────────────────────────────

  /**
   * The resolution whose time steps and settings are in use, or `undefined`
   * for an item without resolutions. Falls back to the first one when
   * `activeResolutionId` is unset or unknown.
   */
  @computed
  get activeResolution(): Model<CogSeriesResolutionTraits> | undefined {
    const resolutions = this.resolutions;
    if (!resolutions || resolutions.length === 0) return undefined;
    return (
      resolutions.find(
        (resolution) => resolution.id === this.activeResolutionId
      ) ?? resolutions[0]
    );
  }

  /**
   * Switch resolution. The date is left alone — the discrete-time mixin snaps
   * it to the new steps (July 2024 becomes 2024 with `fromContinuous:
   * "previous"`) — and built steps stay cached because they are keyed by COG
   * URL. A colour range the user set belongs to the resolution they set it
   * on, so it is cleared.
   */
  @action
  setActiveResolution(stratumId: string, id: string | undefined): void {
    if (id === this.activeResolution?.id) return;
    this.setTrait(stratumId, "activeResolutionId", id);
    this.renderOptions?.single?.setTrait(stratumId, "domain", undefined);
  }

  // ──────────────────────────────────────────────
  // Statistics (bands of a multi-band COG)
  // ──────────────────────────────────────────────

  /** Bands offered for the active resolution (or for an item without resolutions). */
  @computed
  get availableBands(): readonly Model<CogSeriesBandTraits>[] {
    const resolution = this.activeResolution;
    const bands = resolution ? resolution.bands : this.bands;
    return (bands ?? []).filter((band) => band.band !== undefined);
  }

  /**
   * The statistic being shown: the band with `activeBandId` in the active
   * resolution, else its first band. Matching by id (not by band number) is
   * what keeps "median" selected across resolutions that store it in
   * different bands.
   */
  @computed
  get activeBand(): Model<CogSeriesBandTraits> | undefined {
    const bands = this.availableBands;
    if (bands.length === 0) return undefined;
    return bands.find((band) => band.id === this.activeBandId) ?? bands[0];
  }

  /**
   * Unit of the values on screen. A band's own unit (a count band is not in
   * mg m-3) wins even over a unit configured on the item, which the usual
   * strata order would not allow.
   */
  @computed
  get displayUnit(): string | undefined {
    return this.activeBand?.unit ?? this.unit;
  }

  /**
   * The choice is always recorded, even when it is the band already shown by
   * default, so it survives a switch to a resolution with another default. A
   * colour range set by hand belongs to the statistic it was set on.
   */
  @action
  setActiveBand(stratumId: string, id: string | undefined): void {
    const changes = id !== this.activeBand?.id;
    this.setTrait(stratumId, "activeBandId", id);
    if (changes) {
      this.renderOptions?.single?.setTrait(stratumId, "domain", undefined);
    }
  }

  /** Time entries with a parseable time, in the same order as `discreteTimesAsSortedJulianDates`. */
  @computed
  private get _sortedEntries(): SortedTimeEntry[] {
    const sorted: SortedTimeEntry[] = [];
    for (const entry of this.timeEntries ?? []) {
      if (entry.time === undefined) continue;
      try {
        sorted.push({
          time: JulianDate.fromIso8601(entry.time),
          cogs: entry.cogs ?? []
        });
      } catch {
        // The mixin skips unparseable times too; stay index-aligned with it.
      }
    }
    sorted.sort((a, b) => JulianDate.compare(a.time, b.time));
    return sorted;
  }

  private _stepKeyAt(index: number | undefined): string | undefined {
    if (index === undefined) return undefined;
    const cogs = this._sortedEntries[index]?.cogs;
    return cogs && cogs.length > 0 ? cogs.join("|") : undefined;
  }

  @computed
  private get _currentStepKey(): string | undefined {
    return this._stepKeyAt(this.currentDiscreteTimeIndex);
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
    if (!this.timeEntries || this.timeEntries.length === 0) {
      await this._stratum.loadTimeEntries();
    }

    // Load precalculated area values
    await this._stratum.loadAreaCalculationValues();

    // Create imagery providers for the current time step
    this._hasLoadedSteps = true;
    await this._updateProvidersForCurrentTime();

    // The date may have changed while loading (the time reaction stands down
    // during a load), so make sure the displayed step is the current one.
    if (this._currentStepKey !== this._currentStep?.key) {
      this._scheduleStepUpdate();
    }
  }

  /**
   * Returns map items (imagery layers) for the current time step.
   * Each COG in the time step becomes a separate ImageryParts entry (mosaic support).
   * Each provider uses its own rectangle as clipping rectangle to avoid
   * Cesium rendering crashes when mosaic tiles cover different geographic areas.
   */
  @computed
  get mapItems(): MapItem[] {
    const current = this._currentStep;
    if (!current || current.providers.length === 0) {
      return [];
    }
    // The clip rectangles live in a WeakMap; this makes their changes observable.
    void this._clipRectangleVersion;

    const toParts = (provider: TIFFImageryProvider, alpha: number) => ({
      show: this.show,
      alpha,
      imageryProvider: provider as any,
      clippingRectangle:
        this._clipRectangles.get(provider) ?? provider.rectangle
    });

    const items: MapItem[] = current.providers
      .filter((provider) => provider.rectangle !== undefined)
      .map((provider) => toParts(provider, this.opacity));

    // Neighbouring steps, fully transparent: Cesium loads their tiles now, and
    // because the (provider, rectangle) pair keeps its identity the same layer
    // is reused — tiles included — when that step becomes the displayed one.
    for (const step of this._preloadedSteps) {
      if (step === current) continue;
      for (const provider of step.providers) {
        if (provider.rectangle !== undefined) items.push(toParts(provider, 0));
      }
    }
    return items;
  }

  /**
   * Restyle every built step in place. Steps other than the displayed one stay
   * cached, so a palette or range edit does not throw away the dates the user
   * already loaded.
   */
  @action
  private _applyLiveCogStyle(): boolean {
    const current = this._currentStep;
    if (!current || !current.providers.some((provider) => provider.plot)) {
      return false;
    }

    for (const step of this._stepCache.values()) {
      this._finalizeStep(step);
      // Painted tiles are stale: a new clip rectangle makes Cesium drop them.
      for (const provider of step.providers) {
        if (provider.rectangle) {
          this._clipRectangles.set(
            provider,
            Rectangle.clone(provider.rectangle)
          );
        }
      }
    }
    this._clipRectangleVersion++;
    this._effectiveCogStyle = current.effectiveStyle;
    return true;
  }

  /** Apply the shared domain, palette and no-data colour to a built step. */
  private _finalizeStep(step: CachedStep): void {
    step.effectiveStyle = finalizeCogProviders(
      step.providers,
      this.renderOptions?.single,
      { valueTransform: this.valueTransform }
    );
    for (const provider of step.providers) {
      applyCogNoDataColor(
        provider,
        this.renderOptions?.single?.band,
        this.renderOptions?.single?.noDataColor
      );
    }
  }

  /**
   * Expose the same "Edit Style" workflow used by single COGs. Style changes
   * are written to `renderOptions`, which a reaction in the constructor
   * watches and restyles the current providers in place.
   */
  @override
  get viewingControls(): ViewingControl[] {
    return [
      ...super.viewingControls,
      {
        id: CogStylingWorkflow.type,
        name: i18next.t("models.cog.editStyle"),
        onClick: action((viewState) =>
          runWorkflow(viewState, new CogStylingWorkflow(this))
        ),
        icon: { glyph: Icon.GLYPHS.layers }
      }
    ];
  }

  /**
   * The controls people reach for while reviewing a series, on the workbench
   * card itself: which resolution, which palette, and the colour range. The
   * full "Edit style" workflow stays available from the item menu.
   */
  @override
  get selectableDimensions(): SelectableDimension[] {
    return filterOutUndefined([
      ...super.selectableDimensions,
      this._resolutionDimension,
      this._bandDimension,
      this._placeDimension,
      this._isSingleBandStyle
        ? createCogColorScaleDimension(this, { id: "cog-series-palette" })
        : undefined,
      this._colorRangeDimension
    ]);
  }

  private get _isSingleBandStyle(): boolean {
    return this.effectiveCogStyle?.isSingleBand !== false;
  }

  @computed
  private get _resolutionDimension(): SelectableDimensionEnum | undefined {
    const resolutions = this.resolutions;
    if (!resolutions || resolutions.length < 2) return undefined;
    return {
      type: "select",
      display: "pills",
      placement: "top",
      id: "cog-series-resolution",
      name: i18next.t("models.cogTimeSeries.resolution"),
      selectedId: this.activeResolution?.id,
      options: resolutions
        .filter((resolution) => resolution.id !== undefined)
        .map((resolution) => ({
          id: resolution.id!,
          name: resolution.name ?? resolution.id!
        })),
      setDimensionValue: (stratumId, id) =>
        this.setActiveResolution(stratumId, id)
    };
  }

  /** Which statistic (band) of a multi-band COG to show. */
  @computed
  private get _bandDimension(): SelectableDimensionEnum | undefined {
    const bands = this.availableBands;
    if (bands.length < 2) return undefined;
    return {
      type: "select",
      id: "cog-series-band",
      name: i18next.t("models.cogTimeSeries.statistic"),
      selectedId: this.activeBand?.id,
      options: bands
        .filter((band) => band.id !== undefined)
        .map((band) => ({ id: band.id!, name: band.name ?? band.id! })),
      setDimensionValue: (stratumId, id) => this.setActiveBand(stratumId, id)
    };
  }

  /**
   * Jump to a named place and chart it. An action rather than a setting: the
   * selector always reads "Go to a place…" and nothing is persisted but the
   * resulting series.
   */
  @computed
  private get _placeDimension(): SelectableDimensionEnum | undefined {
    const places = (this.places ?? []).filter(
      (place) =>
        place.id !== undefined &&
        place.latitude !== undefined &&
        place.longitude !== undefined
    );
    if (places.length === 0) return undefined;
    return {
      type: "select",
      id: "cog-series-place",
      name: i18next.t("models.cogTimeSeries.places"),
      selectedId: undefined,
      allowUndefined: true,
      undefinedLabel: i18next.t("models.cogTimeSeries.goToPlace"),
      options: places.map((place) => ({
        id: place.id!,
        name: place.detail
          ? `${place.name ?? place.id} — ${place.detail}`
          : place.name ?? place.id!
      })),
      setDimensionValue: (_stratumId, id) => {
        if (id !== undefined) this.goToPlace(id);
      }
    };
  }

  /**
   * Move the map to a place and start its time series, labelled with the
   * place's name. Small features (a lake in a country-sized layer) are hard to
   * find and to hit by hand.
   */
  @action
  goToPlace(placeId: string): void {
    const place = this.places?.find((candidate) => candidate.id === placeId);
    if (
      !place ||
      place.latitude === undefined ||
      place.longitude === undefined
    ) {
      return;
    }
    const bbox = place.bbox;
    const rectangle =
      bbox && bbox.length === 4 && bbox.every((value) => Number.isFinite(value))
        ? Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3])
        : Rectangle.fromDegrees(
            place.longitude - PLACE_ZOOM_MARGIN_DEGREES,
            place.latitude - PLACE_ZOOM_MARGIN_DEGREES,
            place.longitude + PLACE_ZOOM_MARGIN_DEGREES,
            place.latitude + PLACE_ZOOM_MARGIN_DEGREES
          );
    this.terria.currentViewer
      .zoomTo(rectangle, 1.5)
      .catch((e) => console.warn("COG time series: could not zoom", e));
    this.addPointSeries(
      place.latitude,
      place.longitude,
      place.name ?? place.id
    );
  }

  /** Minimum / maximum of the colour scale, fit to the displayed date, reset. */
  @computed
  private get _colorRangeDimension(): SelectableDimensionGroup | undefined {
    if (!this._isSingleBandStyle) return undefined;
    const domain = this.effectiveCogStyle?.domain;
    const unit = this.displayUnit;

    const setBound = (index: 0 | 1) =>
      action((stratumId: string, value: number | undefined) => {
        if (value === undefined || !Number.isFinite(value)) return;
        const current = this.effectiveCogStyle?.domain;
        const next: [number, number] = [
          current?.[0] ?? Math.min(0, value),
          current?.[1] ?? Math.max(1, value)
        ];
        next[index] = value;
        if (next[0] >= next[1]) return;
        if (!this.renderOptions.single) {
          this.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.renderOptions.single!.setTrait(stratumId, "domain", next);
      });

    const dimensions: SelectableDimensionGroup["selectableDimensions"] = [
      {
        type: "numeric",
        id: "cog-series-range-min",
        name: i18next.t("models.cogStyling.minimumValue"),
        value: domain?.[0],
        setDimensionValue: setBound(0)
      },
      {
        type: "numeric",
        id: "cog-series-range-max",
        name: i18next.t("models.cogStyling.maximumValue"),
        value: domain?.[1],
        setDimensionValue: setBound(1)
      },
      {
        type: "button",
        id: "cog-series-range-fit",
        value: i18next.t("models.cogTimeSeries.fitRangeToDate"),
        setDimensionValue: (stratumId) => {
          this.fitDomainToCurrentStep(stratumId).catch((e) =>
            this.terria.raiseErrorToUser(e)
          );
        }
      },
      {
        type: "button",
        id: "cog-series-range-reset",
        value: i18next.t("models.cogTimeSeries.resetRange"),
        // Only a range the user changed can be reset.
        disable:
          this.renderOptions?.single?.getTrait(CommonStrata.user, "domain") ===
          undefined,
        setDimensionValue: action((stratumId: string) => {
          this.renderOptions?.single?.setTrait(stratumId, "domain", undefined);
        })
      }
    ];

    return {
      type: "group",
      id: "cog-series-range",
      name: unit
        ? `${i18next.t("models.cogTimeSeries.colorRange")} (${unit})`
        : i18next.t("models.cogTimeSeries.colorRange"),
      isOpen: false,
      selectableDimensions: dimensions
    };
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

  @computed
  get temporaryAreaChartItem(): ChartItem | undefined {
    if (!this._temporaryAreaChart) return undefined;

    const currentJulian = this.currentDiscreteJulianDate;
    const points: ChartPoint[] = [];

    for (const entry of this._temporaryAreaChart.values) {
      try {
        const jd = JulianDate.fromIso8601(entry.time);
        points.push({
          x: JulianDate.toDate(jd),
          y: entry.value,
          isSelected: currentJulian
            ? JulianDate.equals(jd, currentJulian)
            : false
        });
      } catch {
        // Skip invalid dates
      }
    }

    if (points.length === 0) return undefined;

    const chartId = `${this.uniqueId}-temporary-area-chart`;
    const colorId = `color-${chartId}`;

    return {
      item: this,
      id: chartId,
      name: this._temporaryAreaChart.name,
      categoryName: this.name,
      key: `key-${chartId}`,
      type: "line",
      units: this._temporaryAreaChart.unit,
      xAxis: { name: "Time", scale: "time" },
      points,
      domain: calculateDomain(points),
      showInChartPanel: this.show && this._showTemporaryAreaChartInChartPanel,
      isSelectedInWorkbench: this._showTemporaryAreaChartInChartPanel,
      updateIsSelectedInWorkbench: (isSelected: boolean) => {
        runInAction(() => {
          this._showTemporaryAreaChartInChartPanel =
            isSelected && this._temporaryAreaChart !== undefined;
        });
      },
      getColor: () => getChartColorForId(colorId),
      onClick: (point: any) => {
        runInAction(() => {
          this.setTrait(
            CommonStrata.user,
            "currentTime",
            point.x.toISOString()
          );
        });
      }
    };
  }

  @computed
  get isTemporaryAreaChartExpandedInChartPanel(): boolean {
    return this._showTemporaryAreaChartInChartPanel;
  }

  @action
  setTemporaryAreaChart(options: {
    name: string;
    unit?: string;
    values: Array<{ time: string; value: number }>;
  }): void {
    this._temporaryAreaChart = {
      name: options.name,
      unit: options.unit,
      values: options.values.filter(
        (value) =>
          value.time !== undefined &&
          value.time !== null &&
          isFinite(value.value)
      )
    };
  }

  @action
  setTemporaryAreaChartExpandedInChartPanel(expanded: boolean): void {
    this._showTemporaryAreaChartInChartPanel =
      expanded && this._temporaryAreaChart !== undefined;
  }

  @action
  clearTemporaryAreaChart(): void {
    this._temporaryAreaChart = undefined;
    this._showTemporaryAreaChartInChartPanel = false;
  }

  // ──────────────────────────────────────────────
  // Chart Panel Integration
  // ──────────────────────────────────────────────

  /**
   * Override chartItems to include area calculation time series as line charts
   * in the bottom chart panel, in addition to the default momentChart.
   */
  @override
  get chartItems(): ChartItem[] {
    const baseItems = filterOutUndefined([
      this.momentChart,
      this.temporaryAreaChartItem
    ]);

    if (!this.showInChartPanel || !this.areaCalculations) {
      return baseItems;
    }

    const currentJulian = this.currentDiscreteJulianDate;

    for (const calc of this.areaCalculations) {
      if (!calc.name) continue;

      const tsData = this.getAreaCalculationTimeSeries(calc.name);
      if (!tsData || tsData.length === 0) continue;

      const points: ChartPoint[] = [];
      for (const d of tsData) {
        try {
          const jd = JulianDate.fromIso8601(d.time);
          points.push({
            x: JulianDate.toDate(jd),
            y: d.value,
            isSelected: currentJulian
              ? JulianDate.equals(jd, currentJulian)
              : false
          });
        } catch {
          // Skip invalid dates
        }
      }

      if (points.length === 0) continue;

      const colorId = `color-${this.uniqueId}-area-${calc.name}`;
      const chartId = `${this.uniqueId}-area-${calc.name}`;

      baseItems.push({
        item: this,
        id: chartId,
        name: `${this.name || "COG"} – ${calc.name}`,
        categoryName: this.name,
        key: `key-${chartId}`,
        type: "line",
        units: calc.unit,
        xAxis: { name: "Time", scale: "time" },
        points,
        domain: calculateDomain(points),
        showInChartPanel: this.show && this.showInChartPanel,
        isSelectedInWorkbench: this.showInChartPanel,
        updateIsSelectedInWorkbench: (isSelected: boolean) => {
          runInAction(() => {
            this.setTrait(CommonStrata.user, "showInChartPanel", isSelected);
          });
        },
        getColor: () => getChartColorForId(colorId),
        onClick: (point: any) => {
          runInAction(() => {
            this.setTrait(
              CommonStrata.user,
              "currentTime",
              point.x.toISOString()
            );
          });
        }
      });
    }

    return baseItems;
  }

  // ──────────────────────────────────────────────
  // Value at a point — item-owned pick
  // ──────────────────────────────────────────────

  /** Conversion from stored pixel values to physical values. */
  @computed
  get valueTransform(): CogValueTransform {
    const scale = this.valueScale;
    const offset = this.valueOffset;
    return {
      scale:
        scale !== undefined && Number.isFinite(scale) && scale !== 0
          ? scale
          : 1,
      offset: offset !== undefined && Number.isFinite(offset) ? offset : 0
    };
  }

  /** Label of a time step: `dateFormat` when configured, else its tag, else the date. */
  private _formatStepLabel(time: JulianDate, tag: string | undefined): string {
    const date = JulianDate.toDate(time);
    if (this.dateFormat) {
      try {
        return dateFormat(date, this.dateFormat);
      } catch {
        // Fall through to the defaults on a malformed format string.
      }
    }
    const iso = JulianDate.toIso8601(time);
    if (tag && tag !== iso && !/^\d{4}-\d{2}-\d{2}T/.test(tag)) return tag;
    return iso.slice(0, 10);
  }

  /** Label of the displayed time step. */
  @computed
  get currentStepLabel(): string | undefined {
    const index = this.currentDiscreteTimeIndex;
    const step =
      index !== undefined
        ? this.discreteTimesAsSortedJulianDates?.[index]
        : undefined;
    return step ? this._formatStepLabel(step.time, step.tag) : undefined;
  }

  /**
   * Replace the provider's own `pickFeatures`. The library's version reads a
   * zoom-dependent overview with a lon/lat interpolation that is wrong for
   * projected COGs, ignores no-data, answers once per COG of a mosaic and sets
   * no position. This one reads the full-resolution pixel of the displayed step
   * through the shared, cached GeoTIFFs.
   */
  private _installPick(provider: TIFFImageryProvider): void {
    (provider as any).pickFeatures = (
      _x: number,
      _y: number,
      _level: number,
      longitude: number,
      latitude: number
    ) => this._pickAt(provider, longitude, latitude);
  }

  /**
   * @param longitude Radians, as Cesium passes them.
   * @param latitude Radians.
   *
   * Never rejects: TerriaJS awaits the picks of every layer together, so a
   * rejection here would lose the features of all other layers too.
   */
  private async _pickAt(
    provider: TIFFImageryProvider,
    longitude: number,
    latitude: number
  ): Promise<ImageryLayerFeatureInfo[]> {
    try {
      if (!this.allowFeaturePicking) return [];
      const step = this._currentStep;
      // Preloaded (invisible) steps must not answer.
      if (!step || !step.providers.includes(provider)) return [];

      // Every COG of a mosaic is asked about the same click: answer once.
      const clickKey = `${longitude.toFixed(9)},${latitude.toFixed(9)}`;
      const now = Date.now();
      if (
        this._lastPick &&
        this._lastPick.key === clickKey &&
        this._lastPick.step === step &&
        now - this._lastPick.at < PICK_DEDUPE_MS
      ) {
        return [];
      }
      this._lastPick = { key: clickKey, step, at: now };

      const lon = CesiumMath.toDegrees(longitude);
      const lat = CesiumMath.toDegrees(latitude);
      const urls = filterOutUndefined(
        step.providers.map((p) => getCogProviderUrl(p))
      );
      const band = this.renderOptions?.single?.band ?? 1;
      const read = await readCogStepPointValue(urls, lon, lat, {
        band,
        noDataValues: this.noDataValues,
        transform: this.valueTransform
      });
      // Not over this step's imagery: let the layers underneath answer.
      if (read.status === "outside") return [];

      const dateLabel = this.currentStepLabel;
      const date = this.currentDiscreteJulianDate
        ? JulianDate.toIso8601(this.currentDiscreteJulianDate)
        : undefined;
      const data: CogPickData = {
        cogTimeSeriesPick: true,
        longitude: lon,
        latitude: lat,
        value: read.status === "value" ? read.value : null,
        unit: this.displayUnit,
        date,
        dateLabel,
        band,
        statistic: this.activeBand?.name
      };

      const info = new ImageryLayerFeatureInfo();
      info.name = dateLabel
        ? `${this.name ?? "COG"} — ${dateLabel}`
        : this.name ?? "COG";
      info.position = new Cartographic(longitude, latitude, 0);
      info.data = data;
      info.properties = { ...data };
      delete (info.properties as any).cogTimeSeriesPick;

      // A click while drawing (zonal polygon, measure tool) is not a request
      // for a time series.
      if (this.terria.mapInteractionModeStack.length === 0) {
        this.addPointSeries(lat, lon);
      }
      return [info];
    } catch (e) {
      console.error("COG time series: failed to read the clicked value", e);
      return [];
    }
  }

  // ──────────────────────────────────────────────
  // Time series at a point — read in the browser
  // ──────────────────────────────────────────────

  /** Series of the points clicked so far (P1, P2…), newest last. */
  @computed
  get pointSeries(): readonly CogPointSeriesState[] {
    return this._pointSeries;
  }

  private _pointKey(lat: number, lon: number): string {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
  }

  /**
   * Start (or reuse) the time series at a coordinate. Returns its key.
   * Values are read from every time step entirely in the browser, the dates
   * around the displayed one first.
   */
  @action
  addPointSeries(lat: number, lon: number, label?: string): string {
    const key = this._pointKey(lat, lon);
    const existing = this._pointSeries.find((series) => series.key === key);
    // A cancelled or failed series is read again, and so is a windowed one
    // when the displayed date has moved out of the dates it read. Anything
    // else is reused.
    const currentTime = this.currentDiscreteJulianDate;
    const currentX = currentTime
      ? JulianDate.toDate(currentTime).getTime()
      : undefined;
    const outsideWindow =
      existing?.window !== undefined &&
      currentX !== undefined &&
      (currentX < existing.window.firstX || currentX > existing.window.lastX);
    if (
      existing &&
      existing.status !== "cancelled" &&
      existing.status !== "error" &&
      !outsideWindow
    ) {
      return key;
    }

    const named = label !== undefined || existing?.named === true;
    const state: CogPointSeriesState = {
      key,
      label: label ?? existing?.label ?? `P${++this._pointLabelCounter}`,
      named,
      lat,
      lon,
      color: existing?.color ?? paletteColor(this._nextPointColorIndex++),
      status: "loading",
      loaded: 0,
      total: this._pointSeriesWindow().entries.length,
      errors: 0,
      noData: 0,
      outside: 0,
      points: []
    };
    this._replacePointSeries(state);
    if (this._pointSeries.length > MAX_POINT_SERIES) {
      this._pointSeries
        .slice(0, this._pointSeries.length - MAX_POINT_SERIES)
        .forEach((dropped) => this.removeAccumulatedSeries(dropped.key));
    }

    this._loadPointSeries(state).catch((e) => {
      console.error("COG time series: point series failed", e);
    });
    return key;
  }

  @action
  private _replacePointSeries(state: CogPointSeriesState): void {
    const index = this._pointSeries.findIndex((s) => s.key === state.key);
    if (index >= 0) this._pointSeries.splice(index, 1, state);
    else this._pointSeries.push(state);
  }

  private async _loadPointSeries(initial: CogPointSeriesState): Promise<void> {
    const key = initial.key;
    this._pointSeriesAborts.get(key)?.abort();
    const controller = new AbortController();
    this._pointSeriesAborts.set(key, controller);

    const window = this._pointSeriesWindow();
    const entries = window.entries.map((entry) => ({
      time: JulianDate.toIso8601(entry.time),
      cogs: entry.cogs.map((url) => proxyCatalogItemUrl(this, url))
    }));
    const readWindow =
      window.entries.length < window.available && window.entries.length > 0
        ? {
            firstX: JulianDate.toDate(window.entries[0].time).getTime(),
            lastX: JulianDate.toDate(
              window.entries[window.entries.length - 1].time
            ).getTime(),
            available: window.available
          }
        : undefined;

    // Publish progress at most every POINT_SERIES_FLUSH_MS: each publish
    // re-renders the chart, so per-step updates would cost O(n²).
    let latest: CogPointSeriesState = {
      ...initial,
      total: entries.length,
      window: readWindow
    };
    let lastFlush = 0;
    const publish = (progress: CogPointSeriesProgress, force: boolean) => {
      const now = Date.now();
      if (!force && now - lastFlush < POINT_SERIES_FLUSH_MS) return;
      lastFlush = now;
      if (!this._pointSeries.some((s) => s.key === key)) return;
      latest = {
        ...latest,
        loaded: progress.loaded,
        errors: progress.errors,
        noData: progress.noData,
        outside: progress.outside,
        points: progress.points
          .map((point) => ({ x: point.x, y: point.y }))
          .sort((a, b) => a.x - b.x)
      };
      this._replacePointSeries(latest);
    };

    try {
      const result = await loadCogPointSeries({
        entries,
        lon: initial.lon,
        lat: initial.lat,
        band: this.renderOptions?.single?.band ?? 1,
        noDataValues: this.noDataValues,
        transform: this.valueTransform,
        startIndex: window.startIndex,
        // A place was chosen on purpose; a click may simply have missed the data.
        giveUpAfterEmpty: initial.named
          ? undefined
          : Math.max(
              POINT_SERIES_GIVE_UP_AFTER,
              Math.ceil(entries.length * POINT_SERIES_GIVE_UP_SHARE)
            ),
        signal: controller.signal,
        onProgress: (progress) => publish(progress, false)
      });
      if (result.aborted) return;
      // Nothing at this point: a click on land, or outside the data mask.
      if (
        result.gaveUp ||
        (!initial.named && result.points.length === 0 && result.errors === 0)
      ) {
        this._dropEmptyPointSeries(key);
        return;
      }
      publish(result, true);
      latest = {
        ...latest,
        status:
          result.points.length === 0 && result.errors > 0 ? "error" : "done"
      };
      this._replacePointSeries(latest);
    } finally {
      if (this._pointSeriesAborts.get(key) === controller) {
        this._pointSeriesAborts.delete(key);
      }
    }
  }

  /**
   * The time steps a point series reads: all of them, or with
   * `pointSeriesMaxSteps` the N closest to the displayed date.
   */
  private _pointSeriesWindow(): {
    entries: SortedTimeEntry[];
    /** Index, within `entries`, of the displayed date. */
    startIndex: number | undefined;
    available: number;
  } {
    const all = this._sortedEntries;
    const current = this.currentDiscreteTimeIndex;
    const max = this.pointSeriesMaxSteps;
    if (
      max === undefined ||
      !Number.isFinite(max) ||
      max < 1 ||
      all.length <= max
    ) {
      return { entries: all, startIndex: current, available: all.length };
    }
    const size = Math.floor(max);
    const centre = current ?? all.length - 1;
    const start = Math.max(
      0,
      Math.min(all.length - size, centre - Math.floor(size / 2))
    );
    return {
      entries: all.slice(start, start + size),
      startIndex: centre - start,
      available: all.length
    };
  }

  /** A click that found no data is not a series: forget it (and its P-number). */
  @action
  private _dropEmptyPointSeries(key: string): void {
    const series = this._pointSeries.find((s) => s.key === key);
    if (!series) return;
    if (!series.named && series.label === `P${this._pointLabelCounter}`) {
      this._pointLabelCounter--;
      this._nextPointColorIndex = Math.max(0, this._nextPointColorIndex - 1);
    }
    this._pointSeries = this._pointSeries.filter((s) => s.key !== key);
  }

  /** Read the clicked points again, e.g. for the time steps of another resolution. */
  @action
  private _reloadPointSeries(): void {
    for (const series of [...this._pointSeries]) {
      this._pointSeriesAborts.get(series.key)?.abort();
      const restarted: CogPointSeriesState = {
        ...series,
        status: "loading",
        loaded: 0,
        total: 0,
        errors: 0,
        noData: 0,
        outside: 0,
        points: []
      };
      this._replacePointSeries(restarted);
      // The new resolution's steps may not be loaded yet.
      this.loadMapItems()
        .then(() => {
          if (!this._pointSeries.some((s) => s.key === series.key)) return;
          const ready = { ...restarted, total: this._sortedEntries.length };
          this._replacePointSeries(ready);
          return this._loadPointSeries(ready);
        })
        .catch((e) => {
          console.error("COG time series: point series failed", e);
        });
    }
  }

  /** Stop reading a point series; what was read so far stays on the chart. */
  @action
  cancelPointSeries(key: string): void {
    this._pointSeriesAborts.get(key)?.abort();
    this._pointSeriesAborts.delete(key);
    const series = this._pointSeries.find((s) => s.key === key);
    if (series && series.status === "loading") {
      this._replacePointSeries({ ...series, status: "cancelled" });
    }
  }

  // The four members below are the duck-typed contract the Chart.js dock and
  // the share link use (see BuildShareLink / Terria.applyInitData).

  /** Point series in the shape the Chart.js dock and share links understand. */
  @computed
  get accumulatedChartSeries(): AccumulatedSeries[] {
    return this._pointSeries.map((series) => ({
      key: series.key,
      // A place is known by its name; an anonymous point by where it is.
      name: series.named
        ? series.label
        : `${series.label} (${series.lat.toFixed(4)}, ${series.lon.toFixed(
            4
          )})`,
      units: this.displayUnit,
      color: series.color,
      points: series.points,
      meta: {
        kind: "point" as const,
        lat: series.lat,
        lon: series.lon,
        ...(series.named ? { label: series.label } : {})
      }
    }));
  }

  /** Restore a series from a share link: shown at once, no re-reading. */
  @action
  addAccumulatedSeries(series: AccumulatedSeries): void {
    const lat = series.meta?.lat;
    const lon = series.meta?.lon;
    if (lat === undefined || lon === undefined) return;
    const placeName = series.meta?.label;
    const label = /^P(\d+)/.exec(series.name)?.[1];
    if (!placeName && label) {
      this._pointLabelCounter = Math.max(
        this._pointLabelCounter,
        Number(label)
      );
    }
    this._nextPointColorIndex++;
    this._replacePointSeries({
      key: series.key,
      label:
        placeName ?? (label ? `P${label}` : `P${++this._pointLabelCounter}`),
      named: placeName !== undefined,
      lat,
      lon,
      color: series.color,
      status: "done",
      loaded: series.points.length,
      total: series.points.length,
      errors: 0,
      noData: 0,
      outside: 0,
      points: series.points.map((point) => ({ x: point.x, y: point.y }))
    });
  }

  @action
  removeAccumulatedSeries(key: string): void {
    this._pointSeriesAborts.get(key)?.abort();
    this._pointSeriesAborts.delete(key);
    this._pointSeries = this._pointSeries.filter((s) => s.key !== key);
  }

  @action
  clearAccumulatedSeries(): void {
    this._pointSeriesAborts.forEach((controller) => controller.abort());
    this._pointSeriesAborts.clear();
    this._pointSeries = [];
    this._pointLabelCounter = 0;
    this._nextPointColorIndex = 0;
  }

  /** Clicked points always feed the Chart.js dock. */
  get isChartSeriesAccumulationActive(): boolean {
    return true;
  }

  /**
   * Ties the dock's chart to the map: a marker at the displayed date, a click
   * on the chart moves the map to that date, and the progress of the point
   * series still being read (with a way to stop them).
   */
  @computed
  get chartDock(): ChartDockContext {
    const current = this.currentDiscreteJulianDate;
    const loading = this._pointSeries.filter(
      (series) => series.status === "loading"
    );
    return {
      activeX: current ? JulianDate.toDate(current).getTime() : undefined,
      activeXLabel: this.currentStepLabel,
      onSelectX: (x: number) => {
        runInAction(() => {
          this.setTrait(
            CommonStrata.user,
            "currentTime",
            new Date(x).toISOString()
          );
        });
      },
      status: {
        loading: loading.length > 0,
        loaded: loading.reduce((sum, series) => sum + series.loaded, 0),
        total: loading.reduce((sum, series) => sum + series.total, 0),
        errors: this._pointSeries.reduce(
          (sum, series) => sum + series.errors,
          0
        ),
        cancel: () =>
          loading.forEach((series) => this.cancelPointSeries(series.key))
      }
    };
  }

  @computed
  get accumulatedChartItems(): ChartItem[] {
    return this.accumulatedChartSeries.map((series) => ({
      id: series.key,
      name: series.name,
      key: series.key,
      item: this,
      type: "line" as const,
      units: series.units,
      showInChartPanel: true,
      isSelectedInWorkbench: false,
      xAxis: { name: "Date", scale: "time" as const },
      points: series.points.map((p) => ({ x: p.x, y: p.y })),
      domain: {
        x: series.points.map((p) => p.x),
        y: series.points.map((p) => p.y)
      },
      getColor: () => series.color,
      updateIsSelectedInWorkbench: () => {}
    }));
  }

  // ──────────────────────────────────────────────
  // Feature Info
  // ──────────────────────────────────────────────

  /**
   * Implements FeatureInfoContext: the value under the click for the displayed
   * date, and the progress / chart of that point's time series.
   */
  @computed
  get featureInfoContext(): (
    feature: TerriaFeature
  ) => TimeSeriesFeatureInfoContext {
    return (feature: TerriaFeature): TimeSeriesFeatureInfoContext => {
      const pick = getCogPickData(feature);
      if (!pick) return {};

      const series = this._pointSeries.find(
        (s) => s.key === this._pointKey(pick.latitude, pick.longitude)
      );
      const unit = this.displayUnit;

      // Follow the timeline: once the series is read, the headline value is the
      // one of the displayed date rather than of the date that was clicked.
      let value = pick.value;
      let dateLabel = pick.dateLabel;
      const currentTime = this.currentDiscreteJulianDate;
      if (series && currentTime) {
        const x = JulianDate.toDate(currentTime).getTime();
        const match = series.points.find((point) => point.x === x);
        if (match) {
          value = match.y;
          dateLabel = this.currentStepLabel;
        } else if (series.status === "done") {
          value = null;
          dateLabel = this.currentStepLabel;
        }
      }

      const timeSeries: TimeSeriesContext & Record<string, any> = {
        title: this.name ?? "",
        xName: "Date",
        yName: unit ? `Value (${unit})` : "Value",
        currentValue: value !== null ? formatCogValue(value) : undefined,
        noValue: value === null,
        unit,
        currentDate: dateLabel,
        coordinates: `${pick.latitude.toFixed(5)}, ${pick.longitude.toFixed(
          5
        )}`,
        pointLabel: series?.label,
        statistic: pick.statistic
      };
      if (series?.window) {
        timeSeries.windowNote = i18next.t(
          "models.cogTimeSeries.pointSeriesWindow",
          { read: series.total, available: series.window.available }
        );
      }

      if (series) {
        if (series.status === "loading") {
          timeSeries.progress = i18next.t(
            "models.cogTimeSeries.pointSeriesLoading",
            { loaded: series.loaded, total: series.total }
          );
        } else if (series.errors > 0) {
          timeSeries.warning = i18next.t(
            "models.cogTimeSeries.pointSeriesErrors",
            { count: series.errors }
          );
        }

        // Only once complete, with a stable identifier and ISO dates: a chart
        // rebuilt on every progress tick is what used to make this crawl.
        if (series.status !== "loading" && series.points.length > 1) {
          const csv = [
            `Date,${timeSeries.yName}`,
            ...series.points.map(
              (point) =>
                `${new Date(point.x).toISOString()},${formatCogValue(point.y)}`
            )
          ].join("\n");
          const id = `cog-ts-${this.uniqueId}-${series.key}`;
          timeSeries.id = id;
          timeSeries.data = csv;
          timeSeries.chart = `<chart identifier="${id}" title="${escapeHtmlAttribute(
            `${this.name ?? ""} ${series.label}`.trim()
          )}" renderer="chartjs">${csv}</chart>`;
        }
      }

      return { terria: { timeSeries } };
    };
  }

  // ──────────────────────────────────────────────
  // Provider Management
  // ──────────────────────────────────────────────

  /**
   * React to a change of the displayed step. A step that is already built is
   * published straight away (instant when it was preloaded); an uncached one
   * waits for the timeline to settle so scrubbing does not build every date it
   * passes over. The previous imagery stays on screen in the meantime.
   */
  private _scheduleStepUpdate(): void {
    if (this._stepDebounce !== undefined) {
      clearTimeout(this._stepDebounce);
      this._stepDebounce = undefined;
    }

    const run = () => {
      this._stepDebounce = undefined;
      this._updateProvidersForCurrentTime().catch((e) =>
        this._reportStepError(e)
      );
    };

    const key = this._currentStepKey;
    // The steps of a newly selected resolution are still loading: keep what is
    // on screen, the load publishes the right step when it finishes.
    if (key === undefined && this._sortedEntries.length === 0) return;
    if (key === undefined || this._stepCache.has(key)) {
      run();
    } else {
      // Invalidate any build in flight for a date the user already left.
      this._stepToken++;
      runInAction(() => {
        this._isSteppingTime = true;
      });
      this._stepDebounce = setTimeout(run, STEP_BUILD_DEBOUNCE_MS);
    }
  }

  /** Tell the user once per step; the previous imagery stays visible. */
  private _reportStepError(e: unknown): void {
    const key = this._currentStepKey ?? "";
    if (this._reportedStepErrors.has(key)) return;
    this._reportedStepErrors.add(key);
    this.terria.raiseErrorToUser(e);
  }

  /**
   * Build (or reuse) the imagery providers of the current time step and
   * publish them. Only the most recent call publishes; an overtaken build is
   * still cached so returning to that date is instant.
   */
  private async _updateProvidersForCurrentTime(): Promise<void> {
    const token = ++this._stepToken;
    const index = this.currentDiscreteTimeIndex;
    const key = this._stepKeyAt(index);

    if (index === undefined || key === undefined) {
      this._publishStep(undefined);
      return;
    }

    if (this._lastStepIndex !== undefined && index !== this._lastStepIndex) {
      this._stepDirection = index > this._lastStepIndex ? 1 : -1;
    }
    this._lastStepIndex = index;

    let step = this._stepCache.get(key);
    if (!step) {
      runInAction(() => {
        this._isSteppingTime = true;
      });
      try {
        step = await this._ensureStep(key, this._sortedEntries[index].cogs);
      } catch (e) {
        if (token === this._stepToken) {
          runInAction(() => {
            this._isSteppingTime = false;
          });
        }
        throw TerriaError.from(e, {
          title: i18next.t("models.cogTimeSeries.loadImageryErrorTitle"),
          message: i18next.t("models.cogTimeSeries.loadImageryErrorMessage")
        });
      }
    }

    // A newer request took over while this one was building.
    if (token !== this._stepToken) return;

    this._publishStep(step);
    this._schedulePreload(token, index);
  }

  @action
  private _publishStep(step: CachedStep | undefined): void {
    this._isSteppingTime = false;
    if (step) step.lastAccess = ++this._accessCounter;
    this._currentStep = step;
    this._effectiveCogStyle = step?.effectiveStyle;
    // A preloaded step that is now displayed no longer counts as preloaded.
    this._preloadedSteps = this._preloadedSteps.filter(
      (preloaded) => preloaded !== step
    );
    if (step && step.providers.length > 0) {
      this._updateRectangleFromProviders(step.providers);
      this._schedulePrefetchHeaders();
    }
    this._evictSteps();
  }

  /**
   * Opt-in (`prefetchHeaders`): open every time step's GeoTIFF in the
   * background so a later point series only fetches the pixel's tile. Polite on
   * purpose — it waits for the map to settle and uses two connections, leaving
   * the rest of the browser's per-host budget to the imagery.
   */
  private _schedulePrefetchHeaders(): void {
    const entries = this._sortedEntries;
    if (
      this.prefetchHeaders !== true ||
      entries.length === 0 ||
      entries.length > PREFETCH_MAX_STEPS
    ) {
      return;
    }
    const key = `${entries.length}|${entries[0].cogs[0]}`;
    if (this._prefetchKey === key) return;
    this._prefetchKey = key;

    const generation = this._providerGeneration;
    const order = outwardOrder(
      entries.length,
      this.currentDiscreteTimeIndex ?? entries.length - 1
    );
    setTimeout(() => {
      let next = 0;
      const worker = async () => {
        while (next < order.length) {
          if (
            generation !== this._providerGeneration ||
            this._prefetchKey !== key
          ) {
            return;
          }
          for (const url of entries[order[next++]].cogs) {
            // A header that fails now is simply fetched when it is needed.
            await openCogSource(proxyCatalogItemUrl(this, url)).catch(
              () => undefined
            );
          }
        }
      };
      Promise.all(
        Array.from({ length: PREFETCH_CONCURRENCY }, () => worker())
      ).catch(() => undefined);
    }, PREFETCH_DELAY_MS);
  }

  /** Build a step once, however many callers ask for it concurrently. */
  private _ensureStep(
    key: string,
    cogUrls: readonly string[]
  ): Promise<CachedStep | undefined> {
    const cached = this._stepCache.get(key);
    if (cached) return Promise.resolve(cached);

    let inflight = this._inflightSteps.get(key);
    if (!inflight) {
      inflight = this._buildStep(key, cogUrls).finally(() => {
        this._inflightSteps.delete(key);
      });
      this._inflightSteps.set(key, inflight);
    }
    return inflight;
  }

  private async _buildStep(
    key: string,
    cogUrls: readonly string[]
  ): Promise<CachedStep | undefined> {
    const generation = this._providerGeneration;
    const providers = (
      await Promise.all(cogUrls.map((url) => this._createImageryProvider(url)))
    ).filter((p): p is TIFFImageryProvider => p !== undefined);

    // The item was torn down (removed from the map, or a rebuild-only option
    // changed) while this step was building.
    if (generation !== this._providerGeneration) {
      providers.forEach((provider) => destroyCogImageryProvider(provider));
      return undefined;
    }

    const step: CachedStep = {
      key,
      providers,
      effectiveStyle: undefined,
      lastAccess: ++this._accessCounter
    };
    this._finalizeStep(step);
    this._stepCache.set(key, step);
    this._evictSteps();
    return step;
  }

  /**
   * Evict least-recently-used steps beyond `providerCacheSize`. Steps that are
   * on the map (displayed or preloaded) are never evicted: destroying a
   * provider Cesium is still rendering breaks its tile requests.
   */
  private _evictSteps(): void {
    const maxSize = Math.max(
      1,
      this.providerCacheSize ?? DEFAULT_PROVIDER_CACHE_SIZE
    );
    const isPublished = (step: CachedStep) =>
      step === this._currentStep || this._preloadedSteps.includes(step);

    while (this._stepCache.size > maxSize) {
      let oldest: CachedStep | undefined;
      for (const step of this._stepCache.values()) {
        if (isPublished(step)) continue;
        if (!oldest || step.lastAccess < oldest.lastAccess) oldest = step;
      }
      if (!oldest) return;
      this._stepCache.delete(oldest.key);
      oldest.providers.forEach((provider) =>
        destroyCogImageryProvider(provider)
      );
    }
  }

  /**
   * Once the displayed step had a moment to request its tiles, build its
   * neighbours (in the direction of travel first) and publish them invisibly.
   */
  private _schedulePreload(token: number, index: number): void {
    if (this._preloadTimer !== undefined) {
      clearTimeout(this._preloadTimer);
      this._preloadTimer = undefined;
    }

    const count = Math.max(0, Math.floor(this.preloadAdjacentSteps ?? 1));
    const indices: number[] = [];
    for (let distance = 1; distance <= count; distance++) {
      indices.push(index + this._stepDirection * distance);
      indices.push(index - this._stepDirection * distance);
    }
    const wanted = indices
      .map((i) => ({
        key: this._stepKeyAt(i),
        cogs: this._sortedEntries[i]?.cogs
      }))
      .filter(
        (w): w is { key: string; cogs: readonly string[] } =>
          w.key !== undefined && w.cogs !== undefined
      );

    // Drop preloaded steps that are no longer neighbours right away.
    const wantedKeys = new Set(wanted.map((w) => w.key));
    runInAction(() => {
      this._preloadedSteps = this._preloadedSteps.filter((step) =>
        wantedKeys.has(step.key)
      );
    });
    if (wanted.length === 0) return;

    this._preloadTimer = setTimeout(async () => {
      this._preloadTimer = undefined;
      // One at a time: the displayed step keeps most of the bandwidth.
      for (const { key, cogs } of wanted) {
        if (token !== this._stepToken) return;
        let step: CachedStep | undefined;
        try {
          step = await this._ensureStep(key, cogs);
        } catch {
          // A neighbour that fails to load is reported if the user steps to it.
          continue;
        }
        if (token !== this._stepToken) return;
        if (!step || step === this._currentStep) continue;
        const preloaded = step;
        runInAction(() => {
          if (!this._preloadedSteps.includes(preloaded)) {
            this._preloadedSteps = [...this._preloadedSteps, preloaded];
          }
        });
      }
    }, PRELOAD_DELAY_MS);
  }

  /**
   * Create a TIFFImageryProvider for a single COG URL.
   *
   * The provider is handed a domain at construction so it does not read a whole
   * overview for band statistics on every build: the configured domain when
   * there is one, otherwise the native range (computed once per URL and
   * cached). The native range is tracked separately — see CogProviderFactory.
   */
  private async _createImageryProvider(
    url: string
  ): Promise<TIFFImageryProvider | undefined> {
    const proxiedUrl = proxyCatalogItemUrl(this, url);
    const { default: proj4 } = await import("proj4-fully-loaded");

    const single = this.renderOptions?.single;
    const band = single?.band ?? 1;
    const configuredDomain = getValidDomain(single?.domain);
    let nativeDomain: CogRange | undefined;
    if (!configuredDomain && !single?.expression) {
      nativeDomain = await getCogBandStats(proxiedUrl, band).catch(
        () => undefined
      );
    }
    // `domain` is configured in physical units; the provider renders stored
    // values. The native statistics are already stored values.
    const constructionDomain =
      toRawRange(configuredDomain, this.valueTransform) ?? nativeDomain;

    const renderOptions = buildCogRenderOptions(this.renderOptions, {
      constructionDomain
    });

    const provider = await createCogImageryProvider(proxiedUrl, {
      credit: this.credit,
      tileSize: this.tileSize,
      maximumLevel: this.maximumLevel,
      minimumLevel: this.minimumLevel,
      enablePickFeatures: this.allowFeaturePicking,
      hasAlphaChannel: this.hasAlphaChannel,
      projFunc: this.reprojector(proj4),
      renderOptions,
      tileCacheSize: this.tileCacheSize ?? DEFAULT_TILE_CACHE_SIZE,
      nativeDomain
    });
    this._installPick(provider);
    return provider;
  }

  /**
   * Native value range of the displayed step. Steps built with a configured
   * domain skip the statistics read, so it is computed here on demand (and
   * cached per COG) — e.g. for "fit colour range to this date".
   */
  async loadNativeDomainForCurrentStep(): Promise<CogRange | undefined> {
    const step = this._currentStep;
    if (!step) return undefined;
    const known = step.effectiveStyle?.nativeDomain;
    if (known) return known;

    const band = this.renderOptions?.single?.band ?? 1;
    await Promise.all(
      step.providers.map(async (provider) => {
        if (
          !hasCogConstructionDomain(provider) ||
          getCogProviderNativeDomain(provider)
        ) {
          return;
        }
        const url = getCogProviderUrl(provider);
        if (!url) return;
        const stats = await getCogBandStats(url, band).catch(() => undefined);
        setCogProviderNativeDomain(provider, stats);
      })
    );

    if (this._stepCache.get(step.key) !== step) return undefined;
    // Refresh the style so `nativeDomain` is visible; nothing is repainted
    // differently because the applied domain is unchanged.
    runInAction(() => {
      this._finalizeStep(step);
      if (this._currentStep === step) {
        this._effectiveCogStyle = step.effectiveStyle;
      }
    });
    return step.effectiveStyle?.nativeDomain;
  }

  /**
   * Fix the colour range to the native range of the displayed date, so the
   * colours (and legend) stay comparable while stepping through time.
   */
  async fitDomainToCurrentStep(stratumId: string): Promise<boolean> {
    const nativeDomain = await this.loadNativeDomainForCurrentStep();
    if (!nativeDomain) return false;
    runInAction(() => {
      if (!this.renderOptions.single) {
        this.renderOptions.setTrait(stratumId, "single", undefined);
      }
      this.renderOptions.single!.setTrait(stratumId, "domain", [
        nativeDomain[0],
        nativeDomain[1]
      ]);
    });
    return true;
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
   * Destroy all cached providers and clear the cache.
   */
  private _destroyAllProviders(): void {
    this._providerGeneration++;
    this._stepToken++;
    this._hasLoadedSteps = false;
    this._lastPick = undefined;
    this._prefetchKey = undefined;
    if (this._stepDebounce !== undefined) clearTimeout(this._stepDebounce);
    if (this._preloadTimer !== undefined) clearTimeout(this._preloadTimer);
    this._stepDebounce = undefined;
    this._preloadTimer = undefined;
    this._lastStepIndex = undefined;

    for (const step of this._stepCache.values()) {
      step.providers.forEach((provider) => destroyCogImageryProvider(provider));
    }
    this._stepCache.clear();
    runInAction(() => {
      this._currentStep = undefined;
      this._preloadedSteps = [];
      this._effectiveCogStyle = undefined;
      this._isSteppingTime = false;
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
