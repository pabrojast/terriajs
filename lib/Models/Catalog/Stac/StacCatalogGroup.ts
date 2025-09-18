import i18next from "i18next";
import { action, computed, makeObservable, runInAction } from "mobx";
import Terria from "../../Terria";
import isDefined from "../../../Core/isDefined";
import TerriaError from "../../../Core/TerriaError";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import GroupMixin from "../../../ModelMixins/GroupMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import ModelReference from "../../../Traits/ModelReference";
import StacCatalogGroupTraits from "../../../Traits/TraitsClasses/StacCatalogGroupTraits";
import CommonStrata from "../../Definition/CommonStrata";
import CreateModel from "../../Definition/CreateModel";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StacCatalogItem from "./StacCatalogItem";
import {
  StacApiClient,
  StacCollection,
  StacItem,
  StacSearchRequest,
  buildCql2Filter,
  formatStacDatetime,
  isVisualizableAsset
} from "./StacApiHelpers";
import { StacShareManager } from "./StacShareManager";
import { StacPermalinkHandler } from "./StacPermalinkHandler";
import StratumOrder from "../../Definition/StratumOrder";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";

export class StacCatalogStratum extends LoadableStratum(StacCatalogGroupTraits) {
  static stratumName = "stacCatalog";

  static async load(
    catalogGroup: StacCatalogGroup
  ): Promise<StacCatalogStratum> {
    if (!catalogGroup.url) {
      throw new TerriaError({
        title: "STAC Catalog Group Error",
        message: "URL must be set for STAC Catalog Group"
      });
    }

    const client = new StacApiClient(
      proxyCatalogItemUrl(catalogGroup, catalogGroup.url!),
      catalogGroup.authToken
    );
    
    let collections: StacCollection[] = [];
    const itemsByCollection: Map<string, StacItem[]> = new Map();

    try {
      // Get catalog info first
      const _catalog = await client.getCatalog();
      
      // Get collections
      if (catalogGroup.collections && catalogGroup.collections.length > 0) {
        // Load specific collections
        for (const collectionId of catalogGroup.collections) {
          try {
            const collection = await client.getCollection(collectionId);
            collections.push(collection);
          } catch (error) {
            console.warn(`Failed to load collection ${collectionId}:`, error);
          }
        }
      } else {
        // Load all collections
        const collectionsResponse = await client.getCollections();
        collections = collectionsResponse.collections;
      }

      // Load items if requested
      if (catalogGroup.autoLoadItems) {
        if (collections.length > 0) {
          for (const collection of collections) {
            try {
              const searchRequest: StacSearchRequest = {
                collections: [collection.id],
                limit: catalogGroup.maxItems
              };

              // Spatial filter
              if (
                catalogGroup.spatialExtent &&
                catalogGroup.spatialExtent.length === 4
              ) {
                searchRequest.bbox = catalogGroup.spatialExtent as [
                  number,
                  number,
                  number,
                  number
                ];
              }
              // Temporal filter
              if (
                catalogGroup.temporalExtent &&
                catalogGroup.temporalExtent.length === 2
              ) {
                searchRequest.datetime = formatStacDatetime(
                  catalogGroup.temporalExtent[0],
                  catalogGroup.temporalExtent[1]
                );
              }
              // Custom filters
              if (
                catalogGroup.searchFilters &&
                catalogGroup.searchFilters.length > 0
              ) {
                const cql2Filter = buildCql2Filter(
                  catalogGroup.searchFilters.map((f) => ({
                    property: f.property || "",
                    operator: f.operator || "eq",
                    values: f.values?.slice() || []
                  }))
                );
                if (cql2Filter) {
                  searchRequest.filter = cql2Filter;
                }
              }
              // Sorting
              if (catalogGroup.sortField) {
                const direction = catalogGroup.sortField.startsWith("-")
                  ? "desc"
                  : "asc";
                const field = catalogGroup.sortField.replace(/^-/, "");
                searchRequest.sortby = [{ field, direction }];
              }

              const searchResponse = await client.searchItems(searchRequest);
              if (searchResponse.features.length > 0) {
                itemsByCollection.set(collection.id, searchResponse.features);
              }
            } catch (error) {
              console.warn(
                `Failed to load items for collection ${collection.id}:`,
                error
              );
            }
          }
        } else {
          // No collections returned: fallback to a broad search across the catalog
          try {
            const searchRequest: StacSearchRequest = {
              limit: catalogGroup.maxItems
            };
            if (
              catalogGroup.spatialExtent &&
              catalogGroup.spatialExtent.length === 4
            ) {
              searchRequest.bbox = catalogGroup.spatialExtent as [
                number,
                number,
                number,
                number
              ];
            }
            if (
              catalogGroup.temporalExtent &&
              catalogGroup.temporalExtent.length === 2
            ) {
              searchRequest.datetime = formatStacDatetime(
                catalogGroup.temporalExtent[0],
                catalogGroup.temporalExtent[1]
              );
            }
            if (
              catalogGroup.searchFilters &&
              catalogGroup.searchFilters.length > 0
            ) {
              const cql2Filter = buildCql2Filter(
                catalogGroup.searchFilters.map((f) => ({
                  property: f.property || "",
                  operator: f.operator || "eq",
                  values: f.values?.slice() || []
                }))
              );
              if (cql2Filter) searchRequest.filter = cql2Filter;
            }
            if (catalogGroup.sortField) {
              const direction = catalogGroup.sortField.startsWith("-")
                ? "desc"
                : "asc";
              const field = catalogGroup.sortField.replace(/^-/, "");
              searchRequest.sortby = [{ field, direction }];
            }
            const searchResponse = await client.searchItems(searchRequest);
            if (searchResponse.features.length > 0) {
              itemsByCollection.set("__all__", searchResponse.features);
              // Present as a flat list if no collections exist
              runInAction(() =>
                catalogGroup.setTrait(
                  CommonStrata.definition,
                  "groupByCollection",
                  false
                )
              );
            }
          } catch (error) {
            console.warn("Failed to perform broad STAC search:", error);
          }
        }
      }

    } catch (error) {
      throw new TerriaError({
        title: "Failed to load STAC catalog",
        message: `Error loading STAC catalog from ${catalogGroup.url}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    }

    return new StacCatalogStratum(catalogGroup, collections, itemsByCollection);
  }

  constructor(
    readonly catalogGroup: StacCatalogGroup,
    readonly stacCollections: StacCollection[],
    readonly itemsByCollection: Map<string, StacItem[]>
  ) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new StacCatalogStratum(
      newModel as StacCatalogGroup,
      this.stacCollections,
      this.itemsByCollection
    ) as this;
  }

  @computed get collections(): string[] {
    return this.stacCollections.map(collection => collection.id);
  }

  @computed get members(): ModelReference[] {
    if (this.catalogGroup.groupByCollection) {
      // Create groups for each collection
      return this.stacCollections.map((collection) =>
        this.createCollectionGroup(collection)
      );
    } else {
      // Create flat list of all items
      const allItems: StacItem[] = [];
      this.itemsByCollection.forEach((items) => {
        allItems.push(...items);
      });
      return allItems.map((item) => this.createItemReference(item));
    }
  }

  private createCollectionGroup(collection: StacCollection): ModelReference {
    const collectionGroupId = `${this.catalogGroup.uniqueId}-collection-${collection.id}`;
    
    // Check if the group already exists
    let collectionGroup = this.catalogGroup.terria.getModelById(StacCatalogGroup, collectionGroupId);
    
    if (!collectionGroup) {
      collectionGroup = new StacCatalogGroup(collectionGroupId, this.catalogGroup.terria);
      this.catalogGroup.terria.addModel(collectionGroup);
    }

    // Set up the collection group
    collectionGroup.setTrait(CommonStrata.definition, "name", collection.title || collection.id);
    collectionGroup.setTrait(CommonStrata.definition, "description", collection.description);
    collectionGroup.setTrait(CommonStrata.definition, "url", this.catalogGroup.url);
    collectionGroup.setTrait(CommonStrata.definition, "collections", [collection.id]);
    collectionGroup.setTrait(CommonStrata.definition, "authToken", this.catalogGroup.authToken);
    collectionGroup.setTrait(CommonStrata.definition, "groupByCollection", false);
    collectionGroup.setTrait(CommonStrata.definition, "autoLoadItems", true);
    
    // Copy search parameters
    if (this.catalogGroup.searchFilters) {
      const filters = this.catalogGroup.searchFilters.map(f => ({
        property: f.property,
        operator: f.operator,
        values: f.values?.slice()
      }));
      collectionGroup.setTrait(CommonStrata.definition, "searchFilters", filters);
    }
    collectionGroup.setTrait(CommonStrata.definition, "spatialExtent", this.catalogGroup.spatialExtent?.slice());
    collectionGroup.setTrait(CommonStrata.definition, "temporalExtent", this.catalogGroup.temporalExtent?.slice());
    collectionGroup.setTrait(CommonStrata.definition, "maxItems", this.catalogGroup.maxItems);
    collectionGroup.setTrait(CommonStrata.definition, "assetTypes", this.catalogGroup.assetTypes?.slice());
    collectionGroup.setTrait(CommonStrata.definition, "sortField", this.catalogGroup.sortField);

    return collectionGroupId;
  }

  private createItemReference(item: StacItem): ModelReference {
    const itemId = `${this.catalogGroup.uniqueId}-item-${item.collection || "unknown"}-${item.id}`;
    
    // Check if the item already exists
    let stacItem = this.catalogGroup.terria.getModelById(StacCatalogItem, itemId);
    
    if (!stacItem) {
      stacItem = new StacCatalogItem(itemId, this.catalogGroup.terria);
      this.catalogGroup.terria.addModel(stacItem);
    }

    // Set up the STAC item
    stacItem.setTrait(CommonStrata.definition, "name", item.properties.title || item.id);
    stacItem.setTrait(CommonStrata.definition, "description", item.properties.description);
    stacItem.setTrait(CommonStrata.definition, "stacItemId", item.id);
    stacItem.setTrait(CommonStrata.definition, "collectionId", item.collection);
    // Ensure item knows the STAC API base URL so it can fetch metadata/items
    stacItem.setTrait(CommonStrata.definition, "url", this.catalogGroup.url);
    // Propagate proxy preference if set on group to avoid CORS issues
    if ((this.catalogGroup as any).forceProxy) {
      stacItem.setTrait(CommonStrata.definition, "forceProxy", true);
    }
    stacItem.setTrait(CommonStrata.definition, "authToken", this.catalogGroup.authToken);
    
    // Set STAC-specific properties
    if (item.properties.datetime) {
      stacItem.setTrait(CommonStrata.definition, "datetime", item.properties.datetime);
    }
    if (item.properties["eo:cloud_cover"] !== undefined) {
      stacItem.setTrait(CommonStrata.definition, "cloudCover", item.properties["eo:cloud_cover"]);
    }
    if (item.properties.instruments) {
      const inst: any = item.properties.instruments;
      const instArr = Array.isArray(inst) ? inst : typeof inst === "string" ? [inst] : undefined;
      if (instArr) stacItem.setTrait(CommonStrata.definition, "instruments", instArr);
    }
    if (item.properties.platform) {
      const plat: any = item.properties.platform;
      const platArr = Array.isArray(plat) ? plat : typeof plat === "string" ? [plat] : undefined;
      if (platArr) stacItem.setTrait(CommonStrata.definition, "platform", platArr);
    }
    if (item.properties.gsd !== undefined) {
      const g: any = item.properties.gsd;
      const num = typeof g === "number" ? g : typeof g === "string" ? Number(g) : undefined;
      if (typeof num === "number" && !isNaN(num)) {
        stacItem.setTrait(CommonStrata.definition, "groundSampleDistance", num);
      }
    }
    if (item.bbox) {
      stacItem.setTrait(CommonStrata.definition, "bbox", item.bbox);
    }

    // Set up assets
    const assets = Object.entries(item.assets).map(([key, asset]) => ({
      key,
      title: asset.title || key,
      mediaType: asset.type,
      roles: asset.roles,
      url: asset.href,
      visualizable: isVisualizableAsset(asset)
    }));
    stacItem.setTrait(CommonStrata.definition, "assets", assets);

    // Set preferred asset types
    if (this.catalogGroup.assetTypes && this.catalogGroup.assetTypes.length > 0) {
      stacItem.setTrait(CommonStrata.definition, "preferredAssetTypes", this.catalogGroup.assetTypes?.slice());
    }

    // Set up bands if available
    if (item.properties["eo:bands"]) {
      const bands = item.properties["eo:bands"].map(band => ({
        name: band.name,
        commonName: band.common_name,
        centerWavelength: band.center_wavelength,
        fullWidthHalfMax: band.full_width_half_max
      }));
      stacItem.setTrait(CommonStrata.definition, "bands", bands);
    }

    return itemId;
  }
}

export default class StacCatalogGroup extends GroupMixin(
  UrlMixin(CatalogMemberMixin(CreateModel(StacCatalogGroupTraits)))
) {
  static readonly type = "stac-group";

  private _shareManager?: StacShareManager;
  private _permalinkHandler?: StacPermalinkHandler;

  get type() {
    return StacCatalogGroup.type;
  }

  get typeName() {
    return i18next.t("models.stacCatalogGroup.name");
  }

  get cacheDuration() {
    if (isDefined(super.cacheDuration)) {
      return super.cacheDuration;
    }
    return "5m";
  }

  @computed
  get shareManager(): StacShareManager {
    if (!this._shareManager) {
      this._shareManager = new StacShareManager();
    }
    return this._shareManager;
  }

  @computed
  get permalinkHandler(): StacPermalinkHandler {
    if (!this._permalinkHandler) {
      this._permalinkHandler = new StacPermalinkHandler({
        terria: this.terria,
        shareManager: this.shareManager
      });
    }
    return this._permalinkHandler;
  }

  constructor(id: string | undefined, terria: Terria, sourceReference?: BaseModel) {
    super(id, terria, sourceReference);
    makeObservable(this);
  }

  protected async forceLoadMetadata(): Promise<void> {
    if (!this.strata.get(StacCatalogStratum.stratumName)) {
      const stratum = await StacCatalogStratum.load(this);
      runInAction(() => {
        this.strata.set(StacCatalogStratum.stratumName, stratum);
      });
    }
  }

  protected forceLoadMembers(): Promise<void> {
    return this.forceLoadMetadata();
  }

  /**
   * Create a shareable URL for this catalog group
   */
  @action
  async createShareUrl(options?: {
    includeSearch?: boolean;
    includeNavigation?: boolean;
    compressUrl?: boolean;
  }): Promise<string> {
    const result = await this.shareManager.shareStacCatalog(this, {
      includeSearch: options?.includeSearch ?? true,
      includeNavigation: options?.includeNavigation ?? true,
      compressUrl: options?.compressUrl ?? false
    });
    
    return result.shortUrl || result.shareUrl;
  }

  /**
   * Load state from a share ID
   */
  @action
  async loadFromShare(shareId: string): Promise<void> {
    const state = await this.shareManager.loadSharedState(shareId);
    this.shareManager.applySharedState(state, this);
  }

  // Add linkManager property for compatibility
  get linkManager() {
    return {
      currentResource: null,
      breadcrumbPath: [],
      navigateToResource: (_resourceId: string) => {
        // TODO: implement navigation
        console.warn("navigateToResource not implemented yet");
        return Promise.resolve();
      }
    };
  }

  // Add searchManager property for compatibility
  get searchManager() {
    return {
      searchParameters: {
        bbox: this.spatialExtent,
        datetime: this.temporalExtent ? this.temporalExtent.join("/") : undefined
      },
      updateSearchParameters: (_params: any) => {
        // TODO: implement search parameter updates
        console.warn("updateSearchParameters not implemented yet");
      },
      setSpatialExtent: (bbox: number[]) => {
        this.setTrait(CommonStrata.user, "spatialExtent", bbox);
      },
      setTemporalExtent: (temporal: string[]) => {
        this.setTrait(CommonStrata.user, "temporalExtent", temporal);
      }
    };
  }
}

// Register loadable stratum for STAC catalog groups
StratumOrder.addLoadStratum(StacCatalogStratum.stratumName);
