import i18next from "i18next";
import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  override,
  reaction,
  runInAction,
  untracked
} from "mobx";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import Color from "terriajs-cesium/Source/Core/Color";
import GeoJsonDataSource from "terriajs-cesium/Source/DataSources/GeoJsonDataSource";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import SingleTileImageryProvider from "terriajs-cesium/Source/Scene/SingleTileImageryProvider";
import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import isDefined from "../../../Core/isDefined";
import loadJson from "../../../Core/loadJson";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import DiscretelyTimeVaryingMixin, {
  DiscreteTimeAsJS
} from "../../../ModelMixins/DiscretelyTimeVaryingMixin";
import MappableMixin, { MapItem } from "../../../ModelMixins/MappableMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import { InfoSectionTraits } from "../../../Traits/TraitsClasses/CatalogMemberTraits";
import { FeatureInfoTemplateTraits } from "../../../Traits/TraitsClasses/FeatureInfoTraits";
import StacCollectionCatalogItemTraits from "../../../Traits/TraitsClasses/StacCollectionCatalogItemTraits";
import { RectangleTraits } from "../../../Traits/TraitsClasses/MappableTraits";
import { csvFeatureInfoContext } from "../../../Table/tableFeatureInfoContext";
import Icon from "../../../Styled/Icon";
import CreateModel from "../../Definition/CreateModel";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import StratumOrder from "../../Definition/StratumOrder";
import Terria from "../../Terria";
import { ViewingControl } from "../../ViewingControls";
import { runWorkflow } from "../../Workflows/SelectableDimensionWorkflow";
import TerrascopeAuthWorkflow from "../../Workflows/TerrascopeAuthWorkflow";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";
import {
  buildTerrascopeViewerUrl,
  findStacPreviewAsset,
  findStacPreviewAssets,
  getStacAssetAccessLink,
  hasValidCesiumRectangle,
  isStacAssetAuthProtected,
  normalizeStacBbox,
  normalizeStacRawBbox,
  resolveStacHref,
  shouldForcePreviewForProtectedTerrascopeAsset
} from "./stacAssetUtils";
import {
  canUseTerrascopeAuth,
  getDefaultTerrascopeAuthConfig,
  getTerrascopeAuthHeaders,
  getTerrascopeAuthSession,
  type TerrascopeAuthConfig
} from "./TerrascopeAuth";
import {
  loadStacItems,
  resolveStacItemsQueryMode,
  resolveStacSearchUrl
} from "./stacItemsLoader";

/**
 * STAC Collection JSON structure
 */
interface StacCollection {
  id: string;
  type: "Collection";
  stac_version: string;
  stac_extensions?: string[];
  title?: string;
  description?: string;
  keywords?: string[];
  license?: string;
  providers?: Array<{
    name: string;
    roles?: string[];
    url?: string;
  }>;
  extent: {
    spatial: {
      bbox: number[][];
    };
    temporal: {
      interval: Array<[string | null, string | null]>;
    };
  };
  summaries?: {
    bands?: Array<{
      name: string;
      data_type?: string;
      unit?: string;
      "raster:scale"?: number;
      "raster:offset"?: number;
      nodata?: number;
    }>;
    [key: string]: unknown;
  };
  links: Array<{
    rel: string;
    href: string;
    type?: string;
    title?: string;
  }>;
  assets?: Record<
    string,
    {
      href: string;
      title?: string;
      description?: string;
      type?: string;
      roles?: string[];
      "auth:refs"?: string[];
    }
  >;
  item_assets?: Record<
    string,
    {
      type?: string;
      title?: string;
      description?: string;
      roles?: string[];
      "auth:refs"?: string[];
      bands?: Array<{ name: string }>;
    }
  >;
  renders?: Record<
    string,
    {
      title?: string;
      assets?: string[];
      rescale?: number[][];
      colormap_name?: string;
      tilematrixsets?: Record<string, number[]>;
    }
  >;
}

/**
 * STAC Item JSON structure
 */
interface StacItem {
  id: string;
  type: "Feature";
  stac_version: string;
  stac_extensions?: string[];
  geometry: GeoJSON.Geometry;
  bbox?: number[];
  properties: {
    datetime?: string | null;
    start_datetime?: string;
    end_datetime?: string;
    [key: string]: unknown;
  };
  links: Array<{
    rel: string;
    href: string;
    type?: string;
    title?: string;
  }>;
  assets: Record<
    string,
    {
      href: string;
      title?: string;
      description?: string;
      type?: string;
      roles?: string[];
      "auth:refs"?: string[];
      "proj:epsg"?: number;
      "raster:bands"?: Array<{
        data_type?: string;
        scale?: number;
        offset?: number;
        nodata?: number;
      }>;
    }
  >;
}

interface StacPreviewCandidate {
  hrefs: string[];
  bbox: number[];
  projectedBbox?: number[];
  projectedCode?: string;
}

interface StacTimeSeriesEntry {
  time: string;
  tag: string;
  cogs: string[];
  requiresAuthentication: boolean;
}

interface CachedProviderSet {
  timeKey: string;
  providers: TIFFImageryProvider[];
  lastAccess: number;
}

const STAC_TIME_SERIES_PICK_FLAG = Symbol("stacTimeSeriesPickFlag");
const STAC_TIME_SERIES_PICKER_FLAG = Symbol("stacTimeSeriesPickerFlag");
const STAC_TIME_SERIES_ORIGINAL_PICK = Symbol("stacTimeSeriesOriginalPick");

/**
 * Loadable stratum for STAC Collection
 */
