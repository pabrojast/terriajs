import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { fromArrayBuffer, writeArrayBuffer } from "geotiff";
import { spawnSync } from "node:child_process";
let directory, core;
before(async () => {
  directory = await mkdtemp(path.resolve(".spatial-tests-"));
  const entry = path.join(directory, "entry.ts");
  await writeFile(
    entry,
    'export * from "../spatial"; export * from "../../../lib/Core/CogZonalEngine"; export {setCogSourceOpener} from "../../../lib/Core/CogSourceCache";'
  );
  await build({
    entryPoints: [entry],
    outfile: path.join(directory, "core.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external"
  });
  core = await import(pathToFileURL(path.join(directory, "core.mjs")));
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});
test("native raster statistics preserve physical units, nodata and the hard pixel budget", async () => {
  const buffer = writeArrayBuffer([1, 2, 3, 255], {
    width: 2,
    height: 2,
    GeographicTypeGeoKey: 4326,
    ModelPixelScale: [1, 1, 0],
    ModelTiepoint: [0, 0, 0, 0, 2, 0]
  });
  core.setCogSourceOpener(async () => fromArrayBuffer(buffer));
  const request = {
    cogUrl: "https://fixture.invalid/native.tif",
    polygon: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0]
        ]
      ]
    },
    overviewLevel: 0,
    valueScale: 2,
    valueOffset: 1,
    noDataValues: [255],
    maxWindowPixels: 4
  };
  const result = await core.calculateZonalStatistics(request);
  assert.equal(result.statistics.mean, 5);
  assert.equal(result.statistics.count, 3);
  assert.equal(result.statistics.noDataCount, 1);
  assert.equal(result.overviewLevel, 0);
  await assert.rejects(
    core.calculateZonalStatistics({ ...request, maxWindowPixels: 3 }),
    /pixel budget/
  );
});
test("split windows combine sums and counts instead of averaging means", () => {
  const value = core.combineZonalResults([
    {
      statistics: { count: 1, sum: 10, noDataCount: 0 },
      overviewLevel: 0,
      windowPixelCount: 1
    },
    {
      statistics: { count: 3, sum: 90, noDataCount: 1 },
      overviewLevel: 0,
      windowPixelCount: 4
    }
  ]);
  assert.equal(value.statistics.mean, 25);
  assert.equal(value.statistics.count, 4);
});
test("water summaries weight whole intersecting bodies and keep null periods", () => {
  const value = core.viewportWaterPoints({
    bodies: [
      { id: 1, area: 1 },
      { id: 2, area: 4 }
    ],
    series: {
      ids: [1, 2],
      months: ["2024-01", "2024-02"],
      monthly: [
        [10, null],
        [30, null]
      ],
      monthlyDays: [
        [4, 0],
        [4, 0]
      ]
    },
    details: {},
    product: "CHL",
    resolution: "monthly",
    meta: { minCoverage: 0.1, minMonthsFullYear: 6 }
  });
  assert.equal(value[0].value, 30);
  assert.equal(value[0].count, 2);
  assert.equal(value[1].value, null);
});
test("GeoJSON selection includes intersecting whole polygons and excludes holes", async () => {
  const file = path.join(directory, "features.json");
  const polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-5, -5],
        [5, -5],
        [5, 5],
        [-5, 5],
        [-5, -5]
      ],
      [
        [-1, -1],
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1]
      ]
    ]
  };
  await writeFile(
    file,
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: polygon },
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] }
        }
      ]
    })
  );
  const result = spawnSync(process.execPath, ["dist/calculator.mjs"], {
    input: JSON.stringify({
      operation: "intersects",
      path: file,
      areas: [
        {
          type: "Polygon",
          coordinates: [
            [
              [-0.5, -0.5],
              [0.5, -0.5],
              [0.5, 0.5],
              [-0.5, 0.5],
              [-0.5, -0.5]
            ]
          ]
        }
      ]
    }),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [1]);
});
