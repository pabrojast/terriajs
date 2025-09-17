import i18next from "i18next";
import { action, computed, makeObservable, observable, override, runInAction } from "mobx";
import isDefined from "../../../Core/isDefined";
import TerriaError from "../../../Core/TerriaError";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import MappableMixin, { MapItem } from "../../../ModelMixins/MappableMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import StacCatalogItemTraits from "../../../Traits/TraitsClasses/StacCatalogItemTraits";
import CommonStrata from "../../Definition/CommonStrata";
import CreateModel from "../../Definition/CreateModel";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumOrder from "../../Definition/StratumOrder";
import Terria from "../../Terria";
import CogCatalogItem from "../CatalogItems/CogCatalogItem";
import UrlTemplateImageryCatalogItem from "../CatalogItems/UrlTemplateImageryCatalogItem";
import {
  StacApiClient,
  StacItem,
  getPreferredAsset,
  isVisualizableAsset
} from "./StacApiHelpers";

export class StacItemStratum extends LoadableStratum(StacCatalogItemTraits) {
  static stratumName = "stacItem";

  static async load(catalogItem: StacCatalogItem): Promise<StacItemStratum> {
    if (!catalogItem.url) {
      throw new TerriaError({
        title: "STAC Item Error",
        message: "URL must be set for STAC Catalog Item"
      });
    }

    let stacItem: StacItem;

    try {
      // If we have stacItemId and collectionId, fetch the specific item
      if (catalogItem.stacItemId && catalogItem.collectionId) {
        const client = new StacApiClient(catalogItem.url, catalogItem.authToken);
        stacItem = await client.getItem(catalogItem.collectionId, catalogItem.stacItemId);
      } else {
        // Try to load the URL directly as a STAC item
        const response = await fetch(catalogItem.url, {
          headers: catalogItem.authToken ? { 
            'Authorization': `Bearer ${catalogItem.authToken}` 
          } : {}
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        stacItem = await response.json();
      }

      return new StacItemStratum(catalogItem, stacItem);
    } catch (error) {
      throw new TerriaError({
        title: "Failed to load STAC item",
        message: `Error loading STAC item: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    }
  }

  constructor(
    readonly catalogItem: StacCatalogItem,
    readonly stacItem: StacItem
  ) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new StacItemStratum(
      newModel as StacCatalogItem,
      this.stacItem
    ) as this;
  }

  @computed get name(): string {
    return this.stacItem.properties.title || 
           this.catalogItem.name || 
           this.stacItem.id;
  }

  @computed get description(): string | undefined {
    return this.stacItem.properties.description;
  }

  @computed get assets(): any[] {
    return Object.entries(this.stacItem.assets).map(([key, asset]) => ({
      key,
      title: asset.title || key,
      mediaType: asset.type,
      roles: asset.roles,
      url: asset.href,
      visualizable: isVisualizableAsset(asset)
    }));
  }

  @computed get selectedAssetKey(): string | undefined {
    if (this.catalogItem.selectedAssetKey) {
      return this.catalogItem.selectedAssetKey;
    }

    // Auto-select the preferred asset
    const preferredAsset = getPreferredAsset(
      this.stacItem.assets,
      this.catalogItem.preferredAssetTypes?.slice()
    );

    return preferredAsset?.key;
  }

  @computed get datetime(): string | undefined {
    return this.stacItem.properties.datetime || undefined;
  }

  @computed get cloudCover(): number | undefined {
    return this.stacItem.properties["eo:cloud_cover"];
  }

  @computed get instruments(): string[] | undefined {
    return this.stacItem.properties.instruments;
  }

  @computed get platform(): string[] | undefined {
    return this.stacItem.properties.platform;
  }

  @computed get groundSampleDistance(): number | undefined {
    return this.stacItem.properties.gsd;
  }

  @computed get bbox(): number[] | undefined {
    return this.stacItem.bbox;
  }
}

StratumOrder.addLoadStratum(StacItemStratum.stratumName);

export default class StacCatalogItem extends MappableMixin(
  UrlMixin(CatalogMemberMixin(CreateModel(StacCatalogItemTraits)))
) {
  static readonly type = "stac-item";

  @observable
  private _delegateItem: CogCatalogItem | UrlTemplateImageryCatalogItem | undefined;

  get type() {
    return StacCatalogItem.type;
  }

  get typeName() {
    return i18next.t("models.stacCatalogItem.name");
  }

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel | undefined
  ) {
    super(id, terria, sourceReference);
    makeObservable(this);
  }

  protected async forceLoadMetadata(): Promise<void> {
    if (!this.strata.get(StacItemStratum.stratumName)) {
      const stratum = await StacItemStratum.load(this);
      runInAction(() => {
        this.strata.set(StacItemStratum.stratumName, stratum);
      });
    }
  }

  @computed
  get selectedAsset(): any | undefined {
    if (!this.selectedAssetKey) return undefined;
    
    return this.assets?.find(asset => asset.key === this.selectedAssetKey);
  }

  @action
  selectAsset(assetKey: string) {
    const asset = this.assets?.find(a => a.key === assetKey);
    if (asset) {
      this.setTrait(CommonStrata.user, "selectedAssetKey", assetKey);
      // Force reload map items with new asset
      this._delegateItem = undefined;
      this.loadMapItems(true);
    }
  }

  @computed
  get mapItems(): MapItem[] {
    if (this._delegateItem) {
      return this._delegateItem.mapItems;
    }
    return [];
  }

  protected async forceLoadMapItems(): Promise<void> {
    await this.forceLoadMetadata();

    const selectedAsset = this.selectedAsset;
    if (!selectedAsset || !selectedAsset.url) {
      throw new TerriaError({
        title: "No visualizable asset",
        message: "No suitable asset found for visualization in this STAC item"
      });
    }

    // Determine the appropriate catalog item type based on the asset
    const assetUrl = selectedAsset.url;
    const mediaType = selectedAsset.mediaType?.toLowerCase();
    
    let delegateType: "cog" | "url-template-imagery";
    
    if (
      mediaType?.includes("tiff") || 
      mediaType?.includes("geotiff") ||
      mediaType?.includes("cog") ||
      assetUrl.toLowerCase().includes(".tif")
    ) {
      delegateType = "cog";
    } else if (
      mediaType?.includes("image/") ||
      selectedAsset.roles?.includes("visual") ||
      selectedAsset.roles?.includes("overview")
    ) {
      delegateType = "url-template-imagery";
    } else {
      // Default to COG for unknown types
      delegateType = "cog";
    }

    // Create delegate item if needed
    if (!this._delegateItem || this._delegateItem.type !== delegateType) {
      const delegateId = `${this.uniqueId}-${delegateType}`;
      
      if (delegateType === "cog") {
        this._delegateItem = new CogCatalogItem(delegateId, this.terria);
      } else {
        this._delegateItem = new UrlTemplateImageryCatalogItem(delegateId, this.terria);
      }
    }

    // Configure the delegate item
    if (this._delegateItem instanceof CogCatalogItem) {
      this._delegateItem.setTrait(CommonStrata.definition, "url", assetUrl);
    } else if (this._delegateItem instanceof UrlTemplateImageryCatalogItem) {
      this._delegateItem.setTrait(CommonStrata.definition, "url", assetUrl);
    }
    this._delegateItem.setTrait(CommonStrata.definition, "name", `${this.name} - ${selectedAsset.title || selectedAsset.key}`);
    
    // Copy authentication if needed
    if (this.authToken) {
      // For COG items, we might need to add auth headers - this depends on the imagery provider implementation
      // For now, we'll pass the token in case the provider supports it
      if ('authToken' in this._delegateItem) {
        (this._delegateItem as any).setTrait(CommonStrata.definition, "authToken", this.authToken);
      }
    }

    // Copy relevant properties
    if (this.bbox && this.bbox.length === 4) {
      this._delegateItem.setTrait(CommonStrata.definition, "rectangle", {
        west: this.bbox[0],
        south: this.bbox[1], 
        east: this.bbox[2],
        north: this.bbox[3]
      });
    }

    // Load the delegate item
    await this._delegateItem.loadMapItems();
  }

  @override
  get shortReport(): string | undefined {
    const parts: string[] = [];

    if (this.datetime) {
      parts.push(`**${i18next.t("models.stacCatalogItem.datetime")}:** ${this.datetime}`);
    }

    if (isDefined(this.cloudCover)) {
      parts.push(`**${i18next.t("models.stacCatalogItem.cloudCover")}:** ${this.cloudCover}%`);
    }

    if (this.instruments && this.instruments.length > 0) {
      parts.push(`**${i18next.t("models.stacCatalogItem.instruments")}:** ${this.instruments.join(", ")}`);
    }

    if (this.platform && this.platform.length > 0) {
      parts.push(`**${i18next.t("models.stacCatalogItem.platform")}:** ${this.platform.join(", ")}`);
    }

    if (isDefined(this.groundSampleDistance)) {
      parts.push(`**${i18next.t("models.stacCatalogItem.gsd")}:** ${this.groundSampleDistance}m`);
    }

    const selectedAsset = this.selectedAsset;
    if (selectedAsset) {
      parts.push(`**${i18next.t("models.stacCatalogItem.selectedAsset")}:** ${selectedAsset.title || selectedAsset.key}`);
    }

    if (this.assets && this.assets.length > 1) {
      const visualizableAssets = this.assets.filter(a => a.visualizable);
      if (visualizableAssets.length > 1) {
        parts.push(`**${i18next.t("models.stacCatalogItem.availableAssets")}:** ${visualizableAssets.length}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  // Placeholder methods for missing properties referenced in StacShareManager
  @action
  setSelectedAssets(_assets: string[]): void {
    // TODO: Implement asset selection
    console.warn("setSelectedAssets not implemented yet");
  }

  // Placeholder for band selector functionality
  get bandSelector() {
    return {
      setSelectedBands: (_bands: string[]) => console.warn("setSelectedBands not implemented"),
      setColormap: (_colormap: string) => console.warn("setColormap not implemented"),
      setRescaleRange: (_range: {min: number, max: number}) => console.warn("setRescaleRange not implemented")
    };
  }

  @action
  setPreferredFormat(_format: string): void {
    // TODO: Implement format preference
    console.warn("setPreferredFormat not implemented yet");
  }

  // Add linkManager property for compatibility
  get linkManager() {
    return {
      breadcrumbPath: []
    };
  }
}