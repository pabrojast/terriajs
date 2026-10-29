import Terria from "../Terria";
import { findLayer, readLayerRows } from "../DataAssistant/LayerTools";
import {
  calculateRows,
  describeRows,
  filterRows,
  statistics
} from "../DataAssistant/TableTools";
import { DataQuery } from "../DataAssistant/Types";
import { DashboardConfig, DashboardResult } from "./Types";
/** Local files never enter the shared cache or become a saved source. */
export function localPreview(
  terria: Terria,
  config: DashboardConfig
): DashboardResult {
  const result: DashboardResult = {
    status: "ready",
    results: {},
    profiles: {}
  };
  for (const source of config.sources.filter(
    (s) => !s.resource_id && !s.catalog_url
  )) {
    if (!source.local_id) continue;
    const { rows, geometries, names } = readLayerRows(
      findLayer(terria, source.local_id)
    );
    result.profiles![source.id] = {
      fields: describeRows(rows, names).columns?.map((c) => ({
        key: c.name,
        label: c.name,
        type: c.type
      }))
    };
    for (const block of config.blocks.filter(
      (b) => b.source_id === source.id
    )) {
      try {
        const query: DataQuery = {
          source_id: source.id,
          operation: block.type === "table" ? "rows" : "group",
          group_by: block.x_field,
          column: block.y_field,
          metric: block.aggregate === "avg" ? "mean" : block.aggregate,
          date_column: source.date_field,
          start: config.state.start || undefined,
          end: config.state.end || undefined,
          filters: source.filters?.map((f) => ({
            column: f.field,
            op: f.op,
            value: f.value
          })),
          polygon:
            config.state.area?.type === "Polygon"
              ? config.state.area
              : undefined,
          limit: 100
        };
        if (block.type === "kpi") {
          const filtered = filterRows(rows, query, geometries);
          const stats = statistics(filtered.map((r) => r[block.y_field || ""]));
          result.results![block.id] = {
            type: "kpi",
            value:
              block.aggregate === "count"
                ? filtered.length
                : stats[query.metric!],
            count: filtered.length
          };
        } else {
          const value = calculateRows(rows, query, geometries);
          result.results![block.id] =
            block.type === "table"
              ? {
                  type: "table",
                  columns: names,
                  rows: value.rows,
                  truncated: value.truncated
                }
              : {
                  type: block.type,
                  labels: value.rows?.map((r) => String(r.x)),
                  datasets: [
                    {
                      label: block.title,
                      data:
                        value.rows?.map((r) =>
                          typeof r.y === "number" ? r.y : null
                        ) || []
                    }
                  ],
                  truncated: value.truncated
                };
        }
      } catch (e) {
        result.results![block.id] = { type: block.type, error: String(e) };
      }
    }
  }
  return result;
}
