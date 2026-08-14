import Color from "terriajs-cesium/Source/Core/Color";
import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";

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

interface MutableImageData {
  data: Uint8ClampedArray;
  commit: () => void;
}

const NO_DATA_POST_PROCESSING_FLAG = Symbol("cogNoDataPostProcessing");

/**
 * Add support for the TerriaJS-only noDataColor option. The upstream provider
 * exposes no no-data fill color, so raw tile samples are retained until its
 * rendered image is available and only true no-data pixels are recolored.
 */
export function applyCogNoDataColor(
  imageryProvider: TIFFImageryProvider,
  band: number | undefined,
  cssColor: string | undefined
): void {
  const color = parseCssColorToRgba(cssColor);
  if (!color) return;

  const providerWithInternals = imageryProvider as any;
  if (providerWithInternals[NO_DATA_POST_PROCESSING_FLAG]) return;

  const originalLoadTile =
    typeof providerWithInternals._loadTile === "function"
      ? providerWithInternals._loadTile.bind(imageryProvider)
      : undefined;
  if (!originalLoadTile) return;

  providerWithInternals[NO_DATA_POST_PROCESSING_FLAG] = true;
  const tileDataCache = new Map<string, RawCogTile>();

  providerWithInternals._loadTile = async (x: number, y: number, z: number) => {
    const tile: RawCogTile = await originalLoadTile(x, y, z);
    tileDataCache.set(buildTileCacheKey(x, y, z), tile);
    return tile;
  };

  const originalRequestImage =
    imageryProvider.requestImage.bind(imageryProvider);
  imageryProvider.requestImage = async (x: number, y: number, z: number) => {
    const cacheKey = buildTileCacheKey(x, y, z);
    try {
      const result = await originalRequestImage(x, y, z);
      const rawTile = tileDataCache.get(cacheKey);
      if (rawTile && result) {
        fillNoDataPixels(imageryProvider, rawTile, result, band, color);
      }
      return result;
    } finally {
      tileDataCache.delete(cacheKey);
    }
  };
}

function fillNoDataPixels(
  imageryProvider: TIFFImageryProvider,
  rawTile: RawCogTile,
  image: unknown,
  band: number | undefined,
  color: RgbaTuple
): void {
  const mutation = getMutableImageData(image);
  const pixelCount = rawTile.data[0]?.length ?? 0;
  if (!mutation || pixelCount === 0) return;

  const isCompositeMode = Boolean(
    imageryProvider.renderOptions.convertToRGB ||
      imageryProvider.renderOptions.multi ||
      imageryProvider.renderOptions.single?.expression
  );
  const targetSampleIndex = getSampleIndexForBand(imageryProvider, band);
  const singleBandData = !isCompositeMode
    ? rawTile.data[targetSampleIndex]
    : undefined;

  for (let index = 0; index < pixelCount; index++) {
    const isNoDataPixel = isCompositeMode
      ? rawTile.data.some((sample) =>
          isNoDataValue(sample[index], imageryProvider.noData)
        )
      : singleBandData
      ? isNoDataValue(singleBandData[index], imageryProvider.noData)
      : false;
    if (isNoDataPixel) setPixelColor(mutation.data, index, color);
  }
  mutation.commit();
}

function getSampleIndexForBand(
  imageryProvider: TIFFImageryProvider,
  band = 1
): number {
  const zeroBasedBand = band - 1;
  const index = imageryProvider.readSamples?.indexOf(zeroBasedBand);
  return index !== undefined && index >= 0 ? index : 0;
}

function parseCssColorToRgba(value: string | undefined): RgbaTuple | undefined {
  if (!value) return undefined;
  const color = Color.fromCssColorString(value);
  if (!color) return undefined;
  return [
    Math.round(color.red * 255),
    Math.round(color.green * 255),
    Math.round(color.blue * 255),
    Math.round(color.alpha * 255)
  ];
}

function buildTileCacheKey(x: number, y: number, z: number): string {
  return `${x}_${y}_${z}`;
}

function isNoDataValue(value: number, noData: number | undefined): boolean {
  return (
    Number.isNaN(value) || (typeof noData === "number" && value === noData)
  );
}

function setPixelColor(
  buffer: Uint8ClampedArray,
  pixelIndex: number,
  color: RgbaTuple
): void {
  const offset = pixelIndex * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
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
    if (!context) return undefined;
    const imageData = context.getImageData(0, 0, image.width, image.height);
    return {
      data: imageData.data,
      commit: () => context.putImageData(imageData, 0, 0)
    };
  }

  if (isOffscreenCanvas(image)) {
    const context = image.getContext("2d");
    if (!context) return undefined;
    const imageData = context.getImageData(0, 0, image.width, image.height);
    return {
      data: imageData.data,
      commit: () => context.putImageData(imageData, 0, 0)
    };
  }

  if (isImageDataLike(image)) {
    return { data: image.data, commit: () => undefined };
  }
  return undefined;
}
