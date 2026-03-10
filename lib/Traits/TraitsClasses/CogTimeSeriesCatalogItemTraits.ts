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
    description: "Cache survival time in milliseconds."
  })
  cache?: number;

  @primitiveTrait({
    type: "string",
    name: "Resample Method",
    description: "Geotiff resample method."
  })
  resampleMethod?: "nearest" | "bilinear" | "linear";

  @primitiveTrait({
    type: "number",
    name: "Provider Cache Size",
    description:
      "Number of TIFFImageryProvider instances to keep cached for recently-viewed time steps. Default is 3."
  })
  providerCacheSize?: number;

  @primitiveArrayTrait({
    type: "number",
    name: "NoData Values",
    description:
      "Additional pixel values to treat as NoData when extracting time series on click. " +
      "Common sentinel values like -999, -9999, etc. The TIFF metadata nodata and " +
      "renderOptions.nodata are always checked automatically."
  })
  noDataValues?: number[];
}
