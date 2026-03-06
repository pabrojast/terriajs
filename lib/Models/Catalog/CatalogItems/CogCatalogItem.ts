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
  runInAction
} from "mobx";
import GeographicTilingScheme from "terriajs-cesium/Source/Core/GeographicTilingScheme";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import WebMercatorTilingScheme from "terriajs-cesium/Source/Core/WebMercatorTilingScheme";
import Color from "terriajs-cesium/Source/Core/Color";
import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import MappableMixin, { MapItem } from "../../../ModelMixins/MappableMixin";
import CogCatalogItemTraits from "../../../Traits/TraitsClasses/CogCatalogItemTraits";
import { RectangleTraits } from "../../../Traits/TraitsClasses/MappableTraits";
import CreateModel from "../../Definition/CreateModel";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import StratumOrder from "../../Definition/StratumOrder";
import Terria from "../../Terria";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";
import Icon from "../../../Styled/Icon";
import { ViewingControl } from "../../ViewingControls";
import { runWorkflow } from "../../Workflows/SelectableDimensionWorkflow";
import CogStylingWorkflow from "../../Workflows/CogStylingWorkflow";
import { CogLegendStratum } from "./CogLegendStratum";

/**
 * Loadable stratum for overriding CogCatalogItem traits
 */
class CogLoadableStratum extends LoadableStratum(CogCatalogItemTraits) {
  static stratumName = "cog-loadable-stratum";

  constructor(readonly model: CogCatalogItem) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new CogLoadableStratum(model as CogCatalogItem) as this;
  }

  @computed
  get shortReport(): string | undefined {
    return this.model.terria.currentViewer.type === "Leaflet"
      ? // Warn for 2D mode
        i18next.t("models.commonModelErrors.3dTypeIn2dMode", this)
      : this.model._imageryProvider?.tilingScheme &&
        // Show warning for experimental reprojection feature if not using EPSG 3857 or 4326
        isCustomTilingScheme(this.model._imageryProvider?.tilingScheme)
      ? i18next.t("models.cogCatalogItem.experimentalReprojectionWarning", this)
      : undefined;
  }

  @computed
  get rectangle(): StratumFromTraits<RectangleTraits> | undefined {
    const rectangle = this.model._imageryProvider?.rectangle;
    if (!rectangle) {
      return;
    }

    const { west, south, east, north } = rectangle;
    return {
      west: CesiumMath.toDegrees(west),
      south: CesiumMath.toDegrees(south),
      east: CesiumMath.toDegrees(east),
      north: CesiumMath.toDegrees(north)
    };
  }
}

StratumOrder.addLoadStratum(CogLoadableStratum.stratumName);
StratumOrder.addLoadStratum(CogLegendStratum.stratumName);

/**
 * Creates a Cloud Optimised Geotiff catalog item.
 *
 * Currently it can render EPSG 4326/3857 COG files. There is experimental
 * support for other projections, however it is less performant and could have
 * unknown issues.
 */
