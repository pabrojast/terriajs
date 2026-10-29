import {
  calculateRows,
  filterRows,
  statistics
} from "../../../lib/Models/DataAssistant/TableTools";
import type { Polygon } from "geojson";

describe("DataAssistant table calculations", function () {
  it("excludes empty, boolean and infinite values without losing zero", function () {
    const result = statistics([0, "2", 4, null, "", Infinity, false]);
    expect(result.count).toBe(3);
    expect(result.missing).toBe(4);
    expect(result.mean).toBe(2);
    expect(result.stddev!).toBeCloseTo(Math.sqrt(8 / 3), 8);
    expect(statistics([null]).mean).toBeNull();
    expect(statistics([null]).sum).toBeNull();
  });
  it("calculates the full table beyond the first 5000 records", function () {
    const rows = [
      ...Array.from({ length: 5000 }, () => ({ value: 1 })),
      { value: 10001 }
    ];
    expect(
      calculateRows(rows, {
        source_id: "x",
        operation: "statistics",
        column: "value"
      }).statistics?.mean as number
    ).toBeCloseTo(15001 / 5001, 8);
  });
  it("ranks numeric strings and distinguishes preview from calculation scope", function () {
    const result = calculateRows(
      [
        { value: "2", site: "A" },
        { value: "10", site: "A" },
        { value: "1", site: "B" }
      ],
      {
        source_id: "x",
        operation: "rows",
        filters: [{ column: "site", op: "eq", value: "A" }],
        order_by: "value",
        descending: true,
        limit: 1
      }
    );
    expect(result.rows).toEqual([{ value: "10", site: "A" }]);
    expect(result.rows_used).toBe(2);
    expect(result.truncated).toBe(true);
  });
  it("includes the whole end date and groups monthly", function () {
    const result = calculateRows(
      [
        { date: "2024-01-01", value: 1 },
        { date: "2024-01-31T23:59:00Z", value: 3 },
        { date: "2024-02-01", value: 9 }
      ],
      {
        source_id: "x",
        operation: "time_series",
        date_column: "date",
        column: "value",
        end: "2024-01-31"
      }
    );
    expect(result.rows).toEqual([{ x: "2024-01", y: 2, count: 2 }]);
  });
  it("does not turn an all-missing grouped sum into zero", function () {
    const result = calculateRows(
      [
        { site: "A", value: null },
        { site: "B", value: 1 }
      ],
      {
        source_id: "x",
        operation: "group",
        group_by: "site",
        column: "value",
        metric: "sum"
      }
    );
    expect(result.rows?.find((r) => r.x === "A")?.y).toBeNull();
  });
  it("requires a meaningful span for annual trends", function () {
    const result = calculateRows(
      [
        { date: "2020-01-01", v: 0 },
        { date: "2021-01-01", v: 366 },
        { date: "2022-01-01", v: 731 }
      ],
      { source_id: "x", operation: "trend", column: "v", date_column: "date" }
    );
    expect(result.statistics?.slope_per_year as number).toBeCloseTo(365.25, 8);
    expect(() =>
      calculateRows(
        [
          { date: "2024-01-01", v: 1 },
          { date: "2024-01-02", v: 2 },
          { date: "2024-01-03", v: 3 }
        ],
        { source_id: "x", operation: "trend", column: "v", date_column: "date" }
      )
    ).toThrow();
  });
  it("computes Pearson correlation on paired finite observations", function () {
    const result = calculateRows(
      [
        { a: 1, b: 2 },
        { a: 2, b: 4 },
        { a: 3, b: 6 },
        { a: 9, b: null }
      ],
      { source_id: "x", operation: "correlation", column: "a", column2: "b" }
    );
    expect(result.statistics?.count).toBe(3);
    expect(result.statistics?.pearson_r as number).toBeCloseTo(1, 8);
  });
  it("uses IQR fences for outliers", function () {
    expect(
      calculateRows(
        [1, 2, 2, 3, 100].map((v) => ({ v })),
        { source_id: "x", operation: "outliers", column: "v" }
      ).rows
    ).toEqual([{ v: 100 }]);
  });
  it("excludes polygon holes and includes the outer boundary", function () {
    const polygon: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [5, 0],
          [5, 5],
          [0, 5],
          [0, 0]
        ],
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1]
        ]
      ]
    };
    expect(
      filterRows(
        [
          { lon: 0, lat: 0 },
          { lon: 2, lat: 2 },
          { lon: 4, lat: 4 }
        ],
        {
          source_id: "x",
          operation: "rows",
          polygon,
          longitude_column: "lon",
          latitude_column: "lat"
        }
      )
    ).toEqual([
      { lon: 0, lat: 0 },
      { lon: 4, lat: 4 }
    ]);
  });
  it("rejects unknown columns rather than inventing zeros", function () {
    expect(() =>
      calculateRows([{ x: 1 }], {
        source_id: "x",
        operation: "statistics",
        column: "missing"
      })
    ).toThrow();
  });
});
