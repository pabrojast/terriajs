import i18next from "i18next";
import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  override,
  runInAction,
  untracked
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
import StacItemCatalogItemTraits from "../../../Traits/TraitsClasses/StacItemCatalogItemTraits";
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
  findStacPreviewAssets,
  getStacAssetAccessLink,
  hasValidCesiumRectangle,
  normalizeStacBbox,
  normalizeStacRawBbox,
  resolveStacHref,
  shouldForcePreviewForProtectedTerrascopeAsset
} from "./stacAssetUtils";

/**
 * STAC Item JSON structure
 */
interface StacItem {
  id: string;
  type: "Feature";
  stac_version: string;
  stac_extensions?: string[];
  collection?: string;
  geometry: GeoJSON.Geometry;
  bbox?: number[];
  properties: {
    title?: string;
    description?: string;
    datetime?: string | null;
    start_datetime?: string;
    end_datetime?: string;
    providers?: Array<{
      name: string;
      roles?: string[];
      url?: string;
    }>;
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
 * Loadable stratum for STAC Item
 */
class StacItemStratum extends LoadableStratum(StacItemCatalogItemTraits) {
  static stratumName = "stac-item-stratum";

  constructor(
    readonly catalogItem: StacItemCatalogItem,
    readonly item: StacItem
  ) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new StacItemStratum(model as StacItemCatalogItem, this.item) as this;
  }

  @computed
  get name(): string | undefined {
    return this.item.properties?.title || this.item.id;
  }

  @computed
  get description(): string | undefined {
    return this.item.properties?.description;
  }

  @computed
  get rectangle(): StratumFromTraits<RectangleTraits> | undefined {
    // First try to get rectangle from the imagery provider if available
    const imageryRectangle = this.catalogItem._imageryProvider?.rectangle;
    if (hasValidCesiumRectangle(imageryRectangle)) {
      const { west, south, east, north } = imageryRectangle;
      return {
        west: CesiumMath.toDegrees(west),
        south: CesiumMath.toDegrees(south),
        east: CesiumMath.toDegrees(east),
        north: CesiumMath.toDegrees(north)
      };
    }

    // Fall back to item bbox
    const bbox = normalizeStacBbox(this.item.bbox);
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
  get itemId(): string {
    return this.item.id;
  }

  @computed
  get credit(): string | undefined {
    const providers = this.item.properties?.providers;
    if (providers && Array.isArray(providers) && providers.length > 0) {
      return providers.map((p) => p.name).join(", ");
    }
    return undefined;
  }

  @computed
  get info(): StratumFromTraits<InfoSectionTraits>[] {
    const info: StratumFromTraits<InfoSectionTraits>[] = [];
    const terrascopeViewerUrl = buildTerrascopeViewerUrl({
      collectionId: this.item.collection,
      bbox: normalizeStacBbox(this.item.bbox),
      datetime: this.item.properties?.datetime
    });

    if (this.item.collection) {
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.collection") || "Collection",
          content: this.item.collection
        })
      );
    }