class StacCollectionStratum extends LoadableStratum(
  StacCollectionCatalogItemTraits
) {
  static stratumName = "stac-collection-stratum";

  constructor(
    readonly catalogItem: StacCollectionCatalogItem,
    readonly collection: StacCollection,
    readonly items: StacItem[] = []
  ) {
    super();
    makeObservable(this);
  }

  /** First item for COG asset discovery */
  get firstItem(): StacItem | undefined {
    return this.items[0];
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new StacCollectionStratum(
      model as StacCollectionCatalogItem,
      this.collection,
      this.items
    ) as this;
  }

  @computed
  get name(): string | undefined {
    return this.collection.title || this.collection.id;
  }

  @computed
  get description(): string | undefined {
    return this.collection.description;
  }

  @computed
  get rectangle(): StratumFromTraits<RectangleTraits> | undefined {
    // First try to get rectangle from the imagery provider if available
    const imageryRectangle = this.catalogItem._imageryProviders
      .map(
        (provider) =>
          (provider as unknown as { rectangle?: Rectangle | undefined })
            .rectangle
      )
      .find((rectangle) => hasValidCesiumRectangle(rectangle));
    if (hasValidCesiumRectangle(imageryRectangle)) {
      const { west, south, east, north } = imageryRectangle;
      return {
        west: CesiumMath.toDegrees(west),
        south: CesiumMath.toDegrees(south),
        east: CesiumMath.toDegrees(east),
        north: CesiumMath.toDegrees(north)
      };
    }

    // Fall back to collection extent
    const bbox = normalizeStacBbox(this.collection.extent?.spatial?.bbox?.[0]);
    if (bbox) {
      return {
        west: bbox[0],
        south: bbox[1],
        east: bbox[2],
        north: bbox[3]
      };
    }
    return undefined;
  }

  @computed
  get collectionId(): string {
    return this.collection.id;
  }

  @computed
  get itemsUrl(): string | undefined {
    const itemsLink = this.collection.links.find(
      (link) => link.rel === "items"
    );
    return itemsLink?.href;
  }

  @computed
  get credit(): string | undefined {
    const providers = this.collection.providers;
    if (providers && providers.length > 0) {
      return providers.map((p) => p.name).join(", ");
    }
    return undefined;
  }

  @computed
  get info(): StratumFromTraits<InfoSectionTraits>[] {
    const info: StratumFromTraits<InfoSectionTraits>[] = [];
    const firstItem = this.firstItem;
    const viewerBbox =
      normalizeStacBbox(firstItem?.bbox) ??
      normalizeStacBbox(this.collection.extent?.spatial?.bbox?.[0]);
    const viewerDate =
      firstItem?.properties?.datetime ??
      this.collection.extent?.temporal?.interval?.[0]?.[0];
    const terrascopeViewerUrl = buildTerrascopeViewerUrl({
      collectionId: this.collection.id,
      bbox: viewerBbox,
      datetime: viewerDate
    });

    if (this.collection.license) {
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.licence"),
          content: this.collection.license
        })
      );
    }

    if (this.collection.keywords && this.collection.keywords.length > 0) {
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.keywords") || "Keywords",
          content: this.collection.keywords.join(", ")
        })
      );
    }

    if (this.collection.providers && this.collection.providers.length > 0) {
      const providersContent = this.collection.providers
        .map((p) => {
          const roles = p.roles ? ` (${p.roles.join(", ")})` : "";
          const url = p.url ? ` - ${p.url}` : "";
          return `${p.name}${roles}${url}`;
        })
        .join("\n");
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.contact") || "Providers",
          content: providersContent
        })
      );
    }

    const temporal = this.collection.extent?.temporal?.interval?.[0];
    if (temporal) {
      const start = temporal[0] || "ongoing";
      const end = temporal[1] || "present";
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.temporalExtent") || "Temporal Extent",
          content: `${start} to ${end}`
        })
      );
    }

    const previewAsset = findStacPreviewAsset(
      firstItem?.assets ?? this.collection.assets,
      this.catalogItem.url
    );
    if (previewAsset) {
      const openPreviewImageText =
        i18next.t("preview.openPreviewImage") || "Open preview image";
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.dataPreview") || "Preview",
          content: [
            `![${this.collection.id}](${previewAsset.resolvedHref})`,
            `[${openPreviewImageText}](${previewAsset.resolvedHref})`
          ].join("\n\n")
        })
      );
    }

    const assets = firstItem?.assets ?? this.collection.assets;
    if (assets && Object.keys(assets).length > 0) {
      const assetRequiresLoginText =
        i18next.t("preview.assetRequiresLogin") || "requires login";
      const openAssetLinkText = i18next.t("preview.openAssetLink") || "Open";
      const terrascopeLoginAndDownloadText =
        i18next.t("preview.terrascopeLoginAndDownload") ||
        "Login in Terrascope and download";

      const assetsContent = Object.entries(assets)
        .map(([key, asset]) => {
          const resolvedAssetHref = resolveStacHref(
            asset.href,
            this.catalogItem.url
          );
          const assetAccessLink = getStacAssetAccessLink({
            asset,
            resolvedAssetHref,
            catalogUrl: this.catalogItem.url,
            terrascopeViewerUrl,
            hasAuthenticatedSession:
              this.catalogItem.hasAuthenticatedTerrascopeSession(
                resolvedAssetHref
              )
          });

          const authHint = assetAccessLink.requiresAuthentication
            ? ` (${assetRequiresLoginText})`
            : "";
          const linkText = assetAccessLink.redirectsToTerrascopeLogin
            ? terrascopeLoginAndDownloadText
            : openAssetLinkText;
          const link = assetAccessLink.href
            ? ` - [${linkText}](${assetAccessLink.href})`
            : "";

          return `- **${asset.title || key}**${authHint}: ${
            asset.type || "unknown"
          }${link}`;
        })
        .join("\n");

      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.assets") || "Assets",
          content: assetsContent
        })
      );
    }

    return info;
  }

  @computed
  get featureInfoTemplate():
    | StratumFromTraits<FeatureInfoTemplateTraits>
    | undefined {
    if (!this.catalogItem.canUseTimeSeriesFeatureInfo) {
      return undefined;
    }

    return createStratumInstance(FeatureInfoTemplateTraits, {
      name: "{{name}}",
      template:
        "<h3>{{terria.timeSeries.title}}</h3>{{terria.timeSeries.chart}}",
      showFeatureInfoDownloadWithTemplate: true
    });
  }

  static async load(
    catalogItem: StacCollectionCatalogItem
  ): Promise<StacCollectionStratum> {
    if (!isDefined(catalogItem.url)) {
      throw new Error("STAC collection URL is required");
    }

    const requestHeaders = await getTerrascopeAuthHeaders(
      catalogItem.terria,
      catalogItem.url,
      catalogItem.authConfig
    );
    const collectionUrl = proxyCatalogItemUrl(catalogItem, catalogItem.url);
    const collection = (await loadJson(
      collectionUrl,
      requestHeaders
    )) as StacCollection;

    if (collection.type !== "Collection") {
      throw new Error("Invalid STAC collection: type must be 'Collection'");
    }

    // Try to fetch items to get COG URLs for rendering and item geometries
    let items: StacItem[] = [];
    try {
      const requestOptions = untracked(() => ({
        maximumItems: catalogItem.maximumItems,
        itemsPageSize: catalogItem.itemsPageSize,
        itemsPageLimit: catalogItem.itemsPageLimit,
        dateTimeFilter: catalogItem.dateTimeFilter,
        bboxFilter: catalogItem.bboxFilter,
        sortBy: catalogItem.sortBy,
        filterExpression: catalogItem.filterExpression,
        filterLanguage: catalogItem.filterLanguage,
        intersectsGeometry: catalogItem.intersectsGeometry,
        additionalQueryParameters: catalogItem.additionalQueryParameters,
        itemsQueryMode: catalogItem.itemsQueryMode,
        requestTimeoutSeconds: catalogItem.requestTimeoutSeconds,
        requestRetryAttempts: catalogItem.requestRetryAttempts,
        requestRetryDelaySeconds: catalogItem.requestRetryDelaySeconds,
        requestHeaders
      }));
      const loadedItems = await loadStacItems(catalogItem, {
        collection,
        collectionUrl: catalogItem.url,
        ...requestOptions
      });
      if (loadedItems.length > 0) {
        items = loadedItems as StacItem[];
      }
    } catch (e) {
      console.warn("Failed to fetch STAC items:", e);
    }

    return new StacCollectionStratum(catalogItem, collection, items);
  }
}

