/**
 * STAC Link Manager
 * 
 * Handles STAC link relationships and navigation between STAC resources
 */

import { action, computed, makeObservable, observable } from "mobx";
import TerriaError from "../../../Core/TerriaError";
import {
  StacApiClient,
  StacLink
} from "./StacApiHelpers";

export type StacResourceType = "Catalog" | "Collection" | "Feature";

export interface StacResource {
  type: StacResourceType;
  id: string;
  title?: string;
  description?: string;
  links: StacLink[];
  url: string;
}

export interface StacRelationship {
  rel: string;
  href: string;
  type?: string;
  title?: string;
  description?: string;
}

export interface NavigationPath {
  resources: StacResource[];
  currentIndex: number;
}

// Standard STAC link relations
export const STAC_RELATIONS = {
  // Core relations
  SELF: "self",
  ROOT: "root", 
  PARENT: "parent",
  CHILD: "child",
  COLLECTION: "collection",
  ITEM: "item",
  
  // Navigation relations
  NEXT: "next",
  PREV: "prev",
  FIRST: "first",
  LAST: "last",
  
  // Alternative relations
  ALTERNATE: "alternate",
  CANONICAL: "canonical",
  
  // Service relations
  SERVICE_DESC: "service-desc",
  SERVICE_DOC: "service-doc",
  CONFORMANCE: "conformance",
  
  // Data relations
  DATA: "data",
  METADATA: "metadata",
  LICENSE: "license",
  
  // Derivative relations
  DERIVED_FROM: "derived_from",
  VERSION_HISTORY: "version-history",
  LATEST_VERSION: "latest-version",
  PREDECESSOR_VERSION: "predecessor-version",
  SUCCESSOR_VERSION: "successor-version"
} as const;

export class StacLinkManager {
  @observable
  private _currentResource?: StacResource;

  @observable 
  private _navigationHistory: StacResource[] = [];

  @observable
  private _currentHistoryIndex: number = -1;

  @observable
  private _isNavigating: boolean = false;

  private client: StacApiClient;

  constructor(client: StacApiClient) {
    makeObservable(this);
    this.client = client;
  }

  @computed
  get currentResource(): StacResource | undefined {
    return this._currentResource;
  }

  @computed
  get navigationHistory(): StacResource[] {
    return [...this._navigationHistory];
  }

  @computed
  get canGoBack(): boolean {
    return this._currentHistoryIndex > 0;
  }

  @computed
  get canGoForward(): boolean {
    return this._currentHistoryIndex < this._navigationHistory.length - 1;
  }

  @computed
  get isNavigating(): boolean {
    return this._isNavigating;
  }

  @computed
  get breadcrumbPath(): StacResource[] {
    if (!this._currentResource) return [];
    
    const path: StacResource[] = [];
    const current = this._currentResource;
    
    // Build breadcrumb by following parent links
    path.unshift(current);
    
    // For now, we'll use the navigation history to build breadcrumbs
    // In a full implementation, you'd traverse parent links
    return this._navigationHistory.slice(0, this._currentHistoryIndex + 1);
  }