    const datetime = this.item.properties?.datetime;
    if (datetime) {
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.dateTime") || "Date/Time",
          content: datetime
        })
      );
    }

    const providers = this.item.properties?.providers;
    if (providers && Array.isArray(providers) && providers.length > 0) {
      const providersContent = providers
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

    const previewAsset = findStacPreviewAsset(
      this.item.assets,
      this.catalogItem.url
    );
    if (previewAsset) {
      const openPreviewImageText =
        i18next.t("preview.openPreviewImage") || "Open preview image";
      info.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("preview.dataPreview") || "Preview",
          content: [
            `![${this.item.id}](${previewAsset.resolvedHref})`,
            `[${openPreviewImageText}](${previewAsset.resolvedHref})`
          ].join("\n\n")
        })
      );
    }

    // List available assets
    const assetNames = Object.keys(this.item.assets);
    if (assetNames.length > 0) {
      const assetRequiresLoginText =
        i18next.t("preview.assetRequiresLogin") || "requires login";
      const openAssetLinkText = i18next.t("preview.openAssetLink") || "Open";
      const terrascopeLoginAndDownloadText =
        i18next.t("preview.terrascopeLoginAndDownload") ||
        "Login in Terrascope and download";

      const assetsContent = assetNames
        .map((key) => {
          const asset = this.item.assets[key];
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
    catalogItem: StacItemCatalogItem
  ): Promise<StacItemStratum> {
    if (!isDefined(catalogItem.url)) {
      throw new Error("STAC item URL is required");
    }

    const itemUrl = proxyCatalogItemUrl(catalogItem, catalogItem.url);
    const item = (await loadJson(itemUrl)) as StacItem;

    if (item.type !== "Feature") {
      throw new Error("Invalid STAC item: type must be 'Feature'");
    }

    return new StacItemStratum(catalogItem, item);
  }
}

StratumOrder.addLoadStratum(StacItemStratum.stratumName);

/**
 * A catalog item for individual STAC Items.
 * Loads item metadata and renders COG assets.
 */
export default class StacItemCatalogItem extends UrlMixin(
  MappableMixin(CatalogMemberMixin(CreateModel(StacItemCatalogItemTraits)))
) {
  static readonly type = "stac-item";

  @observable
  _imageryProvider: TIFFImageryProvider | SingleTileImageryProvider | undefined;

  @observable
  _stacStratum: StacItemStratum | undefined;

  @observable
  private _loadError: string | undefined;

  @observable
  private _geoJsonDataSource: GeoJsonDataSource | undefined;

  private _proj4Promise: Promise<any> | undefined;

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

    // Destroy the imageryProvider when `mapItems` is no longer consumed
    onBecomeUnobserved(this, "mapItems", () => {
      if (this._imageryProvider) {
        const maybeDestroyable = this._imageryProvider as unknown as {
          destroy?: () => void;
        };
        if (typeof maybeDestroyable.destroy === "function") {
          maybeDestroyable.destroy();
        }
        this._imageryProvider = undefined;
      }
    });

    // Re-create the imageryProvider if `mapItems` is consumed again
    onBecomeObserved(this, "mapItems", () => {
      if (
        !this._imageryProvider &&
        !this.isLoadingMapItems &&
        !this._loadError
      ) {
        this.loadMapItems(true);
      }
    });
  }

  get type() {
    return StacItemCatalogItem.type;
  }

  get typeName() {
    return i18next.t("models.stac.itemName") || "STAC Item";
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
    const stratum = await StacItemStratum.load(this);
    runInAction(() => {
      this._stacStratum = stratum;
      this.strata.set(StacItemStratum.stratumName, stratum);
    });
  }

  @action
  protected async forceLoadMapItems(): Promise<void> {
    // Reset error state
    this._loadError = undefined;

    const stratum = this._stacStratum;
    if (!stratum) {
      return;
    }

    // Always create the geometry data source for the STAC Item footprint
    await this.createGeometryDataSource(stratum);

    const cogAsset = this.findCogAsset(stratum);
    const resolvedCogAssetHref = cogAsset
      ? resolveStacHref(cogAsset.href, this.url) ?? cogAsset.href
      : undefined;
    const previewOptions = untracked(() => ({
      credit: this.credit,
      cacheDuration: this.cacheDuration
    }));
    const previewAssets = findStacPreviewAssets(stratum.item.assets, this.url);
    const previewAsset = previewAssets[0];
    const previewBbox = await this.resolveItemPreviewBbox(stratum.item);
    const hasRenderablePreview = !!previewAsset && !!previewBbox;
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
      // Don't throw - the geometry will still be shown
      return;
    }

    if (hasRenderablePreview && (!cogAsset || shouldForcePreviewForCog)) {
      try {
        const imageryProvider = await this.createPreviewImageryProvider(
          previewAssets.map((asset) => asset.resolvedHref),
          previewBbox!,
          previewOptions.credit,
          previewOptions.cacheDuration
        );
        runInAction(() => {
          this._imageryProvider = imageryProvider;
        });
        return;
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
        this._imageryProvider = imageryProvider;
      });
    } catch (error) {
      if (hasRenderablePreview && this.isAuthenticationError(error)) {
        try {
          const imageryProvider = await this.createPreviewImageryProvider(
            previewAssets.map((asset) => asset.resolvedHref),
            previewBbox!,
            previewOptions.credit,
            previewOptions.cacheDuration
          );
          runInAction(() => {
            this._imageryProvider = imageryProvider;
            this._loadError = undefined;
          });
          return;
        } catch (previewError) {
          console.warn("Failed to load STAC preview image:", previewError);
        }
      }

      runInAction(() => {
        this._loadError =
          error instanceof Error ? error.message : String(error);
      });
      // Don't throw - the geometry will still be shown
      // The error will be shown in shortReport
    }
  }

  /**
   * Create a GeoJSON data source for the STAC Item geometry
   */
  private async createGeometryDataSource(
    stratum: StacItemStratum
  ): Promise<void> {
    const item = stratum.item;

    // Create a GeoJSON feature from the STAC item
    const geojson: GeoJSON.Feature = {
      type: "Feature",
      geometry: item.geometry,
      properties: {
        name: item.properties.title || item.id,
        datetime: item.properties.datetime,
        ...item.properties
      }
    };

    try {
      const dataSource = new GeoJsonDataSource(this.name || item.id);
      // Note: clampToGround is disabled to avoid Cesium EllipsoidRhumbLine errors
      // with certain polygon geometries that have near-duplicate points
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
      // Ignore geometry errors (e.g., degenerate polygons)
      // The item can still be displayed via rectangle
      console.warn("Failed to load STAC item geometry:", error);
    }
  }

  /**
   * Find a COG asset to render
   */
  private findCogAsset(stratum: StacItemStratum):
    | {
        key: string;
        href: string;
        "auth:refs"?: string[];
      }
    | undefined {
    const item = stratum.item;

    // Determine which asset to use
    const assetKey = this.asset?.assetKey;

    if (assetKey && item.assets[assetKey]?.href) {
      return {
        key: assetKey,
        href: item.assets[assetKey].href,
        "auth:refs": item.assets[assetKey]["auth:refs"]
      };
    }

    // Find first COG asset
    const cogAsset = Object.entries(item.assets).find(
      ([, asset]) =>
        asset.type?.includes("geotiff") ||
        asset.type?.includes("tiff") ||
        asset.roles?.includes("data") ||
        asset.href?.endsWith(".tif") ||
        asset.href?.endsWith(".tiff")
    );

    if (!cogAsset) return undefined;

    return {
      key: cogAsset[0],
      href: cogAsset[1].href,
      "auth:refs": cogAsset[1]["auth:refs"]
    };
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

    // Build render options from traits
    const renderOptions = this.buildRenderOptions();

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

    return imageryProvider;
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

    const [west, south, east, north] = bbox;
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
          if (!this.hasValidImageryProviderRectangle(provider)) {
            throw new Error(
              `Preview imagery provider for ${candidateUrl} has an invalid rectangle.`
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

  private async resolveItemPreviewBbox(
    item: StacItem
  ): Promise<number[] | undefined> {
    const fallbackBbox = normalizeStacBbox(item.bbox);
    const projectedBbox = normalizeStacRawBbox(
      item.properties?.["proj:bbox"] as number[] | undefined
    );
    const projectedCode =
      typeof item.properties?.["proj:code"] === "string"
        ? item.properties["proj:code"]
        : undefined;

    if (!projectedBbox || !projectedCode) {
      return fallbackBbox;
    }

    const transformedBbox = await this.transformProjectedBboxToWgs84(
      projectedBbox,
      projectedCode
    );
    return transformedBbox ?? fallbackBbox;
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

  private hasValidImageryProviderRectangle(
    imageryProvider: TIFFImageryProvider | SingleTileImageryProvider
  ): boolean {
    return hasValidCesiumRectangle(
      (imageryProvider as unknown as { rectangle?: Rectangle | undefined })
        .rectangle
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

    return options;
  }

  @computed get mapItems(): MapItem[] {
    const result: MapItem[] = [];

    // Add the geometry data source (footprint)
    const dataSource = this._geoJsonDataSource;
    if (dataSource) {
      result.push(dataSource);
    }

    // Add the imagery provider if available
    const imageryProvider = this._imageryProvider;
    if (
      imageryProvider &&
      this.hasValidImageryProviderRectangle(imageryProvider)
    ) {
      const clippingRectangle =
        imageryProvider instanceof SingleTileImageryProvider
          ? undefined
          : hasValidCesiumRectangle(this.cesiumRectangle)
          ? this.cesiumRectangle
          : undefined;

      result.push({
        show: this.show,
        alpha: this.opacity,
        // @ts-expect-error - TIFFImageryProvider has a compatible runtime API but stricter TS typing than Cesium ImageryProvider
        imageryProvider,
        clippingRectangle
      });
    }

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
