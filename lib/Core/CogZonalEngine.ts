/**
 * CogZonalEngine — Client-side zonal statistics calculator for Cloud Optimized GeoTIFFs.
 *
 * Uses geotiff.js to read COG pixels via HTTP range requests,
 * clips to a user-drawn polygon, and computes statistics.
 */

import type { Polygon } from "geojson";
import { openCogSource } from "./CogSourceCache";
import { isCogNoData, toPhysicalValue } from "./CogPointReader";

// ─── Public Types ──────────────────────────────────────────────

export interface ZonalStatistics {
  mean: number;
  min: number;
  max: number;
  sum: number;
  count: number;
  noDataCount: number;
  median: number;
  stddev: number;
}

export interface ZonalCalculationOptions {
  /** URL of the COG file (supports HTTP range requests) */
  cogUrl: string;
  /** GeoJSON Polygon defining the area of interest (coordinates in EPSG:4326) */
  polygon: Polygon;
  /** Band index to read (1-based). Default: 1 */
  band?: number;
  /** Override nodata value. If undefined, reads from TIFF metadata. */
  noDataValue?: number;
  /** Extra raw no-data sentinels, before physical conversion. */
  noDataValues?: readonly number[];
  /** Explicit physical conversion. Defaults to GDAL band metadata, then 1/0. */
  valueScale?: number;
  valueOffset?: number;
  /** Maximum overview level index to use (0 = full res). Undefined = auto-select. */
  overviewLevel?: number;
  /** EPSG code of the COG CRS. If undefined, reads from GeoKeys. */
  epsgCode?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Optional callback for progress (0–1) */
  onProgress?: (fraction: number) => void;
}

export interface ZonalCalculationResult {
  statistics: ZonalStatistics;
  /** EPSG code detected or provided */
  epsgCode: number;
  /** Overview level used (0 = full resolution) */
  overviewLevel: number;
  /** Effective pixel resolution in CRS units */
  pixelResolution: [number, number];
  /** Number of pixels in the read window */
  windowPixelCount: number;
}

// ─── Geometry Helpers ──────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * @param x - x coordinate of the point
 * @param y - y coordinate of the point
 * @param polygon - Array of [x, y] coordinate rings (outer ring only)
 */
