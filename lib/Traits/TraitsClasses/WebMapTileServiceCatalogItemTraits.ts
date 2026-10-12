import { JsonObject } from "../../Core/Json";
import anyTrait from "../Decorators/anyTrait";
import objectArrayTrait from "../Decorators/objectArrayTrait";
import objectTrait from "../Decorators/objectTrait";
import primitiveArrayTrait from "../Decorators/primitiveArrayTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import mixTraits from "../mixTraits";
import ModelTraits from "../ModelTraits";
import { traitClass } from "../Trait";
import CatalogMemberTraits from "./CatalogMemberTraits";
import DiscretelyTimeVaryingTraits from "./DiscretelyTimeVaryingTraits";
import GetCapabilitiesTraits from "./GetCapabilitiesTraits";
import ImageryProviderTraits from "./ImageryProviderTraits";
import LayerOrderingTraits from "./LayerOrderingTraits";
import LegendOwnerTraits from "./LegendOwnerTraits";
import LegendTraits from "./LegendTraits";
import MappableTraits from "./MappableTraits";
import UrlTraits from "./UrlTraits";
import { GetFeatureInfoFormat as WebMapServiceGetFeatureInfoFormat } from "./WebMapServiceCatalogItemTraits";

export class WebMapTileServiceAvailableStyleTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Style Identifier",
    description: "The identifier of the style."
  })
  identifier?: string;

  @primitiveTrait({
    type: "string",
    name: "Title",
    description: "The title of the style."
  })
  title?: string;

  @primitiveTrait({
    type: "string",
    name: "Abstract",
    description: "The abstract describing the style."
  })
  abstract?: string;

  @objectTrait({
    type: LegendTraits,
    name: "Style Name",
    description: "The name of the style."
  })
  legend?: LegendTraits;

  @primitiveTrait({
    type: "string",
    name: "Is Default",
    description: "True if this Style is default; otherwise, false."
  })
  isDefault: boolean = false;
}

export class WebMapTileServiceAvailableLayerStylesTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Layer Name",
    description: "The name of the layer for which styles are available."
  })
  layerName?: string;

  @objectArrayTrait({
    type: WebMapTileServiceAvailableStyleTraits,
    name: "Styles",
    description: "The styles available for this layer.",
    idProperty: "identifier"
  })
  styles?: WebMapTileServiceAvailableStyleTraits[];
}

export class WebMapTileServiceAvailableDimensionTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Dimension Name",
    description: "The name of the dimension."
  })
  name?: string;

  @primitiveArrayTrait({
    type: "string",
    name: "Dimension values",
    description: "Possible dimension values."
  })
  values?: string[];

  @primitiveTrait({
    type: "string",
    name: "Units",
    description: "The units of the dimension."
  })
  units?: string;

  @primitiveTrait({
    type: "string",
    name: "Unit Symbol",
    description: "The symbol used for the dimension units."
  })
  unitSymbol?: string;

  @primitiveTrait({
    type: "string",
    name: "Default",
    description: "The default value for the dimension."
  })
  default?: string;

  @primitiveTrait({
    type: "boolean",
    name: "Multiple Values",
    description: "Whether the dimension supports multiple selected values."
  })
  multipleValues?: boolean;

  @primitiveTrait({
    type: "boolean",
    name: "Nearest Value",
    description:
      "Whether the service supports nearest value selection for this dimension."
  })
  nearestValue?: boolean;
}

export class WebMapTileServiceAvailableLayerDimensionsTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Layer Name",
    description: "The name of the layer for which dimensions are available."
  })
  layerName?: string;

  @objectArrayTrait({
    type: WebMapTileServiceAvailableDimensionTraits,
    name: "Dimensions",
    description: "The dimensions available for this layer.",
    idProperty: "name"
  })
  dimensions?: WebMapTileServiceAvailableDimensionTraits[];
}