  @action
  async navigateToResource(url: string, addToHistory: boolean = true): Promise<StacResource> {
    this._isNavigating = true;

    try {
      const response = await this.client.fetchJson<any>(url);
      const resource = this.createStacResource(response, url);

      if (addToHistory) {
        this.addToHistory(resource);
      }
      
      this._currentResource = resource;
      return resource;
    } catch (error) {
      throw new TerriaError({
        title: "Navigation failed",
        message: `Failed to navigate to ${url}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    } finally {
      this._isNavigating = false;
    }
  }

  @action
  async followLink(link: StacLink, addToHistory: boolean = true): Promise<StacResource> {
    return this.navigateToResource(link.href, addToHistory);
  }

  @action
  async navigateToParent(): Promise<StacResource | undefined> {
    if (!this._currentResource) return undefined;

    const parentLink = this.getLinkByRelation(this._currentResource, STAC_RELATIONS.PARENT);
    if (!parentLink) {
      throw new TerriaError({
        title: "No parent resource",
        message: "Current resource has no parent link"
      });
    }

    return this.followLink(parentLink);
  }

  @action
  async navigateToRoot(): Promise<StacResource | undefined> {
    if (!this._currentResource) return undefined;

    const rootLink = this.getLinkByRelation(this._currentResource, STAC_RELATIONS.ROOT);
    if (!rootLink) {
      throw new TerriaError({
        title: "No root resource",
        message: "Current resource has no root link"
      });
    }

    return this.followLink(rootLink);
  }

  @action
  async navigateToCollection(): Promise<StacResource | undefined> {
    if (!this._currentResource) return undefined;

    const collectionLink = this.getLinkByRelation(this._currentResource, STAC_RELATIONS.COLLECTION);
    if (!collectionLink) {
      throw new TerriaError({
        title: "No collection resource",
        message: "Current resource has no collection link"
      });
    }

    return this.followLink(collectionLink);
  }

  @action
  goBack(): StacResource | undefined {
    if (!this.canGoBack) return undefined;

    this._currentHistoryIndex--;
    this._currentResource = this._navigationHistory[this._currentHistoryIndex];
    return this._currentResource;
  }

  @action
  goForward(): StacResource | undefined {
    if (!this.canGoForward) return undefined;

    this._currentHistoryIndex++;
    this._currentResource = this._navigationHistory[this._currentHistoryIndex];
    return this._currentResource;
  }

  @action
  private addToHistory(resource: StacResource): void {
    // Remove any forward history if we're navigating from the middle
    if (this._currentHistoryIndex < this._navigationHistory.length - 1) {
      this._navigationHistory = this._navigationHistory.slice(0, this._currentHistoryIndex + 1);
    }

    // Add new resource to history
    this._navigationHistory.push(resource);
    this._currentHistoryIndex = this._navigationHistory.length - 1;

    // Limit history size
    const maxHistorySize = 50;
    if (this._navigationHistory.length > maxHistorySize) {
      this._navigationHistory = this._navigationHistory.slice(-maxHistorySize);
      this._currentHistoryIndex = this._navigationHistory.length - 1;
    }
  }

  private createStacResource(stacObject: any, url: string): StacResource {
    return {
      type: stacObject.type as StacResourceType,
      id: stacObject.id,
      title: stacObject.title,
      description: stacObject.description,
      links: stacObject.links || [],
      url
    };
  }

  // Link utility methods
  getLinksByRelation(resource: StacResource, relation: string): StacLink[] {
    return resource.links.filter(link => link.rel === relation);
  }

  getLinkByRelation(resource: StacResource, relation: string): StacLink | undefined {
    return resource.links.find(link => link.rel === relation);
  }

  getAlternateFormats(resource: StacResource): StacLink[] {
    return this.getLinksByRelation(resource, STAC_RELATIONS.ALTERNATE);
  }

  getChildResources(resource: StacResource): StacLink[] {
    return [
      ...this.getLinksByRelation(resource, STAC_RELATIONS.CHILD),
      ...this.getLinksByRelation(resource, STAC_RELATIONS.ITEM)
    ];
  }

  getServiceLinks(resource: StacResource): StacLink[] {
    return [
      ...this.getLinksByRelation(resource, STAC_RELATIONS.SERVICE_DESC),
      ...this.getLinksByRelation(resource, STAC_RELATIONS.SERVICE_DOC)
    ];
  }

  getDataLinks(resource: StacResource): StacLink[] {
    return [
      ...this.getLinksByRelation(resource, STAC_RELATIONS.DATA),
      ...this.getLinksByRelation(resource, STAC_RELATIONS.METADATA)
    ];
  }

  getVersionLinks(resource: StacResource): StacLink[] {
    return [
      ...this.getLinksByRelation(resource, STAC_RELATIONS.VERSION_HISTORY),
      ...this.getLinksByRelation(resource, STAC_RELATIONS.LATEST_VERSION),
      ...this.getLinksByRelation(resource, STAC_RELATIONS.PREDECESSOR_VERSION),
      ...this.getLinksByRelation(resource, STAC_RELATIONS.SUCCESSOR_VERSION)
    ];
  }

  // Group links by relation type for UI display
  groupLinksByRelation(resource: StacResource): Record<string, StacLink[]> {
    const grouped: Record<string, StacLink[]> = {};
    
    resource.links.forEach(link => {
      if (!grouped[link.rel]) {
        grouped[link.rel] = [];
      }
      grouped[link.rel].push(link);
    });

    return grouped;
  }

  // Get human-readable relation names
  getRelationDisplayName(relation: string): string {
    const displayNames: Record<string, string> = {
      [STAC_RELATIONS.SELF]: "Self",
      [STAC_RELATIONS.ROOT]: "Root Catalog",
      [STAC_RELATIONS.PARENT]: "Parent",
      [STAC_RELATIONS.CHILD]: "Child Collections",
      [STAC_RELATIONS.COLLECTION]: "Collection",
      [STAC_RELATIONS.ITEM]: "Items",
      [STAC_RELATIONS.NEXT]: "Next Page",
      [STAC_RELATIONS.PREV]: "Previous Page",
      [STAC_RELATIONS.FIRST]: "First Page",
      [STAC_RELATIONS.LAST]: "Last Page",
      [STAC_RELATIONS.ALTERNATE]: "Alternative Formats",
      [STAC_RELATIONS.CANONICAL]: "Canonical",
      [STAC_RELATIONS.SERVICE_DESC]: "Service Description",
      [STAC_RELATIONS.SERVICE_DOC]: "Service Documentation",
      [STAC_RELATIONS.CONFORMANCE]: "Conformance",
      [STAC_RELATIONS.DATA]: "Data Access",
      [STAC_RELATIONS.METADATA]: "Metadata",
      [STAC_RELATIONS.LICENSE]: "License",
      [STAC_RELATIONS.DERIVED_FROM]: "Derived From",
      [STAC_RELATIONS.VERSION_HISTORY]: "Version History",
      [STAC_RELATIONS.LATEST_VERSION]: "Latest Version",
      [STAC_RELATIONS.PREDECESSOR_VERSION]: "Previous Version",
      [STAC_RELATIONS.SUCCESSOR_VERSION]: "Next Version"
    };

    return displayNames[relation] || relation;
  }

  // Check if a link relation indicates navigation
  isNavigationRelation(relation: string): boolean {
    const navigationRelations = [
      STAC_RELATIONS.PARENT,
      STAC_RELATIONS.CHILD,
      STAC_RELATIONS.COLLECTION,
      STAC_RELATIONS.ITEM,
      STAC_RELATIONS.ROOT,
      STAC_RELATIONS.NEXT,
      STAC_RELATIONS.PREV,
      STAC_RELATIONS.FIRST,
      STAC_RELATIONS.LAST
    ];

    return navigationRelations.includes(relation as any);
  }

  // Check if a link relation indicates external content
  isExternalRelation(relation: string): boolean {
    const externalRelations = [
      STAC_RELATIONS.LICENSE,
      STAC_RELATIONS.SERVICE_DOC,
      STAC_RELATIONS.ALTERNATE
    ];

    return externalRelations.includes(relation as any);
  }

  @action
  reset(): void {
    this._currentResource = undefined;
    this._navigationHistory = [];
    this._currentHistoryIndex = -1;
    this._isNavigating = false;
  }

  // Create a shareable navigation state
  getNavigationState(): any {
    return {
      currentUrl: this._currentResource?.url,
      historyUrls: this._navigationHistory.map(r => r.url),
      historyIndex: this._currentHistoryIndex
    };
  }

  // Restore navigation state
  @action
  async restoreNavigationState(state: any): Promise<void> {
    if (state.currentUrl) {
      await this.navigateToResource(state.currentUrl, false);
    }
    
    // Note: Full history restoration would require loading all resources
    // This is a simplified version
  }
}