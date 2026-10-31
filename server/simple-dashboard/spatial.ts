import {
  waterBodyPoints,
  WaterBody,
  WaterPoint
} from "../../lib/Core/WaterQuality";
import type { ZonalCalculationResult } from "../../lib/Core/CogZonalEngine";

export function viewportWaterPoints(job: any): WaterPoint[] {
  const byDate = new Map<string, { value: number; weight: number }[]>();
  for (const body of job.bodies as WaterBody[]) {
    const points = waterBodyPoints(
      body.id,
      job.series,
      job.details[String(body.id)],
      job.product,
      job.resolution,
      job.meta
    );
    for (const point of points) {
      const values = byDate.get(point.date) ?? [];
      byDate.set(point.date, values);
      if (point.value !== null && Number.isFinite(point.value) && body.area > 0)
        values.push({ value: point.value, weight: body.area });
    }
  }
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      values.sort((a, b) => a.value - b.value);
      const half = values.reduce((sum, v) => sum + v.weight, 0) / 2;
      let cumulative = 0;
      const median = values.find((v) => (cumulative += v.weight) >= half);
      return { date, value: median?.value ?? null, count: values.length };
    });
}

/** Split antimeridian windows have no overlap. Combine sums, never means. */
export function combineZonalResults(results: ZonalCalculationResult[]) {
  const count = results.reduce((n, r) => n + r.statistics.count, 0);
  const sum = results.reduce((n, r) => n + r.statistics.sum, 0);
  return {
    ...results[0],
    windowPixelCount: results.reduce((n, r) => n + r.windowPixelCount, 0),
    overviewLevel: Math.max(...results.map((r) => r.overviewLevel)),
    statistics: {
      count,
      sum,
      mean: count ? sum / count : null,
      noDataCount: results.reduce((n, r) => n + r.statistics.noDataCount, 0)
    }
  };
}