export class FeatureInfoRequestTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "URL template",
    description:
      "Template for the feature info request URL. Supports double-curly tokens such as {{longitude}} and {{latitude}}."
  })
  url?: string;

  @primitiveTrait({
    type: "string",
    name: "HTTP method",
    description:
      "HTTP method to use (GET, POST, PUT, PATCH, DELETE). Defaults to GET."
  })
  method?: string;

  @anyTrait({
    name: "Headers",
    description: "Additional headers to send with the request."
  })
  headers?: JsonObject;

  @primitiveTrait({
    type: "string",
    name: "Body template",
    description:
      "Template for the request body. Supports the same tokens as the URL template."
  })
  body?: string;

  @primitiveTrait({
    type: "boolean",
    name: "Auto JSON content type",
    description:
      "When true (default), automatically adds Content-Type: application/json if the method sends a body and no Content-Type header is supplied."
  })
  autoSetJsonContentType: boolean = true;

  @primitiveTrait({
    type: "string",
    name: "Response type",
    description:
      "Optional override for the expected response type (json, text, html, xml). Defaults to the GetFeatureInfo format."
  })
  responseType?: "json" | "text" | "html" | "xml";
}

@traitClass({
  description: `Creates a single item in the catalog from a url that points to a wmts service.`,
  example: {
    type: "wmts",
    id: "a unique id for wmts example",
    name: "wmts example",
    url: "https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/WMTS/1.0.0/WMTSCapabilities.xml",
    layer: "Reference_World_Boundaries_and_Places",
    opacity: 1
  }
})
export default class WebMapTileServiceCatalogItemTraits extends mixTraits(
  LayerOrderingTraits,
  GetCapabilitiesTraits,
  ImageryProviderTraits,
  UrlTraits,
  DiscretelyTimeVaryingTraits,
  MappableTraits,
  CatalogMemberTraits,
  LegendOwnerTraits
) {
  @primitiveTrait({
    type: "string",
    name: "Is GeoServer",
    description: "True if this WMS is a GeoServer; otherwise, false."
  })
  isGeoServer: boolean = false;

  @primitiveTrait({
    type: "string",
    name: "Layer",
    description: "The layer to display."
  })
  layer?: string;

  @primitiveTrait({
    type: "string",
    name: "Style",
    description: "The style to use with `Layer`."
  })
  style?: string;

  @objectArrayTrait({
    type: WebMapTileServiceAvailableLayerStylesTraits,
    name: "Available Styles",
    description: "The available styles.",
    idProperty: "layerName"
  })
  availableStyles?: WebMapTileServiceAvailableLayerStylesTraits[];

  @primitiveTrait({
    type: "number",
    name: "Maximum Refresh Intervals",
    description:
      "The maximum number of discrete times that can be created by a single date range when specified as time/time/periodicity."
  })
  maxRefreshIntervals: number = 1000;

  @primitiveTrait({
    type: "boolean",
    name: "Disable dimension selectors",
    description: "When true, disables the dimension selectors in the workbench."
  })
  disableDimensionSelectors: boolean = false;

  @anyTrait({
    name: "Dimensions",
    description:
      "Dimension parameters used to request the layer along one or more axes (excluding time). Do not include `dim_` prefixes."
  })
  dimensions?: { [key: string]: string };

  @objectArrayTrait({
    type: WebMapTileServiceAvailableLayerDimensionsTraits,
    name: "Available Dimensions",
    description:
      "Dimensions available for this layer as reported by the service.",
    idProperty: "layerName"
  })
  availableDimensions?: WebMapTileServiceAvailableLayerDimensionsTraits[];

  @anyTrait({
    name: "Parameters",
    description:
      "Additional parameters to pass to the WMTS server when requesting tiles."
  })
  parameters?: JsonObject;

  @objectTrait({
    type: WebMapServiceGetFeatureInfoFormat,
    name: "GetFeatureInfo format",
    description:
      "Format parameter used for WMTS GetFeatureInfo requests. Defaults to JSON."
  })
  getFeatureInfoFormat?: WebMapServiceGetFeatureInfoFormat;

  @primitiveTrait({
    type: "string",
    name: "GetFeatureInfo URL",
    description: "Overrides the URL used for WMTS GetFeatureInfo requests."
  })
  getFeatureInfoUrl?: string;

  @anyTrait({
    name: "GetFeatureInfo parameters",
    description:
      "Additional query parameters appended to WMTS GetFeatureInfo requests."
  })
  getFeatureInfoParameters?: JsonObject;

  @objectTrait({
    type: FeatureInfoRequestTraits,
    name: "Custom feature info request",
    description:
      "Overrides the default WMTS GetFeatureInfo request with a custom HTTP request. Templates support {{token}} placeholders such as {{longitude}}, {{latitude}}, and {{layer}}."
  })
  featureInfoRequest?: FeatureInfoRequestTraits;
}
