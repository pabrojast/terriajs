import type { Geometry } from "geojson";
import booleanIntersects from "@turf/boolean-intersects";
import { point } from "@turf/helpers";
import { Cell, DataQuery, Row, ToolResult } from "./Types";

export function number(value: unknown): number | undefined {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    String(value).trim() === ""
  )
    return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const position = (values.length - 1) * p;
  const low = Math.floor(position);
  return (
    values[low] + (values[Math.ceil(position)] - values[low]) * (position - low)
  );
}
export function statistics(input: unknown[]): Record<string, number | null> {
  const values = input
    .map(number)
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = count ? sum / count : null;
  return {
    count,
    missing: input.length - count,
    sum: count ? sum : null,
    mean,
    median: quantile(values, 0.5),
    min: count ? values[0] : null,
    max: count ? values[count - 1] : null,
    stddev:
      mean === null
        ? null
        : Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / count),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    p95: quantile(values, 0.95)
  };
}
function column(rows: Row[], name: string | undefined): string {
  if (!name || (rows.length && !rows.some((row) => name in row)))
    throw new Error("Choose an existing column from the data description");
  return name;
}
export function timestamp(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const result = Date.parse(String(value));
  return Number.isFinite(result) ? result : undefined;
}
export function filterRows(
  rows: Row[],
  query: DataQuery,
  geometries?: (Geometry | null)[]
): Row[] {
  for (const f of query.filters ?? []) column(rows, f.column);
  if (query.start || query.end) column(rows, query.date_column);
  const start = query.start ? timestamp(query.start) : undefined;
  const end = query.end ? timestamp(query.end) : undefined;
  if ((query.start && start === undefined) || (query.end && end === undefined))
    throw new Error("Invalid date range");
  return rows.filter((row, index) => {
    for (const f of query.filters ?? []) {
      const raw = row[f.column];
      const value = typeof f.value === "number" ? number(raw) : raw;
      const target = f.value;
      let accepted = false;
      switch (f.op) {
        case "eq":
          accepted =
            target === null ? raw === null || raw === "" : value === target;
          break;
        case "ne":
          accepted =
            target === null ? raw !== null && raw !== "" : value !== target;
          break;
        case "in":
          accepted = Array.isArray(target) && target.includes(raw);
          break;
        case "contains":
          accepted = String(raw ?? "")
            .toLowerCase()
            .includes(String(target).toLowerCase());
          break;
        default: {
          if (
            value === undefined ||
            value === null ||
            target === null ||
            Array.isArray(target)
          )
            break;
          accepted =
            f.op === "lt"
              ? value < target
              : f.op === "lte"
                ? value <= target
                : f.op === "gt"
                  ? value > target
                  : value >= target;
        }
      }
      if (!accepted) return false;
    }
    if (query.start || query.end) {
      const time = timestamp(row[query.date_column!]);
      const inclusiveEnd =
        end === undefined
          ? undefined
          : end + (query.end?.length === 10 ? 86400000 - 1 : 0);
      if (
        time === undefined ||
        (start !== undefined && time < start) ||
        (inclusiveEnd !== undefined && time > inclusiveEnd)
      )
        return false;
    }
    if (query.polygon) {
      let geometry = geometries?.[index];
      if (!geometry && query.longitude_column && query.latitude_column) {
        const lon = number(row[query.longitude_column]);
        const lat = number(row[query.latitude_column]);
        if (lon !== undefined && lat !== undefined)
          geometry = point([lon, lat]).geometry;
      }
      if (!geometry) return false;
      if (!booleanIntersects(query.polygon, geometry)) return false;
    }
    return true;
  });
}
export function describeRows(rows: Row[], names?: string[]): ToolResult {
  return {
    rows_total: rows.length,
    columns: (names ?? Object.keys(rows[0] ?? {})).slice(0, 100).map((name) => {
      const values = rows
        .map((r) => r[name])
        .filter((v) => v !== null && v !== undefined && v !== "");
      return {
        name,
        type:
          values.length && values.every((v) => number(v) !== undefined)
            ? "number"
            : "text",
        missing: rows.length - values.length
      };
    }),
    sample: rows.slice(0, 5),
    sample_only: true
  };
}
export function calculateRows(
  input: Row[],
  query: DataQuery,
  geometries?: (Geometry | null)[]
): ToolResult {
  const rows = filterRows(input, query, geometries);
  const result: ToolResult = {
    rows_total: input.length,
    rows_used: rows.length,
    complete: true,
    operation: query.operation,
    units: null,
    filters: query.filters ?? []
  };
  const limit = Math.min(200, query.limit ?? 200);
  if (query.operation === "rows") {
    const names = query.columns ?? Object.keys(input[0] ?? {}).slice(0, 20);
    names.forEach((n) => column(input, n));
    if (query.order_by) {
      const name = column(input, query.order_by);
      const numeric = rows.every(
        (r) => r[name] === null || number(r[name]) !== undefined
      );
      rows.sort((a, b) => {
        const x = numeric ? number(a[name]) : a[name];
        const y = numeric ? number(b[name]) : b[name];
        if (x === undefined || x === null) return 1;
        if (y === undefined || y === null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (query.descending ? -1 : 1);
      });
    }
    const offset = query.offset ?? 0;
    result.rows = rows
      .slice(offset, offset + limit)
      .map((r) => Object.fromEntries(names.map((n) => [n, r[n] ?? null])));
    result.offset = offset;
    result.truncated = offset + limit < rows.length;
    return result;
  }
  const name =
    query.metric === "count" &&
    ["group", "time_series"].includes(query.operation)
      ? undefined
      : column(input, query.column);
  const values = name ? rows.map((r) => r[name]) : rows.map(() => 1);
  if (query.operation === "statistics") result.statistics = statistics(values);
  else if (query.operation === "group" || query.operation === "time_series") {
    const grouping = column(
      input,
      query.operation === "group" ? query.group_by : query.date_column
    );
    const groups = new Map<string, Cell[]>();
    let invalid = 0;
    rows.forEach((r, i) => {
      let key = String(r[grouping] ?? "(missing)");
      if (query.operation === "time_series") {
        const time = timestamp(r[grouping]);
        if (time === undefined) {
          invalid++;
          return;
        }
        key = new Date(time)
          .toISOString()
          .slice(
            0,
            query.period === "day" ? 10 : query.period === "year" ? 4 : 7
          );
      }
      const group = groups.get(key) ?? [];
      group.push(values[i]);
      groups.set(key, group);
    });
    let data: Row[] = [...groups].map(([x, items]) => {
      const s = statistics(items);
      return { x, y: s[query.metric ?? "mean"], count: s.count };
    });
    if (query.operation === "time_series") {
      data.sort((a, b) => String(a.x).localeCompare(String(b.x)));
      if (data.length > 2000)
        throw new Error(
          "More than 2000 periods; choose a shorter range or coarser period"
        );
      result.invalid_dates = invalid;
    } else {
      data.sort(
        (a, b) =>
          ((number(a.y) ?? -Infinity) - (number(b.y) ?? -Infinity)) *
          (query.descending === false ? 1 : -1)
      );
      result.truncated = data.length > limit;
      data = data.slice(0, limit);
    }
    result.rows = data;
    result.period = query.period;
  } else if (query.operation === "outliers") {
    const s = statistics(values);
    if (s.count! < 4)
      throw new Error("IQR outliers require four numeric observations");
    const low = s.p25! - 1.5 * (s.p75! - s.p25!);
    const high = s.p75! + 1.5 * (s.p75! - s.p25!);
    const matches = rows.filter((r) => {
      const v = number(r[name!]);
      return v !== undefined && (v < low || v > high);
    });
    result.statistics = {
      lower_fence: low,
      upper_fence: high,
      count: matches.length
    };
    result.rows = matches.slice(0, limit);
    result.truncated = matches.length > limit;
    result.method =
      "Tukey fences: Q1 - 1.5 IQR, Q3 + 1.5 IQR (linear quantiles)";
  } else {
    const second = column(
      input,
      query.operation === "trend" ? query.date_column : query.column2
    );
    const pairs = rows
      .map((r) => ({
        x:
          query.operation === "trend"
            ? timestamp(r[second])
            : number(r[second]),
        y: number(r[name!])
      }))
      .filter(
        (p): p is { x: number; y: number } =>
          p.x !== undefined && p.y !== undefined
      );
    if (pairs.length < 3)
      throw new Error("At least three valid pairs are required");
    const xs = pairs.map((p) => p.x).sort((a, b) => a - b);
    const mx = pairs.reduce((s, p) => s + p.x, 0) / pairs.length;
    const my = pairs.reduce((s, p) => s + p.y, 0) / pairs.length;
    const covariance = pairs.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
    const vx = pairs.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    const vy = pairs.reduce((s, p) => s + (p.y - my) ** 2, 0);
    if (!vx) throw new Error("The independent variable has no variation");
    if (query.operation === "trend") {
      if (xs[xs.length - 1] - xs[0] < (365.25 * 86400000) / 2)
        throw new Error("Annual trend requires at least six months of data");
      result.statistics = {
        count: pairs.length,
        slope_per_year: (covariance / vx) * 365.25 * 86400000,
        r_squared: vy ? covariance ** 2 / (vx * vy) : null,
        start: new Date(xs[0]).toISOString(),
        end: new Date(xs[xs.length - 1]).toISOString()
      };
    } else {
      if (!vy) throw new Error("Both columns must vary for a correlation");
      result.statistics = {
        count: pairs.length,
        pearson_r: covariance / Math.sqrt(vx * vy)
      };
      result.rows = pairs.slice(0, limit).map((p) => ({ x: p.y, y: p.x }));
      result.truncated = pairs.length > limit;
      result.warning = "Correlation does not establish causation";
    }
  }
  return result;
}
