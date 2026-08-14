import CogTimeSeriesCatalogItem from "../../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../../../lib/Models/Definition/updateModelFromJson";
import Terria from "../../../../lib/Models/Terria";

// ─── Sample remote JSON payloads ───

const SAMPLE_TIME_SERIES_JSON = {
  times: [
    {
      time: "2024-06-01T00:00:00Z",
      cogs: [
        "https://data.example.com/chl/20240601_36TVS.tif",
        "https://data.example.com/chl/20240601_36UUA.tif"
      ],
      tag: "2024-06-01 (2 tiles)"
    },
    {
      time: "2024-06-15T00:00:00Z",
      cogs: ["https://data.example.com/chl/20240615_36TVS.tif"]
    },
    {
      time: "2024-07-01T00:00:00Z",
      cogs: [
        "https://data.example.com/chl/20240701_36TVS.tif",
        "https://data.example.com/chl/20240701_36UUA.tif",
        "https://data.example.com/chl/20240701_36UUB.tif"
      ],
      tag: "2024-07-01 (3 tiles)"
    }
  ]
};

const SAMPLE_PRECALCULATED_VALUES = {
  values: [
    { time: "2024-06-01T00:00:00Z", value: 12.5 },
    { time: "2024-06-15T00:00:00Z", value: 18.3 },
    { time: "2024-07-01T00:00:00Z", value: 25.1 }
  ]
};

const SAMPLE_PRECALCULATED_VALUES_2 = {
  values: [
    { time: "2024-06-01T00:00:00Z", value: 0.65 },
    { time: "2024-06-15T00:00:00Z", value: 0.72 },
    { time: "2024-07-01T00:00:00Z", value: 0.81 }
  ]
};

