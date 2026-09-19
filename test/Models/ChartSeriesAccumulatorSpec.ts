import CogTimeSeriesCatalogItem from "../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CsvCatalogItem from "../../lib/Models/Catalog/CatalogItems/CsvCatalogItem";
import GeoJsonCatalogItem from "../../lib/Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import { isChartSeriesAccumulator } from "../../lib/Models/ChartSeriesAccumulator";
import CommonStrata from "../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../lib/Models/Definition/updateModelFromJson";
import Terria from "../../lib/Models/Terria";

describe("ChartSeriesAccumulator", function () {
  let terria: Terria;

  beforeEach(function () {
    terria = new Terria();
  });

  it("recognises the items that feed the Chart.js dock, structurally", function () {
    expect(
      isChartSeriesAccumulator(new CsvCatalogItem("csv", terria, undefined))
    ).toBe(true);
    expect(
      isChartSeriesAccumulator(new CogTimeSeriesCatalogItem("cog", terria))
    ).toBe(true);
    expect(
      isChartSeriesAccumulator(new GeoJsonCatalogItem("geo", terria))
    ).toBe(false);
    expect(isChartSeriesAccumulator(undefined)).toBe(false);
    expect(isChartSeriesAccumulator({ accumulatedChartSeries: [] })).toBe(
      false
    );
  });

  it("only feeds the dock from a CSV while its Chart.js renderer is on", function () {
    const csv = new CsvCatalogItem("csv", terria, undefined);
    expect(csv.isChartSeriesAccumulationActive).toBe(false);
    csv.setTrait(CommonStrata.user, "useChartJsTimeSeries", true);
    expect(csv.isChartSeriesAccumulationActive).toBe(true);
  });

  describe("COG time series dock context", function () {
    let item: CogTimeSeriesCatalogItem;

    beforeEach(function () {
      item = new CogTimeSeriesCatalogItem("cog", terria);
      updateModelFromJson(item, CommonStrata.definition, {
        dateFormat: "UTC:mmm yyyy",
        fromContinuous: "previous",
        timeEntries: [
          { time: "2024-06-01T00:00:00Z", cogs: ["jun.tif"] },
          { time: "2024-07-01T00:00:00Z", cogs: ["jul.tif"] }
        ]
      });
      item.setTrait(CommonStrata.user, "currentTime", "2024-06-01T00:00:00Z");
    });

    it("marks the displayed date on the chart", function () {
      expect(item.chartDock.activeX).toBe(Date.parse("2024-06-01T00:00:00Z"));
      expect(item.chartDock.activeXLabel).toBe("Jun 2024");
    });

    it("moves the map to the date clicked on the chart", function () {
      item.chartDock.onSelectX!(Date.parse("2024-07-01T00:00:00Z"));

      expect(item.currentStepLabel).toBe("Jul 2024");
      expect(item.chartDock.activeX).toBe(Date.parse("2024-07-01T00:00:00Z"));
    });

    it("reports progress of the series being read and can stop them", function () {
      expect(item.chartDock.status?.loading).toBe(false);

      // Never resolves: the series stays "loading".
      spyOn<any>(item as any, "_loadPointSeries").and.returnValue(
        new Promise(() => {})
      );
      const key = item.addPointSeries(50.5, 30.5);

      const status = item.chartDock.status!;
      expect(status.loading).toBe(true);
      expect(status.total).toBe(2);
      expect(status.loaded).toBe(0);

      status.cancel!();
      expect(item.chartDock.status?.loading).toBe(false);
      expect(item.pointSeries.find((s) => s.key === key)?.status).toBe(
        "cancelled"
      );
    });
  });
});