function pointInPolygon(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Holes are excluded, including after reprojection to a projected COG. */
export function pointInZonalPolygon(
  x: number,
  y: number,
  rings: number[][][]
): boolean {
  return (
    !!rings.length &&
    pointInPolygon(x, y, rings[0]) &&
    !rings.slice(1).some((ring) => pointInPolygon(x, y, ring))
  );
}

export function zonalPhysicalValue(
  raw: number,
  noData: number | undefined,
  extra: readonly number[] | undefined,
  scale: number,
  offset: number
): number | undefined {
  return isCogNoData(raw, noData, extra)
    ? undefined
    : toPhysicalValue(raw, { scale, offset });
}

/**
 * Get bounding box of a polygon ring: [minX, minY, maxX, maxY]
 */
function ringBBox(ring: number[][]): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

// ─── COG Reading Helpers ───────────────────────────────────────

interface GeoTransform {
  originX: number;
  originY: number;
  pixelWidth: number;
  pixelHeight: number; // typically negative (north-up)
}

/**
 * Extract geotransform from a GeoTIFF image.
 */
function getGeoTransform(image: any): GeoTransform {
  const origin = image.getOrigin();
  const resolution = image.getResolution();
  return {
    originX: origin[0],
    originY: origin[1],
    pixelWidth: resolution[0],
    pixelHeight: resolution[1]
  };
}

/**
 * Convert geographic coordinates to pixel coordinates.
 */
function geoToPixel(
  geoX: number,
  geoY: number,
  gt: GeoTransform
): [number, number] {
  const px = (geoX - gt.originX) / gt.pixelWidth;
  const py = (geoY - gt.originY) / gt.pixelHeight;
  return [px, py];
}

/**
 * Select the best overview level for the given polygon extent.
 * Tries to keep the pixel count in the window below a target.
 */
function selectOverviewLevel(
  imageCount: number,
  _fullWidth: number,
  _fullHeight: number,
  windowPixels: number,
  maxPixels: number = 500_000
): number {
  if (windowPixels <= maxPixels || imageCount <= 1) return 0;

  // Each overview is roughly 2x downsampled
  for (let level = 1; level < imageCount; level++) {
    const scale = Math.pow(2, level);
    const scaledPixels = windowPixels / (scale * scale);
    if (scaledPixels <= maxPixels) return level;
  }
  return imageCount - 1;
}

/**
 * Compute statistics from an array of valid numeric values.
 */
function computeStatistics(
  values: number[]
): Omit<ZonalStatistics, "noDataCount"> {
  if (values.length === 0) {
    return {
      mean: NaN,
      min: NaN,
      max: NaN,
      sum: 0,
      count: 0,
      median: NaN,
      stddev: NaN
    };
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const count = values.length;
  const mean = sum / count;

  // Variance (two-pass for numerical stability)
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const diff = values[i] - mean;
    variance += diff * diff;
  }
  variance /= count;
  const stddev = Math.sqrt(variance);

  // Median (sort a copy)
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return { mean, min, max, sum, count, median, stddev };
}

// ─── Main Engine ───────────────────────────────────────────────

/**
 * Calculate zonal statistics for a COG within a polygon area.
 *
 * Algorithm:
 * 1. Open COG via geotiff.js (HTTP range requests)
 * 2. Detect CRS from GeoKeys, reproject polygon if needed
 * 3. Select appropriate overview level for performance
 * 4. Convert polygon to pixel coordinates
 * 5. Read only the bounding box window of the polygon
 * 6. Apply point-in-polygon mask
 * 7. Compute statistics on valid (non-nodata, inside polygon) pixels
 */
export async function calculateZonalStatistics(
  options: ZonalCalculationOptions
): Promise<ZonalCalculationResult> {
  const {
    cogUrl,
    polygon,
    band = 1,
    noDataValue: userNoData,
    overviewLevel: userOverview,
    epsgCode: userEpsg,
    signal,
    onProgress
  } = options;

  // Check cancellation
  signal?.throwIfAborted();

  // Dynamic imports (tree-shakeable in webpack)
  const proj4Module = await import("proj4-fully-loaded");
  const proj4 = proj4Module.default;

  signal?.throwIfAborted();
  onProgress?.(0.05);

  // Open the COG
  const tiff = await openCogSource(cogUrl);

  signal?.throwIfAborted();
  onProgress?.(0.1);

  // Get full-resolution image for geotransform and metadata
  const fullImage = await tiff.getImage(0);
  const imageCount = await tiff.getImageCount();
  const gt = getGeoTransform(fullImage);
  const noData = userNoData ?? fullImage.getGDALNoData() ?? undefined;
  const metadata = fullImage.getGDALMetadata(band - 1);
  const metadataScale = Number(metadata?.SCALE ?? 1);
  const metadataOffset = Number(metadata?.OFFSET ?? 0);
  const scale =
    options.valueScale ?? (Number.isFinite(metadataScale) ? metadataScale : 1);
  const offset =
    options.valueOffset ??
    (Number.isFinite(metadataOffset) ? metadataOffset : 0);
  if (!Number.isFinite(scale) || !Number.isFinite(offset))
    throw new Error("Invalid COG value scale or offset");

  // Detect EPSG code
  const geoKeys = fullImage.getGeoKeys();
  const epsgCode =
    userEpsg ??
    geoKeys.ProjectedCSTypeGeoKey ??
    geoKeys.GeographicTypeGeoKey ??
    4326;

  // Reproject polygon from EPSG:4326 to the COG's CRS if needed
  let projectedRings: number[][][];

  if (epsgCode !== 4326) {
    const projector = proj4("EPSG:4326", `EPSG:${epsgCode}`);
    projectedRings = polygon.coordinates.map((ring) =>
      ring.map(([lon, lat]) => projector.forward([lon, lat]))
    );
  } else {
    projectedRings = polygon.coordinates.map((ring) =>
      ring.map(([lon, lat]) => [lon, lat])
    );
  }

  signal?.throwIfAborted();
  onProgress?.(0.15);

  // Compute polygon bbox in CRS coordinates
  const [bboxMinX, bboxMinY, bboxMaxX, bboxMaxY] = ringBBox(projectedRings[0]);

  // Convert bbox to pixel coordinates (full resolution)
  const [pxLeft, pxTop] = geoToPixel(bboxMinX, bboxMaxY, gt);
  const [pxRight, pxBottom] = geoToPixel(bboxMaxX, bboxMinY, gt);

  // Clamp to image bounds
  const fullWidth = fullImage.getWidth();
  const fullHeight = fullImage.getHeight();
  const windowLeft = Math.max(0, Math.floor(Math.min(pxLeft, pxRight)));
  const windowTop = Math.max(0, Math.floor(Math.min(pxTop, pxBottom)));
  const windowRight = Math.min(fullWidth, Math.ceil(Math.max(pxLeft, pxRight)));
  const windowBottom = Math.min(
    fullHeight,
    Math.ceil(Math.max(pxTop, pxBottom))
  );

  const windowWidth = windowRight - windowLeft;
  const windowHeight = windowBottom - windowTop;
  const windowPixels = windowWidth * windowHeight;

  if (windowPixels <= 0) {
    return {
      statistics: {
        mean: NaN,
        min: NaN,
        max: NaN,
        sum: 0,
        count: 0,
        noDataCount: 0,
        median: NaN,
        stddev: NaN
      },
      epsgCode,
      overviewLevel: 0,
      pixelResolution: [Math.abs(gt.pixelWidth), Math.abs(gt.pixelHeight)],
      windowPixelCount: 0
    };
  }

  // Select overview level
  const selectedOverview =
    userOverview !== undefined
      ? Math.min(userOverview, imageCount - 1)
      : selectOverviewLevel(imageCount, fullWidth, fullHeight, windowPixels);

  signal?.throwIfAborted();
  onProgress?.(0.2);

  // Get the image at the selected overview level
  const image =
    selectedOverview > 0 ? await tiff.getImage(selectedOverview) : fullImage;
  const imgWidth = image.getWidth();
  const imgHeight = image.getHeight();

  // Scale window to the overview level
  const scaleX = imgWidth / fullWidth;
  const scaleY = imgHeight / fullHeight;
  const ovWindowLeft = Math.max(0, Math.floor(windowLeft * scaleX));
  const ovWindowTop = Math.max(0, Math.floor(windowTop * scaleY));
  const ovWindowRight = Math.min(imgWidth, Math.ceil(windowRight * scaleX));
  const ovWindowBottom = Math.min(imgHeight, Math.ceil(windowBottom * scaleY));

  const ovWidth = ovWindowRight - ovWindowLeft;
  const ovHeight = ovWindowBottom - ovWindowTop;

  if (ovWidth <= 0 || ovHeight <= 0) {
    return {
      statistics: {
        mean: NaN,
        min: NaN,
        max: NaN,
        sum: 0,
        count: 0,
        noDataCount: 0,
        median: NaN,
        stddev: NaN
      },
      epsgCode,
      overviewLevel: selectedOverview,
      pixelResolution: [
        Math.abs(gt.pixelWidth) / scaleX,
        Math.abs(gt.pixelHeight) / scaleY
      ],
      windowPixelCount: 0
    };
  }

  // Read the raster window
  const rasters = await image.readRasters({
    window: [ovWindowLeft, ovWindowTop, ovWindowRight, ovWindowBottom],
    samples: [band - 1] // 0-based index
  });

  signal?.throwIfAborted();
  onProgress?.(0.7);

  const rasterData = rasters[0] as ArrayLike<number>;

  // Compute effective geotransform for the overview level
  const ovPixelWidth = (gt.pixelWidth * fullWidth) / imgWidth;
  const ovPixelHeight = (gt.pixelHeight * fullHeight) / imgHeight;
  const ovOriginX = gt.originX + ovWindowLeft * ovPixelWidth;
  const ovOriginY = gt.originY + ovWindowTop * ovPixelHeight;

  // Extract valid pixels (inside polygon and not nodata)
  const validValues: number[] = [];
  let noDataCount = 0;

  for (let row = 0; row < ovHeight; row++) {
    for (let col = 0; col < ovWidth; col++) {
      // Pixel center in CRS coordinates
      const cx = ovOriginX + (col + 0.5) * ovPixelWidth;
      const cy = ovOriginY + (row + 0.5) * ovPixelHeight;

      // Check if pixel center is inside the polygon
      if (!pointInZonalPolygon(cx, cy, projectedRings)) {
        continue;
      }

      const idx = row * ovWidth + col;
      const value = zonalPhysicalValue(
        rasterData[idx],
        noData,
        options.noDataValues,
        scale,
        offset
      );
      if (value === undefined || !Number.isFinite(value)) {
        noDataCount++;
        continue;
      }

      validValues.push(value);
    }

    // Report progress during pixel scanning
    if (row % 100 === 0) {
      onProgress?.(0.7 + 0.25 * (row / ovHeight));
    }
  }

  signal?.throwIfAborted();
  onProgress?.(0.95);

  const stats = computeStatistics(validValues);

  onProgress?.(1.0);

  return {
    statistics: { ...stats, noDataCount },
    epsgCode,
    overviewLevel: selectedOverview,
    pixelResolution: [Math.abs(ovPixelWidth), Math.abs(ovPixelHeight)],
    windowPixelCount: ovWidth * ovHeight
  };
}

/**
 * Calculate zonal statistics for multiple COGs (mosaic) and combine results.
 * Used when a single time step has multiple COG tiles.
 */
export async function calculateMosaicZonalStatistics(
  cogUrls: readonly string[],
  polygon: Polygon,
  options: Omit<ZonalCalculationOptions, "cogUrl" | "polygon"> = {}
): Promise<ZonalStatistics> {
  const results = await Promise.all(
    cogUrls.map(
      (url) =>
        calculateZonalStatistics({ ...options, cogUrl: url, polygon }).catch(
          () => null
        ) // Skip COGs that fail (e.g., don't intersect)
    )
  );

  const validResults = results.filter(
    (r): r is ZonalCalculationResult => r !== null && r.statistics.count > 0
  );

  if (validResults.length === 0) {
    return {
      mean: NaN,
      min: NaN,
      max: NaN,
      sum: 0,
      count: 0,
      noDataCount: 0,
      median: NaN,
      stddev: NaN
    };
  }

  if (validResults.length === 1) {
    return validResults[0].statistics;
  }

  // Combine statistics from multiple tiles
  let totalSum = 0;
  let totalCount = 0;
  let totalNoData = 0;
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const result of validResults) {
    const s = result.statistics;
    totalSum += s.sum;
    totalCount += s.count;
    totalNoData += s.noDataCount;
    if (s.min < globalMin) globalMin = s.min;
    if (s.max > globalMax) globalMax = s.max;
  }

  const combinedMean = totalCount > 0 ? totalSum / totalCount : NaN;

  // Combined variance using parallel algorithm
  let combinedVariance = 0;
  for (const result of validResults) {
    const s = result.statistics;
    if (s.count === 0) continue;
    const tileVariance = s.stddev * s.stddev;
    const tileMeanDiff = s.mean - combinedMean;
    combinedVariance += s.count * (tileVariance + tileMeanDiff * tileMeanDiff);
  }
  combinedVariance = totalCount > 0 ? combinedVariance / totalCount : NaN;

  return {
    mean: combinedMean,
    min: globalMin === Infinity ? NaN : globalMin,
    max: globalMax === -Infinity ? NaN : globalMax,
    sum: totalSum,
    count: totalCount,
    noDataCount: totalNoData,
    median: NaN, // Accurate median across tiles requires all values
    stddev: isNaN(combinedVariance) ? NaN : Math.sqrt(combinedVariance)
  };
}
