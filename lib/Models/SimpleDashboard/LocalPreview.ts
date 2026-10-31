import booleanIntersects from "@turf/boolean-intersects";
import { boundsPolygons } from "./Spatial";
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
    const data = readLayerRows(findLayer(terria, source.local_id));
    let { rows, geometries } = data;
    const { names } = data;
    result.profiles![source.id] = {
      fields: describeRows(rows, names).columns?.map((c) => ({
        key: c.name,
        label: c.name,
        type: c.type
      }))
    };
    const latitude =
      source.latitude_field || names.find((n) => /^_?(lat|latitude)$/i.test(n));
    const longitude =
      source.longitude_field ||
      names.find((n) => /^_?(lon|lng|longitude)$/i.test(n));
    const spatial = config.state.spatial;
    const bounds =
      spatial && spatial.mode !== "configured" ? spatial.bounds : undefined;
    const filterable = !!geometries || !!(latitude && longitude);
    if (bounds && filterable) {
      const areas = boundsPolygons(bounds);
      const keep = rows.map((r, i) => {
        const lon = r[longitude || ""],
          lat = r[latitude || ""];
        const geometry =
          geometries?.[i] ||
          (lon !== null &&
          lat !== null &&
          String(lon ?? "").trim() &&
          String(lat ?? "").trim() &&
          Number.isFinite(Number(lon)) &&
          Number.isFinite(Number(lat)) &&
          Math.abs(Number(lon)) <= 180 &&
          Math.abs(Number(lat)) <= 90
            ? {
                type: "Point" as const,
                coordinates: [Number(lon), Number(lat)]
              }
            : undefined);
        return !!geometry && areas.some((a) => booleanIntersects(a, geometry));
      });
      rows = rows.filter((_, i) => keep[i]);
      geometries = geometries?.filter((_, i) => keep[i]);
    }
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
          latitude_column: latitude,
          longitude_column: longitude,
          start: config.state.start || undefined,
          end: config.state.end || undefined,
          filters: source.filters?.map((f) => ({
            column: f.field,
            op: f.op,
            value: f.value
          })),
          polygon:
            !bounds && filterable && config.state.area?.type === "Polygon"
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
            valid_count: Number(stats.count),
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
        result.results![block.id].spatial_scope = bounds
          ? filterable
            ? source.kind === "geojson"
              ? "entities"
              : "observations"
            : "unfiltered"
          : "configured";
      } catch (e) {
        result.results![block.id] = { type: block.type, error: String(e) };
      }
    }
  }
  return result;
}
