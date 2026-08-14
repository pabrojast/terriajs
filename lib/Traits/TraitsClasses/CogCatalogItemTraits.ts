import objectTrait from "../Decorators/objectTrait";
import anyTrait from "../Decorators/anyTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import ModelTraits from "../ModelTraits";
import { traitClass } from "../Trait";
import mixTraits from "../mixTraits";
import CatalogMemberTraits from "./CatalogMemberTraits";
import ImageryProviderTraits from "./ImageryProviderTraits";
import LayerOrderingTraits from "./LayerOrderingTraits";
import LegendOwnerTraits from "./LegendOwnerTraits";
import MappableTraits from "./MappableTraits";
import UrlTraits from "./UrlTraits";
import primitiveArrayTrait from "../Decorators/primitiveArrayTrait";

export type ColorScaleNames =
  | "rainbow"
  | "jet"
  | "hsv"
  | "hot"
  | "cool"
  | "spring"
  | "summer"
  | "autumn"
  | "winter"
  | "bone"
  | "copper"
  | "greys"
  | "ylgnbu"
  | "greens"
  | "ylorrd"
  | "bluered"
  | "rdbu"
  | "picnic"
  | "portland"
  | "blackbody"
  | "earth"
  | "electric";

export type CogColorScaleMode = "default" | "named" | "custom";
/**
 * Definition of traits for the `single` rendering options.
 */
export class SingleRenderOptionsTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Color Scale Mode",
    description:
      "Selects the active color source. When unset, custom colors retain their legacy precedence over a named color scale."
  })
  colorScaleMode?: CogColorScaleMode;

  @primitiveTrait({
    type: "number",
    name: "Band",
    description: "Band index, starting from 1. Default is 1."
  })
  band?: number;

  @primitiveTrait({
    type: "string",
    name: "Color Scale",
    description: "Name of a predefined color scale to use."
  })
  colorScale?: ColorScaleNames;

  @anyTrait({
    name: "Colors",
    description:
      "Custom colors for interpolation. Can be an array of strings or an array of [number, string] tuples."
  })
  colors?: string[] | [number, string][];

  @primitiveTrait({
    type: "boolean",
    name: "Use Real Value",
    description:
      "Determines whether to use the true value range for custom color ranges."
  })
  useRealValue?: boolean;

  @primitiveTrait({
    type: "string",
    name: "Type",
    description: "Rendering type, continuous or discrete."
  })
  type?: "continuous" | "discrete";

  @primitiveArrayTrait({
    name: "Color scale range",
    description:
      "Stretches the colour scale across these [min, max] data values. Values outside still render (unless clamped or hidden by transparency). Persisted as `domain` for backwards compatibility.",
    type: "number"
  })
  domain?: [number, number];

  @primitiveArrayTrait({
    name: "Transparency range",
    description:
      "Optional [min, max] range used when applyDisplayRange is true. Values outside render transparent. Falls back to `domain` when unset.",
    type: "number"
  })
  displayRange?: [number, number];

  @primitiveTrait({
    type: "boolean",
    name: "Hide values outside color scale",
    description:
      "When true, values outside `displayRange` (or `domain` if `displayRange` is unset) render transparent."
  })
  applyDisplayRange?: boolean;

  @primitiveTrait({
    type: "boolean",
    name: "Clamp below color scale",
    description:
      "Render values below the color scale range with the lowest colour, instead of letting them stretch beyond."
  })
  clampLow?: boolean;

  @primitiveTrait({
    type: "boolean",
    name: "Clamp above color scale",
    description:
      "Render values above the color scale range with the highest colour, instead of letting them stretch beyond."
  })
  clampHigh?: boolean;

  @primitiveTrait({
    type: "string",
    name: "Expression",
    description: "Mathematical expression to evaluate in the chart."
  })
  expression?: string;

  @primitiveTrait({
    type: "number",
    name: "Number of Legend Bins",
    description:
      "Number of bins/steps to show in discrete legends. Default is 8. Note: Continuous legends use SVG gradients and ignore this setting."
  })
  numberOfBins?: number;

  @primitiveTrait({
    type: "boolean",
    name: "Reverse Color Scale",
    description: "Whether to reverse the color scale (flip the colors)."
  })
  reverseColorScale?: boolean;

  @primitiveTrait({
    type: "string",
    name: "No-data fill color",
    description:
      "CSS colour (e.g. '#FF0000', 'red', 'rgba(255,0,0,0.5)') to fill cells flagged as no-data. Empty = transparent."
  })
  noDataColor?: string;
}

export class CogRenderOptionsTraits extends ModelTraits {
  @objectTrait({
    type: SingleRenderOptionsTraits,
    name: "Single Render Options",
    description: "Individual rendering options for COGs."
  })
  single?: SingleRenderOptionsTraits;

  @primitiveTrait({
    type: "number",
    name: "No Data Value",
    description: "No data value, default read from tiff meta"
  })
  nodata?: number;

  @primitiveTrait({
    type: "boolean",
    name: "Convert to RGB",
    description: "Try to render multi band cog to RGB, priority 1"
  })
  convertToRGB?: boolean;

  @primitiveTrait({
    type: "string",
    name: "Resample Method",
    description: "Geotiff resample method. Defaults to `bilinear`."
  })
  resampleMethod?: "nearest" | "bilinear" = "nearest";

  @primitiveTrait({
    type: "string",
    name: "Color",
    description: "Color for single band rendering"
  })
  color?: string;
}

@traitClass({
  description:
    "Creates a Cloud Optimised Geotiff item in the catalog from a url pointing to a TIFF that is a valid COG.",
  example: {
    name: "COG Test Uluru",
    description:
      "This is a COG from Sentinel-2 L2A, in EPSG:32752. Does it display in correct location? Does it display correctly?",
    type: "cog",
    url: "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/52/J/FS/2023/5/S2A_52JFS_20230501_0_L2A/TCI.tif"
  }
})
export default class CogCatalogItemTraits extends mixTraits(
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
    description: "Render options for COGs"
  })
  renderOptions?: CogRenderOptionsTraits;

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
    // options: ["nearest", "bilinear", "linear"]
  })
  resampleMethod?: "nearest" | "bilinear" | "linear";
}
