import { computed, makeObservable, observable, action } from "mobx";
import isDefined from "../../../Core/isDefined";
import TerriaError from "../../../Core/TerriaError";
import {
  StacApiClient,
  StacItem,
  StacSearchRequest,
  StacSearchResponse,
  StacSortBy,
  buildCql2Filter,
  formatStacDatetime
} from "./StacApiHelpers";

export interface StacSearchFilter {
  property: string;
  operator: string;
  values: string[];
  enabled?: boolean;
}

export interface StacSearchParams {
  collections?: string[];
  bbox?: [number, number, number, number];
  datetime?: string;
  query?: Record<string, any>;
  filter?: any;
  sortby?: StacSortBy[];
  limit?: number;
  next?: string;
}

export interface StacQueryable {
  type: string;
  title?: string;
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  format?: string;
}

export interface StacQueryables {
  [property: string]: StacQueryable;
}

export class StacSearchManager {
  @observable
  private _searchParams: StacSearchParams = {};

  @observable
  private _queryables: Map<string, StacQueryables> = new Map();

  @observable
  private _searchResults: StacItem[] = [];

  @observable
  private _isSearching: boolean = false;

  @observable
  private _totalMatched?: number;

  @observable
  private _nextToken?: string;

  @observable
  private _searchFilters: StacSearchFilter[] = [];

  private client: StacApiClient;

  constructor(
    baseUrl: string,
    authToken?: string
  ) {
    makeObservable(this);
    this.client = new StacApiClient(baseUrl, authToken);
  }

  @computed
  get searchParams(): StacSearchParams {
    return { ...this._searchParams };
  }

  @computed
  get searchResults(): StacItem[] {
    return [...this._searchResults];
  }

  @computed
  get isSearching(): boolean {
    return this._isSearching;
  }

  @computed
  get totalMatched(): number | undefined {
    return this._totalMatched;
  }

  @computed
  get hasMoreResults(): boolean {
    return isDefined(this._nextToken);
  }

  @computed
  get searchFilters(): StacSearchFilter[] {
    return [...this._searchFilters];
  }

  @computed
  get enabledFilters(): StacSearchFilter[] {
    return this._searchFilters.filter(f => f.enabled !== false);
  }

  @action
  setSearchParam<K extends keyof StacSearchParams>(
    key: K,
    value: StacSearchParams[K]
  ): void {
    this._searchParams[key] = value;
  }

  @action
  addSearchFilter(filter: StacSearchFilter): void {
    // Remove existing filter for the same property
    this._searchFilters = this._searchFilters.filter(
      f => f.property !== filter.property
    );
    this._searchFilters.push({ ...filter, enabled: true });
  }

  @action
  removeSearchFilter(property: string): void {
    this._searchFilters = this._searchFilters.filter(
      f => f.property !== property
    );
  }

  @action
  toggleFilter(property: string): void {
    const filter = this._searchFilters.find(f => f.property === property);
    if (filter) {
      filter.enabled = !filter.enabled;
    }
  }

  @action
  clearFilters(): void {
    this._searchFilters = [];
  }

  @action
  setSpatialExtent(bbox: [number, number, number, number] | undefined): void {
    this.setSearchParam("bbox", bbox);
  }

  @action
  setTemporalExtent(start?: string, end?: string): void {
    const datetime = formatStacDatetime(start, end);
    this.setSearchParam("datetime", datetime);
  }

  @action
  setCollections(collections: string[]): void {
    this.setSearchParam("collections", collections);
  }

  @action
  setSorting(sortby: StacSortBy[]): void {
    this.setSearchParam("sortby", sortby);
  }

  @action
  setLimit(limit: number): void {
    this.setSearchParam("limit", limit);
  }

  async loadQueryables(collectionId: string): Promise<StacQueryables> {
    try {
      const queryablesUrl = `collections/${collectionId}/queryables`;
      const response = await this.client.fetchJson<any>(queryablesUrl);
      
      const queryables: StacQueryables = {};
      if (response.properties) {
        Object.entries(response.properties).forEach(([key, value]) => {
          queryables[key] = value as StacQueryable;
        });
      }

      this._queryables.set(collectionId, queryables);
      return queryables;
    } catch (error) {
      console.warn(`Failed to load queryables for collection ${collectionId}:`, error);
      return {};
    }
  }