describe("CogTimeSeriesCatalogItem", function () {
  let item: CogTimeSeriesCatalogItem;
  let terria: Terria;

  beforeEach(function () {
    terria = new Terria();
    item = new CogTimeSeriesCatalogItem("test", terria);
  });

  it("should have type 'cog-time-series'", function () {
    expect(item.type).toEqual("cog-time-series");
  });

  it("can be instantiated", function () {
    expect(item).toBeDefined();
  });

  // ════════════════════════════════════════════════
  // Traits parsing
  // ════════════════════════════════════════════════

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

    it("can parse multiple area calculations", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        areaCalculations: [
          {
            name: "CHL Mean",
            statistic: "mean",
            unit: "µg/L",
            values: [{ time: "2024-01-01T00:00:00Z", value: 15.2 }]
          },
          {
            name: "CHL Max",
            statistic: "max",
            unit: "µg/L",
            values: [{ time: "2024-01-01T00:00:00Z", value: 42.8 }]
          },
          {
            name: "Turbidity",
            statistic: "median",
            unit: "NTU",
            values: [{ time: "2024-01-01T00:00:00Z", value: 3.1 }]
          }
        ]
      });

      expect(item.areaCalculations!.length).toBe(3);
      expect(item.areaCalculations![0].name).toBe("CHL Mean");
      expect(item.areaCalculations![1].statistic).toBe("max");
      expect(item.areaCalculations![2].unit).toBe("NTU");
    });

    it("can parse area calculation with precalculatedUrl", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        areaCalculations: [
          {
            name: "CHL Mean",
            statistic: "mean",
            unit: "µg/L",
            precalculatedUrl: "https://example.com/stats/chl-mean.json"
          }
        ]
      });

      expect(item.areaCalculations![0].precalculatedUrl).toBe(
        "https://example.com/stats/chl-mean.json"
      );
      expect(item.areaCalculations![0].values!.length).toBe(0);
    });

    it("can parse providerCacheSize", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        providerCacheSize: 10
      });
      expect(item.providerCacheSize).toBe(10);
    });
  });

  // ════════════════════════════════════════════════
  // Discrete times
  // ════════════════════════════════════════════════

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

    it("filters out entries without a time value", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] },
          { cogs: ["b.tif"] },
          { time: "2024-01-17T00:00:00Z", cogs: ["c.tif"] }
        ]
      });

      const times = item.discreteTimes;
      expect(times).toBeDefined();
      expect(times!.length).toBe(2);
    });
  });

  // ════════════════════════════════════════════════
  // Time navigation
  // ════════════════════════════════════════════════

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

    it("sets the current time to the last available time by default", function () {
      expect(item.currentDiscreteTimeTag).toContain("2024-01-17");
    });
  });

  // ════════════════════════════════════════════════
  // Area calculations - inline values
  // ════════════════════════════════════════════════

  describe("area calculations - inline values", function () {
    beforeEach(function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-01-16T00:00:00Z", cogs: ["b.tif"] },
          { time: "2024-01-17T00:00:00Z", cogs: ["c.tif"] }
        ],
        areaCalculations: [
          {
            name: "Mean CHL",
            statistic: "mean",
            unit: "µg/L",
            values: [
              { time: "2024-01-15T00:00:00Z", value: 12.5 },
              { time: "2024-01-16T00:00:00Z", value: 18.3 },
              { time: "2024-01-17T00:00:00Z", value: 25.1 }
            ]
          },
          {
            name: "Max Turbidity",
            statistic: "max",
            unit: "NTU",
            values: [
              { time: "2024-01-15T00:00:00Z", value: 3.1 },
              { time: "2024-01-16T00:00:00Z", value: 4.5 }
            ]
          }
        ]
      });
    });

    it("returns area calculation time series data", function () {
      const series = item.getAreaCalculationTimeSeries("Mean CHL");
      expect(series).toBeDefined();
      expect(series!.length).toBe(3);
      expect(series![0].time).toBe("2024-01-15T00:00:00Z");
      expect(series![0].value).toBe(12.5);
      expect(series![2].value).toBe(25.1);
    });

    it("returns undefined for non-existent calculation name", function () {
      expect(
        item.getAreaCalculationTimeSeries("Does Not Exist")
      ).toBeUndefined();
    });

    it("returns currentAreaCalculationResults for current time", function () {
      const results = item.currentAreaCalculationResults;
      expect(results).toBeDefined();
      expect(results.length).toBe(2);

      const chlResult = results.find((r) => r.name === "Mean CHL");
      expect(chlResult).toBeDefined();
      // Default current time is the last entry (2024-01-17)
      expect(chlResult!.value).toBe(25.1);
      expect(chlResult!.unit).toBe("µg/L");
      expect(chlResult!.statistic).toBe("mean");
    });

    it("returns undefined value when current time has no matching value", function () {
      const results = item.currentAreaCalculationResults;
      // Max Turbidity only has values for 01-15 and 01-16, not 01-17
      const turbidityResult = results.find((r) => r.name === "Max Turbidity");
      expect(turbidityResult).toBeDefined();
      expect(turbidityResult!.value).toBeUndefined();
    });

    it("returns empty results when there are no area calculations", function () {
      const emptyItem = new CogTimeSeriesCatalogItem("empty", terria);
      updateModelFromJson(emptyItem, CommonStrata.definition, {
        timeEntries: [{ time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] }]
      });
      expect(emptyItem.currentAreaCalculationResults.length).toBe(0);
    });

    it("returns time series for each area calculation independently", function () {
      const chlSeries = item.getAreaCalculationTimeSeries("Mean CHL");
      const turbiditySeries =
        item.getAreaCalculationTimeSeries("Max Turbidity");

      expect(chlSeries!.length).toBe(3);
      expect(turbiditySeries!.length).toBe(2);
      expect(turbiditySeries![0].value).toBe(3.1);
      expect(turbiditySeries![1].value).toBe(4.5);
    });
  });

  describe("temporary area chart items", function () {
    beforeEach(function () {
      updateModelFromJson(item, CommonStrata.definition, {
        name: "CHL Daily",
        timeEntries: [
          { time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-01-16T00:00:00Z", cogs: ["b.tif"] }
        ]
      });
      item.setTrait(CommonStrata.user, "show", true);
    });

    it("adds temporary zonal-statistics chart items to chartItems", function () {
      item.setTemporaryAreaChart({
        name: "Area Mean",
        values: [
          { time: "2024-01-15T00:00:00Z", value: 12.5 },
          { time: "2024-01-16T00:00:00Z", value: 18.3 }
        ]
      });
      item.setTemporaryAreaChartExpandedInChartPanel(true);

      const chartItem = item.chartItems.find(
        (chart) => chart.id === "test-temporary-area-chart"
      );

      expect(chartItem).toBeDefined();
      expect(chartItem!.name).toBe("Area Mean");
      expect(chartItem!.type).toBe("line");
      expect(chartItem!.points.length).toBe(2);
      expect(chartItem!.showInChartPanel).toBe(true);
      expect(chartItem!.isSelectedInWorkbench).toBe(true);
    });

    it("removes temporary zonal-statistics chart items when cleared", function () {
      item.setTemporaryAreaChart({
        name: "Area Mean",
        values: [{ time: "2024-01-15T00:00:00Z", value: 12.5 }]
      });
      item.setTemporaryAreaChartExpandedInChartPanel(true);

      item.clearTemporaryAreaChart();

      expect(
        item.chartItems.find(
          (chart) => chart.id === "test-temporary-area-chart"
        )
      ).toBeUndefined();
      expect(item.isTemporaryAreaChartExpandedInChartPanel).toBe(false);
    });
  });

  // ════════════════════════════════════════════════
  // Remote JSON loading (time entries + area values)
  // ════════════════════════════════════════════════

  describe("remote JSON loading", function () {
    beforeEach(function () {
      jasmine.Ajax.install();
    });

    afterEach(function () {
      jasmine.Ajax.uninstall();
    });

    it("loads time entries from a remote URL", async function () {
      item.setTrait(
        CommonStrata.definition,
        "url",
        "https://example.com/timeseries.json"
      );

      jasmine.Ajax.stubRequest("https://example.com/timeseries.json").andReturn(
        {
          responseJSON: SAMPLE_TIME_SERIES_JSON
        }
      );

      await item.loadMapItems();

      expect(item.timeEntries).toBeDefined();
      expect(item.timeEntries!.length).toBe(3);
      expect(item.timeEntries![0].time).toBe("2024-06-01T00:00:00Z");
      expect(item.timeEntries![0].cogs!.length).toBe(2);
      expect(item.timeEntries![0].tag).toBe("2024-06-01 (2 tiles)");
      expect(item.timeEntries![1].cogs!.length).toBe(1);
      expect(item.timeEntries![2].cogs!.length).toBe(3);
    });

    it("populates discreteTimes after loading from URL", async function () {
      item.setTrait(
        CommonStrata.definition,
        "url",
        "https://example.com/timeseries.json"
      );

      jasmine.Ajax.stubRequest("https://example.com/timeseries.json").andReturn(
        {
          responseJSON: SAMPLE_TIME_SERIES_JSON
        }
      );

      await item.loadMapItems();

      const times = item.discreteTimes;
      expect(times).toBeDefined();
      expect(times!.length).toBe(3);
      expect(times![0].time).toBe("2024-06-01T00:00:00Z");
      expect(times![1].tag).toBe("2024-06-15T00:00:00Z"); // no tag → uses time
      expect(times![2].tag).toBe("2024-07-01 (3 tiles)");
    });

    it("loads precalculated area values from a remote URL", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-06-01T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-06-15T00:00:00Z", cogs: ["b.tif"] },
          { time: "2024-07-01T00:00:00Z", cogs: ["c.tif"] }
        ],
        areaCalculations: [
          {
            name: "Mean CHL",
            statistic: "mean",
            unit: "µg/L",
            precalculatedUrl: "https://example.com/stats/chl-mean.json"
          }
        ]
      });

      jasmine.Ajax.stubRequest(
        "https://example.com/stats/chl-mean.json"
      ).andReturn({
        responseJSON: SAMPLE_PRECALCULATED_VALUES
      });

      await item.loadMapItems();

      const series = item.getAreaCalculationTimeSeries("Mean CHL");
      expect(series).toBeDefined();
      expect(series!.length).toBe(3);
      expect(series![0].value).toBe(12.5);
      expect(series![1].value).toBe(18.3);
      expect(series![2].value).toBe(25.1);
    });

    it("loads multiple precalculated area value URLs", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-06-01T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-06-15T00:00:00Z", cogs: ["b.tif"] },
          { time: "2024-07-01T00:00:00Z", cogs: ["c.tif"] }
        ],
        areaCalculations: [
          {
            name: "Mean CHL",
            statistic: "mean",
            unit: "µg/L",
            precalculatedUrl: "https://example.com/stats/chl-mean.json"
          },
          {
            name: "NDVI",
            statistic: "mean",
            unit: "index",
            precalculatedUrl: "https://example.com/stats/ndvi.json"
          }
        ]
      });

      jasmine.Ajax.stubRequest(
        "https://example.com/stats/chl-mean.json"
      ).andReturn({
        responseJSON: SAMPLE_PRECALCULATED_VALUES
      });
      jasmine.Ajax.stubRequest("https://example.com/stats/ndvi.json").andReturn(
        {
          responseJSON: SAMPLE_PRECALCULATED_VALUES_2
        }
      );

      await item.loadMapItems();

      const chlSeries = item.getAreaCalculationTimeSeries("Mean CHL");
      const ndviSeries = item.getAreaCalculationTimeSeries("NDVI");

      expect(chlSeries!.length).toBe(3);
      expect(chlSeries![0].value).toBe(12.5);

      expect(ndviSeries!.length).toBe(3);
      expect(ndviSeries![0].value).toBe(0.65);
      expect(ndviSeries![2].value).toBe(0.81);
    });

    it("uses loaded precalculated values in currentAreaCalculationResults", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2024-06-01T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-06-15T00:00:00Z", cogs: ["b.tif"] },
          { time: "2024-07-01T00:00:00Z", cogs: ["c.tif"] }
        ],
        areaCalculations: [
          {
            name: "Mean CHL",
            statistic: "mean",
            unit: "µg/L",
            precalculatedUrl: "https://example.com/stats/chl-mean.json"
          }
        ]
      });

      jasmine.Ajax.stubRequest(
        "https://example.com/stats/chl-mean.json"
      ).andReturn({
        responseJSON: SAMPLE_PRECALCULATED_VALUES
      });

      await item.loadMapItems();

      // Default current time is last entry: 2024-07-01
      const results = item.currentAreaCalculationResults;
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("Mean CHL");
      expect(results[0].value).toBe(25.1);
      expect(results[0].unit).toBe("µg/L");
      expect(results[0].statistic).toBe("mean");
    });

    it("prefers inline values over loaded values", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [{ time: "2024-06-01T00:00:00Z", cogs: ["a.tif"] }],
        areaCalculations: [
          {
            name: "Mean CHL",
            statistic: "mean",
            unit: "µg/L",
            precalculatedUrl: "https://example.com/stats/chl-mean.json",
            values: [{ time: "2024-06-01T00:00:00Z", value: 999.9 }]
          }
        ]
      });

      jasmine.Ajax.stubRequest(
        "https://example.com/stats/chl-mean.json"
      ).andReturn({
        responseJSON: { values: [{ time: "2024-06-01T00:00:00Z", value: 1.0 }] }
      });

      await item.loadMapItems();

      // getAreaCalculationTimeSeries prefers inline values
      const series = item.getAreaCalculationTimeSeries("Mean CHL");
      expect(series![0].value).toBe(999.9);
    });

    it("handles failed precalculated URL gracefully", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [{ time: "2024-06-01T00:00:00Z", cogs: ["a.tif"] }],
        areaCalculations: [
          {
            name: "Failing Calc",
            statistic: "mean",
            unit: "µg/L",
            precalculatedUrl: "https://example.com/stats/not-found.json"
          }
        ]
      });

      jasmine.Ajax.stubRequest(
        "https://example.com/stats/not-found.json"
      ).andReturn({
        status: 404,
        responseText: "Not Found"
      });

      // Should not throw — area calculations are non-fatal
      await item.loadMapItems();

      const series = item.getAreaCalculationTimeSeries("Failing Calc");
      expect(series).toBeUndefined();
    });

    it("loads both time entries and area values from remote URLs", async function () {
      item.setTrait(
        CommonStrata.definition,
        "url",
        "https://example.com/timeseries.json"
      );
      updateModelFromJson(item, CommonStrata.definition, {
        areaCalculations: [
          {
            name: "CHL",
            statistic: "mean",
            unit: "µg/L",
            precalculatedUrl: "https://example.com/stats/chl.json"
          }
        ]
      });

      jasmine.Ajax.stubRequest("https://example.com/timeseries.json").andReturn(
        {
          responseJSON: SAMPLE_TIME_SERIES_JSON
        }
      );
      jasmine.Ajax.stubRequest("https://example.com/stats/chl.json").andReturn({
        responseJSON: SAMPLE_PRECALCULATED_VALUES
      });

      await item.loadMapItems();

      expect(item.timeEntries!.length).toBe(3);
      const series = item.getAreaCalculationTimeSeries("CHL");
      expect(series!.length).toBe(3);
    });
  });

  // ════════════════════════════════════════════════
  // Mosaic support
  // ════════════════════════════════════════════════

  describe("mosaic support", function () {
    it("uses one automatic domain and legend for every COG in the current timestep", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          {
            time: "2024-01-15T00:00:00Z",
            cogs: ["low.tif", "high.tif"]
          }
        ]
      });
      const providers = [
        makeStyleProvider([-5, 8]),
        makeStyleProvider([2, 20])
      ];
      let providerIndex = 0;
      spyOn<any>(item as any, "_createImageryProvider").and.callFake(
        async () => providers[providerIndex++]
      );

      await item.loadMapItems();

      expect(item.effectiveCogStyle?.domain).toEqual([-5, 20]);
      expect(providers[0].plot.domain).toEqual([-5, 20]);
      expect(providers[1].plot.domain).toEqual([-5, 20]);
      expect(item.legends?.length).toBe(1);
    });

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

    it("supports varying numbers of tiles across time steps", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          {
            time: "2024-01-15T00:00:00Z",
            cogs: ["tile_1.tif"]
          },
          {
            time: "2024-01-16T00:00:00Z",
            cogs: ["tile_1.tif", "tile_2.tif", "tile_3.tif", "tile_4.tif"]
          },
          {
            time: "2024-01-17T00:00:00Z",
            cogs: ["tile_1.tif", "tile_2.tif"]
          }
        ]
      });

      expect(item.timeEntries![0].cogs!.length).toBe(1);
      expect(item.timeEntries![1].cogs!.length).toBe(4);
      expect(item.timeEntries![2].cogs!.length).toBe(2);
    });
  });

  // ════════════════════════════════════════════════
  // mapItems behavior (without TIFFImageryProvider)
  // ════════════════════════════════════════════════

  describe("mapItems", function () {
    it("returns empty array when no providers are loaded", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [{ time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] }]
      });
      // No providers have been created (no loadMapItems called)
      expect(item.mapItems.length).toBe(0);
    });
  });

  // ════════════════════════════════════════════════
  // Full JSON configuration (realistic examples)
  // ════════════════════════════════════════════════

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

    it("supports Terrascope-style config with remote time series and area calculations", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        name: "🇺🇦 Clorofila-a Sentinel-2",
        description: "Chlorophyll-a time series from Terrascope",
        url: "https://example.com/cog-timeseries.json",
        renderOptions: {
          single: {
            colorScale: "ylgnbu",
            domain: [0, 500],
            type: "continuous",
            band: 1,
            clampHigh: true,
            noDataColor: "rgba(0,0,0,0)"
          },
          nodata: 0
        },
        areaCalculations: [
          {
            name: "CHL Mean - Dnipro Reservoir",
            band: 1,
            statistic: "mean",
            unit: "µg/L",
            polygon: {
              type: "Polygon",
              coordinates: [
                [
                  [33.5, 47.8],
                  [34.0, 47.8],
                  [34.0, 48.2],
                  [33.5, 48.2],
                  [33.5, 47.8]
                ]
              ]
            },
            precalculatedUrl: "https://example.com/stats/dnipro-chl.json"
          }
        ],
        opacity: 0.9,
        providerCacheSize: 5
      });

      expect(item.name).toBe("🇺🇦 Clorofila-a Sentinel-2");
      expect(item.url).toBe("https://example.com/cog-timeseries.json");
      expect(item.renderOptions!.single!.colorScale).toBe("ylgnbu");
      expect(item.renderOptions!.nodata).toBe(0);
      expect((item.areaCalculations![0] as any).polygon.type).toBe("Polygon");
      expect(item.areaCalculations![0].precalculatedUrl).toBe(
        "https://example.com/stats/dnipro-chl.json"
      );
      expect(item.providerCacheSize).toBe(5);
    });

    it("supports config with inline time entries and inline area values", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        name: "Water Quality - Lake",
        timeEntries: [
          {
            time: "2024-03-01T00:00:00Z",
            cogs: ["https://data.example.com/lake/20240301.tif"],
            tag: "Mar 2024"
          },
          {
            time: "2024-04-01T00:00:00Z",
            cogs: ["https://data.example.com/lake/20240401.tif"],
            tag: "Apr 2024"
          },
          {
            time: "2024-05-01T00:00:00Z",
            cogs: [
              "https://data.example.com/lake/20240501_N.tif",
              "https://data.example.com/lake/20240501_S.tif"
            ],
            tag: "May 2024 (2 tiles)"
          }
        ],
        areaCalculations: [
          {
            name: "CHL - North Basin",
            statistic: "mean",
            unit: "µg/L",
            polygon: {
              type: "Polygon",
              coordinates: [
                [
                  [10, 45],
                  [11, 45],
                  [11, 46],
                  [10, 46],
                  [10, 45]
                ]
              ]
            },
            values: [
              { time: "2024-03-01T00:00:00Z", value: 5.2 },
              { time: "2024-04-01T00:00:00Z", value: 12.8 },
              { time: "2024-05-01T00:00:00Z", value: 28.4 }
            ]
          },
          {
            name: "CHL - South Basin",
            statistic: "mean",
            unit: "µg/L",
            polygon: {
              type: "Polygon",
              coordinates: [
                [
                  [10, 44],
                  [11, 44],
                  [11, 45],
                  [10, 45],
                  [10, 44]
                ]
              ]
            },
            values: [
              { time: "2024-03-01T00:00:00Z", value: 3.1 },
              { time: "2024-04-01T00:00:00Z", value: 8.5 },
              { time: "2024-05-01T00:00:00Z", value: 15.7 }
            ]
          }
        ],
        renderOptions: {
          single: {
            colorScale: "viridis",
            domain: [0, 50],
            type: "continuous"
          }
        }
      });

      // Verify time navigation
      expect(item.discreteTimes!.length).toBe(3);
      expect(item.startTime).toContain("2024-03-01");
      expect(item.stopTime).toContain("2024-05-01");

      // Verify area calculations
      const northSeries =
        item.getAreaCalculationTimeSeries("CHL - North Basin");
      const southSeries =
        item.getAreaCalculationTimeSeries("CHL - South Basin");
      expect(northSeries!.length).toBe(3);
      expect(southSeries!.length).toBe(3);

      // Current time is last entry → May 2024
      const results = item.currentAreaCalculationResults;
      expect(results.length).toBe(2);

      const northResult = results.find((r) => r.name === "CHL - North Basin");
      const southResult = results.find((r) => r.name === "CHL - South Basin");
      expect(northResult!.value).toBe(28.4);
      expect(southResult!.value).toBe(15.7);
    });
  });

  // ════════════════════════════════════════════════
  // JSON format examples (documenting the expected format)
  // ════════════════════════════════════════════════

  describe("JSON format documentation", function () {
    it("documents the time series JSON format loaded from URL", function () {
      // This test documents the expected JSON format for the `url` property.
      // The JSON must have a "times" array with objects containing:
      //   - time: ISO 8601 string (required)
      //   - cogs: array of COG file URLs (required)
      //   - tag: display label (optional)
      const exampleJson = {
        times: [
          {
            time: "2024-06-01T00:00:00Z",
            cogs: [
              "https://data.example.com/chl/S2A_20240601_36TVS_CHL.tif",
              "https://data.example.com/chl/S2A_20240601_36UUA_CHL.tif"
            ],
            tag: "2024-06-01 (2 tiles)"
          },
          {
            time: "2024-06-15T00:00:00Z",
            cogs: ["https://data.example.com/chl/S2B_20240615_36TVS_CHL.tif"]
          }
        ]
      };

      expect(exampleJson.times).toBeDefined();
      expect(exampleJson.times.length).toBeGreaterThan(0);
      expect(exampleJson.times[0].time).toBeDefined();
      expect(exampleJson.times[0].cogs).toBeDefined();
      expect(Array.isArray(exampleJson.times[0].cogs)).toBe(true);
    });

    it("documents the precalculated values JSON format", function () {
      // This test documents the expected JSON format for precalculatedUrl.
      // The JSON must have a "values" array with objects containing:
      //   - time: ISO 8601 string matching a time entry
      //   - value: numeric statistic value
      const exampleJson = {
        values: [
          { time: "2024-06-01T00:00:00Z", value: 12.5 },
          { time: "2024-06-15T00:00:00Z", value: 18.3 },
          { time: "2024-07-01T00:00:00Z", value: 25.1 }
        ]
      };

      expect(exampleJson.values).toBeDefined();
      expect(exampleJson.values.length).toBeGreaterThan(0);
      expect(typeof exampleJson.values[0].time).toBe("string");
      expect(typeof exampleJson.values[0].value).toBe("number");
    });

    it("documents a complete catalog init JSON", function () {
      // This test documents the full catalog init JSON that
      // can be placed in TerriaMap's wwwroot/init/ directory.
      const catalogInit = {
        catalog: [
          {
            type: "cog-time-series",
            id: "ukraine-chl-demo",
            name: "🇺🇦 Clorofila-a Sentinel-2",
            description: "Time series demo with area calculations",
            url: "https://data.example.com/cog-timeseries.json",
            renderOptions: {
              single: {
                colorScale: "ylgnbu",
                domain: [0, 500],
                type: "continuous",
                band: 1,
                clampHigh: true,
                noDataColor: "rgba(0,0,0,0)"
              },
              nodata: 0
            },
            areaCalculations: [
              {
                name: "CHL Mean - Dnipro",
                band: 1,
                statistic: "mean",
                unit: "µg/L",
                polygon: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [33.5, 47.8],
                      [34.0, 47.8],
                      [34.0, 48.2],
                      [33.5, 48.2],
                      [33.5, 47.8]
                    ]
                  ]
                },
                precalculatedUrl:
                  "https://data.example.com/stats/dnipro-chl.json"
              }
            ],
            opacity: 0.9,
            providerCacheSize: 5
          }
        ]
      };

      expect(catalogInit.catalog[0].type).toBe("cog-time-series");
      expect(catalogInit.catalog[0].url).toBeDefined();
      expect(catalogInit.catalog[0].renderOptions).toBeDefined();
      expect(catalogInit.catalog[0].areaCalculations!.length).toBe(1);
    });
  });
});

function makeStyleProvider(domain: [number, number]): any {
  const plot: any = {
    domain: domain.slice(),
    applyDisplayRange: false,
    setDomain(value: number[]) {
      this.domain = value;
    },
    setClamp() {},
    setColorType() {},
    setColorScaleImage() {},
    setDisplayRange(value: number[]) {
      this.displayRange = value;
      this.applyDisplayRange = true;
    }
  };
  return {
    plot,
    bands: { 1: { min: domain[0], max: domain[1] } },
    readSamples: [0],
    renderOptions: { single: { band: 1 } },
    destroy() {}
  };
}
