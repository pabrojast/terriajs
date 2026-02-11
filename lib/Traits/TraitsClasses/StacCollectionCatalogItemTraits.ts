import { JsonObject } from "../../Core/Json";
import anyTrait from "../Decorators/anyTrait";
import objectTrait from "../Decorators/objectTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import primitiveArrayTrait from "../Decorators/primitiveArrayTrait";
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
export class StacAssetTraits extends ModelTraits {
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

/**
 * Traits for STAC render configuration (from STAC render extension)
 */
export class StacRenderTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Render Key",
    description:
      "The key of the render configuration to use from the STAC collection's renders extension. If not specified, the first available render will be used."
  })
  renderKey?: string;

  @primitiveTrait({
    type: "string",
    name: "Colormap Name",
    description:
      "The colormap name to use for rendering. Overrides the colormap from the STAC render extension."
  })
  colormapName?: string;

  @primitiveArrayTrait({
    type: "number",
    name: "Rescale",
    description:
      "The rescale range [min, max] for rendering. Overrides the rescale from the STAC render extension."
  })
  rescale?: number[];
}

@traitClass({
  description:
    "Creates a catalog item from a STAC Collection. Supports rendering COG assets from STAC items.",
  example: {
    name: "Sentinel-2 Chlorophyll-a",
    type: "stac-collection",
    url: "https://stac.terrascope.be/collections/terrascope-s2-chl-v1"
  }
})
export default class StacCollectionCatalogItemTraits extends mixTraits(
  ImageryProviderTraits,
  LayerOrderingTraits,
  UrlTraits,
  MappableTraits,
  CatalogMemberTraits,
  LegendOwnerTraits
) {
  @primitiveTrait({
    type: "string",
    name: "Collection ID",
    description:
      "The ID of the STAC collection to load. If not specified, it will be extracted from the collection JSON."
  })
  collectionId?: string;

  @primitiveTrait({
    type: "string",
    name: "Items URL",
    description:
      "The URL to fetch STAC items from. If not specified, it will be derived from the collection's links."
  })
  itemsUrl?: string;

  @objectTrait({
    type: StacAssetTraits,
    name: "Asset Configuration",
    description: "Configuration for which STAC asset to use for rendering."
  })
  asset?: StacAssetTraits;

  @objectTrait({
    type: StacRenderTraits,
    name: "Render Configuration",
    description:
      "Configuration for rendering, can use STAC render extension or custom settings."
  })
  render?: StacRenderTraits;

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

  @primitiveTrait({
    type: "number",
    name: "Maximum Items",
    description:
      "Maximum number of STAC items to fetch for browsing. Default is 10."
  })
  maximumItems?: number;

  @primitiveTrait({
    type: "number",
    name: "Preview Request Size Limit",
    description:
      "Maximum number of item preview images to request for rendering in a single load. Use this to control API/image requests when many STAC items overlap."
  })
  previewRequestSizeLimit = 6;

  @primitiveTrait({
    type: "number",
    name: "Preview Request Number Limit",
    description:
      "Maximum number of preview image requests to perform in parallel. Lower this value to reduce concurrent load against the API."
  })
  previewRequestNumberLimit = 3;

  @primitiveTrait({
    type: "string",
    name: "Date Time Filter",
    description:
      "A datetime filter to apply when fetching STAC items. Use ISO 8601 format, e.g., '2023-01-01/2023-12-31' for a range."
  })
  dateTimeFilter?: string;

  @primitiveArrayTrait({
    type: "number",
    name: "Bbox Filter",
    description:
      "A bounding box filter [west, south, east, north] to apply when fetching STAC items."
  })
  bboxFilter?: number[];

  @primitiveTrait({
    type: "string",
    name: "Items Query Mode",
    description:
      "How to query STAC items: `auto`, `items`, or `search`. `auto` uses `search` when filter/intersects controls are set, otherwise `items`."
  })
  itemsQueryMode?: string;

  @primitiveTrait({
    type: "number",
    name: "Items Page Size",
    description:
      "Maximum number of items requested per API page. If not set, the current load limit is used."
  })
  itemsPageSize?: number;

  @primitiveTrait({
    type: "number",
    name: "Items Page Limit",
    description:
      "Maximum number of API pages to request per load. Increase this to page through more results while controlling request volume."
  })
  itemsPageLimit = 1;

  @primitiveTrait({
    type: "string",
    name: "Sort By",
    description:
      "STAC `sortby` parameter passed to item queries, for example `-datetime`."
  })
  sortBy?: string;

  @primitiveTrait({
    type: "string",
    name: "Filter Expression",
    description: "STAC filter expression (`filter`) for APIs supporting CQL2."
  })
  filterExpression?: string;

  @primitiveTrait({
    type: "string",
    name: "Filter Language",
    description:
      "STAC filter language (`filter-lang`), for example `cql2-text` or `cql2-json`."
  })
  filterLanguage?: string;

  @anyTrait({
    name: "Intersects Geometry",
    description:
      "GeoJSON geometry sent as `intersects` when querying STAC search endpoint."
  })
  intersectsGeometry?: JsonObject;

  @anyTrait({
    name: "Additional Query Parameters",
    description:
      "Additional parameters merged into STAC item requests. In GET mode they are sent as query parameters; in search mode they are added to the POST body."
  })
  additionalQueryParameters?: JsonObject;

  @primitiveTrait({
    type: "number",
    name: "Request Timeout Seconds",
    description: "Timeout in seconds for STAC item API requests."
  })
  requestTimeoutSeconds = 30;

  @primitiveTrait({
    type: "number",
    name: "Request Retry Attempts",
    description:
      "Number of retry attempts for transient STAC item API request failures."
  })
  requestRetryAttempts = 0;

  @primitiveTrait({
    type: "number",
    name: "Request Retry Delay Seconds",
    description: "Delay between retry attempts for STAC item API requests."
  })
  requestRetryDelaySeconds = 1;
}
