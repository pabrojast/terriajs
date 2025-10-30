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
  });

  it("returns undefined when no numeric value is found", () => {
    const workflow = new CogStylingWorkflow({} as any);
    const parse = (workflow as any).extractNumericValue.bind(workflow);

    expect(parse("no value")).toBeUndefined();
  });
});
