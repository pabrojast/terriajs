import type { Polygon } from "geojson";
import type { JsonObject } from "../../Core/Json";

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
  dataset_title?: string;
  dataset_name?: string;
}
export interface MapLayerContext {
  id: string;
  name: string;
  type: string;
  resource_id?: string;
  traits: JsonObject;
  capabilities: string[];
  columns?: { name: string; type: string }[];
  dates?: { start: string; end: string };
  wms_styles?: string[];
  bands?: number[];
}
export interface AssistantMapContext {
  revision: string;
  camera_revision: string;
  camera: { west: number; south: number; east: number; north: number };
  layers: MapLayerContext[];
  basemaps: { id: string; name: string }[];
  basemap_id?: string;
}
export type MapEdit =
  | {
      kind: "update_layer";
      source_id: string;
      traits: JsonObject;
      refresh_legend?: boolean;
    }
  | { kind: "remove_layer" | "zoom"; source_id: string }
  | { kind: "move_layer"; source_id: string; index: number }
  | { kind: "add_ckan"; resource_id: string; view_id?: string }
  | { kind: "add_url"; url: string; format?: string; name?: string }
  | { kind: "set_basemap"; basemap_id: string }
  | {
      kind: "set_view";
      rectangle: { west: number; south: number; east: number; north: number };
    };
export interface MapProposal {
  id: string;
  title: string;
  base_revision: string;
  view_revision?: string;
  operations: MapEdit[];
}
export interface CatalogSearch {
  query: string;
  polygon?: Polygon;
  formats?: string[];
  organization?: string;
  tags?: string[];
  cursor?: string;
}
export interface CatalogSearchResult {
  sources: DataSourceRef[];
  datasets_found: number;
  candidates_found: number;
  examined: number;
  unknown_coverage: number;
  next_cursor?: string | null;
  truncated: boolean;
  spatial_basis?: string | null;
}
export interface MapSource {
  source: DataSourceRef;
  views: { id: string; title: string }[];
  model: JsonObject;
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
  proposals?: MapProposal[];
}
