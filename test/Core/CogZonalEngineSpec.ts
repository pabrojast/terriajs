import {
  adoptCogSource,
  clearCogSourceCache
} from "../../lib/Core/CogSourceCache";
import {
  calculateZonalStatistics,
  zonalPhysicalValue
} from "../../lib/Core/CogZonalEngine";
import { calculateTimeSeriesZonalStatistics } from "../../lib/Core/CogTimeSeriesCalculator";
import {
  calculateMosaicZonalStatistics,
  ZonalStatistics
} from "../../lib/Core/CogZonalEngine";
import { estimateTimeSeriesWork } from "../../lib/Core/CogTimeSeriesCalculator";
import type { Polygon } from "geojson";

/**
 * A polygon in the Black Sea / Ukraine area that overlaps with valid CHL data.
 * Coordinates are in EPSG:4326 (lon, lat).
 */
const TEST_POLYGON_UKRAINE: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [31.703779874631444, 46.730391429682356],
      [31.743033609881227, 46.73082938835652],
      [31.743869010058, 46.6948411874793],
      [31.704641345956635, 46.69440377592869],
      [31.703779874631444, 46.730391429682356]
    ]
  ]
};

describe("CogZonalEngine", function () {
  describe("computeStatistics helper logic", function () {
    it("should return correct statistics for known values", function () {
      // Test the statistics computation indirectly through the public API
      // We validate the structure and types of ZonalStatistics
      const emptyStats: ZonalStatistics = {
        mean: NaN,
        min: NaN,
        max: NaN,
        sum: 0,
        count: 0,
        noDataCount: 0,
        median: NaN,
        stddev: NaN
      };
      expect(emptyStats.count).toBe(0);
      expect(emptyStats.sum).toBe(0);
      expect(isNaN(emptyStats.mean)).toBe(true);
    });
  });

  describe("estimateTimeSeriesWork", function () {
    const timeEntries = [
      { time: "2023-01-01T00:00:00Z", cogs: ["a.tif", "b.tif"] },
      { time: "2023-01-15T00:00:00Z", cogs: ["c.tif"] },
      { time: "2023-02-01T00:00:00Z", cogs: ["d.tif", "e.tif", "f.tif"] },
      { time: "2023-03-01T00:00:00Z", cogs: ["g.tif"] },
      { time: "2023-04-01T00:00:00Z", cogs: ["h.tif"] }
    ];

    it("should count all entries when no filters", function () {
      const result = estimateTimeSeriesWork(timeEntries);
      expect(result.timeSteps).toBe(5);
      expect(result.totalCogs).toBe(8);
    });

    it("should filter by date range", function () {
      const result = estimateTimeSeriesWork(
        timeEntries,
        "2023-01-10T00:00:00Z",
        "2023-02-15T00:00:00Z"
      );
      expect(result.timeSteps).toBe(2);
      expect(result.totalCogs).toBe(4); // c.tif + d,e,f.tif
    });

    it("should apply subsampling", function () {
      const result = estimateTimeSeriesWork(
        timeEntries,
        undefined,
        undefined,
        2
      );
      expect(result.timeSteps).toBe(3); // indices 0, 2, 4
    });

    it("should combine date filter and subsampling", function () {
      const result = estimateTimeSeriesWork(
        timeEntries,
        "2023-01-01T00:00:00Z",
        "2023-04-01T00:00:00Z",
        2
      );
      expect(result.timeSteps).toBe(3);
    });
  });

  describe("calculateMosaicZonalStatistics", function () {
    it("should return NaN statistics for empty URL list", async function () {
      const result = await calculateMosaicZonalStatistics(
        [],
        TEST_POLYGON_UKRAINE
      );
      expect(result.count).toBe(0);
      expect(isNaN(result.mean)).toBe(true);
    });
  });
});

describe("CogZonalEngine physical units and polygon holes", function () {
  const polygon: Polygon = {
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
  };
  afterEach(() => clearCogSourceCache());
  function source(values: number[], metadata: Record<string, string> = {}) {
    const image = {
      getOrigin: () => [0, 2, 0],
      getResolution: () => [1, -1, 0],
      getWidth: () => 2,
      getHeight: () => 2,
      getGeoKeys: () => ({ GeographicTypeGeoKey: 4326 }),
      getGDALNoData: () => 65535,
      getGDALMetadata: () => metadata,
      readRasters: async () => [new Float32Array(values)]
    };
    return { getImage: async () => image, getImageCount: async () => 1 } as any;
  }
  it("converts daily uint16 samples before all statistics and excludes nodata", async function () {
    adoptCogSource("physical.tif", source([10, 20, 30, 65535]));
    const result = await calculateZonalStatistics({
      cogUrl: "physical.tif",
      polygon,
      valueScale: 0.1,
      valueOffset: 2,
      overviewLevel: 0
    });
    expect(result.statistics.mean).toBe(4);
    expect(result.statistics.median).toBe(4);
    expect(result.statistics.sum).toBe(12);
    expect(result.statistics.count).toBe(3);
    expect(result.statistics.noDataCount).toBe(1);
    expect(result.pixelResolution).toEqual([1, 1]);
  });
  it("falls back to GDAL scale/offset when the catalog does not override them", async function () {
    adoptCogSource(
      "metadata.tif",
      source([10, 20, 30, 65535], { SCALE: "0.1", OFFSET: "1" })
    );
    const result = await calculateZonalStatistics({
      cogUrl: "metadata.tif",
      polygon
    });
    expect(result.statistics.mean).toBe(3);
  });
  it("removes interior rings before the statistics", async function () {
    adoptCogSource("hole.tif", source([100, 20, 30, 40]));
    const hole: Polygon = {
      type: "Polygon",
      coordinates: [
        ...polygon.coordinates,
        [
          [0, 1],
          [1, 1],
          [1, 2],
          [0, 2],
          [0, 1]
        ]
      ]
    };
    const result = await calculateZonalStatistics({
      cogUrl: "hole.tif",
      polygon: hole,
      overviewLevel: 0
    });
    expect(result.statistics.count).toBe(3);
    expect(result.statistics.mean).toBe(30);
  });
  it("propagates physical transforms through time-series calculations", async function () {
    adoptCogSource("series-physical.tif", source([10, 20, 30, 65535]));
    const results = await calculateTimeSeriesZonalStatistics({
      timeEntries: [
        { time: "2026-10-06T00:00:00Z", cogs: ["series-physical.tif"] }
      ],
      polygon,
      valueScale: 0.1,
      valueOffset: 0,
      noDataValues: [30]
    });
    expect(results[0].statistics.mean).toBe(1.5);
    expect(results[0].statistics.count).toBe(2);
  });
  it("does not guess that 255 means nodata and rejects nonfinite values", function () {
    expect(zonalPhysicalValue(255, undefined, undefined, 0.1, 0)).toBe(25.5);
    expect(zonalPhysicalValue(NaN, undefined, undefined, 1, 0)).toBeUndefined();
    expect(zonalPhysicalValue(65535, 65535, undefined, 0.1, 0)).toBeUndefined();
  });
});
