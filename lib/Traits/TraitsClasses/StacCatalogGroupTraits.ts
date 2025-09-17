import objectArrayTrait from "../Decorators/objectArrayTrait";
import primitiveArrayTrait from "../Decorators/primitiveArrayTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import mixTraits from "../mixTraits";
import { traitClass } from "../Trait";
import CatalogMemberTraits from "./CatalogMemberTraits";
import GroupTraits from "./GroupTraits";
import LegendOwnerTraits from "./LegendOwnerTraits";
import UrlTraits from "./UrlTraits";

export class StacSearchFilterTraits extends mixTraits() {
  @primitiveTrait({
    type: "string",
    name: "Property",
    description: "The STAC property to filter on (e.g., 'eo:cloud_cover', 'datetime', 'instruments')"
  })
  property?: string;

  @primitiveTrait({
    type: "string", 
    name: "Operator",
    description: "The comparison operator (eq, lt, lte, gt, gte, in, like, etc.)"
  })
  operator?: string;

  @primitiveArrayTrait({
    type: "string",
    name: "Values", 
    description: "The values to compare against. Multiple values are used with 'in' operator"
  })
  values?: string[];
}

@traitClass({
  description: `Creates a group from a STAC (SpatioTemporal Asset Catalog) API endpoint.
  
  This allows browsing collections and items from STAC catalogs like Copernicus Data Space.
  
  <strong>Note:</strong>
  <br>STAC is a specification for describing geospatial information, commonly used for satellite imagery and Earth observation data.</br>`,
  example: {
    type: "stac-group",
    name: "Copernicus Data Space STAC",
    url: "https://stac.dataspace.copernicus.eu/v1/",
    collections: ["sentinel-2-l2a", "sentinel-1-grd"],
    searchFilters: [
      {
        property: "eo:cloud_cover",
        operator: "lt",
        values: ["20"]
      }
    ],
    spatialExtent: [-180, -90, 180, 90],
    temporalExtent: ["2023-01-01T00:00:00Z", "2023-12-31T23:59:59Z"]
  }
})
export default class StacCatalogGroupTraits extends mixTraits(
  GroupTraits,
  UrlTraits,
  CatalogMemberTraits,
  LegendOwnerTraits
) {
  @primitiveArrayTrait({
    type: "string",
    name: "Collections",
    description: "Array of collection IDs to include. If not specified, all available collections will be loaded."
  })
  collections?: string[];

  @objectArrayTrait({
    type: StacSearchFilterTraits,
    name: "Search Filters",
    description: "Filters to apply when searching STAC items. These will be converted to CQL2 queries.",
    idProperty: "property"
  })
  searchFilters?: StacSearchFilterTraits[];

  @primitiveArrayTrait({
    type: "number",
    name: "Spatial Extent",
    description: "Bounding box to limit search results [west, south, east, north] in WGS84 coordinates"
  })
  spatialExtent?: number[];

  @primitiveArrayTrait({
    type: "string", 
    name: "Temporal Extent",
    description: "Time range to limit search results. Array with start and end datetime in ISO 8601 format"
  })
  temporalExtent?: string[];

  @primitiveTrait({
    type: "number",
    name: "Max Items",
    description: "Maximum number of items to load per collection. Defaults to 100.",
    isNullable: false
  })
  maxItems: number = 100;

  @primitiveTrait({
    type: "boolean",
    name: "Group By Collection",
    description: "Whether to organize items into subgroups by collection. Defaults to true.",
    isNullable: false
  })
  groupByCollection: boolean = true;

  @primitiveTrait({
    type: "string",
    name: "Auth Token",
    description: "Authentication token for accessing protected STAC catalogs. This will be sent as Bearer token."
  })
  authToken?: string;

  @primitiveArrayTrait({
    type: "string",
    name: "Asset Types",
    description: "Filter items by asset types (e.g., 'visual', 'thumbnail', 'data'). If not specified, all assets will be considered."
  })
  assetTypes?: string[];

  @primitiveTrait({
    type: "boolean",
    name: "Auto Load Items",
    description: "Whether to automatically load items when opening collections. If false, items will only load when explicitly requested.",
    isNullable: false
  })
  autoLoadItems: boolean = true;

  @primitiveTrait({
    type: "string",
    name: "Sort Field",
    description: "Field to sort results by (e.g., 'datetime', 'title'). Prepend with '-' for descending order."
  })
  sortField?: string;
}