import { ChartTableModel } from "./ChartJsTypes";

const MAX_FILENAME_LENGTH = 80;

/**
 * Produce a safe download filename (without extension) from an arbitrary chart
 * or column name. Lowercases, replaces anything outside `[a-z0-9._-]` (including
 * path separators and control characters) with a dash, collapses runs of dashes
 * and strips leading/trailing dots and dashes. Returns `fallback` when nothing
 * usable remains.
 *
 * Pure and dependency-free so it can be unit-tested in isolation.
 */
export function slugifyFilename(name: string, fallback = "chart"): string {
  const slug = (name ?? "")
    .toLowerCase()
    // Replace anything outside the allowed set with a dash. Path separators
    // (`/`, `\`) and control characters are not in the set, so they too become
    // dashes and can never cause directory traversal.
    .replace(/[^a-z0-9._-]+/g, "-")
    // Collapse runs of dashes.
    .replace(/-+/g, "-")
    // Strip leading/trailing dots and dashes.
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, MAX_FILENAME_LENGTH)
    // Slicing may have left a trailing dot/dash.
    .replace(/[.-]+$/g, "");

  return slug.length > 0 ? slug : fallback;
}

/** Characters that trigger formula evaluation when a cell leads with them. */
// eslint-disable-next-line no-control-regex
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

/** Characters that require a CSV cell to be quoted. */
const CSV_SPECIAL = /[",\n\r]/;

/** Escape a single cell for CSV output, guarding against formula injection. */
function escapeCsvCell(value: string | number): string {
  // Track whether the original value was a string: numbers are never a CSV
  // formula-injection vector, so the guard must NOT touch them (otherwise a
  // negative number like -5 would be mangled into '-5).
  const isString = typeof value === "string";
  let cell = isString ? value : String(value ?? "");
  // CSV formula-injection guard: neutralise STRING cells that a spreadsheet
  // would otherwise interpret as a formula. Numeric cells pass through
  // unprefixed.
  if (isString && FORMULA_INJECTION_PREFIX.test(cell)) {
    cell = `'${cell}`;
  }
  if (CSV_SPECIAL.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Build a CSV string (UTF-8 BOM prefixed for spreadsheet compatibility) from a
 * normalised chart table model. Built with an array + join so output is
 * deterministic. Pure and dependency-free.
 */
export function buildCsv(model: ChartTableModel): string {
  const lines: string[] = [];
  lines.push(model.columns.map((c) => escapeCsvCell(c.label)).join(","));
  for (const row of model.rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }
  // Prepend a UTF-8 BOM so spreadsheets detect the encoding correctly.
  return "﻿" + lines.join("\n");
}
