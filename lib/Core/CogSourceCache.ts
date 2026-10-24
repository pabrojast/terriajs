import type { GeoTIFF, GeoTIFFImage } from "geotiff";
import { getSharedGeotiffPool } from "./CogSharedPools";

/**
 * Session-wide cache of opened GeoTIFFs, keyed by the URL that is actually
 * fetched (i.e. after proxying). Opening a COG costs one or two range requests
 * for the header and IFDs; imagery providers, point reads and zonal statistics
 * all share the same opened file (and its block cache) through this module.
 */

/**
 * Maximum number of opened GeoTIFFs kept alive. Sized for a prefetched monthly
 * series plus a window of daily scenes; an idle source is its header block.
 */
const MAX_SOURCES = 320;
/** 64 KiB blocks kept per source opened here (imagery providers keep their own). */
const SOURCE_BLOCK_CACHE_SIZE = 24;
/** Largest file that may be fetched whole when the server ignores `Range`. */
const MAX_FULL_FILE_BYTES = 8 * 1024 * 1024;

interface SourceEntry {
  promise: Promise<GeoTIFF>;
  lastAccess: number;
}

export type CogBandRange = [number, number];

const sources = new Map<string, SourceEntry>();
const bandStats = new Map<string, Promise<CogBandRange | undefined>>();
let accessCounter = 0;

function touch(entry: SourceEntry): void {
  entry.lastAccess = ++accessCounter;
}

function evictIfNeeded(): void {
  while (sources.size > MAX_SOURCES) {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;
    for (const [key, entry] of sources) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) return;
    sources.delete(oldestKey);
  }
}

/**
 * Open (or reuse) the GeoTIFF at `url`. Concurrent callers share one request.
 * A failed open is not cached, so a later call retries. Deliberately not tied
 * to any caller's AbortSignal because the promise is shared.
 */
export function openCogSource(url: string): Promise<GeoTIFF> {
  const existing = sources.get(url);
  if (existing) {
    touch(existing);
    return existing.promise;
  }

  const promise = openWithRangeRequests(url);
  const entry: SourceEntry = { promise, lastAccess: ++accessCounter };
  sources.set(url, entry);
  promise.catch(() => {
    if (sources.get(url) === entry) sources.delete(url);
  });
  evictIfNeeded();
  return promise;
}

/**
 * Open with HTTP range requests. A server that ignores `Range` answers with the
 * whole file: that is only accepted for small files, so a multi-hundred-megabyte
 * COG behind such a server fails fast instead of being downloaded once per
 * time step.
 */
async function openWithRangeRequests(url: string): Promise<GeoTIFF> {
  const { fromUrl } = await import("geotiff");
  try {
    return await fromUrl(url, { cacheSize: SOURCE_BLOCK_CACHE_SIZE });
  } catch (e) {
    const size = await getContentLength(url).catch(() => undefined);
    if (size === undefined || size > MAX_FULL_FILE_BYTES) throw e;
    return fromUrl(url, {
      cacheSize: SOURCE_BLOCK_CACHE_SIZE,
      allowFullFile: true
    });
  }
}

async function getContentLength(url: string): Promise<number | undefined> {
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) return undefined;
  const length = Number(response.headers.get("Content-Length"));
  return Number.isFinite(length) && length > 0 ? length : undefined;
}

/** Register a GeoTIFF that something else (an imagery provider) already opened. */
export function adoptCogSource(url: string, tiff: GeoTIFF | undefined): void {
  if (!tiff || sources.has(url)) return;
  sources.set(url, {
    promise: Promise.resolve(tiff),
    lastAccess: ++accessCounter
  });
  evictIfNeeded();
}

export function hasCogSource(url: string): boolean {
  return sources.has(url);
}

/**
 * Native min/max of a band (1-based), cached per URL. Uses GDAL
 * `STATISTICS_*` metadata when present, otherwise scans the smallest overview
 * (a single block for a well-formed COG), ignoring no-data and NaN — the same
 * approximation `terriajs-tiff-imagery-provider` makes on every build.
 */
export function getCogBandStats(
  url: string,
  band: number = 1
): Promise<CogBandRange | undefined> {
  const key = `${url}|${band}`;
  const existing = bandStats.get(key);
  if (existing) return existing;

  const promise = computeBandStats(url, band);
  bandStats.set(key, promise);
  promise.catch(() => {
    if (bandStats.get(key) === promise) bandStats.delete(key);
  });
  return promise;
}

async function computeBandStats(
  url: string,
  band: number
): Promise<CogBandRange | undefined> {
  const tiff = await openCogSource(url);
  const fullRes = await tiff.getImage(0);
  const sampleIndex = band - 1;

  const metadata = fullRes.getGDALMetadata(sampleIndex) as
    | Record<string, unknown>
    | null
    | undefined;
  const metaMin = Number(metadata?.STATISTICS_MINIMUM);
  const metaMax = Number(metadata?.STATISTICS_MAXIMUM);
  if (
    metadata?.STATISTICS_MINIMUM !== undefined &&
    metadata?.STATISTICS_MAXIMUM !== undefined &&
    Number.isFinite(metaMin) &&
    Number.isFinite(metaMax)
  ) {
    return [metaMin, metaMax];
  }

  const preview = await getSmallestDataImage(tiff);
  const pool = await getSharedGeotiffPool();
  const rasters = await preview.readRasters({ samples: [sampleIndex], pool });
  const data = rasters[0] as ArrayLike<number>;
  const noData = fullRes.getGDALNoData();
  return computeMinMax(data, noData);
}

/** Smallest overview that is real data (reduced-resolution masks are skipped). */
async function getSmallestDataImage(tiff: GeoTIFF): Promise<GeoTIFFImage> {
  const count = await tiff.getImageCount();
  for (let index = count - 1; index > 0; index--) {
    const image = await tiff.getImage(index);
    const subfileType = Number(
      (image.getFileDirectory() as any).NewSubfileType ?? 0
    );
    const isMask = (subfileType & 4) !== 0;
    if (!isMask) return image;
  }
  return tiff.getImage(0);
}

/** Pure min/max ignoring no-data, NaN and infinities. Exported for tests. */
export function computeMinMax(
  data: ArrayLike<number>,
  noData: number | null | undefined
): CogBandRange | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (!Number.isFinite(value)) continue;
    if (noData !== null && noData !== undefined && value === noData) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? [min, max] : undefined;
}

/** Test hook. */
export function clearCogSourceCache(): void {
  sources.clear();
  bandStats.clear();
  accessCounter = 0;
}
