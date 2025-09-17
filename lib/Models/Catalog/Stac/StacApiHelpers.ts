import loadJson from "../../../Core/loadJson";
import TerriaError from "../../../Core/TerriaError";

export interface StacCatalog {
  type: "Catalog";
  stac_version: string;
  id: string;
  title?: string;
  description?: string;
  links: StacLink[];
  stac_extensions?: string[];
}

export interface StacCollection {
  type: "Collection";
  stac_version: string;
  id: string;
  title?: string;
  description?: string;
  keywords?: string[];
  license: string;
  providers?: StacProvider[];
  extent: StacExtent;
  links: StacLink[];
  assets?: Record<string, StacAsset>;
  summaries?: Record<string, any>;
  stac_extensions?: string[];
}

export interface StacItem {
  type: "Feature";
  stac_version: string;
  id: string;
  collection?: string;
  geometry: GeoJSON.Geometry;
  bbox?: [number, number, number, number];
  properties: StacItemProperties;
  assets: Record<string, StacAsset>;
  links: StacLink[];
  stac_extensions?: string[];
}

export interface StacItemProperties {
  datetime?: string | null;
  start_datetime?: string;
  end_datetime?: string;
  title?: string;
  description?: string;
  instruments?: string[];
  platform?: string[];
  mission?: string[];
  constellation?: string[];
  "eo:cloud_cover"?: number;
  "eo:bands"?: StacBand[];
  "sat:orbit_state"?: string;
  "sat:relative_orbit"?: number;
  "view:sun_azimuth"?: number;
  "view:sun_elevation"?: number;
  gsd?: number;
  [key: string]: any;
}

export interface StacAsset {
  href: string;
  type?: string;
  title?: string;
  description?: string;
  roles?: string[];
  "file:size"?: number;
  "eo:bands"?: number[];
  "raster:bands"?: StacRasterBand[];
  [key: string]: any;
}

export interface StacBand {
  name: string;
  common_name?: string;
  center_wavelength?: number;
  full_width_half_max?: number;
}

export interface StacRasterBand {
  nodata?: number;
  data_type?: string;
  bits_per_sample?: number;
  spatial_resolution?: number;
  scale?: number;
  offset?: number;
  histogram?: {
    count: number;
    min: number;
    max: number;
    buckets: number[];
  };
  statistics?: {
    min: number;
    max: number;
    mean: number;
    stddev: number;
    valid_percent: number;
  };
}

export interface StacLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

export interface StacProvider {
  name: string;
  description?: string;
  roles?: string[];
  url?: string;
}

export interface StacExtent {
  spatial: {
    bbox: number[][];
  };
  temporal: {
    interval: (string | null)[][];
  };
}

export interface StacSearchRequest {
  collections?: string[];
  bbox?: [number, number, number, number];
  datetime?: string;
  intersects?: GeoJSON.Geometry;
  query?: Record<string, any>;
  filter?: any;
  sortby?: StacSortBy[];
  fields?: StacFields;
  limit?: number;
  next?: string;
}

export interface StacSortBy {
  field: string;
  direction: "asc" | "desc";
}

export interface StacFields {
  include?: string[];
  exclude?: string[];
}

export interface StacSearchResponse {
  type: "FeatureCollection";
  features: StacItem[];
  links: StacLink[];
  context?: {
    page?: number;
    limit?: number;
    matched?: number;
    returned: number;
  };
}

export interface StacCollectionsResponse {
  collections: StacCollection[];
  links: StacLink[];
}

