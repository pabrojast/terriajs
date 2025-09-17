/**
 * STAC Share Manager
 * 
 * Handles sharing of STAC catalog configurations, search states, and item selections
 * via permalinks and shareable URLs
 */

import { action, computed, makeObservable, observable } from "mobx";
import i18next from "i18next";
import TerriaError from "../../../Core/TerriaError";
import isDefined from "../../../Core/isDefined";
import StacCatalogGroup from "./StacCatalogGroup";
import StacCatalogItem from "./StacCatalogItem";
import { StacSearchParams } from "./StacSearchManager";

export interface ShareableStacState {
  // Catalog configuration
  catalogUrl: string;
  catalogTitle?: string;
  catalogType: "collection" | "catalog" | "item";
  
  // Current navigation state
  currentCollectionId?: string;
  currentItemId?: string;
  navigationPath?: string[];
  
  // Search parameters
  searchParameters?: StacSearchParams;
  
  // Spatial/temporal context
  bbox?: [number, number, number, number];
  datetime?: string;
  
  // Item selection and visualization
  selectedAssets?: string[];
  visualizationParameters?: {
    bands?: string[];
    colormap?: string;
    rescale?: [number, number];
    format?: string;
  };
  
  // Metadata
  shareId?: string;
  timestamp: number;
  version: string;
}

export interface ShareOptions {
  includeSearch?: boolean;
  includeVisualization?: boolean;
  includeNavigation?: boolean;
  compressUrl?: boolean;
  expirationDays?: number;
}

export interface ShareResult {
  shareUrl: string;
  shareId: string;
  shortUrl?: string;
  expiresAt?: Date;
}

export class StacShareManager {
  @observable
  private _sharedStates: Map<string, ShareableStacState> = new Map();

  @observable
  private _isSharing: boolean = false;

  @observable
  private _lastSharedUrl?: string;

  private readonly urlPrefix = "stac-share";
  private readonly storageKey = "terriajs_stac_shares";
  private readonly maxStoredShares = 50;

  constructor() {
    makeObservable(this);
    this.loadStoredShares();
  }

  @computed
  get isSharing(): boolean {
    return this._isSharing;
  }

  @computed
  get lastSharedUrl(): string | undefined {
    return this._lastSharedUrl;
  }

