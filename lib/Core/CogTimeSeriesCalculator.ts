/**
 * CogTimeSeriesCalculator — Iterates over time steps of a COG time series,
 * computing zonal statistics for each step within a user-drawn polygon.
 *
 * Features:
 * - Controlled concurrency (configurable, default 2)
 * - Progress reporting
 * - Cancellation via AbortController
 * - Date range filtering
 * - Mosaic support (multiple COGs per time step)
 */

import type { Polygon } from "geojson";
import {
  calculateMosaicZonalStatistics,
  calculateZonalStatistics,
  ZonalStatistics
} from "./CogZonalEngine";

// ─── Public Types ──────────────────────────────────────────────

export interface TimeStepResult {
  time: string;
  tag?: string;
  statistics: ZonalStatistics;
}

export interface TimeSeriesProgress {
  completed: number;
  total: number;
  currentTime: string;
  /** Fraction from 0 to 1 */
  fraction: number;
}

export interface TimeEntry {
  time: string;
  cogs: readonly string[];
  tag?: string;
}

export interface TimeSeriesCalculationOptions {
  /** Array of time entries with COG URLs */
  timeEntries: readonly TimeEntry[];
  /** GeoJSON Polygon (EPSG:4326) */
  polygon: Polygon;
  /** Band index (1-based). Default: 1 */
  band?: number;
  /** NoData override */
  noDataValue?: number;
  /** EPSG code of the COGs */
  epsgCode?: number;
  /** Overview level override */
  overviewLevel?: number;
  /** ISO 8601 start date filter (inclusive) */
  startDate?: string;
  /** ISO 8601 end date filter (inclusive) */
  endDate?: string;
  /** Temporal subsampling: take every Nth entry. Default: 1 (all) */
  subsampleStep?: number;
  /** Max concurrent COG fetches. Default: 2 */
  concurrency?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: (progress: TimeSeriesProgress) => void;
}

// ─── Helpers ───────────────────────────────────────────────────

function filterByDateRange(
  entries: readonly TimeEntry[],
  startDate?: string,
  endDate?: string
): TimeEntry[] {
  let filtered = [...entries];

  if (startDate) {
    const start = new Date(startDate).getTime();
    filtered = filtered.filter((e) => new Date(e.time).getTime() >= start);
  }

  if (endDate) {
    const end = new Date(endDate).getTime();
    filtered = filtered.filter((e) => new Date(e.time).getTime() <= end);
  }

  return filtered.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
}

function subsample(entries: TimeEntry[], step: number): TimeEntry[] {
  if (step <= 1) return entries;
  return entries.filter((_, i) => i % step === 0);
}

// ─── Concurrency Control ───────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// ─── Main Calculator ───────────────────────────────────────────

/**
 * Calculate zonal statistics across a time series of COGs.
 *
 * Returns an array of { time, tag?, statistics } for each processed time step.
 */
export async function calculateTimeSeriesZonalStatistics(
  options: TimeSeriesCalculationOptions
): Promise<TimeStepResult[]> {
  const {
    timeEntries,
    polygon,
    band = 1,
    noDataValue,
    epsgCode,
    overviewLevel,
    startDate,
    endDate,
    subsampleStep = 1,
    concurrency = 2,
    signal,
    onProgress
  } = options;

  signal?.throwIfAborted();

  // Filter and subsample
  let entries = filterByDateRange(timeEntries, startDate, endDate);
  entries = subsample(entries, subsampleStep);

  if (entries.length === 0) {
    return [];
  }

  const total = entries.length;
  let completed = 0;

  const results = await mapWithConcurrency(
    entries,
    concurrency,
    async (entry, _index) => {
      signal?.throwIfAborted();

      onProgress?.({
        completed,
        total,
        currentTime: entry.time,
        fraction: completed / total
      });

      let statistics: ZonalStatistics;

      try {
        if (entry.cogs.length === 1) {
          const result = await calculateZonalStatistics({
            cogUrl: entry.cogs[0],
            polygon,
            band,
            noDataValue,
            epsgCode,
            overviewLevel,
            signal
          });
          statistics = result.statistics;
        } else {
          statistics = await calculateMosaicZonalStatistics(
            entry.cogs,
            polygon,
            { band, noDataValue, epsgCode, overviewLevel, signal }
          );
        }
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        // Skip failed time steps with empty statistics
        statistics = {
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

      completed++;
      onProgress?.({
        completed,
        total,
        currentTime: entry.time,
        fraction: completed / total
      });

      return {
        time: entry.time,
        tag: entry.tag,
        statistics
      };
    }
  );

  return results.filter((r) => r.statistics.count > 0);
}

/**
 * Estimate the number of time steps and COGs to process.
 * Useful for showing the user an estimate before starting.
 */
export function estimateTimeSeriesWork(
  timeEntries: readonly TimeEntry[],
  startDate?: string,
  endDate?: string,
  subsampleStep: number = 1
): { timeSteps: number; totalCogs: number } {
  let entries = filterByDateRange(timeEntries, startDate, endDate);
  entries = subsample(entries, subsampleStep);
  const totalCogs = entries.reduce((sum, e) => sum + e.cogs.length, 0);
  return { timeSteps: entries.length, totalCogs };
}