  getQueryables(collectionId?: string): StacQueryables {
    if (collectionId && this._queryables.has(collectionId)) {
      return this._queryables.get(collectionId) || {};
    }

    // Return merged queryables from all collections
    const merged: StacQueryables = {};
    this._queryables.forEach(queryables => {
      Object.assign(merged, queryables);
    });
    return merged;
  }

  @action
  async search(resetResults: boolean = true): Promise<StacSearchResponse> {
    this._isSearching = true;

    try {
      const searchRequest: StacSearchRequest = { ...this._searchParams };

      // Add filters
      const enabledFilters = this.enabledFilters;
      if (enabledFilters.length > 0) {
        const cql2Filter = buildCql2Filter(enabledFilters);
        if (cql2Filter) {
          searchRequest.filter = cql2Filter;
        }
      }

      const response = await this.client.searchItems(searchRequest);

      if (resetResults) {
        this._searchResults = response.features;
      } else {
        this._searchResults.push(...response.features);
      }

      this._totalMatched = response.context?.matched;
      this._nextToken = this.extractNextToken(response.links);

      return response;
    } catch (error) {
      throw new TerriaError({
        title: "STAC search failed",
        message: `Error searching STAC items: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    } finally {
      this._isSearching = false;
    }
  }

  @action
  async loadMore(): Promise<StacSearchResponse | undefined> {
    if (!this.hasMoreResults || this.isSearching) {
      return undefined;
    }

    this.setSearchParam("next", this._nextToken);
    return this.search(false);
  }

  @action
  reset(): void {
    this._searchParams = {};
    this._searchResults = [];
    this._totalMatched = undefined;
    this._nextToken = undefined;
    this._searchFilters = [];
  }

  private extractNextToken(links: any[]): string | undefined {
    const nextLink = links.find(link => link.rel === "next");
    if (!nextLink) return undefined;

    // Try to extract token from URL
    try {
      const url = new URL(nextLink.href);
      return url.searchParams.get("next") || undefined;
    } catch {
      return undefined;
    }
  }

  // Utility methods for building common filters
  createCloudCoverFilter(maxCloudCover: number): StacSearchFilter {
    return {
      property: "eo:cloud_cover",
      operator: "lt",
      values: [maxCloudCover.toString()]
    };
  }

  createInstrumentFilter(instruments: string[]): StacSearchFilter {
    return {
      property: "instruments",
      operator: "in",
      values: instruments
    };
  }

  createPlatformFilter(platforms: string[]): StacSearchFilter {
    return {
      property: "platform",
      operator: "in",
      values: platforms
    };
  }

  createDatetimeFilter(operator: string, datetime: string): StacSearchFilter {
    return {
      property: "datetime",
      operator,
      values: [datetime]
    };
  }

  createGsdFilter(operator: string, gsd: number): StacSearchFilter {
    return {
      property: "gsd",
      operator,
      values: [gsd.toString()]
    };
  }

  // Predefined filter sets for common use cases
  getClearSkyFilters(maxCloudCover: number = 20): StacSearchFilter[] {
    return [
      this.createCloudCoverFilter(maxCloudCover)
    ];
  }

  getSentinel2Filters(maxCloudCover: number = 15): StacSearchFilter[] {
    return [
      this.createInstrumentFilter(["MSI"]),
      this.createPlatformFilter(["Sentinel-2A", "Sentinel-2B"]),
      this.createCloudCoverFilter(maxCloudCover)
    ];
  }

  getSentinel1Filters(orbitState?: "ascending" | "descending"): StacSearchFilter[] {
    const filters = [
      this.createInstrumentFilter(["SAR"]),
      this.createPlatformFilter(["Sentinel-1A", "Sentinel-1B"])
    ];

    if (orbitState) {
      filters.push({
        property: "sat:orbit_state",
        operator: "eq",
        values: [orbitState]
      });
    }

    return filters;
  }

  getHighResolutionFilters(maxGsd: number = 10): StacSearchFilter[] {
    return [
      this.createGsdFilter("lte", maxGsd)
    ];
  }

  getRecentDataFilters(daysPast: number = 30): StacSearchFilter[] {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysPast);
    
    return [
      this.createDatetimeFilter("gte", pastDate.toISOString())
    ];
  }
}