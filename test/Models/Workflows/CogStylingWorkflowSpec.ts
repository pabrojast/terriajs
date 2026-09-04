import CogStylingWorkflow from "../../../lib/Models/Workflows/CogStylingWorkflow";
import CogCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogCatalogItem";
import CogTimeSeriesCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../../lib/Models/Definition/updateModelFromJson";
import Terria from "../../../lib/Models/Terria";

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
    expect(items[0]?.value).toBeCloseTo(40);
    expect(items[items.length - 1]?.value).toBeCloseTo(10);
  });

  it("uses the shared effective provider domain when domain is missing", () => {
    const workflow = new CogStylingWorkflow({
      renderOptions: { single: { colors: ["#000000", "#ffffff"] } },
      effectiveCogStyle: { domain: [-5, 15] }
    } as any);

    const legend = (workflow as any).buildLegendFromStops([
      [0, "#000000"],
      [1, "#ffffff"]
    ]);

    const items = legend?.items ?? [];
    expect(items[0]?.value).toBeCloseTo(15);
    expect(items[items.length - 1]?.value).toBeCloseTo(-5);
  });

  it("lets a named palette override inherited custom colors", () => {
    const item = new CogCatalogItem("test", new Terria());
    updateModelFromJson(item.renderOptions, CommonStrata.definition, {
      single: { colors: ["#000000", "#ffffff"] }
    });
    const workflow = new CogStylingWorkflow(item);

    (workflow as any).colorScaleSelectableDim.setDimensionValue(
      CommonStrata.user,
      "jet"
    );

    expect(item.renderOptions.single?.colors as any).toEqual([
      "#000000",
      "#ffffff"
    ]);
    expect(item.renderOptions.single?.colorScale).toBe("jet");
    expect(item.renderOptions.single?.colorScaleMode).toBe("named");
    expect((workflow as any).colorScaleSelectableDim.selectedId).toBe("jet");
  });

  it("keeps automatic legend mode across repeated custom color edits", () => {
    const item = new CogCatalogItem("test", new Terria());
    const workflow = new CogStylingWorkflow(item);

    (workflow as any).writeColorStops(CommonStrata.user, [
      { position: 0, color: "#000000" },
      { position: 1, color: "#ffffff" }
    ]);
    (workflow as any).writeColorStops(CommonStrata.user, [
      { position: 0, color: "#ff0000" },
      { position: 1, color: "#0000ff" }
    ]);

    expect(item.renderOptions.single?.colorScaleMode).toBe("custom");
    expect(item.renderOptions.single?.colors as any).toEqual([
      [0, "#ff0000"],
      [1, "#0000ff"]
    ]);
    expect(
      (workflow as any).colorScaleSelectableDim.selectedId
    ).toBeUndefined();
    expect((workflow as any).hasManualLegend).toBe(false);
  });

  it("shows the provider clamp defaults as enabled", () => {
    const item = new CogCatalogItem("test", new Terria());
    const workflow = new CogStylingWorkflow(item);

    expect((workflow as any).clampLowSelectableDim.selectedId).toBe("true");
    expect((workflow as any).clampHighSelectableDim.selectedId).toBe("true");
  });

  it("writes native timestep statistics into domain for time series auto-fit", () => {
    const item = new CogTimeSeriesCatalogItem("test", new Terria());
    updateModelFromJson(item, CommonStrata.definition, {
      renderOptions: {
        single: { colorScale: "ylgnbu", domain: [0, 500] }
      }
    });
    (item as any)._effectiveCogStyle = {
      domain: [0, 500],
      nativeDomain: [2, 80]
    };
    const workflow = new CogStylingWorkflow(item);
    const button = (workflow as any).autoFitTimestepButton;

    expect(button).toBeDefined();
    button.setDimensionValue(CommonStrata.user);

    expect(item.renderOptions.single?.domain as any).toEqual([2, 80]);
  });

  it("does not show timestep auto-fit for a single COG", () => {
    const item = new CogCatalogItem("test", new Terria());
    const workflow = new CogStylingWorkflow(item);
    expect((workflow as any).autoFitTimestepButton).toBeUndefined();
  });
});
