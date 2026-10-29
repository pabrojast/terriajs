import type { Polygon } from "geojson";

export interface DataAssistantConfig {
  enabled?: boolean;
  apiBaseUrl?: string;
}
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export interface DataFilter {
  column: string;
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "contains";
  value: Cell | Cell[];
}
export interface DataQuery {
  source_id: string;
  operation:
    | "rows"
    | "statistics"
    | "group"
    | "time_series"
    | "trend"
    | "correlation"
    | "outliers";
  column?: string;
  column2?: string;
  date_column?: string;
  group_by?: string;
  columns?: string[];
  filters?: DataFilter[];
  start?: string;
  end?: string;
  period?: "day" | "month" | "year";
  metric?: "count" | "sum" | "mean" | "median" | "min" | "max" | "stddev";
  limit?: number;
  offset?: number;
  order_by?: string;
  descending?: boolean;
  polygon?: Polygon;
  point?: [number, number];
  latitude_column?: string;
  longitude_column?: string;
  band?: number;
}
export interface DataSourceRef {
  id: string;
  name: string;
  format: string;
  resource_id?: string;
  dataset_id?: string;
  url?: string;
  units?: string;
  time?: string;
  private?: boolean;
}
export interface ToolCall {
  id: string;
  name: "describe_source" | "query_data";
  arguments: DataQuery;
}
export interface ToolResult {
  error?: string;
  rows?: Row[];
  statistics?: Record<string, Cell>;
  columns?: { name: string; type: string; missing?: number }[];
  sample?: Row[];
  sample_only?: boolean;
  rows_total?: number;
  rows_used?: number;
  complete?: boolean;
  truncated?: boolean;
  operation?: string;
  units?: string | null;
  coverage?: Record<string, Cell>;
  warning?: string;
  method?: string;
  resolution?: string | number;
  band?: number;
  period?: string;
  start?: string;
  end?: string;
  filters?: DataFilter[];
  invalid_dates?: number;
  offset?: number;
}
export interface Evidence extends ToolResult {
  id: string;
  source?: DataSourceRef;
  source_id?: string;
  parameters?: DataQuery;
  inputs?: string[];
}
export interface MapAction {
  action: "add_layer" | "zoom" | "filter";
  source_id: string;
  source: DataSourceRef;
  title?: string;
  filters?: DataFilter[];
  start?: string;
  end?: string;
  date_column?: string;
}
export interface DataTurn {
  id: string;
  status:
    | "queued"
    | "running"
    | "awaiting_tools"
    | "completed"
    | "cancelled"
    | "error";
  pending?: ToolCall[];
  progress?: string;
  answer?: string;
  error?: string;
  evidence?: Evidence[];
  artifacts?: {
    result_id: string;
    title?: string;
    chart: "table" | "line" | "bar" | "scatter";
  }[];
  actions?: MapAction[];
}
