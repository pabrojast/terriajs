import {
  calendarPeriod,
  inclusiveDateEnd,
  periodBoundary,
  periodInput
} from "../../lib/Core/cogAnalysisPeriod";

describe("COG analysis calendar periods", () => {
  it("includes complete months, including leap February", () => {
    expect(periodBoundary("2024-02", "monthly")).toBe("2024-02-01");
    expect(periodBoundary("2024-02", "monthly", true)).toBe("2024-02-29");
    expect(periodBoundary("2023-02", "monthly", true)).toBe("2023-02-28");
    expect(inclusiveDateEnd("2024-02-29")).toBe("2024-02-29T23:59:59.999Z");
  });
  it("adapts a monthly window to a whole year and back to twelve months", () => {
    const first = periodBoundary("2024-06-01", "annual");
    const last = periodBoundary("2024-08-31", "annual", true);
    expect(first).toBe("2024-01-01");
    expect(last).toBe("2024-12-31");
    expect(periodInput(periodBoundary(first, "monthly"), "monthly")).toBe(
      "2024-01"
    );
    expect(periodInput(periodBoundary(last, "monthly", true), "monthly")).toBe(
      "2024-12"
    );
  });
  it("preserves exact dates for daily and custom resolutions, and rejects invalid dates", () => {
    expect(calendarPeriod("quarterly")).toBeUndefined();
    expect(periodBoundary("2024-06-12", "quarterly", true)).toBe("2024-06-12");
    expect(periodBoundary("2024-06-12", "daily")).toBe("2024-06-12");
    expect(periodBoundary("2024-13", "monthly")).toBeUndefined();
    expect(periodBoundary("2023-02-29", "daily")).toBeUndefined();
    expect(periodBoundary(undefined, "annual")).toBeUndefined();
  });
});