StratumOrder.addLoadStratum(StacCollectionStratum.stratumName);

/**
 * A catalog item for STAC Collections.
 * Loads collection metadata and renders COG assets from STAC items.
 */
export default class StacCollectionCatalogItem extends UrlMixin(
  DiscretelyTimeVaryingMixin(
    MappableMixin(
      CatalogMemberMixin(CreateModel(StacCollectionCatalogItemTraits))
    )
  )
) {
  static readonly type = "stac-collection";

  @observable
  _imageryProviders: Array<TIFFImageryProvider | SingleTileImageryProvider> =
    [];

  @observable
  _stacStratum: StacCollectionStratum | undefined;

  @observable
  private _loadError: string | undefined;

  @observable
  private _geoJsonDataSource: GeoJsonDataSource | undefined;

  private _proj4Promise: Promise<any> | undefined;
  private _timeSeriesProviderCache: CachedProviderSet[] = [];

  /**
   * The reprojector function to use for reprojecting non native projections
   */
  reprojector = reprojector;

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel | undefined
  ) {
    super(id, terria, sourceReference);
    makeObservable(this);

    // Destroy imagery providers when `mapItems` is no longer consumed
    onBecomeUnobserved(this, "mapItems", () => {
      this.destroyAllProviders();
    });

    // Re-create imagery providers if `mapItems` is consumed again
    onBecomeObserved(this, "mapItems", () => {
      if (
        this._imageryProviders.length === 0 &&
        !this.isLoadingMapItems &&
        !this._loadError
      ) {
        this.loadMapItems(true);
      }
    });

    reaction(
      () => this.currentDiscreteTimeTag,
      () => {
        if (
          this.canUseTimeSeriesRendering &&
          !this.isLoadingMapItems &&
          this._stacStratum
        ) {
          void this.updateProvidersForCurrentTime();
        }
      }
    );
  }

  get type() {
    return StacCollectionCatalogItem.type;
  }

  get typeName() {
    return i18next.t("models.stac.collectionName") || "STAC Collection";
  }

  @override
  get viewingControls(): ViewingControl[] {
    const controls = [...super.viewingControls];
    if (!this.supportsTerrascopeAuthentication) {
      return controls;
    }

    controls.push({
      id: TerrascopeAuthWorkflow.type,
      name: "Terrascope Login",
      icon: { glyph: Icon.GLYPHS.lock },
      onClick: (viewState) => {
        const session = getTerrascopeAuthSession(
          this.terria,
          this.url,
          this.authConfig
        );
        if (!session) return;

        runWorkflow(
          viewState,
          new TerrascopeAuthWorkflow(this, {
            connect: async ({ username, password }) => {
              await session.loginWithPassword(username, password);
              await this.refreshStacDataFromTraits();
            },
            clear: async () => {
              session.clear();
              await this.refreshStacDataFromTraits();
            },
            isAuthenticated: () => session.isAuthenticated,
            getCurrentUsername: () => session.currentUsername
          })
        );
      }
    });

    return controls;
  }

  @computed
  get authConfig(): TerrascopeAuthConfig | undefined {
    return getDefaultTerrascopeAuthConfig(this.url, {
      mode: this.auth?.mode,
      tokenUrl: this.auth?.tokenUrl,
      clientId: this.auth?.clientId,
      scope: this.auth?.scope,
      tokenPersistence: this.auth?.tokenPersistence?.mode
    });
  }

  @computed
  get supportsTerrascopeAuthentication(): boolean {
    return canUseTerrascopeAuth(this.url, this.authConfig);
  }

  @computed
  get isTimeSeriesEnabled(): boolean {
    return this.timeSeries?.enabled === true;
  }

  @computed
  get timeSeriesEntries(): StacTimeSeriesEntry[] {
    const stratum = this._stacStratum;
    if (!stratum || stratum.items.length === 0) return [];

    const grouped = new Map<string, StacTimeSeriesEntry>();
    stratum.items.forEach((item) => {
      const dateTime = this.getItemDateTime(item);
      if (!dateTime) return;

      const cogAsset = this.findCogAssetForItem(item, stratum.collection);
      if (!cogAsset) return;

      const resolvedHref =
        resolveStacHref(cogAsset.href, this.url) ?? cogAsset.href;
      const existing = grouped.get(dateTime);
      if (existing) {
        if (!existing.cogs.includes(resolvedHref)) {
          existing.cogs.push(resolvedHref);
        }
        existing.requiresAuthentication =
          existing.requiresAuthentication || isStacAssetAuthProtected(cogAsset);
        return;
      }

      grouped.set(dateTime, {
        time: dateTime,
        tag: dateTime,
        cogs: [resolvedHref],
        requiresAuthentication: isStacAssetAuthProtected(cogAsset)
      });
    });

    return Array.from(grouped.values()).sort((left, right) =>
      left.time.localeCompare(right.time)
    );
  }

  @override
  @computed
  get discreteTimes(): DiscreteTimeAsJS[] | undefined {
    if (!this.canUseTimeSeriesRendering) return undefined;
    if (this.timeSeriesEntries.length === 0) return undefined;
    return this.timeSeriesEntries.map((entry) => ({
      time: entry.time,
      tag: entry.tag
    }));
  }

  @computed
  get hasProtectedTimeSeriesAssets(): boolean {
    return this.timeSeriesEntries.some((entry) => entry.requiresAuthentication);
  }

  @computed
  get canUseTimeSeriesRendering(): boolean {
    if (!this.isTimeSeriesEnabled) return false;
    if (this.timeSeriesEntries.length === 0) return false;
    if (!this.hasProtectedTimeSeriesAssets) return true;

    return this.timeSeriesEntries.some((entry) =>
      entry.cogs.some((url) => this.hasAuthenticatedTerrascopeSession(url))
    );
  }

  @computed
  get canUseTimeSeriesFeatureInfo(): boolean {
    return (
      this.canUseTimeSeriesRendering &&
      this.timeSeries?.chartEnabled !== false &&
      this.allowFeaturePicking
    );
  }

  @computed
  get stacCollectionId(): string | undefined {
    return this._stacStratum?.collection.id ?? this.collectionId;
  }

  @computed
  get stacLoadedItemCount(): number {
    return this._stacStratum?.items.length ?? 0;
  }

  @computed
  get stacLoadedDateTimes(): string[] {
    if (this.timeSeriesEntries.length > 0) {
      return this.timeSeriesEntries.map((entry) => entry.time);
    }

    const items = this._stacStratum?.items;
    if (!items || items.length === 0) return [];

    const uniqueDateTimes = new Set<string>();
    items.forEach((item) => {
      const dateTime = this.getItemDateTime(item);
      if (dateTime) uniqueDateTimes.add(dateTime);
    });

    return Array.from(uniqueDateTimes).sort();
  }

  @computed
  get stacSupportsSearch(): boolean {
    if (!this._stacStratum || !this.url) return false;
    return (
      resolveStacSearchUrl(this._stacStratum.collection, this.url) !== undefined
    );
  }

  @computed
  get stacEffectiveItemsQueryMode() {
    return resolveStacItemsQueryMode({
      itemsQueryMode: this.itemsQueryMode,
      filterExpression: this.filterExpression,
      intersectsGeometry: this.intersectsGeometry
    });
  }

  @action
  async refreshStacDataFromTraits(): Promise<void> {
    const stratum = await StacCollectionStratum.load(this);

    runInAction(() => {
      this.destroyAllProviders();
      this._stacStratum = stratum;
      this.strata.set(StacCollectionStratum.stratumName, stratum);
      this._loadError = undefined;
    });

    (await this.loadMapItems(true)).throwIfError();
    this.terria.currentViewer.notifyRepaintRequired();
  }

  @override
  get shortReport(): string | undefined {
    if (this._loadError) {
      return i18next.t("models.stac.loadError", { message: this._loadError });
    }
    if (this.terria.currentViewer.type === "Leaflet") {
      return i18next.t("models.commonModelErrors.3dTypeIn2dMode", this);
    }
    return undefined;
  }

  protected async forceLoadMetadata(): Promise<void> {
    const stratum = await StacCollectionStratum.load(this);
    runInAction(() => {
      this._stacStratum = stratum;
      this.strata.set(StacCollectionStratum.stratumName, stratum);
    });
  }

  @action
  protected async forceLoadMapItems(): Promise<void> {
    // Reset error state
    this._loadError = undefined;
    this.destroyAllProviders();

    const stratum = this._stacStratum;
    if (!stratum) {
      return;
    }

    // Always create the geometry data source for the Collection bbox
    await this.createBboxDataSource(stratum);

    if (this.canUseTimeSeriesRendering) {
      try {
        await this.updateProvidersForCurrentTime();
        return;
      } catch (error) {
        runInAction(() => {
          this._loadError =
            error instanceof Error ? error.message : String(error);
        });
      }
    }

    const cogAsset = this.findCogAsset(stratum);
    const resolvedCogAssetHref = cogAsset
      ? resolveStacHref(cogAsset.href, this.url) ?? cogAsset.href
      : undefined;
    const previewOptions = untracked(() => ({
      previewRequestSizeLimit: this.previewRequestSizeLimit,
      maximumItems: this.maximumItems,
      previewRequestNumberLimit:
        this.previewRequestNumberLimit && this.previewRequestNumberLimit > 0
          ? Math.floor(this.previewRequestNumberLimit)
          : 1,
      credit: this.credit,
      cacheDuration: this.cacheDuration
    }));
    const previewCandidates = this.getPreviewCandidates(
      stratum,
      previewOptions.previewRequestSizeLimit,
      previewOptions.maximumItems
    );
    const hasRenderablePreview = previewCandidates.length > 0;
    const shouldForcePreviewForCog =
      shouldForcePreviewForProtectedTerrascopeAsset({
        asset: cogAsset,
        resolvedAssetHref: resolvedCogAssetHref,
        catalogUrl: this.url,
        hasAuthenticatedSession:
          this.hasAuthenticatedTerrascopeSession(resolvedCogAssetHref)
      });

    if (!cogAsset && !hasRenderablePreview) {
      runInAction(() => {
        this._loadError = i18next.t("models.stac.noCogAssetFound");
      });
      // Don't throw - the bbox geometry will still be shown
      return;
    }

    if (hasRenderablePreview && (!cogAsset || shouldForcePreviewForCog)) {
      try {
        const imageryProviders = this.filterValidImageryProviders(
          await this.createPreviewImageryProviders(
            previewCandidates,
            previewOptions.previewRequestNumberLimit,
            previewOptions.credit,
            previewOptions.cacheDuration
          )
        );
        if (imageryProviders.length > 0) {
          runInAction(() => {
            this._imageryProviders = imageryProviders;
          });
          return;
        }
      } catch (error) {
        console.warn("Failed to load STAC preview image:", error);
      }
    }

    if (!cogAsset) return;

    try {
      const imageryProvider = await this.createImageryProvider(
        resolvedCogAssetHref ?? cogAsset.href
      );
      if (!this.hasValidImageryProviderRectangle(imageryProvider)) {
        throw new Error(
          "STAC imagery provider returned an invalid rectangle for COG rendering."
        );
      }
      runInAction(() => {
        this._imageryProviders = [imageryProvider];
      });
    } catch (error) {
      if (hasRenderablePreview && this.isAuthenticationError(error)) {
        try {
          const imageryProviders = this.filterValidImageryProviders(
            await this.createPreviewImageryProviders(
              previewCandidates,
              previewOptions.previewRequestNumberLimit,
              previewOptions.credit,
              previewOptions.cacheDuration
            )
          );
          if (imageryProviders.length > 0) {
            runInAction(() => {
              this._imageryProviders = imageryProviders;
              this._loadError = undefined;
            });
            return;
          }
        } catch (previewError) {
          console.warn("Failed to load STAC preview image:", previewError);
        }
      }

      runInAction(() => {
        this._loadError =
          error instanceof Error ? error.message : String(error);
      });
      // Don't throw - the bbox geometry will still be shown
      // The error will be shown in shortReport
    }
  }

  /**
   * Create a GeoJSON data source for item geometries or Collection bbox
   */
  private async createBboxDataSource(
    stratum: StacCollectionStratum
  ): Promise<void> {
    const collection = stratum.collection;
    const items = stratum.items;

    // If we have items, show their geometries
    if (items.length > 0) {
      await this.createItemsGeometryDataSource(items, collection);
      return;
    }

    // Fallback: show collection bbox
    const bbox = normalizeStacBbox(collection.extent?.spatial?.bbox?.[0]);
    if (!bbox) {
      return;
    }

    const [west, south, east, north] = bbox;

    // Skip if bbox is degenerate (zero area) - would cause Cesium render errors
    const EPSILON = 0.0001;
    if (Math.abs(west - east) < EPSILON || Math.abs(north - south) < EPSILON) {
      return;
    }

    // Skip global/near-global extents - they don't add visual value and can cause
    // Cesium rendering errors with EllipsoidRhumbLine geometry calculations
    const bboxWidth = Math.abs(east - west);
    const bboxHeight = Math.abs(north - south);
    if (bboxWidth > 300 || bboxHeight > 150) {
      return;
    }

    // Create a GeoJSON polygon from the bbox
    const geojson: GeoJSON.Feature = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south]
          ]
        ]
      },
      properties: {
        name: collection.title || collection.id,
        description: collection.description
      }
    };

    try {
      const dataSource = new GeoJsonDataSource(this.name || collection.id);
      await dataSource.load(geojson, {
        stroke: Color.CYAN,
        strokeWidth: 3,
        fill: Color.CYAN.withAlpha(0.1),
        clampToGround: false
      });

      runInAction(() => {
        this._geoJsonDataSource = dataSource;
      });
    } catch (error) {
      console.warn("Failed to load STAC collection bbox geometry:", error);
    }
  }

  /**
   * Create a GeoJSON data source with geometries from STAC items
   */
  private async createItemsGeometryDataSource(
    items: StacItem[],
    collection: StacCollection
  ): Promise<void> {
    const EPSILON = 0.0001;

    const features: GeoJSON.Feature[] = items
      .filter((item) => {
        // Skip items without valid geometry
        if (!item.geometry) return false;

        // For polygons, check if they have valid (non-degenerate) coordinates
        if (item.geometry.type === "Polygon") {
          const coords = item.geometry.coordinates[0];
          if (!coords || coords.length < 4) return false;

          // Check for degenerate bbox
          const bbox = normalizeStacBbox(item.bbox);
          if (bbox) {
            const [west, south, east, north] = bbox;
            if (
              Math.abs(west - east) < EPSILON ||
              Math.abs(north - south) < EPSILON
            ) {
              return false;
            }
          }
        }

        return true;
      })
      .map((item) => ({
        type: "Feature" as const,
        geometry: item.geometry,
        properties: {
          id: item.id,
          datetime: item.properties.datetime,
          ...item.properties
        }
      }));

    if (features.length === 0) {
      return;
    }

    const featureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features
    };

    try {
      const dataSource = new GeoJsonDataSource(
        this.name || collection.id || "STAC Items"
      );
      await dataSource.load(featureCollection, {
        stroke: Color.CYAN,
        strokeWidth: 2,
        fill: Color.CYAN.withAlpha(0.15),
        clampToGround: false
      });

      runInAction(() => {
        this._geoJsonDataSource = dataSource;
      });
    } catch (error) {
      console.warn("Failed to load STAC items geometry:", error);
    }
  }

  /**
   * Find a COG asset to render
   */
  private findCogAsset(stratum: StacCollectionStratum):
    | {
        key: string;
        href: string;
        "auth:refs"?: string[];
      }
    | undefined {
    const item = stratum.firstItem;
    const collection = stratum.collection;
    const withAuthRefs = (
      key: string,
      href: string
    ): {
      key: string;
      href: string;
      "auth:refs"?: string[];
    } => ({
      key,
      href,
      "auth:refs":
        item?.assets[key]?.["auth:refs"] ??
        collection.item_assets?.[key]?.["auth:refs"] ??
        collection.assets?.[key]?.["auth:refs"]
    });

    if (!item) {
      if (collection.assets) {
        const cogAsset = Object.entries(collection.assets).find(
          ([, asset]) =>
            asset.type?.includes("geotiff") ||
            asset.type?.includes("tiff") ||
            asset.href?.endsWith(".tif") ||
            asset.href?.endsWith(".tiff")
        );
        if (cogAsset) return withAuthRefs(cogAsset[0], cogAsset[1].href);
      }
      return undefined;
    }

    return this.findCogAssetForItem(item, collection, withAuthRefs);
  }

  private findCogAssetForItem(
    item: StacItem,
    collection: StacCollection,
    withAuthRefs: (
      key: string,
      href: string
    ) => {
      key: string;
      href: string;
      "auth:refs"?: string[];
    } = (key, href) => ({
      key,
      href,
      "auth:refs":
        item.assets[key]?.["auth:refs"] ??
        collection.item_assets?.[key]?.["auth:refs"] ??
        collection.assets?.[key]?.["auth:refs"]
    })
  ):
    | {
        key: string;
        href: string;
        "auth:refs"?: string[];
      }
    | undefined {
    const assetKey = this.asset?.assetKey;

    if (assetKey && item.assets[assetKey]?.href) {
      return withAuthRefs(assetKey, item.assets[assetKey].href);
    }

    const renderKey = this.render?.renderKey;
    if (renderKey && collection.renders?.[renderKey]) {
      const render = collection.renders[renderKey];
      const assetName = render.assets?.[0];
      if (assetName && item.assets[assetName]?.href) {
        return withAuthRefs(assetName, item.assets[assetName].href);
      }
    }

    if (collection.renders) {
      const firstRenderEntry = Object.entries(collection.renders)[0];
      if (firstRenderEntry) {
        const [, firstRender] = firstRenderEntry;
        const assetName = firstRender?.assets?.[0];
        if (assetName && item.assets[assetName]?.href) {
          return withAuthRefs(assetName, item.assets[assetName].href);
        }
      }
    }

    const cogAssetEntry = Object.entries(item.assets).find(
      ([, asset]) =>
        asset.type?.includes("geotiff") ||
        asset.type?.includes("tiff") ||
        asset.roles?.includes("data") ||
        asset.href?.endsWith(".tif") ||
        asset.href?.endsWith(".tiff")
    );

    if (!cogAssetEntry) return undefined;

    return withAuthRefs(cogAssetEntry[0], cogAssetEntry[1].href);
  }

  /**
   * Create a TIFFImageryProvider for the given COG URL
   */
  private async createImageryProvider(
    url: string
  ): Promise<TIFFImageryProvider> {
    const [{ default: TIFFImageryProvider }, { default: proj4 }] =
      await Promise.all([
        import("terriajs-tiff-imagery-provider"),
        import("proj4-fully-loaded")
      ]);

    const proxiedUrl = proxyCatalogItemUrl(this, url);
    const renderOptions = this.buildRenderOptions();
    const authHeaders = await getTerrascopeAuthHeaders(
      this.terria,
      url,
      this.authConfig
    );

    return runInAction(() =>
      TIFFImageryProvider.fromUrl(proxiedUrl, {
        credit: this.credit,
        tileSize: this.tileSize,
        maximumLevel: this.maximumLevel,
        minimumLevel: this.minimumLevel,
        enablePickFeatures: this.allowFeaturePicking,
        hasAlphaChannel: this.hasAlphaChannel,
        projFunc: this.reprojector(proj4),
        renderOptions:
          Object.keys(renderOptions).length > 0 ? renderOptions : undefined,
        requestOptions: authHeaders
          ? {
              headers: authHeaders
            }
          : undefined
      })
    );
  }

  private async updateProvidersForCurrentTime(): Promise<void> {
    const currentTime = this.currentDiscreteTimeTag;
    if (!currentTime) {
      runInAction(() => {
        this._imageryProviders = [];
      });
      return;
    }

    const providers = await this.getProvidersForTime(currentTime);
    const validProviders = providers.filter((provider) =>
      this.hasValidImageryProviderRectangle(provider)
    );
    this.decorateTimeSeriesProviders(validProviders);
    runInAction(() => {
      this._imageryProviders = validProviders;
    });
  }

  private async getProvidersForTime(
    timeKey: string
  ): Promise<TIFFImageryProvider[]> {
    const cached = this._timeSeriesProviderCache.find(
      (entry) => entry.timeKey === timeKey
    );
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.providers;
    }

    const entry = this.timeSeriesEntries.find(
      (candidate) => candidate.time === timeKey || candidate.tag === timeKey
    );
    if (!entry) return [];

    const providers = await Promise.all(
      entry.cogs.map((url) => this.createImageryProvider(url))
    );
    const validProviders = providers.filter((provider) =>
      this.hasValidImageryProviderRectangle(provider)
    );
    this._timeSeriesProviderCache.push({
      timeKey,
      providers: validProviders,
      lastAccess: Date.now()
    });
    this.trimTimeSeriesProviderCache();
    return validProviders;
  }

  private trimTimeSeriesProviderCache(): void {
    const maxSize = Math.max(1, this.timeSeries?.providerCacheSize ?? 3);
    if (this._timeSeriesProviderCache.length <= maxSize) {
      return;
    }

    this._timeSeriesProviderCache.sort(
      (left, right) => left.lastAccess - right.lastAccess
    );

    while (this._timeSeriesProviderCache.length > maxSize) {
      const removed = this._timeSeriesProviderCache.shift();
      removed?.providers.forEach((provider) => provider.destroy());
    }
  }

  private decorateTimeSeriesProviders(providers: TIFFImageryProvider[]): void {
    providers.forEach((provider, index) => {
      const providerWithFlags = provider as unknown as {
        [STAC_TIME_SERIES_PICK_FLAG]?: boolean;
        [STAC_TIME_SERIES_PICKER_FLAG]?: boolean;
        [STAC_TIME_SERIES_ORIGINAL_PICK]?:
          | TIFFImageryProvider["pickFeatures"]
          | undefined;
      };

      providerWithFlags[STAC_TIME_SERIES_PICKER_FLAG] = index === 0;
      if (providerWithFlags[STAC_TIME_SERIES_PICK_FLAG]) return;
      providerWithFlags[STAC_TIME_SERIES_PICK_FLAG] = true;

      const originalPickFeatures = provider.pickFeatures?.bind(provider);
      if (!originalPickFeatures) return;
      providerWithFlags[STAC_TIME_SERIES_ORIGINAL_PICK] = originalPickFeatures;

      provider.pickFeatures = async (
        x: number,
        y: number,
        level: number,
        longitude: number,
        latitude: number
      ): Promise<ImageryLayerFeatureInfo[]> => {
        if (!(provider as any)[STAC_TIME_SERIES_PICKER_FLAG]) {
          return [];
        }

        const features =
          (await originalPickFeatures(x, y, level, longitude, latitude)) ?? [];

        if (!this.canUseTimeSeriesFeatureInfo) {
          return features;
        }

        try {
          const csv = await this.buildPointTimeSeriesCsv(
            x,
            y,
            level,
            longitude,
            latitude
          );
          if (!csv) return features;

          const feature = features[0] ?? new ImageryLayerFeatureInfo();
          feature.name =
            this.name ?? this.stacCollectionId ?? "STAC Collection";
          feature.data = csv;
          feature.properties = {
            ...(feature.properties ?? {}),
            currentTime: this.currentDiscreteTimeTag
          } as any;

          return [feature];
        } catch {
          return features;
        }
      };
    });
  }

  private async buildPointTimeSeriesCsv(
    x: number,
    y: number,
    level: number,
    longitude: number,
    latitude: number
  ): Promise<string | undefined> {
    const rows = ["time,value"];

    for (const entry of this.timeSeriesEntries) {
      const providers = await this.getProvidersForTime(entry.time);
      const sample = await this.sampleProvidersAtLocation(
        providers,
        x,
        y,
        level,
        longitude,
        latitude
      );
      if (sample !== undefined) {
        rows.push(`${entry.time},${sample}`);
      }
    }

    return rows.length > 1 ? rows.join("\n") : undefined;
  }

  private async sampleProvidersAtLocation(
    providers: TIFFImageryProvider[],
    x: number,
    y: number,
    level: number,
    longitude: number,
    latitude: number
  ): Promise<number | undefined> {
    for (const provider of providers) {
      const rawPickFeatures = (provider as any)[
        STAC_TIME_SERIES_ORIGINAL_PICK
      ] as TIFFImageryProvider["pickFeatures"] | undefined;
      const features = await rawPickFeatures?.(
        x,
        y,
        level,
        longitude,
        latitude
      );
      const value = this.extractValueFromPickedFeatures(provider, features);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private extractValueFromPickedFeatures(
    provider: TIFFImageryProvider,
    features: ImageryLayerFeatureInfo[] | undefined
  ): number | undefined {
    const data = features?.[0]?.data;
    if (!data || typeof data !== "object") return undefined;

    const valueBand =
      this.timeSeries?.valueBand ?? this.renderOptions?.single?.band;
    if (typeof valueBand === "number") {
      const sampleIndex = this.getSampleIndexForBand(provider, valueBand);
      const candidate = (data as Record<string, unknown>)[String(sampleIndex)];
      if (typeof candidate === "number" && !Number.isNaN(candidate)) {
        return candidate;
      }
    }

    for (const value of Object.values(data as Record<string, unknown>)) {
      if (typeof value === "number" && !Number.isNaN(value)) {
        return value;
      }
    }

    return undefined;
  }

  private getSampleIndexForBand(
    provider: TIFFImageryProvider,
    band?: number
  ): number {
    const samples = (provider as any).readSamples;
    const zeroBased = (band ?? 1) - 1;
    if (Array.isArray(samples)) {
      const index = samples.indexOf(zeroBased);
      if (index >= 0) return index;
    }
    return 0;
  }

  /**
   * Create a SingleTileImageryProvider for a preview image
   */
  private async createPreviewImageryProvider(
    previewUrls: string[],
    bbox: number[],
    credit: string | undefined,
    cacheDuration: string | undefined
  ): Promise<SingleTileImageryProvider> {
    if (previewUrls.length === 0) {
      throw new Error("No preview URLs available for STAC preview rendering.");
    }

    const validPreviewBbox = normalizeStacBbox(bbox);
    if (!validPreviewBbox || validPreviewBbox[2] <= validPreviewBbox[0]) {
      throw new Error(
        `Invalid STAC preview bbox: ${JSON.stringify(
          bbox
        )}. Expected west < east in WGS84 degrees.`
      );
    }

    const [west, south, east, north] = validPreviewBbox;
    const rectangle = Rectangle.fromDegrees(west, south, east, north);

    let lastError: unknown;
    for (const previewUrl of previewUrls) {
      const candidateUrls = this.getPreviewRequestUrls(
        previewUrl,
        cacheDuration
      );

      for (const candidateUrl of candidateUrls) {
        try {
          const provider = await SingleTileImageryProvider.fromUrl(
            candidateUrl,
            {
              rectangle,
              credit
            }
          );
          if (!this.hasValidPreviewImageryProvider(provider)) {
            throw new Error(
              `Preview imagery provider for ${candidateUrl} has invalid dimensions or rectangle.`
            );
          }
          return provider;
        } catch (error) {
          lastError = error;
        }
      }
    }

    throw (
      lastError ??
      new Error(
        `Failed to load preview imagery provider for candidates: ${previewUrls.join(
          ", "
        )}`
      )
    );
  }

  private getPreviewCandidates(
    stratum: StacCollectionStratum,
    previewRequestSizeLimit: number | undefined = this.previewRequestSizeLimit,
    maximumItems: number | undefined = this.maximumItems
  ): StacPreviewCandidate[] {
    const previewCandidates: StacPreviewCandidate[] = [];

    if (stratum.items.length > 0) {
      stratum.items.forEach((item) => {
        const bbox = normalizeStacBbox(item.bbox);
        if (!bbox) return;
        const previewAssets = findStacPreviewAssets(item.assets, this.url);
        if (previewAssets.length === 0) return;
        const hrefs = Array.from(
          new Set(
            previewAssets.map((previewAsset) => previewAsset.resolvedHref)
          )
        );
        if (hrefs.length === 0) return;

        const projectedBbox = normalizeStacRawBbox(
          item.properties?.["proj:bbox"] as number[] | undefined
        );
        const projectedCode =
          typeof item.properties?.["proj:code"] === "string"
            ? item.properties["proj:code"]
            : undefined;

        previewCandidates.push({
          hrefs,
          bbox,
          projectedBbox,
          projectedCode
        });
      });
    }

    if (previewCandidates.length === 0) {
      const firstItem = stratum.firstItem;
      const previewAsset = findStacPreviewAsset(
        firstItem?.assets ?? stratum.collection.assets,
        this.url
      );
      const previewBbox =
        normalizeStacBbox(firstItem?.bbox) ??
        normalizeStacBbox(stratum.collection.extent?.spatial?.bbox?.[0]);
      if (previewAsset && previewBbox) {
        previewCandidates.push({
          hrefs: [previewAsset.resolvedHref],
          bbox: previewBbox
        });
      }
    }

    const deduplicatedByUrlAndBbox = new Map<string, StacPreviewCandidate>();
    previewCandidates.forEach((candidate) => {
      const projectedKey =
        candidate.projectedBbox && candidate.projectedCode
          ? `|${candidate.projectedCode}|${candidate.projectedBbox.join(",")}`
          : "";
      const key = `${candidate.hrefs.join("|")}|${candidate.bbox.join(
        ","
      )}${projectedKey}`;
      deduplicatedByUrlAndBbox.set(key, candidate);
    });

    const candidates = Array.from(deduplicatedByUrlAndBbox.values());
    const requestSizeLimit =
      previewRequestSizeLimit !== undefined && previewRequestSizeLimit > 0
        ? Math.floor(previewRequestSizeLimit)
        : maximumItems !== undefined && maximumItems > 0
        ? Math.floor(maximumItems)
        : candidates.length;

    return candidates.slice(0, requestSizeLimit);
  }

  private async createPreviewImageryProviders(
    previewCandidates: StacPreviewCandidate[],
    requestNumberLimit: number,
    credit: string | undefined,
    cacheDuration: string | undefined
  ): Promise<SingleTileImageryProvider[]> {
    const imageryProviders: SingleTileImageryProvider[] = [];

    for (let i = 0; i < previewCandidates.length; i += requestNumberLimit) {
      const chunk = previewCandidates.slice(i, i + requestNumberLimit);
      const chunkProviders: Array<SingleTileImageryProvider | undefined> =
        await Promise.all(
          chunk.map(async (candidate) => {
            try {
              const candidateBbox = await this.resolvePreviewCandidateBbox(
                candidate
              );
              return await this.createPreviewImageryProvider(
                candidate.hrefs,
                candidateBbox,
                credit,
                cacheDuration
              );
            } catch (error) {
              console.warn("Failed to load STAC preview image:", error);
              return undefined;
            }
          })
        );
      chunkProviders.forEach(
        (provider: SingleTileImageryProvider | undefined) => {
          if (provider) imageryProviders.push(provider);
        }
      );
    }

    return imageryProviders;
  }

  private async resolvePreviewCandidateBbox(
    candidate: StacPreviewCandidate
  ): Promise<number[]> {
    if (!candidate.projectedBbox || !candidate.projectedCode) {
      return candidate.bbox;
    }

    const transformedBbox = await this.transformProjectedBboxToWgs84(
      candidate.projectedBbox,
      candidate.projectedCode
    );

    return transformedBbox ?? candidate.bbox;
  }

  private async transformProjectedBboxToWgs84(
    projectedBbox: number[],
    projectionCode: string
  ): Promise<number[] | undefined> {
    const normalizedProjectionCode =
      this.normalizeProjectionCode(projectionCode);
    if (!normalizedProjectionCode) return undefined;

    if (normalizedProjectionCode === "EPSG:4326") {
      return normalizeStacBbox(projectedBbox);
    }

    try {
      const proj4 = await this.getProj4();
      const [west, south, east, north] = projectedBbox;
      const southwest = proj4(normalizedProjectionCode, "EPSG:4326", [
        west,
        south
      ]);
      const northeast = proj4(normalizedProjectionCode, "EPSG:4326", [
        east,
        north
      ]);
      if (!Array.isArray(southwest) || !Array.isArray(northeast)) {
        return undefined;
      }
      return normalizeStacBbox([
        southwest[0],
        southwest[1],
        northeast[0],
        northeast[1]
      ]);
    } catch {
      return undefined;
    }
  }

  private normalizeProjectionCode(projectionCode: string): string | undefined {
    const trimmedCode = projectionCode.trim().toUpperCase();
    if (/^EPSG:\d+$/.test(trimmedCode)) return trimmedCode;
    if (/^\d+$/.test(trimmedCode)) return `EPSG:${trimmedCode}`;
    return undefined;
  }

  private async getProj4(): Promise<any> {
    if (!this._proj4Promise) {
      this._proj4Promise = import("proj4-fully-loaded").then(
        (module) => module.default
      );
    }
    return this._proj4Promise;
  }

  private getPreviewRequestUrls(
    previewUrl: string,
    cacheDuration: string | undefined
  ): string[] {
    const requestUrls = new Set<string>();
    requestUrls.add(proxyCatalogItemUrl(this, previewUrl));

    const corsProxy = this.terria.corsProxy;
    if (corsProxy) {
      try {
        requestUrls.add(corsProxy.getURL(previewUrl, cacheDuration));
      } catch {
        // Ignore proxy URL generation errors and continue with remaining candidates.
      }
    }

    requestUrls.add(previewUrl);

    return Array.from(requestUrls);
  }

  private getItemDateTime(item: StacItem): string | undefined {
    const dateTime =
      typeof item.properties?.datetime === "string"
        ? item.properties.datetime
        : typeof item.properties?.start_datetime === "string"
        ? item.properties.start_datetime
        : typeof item.properties?.end_datetime === "string"
        ? item.properties.end_datetime
        : undefined;

    const normalizedDateTime = dateTime?.trim();
    return normalizedDateTime && normalizedDateTime.length > 0
      ? normalizedDateTime
      : undefined;
  }

  private hasValidPreviewImageryProvider(
    imageryProvider: SingleTileImageryProvider
  ): boolean {
    const providerWithDimensions = imageryProvider as unknown as {
      tileWidth?: number;
      tileHeight?: number;
    };

    return (
      this.hasValidImageryProviderRectangle(imageryProvider) &&
      Number.isFinite(providerWithDimensions.tileWidth) &&
      Number.isFinite(providerWithDimensions.tileHeight) &&
      (providerWithDimensions.tileWidth ?? 0) > 0 &&
      (providerWithDimensions.tileHeight ?? 0) > 0
    );
  }

  private hasValidImageryProviderRectangle(
    imageryProvider: TIFFImageryProvider | SingleTileImageryProvider
  ): boolean {
    return hasValidCesiumRectangle(
      (imageryProvider as unknown as { rectangle?: Rectangle | undefined })
        .rectangle
    );
  }

  private filterValidImageryProviders(
    imageryProviders: Array<TIFFImageryProvider | SingleTileImageryProvider>
  ): Array<TIFFImageryProvider | SingleTileImageryProvider> {
    return imageryProviders.filter((provider) =>
      this.hasValidImageryProviderRectangle(provider)
    );
  }

  private isAuthenticationError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /(401|403|unauthori[sz]ed|forbidden)/i.test(message);
  }

  /**
   * Build render options from STAC metadata and user configuration
   */
  private buildRenderOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    // Apply render options from traits
    if (this.renderOptions) {
      const singleOptions = this.renderOptions.single;
      if (singleOptions) {
        const single: Record<string, unknown> = {};

        if (singleOptions.band !== undefined) {
          single.band = singleOptions.band;
        }
        if (singleOptions.colorScale !== undefined) {
          single.colorScale = singleOptions.colorScale;
        }
        if (singleOptions.colors !== undefined) {
          single.colors = singleOptions.colors;
        }
        if (singleOptions.domain !== undefined) {
          single.domain = singleOptions.domain;
        }
        if (singleOptions.displayRange !== undefined) {
          single.displayRange = singleOptions.displayRange;
        }
        if (singleOptions.type !== undefined) {
          single.type = singleOptions.type;
        }

        if (Object.keys(single).length > 0) {
          options.single = single;
        }
      }

      if (this.renderOptions.nodata !== undefined) {
        options.nodata = this.renderOptions.nodata;
      }
      if (this.renderOptions.convertToRGB !== undefined) {
        options.convertToRGB = this.renderOptions.convertToRGB;
      }
      if (this.renderOptions.resampleMethod !== undefined) {
        options.resampleMethod = this.renderOptions.resampleMethod;
      }
    }

    // Try to get render configuration from STAC collection
    if (this._stacStratum && Object.keys(options).length === 0) {
      const collection = this._stacStratum.collection;
      const renderKey = this.render?.renderKey;
      const renderConfig = renderKey
        ? collection.renders?.[renderKey]
        : collection.renders
        ? Object.values(collection.renders)[0]
        : undefined;

      if (renderConfig) {
        const single: Record<string, unknown> = {};

        if (renderConfig.rescale && renderConfig.rescale.length > 0) {
          single.domain = renderConfig.rescale[0];
        }

        if (renderConfig.colormap_name || this.render?.colormapName) {
          // Map common STAC colormap names to COG color scales
          const colormapName =
            this.render?.colormapName || renderConfig.colormap_name;
          single.colorScale = this.mapColormapName(colormapName);
        }

        if (Object.keys(single).length > 0) {
          options.single = single;
        }
      }
    }

    return options;
  }

  /**
   * Map STAC colormap names to COG color scale names
   */
  private mapColormapName(name?: string): string | undefined {
    if (!name) return undefined;

    // Common mappings
    const mappings: Record<string, string> = {
      viridis: "viridis",
      plasma: "plasma",
      inferno: "inferno",
      magma: "magma",
      cividis: "viridis",
      jet: "jet",
      rainbow: "rainbow",
      hot: "hot",
      cool: "cool",
      spring: "spring",
      summer: "summer",
      autumn: "autumn",
      winter: "winter",
      greys: "greys",
      greens: "greens",
      blues: "ylgnbu",
      reds: "ylorrd",
      rdbu: "rdbu"
    };

    return mappings[name.toLowerCase()] || name;
  }

  @computed
  get featureInfoContext() {
    return this.canUseTimeSeriesFeatureInfo
      ? csvFeatureInfoContext(this)
      : () => ({});
  }

  hasAuthenticatedTerrascopeSession(url: string | undefined): boolean {
    const session = getTerrascopeAuthSession(this.terria, url, this.authConfig);
    return session?.isAuthenticated === true;
  }

  private destroyAllProviders(): void {
    const allProviders = new Set<
      TIFFImageryProvider | SingleTileImageryProvider
    >();
    this._imageryProviders.forEach((provider) => allProviders.add(provider));
    this._timeSeriesProviderCache.forEach((entry) =>
      entry.providers.forEach((provider) => allProviders.add(provider))
    );

    allProviders.forEach((provider) => {
      const maybeDestroyable = provider as unknown as {
        destroy?: () => void;
      };
      if (typeof maybeDestroyable.destroy === "function") {
        maybeDestroyable.destroy();
      }
    });
    this._imageryProviders = [];
    this._timeSeriesProviderCache = [];
  }

  @computed get mapItems(): MapItem[] {
    const result: MapItem[] = [];

    // Add the geometry data source (bbox)
    const dataSource = this._geoJsonDataSource;
    if (dataSource) {
      result.push(dataSource);
    }

    // Add imagery providers if available
    this._imageryProviders.forEach((imageryProvider) => {
      if (!this.hasValidImageryProviderRectangle(imageryProvider)) {
        return;
      }

      const clippingRectangle =
        imageryProvider instanceof SingleTileImageryProvider
          ? undefined
          : hasValidCesiumRectangle(this.cesiumRectangle)
          ? this.cesiumRectangle
          : undefined;

      result.push({
        show: this.show,
        alpha: this.opacity,
        imageryProvider: imageryProvider as any,
        clippingRectangle
      });
    });

    return result;
  }
}

/**
 * Function returning a custom reprojector
 */
function reprojector(proj4: unknown) {
  return (code: number) => {
    if (![4326, 3857, 900913].includes(code)) {
      try {
        const prj = (
          proj4 as (
            from: string,
            to: string
          ) => {
            forward: (coord: number[]) => number[];
            inverse: (coord: number[]) => number[];
          }
        )("EPSG:4326", `EPSG:${code}`);
        if (prj)
          return {
            project: prj.forward,
            unproject: prj.inverse
          };
      } catch (e) {
        console.error(e);
      }
    }
  };
}
