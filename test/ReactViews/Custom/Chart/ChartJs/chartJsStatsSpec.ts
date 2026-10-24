import {
  computeSeriesStats,
  computeTrendPerYear,
  formatStatValue,
  maxPoint,
  valueAtX
} from "../../../../../lib/ReactViews/Custom/Chart/ChartJs/chartJsStats";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2023, 0, 1);

describe("chartJsStats", function () {
  it("computes min, max and mean over finite values only", function () {
    expect(
      computeSeriesStats([{ y: 2 }, { y: NaN }, { y: 10 }, { y: undefined }])
    ).toEqual({ min: 2, max: 10, mean: 6, count: 2 });
    expect(computeSeriesStats([{ y: NaN }])).toBeUndefined();
    expect(computeSeriesStats([])).toBeUndefined();
  });

  it("finds the highest point and the value at an exact x", function () {
    const points = [
      { x: 1, y: 5 },
      { x: 2, y: 9 },
      { x: 3, y: 7 }
    ];
    expect(maxPoint(points)).toEqual({ x: 2, y: 9 });
    expect(maxPoint([])).toBeUndefined();
    expect(valueAtX(points, 3)).toBe(7);
    // No interpolation: a date without a value has no value.
    expect(valueAtX(points, 2.5)).toBeUndefined();
    expect(valueAtX(points, undefined)).toBeUndefined();
  });

  it("measures the trend as a least-squares slope per year", function () {
    const rising = [0, 1, 2, 3].map((years) => ({
      x: T0 + years * YEAR_MS,
      y: 10 + 2.5 * years
    }));
    expect(computeTrendPerYear(rising)).toBeCloseTo(2.5, 6);

    const falling = rising.map((point) => ({ x: point.x, y: -point.y }));
    expect(computeTrendPerYear(falling)).toBeCloseTo(-2.5, 6);

    // Robust to order and to non-finite values.
    expect(
      computeTrendPerYear([...rising].reverse().concat({ x: T0, y: NaN }))
    ).toBeCloseTo(2.5, 6);
  });

  it("reports no trend for series too short to have one", function () {
    expect(
      computeTrendPerYear([
        { x: T0, y: 1 },
        { x: T0 + 2 * YEAR_MS, y: 9 }
      ])
    ).toBeUndefined();
    // Three points, but only three weeks apart.
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(
      computeTrendPerYear([
        { x: T0, y: 1 },
        { x: T0 + week, y: 5 },
        { x: T0 + 2 * week, y: 9 }
      ])
    ).toBeUndefined();
    expect(
      computeTrendPerYear([
        { x: T0, y: 1 },
        { x: T0, y: 2 },
        { x: T0, y: 3 }
      ])
    ).toBeUndefined();
  });

  it("formats values compactly", function () {
    expect(formatStatValue(1234.56)).toBe("1235");
    expect(formatStatValue(43.71)).toBe("43.7");
    expect(formatStatValue(3.14159)).toBe("3.14");
    expect(formatStatValue(0.04567)).toBe("0.046");
    expect(formatStatValue(12)).toBe("12");
    expect(formatStatValue(undefined)).toBe("–");
    expect(formatStatValue(NaN)).toBe("–");
  });
});
