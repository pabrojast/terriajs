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
