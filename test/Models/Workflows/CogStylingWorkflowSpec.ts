import CogStylingWorkflow from "../../../lib/Models/Workflows/CogStylingWorkflow";

describe("CogStylingWorkflow.extractNumericValue", () => {
  it("parses localized numeric strings", () => {
    const workflow = new CogStylingWorkflow({} as any);
    const parse = (workflow as any).extractNumericValue.bind(workflow);

    expect(parse("1,234.56")).toBe(1234.56);
    expect(parse("1.234,56")).toBe(1234.56);
    expect(parse("1\u202F234,56")).toBe(1234.56);
    expect(parse("-1.234")).toBe(-1234);
    expect(parse("+1,5")).toBe(1.5);
    expect(parse("0.125")).toBeCloseTo(0.125, 6);
    expect(parse("0,125")).toBeCloseTo(0.125, 6);
  });

  it("returns undefined when no numeric value is found", () => {
    const workflow = new CogStylingWorkflow({} as any);
    const parse = (workflow as any).extractNumericValue.bind(workflow);

    expect(parse("no value")).toBeUndefined();
  });
});

describe("CogStylingWorkflow color stops", () => {
  it("expands stops to match bin count and preserves domain values", () => {
    const itemStub = {
      renderOptions: {
        single: {
          colors: [
            [0, "#ff0000"],
            [1, "#00ff00"]
          ]
        }
      }
    };
    const workflow = new CogStylingWorkflow(itemStub as any);
    const stops = (workflow as any).getStopTuplesFromCustomStops(
      (workflow as any).customColorStops
    );
    const expanded = (workflow as any).expandStopsForLegend(stops, 7);
    expect(expanded.length).toBe(7);
    expect(expanded[0][0]).toBeCloseTo(0, 5);
    expect(expanded[expanded.length - 1][0]).toBeCloseTo(1, 5);

    const baseline = Array.from({ length: 7 }, (_, index) => ({
      title: `${10 + index * 5}`,
      value: 10 + index * 5
    }));

    const legend = (workflow as any).buildLegendFromStops(
      expanded,
      undefined,
      baseline
    );
    const items = legend?.items ?? [];
    expect(items.length).toBe(7);
    expect(items[0]?.value).toBeCloseTo(10);
    expect(items[items.length - 1]?.value).toBeCloseTo(40);
  });

  it("uses provider statistics when domain is missing", () => {
    const workflow = new CogStylingWorkflow({
      renderOptions: { single: { colors: ["#000000", "#ffffff"] } },
      mapItems: [
        {
          imageryProvider: {
            statistics: { min: -5, max: 15 }
          }
        }
      ]
    } as any);

    const legend = (workflow as any).buildLegendFromStops([
      [0, "#000000"],
      [1, "#ffffff"]
    ]);

    const items = legend?.items ?? [];
    expect(items[0]?.value).toBeCloseTo(-5);
    expect(items[items.length - 1]?.value).toBeCloseTo(15);
  });
});
