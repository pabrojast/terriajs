import { action, computed, makeObservable, observable, runInAction } from "mobx";
import isDefined from "../../../Core/isDefined";
import TerriaError from "../../../Core/TerriaError";
import {
  StacApiClient,
  StacItem,
  StacLink,
  StacSearchRequest,
  StacSearchResponse
} from "./StacApiHelpers";

export interface PaginationState {
  currentPage: number;
  totalPages?: number;
  totalItems?: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextToken?: string;
  prevToken?: string;
}

export interface LoadMoreResult {
  items: StacItem[];
  hasMore: boolean;
  nextToken?: string;
  totalMatched?: number;
}

export class StacPaginationManager {
  @observable
  private _currentItems: StacItem[] = [];

  @observable 
  private _totalMatched?: number;

  @observable
  private _currentPage: number = 1;

  @observable
  private _itemsPerPage: number = 20;

  @observable
  private _nextToken?: string;

  @observable
  private _prevTokens: string[] = [];

  @observable
  private _isLoading: boolean = false;

  @observable
  private _hasReachedEnd: boolean = false;

  private client: StacApiClient;
  private baseSearchRequest: StacSearchRequest;

  constructor(
    client: StacApiClient,
    baseSearchRequest: StacSearchRequest,
    itemsPerPage: number = 20
  ) {
    makeObservable(this);
    this.client = client;
    this.baseSearchRequest = baseSearchRequest;
    this._itemsPerPage = itemsPerPage;
  }

  @computed
  get currentItems(): StacItem[] {
    return [...this._currentItems];
  }

  @computed
  get totalMatched(): number | undefined {
    return this._totalMatched;
  }

  @computed
  get isLoading(): boolean {
    return this._isLoading;
  }

  @computed
  get paginationState(): PaginationState {
    return {
      currentPage: this._currentPage,
      totalPages: this._totalMatched ? Math.ceil(this._totalMatched / this._itemsPerPage) : undefined,
      totalItems: this._totalMatched,
      itemsPerPage: this._itemsPerPage,
      hasNextPage: !this._hasReachedEnd && isDefined(this._nextToken),
      hasPreviousPage: this._currentPage > 1,
      nextToken: this._nextToken,
      prevToken: this._prevTokens[this._prevTokens.length - 2] // Previous token for going back
    };
  }

  @computed
  get canLoadMore(): boolean {
    return !this._isLoading && !this._hasReachedEnd && isDefined(this._nextToken);
  }