export default class CogCatalogItem extends MappableMixin(
  CatalogMemberMixin(CreateModel(CogCatalogItemTraits))
) {
  static readonly type = "cog";

  /**
   * Private imageryProvider instance. This is set once forceLoadMapItems is
   * called.
   */
  @observable
  _imageryProvider: TIFFImageryProvider | undefined;

  /**
   * The reprojector function to use for reprojecting non native projections
   *
   * Exposed here as instance variable for stubbing in specs.
   */
  reprojector = reprojector;

  get type() {
    return CogCatalogItem.type;
  }

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel | undefined
  ) {
    super(id, terria, sourceReference);
    makeObservable(this);
    this.strata.set(
      CogLoadableStratum.stratumName,
      new CogLoadableStratum(this)
    );
    this.strata.set(CogLegendStratum.stratumName, new CogLegendStratum(this));

    // Destroy the imageryProvider when `mapItems` is no longer consumed. This
    // is so that the webworkers and other resources created by the
    // imageryProvider can be freed. Ideally, there would be a more explicit
    // `destroy()` method in Terria life-cycle so that we don't have to rely on
    // mapItems becoming observed or unobserved.
    onBecomeUnobserved(this, "mapItems", () => {
      if (this._imageryProvider) {
        this._imageryProvider.destroy();
        this._imageryProvider = undefined;
      }
    });

    // Re-create the imageryProvider if `mapItems` is consumed again after we
    // destroyed it
    onBecomeObserved(this, "mapItems", () => {
      if (!this._imageryProvider && !this.isLoadingMapItems) {
        this.loadMapItems(true);
      }
    });

    // Watch for changes in renderOptions and reload imagery provider
    reaction(
      () => ({
        colorScale: this.renderOptions?.single?.colorScale,
        colors: this.renderOptions?.single?.colors,
        type: this.renderOptions?.single?.type,
        domain: this.renderOptions?.single?.domain,
        displayRange: this.renderOptions?.single?.displayRange,
        applyDisplayRange: this.renderOptions?.single?.applyDisplayRange,
        clampLow: this.renderOptions?.single?.clampLow,
        clampHigh: this.renderOptions?.single?.clampHigh,
        band: this.renderOptions?.single?.band,
        reverseColorScale: this.renderOptions?.single?.reverseColorScale,
        numberOfBins: this.renderOptions?.single?.numberOfBins,
        noDataColor: this.renderOptions?.single?.noDataColor,
        nodata: this.renderOptions?.nodata
      }),
      () => {
        // Only reload if we have an active imagery provider
        if (this._imageryProvider && !this.isLoadingMapItems) {
          this.loadMapItems(true);
        }
      }
    );
  }

  @override
  get viewingControls(): ViewingControl[] {
    return [
      ...super.viewingControls,
      {
        id: CogStylingWorkflow.type,
        name: i18next.t("models.cog.editStyle"),
        onClick: action((viewState) =>
          runWorkflow(viewState, new CogStylingWorkflow(this))
        ),
        icon: { glyph: Icon.GLYPHS.layers }
      }
    ];
  }

  @override
  get shortReport(): string | undefined {
    if (this.terria.currentViewer.type === "Leaflet") {
      return i18next.t("models.commonModelErrors.3dTypeIn2dMode", this);
    }

    if (
      this._imageryProvider?.tilingScheme &&
      isCustomTilingScheme(this._imageryProvider.tilingScheme)
    ) {
      return i18next.t(
        "models.cogCatalogItem.experimentalReprojectionWarning",
        this
      );
    }

    return undefined;
  }

  protected async forceLoadMapItems(): Promise<void> {
    if (!this.url) {
      return;
    }
    const url = proxyCatalogItemUrl(this, this.url);
    const imageryProvider = await this.createImageryProvider(url);
    runInAction(() => {
      this._imageryProvider = imageryProvider;
    });
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
        imageryProvider: imageryProvider as any,
        clippingRectangle: this.cesiumRectangle
      }
    ];
  }

  /**
   * Create TIFFImageryProvider for the given url.
   */
  private async createImageryProvider(
    url: string
  ): Promise<TIFFImageryProvider> {
    // lazy load the imagery provider, only when needed
    const [{ default: TIFFImageryProvider }, { default: proj4 }] =
      await Promise.all([
        import("terriajs-tiff-imagery-provider"),
        import("proj4-fully-loaded")
      ]);

    // Build render options with proper handling
    const singleOptions = this.renderOptions.single;

    // Prepare single render options
    const singleRenderOptions: any = {};

    if (singleOptions?.band !== undefined) {
      singleRenderOptions.band = singleOptions.band;
    }

    if (singleOptions?.colorScale !== undefined) {
      singleRenderOptions.colorScale = singleOptions.colorScale;
    }

    if (singleOptions?.colors !== undefined) {
      singleRenderOptions.colors = singleOptions.colors;
    }

    if (singleOptions?.useRealValue !== undefined) {
      singleRenderOptions.useRealValue = singleOptions.useRealValue;
    }

    if (singleOptions?.type !== undefined) {
      singleRenderOptions.type = singleOptions.type;
    }

    if (singleOptions?.domain !== undefined) {
      singleRenderOptions.domain = singleOptions.domain;
    }

    // Handle display range - always pass it if defined, let the library handle applyDisplayRange
    if (singleOptions?.displayRange !== undefined) {
      singleRenderOptions.displayRange = singleOptions.displayRange.slice();
    }

    // Pass applyDisplayRange as a separate flag
    if (singleOptions?.applyDisplayRange !== undefined) {
      singleRenderOptions.applyDisplayRange = singleOptions.applyDisplayRange;
    }

    if (singleOptions?.clampLow !== undefined) {
      singleRenderOptions.clampLow = singleOptions.clampLow;
    }

    if (singleOptions?.clampHigh !== undefined) {
      singleRenderOptions.clampHigh = singleOptions.clampHigh;
    }

    if (singleOptions?.expression !== undefined) {
      singleRenderOptions.expression = singleOptions.expression;
    }

    // Handle noDataColor - the library might expect it as a string or array
    if (singleOptions?.noDataColor !== undefined) {
      // Try to pass as-is first, the library should handle CSS colors
      singleRenderOptions.noDataColor = singleOptions.noDataColor;
    }

    const renderOptions: any = {};

    if (Object.keys(singleRenderOptions).length > 0) {
      renderOptions.single = singleRenderOptions;
    }

    if (this.renderOptions.nodata !== undefined) {
      renderOptions.nodata = this.renderOptions.nodata;
    }

    if (this.renderOptions.convertToRGB !== undefined) {
      renderOptions.convertToRGB = this.renderOptions.convertToRGB;
    }

    if (this.renderOptions.resampleMethod !== undefined) {
      renderOptions.resampleMethod = this.renderOptions.resampleMethod;
    }

    const imageryProvider = await runInAction(() =>
      TIFFImageryProvider.fromUrl(url, {
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

    const domainTuple = toMutableDisplayRange(singleOptions?.domain);
    const displayRangeTuple = toMutableDisplayRange(
      singleOptions?.displayRange,
      domainTuple
    );

    this.applyRasterPostProcessing(imageryProvider, {
      band: singleOptions?.band,
      applyDisplayRange: singleOptions?.applyDisplayRange === true,
      displayRange:
        singleOptions?.applyDisplayRange === true && displayRangeTuple
          ? displayRangeTuple
          : undefined,
      domain: domainTuple,
      noDataColor: parseCssColorToRgba(singleOptions?.noDataColor)
    });

    return imageryProvider;
  }

  private applyRasterPostProcessing(
    imageryProvider: TIFFImageryProvider,
    options: RasterPostProcessingOptions
  ): void {
    const needsNoDataColor = options.noDataColor !== undefined;
    const needsDisplayRange =
      !!options.applyDisplayRange && options.displayRange !== undefined;

    if (!needsNoDataColor && !needsDisplayRange) {
      return;
    }

    const tileDataCache = new Map<string, RawCogTile>();
    const providerWithInternals = imageryProvider as any;

    if (providerWithInternals[RASTER_POST_PROCESSING_FLAG]) {
      return;
    }
    providerWithInternals[RASTER_POST_PROCESSING_FLAG] = true;

    const originalLoadTile =
      typeof providerWithInternals._loadTile === "function"
        ? providerWithInternals._loadTile.bind(imageryProvider)
        : undefined;

    if (originalLoadTile) {
      providerWithInternals._loadTile = async (
        x: number,
        y: number,
        z: number
      ) => {
        const tile: RawCogTile = await originalLoadTile(x, y, z);
        tileDataCache.set(buildTileCacheKey(x, y, z), tile);
        return tile;
      };
    }

    const originalRequestImage =
      imageryProvider.requestImage.bind(imageryProvider);

    imageryProvider.requestImage = async (x: number, y: number, z: number) => {
      const cacheKey = buildTileCacheKey(x, y, z);
      try {
        const result = await originalRequestImage(x, y, z);
        const rawTile = tileDataCache.get(cacheKey);
        if (rawTile && result) {
          this.applyPostProcessingToResult(
            imageryProvider,
            rawTile,
            result,
            options
          );
        }
        return result;
      } finally {
        tileDataCache.delete(cacheKey);
      }
    };
  }

  private applyPostProcessingToResult(
    imageryProvider: TIFFImageryProvider,
    rawTile: RawCogTile,
    image: unknown,
    options: RasterPostProcessingOptions
  ) {
    const mutation = getMutableImageData(image);
    if (!mutation) {
      return;
    }

    const isRgbMode = Boolean(
      imageryProvider.renderOptions.convertToRGB ||
        imageryProvider.renderOptions.multi
    );

    if (options.noDataColor) {
      this.fillNoDataPixels(
        mutation.data,
        rawTile,
        imageryProvider,
        options,
        isRgbMode
      );
    }

    if (options.applyDisplayRange && options.displayRange) {
      this.applyDisplayRangeMask(
        mutation.data,
        rawTile,
        imageryProvider,
        options,
        isRgbMode
      );
    }

    mutation.commit();
  }

  private fillNoDataPixels(
    buffer: Uint8ClampedArray,
    rawTile: RawCogTile,
    imageryProvider: TIFFImageryProvider,
    options: RasterPostProcessingOptions,
    isRgbMode: boolean
  ) {
    const color = options.noDataColor;
    if (!color || rawTile.data.length === 0) {
      return;
    }

    const pixelCount = rawTile.data[0]?.length ?? 0;
    if (pixelCount === 0) {
      return;
    }

    const targetSampleIndex = this.getSampleIndexForBand(
      imageryProvider,
      options.band
    );
    const singleBandData = !isRgbMode
      ? rawTile.data[targetSampleIndex]
      : undefined;

    for (let i = 0; i < pixelCount; i++) {
      const isNoDataPixel = isRgbMode
        ? rawTile.data.some((band) =>
            isNoDataValue(band[i], imageryProvider.noData)
          )
        : singleBandData
        ? isNoDataValue(singleBandData[i], imageryProvider.noData)
        : false;

      if (isNoDataPixel) {
        setPixelColor(buffer, i, color);
      }
    }
  }

  private applyDisplayRangeMask(
    buffer: Uint8ClampedArray,
    rawTile: RawCogTile,
    imageryProvider: TIFFImageryProvider,
    options: RasterPostProcessingOptions,
    isRgbMode: boolean
  ) {
    const [min, max] = options.displayRange!;
    const pixelCount = rawTile.data[0]?.length ?? 0;
    if (pixelCount === 0) return;

    const targetSampleIndex = this.getSampleIndexForBand(
      imageryProvider,
      options.band
    );
    const bandData = !isRgbMode ? rawTile.data[targetSampleIndex] : undefined;

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;

      // Get the raw value
      let rawValue: number | undefined;
      if (!isRgbMode && bandData) {
        rawValue = bandData[i];
      } else if (isRgbMode) {
        // For RGB mode, compute from composite
        rawValue = getCompositeSampleValue(rawTile.data, i);
      }

      // If value is outside display range, make transparent
      if (rawValue !== undefined && (rawValue < min || rawValue > max)) {
        buffer[offset + 3] = 0; // Set alpha to 0 (transparent)
      }
    }
  }

  private getSampleIndexForBand(
    imageryProvider: TIFFImageryProvider,
    band?: number
  ): number {
    const zeroBased = (band ?? 1) - 1;
    const samples = imageryProvider.readSamples;
    if (Array.isArray(samples)) {
      const idx = samples.indexOf(zeroBased);
      if (idx >= 0) {
        return idx;
      }
    }
    return 0;
  }
}

/**
 * Function returning a custom reprojector
 */
function reprojector(proj4: any) {
  return (code: number) => {
    if (![4326, 3857, 900913].includes(code)) {
      try {
        const prj = proj4("EPSG:4326", `EPSG:${code}`);
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

/**
 * Returns true if the tilingScheme is custom
 */
function isCustomTilingScheme(tilingScheme: object) {
  // The upstream library defines a TIFFImageryTillingScheme but it is not
  // exported so we have to check if it is not one of the standard Cesium
  // tiling schemes. Also, because TIFFImageryTillingScheme derives from
  // WebMercatorTilingScheme, we cannot simply do an `instanceof` check, we
  // compare the exact constructor instead.
  return (
    tilingScheme.constructor !== WebMercatorTilingScheme &&
    tilingScheme.constructor !== GeographicTilingScheme
  );
}

type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array;

type RgbaTuple = [number, number, number, number];

interface RawCogTile {
  data: TypedArray[];
  width: number;
  height: number;
}

interface RasterPostProcessingOptions {
  band?: number;
  applyDisplayRange?: boolean;
  displayRange?: [number, number];
  domain?: [number, number];
  noDataColor?: RgbaTuple;
}

interface MutableImageData {
  data: Uint8ClampedArray;
  commit: () => void;
}

const RASTER_POST_PROCESSING_FLAG = Symbol("cogRasterPostProcessing");

function parseCssColorToRgba(value?: string): RgbaTuple | undefined {
  if (!value) {
    return;
  }
  const cesiumColor = Color.fromCssColorString(value);
  if (!cesiumColor) {
    return;
  }
  return [
    Math.round(cesiumColor.red * 255),
    Math.round(cesiumColor.green * 255),
    Math.round(cesiumColor.blue * 255),
    Math.round(cesiumColor.alpha * 255)
  ];
}

function buildTileCacheKey(x: number, y: number, z: number): string {
  return `${x}_${y}_${z}`;
}

function isCanvasElement(value: unknown): value is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== "undefined" &&
    value instanceof HTMLCanvasElement
  );
}

function isOffscreenCanvas(value: unknown): value is OffscreenCanvas {
  return (
    typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas
  );
}

function isImageDataLike(value: unknown): value is ImageData {
  return typeof ImageData !== "undefined" && value instanceof ImageData;
}

function getMutableImageData(image: unknown): MutableImageData | undefined {
  if (isCanvasElement(image)) {
    const context = image.getContext("2d");
    if (!context) {
      return;
    }
    const imageData = context.getImageData(0, 0, image.width, image.height);
    return {
      data: imageData.data,
      commit: () => context.putImageData(imageData, 0, 0)
    };
  }

  if (isOffscreenCanvas(image)) {
    const context = image.getContext("2d");
    if (!context) {
      return;
    }
    const imageData = context.getImageData(0, 0, image.width, image.height);
    return {
      data: imageData.data,
      commit: () => context.putImageData(imageData, 0, 0)
    };
  }

  if (isImageDataLike(image)) {
    return {
      data: image.data,
      commit: () => {}
    };
  }

  return;
}

function setPixelColor(
  buffer: Uint8ClampedArray,
  pixelIndex: number,
  color: RgbaTuple
) {
  const offset = pixelIndex * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function isNoDataValue(value: number, noData: number | undefined): boolean {
  if (Number.isNaN(value)) {
    return true;
  }
  if (typeof noData === "number") {
    return value === noData;
  }
  return false;
}

function getCompositeSampleValue(
  samples: TypedArray[],
  index: number
): number | undefined {
  if (!samples.length) {
    return;
  }
  if (samples.length >= 3) {
    const r = samples[0]?.[index];
    const g = samples[1]?.[index];
    const b = samples[2]?.[index];
    if (
      r === undefined ||
      g === undefined ||
      b === undefined ||
      Number.isNaN(r) ||
      Number.isNaN(g) ||
      Number.isNaN(b)
    ) {
      return;
    }
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  let sum = 0;
  let count = 0;
  for (const band of samples) {
    const value = band?.[index];
    if (value === undefined || Number.isNaN(value)) {
      return;
    }
    sum += value;
    count++;
  }
  return count > 0 ? sum / count : undefined;
}

function toMutableDisplayRange(
  value: ReadonlyArray<number> | undefined,
  fallback?: ReadonlyArray<number> | undefined
): [number, number] | undefined {
  const range = value ?? fallback;
  if (!range || range.length < 2) {
    return;
  }
  return [range[0], range[1]];
}
