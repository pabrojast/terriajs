import i18next from "i18next";
import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  override,
  runInAction
} from "mobx";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import Color from "terriajs-cesium/Source/Core/Color";
import GeoJsonDataSource from "terriajs-cesium/Source/DataSources/GeoJsonDataSource";
import SingleTileImageryProvider from "terriajs-cesium/Source/Scene/SingleTileImageryProvider";
import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import isDefined from "../../../Core/isDefined";
import loadJson from "../../../Core/loadJson";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import MappableMixin, { MapItem } from "../../../ModelMixins/MappableMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import { InfoSectionTraits } from "../../../Traits/TraitsClasses/CatalogMemberTraits";
import StacCollectionCatalogItemTraits from "../../../Traits/TraitsClasses/StacCollectionCatalogItemTraits";
import { RectangleTraits } from "../../../Traits/TraitsClasses/MappableTraits";
import CreateModel from "../../Definition/CreateModel";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import StratumOrder from "../../Definition/StratumOrder";
import Terria from "../../Terria";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";
import {
  buildTerrascopeViewerUrl,
  findStacPreviewAsset,
  getStacAssetAccessLink,
  resolveStacHref,
  shouldForcePreviewForProtectedTerrascopeAsset
} from "./stacAssetUtils";

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

/**
 * STAC Items response (FeatureCollection)
 */
