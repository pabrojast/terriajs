import objectArrayTrait from "../Decorators/objectArrayTrait";
import primitiveArrayTrait from "../Decorators/primitiveArrayTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import mixTraits from "../mixTraits";
import ModelTraits from "../ModelTraits";
import { traitClass } from "../Trait";
import CatalogMemberTraits from "./CatalogMemberTraits";
import ImageryProviderTraits from "./ImageryProviderTraits";
import LayerOrderingTraits from "./LayerOrderingTraits";
import LegendOwnerTraits from "./LegendOwnerTraits";
import MappableTraits from "./MappableTraits";
import UrlTraits from "./UrlTraits";

export class StacAssetTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Key",
    description: "The asset key/identifier from the STAC item"
  })
  key?: string;

  @primitiveTrait({
    type: "string",
    name: "Title",
    description: "Human readable title for the asset"
  })
  title?: string;

  @primitiveTrait({
    type: "string",
    name: "Media Type",
    description:
      "Media type of the asset (e.g., 'image/tiff', 'application/vnd.stac.geotiff')"
  })
  mediaType?: string;

  @primitiveArrayTrait({
    type: "string",
    name: "Roles",
    description:
      "Semantic roles of the asset (e.g., 'visual', 'data', 'thumbnail')"
  })
  roles?: string[];

  @primitiveTrait({
    type: "string",
    name: "URL",
    description: "Direct URL to the asset"
  })
  url?: string;

  @primitiveTrait({
    type: "boolean",
    name: "Visualizable",
    description: "Whether this asset can be visualized in TerriaJS"
  })
  visualizable?: boolean;
}

export class StacBandTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Name",
    description: "Name of the spectral band"
  })
  name?: string;

  @primitiveTrait({
    type: "string",
    name: "Common Name",
    description:
      "Common name for the band (e.g., 'red', 'green', 'blue', 'nir')"
  })
  commonName?: string;

  @primitiveTrait({
    type: "number",
    name: "Center Wavelength",
    description: "Center wavelength of the band in micrometers"
  })
  centerWavelength?: number;

  @primitiveTrait({
    type: "number",
    name: "Full Width Half Max",
    description: "Full width at half maximum of the band in micrometers"
  })
  fullWidthHalfMax?: number;
}

@traitClass({
  description: `A STAC (SpatioTemporal Asset Catalog) item representing a geospatial asset with associated metadata.
  
  STAC items typically represent satellite imagery, aerial photography, or other Earth observation data with precise spatial and temporal information.`,
  example: {
    type: "stac-item",
    name: "Sentinel-2 L2A Image",
    url: "https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a/items/S2A_MSIL2A_20231201T103251_N0509_R108_T32UPU_20231201T134115",
    preferredAssetTypes: ["visual", "data"],
    bands: [
      {
        name: "B04",
        commonName: "red",
        centerWavelength: 0.665
      },
      {
        name: "B03",
        commonName: "green",
        centerWavelength: 0.56
      },
      {
        name: "B02",
        commonName: "blue",
        centerWavelength: 0.49
      }
    ]
  }
})
export default class StacCatalogItemTraits extends mixTraits(
  ImageryProviderTraits,
  LayerOrderingTraits,
  UrlTraits,
  MappableTraits,
  CatalogMemberTraits,
  LegendOwnerTraits
) {
  @primitiveTrait({
    type: "string",
    name: "STAC Item ID",
    description: "The unique identifier of the STAC item"
  })
  stacItemId?: string;

  @primitiveTrait({
    type: "string",
    name: "Collection ID",
    description: "The collection this STAC item belongs to"
  })
  collectionId?: string;

  @objectArrayTrait({
    type: StacAssetTraits,
    name: "Assets",
    description: "Available assets for this STAC item",
    idProperty: "key"
  })
  assets?: StacAssetTraits[];

  @primitiveArrayTrait({
    type: "string",
    name: "Preferred Asset Types",
    description:
      "Preferred asset types to use for visualization, in order of preference (e.g., ['visual', 'data'])"
  })
  preferredAssetTypes?: string[];

  @primitiveTrait({
    type: "string",
    name: "Selected Asset Key",
    description: "Key of the currently selected asset to display"
  })
  selectedAssetKey?: string;

  @objectArrayTrait({
    type: StacBandTraits,
    name: "Bands",
    description: "Spectral band information for the item",
    idProperty: "name"
  })
  bands?: StacBandTraits[];

  @primitiveTrait({
    type: "string",
    name: "Datetime",
    description: "The datetime of the item in ISO 8601 format"
  })
  datetime?: string;

  @primitiveTrait({
    type: "number",
    name: "Cloud Cover",
    description: "Cloud cover percentage (0-100) for optical imagery"
  })
  cloudCover?: number;

  @primitiveArrayTrait({
    type: "string",
    name: "Instruments",
    description: "List of instruments used to collect this data"
  })
  instruments?: string[];

  @primitiveArrayTrait({
    type: "string",
    name: "Platform",
    description: "Platform(s) used to collect this data (e.g., satellite names)"
  })
  platform?: string[];

  @primitiveTrait({
    type: "number",
    name: "Ground Sample Distance",
    description: "Ground sample distance of the imagery in meters"
  })
  groundSampleDistance?: number;

  @primitiveArrayTrait({
    type: "number",
    name: "Bbox",
    description: "Bounding box of the item [west, south, east, north] in WGS84"
  })
  bbox?: number[];

  @primitiveTrait({
    type: "string",
    name: "Auth Token",
    description: "Authentication token for accessing protected STAC assets"
  })
  authToken?: string;

  @primitiveTrait({
    type: "boolean",
    name: "Use COG Optimization",
    description:
      "Whether to use Cloud Optimized GeoTIFF optimizations when available. Defaults to true.",
    isNullable: false
  })
  useCogOptimization: boolean = true;
}
