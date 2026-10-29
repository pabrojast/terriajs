import type { Point, Polygon } from "geojson";
export interface SimpleDashboardRef {
  id: string;
  revision: number;
}
export interface DashboardState {
  start?: string | null;
  end?: string | null;
  area?: Point | Polygon | null;
}
export interface DashboardSource {
  id: string;
  name: string;
  kind: "table" | "geojson" | "water" | "cog";
  resource_id?: string;
  local_id?: string;
  catalog_url?: string;
  product?: string;
  resolution?: "daily" | "monthly" | "annual";
  source?: { kind: "file" | "datastore" };
  date_field?: string;
  filters?: { field: string; op: "eq"; value: string }[];
}
export interface DashboardBlock {
  id: string;
  source_id: string;
  title: string;
  type: "kpi" | "line" | "bar" | "table";
  aggregate: "count" | "sum" | "avg" | "median" | "min" | "max";
  x_field?: string;
  y_field?: string;
  unit?: string;
  body_id?: number;
  band?: number;
  limit?: number;
  time_grain?: "none" | "day" | "month" | "year";
}
export interface DashboardConfig {
  version: 1;
  title: string;
  sources: DashboardSource[];
  blocks: DashboardBlock[];
  state: DashboardState;
}
export interface SavedDashboard {
  id: string;
  revision: number;
  selected_revision: number;
  title: string;
  published_revision: number | null;
  published?: boolean;
  config: DashboardConfig;
  can_edit?: boolean;
}
export interface BlockResult {
  type: DashboardBlock["type"];
  error?: string;
  value?: number | null;
  count?: number;
  labels?: string[];
  datasets?: { label: string; data: (number | null)[] }[];
  columns?: (string | { key: string; label: string })[];
  rows?: (unknown[] | Record<string, unknown>)[];
  total?: number;
  truncated?: boolean;
  unit?: string;
  method?: string;
  resolution?: string;
  source_version?: string;
  band?: number;
}
export interface DashboardResult {
  status: "pending" | "ready" | "stale" | "error";
  error?: string;
  refreshing?: boolean;
  checked_at?: number;
  calculated_at?: number;
  results?: Record<string, BlockResult>;
  profiles?: Record<
    string,
    {
      fields?: { key: string; label: string; type: string }[];
      bodies?: { id: number; name: string }[];
    }
  >;
  warnings?: string[];
}
export function validDashboardRef(value: unknown): value is SimpleDashboardRef {
  const ref = value as SimpleDashboardRef | undefined;
  return (
    !!ref &&
    typeof ref.id === "string" &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ref.id) &&
    Number.isSafeInteger(ref.revision) &&
    ref.revision > 0
  );
}
