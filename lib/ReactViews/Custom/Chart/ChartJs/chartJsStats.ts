import { SeriesStats } from "./ChartJsTypes";

/**
 * Pure statistics over chart series. Deliberately free of chart.js and React
 * so both the lazy renderer and the light dock (KPI tiles) can use it.
 */

export interface StatsPoint {
  /** Epoch milliseconds (or any number on a linear axis). */
  x: number;
  y: number;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
/** A slope over less than this is noise, not a trend. */
const MIN_TREND_SPAN_MS = MS_PER_YEAR / 2;
const MIN_TREND_POINTS = 3;

function finitePoints(points: readonly StatsPoint[]): StatsPoint[] {
  return points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  );
}

/** min / max / mean over the finite y values; undefined when there are none. */
export function computeSeriesStats(
  points: readonly { y: number | undefined }[]
): SeriesStats | undefined {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const point of points) {
    const y = Number(point.y);
    if (!Number.isFinite(y)) continue;
    if (y < min) min = y;
    if (y > max) max = y;
    sum += y;
    count++;
  }
  return count > 0 ? { min, max, mean: sum / count, count } : undefined;
}

/** The point with the highest y. */
export function maxPoint(
  points: readonly StatsPoint[]
): StatsPoint | undefined {
  let best: StatsPoint | undefined;
  for (const point of finitePoints(points)) {
    if (!best || point.y > best.y) best = point;
  }
  return best;
}

/** y of the point at exactly `x`, if the series has one. */
export function valueAtX(
  points: readonly StatsPoint[],
  x: number | undefined
): number | undefined {
  if (x === undefined) return undefined;
  const match = points.find((point) => point.x === x);
  return match && Number.isFinite(match.y) ? match.y : undefined;
}

/**
 * Least-squares slope in y units per year, for points whose x is epoch
 * milliseconds. Undefined when the series is too short (fewer than three
 * points, or spanning under half a year) for a slope to mean anything.
 */
export function computeTrendPerYear(
  points: readonly StatsPoint[]
): number | undefined {
  const finite = finitePoints(points);
  if (finite.length < MIN_TREND_POINTS) return undefined;

  let minX = Infinity;
  let maxX = -Infinity;
  let sumX = 0;
  let sumY = 0;
  for (const point of finite) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    sumX += point.x;
    sumY += point.y;
  }
  if (maxX - minX < MIN_TREND_SPAN_MS) return undefined;

  const meanX = sumX / finite.length;
  const meanY = sumY / finite.length;
  let covariance = 0;
  let variance = 0;
  for (const point of finite) {
    covariance += (point.x - meanX) * (point.y - meanY);
    variance += (point.x - meanX) ** 2;
  }
  if (variance === 0) return undefined;
  return (covariance / variance) * MS_PER_YEAR;
}

/** Compact number for a tile or legend: up to 3 significant decimals. */
export function formatStatValue(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return String(Number(value.toFixed(decimals)));
}