  @action
  async loadFirstPage(): Promise<StacSearchResponse> {
    this._isLoading = true;
    
    try {
      const searchRequest: StacSearchRequest = {
        ...this.baseSearchRequest,
        limit: this._itemsPerPage
      };

      const response = await this.client.searchItems(searchRequest);
      
      runInAction(() => {
        this._currentItems = response.features;
        this._totalMatched = response.context?.matched;
        this._currentPage = 1;
        this._nextToken = this.extractNextToken(response.links);
        this._prevTokens = [];
        this._hasReachedEnd = response.features.length < this._itemsPerPage;
      });

      return response;
    } catch (error) {
      throw new TerriaError({
        title: "Failed to load STAC items",
        message: `Error loading first page: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    } finally {
      runInAction(() => {
        this._isLoading = false;
      });
    }
  }

  @action
  async loadNextPage(): Promise<LoadMoreResult> {
    if (!this.canLoadMore) {
      return {
        items: [],
        hasMore: false
      };
    }

    this._isLoading = true;

    try {
      const searchRequest: StacSearchRequest = {
        ...this.baseSearchRequest,
        limit: this._itemsPerPage,
        next: this._nextToken
      };

      const response = await this.client.searchItems(searchRequest);
      
      const newItems = response.features;
      const hasMore = newItems.length === this._itemsPerPage;
      const nextToken = this.extractNextToken(response.links);

      runInAction(() => {
        this._currentItems.push(...newItems);
        
        // Store current token for potential back navigation
        if (this._nextToken) {
          this._prevTokens.push(this._nextToken);
        }
        
        this._nextToken = nextToken;
        this._currentPage += 1;
        this._hasReachedEnd = !hasMore;
        
        // Update total if provided
        if (response.context?.matched) {
          this._totalMatched = response.context.matched;
        }
      });

      return {
        items: newItems,
        hasMore,
        nextToken,
        totalMatched: response.context?.matched
      };
    } catch (error) {
      throw new TerriaError({
        title: "Failed to load more STAC items",
        message: `Error loading next page: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    } finally {
      runInAction(() => {
        this._isLoading = false;
      });
    }
  }

  @action
  async loadPreviousPage(): Promise<LoadMoreResult> {
    if (!this.paginationState.hasPreviousPage || this._prevTokens.length === 0) {
      return {
        items: [],
        hasMore: false
      };
    }

    this._isLoading = true;

    try {
      const prevToken = this._prevTokens.pop();
      
      const searchRequest: StacSearchRequest = {
        ...this.baseSearchRequest,
        limit: this._itemsPerPage,
        next: prevToken
      };

      const response = await this.client.searchItems(searchRequest);
      
      runInAction(() => {
        // For previous page, we typically want to replace current items
        // This depends on your UI needs - you might want to implement differently
        this._currentItems = response.features;
        this._currentPage = Math.max(1, this._currentPage - 1);
        this._nextToken = this.extractNextToken(response.links);
        this._hasReachedEnd = false;
      });

      return {
        items: response.features,
        hasMore: true,
        nextToken: this._nextToken,
        totalMatched: response.context?.matched
      };
    } catch (error) {
      throw new TerriaError({
        title: "Failed to load previous STAC items",
        message: `Error loading previous page: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    } finally {
      runInAction(() => {
        this._isLoading = false;
      });
    }
  }

  @action
  async loadSpecificPage(page: number): Promise<LoadMoreResult> {
    if (page < 1) {
      throw new TerriaError({
        title: "Invalid page number",
        message: "Page number must be greater than 0"
      });
    }

    // For APIs that support offset-based pagination
    const _offset = (page - 1) * this._itemsPerPage;
    
    this._isLoading = true;

    try {
      // Note: This assumes the STAC API supports offset parameter
      // Some STAC APIs might only support token-based pagination
      const searchRequest: StacSearchRequest = {
        ...this.baseSearchRequest,
        limit: this._itemsPerPage,
        // offset: offset // Uncomment if API supports offset
      };

      const response = await this.client.searchItems(searchRequest);
      
      runInAction(() => {
        this._currentItems = response.features;
        this._currentPage = page;
        this._nextToken = this.extractNextToken(response.links);
        this._hasReachedEnd = response.features.length < this._itemsPerPage;
        
        if (response.context?.matched) {
          this._totalMatched = response.context.matched;
        }
      });

      return {
        items: response.features,
        hasMore: !this._hasReachedEnd,
        nextToken: this._nextToken,
        totalMatched: response.context?.matched
      };
    } catch (error) {
      throw new TerriaError({
        title: "Failed to load STAC page",
        message: `Error loading page ${page}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    } finally {
      runInAction(() => {
        this._isLoading = false;
      });
    }
  }

  @action
  setItemsPerPage(itemsPerPage: number): void {
    if (itemsPerPage < 1 || itemsPerPage > 1000) {
      throw new TerriaError({
        title: "Invalid items per page",
        message: "Items per page must be between 1 and 1000"
      });
    }
    
    this._itemsPerPage = itemsPerPage;
  }

  @action
  reset(): void {
    this._currentItems = [];
    this._totalMatched = undefined;
    this._currentPage = 1;
    this._nextToken = undefined;
    this._prevTokens = [];
    this._hasReachedEnd = false;
    this._isLoading = false;
  }

  @action
  updateSearchRequest(newSearchRequest: StacSearchRequest): void {
    this.baseSearchRequest = newSearchRequest;
    this.reset();
  }

  private extractNextToken(links: StacLink[]): string | undefined {
    const nextLink = links.find(link => link.rel === "next");
    if (!nextLink) return undefined;

    try {
      const url = new URL(nextLink.href);
      return url.searchParams.get("next") || url.searchParams.get("token") || undefined;
    } catch {
      // Some APIs might include the token directly in the link structure
      if (nextLink.href.includes("next=") || nextLink.href.includes("token=")) {
        const match = nextLink.href.match(/(?:next|token)=([^&]*)/);
        return match ? decodeURIComponent(match[1]) : undefined;
      }
      return undefined;
    }
  }

  // Utility method to get page summary text
  getPageSummary(): string {
    const state = this.paginationState;
    const startItem = (state.currentPage - 1) * state.itemsPerPage + 1;
    const endItem = Math.min(startItem + this._currentItems.length - 1, state.totalItems || 0);
    
    if (state.totalItems) {
      return `Showing ${startItem}-${endItem} of ${state.totalItems} items`;
    } else {
      return `Showing ${this._currentItems.length} items (page ${state.currentPage})`;
    }
  }

  // Method to check if infinite scroll should trigger load more
  shouldLoadMore(scrollPercentage: number = 0.8): boolean {
    return scrollPercentage >= 0.8 && this.canLoadMore;
  }
}

// Factory function to create pagination manager
export function createStacPaginationManager(
  client: StacApiClient,
  searchRequest: StacSearchRequest,
  itemsPerPage: number = 20
): StacPaginationManager {
  return new StacPaginationManager(client, searchRequest, itemsPerPage);
}