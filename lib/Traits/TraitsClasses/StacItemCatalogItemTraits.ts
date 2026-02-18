import objectTrait from "../Decorators/objectTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import ModelTraits from "../ModelTraits";
import { traitClass } from "../Trait";
import mixTraits from "../mixTraits";
import CatalogMemberTraits from "./CatalogMemberTraits";
import { CogRenderOptionsTraits } from "./CogCatalogItemTraits";
import ImageryProviderTraits from "./ImageryProviderTraits";
import LayerOrderingTraits from "./LayerOrderingTraits";
import LegendOwnerTraits from "./LegendOwnerTraits";
import MappableTraits from "./MappableTraits";
import UrlTraits from "./UrlTraits";

/**
 * Traits for configuring which STAC asset to use for rendering
 */
export class StacItemAssetTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Asset Key",
    description:
      "The key of the asset in the STAC item to use for rendering. If not specified, the first COG asset will be used."
  })
  assetKey?: string;

  @primitiveTrait({
    type: "string",
    name: "Band Name",
    description:
      "The name of the band to render. If not specified, the first band will be used."
  })
  bandName?: string;
}

@traitClass({
  description:
    "Creates a catalog item from a STAC Item. Supports rendering COG assets directly.",
  example: {
    name: "Sentinel-2 Chlorophyll-a Item",
    type: "stac-item",
    url: "https://stac.terrascope.be/collections/terrascope-s2-chl-v1/items/S2B_20260121T090159_36UWV_CHL_20M_V121"
  }
})
export default class StacItemCatalogItemTraits extends mixTraits(
  ImageryProviderTraits,
  LayerOrderingTraits,
  UrlTraits,
  MappableTraits,
  CatalogMemberTraits,
  LegendOwnerTraits
) {
  @primitiveTrait({
    type: "string",
    name: "Item ID",
    description:
      "The ID of the STAC item. If not specified, it will be extracted from the item JSON."
  })
  itemId?: string;

  @objectTrait({
    type: StacItemAssetTraits,
    name: "Asset Configuration",
    description: "Configuration for which STAC asset to use for rendering."
  })
  asset?: StacItemAssetTraits;

  @objectTrait({
    type: CogRenderOptionsTraits,
    name: "COG Render Options",
    description:
      "Render options for the underlying COG imagery provider. These settings are passed directly to the COG renderer."
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
    description: "The size of the tile for the imagery provider."
  })
  tileSize?: number;

  @primitiveTrait({
    type: "boolean",
    name: "Has Alpha Channel",
    description: "Whether the imagery has an alpha channel."
  })
  hasAlphaChannel?: boolean;
}
