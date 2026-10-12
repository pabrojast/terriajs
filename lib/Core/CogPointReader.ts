import type { GeoTIFF, GeoTIFFImage } from "geotiff";
import { getSharedGeotiffPool } from "./CogSharedPools";
import { openCogSource } from "./CogSourceCache";

/**
 * Reading single pixel values from Cloud Optimised GeoTIFFs, for the value
 * under a map click and for the time series at a point.
 *
 * Reads are always at full resolution: one pixel costs one internal tile at
 * any pyramid level, so an overview would save no bytes and would return an
 * averaged value that changes with the zoom level.
 */

/** Georeferencing of a GeoTIFF image, enough to map a coordinate to a pixel. */
export interface CogGridMeta {
  /** Coordinates of the outer corner of the top-left pixel, in the image CRS. */
  origin: readonly [number, number];
  /** Pixel size in CRS units. The y component is negative for north-up images. */
  resolution: readonly [number, number];
  width: number;
  height: number;
  /**
   * EPSG code of a projected CRS, or `undefined` when the image is geographic
   * (longitude/latitude), in which case no reprojection is needed.
   */
  projectedEpsg: number | undefined;
}

/** `proj4` or anything shaped like it. */
export type Proj4Like = (
  from: string,
  to: string
) => { forward(coordinates: number[]): number[] };

/** Linear conversion from stored values to physical units (GDAL scale/offset). */
export interface CogValueTransform {
  scale: number;
  offset: number;
}

export const IDENTITY_VALUE_TRANSFORM: CogValueTransform = {
  scale: 1,
  offset: 0
};

export type CogPointRead =
  /** `value` is in physical units, `raw` is what the file stores. */
  | { status: "value"; value: number; raw: number }
  /** Inside the image, but the pixel holds no data. */
  | { status: "nodata" }
  /** The coordinate is outside this image. */
  | { status: "outside" };

/** GeoTIFF user-defined CRS code: there is no EPSG code to reproject with. */
const USER_DEFINED_CRS = 32767;

export function getCogGridMeta(image: GeoTIFFImage): CogGridMeta {
  const origin = image.getOrigin();
  const resolution = image.getResolution();
  const geoKeys = (image.getGeoKeys() ?? {}) as Record<string, unknown>;
  const projected = Number(geoKeys.ProjectedCSTypeGeoKey);
  return {
    origin: [origin[0], origin[1]],
    resolution: [resolution[0], resolution[1]],
    width: image.getWidth(),
    height: image.getHeight(),
    projectedEpsg:
      Number.isFinite(projected) &&
      projected > 0 &&
      projected !== USER_DEFINED_CRS
        ? projected
        : undefined
  };
}

/**
 * Pixel containing a WGS84 coordinate, or `undefined` when it falls outside
 * the image (or cannot be reprojected into the image CRS).
 */