interface StacItemsResponse {
  type: "FeatureCollection";
  features: StacItem[];
  links?: Array<{
    rel: string;
    href: string;
    type?: string;
  }>;
  numberMatched?: number;
  numberReturned?: number;
}

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
    const imageryRectangle = this.catalogItem._imageryProviders[0]?.rectangle;
    if (imageryRectangle) {
      const { west, south, east, north } = imageryRectangle;
      return {
        west: CesiumMath.toDegrees(west),
        south: CesiumMath.toDegrees(south),
        east: CesiumMath.toDegrees(east),
        north: CesiumMath.toDegrees(north)
      };
    }

    // Fall back to collection extent
    const bbox = this.collection.extent?.spatial?.bbox?.[0];
    if (bbox && bbox.length >= 4) {
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
      firstItem?.bbox && firstItem.bbox.length >= 4
        ? firstItem.bbox
        : this.collection.extent?.spatial?.bbox?.[0];
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
            terrascopeViewerUrl
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

  static async load(
    catalogItem: StacCollectionCatalogItem
  ): Promise<StacCollectionStratum> {
    if (!isDefined(catalogItem.url)) {
      throw new Error("STAC collection URL is required");
    }

    const collectionUrl = proxyCatalogItemUrl(catalogItem, catalogItem.url);
    const collection = (await loadJson(collectionUrl)) as StacCollection;

    if (collection.type !== "Collection") {
      throw new Error("Invalid STAC collection: type must be 'Collection'");
    }

    // Try to fetch items to get COG URLs for rendering and item geometries
    let items: StacItem[] = [];
    const itemsLink = collection.links.find((link) => link.rel === "items");

    if (itemsLink) {
      try {
        const itemsUrl = new URL(itemsLink.href, catalogItem.url).href;
        const limit = catalogItem.maximumItems ?? 10;
        const itemsUrlWithParams = new URL(itemsUrl);
        itemsUrlWithParams.searchParams.set("limit", String(limit));

        // Add datetime filter if specified
        if (catalogItem.dateTimeFilter) {
          itemsUrlWithParams.searchParams.set(
            "datetime",
            catalogItem.dateTimeFilter
          );
        }

        // Add bbox filter if specified
        if (catalogItem.bboxFilter && catalogItem.bboxFilter.length >= 4) {
          itemsUrlWithParams.searchParams.set(
            "bbox",
            catalogItem.bboxFilter.join(",")
          );
        }

        const itemsResponse = (await loadJson(
          proxyCatalogItemUrl(catalogItem, itemsUrlWithParams.href)
        )) as StacItemsResponse;

        if (itemsResponse.features && itemsResponse.features.length > 0) {
          items = itemsResponse.features;
        }
      } catch (e) {
        console.warn("Failed to fetch STAC items:", e);
      }
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
  MappableMixin(
    CatalogMemberMixin(CreateModel(StacCollectionCatalogItemTraits))
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
      this._imageryProviders.forEach((provider) => {
        const maybeDestroyable = provider as unknown as {
          destroy?: () => void;
        };
        if (typeof maybeDestroyable.destroy === "function") {
          maybeDestroyable.destroy();
        }
      });
      this._imageryProviders = [];
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
  }

  get type() {
    return StacCollectionCatalogItem.type;
  }

  get typeName() {
    return i18next.t("models.stac.collectionName") || "STAC Collection";
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
    this._imageryProviders = [];

    const stratum = this._stacStratum;
    if (!stratum) {
      return;
    }

    // Always create the geometry data source for the Collection bbox
    await this.createBboxDataSource(stratum);

    const cogAsset = this.findCogAsset(stratum);
    const resolvedCogAssetHref = cogAsset
      ? resolveStacHref(cogAsset.href, this.url) ?? cogAsset.href
      : undefined;
    const previewCandidates = this.getPreviewCandidates(stratum);
    const hasRenderablePreview = previewCandidates.length > 0;
    const shouldForcePreviewForCog =
      shouldForcePreviewForProtectedTerrascopeAsset({
        asset: cogAsset,
        resolvedAssetHref: resolvedCogAssetHref,
        catalogUrl: this.url
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
        const imageryProviders = await this.createPreviewImageryProviders(
          previewCandidates
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
      runInAction(() => {
        this._imageryProviders = [imageryProvider];
      });
    } catch (error) {
      if (hasRenderablePreview && this.isAuthenticationError(error)) {
        try {
          const imageryProviders = await this.createPreviewImageryProviders(
            previewCandidates
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
    const bbox = collection.extent?.spatial?.bbox?.[0];

    if (!bbox || bbox.length < 4) {
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
      console.log(
        `Skipping bbox display for ${collection.id}: extent too large (${bboxWidth}° x ${bboxHeight}°)`
      );
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
          if (item.bbox && item.bbox.length >= 4) {
            const [west, south, east, north] = item.bbox;
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

      console.log(
        `Loaded ${features.length} item geometries for ${collection.id}`
      );
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

    // Determine which asset to use
    const assetKey = this.asset?.assetKey;

    if (assetKey && item.assets[assetKey]?.href) {
      return withAuthRefs(assetKey, item.assets[assetKey].href);
    }

    // Try to find asset from renders extension
    const renderKey = this.render?.renderKey;
    if (renderKey && collection.renders?.[renderKey]) {
      const render = collection.renders[renderKey];
      const assetName = render.assets?.[0];
      if (assetName && item.assets[assetName]?.href) {
        return withAuthRefs(assetName, item.assets[assetName].href);
      }
    }

    // Try first render if available
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

    // Find first COG asset
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
    console.log(`STAC: Loading COG from: ${url}`);

    const [{ default: TIFFImageryProvider }, { default: proj4 }] =
      await Promise.all([
        import("terriajs-tiff-imagery-provider"),
        import("proj4-fully-loaded")
      ]);

    const proxiedUrl = proxyCatalogItemUrl(this, url);
    console.log(`STAC: Proxied URL: ${proxiedUrl}`);

    // Build render options from traits
    const renderOptions = this.buildRenderOptions();
    console.log(`STAC: Render options:`, renderOptions);

    try {
      const imageryProvider = await runInAction(() =>
        TIFFImageryProvider.fromUrl(proxiedUrl, {
          credit: this.credit,
          tileSize: this.tileSize,
          maximumLevel: this.maximumLevel,
          minimumLevel: this.minimumLevel,
          enablePickFeatures: this.allowFeaturePicking,
          hasAlphaChannel: this.hasAlphaChannel,
          projFunc: this.reprojector(proj4),
          renderOptions:
            Object.keys(renderOptions).length > 0 ? renderOptions : undefined
        })
      );

      console.log(`STAC: COG loaded successfully`);
      return imageryProvider;
    } catch (error) {
      console.error(`STAC: Failed to load COG from ${url}:`, error);
      throw new Error(
        `Failed to load STAC imagery: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create a SingleTileImageryProvider for a preview image
   */
  private async createPreviewImageryProvider(
    previewUrl: string,
    bbox: number[]
  ): Promise<SingleTileImageryProvider> {
    const [west, south, east, north] = bbox;

    return SingleTileImageryProvider.fromUrl(
      proxyCatalogItemUrl(this, previewUrl),
      {
        rectangle: Rectangle.fromDegrees(west, south, east, north),
        credit: this.credit
      }
    );
  }

  private getPreviewCandidates(
    stratum: StacCollectionStratum
  ): Array<{ href: string; bbox: number[] }> {
    const previewCandidates: Array<{ href: string; bbox: number[] }> = [];

    if (stratum.items.length > 0) {
      stratum.items.forEach((item) => {
        if (!item.bbox || item.bbox.length < 4) return;
        const previewAsset = findStacPreviewAsset(item.assets, this.url);
        if (!previewAsset) return;
        previewCandidates.push({
          href: previewAsset.resolvedHref,
          bbox: item.bbox.slice(0, 4)
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
        firstItem?.bbox && firstItem.bbox.length >= 4
          ? firstItem.bbox
          : stratum.collection.extent?.spatial?.bbox?.[0];
      if (previewAsset && previewBbox && previewBbox.length >= 4) {
        previewCandidates.push({
          href: previewAsset.resolvedHref,
          bbox: previewBbox.slice(0, 4)
        });
      }
    }

    const deduplicatedByUrlAndBbox = new Map<
      string,
      { href: string; bbox: number[] }
    >();
    previewCandidates.forEach((candidate) => {
      const key = `${candidate.href}|${candidate.bbox.join(",")}`;
      deduplicatedByUrlAndBbox.set(key, candidate);
    });

    const candidates = Array.from(deduplicatedByUrlAndBbox.values());
    const requestSizeLimit =
      this.previewRequestSizeLimit && this.previewRequestSizeLimit > 0
        ? Math.floor(this.previewRequestSizeLimit)
        : candidates.length;

    return candidates.slice(0, requestSizeLimit);
  }

  private async createPreviewImageryProviders(
    previewCandidates: Array<{ href: string; bbox: number[] }>
  ): Promise<SingleTileImageryProvider[]> {
    const imageryProviders: SingleTileImageryProvider[] = [];
    const requestNumberLimit =
      this.previewRequestNumberLimit && this.previewRequestNumberLimit > 0
        ? Math.floor(this.previewRequestNumberLimit)
        : 1;

    for (let i = 0; i < previewCandidates.length; i += requestNumberLimit) {
      const chunk = previewCandidates.slice(i, i + requestNumberLimit);
      const chunkProviders = await Promise.all(
        chunk.map(async (candidate) => {
          try {
            return await this.createPreviewImageryProvider(
              candidate.href,
              candidate.bbox
            );
          } catch (error) {
            console.warn("Failed to load STAC preview image:", error);
            return undefined;
          }
        })
      );
      chunkProviders.forEach((provider) => {
        if (provider) imageryProviders.push(provider);
      });
    }

    return imageryProviders;
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

  @computed get mapItems(): MapItem[] {
    const result: MapItem[] = [];

    // Add the geometry data source (bbox)
    const dataSource = this._geoJsonDataSource;
    if (dataSource) {
      result.push(dataSource);
    }

    // Add imagery providers if available
    this._imageryProviders.forEach((imageryProvider) => {
      const clippingRectangle =
        imageryProvider instanceof SingleTileImageryProvider
          ? undefined
          : this.cesiumRectangle;

      result.push({
        show: this.show,
        alpha: this.opacity,
        // @ts-expect-error - TIFFImageryProvider has a compatible runtime API but stricter TS typing than Cesium ImageryProvider
        imageryProvider,
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
