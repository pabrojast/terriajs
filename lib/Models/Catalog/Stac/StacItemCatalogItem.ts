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
import Color from "terriajs-cesium/Source/Core/Color";
import GeoJsonDataSource from "terriajs-cesium/Source/DataSources/GeoJsonDataSource";
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
    return new StacItemStratum(
      model as StacItemCatalogItem,
      this.item
    ) as this;
  }

  @computed
  get name(): string | undefined {
    return (
      this.item.properties?.title || this.item.id
    );
  }

  @computed
  get description(): string | undefined {
    return this.item.properties?.description;
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

    // Fall back to item bbox
    const bbox = this.item.bbox;
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

    // List available assets
    const assetNames = Object.keys(this.item.assets);
    if (assetNames.length > 0) {
      const assetsContent = assetNames
        .map((key) => {
          const asset = this.item.assets[key];
          return `- **${asset.title || key}**: ${asset.type || "unknown"}`;
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

  static async load(catalogItem: StacItemCatalogItem): Promise<StacItemStratum> {
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
  MappableMixin(
    CatalogMemberMixin(CreateModel(StacItemCatalogItemTraits))
  )
) {
  static readonly type = "stac-item";

  @observable
  _imageryProvider: TIFFImageryProvider | undefined;

  @observable
  _stacStratum: StacItemStratum | undefined;

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

    // Destroy the imageryProvider when `mapItems` is no longer consumed
    onBecomeUnobserved(this, "mapItems", () => {
      if (this._imageryProvider) {
        this._imageryProvider.destroy();
        this._imageryProvider = undefined;
      }
    });

    // Re-create the imageryProvider if `mapItems` is consumed again
    onBecomeObserved(this, "mapItems", () => {
      if (!this._imageryProvider && !this.isLoadingMapItems && !this._loadError) {
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

    // Find a COG asset URL to render
    const cogUrl = this.findCogAssetUrl(stratum);
    if (!cogUrl) {
      runInAction(() => {
        this._loadError = i18next.t("models.stac.noCogAssetFound");
      });
      // Don't throw - the geometry will still be shown
      return;
    }

    try {
      const imageryProvider = await this.createImageryProvider(cogUrl);
      runInAction(() => {
        this._imageryProvider = imageryProvider;
      });
    } catch (error) {
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
   * Find the URL of a COG asset to render
   */
  private findCogAssetUrl(stratum: StacItemStratum): string | undefined {
    const item = stratum.item;

    // Determine which asset to use
    const assetKey = this.asset?.assetKey;

    if (assetKey && item.assets[assetKey]) {
      return item.assets[assetKey].href;
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
    if (imageryProvider) {
      result.push({
        show: this.show,
        alpha: this.opacity,
        // @ts-expect-error - The return type of 'requestImage' method in our custom ImageryProvider can be ImageData
        imageryProvider,
        clippingRectangle: this.cesiumRectangle
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
