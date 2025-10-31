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
  it("preserves absolute stop positions and derives numeric legend values", () => {
    const itemStub = {
      renderOptions: {
        single: {
          colors: [
            [10, "#ff0000"],
            [20, "#00ff00"]
          ]
        }
      }
    };
    const workflow = new CogStylingWorkflow(itemStub as any);

    const stops = (workflow as any).customColorStops;
    expect(stops.map((stop: any) => stop.position)).toEqual([10, 20]);

    const tuples = (workflow as any).getStopTuplesFromCustomStops(stops);
    expect(tuples).toEqual([
      [10, "#ff0000"],
      [20, "#00ff00"]
    ]);

    const legend = (workflow as any).buildLegendFromStops(tuples);
    const items = legend?.items ?? [];
    expect(items[0]?.value).toBe(10);
    const lastItem = items[items.length - 1];
    expect(lastItem?.value).toBe(20);
    expect(lastItem?.title).toBe("20");
  });
});
