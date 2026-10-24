import i18next from "i18next";
import { action, computed, makeObservable, override, runInAction } from "mobx";
import isDefined from "../../../Core/isDefined";
import loadJson from "../../../Core/loadJson";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import GroupMixin from "../../../ModelMixins/GroupMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import ModelReference from "../../../Traits/ModelReference";
import StacCatalogGroupTraits from "../../../Traits/TraitsClasses/StacCatalogGroupTraits";
import CommonStrata from "../../Definition/CommonStrata";
import CreateModel from "../../Definition/CreateModel";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel, ModelConstructorParameters } from "../../Definition/Model";
import StratumOrder from "../../Definition/StratumOrder";
import StacCollectionCatalogItem from "./StacCollectionCatalogItem";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";

/**
 * STAC Catalog/API root response
 */
interface StacCatalogResponse {
  id: string;
  type?: "Catalog" | "Collection";
  stac_version: string;
  stac_extensions?: string[];
  title?: string;
  description?: string;
  links: Array<{
    rel: string;
    href: string;
    type?: string;
    title?: string;
  }>;
  conformsTo?: string[];
}

/**
 * STAC Collections response
 */
interface StacCollectionsResponse {
  collections: Array<{
    id: string;
    title?: string;
    description?: string;
    type: "Collection";
    stac_version: string;
    links: Array<{
      rel: string;
      href: string;
      type?: string;
      title?: string;
    }>;
    extent?: {
      spatial?: {
        bbox?: number[][];
      };
      temporal?: {
        interval?: Array<[string | null, string | null]>;
      };
    };
  }>;
  links?: Array<{
    rel: string;
    href: string;
    type?: string;
  }>;
}

/**
 * Loadable stratum for STAC Catalog Group
 */
export class StacCatalogStratum extends LoadableStratum(
  StacCatalogGroupTraits
) {
  static stratumName = "stac-catalog-stratum";

  private collections: StacCollectionsResponse["collections"] = [];

  constructor(
    readonly catalogGroup: StacCatalogGroup,
    readonly catalog: StacCatalogResponse
  ) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new StacCatalogStratum(
      model as StacCatalogGroup,
      this.catalog
    ) as this;
  }

  @computed
  get name(): string | undefined {
    return this.catalog.title || this.catalog.id;
  }

  @computed
  get description(): string | undefined {
    return this.catalog.description;
  }

  @computed
  get members(): ModelReference[] {
    if (this.collections.length === 0) return [];

    return this.collections.map(
      (collection) => `${this.catalogGroup.uniqueId}/${collection.id}`
    );
  }

  @action
  async loadCollections(): Promise<void> {
    if (!isDefined(this.catalogGroup.url)) return;

    // Find the collections link
    const collectionsLink = this.catalog.links.find(
      (link) => link.rel === "data" || link.rel === "collections"
    );

    let collectionsUrl: string;
    if (collectionsLink) {
      collectionsUrl = new URL(collectionsLink.href, this.catalogGroup.url)
        .href;
    } else {
      // Try standard STAC API endpoint
      collectionsUrl = new URL("collections", this.catalogGroup.url).href;
    }

    const response = (await loadJson(
      proxyCatalogItemUrl(this.catalogGroup, collectionsUrl)
    )) as StacCollectionsResponse;

    let collections = response.collections || [];

    // Apply filter if specified
    if (this.catalogGroup.collectionsFilter) {
      const filterIds = this.catalogGroup.collectionsFilter
        .split(",")
        .map((id) => id.trim());
      collections = collections.filter((c) => filterIds.includes(c.id));
    }

    // Apply limit
    const maxCollections = this.catalogGroup.maximumCollections ?? 100;
    collections = collections.slice(0, maxCollections);

    this.collections = collections;

    // Create catalog items for each collection
    for (const collection of collections) {
      this.createCollectionItem(collection);
    }
  }

  @action
  private createCollectionItem(
    collection: StacCollectionsResponse["collections"][0]
  ): void {
    const itemId = `${this.catalogGroup.uniqueId}/${collection.id}`;

    let item = this.catalogGroup.terria.getModelById(
      StacCollectionCatalogItem,
      itemId
    );

    if (!isDefined(item)) {
      item = new StacCollectionCatalogItem(itemId, this.catalogGroup.terria);
      this.catalogGroup.terria.addModel(item);
    }

    // Find the self link for the collection
    const selfLink = collection.links.find((link) => link.rel === "self");
    const collectionUrl = selfLink
      ? new URL(selfLink.href, this.catalogGroup.url).href
      : new URL(`collections/${collection.id}`, this.catalogGroup.url).href;

    item.setTrait(
      CommonStrata.definition,
      "name",
      collection.title || collection.id
    );
    item.setTrait(CommonStrata.definition, "url", collectionUrl);

    if (collection.description) {
      item.setTrait(
        CommonStrata.definition,
        "description",
        collection.description
      );
    }
  }

  static async load(
    catalogGroup: StacCatalogGroup
  ): Promise<StacCatalogStratum | undefined> {
    if (!isDefined(catalogGroup.url)) {
      return undefined;
    }

    const catalogUrl = proxyCatalogItemUrl(catalogGroup, catalogGroup.url);
    const catalog = (await loadJson(catalogUrl)) as StacCatalogResponse;

    return new StacCatalogStratum(catalogGroup, catalog);
  }
}

StratumOrder.addLoadStratum(StacCatalogStratum.stratumName);

/**
 * A catalog group that lists STAC collections from a STAC Catalog or API.
 */
export default class StacCatalogGroup extends UrlMixin(
  GroupMixin(CatalogMemberMixin(CreateModel(StacCatalogGroupTraits)))
) {
  static readonly type = "stac-catalog";

  constructor(...args: ModelConstructorParameters) {
    super(...args);
    makeObservable(this);
  }

  get type() {
    return StacCatalogGroup.type;
  }

  get typeName() {
    return i18next.t("models.stac.catalogName") || "STAC Catalog";
  }

  @override
  get cacheDuration(): string {
    if (isDefined(super.cacheDuration)) {
      return super.cacheDuration;
    }
    return "1d";
  }

  protected async forceLoadMetadata(): Promise<void> {
    if (!this.strata.get(StacCatalogStratum.stratumName)) {
      const stratum = await StacCatalogStratum.load(this);
      if (stratum === undefined) return;
      await stratum.loadCollections();
      runInAction(() => {
        this.strata.set(StacCatalogStratum.stratumName, stratum);
      });
    }
  }

  protected async forceLoadMembers(): Promise<void> {
    const stratum = this.strata.get(
      StacCatalogStratum.stratumName
    ) as StacCatalogStratum;
    if (stratum) {
      await stratum.loadCollections();
    }
  }
}
