import objectArrayTrait from "../Decorators/objectArrayTrait";
import objectTrait from "../Decorators/objectTrait";
import anyTrait from "../Decorators/anyTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import primitiveArrayTrait from "../Decorators/primitiveArrayTrait";
import ModelTraits from "../ModelTraits";
import { traitClass } from "../Trait";
import mixTraits from "../mixTraits";
import CatalogMemberTraits from "./CatalogMemberTraits";
import DiscretelyTimeVaryingTraits from "./DiscretelyTimeVaryingTraits";
import ImageryProviderTraits from "./ImageryProviderTraits";
import LayerOrderingTraits from "./LayerOrderingTraits";
import LegendOwnerTraits from "./LegendOwnerTraits";
import MappableTraits from "./MappableTraits";
import UrlTraits from "./UrlTraits";
import { CogRenderOptionsTraits } from "./CogCatalogItemTraits";

/**
 * A time step containing one or more COG files (mosaic support).
 */
export class CogTimeEntryTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Time",
    description:
      "ISO 8601 date/time string for this time step (e.g., '2024-01-15T00:00:00Z')."
  })
  time?: string;

  @primitiveArrayTrait({
    type: "string",
    name: "COG URLs",
    description:
      "Array of COG file URLs for this time step. Multiple URLs create a mosaic."
  })
  cogs?: string[];

  @primitiveTrait({
    type: "string",
    name: "Tag",
    description:
      "Optional display tag for this time step (e.g., 'Sentinel-2 2024-01-15'). Defaults to the time value."
  })
  tag?: string;
}

/**
 * Defines a precalculated area statistic value for a single time step.
 */
export class AreaCalculationValueTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Time",
    description: "ISO 8601 time string this value corresponds to."
  })
  time?: string;

  @primitiveTrait({
    type: "number",
    name: "Value",
    description: "The computed statistic value for this time step."
  })
  value?: number;
}

/**
 * Defines an area calculation over a polygon for the time series.
 */
export class AreaCalculationTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Name",
    description: "Display name for this area calculation."
  })
  name?: string;

  @anyTrait({
    name: "Polygon",
    description:
      'GeoJSON Polygon geometry defining the area of interest. Example: { "type": "Polygon", "coordinates": [[[lon, lat], ...]] }'
  })
  polygon?: any;

  @primitiveTrait({
    type: "number",
    name: "Band",
    description: "Band index to use for the calculation (starting from 1)."
  })
  band?: number;

  @primitiveTrait({
    type: "string",
    name: "Statistic",
    description:
      "Type of statistic to compute or display. Valid values: 'mean', 'min', 'max', 'sum', 'count', 'median'."
  })
  statistic?: "mean" | "min" | "max" | "sum" | "count" | "median";

  @primitiveTrait({
    type: "string",
    name: "Precalculated URL",
    description:
      "URL to a JSON file with precalculated statistic values per time step. " +
      'Expected format: { "values": [{ "time": "ISO8601", "value": number }, ...] }'
  })
  precalculatedUrl?: string;

  @objectArrayTrait({
    type: AreaCalculationValueTraits,
    idProperty: "time",
    name: "Values",
    description:
      "Inline precalculated values. Use this when values are few enough to embed directly."
  })
  values?: AreaCalculationValueTraits[];

  @primitiveTrait({
    type: "string",
    name: "Unit",
    description: "Unit label for display (e.g., 'NDVI', 'mm', '°C')."
  })
  unit?: string;
}

/**
 * One temporal resolution (e.g. annual, monthly, daily) of the same variable.
 * Whatever is set here applies while this resolution is the active one.
 */
export class CogSeriesResolutionTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Id",
    description: "Identifier of this resolution, e.g. `monthly`."
  })
  id?: string;

  @primitiveTrait({
    type: "string",
    name: "Name",
    description: "Label shown in the resolution switch, e.g. `Monthly`."
  })
  name?: string;

  @primitiveTrait({
    type: "string",
    name: "URL",
    description:
      'URL of the JSON listing this resolution\'s time steps: `{ "times": [{ "time", "cogs", "tag" }] }`.'
  })
  url?: string;

  @objectArrayTrait({
    type: CogTimeEntryTraits,
    idProperty: "time",
    name: "Time Entries",
    description: "Inline time steps, as an alternative to `url`."
  })
  timeEntries?: CogTimeEntryTraits[];

  @primitiveTrait({
    type: "string",
    name: "Date Format",
    description:
      "`dateformat` mask for this resolution's dates, e.g. `UTC:yyyy` or `UTC:mmm yyyy`. Prefix with `UTC:` so period starts are not shifted into the previous period by the viewer's time zone."
  })
  dateFormat?: string;

  @primitiveTrait({
    type: "string",
    name: "From Continuous",
    description:
      "How the current time maps to a time step: `nearest`, `previous` or `next`. Use `previous` for aggregates whose time is the start of the period, so July 2024 maps to the year 2024 and not 2025."
  })
  fromContinuous?: string;

  @objectTrait({
    type: CogRenderOptionsTraits,
    name: "Render Options",
    description:
      "Render options specific to this resolution, typically `single.domain`. Options shared by every resolution belong on the item."
  })
  renderOptions?: CogRenderOptionsTraits;

  @primitiveTrait({
    type: "number",
    name: "Value Scale",
    description: "See the item's `valueScale`."
  })
  valueScale?: number;

  @primitiveTrait({
    type: "number",
    name: "Value Offset",
    description: "See the item's `valueOffset`."
  })
  valueOffset?: number;

  @primitiveTrait({
    type: "string",
    name: "Unit",
    description: "See the item's `unit`."
  })
  unit?: string;

  @primitiveArrayTrait({
    type: "number",
    name: "NoData Values",
    description: "See the item's `noDataValues`."
  })
  noDataValues?: number[];

  @primitiveTrait({
    type: "boolean",
    name: "Partial Coverage",
    description:
      "True when each date only covers part of the area (e.g. single satellite passes). Shown as a hint so an empty map at some date is not mistaken for an error."
  })
  partialCoverage?: boolean;

  @primitiveTrait({
    type: "string",
    name: "Hint",
    description:
      "Short note shown in the workbench while this resolution is active."
  })
  hint?: string;
}

