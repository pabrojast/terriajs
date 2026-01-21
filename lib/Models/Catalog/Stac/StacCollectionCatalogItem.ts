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
import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import isDefined from "../../../Core/isDefined";
import { JsonObject } from "../../../Core/Json";
import loadJson from "../../../Core/loadJson";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import MappableMixin, { MapItem } from "../../../ModelMixins/MappableMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import StacCollectionCatalogItemTraits from "../../../Traits/TraitsClasses/StacCollectionCatalogItemTraits";
import { RectangleTraits } from "../../../Traits/TraitsClasses/MappableTraits";
import CreateModel from "../../Definition/CreateModel";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import StratumOrder from "../../Definition/StratumOrder";
import Terria from "../../Terria";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";

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
    }
  >;
  item_assets?: Record<
    string,
    {
      type?: string;
      title?: string;
      description?: string;
      roles?: string[];
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
    readonly firstItem?: StacItem
  ) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new StacCollectionStratum(
      model as StacCollectionCatalogItem,
      this.collection,
      this.firstItem
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
    const imageryRectangle = this.catalogItem._imageryProvider?.rectangle;
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
  get info() {
    const info: Array<{ name: string; content: string }> = [];

    if (this.collection.license) {
      info.push({
        name: i18next.t("preview.licence"),
        content: this.collection.license
      });
    }

    if (this.collection.keywords && this.collection.keywords.length > 0) {
      info.push({
        name: i18next.t("preview.keywords") || "Keywords",
        content: this.collection.keywords.join(", ")
      });
    }

    if (this.collection.providers && this.collection.providers.length > 0) {
      const providersContent = this.collection.providers
        .map((p) => {
          const roles = p.roles ? ` (${p.roles.join(", ")})` : "";
          const url = p.url ? ` - ${p.url}` : "";
          return `${p.name}${roles}${url}`;
        })
        .join("\n");
      info.push({
        name: i18next.t("preview.contact") || "Providers",
        content: providersContent
      });
    }

    const temporal = this.collection.extent?.temporal?.interval?.[0];
    if (temporal) {
      const start = temporal[0] || "ongoing";
      const end = temporal[1] || "present";
      info.push({
        name: i18next.t("preview.temporalExtent") || "Temporal Extent",
        content: `${start} to ${end}`
      });
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

    // Try to fetch the first item to get a COG URL for rendering
    let firstItem: StacItem | undefined;
    const itemsLink = collection.links.find((link) => link.rel === "items");

    if (itemsLink) {
      try {
        const itemsUrl = new URL(itemsLink.href, catalogItem.url).href;
        const limit = catalogItem.maximumItems ?? 1;
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
        if (
          catalogItem.bboxFilter &&
          catalogItem.bboxFilter.length >= 4
        ) {
          itemsUrlWithParams.searchParams.set(
            "bbox",
            catalogItem.bboxFilter.join(",")
          );
        }

        const itemsResponse = (await loadJson(
          proxyCatalogItemUrl(catalogItem, itemsUrlWithParams.href)
        )) as StacItemsResponse;

        if (
          itemsResponse.features &&
          itemsResponse.features.length > 0
        ) {
          firstItem = itemsResponse.features[0];
        }
      } catch (e) {
        console.warn("Failed to fetch STAC items:", e);
      }
    }

    return new StacCollectionStratum(catalogItem, collection, firstItem);
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
  _imageryProvider: TIFFImageryProvider | undefined;

  @observable
  _stacStratum: StacCollectionStratum | undefined;

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
        this._imageryProvider.destroy();
        this._imageryProvider = undefined;
      }
    });

    // Re-create the imageryProvider if `mapItems` is consumed again
    onBecomeObserved(this, "mapItems", () => {
      if (!this._imageryProvider && !this.isLoadingMapItems) {
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

  protected async forceLoadMapItems(): Promise<void> {
    const stratum = this._stacStratum;
    if (!stratum) {
      return;
    }

    // Find a COG asset URL to render
    const cogUrl = this.findCogAssetUrl(stratum);
    if (!cogUrl) {
      console.warn("No COG asset found in STAC collection");
      return;
    }

    const imageryProvider = await this.createImageryProvider(cogUrl);
    runInAction(() => {
      this._imageryProvider = imageryProvider;
    });
  }

  /**
   * Find the URL of a COG asset to render
   */
  private findCogAssetUrl(stratum: StacCollectionStratum): string | undefined {
    const item = stratum.firstItem;
    const collection = stratum.collection;

    if (!item) {
      // No items available, try collection-level assets
      if (collection.assets) {
        const cogAsset = Object.values(collection.assets).find(
          (asset) =>
            asset.type?.includes("geotiff") ||
            asset.type?.includes("tiff") ||
            asset.href?.endsWith(".tif") ||
            asset.href?.endsWith(".tiff")
        );
        return cogAsset?.href;
      }
      return undefined;
    }

    // Determine which asset to use
    const assetKey = this.asset?.assetKey;

    if (assetKey && item.assets[assetKey]) {
      return item.assets[assetKey].href;
    }

    // Try to find asset from renders extension
    const renderKey = this.render?.renderKey;
    if (renderKey && collection.renders?.[renderKey]) {
      const render = collection.renders[renderKey];
      const assetName = render.assets?.[0];
      if (assetName && item.assets[assetName]) {
        return item.assets[assetName].href;
      }
    }

    // Try first render if available
    if (collection.renders) {
      const firstRender = Object.values(collection.renders)[0];
      const assetName = firstRender?.assets?.[0];
      if (assetName && item.assets[assetName]) {
        return item.assets[assetName].href;
      }
    }

    // Find first COG asset
    const cogAsset = Object.values(item.assets).find(
      (asset) =>
        asset.type?.includes("geotiff") ||
        asset.type?.includes("tiff") ||
        asset.roles?.includes("data") ||
        asset.href?.endsWith(".tif") ||
        asset.href?.endsWith(".tiff")
    );

    return cogAsset?.href;
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

        if (
          renderConfig.colormap_name ||
          this.render?.colormapName
        ) {
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
    const imageryProvider = this._imageryProvider;
    if (!imageryProvider) {
      return [];
    }

    return [
      {
        show: this.show,
        alpha: this.opacity,
        // @ts-expect-error - The return type of 'requestImage' method in our custom ImageryProvider can be ImageData
        imageryProvider,
        clippingRectangle: this.cesiumRectangle
      }
    ];
  }
}

/**
 * Function returning a custom reprojector
 */
function reprojector(proj4: unknown) {
  return (code: number) => {
    if (![4326, 3857, 900913].includes(code)) {
      try {
        const prj = (proj4 as (from: string, to: string) => {
          forward: (coord: number[]) => number[];
          inverse: (coord: number[]) => number[];
        })("EPSG:4326", `EPSG:${code}`);
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