export class StacApiClient {
  constructor(
    private baseUrl: string,
    private authToken?: string
  ) {
    // Ensure base URL ends with /
    if (!this.baseUrl.endsWith("/")) {
      this.baseUrl += "/";
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    try {
      return await loadJson(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options?.headers
        }
      });
    } catch (error) {
      throw new TerriaError({
        title: "Failed to fetch from STAC API",
        message: `Error fetching ${url}: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  }

  async getCatalog(): Promise<StacCatalog> {
    return this.fetchJson<StacCatalog>(this.baseUrl);
  }

  async getCollections(): Promise<StacCollectionsResponse> {
    return this.fetchJson<StacCollectionsResponse>(`${this.baseUrl}collections`);
  }

  async getCollection(collectionId: string): Promise<StacCollection> {
    return this.fetchJson<StacCollection>(`${this.baseUrl}collections/${collectionId}`);
  }

  async getItem(collectionId: string, itemId: string): Promise<StacItem> {
    return this.fetchJson<StacItem>(`${this.baseUrl}collections/${collectionId}/items/${itemId}`);
  }

  async searchItems(searchRequest: StacSearchRequest): Promise<StacSearchResponse> {
    return this.fetchJson<StacSearchResponse>(`${this.baseUrl}search`, {
      method: "POST",
      body: JSON.stringify(searchRequest)
    });
  }

  async getCollectionItems(
    collectionId: string, 
    params?: {
      limit?: number;
      bbox?: [number, number, number, number];
      datetime?: string;
      next?: string;
    }
  ): Promise<StacSearchResponse> {
    const searchParams = new URLSearchParams();
    
    if (params?.limit) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.bbox) {
      searchParams.set("bbox", params.bbox.join(","));
    }
    if (params?.datetime) {
      searchParams.set("datetime", params.datetime);
    }
    if (params?.next) {
      searchParams.set("next", params.next);
    }

    const url = `${this.baseUrl}collections/${collectionId}/items${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    return this.fetchJson<StacSearchResponse>(url);
  }
}

export function isVisualizableAsset(asset: StacAsset): boolean {
  // Check if asset has roles that indicate it's visualizable
  if (asset.roles) {
    const visualRoles = ["visual", "overview", "data", "thumbnail"];
    if (asset.roles.some(role => visualRoles.includes(role))) {
      return true;
    }
  }

  // Check media type
  if (asset.type) {
    const visualTypes = [
      "image/tiff",
      "image/geotiff", 
      "application/vnd.stac.geotiff",
      "image/cog",
      "image/png",
      "image/jpeg",
      "image/jp2"
    ];
    return visualTypes.includes(asset.type);
  }

  // Default to false if we can't determine
  return false;
}

export function getPreferredAsset(
  assets: Record<string, StacAsset>,
  preferredTypes: string[] = ["visual", "data", "overview"]
): { key: string; asset: StacAsset } | undefined {
  // First, try to find assets by preferred roles
  for (const preferredType of preferredTypes) {
    for (const [key, asset] of Object.entries(assets)) {
      if (asset.roles?.includes(preferredType) && isVisualizableAsset(asset)) {
        return { key, asset };
      }
    }
  }

  // If no preferred roles found, return first visualizable asset
  for (const [key, asset] of Object.entries(assets)) {
    if (isVisualizableAsset(asset)) {
      return { key, asset };
    }
  }

  return undefined;
}

export function buildCql2Filter(filters: Array<{ property: string; operator: string; values: string[] }>): any {
  if (filters.length === 0) return undefined;

  const conditions = filters.map(filter => {
    const { property, operator, values } = filter;
    
    switch (operator.toLowerCase()) {
      case "eq":
        return { "=": [{ "property": property }, values[0]] };
      case "lt":
        return { "<": [{ "property": property }, parseFloat(values[0])] };
      case "lte":
        return { "<=": [{ "property": property }, parseFloat(values[0])] };
      case "gt":
        return { ">": [{ "property": property }, parseFloat(values[0])] };
      case "gte":
        return { ">=": [{ "property": property }, parseFloat(values[0])] };
      case "in":
        return { "in": [{ "property": property }, values] };
      case "like":
        return { "like": [{ "property": property }, values[0]] };
      default:
        throw new TerriaError({
          title: "Unsupported CQL2 operator",
          message: `The operator "${operator}" is not supported`
        });
    }
  });

  return conditions.length === 1 ? conditions[0] : { "and": conditions };
}

export function formatStacDatetime(start?: string, end?: string): string | undefined {
  if (!start && !end) return undefined;
  
  if (start && end) {
    return `${start}/${end}`;
  }
  
  if (start) {
    return `${start}/..`;
  }
  
  if (end) {
    return `../${end}`;
  }

  return undefined;
}