  @computed
  get sharedStates(): ShareableStacState[] {
    return Array.from(this._sharedStates.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  @action
  async shareStacCatalog(
    catalogGroup: StacCatalogGroup,
    options: ShareOptions = {}
  ): Promise<ShareResult> {
    this._isSharing = true;

    try {
      const state = this.extractCatalogState(catalogGroup, options);
      const shareId = this.generateShareId();
      const shareUrl = this.generateShareUrl(state, shareId);

      state.shareId = shareId;
      this._sharedStates.set(shareId, state);
      
      this.saveSharedStates();
      this._lastSharedUrl = shareUrl;

      let shortUrl: string | undefined;
      if (options.compressUrl) {
        shortUrl = await this.createShortUrl(shareUrl);
      }

      return {
        shareUrl,
        shareId,
        shortUrl,
        expiresAt: options.expirationDays ? 
          new Date(Date.now() + options.expirationDays * 24 * 60 * 60 * 1000) : undefined
      };
    } catch (error) {
      throw new TerriaError({
        title: i18next.t("models.stacShare.shareError"),
        message: error instanceof Error ? error.message : "Failed to create share"
      });
    } finally {
      this._isSharing = false;
    }
  }

  @action
  async shareStacItem(
    catalogItem: StacCatalogItem,
    options: ShareOptions = {}
  ): Promise<ShareResult> {
    this._isSharing = true;

    try {
      const state = this.extractItemState(catalogItem, options);
      const shareId = this.generateShareId();
      const shareUrl = this.generateShareUrl(state, shareId);

      state.shareId = shareId;
      this._sharedStates.set(shareId, state);
      
      this.saveSharedStates();
      this._lastSharedUrl = shareUrl;

      let shortUrl: string | undefined;
      if (options.compressUrl) {
        shortUrl = await this.createShortUrl(shareUrl);
      }

      return {
        shareUrl,
        shareId,
        shortUrl,
        expiresAt: options.expirationDays ? 
          new Date(Date.now() + options.expirationDays * 24 * 60 * 60 * 1000) : undefined
      };
    } catch (error) {
      throw new TerriaError({
        title: i18next.t("models.stacShare.shareError"),
        message: error instanceof Error ? error.message : "Failed to create share"
      });
    } finally {
      this._isSharing = false;
    }
  }

  @action
  async loadSharedState(shareId: string): Promise<ShareableStacState> {
    const state = this._sharedStates.get(shareId);
    
    if (!state) {
      // Try to load from URL parameters
      const urlState = this.parseShareUrl(window.location.href);
      if (urlState && urlState.shareId === shareId) {
        this._sharedStates.set(shareId, urlState);
        return urlState;
      }
      
      throw new TerriaError({
        title: i18next.t("models.stacShare.shareNotFound"),
        message: i18next.t("models.stacShare.shareNotFoundMessage", { shareId })
      });
    }

    return state;
  }

  @action
  applySharedState(
    state: ShareableStacState,
    targetCatalog: StacCatalogGroup | StacCatalogItem
  ): void {
    try {
      if (targetCatalog instanceof StacCatalogGroup) {
        this.applyGroupState(state, targetCatalog);
      } else if (targetCatalog instanceof StacCatalogItem) {
        this.applyItemState(state, targetCatalog);
      }
    } catch (error) {
      throw new TerriaError({
        title: i18next.t("models.stacShare.applyError"),
        message: error instanceof Error ? error.message : "Failed to apply shared state"
      });
    }
  }

  private extractCatalogState(
    catalogGroup: StacCatalogGroup,
    options: ShareOptions
  ): ShareableStacState {
    const state: ShareableStacState = {
      catalogUrl: catalogGroup.url || "",
      catalogTitle: catalogGroup.name,
      catalogType: "catalog",
      timestamp: Date.now(),
      version: "1.0.0"
    };

    if (options.includeSearch && catalogGroup.searchManager) {
      const params = catalogGroup.searchManager.searchParameters;
      state.searchParameters = {
        bbox: params.bbox && params.bbox.length === 4 ? [...params.bbox] as [number, number, number, number] : undefined,
        datetime: params.datetime
      };
    }

    if (options.includeNavigation && catalogGroup.linkManager) {
      const currentResource = catalogGroup.linkManager.currentResource;
      if (currentResource) {
        state.currentCollectionId = (currentResource as any).id;
        state.navigationPath = catalogGroup.linkManager.breadcrumbPath.map((r: any) => r.id);
      }
    }

    // Include current spatial/temporal extent
    if (catalogGroup.searchManager) {
      const params = catalogGroup.searchManager.searchParameters;
      if (params.bbox) {
        state.bbox = [...params.bbox] as [number, number, number, number];
      }
      if (params.datetime) {
        state.datetime = params.datetime;
      }
    }

    return state;
  }

  private extractItemState(
    catalogItem: StacCatalogItem,
    options: ShareOptions
  ): ShareableStacState {
    const state: ShareableStacState = {
      catalogUrl: catalogItem.url || "",
      catalogTitle: catalogItem.name,
      catalogType: "item",
      currentItemId: catalogItem.stacItemId,
      timestamp: Date.now(),
      version: "1.0.0"
    };

    if (options.includeVisualization) {
      state.selectedAssets = catalogItem.selectedAsset ? [catalogItem.selectedAsset.key] : undefined;
      
      if (catalogItem.bandSelector) {
        state.visualizationParameters = {
          bands: [],  // TODO: implement selectedBands property
          colormap: undefined,  // TODO: implement colormap property
          rescale: undefined,  // TODO: implement rescaleRange property
          format: undefined  // TODO: implement preferredFormat property
        };
      }
    }

    return state;
  }

  private applyGroupState(state: ShareableStacState, catalogGroup: StacCatalogGroup): void {
    // Apply search parameters
    if (state.searchParameters && catalogGroup.searchManager) {
      catalogGroup.searchManager.updateSearchParameters(state.searchParameters);
    }

    // Apply spatial/temporal context
    if (state.bbox && catalogGroup.searchManager) {
      catalogGroup.searchManager.setSpatialExtent(state.bbox);
    }

    if (state.datetime && catalogGroup.searchManager) {
      catalogGroup.searchManager.setTemporalExtent([state.datetime]);
    }

    // Navigate to specific collection/item
    if (state.currentCollectionId && catalogGroup.linkManager) {
      catalogGroup.linkManager.navigateToResource(state.currentCollectionId)
        .catch((error: any) => console.warn("Failed to navigate to shared resource:", error));
    }
  }

  private applyItemState(state: ShareableStacState, catalogItem: StacCatalogItem): void {
    // Apply asset selection
    if (state.selectedAssets) {
      catalogItem.setSelectedAssets(state.selectedAssets);
    }

    // Apply visualization parameters
    if (state.visualizationParameters && catalogItem.bandSelector) {
      const viz = state.visualizationParameters;
      
      if (viz.bands) {
        catalogItem.bandSelector.setSelectedBands(viz.bands);
      }
      
      if (viz.colormap) {
        catalogItem.bandSelector.setColormap(viz.colormap);
      }
      
      if (viz.rescale) {
        catalogItem.bandSelector.setRescaleRange({
          min: viz.rescale[0],
          max: viz.rescale[1]
        });
      }
      
      if (viz.format) {
        catalogItem.setPreferredFormat(viz.format);
      }
    }
  }

  private generateShareId(): string {
    return `stac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateShareUrl(state: ShareableStacState, shareId: string): string {
    const baseUrl = window.location.origin + window.location.pathname;
    const stateData = this.compressState(state);
    
    const params = new URLSearchParams();
    params.set(this.urlPrefix, shareId);
    params.set("data", stateData);
    
    return `${baseUrl}?${params.toString()}`;
  }

  private parseShareUrl(url: string): ShareableStacState | null {
    try {
      const urlObj = new URL(url);
      const shareId = urlObj.searchParams.get(this.urlPrefix);
      const data = urlObj.searchParams.get("data");
      
      if (!shareId || !data) return null;
      
      const state = this.decompressState(data);
      state.shareId = shareId;
      
      return state;
    } catch (error) {
      console.warn("Failed to parse share URL:", error);
      return null;
    }
  }

  private compressState(state: ShareableStacState): string {
    try {
      const json = JSON.stringify(state);
      return btoa(encodeURIComponent(json));
    } catch (_error) {
      throw new Error("Failed to compress state data");
    }
  }

  private decompressState(data: string): ShareableStacState {
    try {
      const json = decodeURIComponent(atob(data));
      return JSON.parse(json);
    } catch (_error) {
      throw new Error("Failed to decompress state data");
    }
  }

  private async createShortUrl(fullUrl: string): Promise<string> {
    // This would integrate with a URL shortening service
    // For now, return a simplified version
    try {
      const urlObj = new URL(fullUrl);
      const shareId = urlObj.searchParams.get(this.urlPrefix);
      return `${urlObj.origin}/${this.urlPrefix}/${shareId}`;
    } catch (_error) {
      console.warn("Failed to create short URL:", _error);
      return fullUrl;
    }
  }

  private saveSharedStates(): void {
    try {
      const states = Array.from(this._sharedStates.entries())
        .sort(([,a], [,b]) => b.timestamp - a.timestamp)
        .slice(0, this.maxStoredShares);
      
      const data = {
        states: states,
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn("Failed to save shared states:", error);
    }
  }

  private loadStoredShares(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      if (data.timestamp && Date.now() - data.timestamp > maxAge) {
        localStorage.removeItem(this.storageKey);
        return;
      }

      if (data.states && Array.isArray(data.states)) {
        this._sharedStates = new Map(data.states);
      }
    } catch (error) {
      console.warn("Failed to load stored shares:", error);
      localStorage.removeItem(this.storageKey);
    }
  }

  // Public utility methods
  isValidShareUrl(url: string): boolean {
    const state = this.parseShareUrl(url);
    return state !== null && isDefined(state.catalogUrl);
  }

  getShareIdFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get(this.urlPrefix);
    } catch (_error) {
      return null;
    }
  }

  @action
  deleteSharedState(shareId: string): void {
    this._sharedStates.delete(shareId);
    this.saveSharedStates();
  }

  @action
  clearAllShares(): void {
    this._sharedStates.clear();
    localStorage.removeItem(this.storageKey);
  }

  getShareStatistics(): {
    totalShares: number;
    catalogShares: number;
    itemShares: number;
    oldestShare?: Date;
    newestShare?: Date;
  } {
    const states = Array.from(this._sharedStates.values());
    
    return {
      totalShares: states.length,
      catalogShares: states.filter(s => s.catalogType === "catalog").length,
      itemShares: states.filter(s => s.catalogType === "item").length,
      oldestShare: states.length > 0 ? 
        new Date(Math.min(...states.map(s => s.timestamp))) : undefined,
      newestShare: states.length > 0 ? 
        new Date(Math.max(...states.map(s => s.timestamp))) : undefined
    };
  }
}