export function lonLatToPixel(
  meta: CogGridMeta,
  lon: number,
  lat: number,
  proj4?: Proj4Like
): { px: number; py: number } | undefined {
  let x = lon;
  let y = lat;
  if (meta.projectedEpsg !== undefined) {
    if (!proj4) return undefined;
    try {
      [x, y] = proj4("EPSG:4326", `EPSG:${meta.projectedEpsg}`).forward([
        lon,
        lat
      ]);
    } catch {
      return undefined;
    }
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  const px = Math.floor((x - meta.origin[0]) / meta.resolution[0]);
  const py = Math.floor((y - meta.origin[1]) / meta.resolution[1]);
  if (px < 0 || py < 0 || px >= meta.width || py >= meta.height) {
    return undefined;
  }
  return { px, py };
}

/**
 * A stored value is no-data only when the file says so (GDAL no-data), the
 * catalog says so (`noDataValues`), or it is not a finite number. Guessing at
 * common sentinels (255, 65535, -9999…) would punch holes in rasters where
 * those are real values.
 */
export function isCogNoData(
  raw: number,
  gdalNoData: number | null | undefined,
  extraNoData?: readonly number[]
): boolean {
  if (!Number.isFinite(raw)) return true;
  if (gdalNoData !== null && gdalNoData !== undefined && raw === gdalNoData) {
    return true;
  }
  return extraNoData !== undefined && extraNoData.includes(raw);
}

export function toPhysicalValue(
  raw: number,
  transform: CogValueTransform = IDENTITY_VALUE_TRANSFORM
): number {
  return raw * transform.scale + transform.offset;
}

export interface ReadCogPointOptions {
  /** 1-based band. */
  band?: number;
  noDataValues?: readonly number[];
  transform?: CogValueTransform;
  signal?: AbortSignal;
}

/** Read the full-resolution pixel under a WGS84 coordinate. */
export async function readCogPointValue(
  tiff: GeoTIFF,
  lon: number,
  lat: number,
  options: ReadCogPointOptions = {}
): Promise<CogPointRead> {
  const image = await tiff.getImage(0);
  const meta = getCogGridMeta(image);
  const proj4 =
    meta.projectedEpsg !== undefined
      ? ((await import("proj4-fully-loaded")).default as unknown as Proj4Like)
      : undefined;

  const pixel = lonLatToPixel(meta, lon, lat, proj4);
  if (!pixel) return { status: "outside" };

  const band = options.band ?? 1;
  const pool = await getSharedGeotiffPool();
  const rasters = await image.readRasters({
    window: [pixel.px, pixel.py, pixel.px + 1, pixel.py + 1],
    samples: [band - 1],
    pool,
    signal: options.signal
  });
  const raw = Number((rasters[0] as ArrayLike<number>)[0]);

  if (isCogNoData(raw, image.getGDALNoData(), options.noDataValues)) {
    return { status: "nodata" };
  }
  return {
    status: "value",
    value: toPhysicalValue(raw, options.transform),
    raw
  };
}

/**
 * Value of a (possibly mosaicked) time step at a coordinate: the first COG that
 * covers the point with data wins.
 */
export async function readCogStepPointValue(
  cogUrls: readonly string[],
  lon: number,
  lat: number,
  options: ReadCogPointOptions = {}
): Promise<CogPointRead> {
  let result: CogPointRead = { status: "outside" };
  for (const url of cogUrls) {
    // Opening a COG is a network request: do not start one for a cancelled read.
    if (options.signal?.aborted) throw createAbortError();
    const tiff = await openCogSource(url);
    const read = await readCogPointValue(tiff, lon, lat, options);
    if (read.status === "value") return read;
    if (read.status === "nodata") result = read;
  }
  return result;
}

export interface CogPointSeriesEntry {
  /** ISO 8601 time of the step. */
  time: string;
  /** URLs to fetch (already proxied if needed). */
  cogs: readonly string[];
}

export interface CogPointSeriesPoint {
  time: string;
  /** Milliseconds since the epoch, for a time axis. */
  x: number;
  /** Physical value. */
  y: number;
}

export interface CogPointSeriesProgress {
  loaded: number;
  total: number;
  /** Steps that could not be read (network, CORS, corrupt file). */
  errors: number;
  /** Steps that cover the point but hold no data there. */
  noData: number;
  /** Steps whose imagery does not cover the point. */
  outside: number;
  /** Values read so far, in completion order (sort by `x` to plot). */
  points: CogPointSeriesPoint[];
}

export interface LoadCogPointSeriesOptions extends ReadCogPointOptions {
  entries: readonly CogPointSeriesEntry[];
  lon: number;
  lat: number;
  /** Simultaneous reads. */
  concurrency?: number;
  /** Index of the entry to read first; the rest follow outwards from it. */
  startIndex?: number;
  /**
   * Stop once this many dates (the ones nearest to `startIndex`) were read
   * without a single value. A click on land, or outside the water mask of a
   * water-quality product, would otherwise cost two requests per date only to
   * find nothing.
   */
  giveUpAfterEmpty?: number;
  onProgress?: (progress: CogPointSeriesProgress) => void;
}

export interface CogPointSeriesResult extends CogPointSeriesProgress {
  aborted: boolean;
  /** True when the read stopped early because of `giveUpAfterEmpty`. */
  gaveUp: boolean;
}

const DEFAULT_SERIES_CONCURRENCY = 6;

/** Indices ordered by distance from `start`: start, start+1, start-1, start+2… */
export function outwardOrder(length: number, start: number): number[] {
  if (length <= 0) return [];
  const origin = Math.max(0, Math.min(length - 1, Math.floor(start)));
  const order = [origin];
  for (let distance = 1; order.length < length; distance++) {
    if (origin + distance < length) order.push(origin + distance);
    if (origin - distance >= 0) order.push(origin - distance);
  }
  return order;
}

function isAbortError(e: unknown): boolean {
  return (e as any)?.name === "AbortError";
}

/** Same shape `fetch` and geotiff reject with when their signal is aborted. */
function createAbortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Read the value at a coordinate from every time step, entirely in the
 * browser. Dates near `startIndex` come first so the chart fills around the
 * date the user is looking at. Failures are counted, never silently turned into
 * gaps, and an abort stops outstanding reads.
 */
export async function loadCogPointSeries(
  options: LoadCogPointSeriesOptions
): Promise<CogPointSeriesResult> {
  const { entries, lon, lat, signal, onProgress } = options;
  const progress: CogPointSeriesProgress = {
    loaded: 0,
    total: entries.length,
    errors: 0,
    noData: 0,
    outside: 0,
    points: []
  };
  const order = outwardOrder(
    entries.length,
    options.startIndex ?? entries.length - 1
  );
  let next = 0;
  let gaveUp = false;
  const giveUpAfter = options.giveUpAfterEmpty;

  const readEntry = async (entry: CogPointSeriesEntry) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await readCogStepPointValue(entry.cogs, lon, lat, options);
      } catch (e) {
        if (isAbortError(e) || signal?.aborted || attempt >= 1) throw e;
      }
    }
  };

  const worker = async () => {
    while (next < order.length && !signal?.aborted && !gaveUp) {
      const entry = entries[order[next++]];
      try {
        const read = await readEntry(entry);
        if (signal?.aborted) return;
        if (read.status === "value") {
          const x = Date.parse(entry.time);
          if (Number.isFinite(x)) {
            progress.points.push({ time: entry.time, x, y: read.value });
          } else {
            progress.errors++;
          }
        } else if (read.status === "nodata") {
          progress.noData++;
        } else {
          progress.outside++;
        }
      } catch (e) {
        if (isAbortError(e) || signal?.aborted) return;
        progress.errors++;
      }
      progress.loaded++;
      if (
        giveUpAfter !== undefined &&
        progress.loaded >= giveUpAfter &&
        progress.points.length === 0 &&
        progress.errors === 0
      ) {
        gaveUp = true;
      }
      onProgress?.(progress);
    }
  };

  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_SERIES_CONCURRENCY, order.length)
  );
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { ...progress, aborted: signal?.aborted === true, gaveUp };
}
