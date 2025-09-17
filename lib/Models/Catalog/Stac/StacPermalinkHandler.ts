/**
 * STAC Permalink Handler
 * 
 * Handles URL-based state restoration for STAC catalogs and items
 * Integrates with TerriaJS URL handling system
 */

import { action, makeObservable, observable } from "mobx";
import TerriaError from "../../../Core/TerriaError";
import Terria from "../../Terria";
import { StacShareManager, ShareableStacState } from "./StacShareManager";
import StacCatalogGroup from "./StacCatalogGroup";
import StacCatalogItem from "./StacCatalogItem";

export interface PermalinkContext {
  terria: Terria;
  shareManager: StacShareManager;
}

export class StacPermalinkHandler {
  @observable
  private _isProcessing: boolean = false;

  private context: PermalinkContext;
  private readonly urlParameter = "stac-share";

  constructor(context: PermalinkContext) {
    makeObservable(this);
    this.context = context;
  }

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  /**
   * Process URL parameters and restore STAC state if present
   */
  @action
  async processUrl(url: string): Promise<boolean> {
    const shareId = this.extractShareId(url);
    if (!shareId) return false;

    this._isProcessing = true;

    try {
      // Load shared state
      const state = await this.context.shareManager.loadSharedState(shareId);
      
      // Find or create appropriate catalog member
      const catalogMember = await this.findOrCreateCatalogMember(state);
      
      if (!catalogMember) {
        throw new TerriaError({
          title: "Failed to load STAC catalog",
          message: "Could not create or find the specified STAC catalog"
        });
      }

      // Apply the shared state
      this.context.shareManager.applySharedState(state, catalogMember);

      // Add to workbench if not already added
      if (catalogMember instanceof StacCatalogGroup && !this.context.terria.workbench.contains(catalogMember)) {
        this.context.terria.workbench.add(catalogMember);
      } else if (catalogMember instanceof StacCatalogItem && !this.context.terria.workbench.contains(catalogMember)) {
        this.context.terria.workbench.add(catalogMember);
      }

      // Clean up URL
      this.cleanupUrl();

      return true;
    } catch (error) {
      console.error("Failed to process STAC permalink:", error);
      throw new TerriaError({
        title: "Failed to load shared STAC catalog",
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Generate permalink for current state
   */
  @action
  async generatePermalink(
    catalogMember: StacCatalogGroup | StacCatalogItem,
    includeTerriaState: boolean = true
  ): Promise<string> {
    try {
      // Create share for the STAC catalog
      const shareResult = catalogMember instanceof StacCatalogGroup
        ? await this.context.shareManager.shareStacCatalog(catalogMember, {
            includeSearch: true,
            includeNavigation: true,
            compressUrl: true
          })
        : await this.context.shareManager.shareStacItem(catalogMember, {
            includeVisualization: true,
            compressUrl: true
          });

      if (includeTerriaState) {
        // Integrate with TerriaJS permalink system
        return this.integrateWithTerriaPermalink(shareResult.shareUrl);
      }

      return shareResult.shortUrl || shareResult.shareUrl;
    } catch (error) {
      throw new TerriaError({
        title: "Failed to generate permalink",
        message: error instanceof Error ? error.message : "Could not create permalink"
      });
    }
  }

  /**
   * Check if URL contains STAC share parameters
   */
  hasStacShare(url: string): boolean {
    return this.extractShareId(url) !== null;
  }

  /**
   * Extract STAC share ID from URL
   */
  private extractShareId(url: string): string | null {
    return this.context.shareManager.getShareIdFromUrl(url);
  }

  /**
   * Find existing or create new catalog member based on shared state
   */
  private async findOrCreateCatalogMember(
    state: ShareableStacState
  ): Promise<StacCatalogGroup | StacCatalogItem | null> {
    // First, try to find existing catalog member with same URL
    const existingMember = this.findExistingCatalogMember(state);
    if (existingMember) {
      return existingMember;
    }

    // Create new catalog member
    return await this.createCatalogMember(state);
  }

  /**
   * Find existing catalog member that matches the shared state
   */
  private findExistingCatalogMember(
    state: ShareableStacState
  ): StacCatalogGroup | StacCatalogItem | null {
    // Search in catalog
    const catalogMembers = this.context.terria.catalog.group.memberModels;
    
    for (const member of catalogMembers) {
      if (member instanceof StacCatalogGroup && member.url === state.catalogUrl) {
        return member;
      }
      if (member instanceof StacCatalogItem && member.url === state.catalogUrl) {
        return member;
      }
    }

    // Search in workbench
    for (const member of this.context.terria.workbench.items) {
      if (member instanceof StacCatalogGroup && member.url === state.catalogUrl) {
        return member;
      }
      if (member instanceof StacCatalogItem && member.url === state.catalogUrl) {
        return member;
      }
    }

    return null;
  }

  /**
   * Create new catalog member based on shared state
   */
  private async createCatalogMember(
    state: ShareableStacState
  ): Promise<StacCatalogGroup | StacCatalogItem | null> {
    try {
      const catalogId = `stac-shared-${Date.now()}`;

      if (state.catalogType === "item" && state.currentItemId) {
        // Create STAC item
        const item = new StacCatalogItem(catalogId, this.context.terria);
        
        item.setTrait("definition", "url", state.catalogUrl);
        item.setTrait("definition", "stacItemId", state.currentItemId);
        
        if (state.catalogTitle) {
          item.setTrait("definition", "name", state.catalogTitle);
        }

        await item.loadMetadata();
        return item;
      } else {
        // Create STAC catalog group
        const group = new StacCatalogGroup(catalogId, this.context.terria);
        
        group.setTrait("definition", "url", state.catalogUrl);
        
        if (state.catalogTitle) {
          group.setTrait("definition", "name", state.catalogTitle);
        }

        await group.loadMetadata();
        return group;
      }
    } catch (error) {
      console.error("Failed to create catalog member:", error);
      return null;
    }
  }

  /**
   * Clean up URL parameters after processing
   */
  private cleanupUrl(): void {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(this.urlParameter);
      url.searchParams.delete("data");
      
      // Update URL without page reload
      window.history.replaceState({}, "", url.toString());
    } catch (error) {
      console.warn("Failed to cleanup URL:", error);
    }
  }

  /**
   * Integrate STAC share with TerriaJS permalink system
   */
  private integrateWithTerriaPermalink(stacShareUrl: string): string {
    try {
      // Get current TerriaJS state
      const terriaState = this.context.terria.getLocalProperty("shareKeys") || {};
      
      // Create combined permalink
      const url = new URL(window.location.origin + window.location.pathname);
      
      // Add STAC share parameters
      const stacUrl = new URL(stacShareUrl);
      stacUrl.searchParams.forEach((value, key) => {
        url.searchParams.set(key, value);
      });

      // Add TerriaJS state if available
      if (Object.keys(terriaState).length > 0) {
        const terriaStateString = JSON.stringify(terriaState);
        url.searchParams.set("share", btoa(terriaStateString));
      }

      return url.toString();
    } catch (error) {
      console.warn("Failed to integrate with Terria permalink:", error);
      return stacShareUrl;
    }
  }

  /**
   * Handle browser navigation events
   */
  @action
  async handlePopState(_event: PopStateEvent): Promise<void> {
    const url = window.location.href;
    
    if (this.hasStacShare(url)) {
      try {
        await this.processUrl(url);
      } catch (error) {
        console.error("Failed to handle popstate for STAC share:", error);
      }
    }
  }

  /**
   * Register with TerriaJS URL handling system
   */
  registerWithTerria(): void {
    // Add to Terria's URL handlers
    const _terria = this.context.terria;
    
    // Check for STAC shares on initialization
    const currentUrl = window.location.href;
    if (this.hasStacShare(currentUrl)) {
      this.processUrl(currentUrl).catch(error => {
        console.error("Failed to process initial STAC share:", error);
      });
    }

    // Listen for navigation events
    window.addEventListener("popstate", (event) => {
      this.handlePopState(event);
    });
  }

  /**
   * Create a shareable URL for the current map state including STAC catalogs
   */
  @action
  async createMapShare(): Promise<string> {
    try {
      const stacCatalogs = this.context.terria.workbench.items.filter(
        item => item instanceof StacCatalogGroup || item instanceof StacCatalogItem
      ) as (StacCatalogGroup | StacCatalogItem)[];

      if (stacCatalogs.length === 0) {
        throw new TerriaError({
          title: "No STAC catalogs to share",
          message: "Add some STAC catalogs to the map before sharing"
        });
      }

      // For multiple catalogs, create individual shares and combine them
      const sharePromises = stacCatalogs.map(catalog => 
        catalog instanceof StacCatalogGroup
          ? this.context.shareManager.shareStacCatalog(catalog, { includeSearch: true, includeNavigation: true })
          : this.context.shareManager.shareStacItem(catalog, { includeVisualization: true })
      );

      const shareResults = await Promise.all(sharePromises);
      
      // For now, return the first share URL
      // TODO: Implement multi-catalog sharing
      return this.integrateWithTerriaPermalink(shareResults[0].shareUrl);
    } catch (error) {
      throw new TerriaError({
        title: "Failed to create map share",
        message: error instanceof Error ? error.message : "Could not create shareable map URL"
      });
    }
  }
}