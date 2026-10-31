import { readFile } from "node:fs/promises";
import booleanIntersects from "@turf/boolean-intersects";
import { viewportWaterPoints, combineZonalResults } from "./spatial";
import { fromCustomClient } from "geotiff";
import {
  openCogSource,
  setCogSourceOpener
} from "../../lib/Core/CogSourceCache";
import { calculateZonalStatistics } from "../../lib/Core/CogZonalEngine";
import { readCogStepPointValue } from "../../lib/Core/CogPointReader";
import { waterBodyPoints, waterTrend } from "../../lib/Core/WaterQuality";
import { request } from "./transport.mjs";

setCogSourceOpener(async (url) =>
  fromCustomClient(
    {
      url,
      request: ({ headers }: { headers: Record<string, string> }) =>
        request(url, headers)
    } as any,
    { cacheSize: 24, allowFullFile: true }
  )
);
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 32 * 1024 * 1024)
    throw new Error("Calculation input exceeds limits");
}
try {
  const job = JSON.parse(input);
  let result: unknown;
  if (job.operation === "intersects") {
    const data = JSON.parse(await readFile(job.path, "utf8"));
    if (data.type !== "FeatureCollection")
      throw new Error("Invalid geometry collection");
    result = data.features.flatMap((feature: any, index: number) => {
      if (!feature.geometry) return [];
      try {
        return job.areas.some((area: any) => booleanIntersects(area, feature))
          ? [index]
          : [];
      } catch {
        throw new Error("Invalid source geometry");
      }
    });
  } else if (job.operation === "water_view") {
    result = { points: viewportWaterPoints(job) };
  } else if (job.operation === "water") {
    const points = waterBodyPoints(
      job.body,
      job.series,
      job.detail,
      job.product,
      job.resolution,
      job.meta
    );
    result = { points, trend: waterTrend(points) };
  } else if (job.operation === "probe") {
    const response = await request(job.url, {}, "HEAD");
    if (!response.ok) throw new Error("Source unavailable");
    result = {
      etag: response.getHeader("etag"),
      modified: response.getHeader("last-modified"),
      size: response.getHeader("content-length")
    };
  } else if (job.area.type === "Point") {
    const [lon, lat] = job.area.coordinates;
    const image = await (await openCogSource(job.url)).getImage(0);
    const meta = image.getGDALMetadata((job.band ?? 1) - 1);
    const scale = job.scale ?? Number(meta?.SCALE ?? 1);
    const offset = job.offset ?? Number(meta?.OFFSET ?? 0);
    if (!Number.isFinite(scale) || !Number.isFinite(offset))
      throw new Error("Invalid physical conversion");
    result = await readCogStepPointValue([job.url], lon, lat, {
      band: job.band,
      transform: { scale, offset },
      noDataValues: job.noDataValues
    });
  } else {
    const results = [];
    for (const polygon of job.areas ?? [job.area])
      results.push(
        await calculateZonalStatistics({
          cogUrl: job.url,
          polygon,
          overviewLevel: job.native ? 0 : undefined,
          maxWindowPixels: 500_000,
          band: job.band,
          valueScale: job.scale,
          valueOffset: job.offset,
          noDataValues: job.noDataValues
        })
      );
    const overview = Math.max(...results.map((r) => r.overviewLevel));
    for (let i = 0; i < results.length; i++) {
      if (
        results[i].overviewLevel !== overview &&
        results[i].windowPixelCount > 0
      )
        results[i] = await calculateZonalStatistics({
          cogUrl: job.url,
          polygon: (job.areas ?? [job.area])[i],
          band: job.band,
          overviewLevel: overview,
          maxWindowPixels: 500_000,
          valueScale: job.scale,
          valueOffset: job.offset,
          noDataValues: job.noDataValues
        });
    }
    result = combineZonalResults(results);
  }
  process.stdout.write(JSON.stringify(result));
} catch (_) {
  process.stderr.write(
    "Calculation failed; verify source availability and selected area.\n"
  );
  process.exitCode = 1;
}
