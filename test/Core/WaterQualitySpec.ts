import {
  WaterMeta,
  WaterSeries,
  WaterDetail,
  WaterBody,
  waterBodyPoints,
  waterTrend,
  waterClass,
  waterCsv,
  waterPeriodCrossesCutoff,
  loadWaterJson
} from "../../lib/Core/WaterQuality";

const meta: WaterMeta = {
  generatedAt: "2026-10-11T00:00:00Z",
  region: "Test",
  source: "Terrascope",
  minCoverage: 0.2,
  minMonthsFullYear: 6,
  productOrder: ["CHL"],
  years: ["2025", "2026"],
  months: ["2026-09"],
  days: ["2026-09-29", "2026-10-01", "2026-10-06"],
  products: {
    CHL: {
      unit: "mg/m³",
      label: { en: "Chlorophyll-a" },
      breaks: [2.6, 7.3, 56],
      classes: {
        en: ["Oligotrophic", "Mesotrophic", "Eutrophic", "Hypereutrophic"]
      }
    }
  }
};
const series: WaterSeries = {
  ids: [15],
  years: ["2025", "2026"],
  months: ["2026-09"],
  annual: [[8, 6.99]],
  annualMonths: [[12, 5]],
  monthly: [[7]],
  monthlyDays: [[2]],
  lastValid: ["2026-09-29"]
};
const detail: WaterDetail = {
  id: 15,
  products: {
    CHL: {
      date: ["2026-09-29", "2026-10-06"],
      cov: [0.8, 0.1494],
      med: [7, 11.8],
      mean: [8, 12],
      p10: [6, 9],
      p90: [9, 15],
      n: [100, 12],
      acquisitionTimes: [["07:12:21Z"], ["07:12:21Z"]]
    }
  }
};
const body: WaterBody = {
  id: 15,
  name: 'Andraikiba, "Lake"',
  kind: "lake",
  area: 0.929,
  lon: 46.96945,
  lat: -19.87382,
  bbox: [46.96, -19.88, 46.98, -19.86]
};

describe("WaterQuality scientific contract", function () {
  it("retains low-coverage acquisitions as null and fills missing acquisition dates", function () {
    const points = waterBodyPoints(15, series, detail, "CHL", "daily", meta);
    expect(points.map((point) => point.value)).toEqual([7, null, null]);
    expect(points[2].coverage).toBeCloseTo(0.1494, 4);
    expect(points[1].count).toBe(0);
  });
  it("includes a pass exactly at the coverage threshold", function () {
    const exact = {
      ...detail,
      products: { CHL: { ...detail.products.CHL, cov: [0.2, 0.2] } }
    };
    expect(
      waterBodyPoints(15, series, exact, "CHL", "daily", meta)[0].value
    ).toBe(7);
  });
  it("uses precalculated body aggregates and marks insufficient years", function () {
    const points = waterBodyPoints(15, series, detail, "CHL", "annual", meta);
    expect(points[1].value).toBe(6.99);
    expect(points.map((point) => point.partial)).toEqual([false, true]);
  });
  it("returns null for an unknown body instead of using regional row zero", function () {
    expect(
      waterBodyPoints(99, series, detail, "CHL", "monthly", meta)[0].value
    ).toBeNull();
  });
  it("requires five sufficiently observed annual points for a trend", function () {
    expect(
      waterTrend(
        [2023, 2024, 2025, 2026].map((year) => ({
          date: String(year),
          value: year - 2000
        }))
      )
    ).toBeUndefined();
    expect(
      waterTrend(
        [2021, 2022, 2023, 2024, 2025].map((year) => ({
          date: String(year),
          value: year - 2000,
          partial: year === 2025
        }))
      )
    ).toBeUndefined();
  });
  it("uses robust Theil–Sen slope with Mann–Kendall significance", function () {
    const result = waterTrend(
      [2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({
        date: String(year),
        value: (year - 2020) * 2
      }))
    );
    expect(result!.slope).toBe(2);
    expect(result!.p).toBeLessThan(0.1);
    expect(result!.years).toBe(6);
  });
  it("does not label a constant series as significant", function () {
    const result = waterTrend(
      [2020, 2021, 2022, 2023, 2024].map((year) => ({
        date: String(year),
        value: 8
      }))
    );
    expect(result!.slope).toBe(0);
    expect(result!.p).toBeCloseTo(1, 5);
  });
  it("does not interpret a monthly series as an annual trend", function () {
    expect(
      waterTrend(
        [1, 2, 3, 4, 5, 6].map((month) => ({
          date: `2025-0${month}`,
          value: month
        }))
      )
    ).toBeUndefined();
  });
  it("preserves class boundary semantics and nulls", function () {
    expect(waterClass(7.3, meta.products.CHL, "en")).toBe("Eutrophic");
    expect(waterClass(null, meta.products.CHL, "en")).toBe("—");
  });
  it("identifies composites crossing the Kakhovka cutoff", function () {
    expect(waterPeriodCrossesCutoff("2023", "2023-06-05")).toBe(true);
    expect(waterPeriodCrossesCutoff("2023-06", "2023-06-05")).toBe(true);
    expect(waterPeriodCrossesCutoff("2023-05", "2023-06-05")).toBe(false);
    expect(waterPeriodCrossesCutoff("2023-06-05", "2023-06-05")).toBe(false);
  });
  it("marks a cutoff annual summary partial even if its month count meets the threshold", function () {
    const cutoffMeta = {
      ...meta,
      minMonthsFullYear: 5,
      bodyCutoffs: { "15": "2026-06-05" }
    };
    expect(
      waterBodyPoints(15, series, detail, "CHL", "annual", cutoffMeta)[1]
        .partial
    ).toBe(true);
    expect(
      waterBodyPoints(15, series, detail, "CHL", "daily", cutoffMeta)[0].value
    ).toBeNull();
  });
  it("exports source, unit, coverage, observed insufficient medians and quoted names", function () {
    const csv = waterCsv(
      meta,
      "CHL",
      body,
      waterBodyPoints(15, series, detail, "CHL", "daily", meta),
      "daily",
      detail.products.CHL
    );
    expect(csv).toContain("# Source: Terrascope");
    expect(csv).toContain("# Minimum months");
    expect(csv).toContain('"Andraikiba, ""Lake"""');
    expect(csv).toContain('"11.8"');
    expect(csv).toContain('"0.1494"');
    expect(csv).toContain("observed_median");
  });
  it("rejects an HTML fallback and allows a later retry", async function () {
    const fetchSpy = spyOn(window, "fetch").and.returnValue(
      Promise.resolve(
        new Response("<html/>", { headers: { "content-type": "text/html" } })
      )
    );
    let failed = false;
    try {
      await loadWaterJson("/water-test", "fallback.json");
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    fetchSpy.and.returnValue(
      Promise.resolve(
        new Response('{"ok":true}', {
          headers: { "content-type": "application/json" }
        })
      )
    );
    expect(await loadWaterJson("/water-test", "fallback.json")).toEqual({
      ok: true
    });
    expect(fetchSpy.calls.count()).toBe(2);
  });
});
