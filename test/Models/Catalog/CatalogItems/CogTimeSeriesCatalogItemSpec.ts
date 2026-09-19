import CogTimeSeriesCatalogItem from "../../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../../../lib/Models/Definition/updateModelFromJson";
import Terria from "../../../../lib/Models/Terria";
import {
  adoptCogSource,
  clearCogSourceCache
} from "../../../../lib/Core/CogSourceCache";

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
      expect(item.legends?.[0].items?.[0].value).toBe(20);
      expect(item.legends?.[0].items?.[1].value).toBe(-5);
    });

    it("keeps a configured share domain and legend values across timesteps", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [
          { time: "2025-07-09T00:00:00Z", cogs: ["low.tif"] },
          { time: "2025-07-10T00:00:00Z", cogs: ["high.tif"] }
        ],
        renderOptions: {
          single: {
            band: 1,
            colorScale: "ylgnbu",
            type: "continuous",
            domain: [0, 500],
            displayRange: [0, 50000],
            applyDisplayRange: true,
            clampHigh: true
          },
          nodata: 0
        }
      });
      const providers: Record<string, any> = {
        "low.tif": makeStyleProvider([2, 80]),
        "high.tif": makeStyleProvider([10, 900])
      };
      spyOn<any>(item as any, "_createImageryProvider").and.callFake(
        async (url: string) => providers[url]
      );

      await item.loadMapItems();

      expect(item.currentDiscreteTimeTag).toContain("2025-07-10");
      expect(item.effectiveCogStyle?.domain).toEqual([0, 500]);
      expect(item.effectiveCogStyle?.nativeDomain).toEqual([10, 900]);
      expect(providers["high.tif"].plot.domain).toEqual([0, 500]);
      expect(item.legends?.[0].items?.[0].value).toBe(500);
      expect(item.legends?.[0].items?.[1].value).toBe(0);

      item.setTrait(CommonStrata.user, "currentTime", "2025-07-09T00:00:00Z");
      await (item as any)._updateProvidersForCurrentTime();

      expect(item.effectiveCogStyle?.domain).toEqual([0, 500]);
      expect(item.effectiveCogStyle?.nativeDomain).toEqual([2, 80]);
      expect(item.legends?.[0].items?.[0].value).toBe(500);
      expect(item.legends?.[0].items?.[1].value).toBe(0);
    });

    it("keeps an explicitly configured legend ahead of the automatic legend", async function () {
      updateModelFromJson(item, CommonStrata.definition, {
        timeEntries: [{ time: "2025-07-09T00:00:00Z", cogs: ["a.tif"] }],
        legends: [{ title: "Configured legend", items: [] }]
      });
      spyOn<any>(item as any, "_createImageryProvider").and.returnValue(
        Promise.resolve(makeStyleProvider([0, 10]))
      );

      await item.loadMapItems();

      expect(item.legends?.length).toBe(1);
      expect(item.legends?.[0].title).toBe("Configured legend");
      expect(item.legends?.[0].url).toBeUndefined();
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
  // Time stepping: step cache, staleness, preload
  // ════════════════════════════════════════════════

  describe("time stepping", function () {
    const TIMES = [
      "2024-01-01T00:00:00Z",
      "2024-02-01T00:00:00Z",
      "2024-03-01T00:00:00Z",
      "2024-04-01T00:00:00Z"
    ];

    function configure(extra: Record<string, unknown> = {}) {
      updateModelFromJson(item, CommonStrata.definition, {
        // Same tag on every entry: steps must be keyed by COG URLs, not tags.
        timeEntries: TIMES.map((time, index) => ({
          time,
          tag: "same label",
          cogs: [`step${index}.tif`]
        })),
        renderOptions: { single: { colorScale: "ylgnbu", domain: [0, 10] } },
        preloadAdjacentSteps: 0,
        ...extra
      });
    }

    function stubProviders() {
      const providers: Record<string, any> = {};
      const spy = spyOn<any>(
        item as any,
        "_createImageryProvider"
      ).and.callFake(async (url: string) => {
        providers[url] = makeStyleProvider([0, 10]);
        spyOn(providers[url], "destroy").and.callThrough();
        return providers[url];
      });
      return { providers, spy };
    }

    async function stepTo(time: string) {
      item.setTrait(CommonStrata.user, "currentTime", time);
      await (item as any)._updateProvidersForCurrentTime();
    }

    it("reuses a built step when returning to its date", async function () {
      configure();
      const { providers, spy } = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", TIMES[0]);
      await item.loadMapItems();
      await stepTo(TIMES[1]);
      await stepTo(TIMES[0]);

      expect(spy.calls.count()).toBe(2);
      expect(item.mapItems.length).toBe(1);
      expect((item.mapItems[0] as any).imageryProvider).toBe(
        providers["step0.tif"]
      );
    });

    it("does not publish a build that was overtaken by a newer date", async function () {
      configure();
      const resolvers: Record<string, (provider: any) => void> = {};
      spyOn<any>(item as any, "_createImageryProvider").and.callFake(
        (url: string) =>
          new Promise((resolve) => {
            resolvers[url] = resolve;
          })
      );

      item.setTrait(CommonStrata.user, "currentTime", TIMES[0]);
      const first = (item as any)._updateProvidersForCurrentTime();
      item.setTrait(CommonStrata.user, "currentTime", TIMES[1]);
      const second = (item as any)._updateProvidersForCurrentTime();
      expect(item.isSteppingTime).toBe(true);
      expect(item.isLoading).toBe(true);

      const late = makeStyleProvider([0, 10]);
      const wanted = makeStyleProvider([0, 10]);
      resolvers["step1.tif"](wanted);
      await second;
      resolvers["step0.tif"](late);
      await first;

      expect((item.mapItems[0] as any).imageryProvider).toBe(wanted);
      expect(item.isSteppingTime).toBe(false);
      // The overtaken step is kept so going back to it is instant.
      expect((item as any)._stepCache.has("step0.tif")).toBe(true);
    });

    it("keeps the other dates built across a live restyle", async function () {
      configure();
      const { providers } = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", TIMES[0]);
      await item.loadMapItems();
      await stepTo(TIMES[1]);
      const clipBefore = (item.mapItems[0] as any).clippingRectangle;

      item.renderOptions.single!.setTrait(CommonStrata.user, "domain", [0, 50]);

      expect((item as any)._stepCache.size).toBe(2);
      expect(providers["step0.tif"].destroy).not.toHaveBeenCalled();
      expect(providers["step0.tif"].plot.domain).toEqual([0, 50]);
      expect(providers["step1.tif"].plot.domain).toEqual([0, 50]);
      // A new clip rectangle identity makes Cesium drop the stale tiles.
      expect((item.mapItems[0] as any).clippingRectangle).not.toBe(clipBefore);
    });

    it("evicts least recently used steps but never the displayed one", async function () {
      configure({ providerCacheSize: 2 });
      const { providers } = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", TIMES[0]);
      await item.loadMapItems();
      await stepTo(TIMES[1]);
      await stepTo(TIMES[2]);

      expect((item as any)._stepCache.size).toBe(2);
      expect(providers["step0.tif"].destroy).toHaveBeenCalledTimes(1);
      expect(providers["step2.tif"].destroy).not.toHaveBeenCalled();
      expect((item.mapItems[0] as any).imageryProvider).toBe(
        providers["step2.tif"]
      );
    });

    it("preloads neighbouring steps invisibly and promotes them without a new layer", async function () {
      configure({ preloadAdjacentSteps: 1, opacity: 0.7 });
      const { providers } = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", TIMES[1]);
      await item.loadMapItems();
      // Preloading waits for the displayed step to start loading its tiles.
      await new Promise((resolve) => setTimeout(resolve, 700));

      const parts = item.mapItems as any[];
      expect(parts.length).toBe(3);
      expect(parts[0].imageryProvider).toBe(providers["step1.tif"]);
      expect(parts[0].alpha).toBe(0.7);
      expect(parts.slice(1).map((part) => part.alpha)).toEqual([0, 0]);

      const next = parts.find(
        (part) => part.imageryProvider === providers["step2.tif"]
      );
      expect(next).toBeDefined();

      await stepTo(TIMES[2]);
      const promoted = (item.mapItems as any[])[0];
      // Same provider and same rectangle identity: Cesium keeps the layer
      // (and its already loaded tiles) instead of creating a new one.
      expect(promoted.imageryProvider).toBe(next.imageryProvider);
      expect(promoted.clippingRectangle).toBe(next.clippingRectangle);
      expect(promoted.alpha).toBe(0.7);
    });

    it("rebuilds every step when a build-time option changes", async function () {
      configure();
      const { providers, spy } = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", TIMES[0]);
      await item.loadMapItems();
      const original = providers["step0.tif"];

      item.renderOptions.setTrait(CommonStrata.user, "nodata", -9999);
      await item.loadMapItems();

      expect(original.destroy).toHaveBeenCalledTimes(1);
      expect(spy.calls.count()).toBe(2);
    });
  });

  // ════════════════════════════════════════════════
  // Value at a point: item-owned pick + point series
  // ════════════════════════════════════════════════

  describe("value at a point", function () {
    const LON = 30.5;
    const LAT = 50.5;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    /** Stand-in for a GeoTIFF covering 30–31°E, 50–51°N with one value. */
    function fakeTiff(raw: number, noData: number | null = null): any {
      const image = {
        getOrigin: () => [30, 51, 0],
        getResolution: () => [0.1, -0.1, 0],
        getWidth: () => 10,
        getHeight: () => 10,
        getGeoKeys: () => ({ GeographicTypeGeoKey: 4326 }),
        getGDALNoData: () => noData,
        readRasters: async () => [new Float32Array([raw])]
      };
      return { getImage: async () => image };
    }

    function configure(extra: Record<string, unknown> = {}) {
      updateModelFromJson(item, CommonStrata.definition, {
        name: "CHL",
        unit: "mg m-3",
        dateFormat: "UTC:mmm yyyy",
        timeEntries: [
          { time: "2024-01-01T00:00:00Z", cogs: ["jan.tif"] },
          { time: "2024-02-01T00:00:00Z", cogs: ["feb-a.tif", "feb-b.tif"] },
          { time: "2024-03-01T00:00:00Z", cogs: ["mar.tif"] }
        ],
        renderOptions: { single: { colorScale: "ylgnbu", domain: [0, 100] } },
        preloadAdjacentSteps: 0,
        ...extra
      });
      adoptCogSource("jan.tif", fakeTiff(120, 65535));
      adoptCogSource("feb-a.tif", fakeTiff(65535, 65535));
      adoptCogSource("feb-b.tif", fakeTiff(437, 65535));
      adoptCogSource("mar.tif", fakeTiff(65535, 65535));
    }

    /** Build real-looking providers through the item's own factory hook. */
    function stubProviders() {
      const providers: Record<string, any> = {};
      const original = (item as any)._installPick.bind(item);
      spyOn<any>(item as any, "_createImageryProvider").and.callFake(
        async (url: string) => {
          const provider = makeStyleProvider([0, 100]);
          provider.url = url;
          original(provider);
          providers[url] = provider;
          return provider;
        }
      );
      return providers;
    }

    function pick(provider: any, lon = LON, lat = LAT) {
      return provider.pickFeatures(0, 0, 0, toRadians(lon), toRadians(lat));
    }

    afterEach(function () {
      item.clearAccumulatedSeries();
      clearCogSourceCache();
    });

    it("returns one positioned feature with the physical value, unit and date", async function () {
      configure({ valueScale: 0.1 });
      const providers = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-01-01T00:00:00Z");
      await item.loadMapItems();

      const features = await pick(providers["jan.tif"]);

      expect(features.length).toBe(1);
      const feature = features[0];
      expect(feature.name).toBe("CHL — Jan 2024");
      expect(feature.position.longitude).toBeCloseTo(toRadians(LON), 9);
      expect(feature.position.latitude).toBeCloseTo(toRadians(LAT), 9);
      expect(feature.data.value).toBeCloseTo(12, 6);
      expect(feature.data.unit).toBe("mg m-3");
      expect(feature.data.date).toContain("2024-01-01");
      expect(feature.data.longitude).toBeCloseTo(LON, 9);
      expect(feature.properties.cogTimeSeriesPick).toBeUndefined();
    });

    it("answers a mosaic click once, with the tile that has data", async function () {
      configure({ valueScale: 0.1 });
      const providers = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-02-01T00:00:00Z");
      await item.loadMapItems();

      // Cesium asks every COG of the mosaic about the same click.
      const [first, second] = await Promise.all([
        pick(providers["feb-a.tif"]),
        pick(providers["feb-b.tif"])
      ]);

      expect(first.length + second.length).toBe(1);
      expect([...first, ...second][0].data.value).toBeCloseTo(43.7, 6);
    });

    it("reports no-data as a feature without a value, and nothing outside the imagery", async function () {
      configure();
      const providers = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-03-01T00:00:00Z");
      await item.loadMapItems();

      const noData = await pick(providers["mar.tif"]);
      expect(noData.length).toBe(1);
      expect(noData[0].data.value).toBeNull();

      expect((await pick(providers["mar.tif"], 10, 10)).length).toBe(0);
    });

    it("never rejects and never answers for a step that is not displayed", async function () {
      configure();
      const providers = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-01-01T00:00:00Z");
      await item.loadMapItems();
      const january = providers["jan.tif"];
      item.setTrait(CommonStrata.user, "currentTime", "2024-03-01T00:00:00Z");
      await (item as any)._updateProvidersForCurrentTime();

      // January is still cached but no longer on screen.
      expect((await pick(january)).length).toBe(0);

      adoptCogSource("broken.tif", {
        getImage: async () => {
          throw new Error("corrupt");
        }
      } as any);
      providers["mar.tif"].url = "broken.tif";
      spyOn(console, "error");
      expect((await pick(providers["mar.tif"], 30.2, 50.2)).length).toBe(0);
    });

    it("reads the time series of a clicked point and exposes it to the chart dock", async function () {
      configure({ valueScale: 0.1 });
      const providers = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-02-01T00:00:00Z");
      await item.loadMapItems();

      await pick(providers["feb-b.tif"]);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(item.pointSeries.length).toBe(1);
      const series = item.pointSeries[0];
      expect(series.label).toBe("P1");
      expect(series.status).toBe("done");
      expect(series.noData).toBe(1);
      expect(series.errors).toBe(0);
      // Ascending ISO dates on x; values in physical units.
      expect(series.points).toEqual([
        { x: Date.parse("2024-01-01T00:00:00Z"), y: 120 * 0.1 },
        { x: Date.parse("2024-02-01T00:00:00Z"), y: 437 * 0.1 }
      ]);

      const accumulated = item.accumulatedChartSeries;
      expect(accumulated.length).toBe(1);
      expect(accumulated[0].name).toContain("P1");
      expect(accumulated[0].units).toBe("mg m-3");
      expect(accumulated[0].meta).toEqual({
        kind: "point",
        lat: LAT,
        lon: LON
      });
      expect(item.accumulatedChartItems[0].points.length).toBe(2);

      // Clicking the same place again reuses the series.
      item.addPointSeries(LAT, LON);
      expect(item.pointSeries.length).toBe(1);

      item.removeAccumulatedSeries(series.key);
      expect(item.pointSeries.length).toBe(0);
    });

    it("restores a shared point series without reading it again", function () {
      configure();
      item.addAccumulatedSeries({
        key: "50.50000,30.50000",
        name: "P3 (50.5000, 30.5000)",
        color: "#0072B2",
        points: [{ x: 1, y: 2 }],
        meta: { kind: "point", lat: LAT, lon: LON }
      });

      expect(item.pointSeries.length).toBe(1);
      expect(item.pointSeries[0].label).toBe("P3");
      expect(item.pointSeries[0].status).toBe("done");
      // The next clicked point continues the numbering.
      item.addPointSeries(51, 31);
      expect(item.pointSeries[1].label).toBe("P4");
    });

    it("applies the colour range in stored units and shows it in physical units", async function () {
      configure({ valueScale: 0.1 });
      const providers = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-01-01T00:00:00Z");
      await item.loadMapItems();

      // domain [0, 100] mg m-3 over a raster that stores tenths.
      expect(providers["jan.tif"].plot.domain).toEqual([0, 1000]);
      expect(item.effectiveCogStyle?.domain).toEqual([0, 100]);
      expect(item.legends?.[0].items?.[0].value).toBe(100);
      expect(item.legends?.[0].title).toContain("mg m-3");
    });
  });

  // ════════════════════════════════════════════════
  // Temporal resolutions (annual / monthly / daily in one item)
  // ════════════════════════════════════════════════

  describe("resolutions", function () {
    const CONFIG = {
      name: "CHL",
      unit: "mg m-3",
      // Shared by every resolution.
      renderOptions: { single: { colorScale: "ylgnbu", band: 1 } },
      activeResolutionId: "monthly",
      preloadAdjacentSteps: 0,
      resolutions: [
        {
          id: "annual",
          name: "Annual",
          dateFormat: "UTC:yyyy",
          fromContinuous: "previous",
          renderOptions: { single: { domain: [0, 60] } },
          timeEntries: [
            { time: "2023-01-01T00:00:00Z", tag: "2023", cogs: ["y2023.tif"] },
            { time: "2024-01-01T00:00:00Z", tag: "2024", cogs: ["y2024.tif"] },
            { time: "2025-01-01T00:00:00Z", tag: "2025", cogs: ["y2025.tif"] }
          ]
        },
        {
          id: "monthly",
          name: "Monthly",
          dateFormat: "UTC:mmm yyyy",
          fromContinuous: "previous",
          renderOptions: { single: { domain: [0, 80] } },
          timeEntries: [
            { time: "2024-06-01T00:00:00Z", cogs: ["m2024-06.tif"] },
            { time: "2024-07-01T00:00:00Z", cogs: ["m2024-07.tif"] },
            { time: "2024-08-01T00:00:00Z", cogs: ["m2024-08.tif"] }
          ]
        },
        {
          id: "daily",
          name: "Daily",
          valueScale: 0.1,
          partialCoverage: true,
          renderOptions: {
            single: { domain: [0, 100] },
            resampleMethod: "nearest"
          },
          timeEntries: [
            { time: "2024-07-09T00:00:00Z", cogs: ["d20240709.tif"] }
          ]
        }
      ]
    };

    function stubProviders() {
      return spyOn<any>(item as any, "_createImageryProvider").and.callFake(
        async (url: string) => {
          const provider = makeStyleProvider([0, 1000]);
          provider.url = url;
          return provider;
        }
      );
    }

    it("takes time steps and settings from the active resolution", function () {
      updateModelFromJson(item, CommonStrata.definition, CONFIG);

      expect(item.activeResolution?.id).toBe("monthly");
      expect(item.timeEntries?.map((entry) => entry.cogs?.[0])).toEqual([
        "m2024-06.tif",
        "m2024-07.tif",
        "m2024-08.tif"
      ]);
      expect(item.dateFormat).toBe("UTC:mmm yyyy");
      expect(item.fromContinuous).toBe("previous");
      expect(item.valueTransform).toEqual({ scale: 1, offset: 0 });
      // Per-resolution range, shared palette, continuous default.
      expect(item.renderOptions.single?.domain as any).toEqual([0, 80]);
      expect(item.renderOptions.single?.colorScale).toBe("ylgnbu");
      expect(item.renderOptions.resampleMethod).toBe("bilinear");
    });

    it("falls back to the first resolution and keeps items without resolutions unchanged", function () {
      updateModelFromJson(item, CommonStrata.definition, {
        ...CONFIG,
        activeResolutionId: "does-not-exist"
      });
      expect(item.activeResolution?.id).toBe("annual");

      const plain = new CogTimeSeriesCatalogItem("plain", terria);
      updateModelFromJson(plain, CommonStrata.definition, {
        timeEntries: [{ time: "2024-01-15T00:00:00Z", cogs: ["a.tif"] }]
      });
      expect(plain.activeResolution).toBeUndefined();
      expect(plain.timeEntries?.length).toBe(1);
      expect(
        plain.selectableDimensions.some(
          (dim) => dim.id === "cog-series-resolution"
        )
      ).toBe(false);
    });

    it("keeps the period when switching: July 2024 monthly becomes 2024 annual", async function () {
      updateModelFromJson(item, CommonStrata.definition, CONFIG);
      stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-07-01T00:00:00Z");
      await item.loadMapItems();
      expect(item.currentStepLabel).toBe("Jul 2024");

      item.setActiveResolution(CommonStrata.user, "annual");
      await item.loadMapItems();

      // `nearest` would have picked 2025 for July; `previous` keeps the year.
      expect(item.currentStepLabel).toBe("2024");
      expect((item.mapItems[0] as any).imageryProvider.url).toBe("y2024.tif");
      expect(item.effectiveCogStyle?.domain).toEqual([0, 60]);
    });

    it("applies a resolution's scale and explicit resampling, and warns about partial coverage", function () {
      updateModelFromJson(item, CommonStrata.definition, CONFIG);
      item.setActiveResolution(CommonStrata.user, "daily");

      expect(item.valueTransform).toEqual({ scale: 0.1, offset: 0 });
      expect(item.renderOptions.resampleMethod).toBe("nearest");
      expect(item.renderOptions.single?.domain as any).toEqual([0, 100]);
      expect(item.shortReport).toBeDefined();
    });

    it("drops a colour range the user set on another resolution", function () {
      updateModelFromJson(item, CommonStrata.definition, CONFIG);
      item.renderOptions.single!.setTrait(CommonStrata.user, "domain", [5, 15]);
      expect(item.renderOptions.single?.domain as any).toEqual([5, 15]);

      item.setActiveResolution(CommonStrata.user, "annual");

      expect(item.renderOptions.single?.domain as any).toEqual([0, 60]);
    });

    it("keeps built steps when switching back and forth", async function () {
      updateModelFromJson(item, CommonStrata.definition, CONFIG);
      const spy = stubProviders();
      item.setTrait(CommonStrata.user, "currentTime", "2024-07-01T00:00:00Z");
      await item.loadMapItems();
      item.setActiveResolution(CommonStrata.user, "annual");
      await item.loadMapItems();
      item.setActiveResolution(CommonStrata.user, "monthly");
      await item.loadMapItems();

      // m2024-07 and y2024 were each built exactly once.
      expect(spy.calls.allArgs().map((args) => args[0])).toEqual([
        "m2024-07.tif",
        "y2024.tif"
      ]);
    });

    it("offers the resolution as pills on top of the workbench card, plus palette and range", function () {
      updateModelFromJson(item, CommonStrata.definition, CONFIG);
      const dimensions = item.selectableDimensions as any[];

      const resolution = dimensions.find(
        (dim) => dim.id === "cog-series-resolution"
      );
      expect(resolution.display).toBe("pills");
      expect(resolution.placement).toBe("top");
      expect(resolution.selectedId).toBe("monthly");
      expect(resolution.options.map((option: any) => option.name)).toEqual([
        "Annual",
        "Monthly",
        "Daily"
      ]);
      resolution.setDimensionValue(CommonStrata.user, "daily");
      expect(item.activeResolution?.id).toBe("daily");

      expect(
        dimensions.find((dim) => dim.id === "cog-series-palette")
      ).toBeDefined();
      const range = dimensions.find((dim) => dim.id === "cog-series-range");
      expect(range.name).toContain("mg m-3");
      expect(range.selectableDimensions.map((dim: any) => dim.id)).toEqual([
        "cog-series-range-min",
        "cog-series-range-max",
        "cog-series-range-fit",
        "cog-series-range-reset"
      ]);
    });

    it("keeps the example init file valid", async function () {
      const response = await fetch("/test/init/cog-time-series-example.json");
      const { type, id, ...definition } = (await response.json()).catalog[0];
      expect(type).toBe("cog-time-series");
      expect(id).toBeDefined();

      const result = updateModelFromJson(
        item,
        CommonStrata.definition,
        definition
      );

      expect(result.error).toBeUndefined();
      expect(item.activeResolution?.id).toBe("monthly");
      expect(item.resolutions.length).toBe(2);
      expect(item.valueTransform.scale).toBe(0.1);
    });

    it("loads each resolution's time steps from its own URL, once", async function () {
      jasmine.Ajax.install();
      try {
        updateModelFromJson(item, CommonStrata.definition, {
          preloadAdjacentSteps: 0,
          resolutions: [
            { id: "annual", url: "https://example.com/annual.json" },
            { id: "monthly", url: "https://example.com/monthly.json" }
          ]
        });
        jasmine.Ajax.stubRequest("https://example.com/annual.json").andReturn({
          responseJSON: {
            times: [{ time: "2024-01-01T00:00:00Z", cogs: ["y2024.tif"] }]
          }
        });
        jasmine.Ajax.stubRequest("https://example.com/monthly.json").andReturn({
          responseJSON: SAMPLE_TIME_SERIES_JSON
        });
        stubProviders();

        await item.loadMapItems();
        expect(item.timeEntries?.length).toBe(1);

        item.setActiveResolution(CommonStrata.user, "monthly");
        await item.loadMapItems();
        expect(item.timeEntries?.length).toBe(3);

        item.setActiveResolution(CommonStrata.user, "annual");
        await item.loadMapItems();
        expect(item.timeEntries?.length).toBe(1);
        expect(jasmine.Ajax.requests.count()).toBe(2);
      } finally {
        jasmine.Ajax.uninstall();
      }
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
            colorScale: "ylgnbu",
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
    rectangle: { west: 0, south: 0, east: 1, north: 1 },
    destroy() {}
  };
}