@traitClass({
  description:
    "Creates a time-varying Cloud Optimised GeoTIFF dataset. Supports multiple COGs per time step (mosaics) and optional area calculations.",
  example: {
    type: "cog-time-series",
    name: "NDVI Daily Composite",
    url: "https://example.com/cog-timeseries.json",
    renderOptions: {
      single: {
        colorScale: "greens",
        domain: [0, 1]
      }
    }
  }
})
export default class CogTimeSeriesCatalogItemTraits extends mixTraits(
  DiscretelyTimeVaryingTraits,
  ImageryProviderTraits,
  LayerOrderingTraits,
  UrlTraits,
  MappableTraits,
  CatalogMemberTraits,
  LegendOwnerTraits
) {
  @objectTrait({
    type: CogRenderOptionsTraits,
    name: "Render Options",
    description: "Render options applied to all COG files in the time series."
  })
  renderOptions?: CogRenderOptionsTraits;

  @objectArrayTrait({
    type: CogTimeEntryTraits,
    idProperty: "time",
    name: "Time Entries",
    description:
      "Array of time entries, each with a date and one or more COG URLs. " +
      "Can be defined inline or loaded from the URL."
  })
  timeEntries?: CogTimeEntryTraits[];

  @objectArrayTrait({
    type: AreaCalculationTraits,
    idProperty: "name",
    name: "Area Calculations",
    description:
      "Array of area calculation definitions. Each defines a polygon region " +
      "and either inline precalculated values or a URL to fetch them from."
  })
  areaCalculations?: AreaCalculationTraits[];

  @objectArrayTrait({
    type: CogSeriesResolutionTraits,
    idProperty: "id",
    name: "Resolutions",
    description:
      "Temporal resolutions of the same variable (e.g. annual, monthly, daily), switchable from the workbench without losing the date or the clicked points. " +
      "When set, time steps come from the active resolution instead of the item's `url` / `timeEntries`."
  })
  resolutions?: CogSeriesResolutionTraits[];

  @primitiveTrait({
    type: "string",
    name: "Active Resolution Id",
    description:
      "The `id` of the resolution to show. Defaults to the first one."
  })
  activeResolutionId?: string;

  @primitiveTrait({
    type: "string",
    name: "Credit",
    description: "Credit for the imagery provider."
  })
  credit?: string;

  @primitiveTrait({
    type: "number",
    name: "Tile Size",
    description: "The size of the tile."
  })
  tileSize?: number;

  @primitiveTrait({
    type: "boolean",
    name: "Has Alpha Channel",
    description: "Whether the imagery has an alpha channel."
  })
  hasAlphaChannel?: boolean;

  @primitiveTrait({
    type: "number",
    name: "Cache",
    description:
      "Deprecated and ignored. Use `providerCacheSize` and `tileCacheSize`."
  })
  cache?: number;

  @primitiveTrait({
    type: "string",
    name: "Resample Method",
    description:
      "Deprecated and ignored. Use `renderOptions.resampleMethod`, which defaults to `bilinear` for time series."
  })
  resampleMethod?: "nearest" | "bilinear" | "linear";

  @primitiveTrait({
    type: "number",
    name: "Provider Cache Size",
    description:
      "Number of time steps whose imagery providers are kept ready (the displayed step and its preloaded neighbours always stay). Default is 6."
  })
  providerCacheSize?: number;

  @primitiveTrait({
    type: "number",
    name: "Preload Adjacent Steps",
    description:
      "How many time steps before and after the displayed one are loaded invisibly so stepping through time is instant. Set to 0 to disable. Default is 1."
  })
  preloadAdjacentSteps?: number;

  @primitiveTrait({
    type: "number",
    name: "Tile Cache Size",
    description:
      "Number of rendered tiles each time step keeps in memory. Default is 64."
  })
  tileCacheSize?: number;

  @primitiveArrayTrait({
    type: "number",
    name: "NoData Values",
    description:
      "Additional stored pixel values to treat as NoData when reading the value at a point. " +
      "The GeoTIFF's own no-data value is always honoured; list here only sentinels the " +
      "file does not declare. Values are never guessed."
  })
  noDataValues?: number[];

  @primitiveTrait({
    type: "string",
    name: "Unit",
    description:
      "Unit of the physical values (e.g. `mg m-3`), shown in the legend, feature info and charts."
  })
  unit?: string;

  @primitiveTrait({
    type: "number",
    name: "Value Scale",
    description:
      "Multiplier converting stored pixel values to physical values (`physical = stored * valueScale + valueOffset`), " +
      "e.g. 0.1 for a UInt16 raster storing tenths. The colour range (`domain`), legend, picked values and " +
      "time series are all expressed in physical values. Default is 1."
  })
  valueScale?: number;

  @primitiveTrait({
    type: "number",
    name: "Value Offset",
    description:
      "Offset converting stored pixel values to physical values. See `valueScale`. Default is 0."
  })
  valueOffset?: number;
}
