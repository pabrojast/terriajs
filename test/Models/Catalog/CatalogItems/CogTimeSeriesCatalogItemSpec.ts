import CogTimeSeriesCatalogItem from "../../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../../../lib/Models/Definition/updateModelFromJson";
import Terria from "../../../../lib/Models/Terria";

describe("CogTimeSeriesCatalogItem", function () {
  let item: CogTimeSeriesCatalogItem;

  beforeEach(function () {
    item = new CogTimeSeriesCatalogItem("test", new Terria());
  });

  it("should have type 'cog-time-series'", function () {
    expect(item.type).toEqual("cog-time-series");
  });

  it("can be instantiated", function () {
    expect(item).toBeDefined();
  });

  describe("traits", function () {
    it("can parse inline time entries from JSON", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          {
            time: "2024-01-15T00:00:00Z",
            cogs: [
              "https://example.com/data/2024-01-15/tile_1.tif",
              "https://example.com/data/2024-01-15/tile_2.tif"
            ]
          },
          {
            time: "2024-01-16T00:00:00Z",
            cogs: ["https://example.com/data/2024-01-16/tile_1.tif"],
            tag: "Sentinel-2 2024-01-16"
          }
        ]
      });

      expect(item.timeEntries).toBeDefined();
      expect(item.timeEntries!.length).toBe(2);
      expect(item.timeEntries![0].time).toBe("2024-01-15T00:00:00Z");
      expect(item.timeEntries![0].cogs!.length).toBe(2);
      expect(item.timeEntries![1].tag).toBe("Sentinel-2 2024-01-16");
    });

    it("can parse area calculation definitions", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        areaCalculations: [
          {
            name: "Mean NDVI - Farm A",
            polygon: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0]
                ]
              ]
            },
            band: 1,
            statistic: "mean",
            unit: "NDVI",
            values: [
              { time: "2024-01-15T00:00:00Z", value: 0.72 },
              { time: "2024-01-16T00:00:00Z", value: 0.68 }
            ]
          }
        ]
      });

      expect(item.areaCalculations).toBeDefined();
      expect(item.areaCalculations!.length).toBe(1);
      expect(item.areaCalculations![0].name).toBe("Mean NDVI - Farm A");
      expect(item.areaCalculations![0].statistic).toBe("mean");
      expect(item.areaCalculations![0].unit).toBe("NDVI");
      expect(item.areaCalculations![0].values!.length).toBe(2);
      expect(item.areaCalculations![0].polygon).toBeDefined();
    });

    it("can parse render options", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        renderOptions: {
          single: {
            colorScale: "greens",
            domain: [0, 1],
            band: 1
          }
        }
      });

      expect(item.renderOptions).toBeDefined();
      expect(item.renderOptions!.single!.colorScale).toBe("greens");
      expect(item.renderOptions!.single!.band).toBe(1);
    });
  });

  describe("discreteTimes", function () {
    it("returns discrete times from inline time entries", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-01-16T00:00:00Z", cogs: ["b.tif"] },
          { time: "2024-01-17T00:00:00Z", cogs: ["c.tif"] }
        ]
      });

      const times = item.discreteTimes;
      expect(times).toBeDefined();
      expect(times!.length).toBe(3);
      expect(times![0].time).toBe("2024-01-15T00:00:00Z");
      expect(times![1].time).toBe("2024-01-16T00:00:00Z");
      expect(times![2].time).toBe("2024-01-17T00:00:00Z");
    });

    it("uses tag as display tag when provided", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          {
            time: "2024-01-15T00:00:00Z",
            cogs: ["a.tif"],
            tag: "Day 1"
          }
        ]
      });

      const times = item.discreteTimes;
      expect(times).toBeDefined();
      expect(times![0].tag).toBe("Day 1");
    });

    it("falls back to time as tag when tag is not provided", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [{ time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] }]
      });

      const times = item.discreteTimes;
      expect(times).toBeDefined();
      expect(times![0].tag).toBe("2024-01-15T00:00:00Z");
    });

    it("returns undefined when there are no time entries", function () {
      expect(item.discreteTimes).toBeUndefined();
    });
  });

  describe("time navigation", function () {
    beforeEach(function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-01-16T00:00:00Z", cogs: ["b.tif"] },
          { time: "2024-01-17T00:00:00Z", cogs: ["c.tif"] }
        ]
      });
    });

    it("computes start and stop times from entries", function () {
      expect(item.startTime).toContain("2024-01-15");
      expect(item.stopTime).toContain("2024-01-17");
    });

    it("has sorted julian dates", function () {
      const julianDates = item.discreteTimesAsSortedJulianDates;
      expect(julianDates).toBeDefined();
      expect(julianDates!.length).toBe(3);
    });
  });

  describe("area calculations", function () {
    beforeEach(function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-01-16T00:00:00Z", cogs: ["b.tif"] }
        ],
        areaCalculations: [
          {
            name: "Mean NDVI",
            statistic: "mean",
            unit: "NDVI",
            values: [
              { time: "2024-01-15T00:00:00Z", value: 0.72 },
              { time: "2024-01-16T00:00:00Z", value: 0.68 }
            ]
          }
        ]
      });
    });

    it("returns area calculation time series data", function () {
      const series = item.getAreaCalculationTimeSeries("Mean NDVI");
      expect(series).toBeDefined();
      expect(series!.length).toBe(2);
      expect(series![0].time).toBe("2024-01-15T00:00:00Z");
      expect(series![0].value).toBe(0.72);
    });

    it("returns undefined for non-existent calculation", function () {
      expect(
        item.getAreaCalculationTimeSeries("Does Not Exist")
      ).toBeUndefined();
    });
  });

  describe("mosaic support", function () {
    it("supports multiple COGs per time step", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          {
            time: "2024-01-15T00:00:00Z",
            cogs: [
              "https://example.com/tile_1.tif",
              "https://example.com/tile_2.tif",
              "https://example.com/tile_3.tif"
            ]
          }
        ]
      });

      expect(item.timeEntries).toBeDefined();
      expect(item.timeEntries![0].cogs!.length).toBe(3);
    });
  });

  describe("full JSON configuration", function () {
    it("can be created from a complete config", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        name: "NDVI Daily",
        description: "Daily NDVI composites from Sentinel-2",
        renderOptions: {
          single: {
            colorScale: "greens",
            domain: [0, 1],
            type: "continuous"
          }
        },
        timeEntries: [
          {
            time: "2024-01-15T00:00:00Z",
            cogs: ["https://example.com/ndvi_20240115.tif"],
            tag: "Jan 15, 2024"
          },
          {
            time: "2024-01-16T00:00:00Z",
            cogs: [
              "https://example.com/ndvi_20240116_part1.tif",
              "https://example.com/ndvi_20240116_part2.tif"
            ],
            tag: "Jan 16, 2024"
          }
        ],
        areaCalculations: [
          {
            name: "Mean NDVI - Study Area",
            band: 1,
            statistic: "mean",
            unit: "NDVI",
            polygon: {
              type: "Polygon",
              coordinates: [
                [
                  [-3.7, 40.4],
                  [-3.6, 40.4],
                  [-3.6, 40.5],
                  [-3.7, 40.5],
                  [-3.7, 40.4]
                ]
              ]
            },
            values: [
              { time: "2024-01-15T00:00:00Z", value: 0.65 },
              { time: "2024-01-16T00:00:00Z", value: 0.71 }
            ]
          }
        ],
        providerCacheSize: 5
      });

      expect(item.name).toBe("NDVI Daily");
      expect(item.discreteTimes!.length).toBe(2);
      expect(item.discreteTimes![0].tag).toBe("Jan 15, 2024");
      expect(item.areaCalculations!.length).toBe(1);
      expect(item.providerCacheSize).toBe(5);
    });
  });
});
