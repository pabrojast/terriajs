import { jsonFeatureInfoContext } from "../../lib/Table/tableFeatureInfoContext";

describe("jsonFeatureInfoContext", function () {
  const catalogItem: any = {
    hasCatalogMemberMixin: true,
    name: "Test Layer",
    uniqueId: "test-layer"
  };

  it("marks non-empty timeseries payload as chartable", function () {
    const feature: any = {
      id: "feature-1",
      data: {
        result: [
          {
            time: "2024-09-01T00:00:00Z",
            mean: 1.2,
            min: 0.8,
            max: 1.6
          }
        ]
      }
    };

    const context = jsonFeatureInfoContext(catalogItem)(feature);
    const timeSeries = context.terria?.timeSeries;

    expect(timeSeries).toBeDefined();
    expect(timeSeries?.hasData).toBe(true);
    expect(timeSeries?.isTimeSeries).toBe(true);
    expect(timeSeries?.yColumns).toContain("mean");
    expect(timeSeries?.chart).toContain("json-chart");
    expect(timeSeries?.chart).toContain('chart-type="lineAndPoint"');
  });

  it("marks empty timeseries payload as no-data", function () {
    const feature: any = {
      id: "feature-2",
      data: {
        result: []
      }
    };

    const context = jsonFeatureInfoContext(catalogItem)(feature);
    const timeSeries = context.terria?.timeSeries;

    expect(timeSeries?.hasData).toBe(false);
    expect(timeSeries?.isTimeSeries).toBe(true);
    expect(timeSeries?.chart).toBe("");
    expect(timeSeries?.message).toContain("No time-series data");
  });

  it("marks statistics payload with count=0 as no-data and non-timeseries", function () {
    const feature: any = {
      id: "feature-3",
      data: {
        result: {
          count: 0
        }
      }
    };

    const context = jsonFeatureInfoContext(catalogItem)(feature);
    const timeSeries = context.terria?.timeSeries;

    expect(timeSeries?.hasData).toBe(false);
    expect(timeSeries?.isTimeSeries).toBe(false);
    expect(timeSeries?.chart).toBe("");
    expect(timeSeries?.message).toContain("No data available");
  });
});
