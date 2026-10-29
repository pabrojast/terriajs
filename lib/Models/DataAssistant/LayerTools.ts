import type { Geometry } from "geojson";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import getDereferencedIfExists from "../../Core/getDereferencedIfExists";
import { calculateZonalStatistics } from "../../Core/CogZonalEngine";
import { readCogStepPointValue } from "../../Core/CogPointReader";
import TableMixin from "../../ModelMixins/TableMixin";
import GeoJsonMixin from "../../ModelMixins/GeojsonMixin";
import CatalogMemberMixin from "../../ModelMixins/CatalogMemberMixin";
import CogCatalogItem from "../Catalog/CatalogItems/CogCatalogItem";
import CogTimeSeriesCatalogItem from "../Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import proxyCatalogItemUrl from "../Catalog/proxyCatalogItemUrl";
import type { BaseModel } from "../Definition/Model";
import type Terria from "../Terria";
import {
  calculateRows,
  describeRows,
  statistics,
  timestamp
} from "./TableTools";
import {
  Cell,
  DataQuery,
  DataSourceRef,
  Row,
  ToolCall,
  ToolResult
} from "./Types";

export function layerSources(terria: Terria): DataSourceRef[] {
  return terria.workbench.items
    .map(getDereferencedIfExists)
    .filter(CatalogMemberMixin.isMixedInto)
    .map((item) => ({
      id: "layer:" + item.uniqueId,
      name: item.name ?? item.uniqueId ?? "Layer",
      format: item.type,
      resource_id: item.ckanResourceId,
      dataset_id: item.ckanDatasetId,
      units:
        item instanceof CogTimeSeriesCatalogItem ? item.displayUnit : undefined,
      time:
        item instanceof CogTimeSeriesCatalogItem &&
        item.currentDiscreteJulianDate
          ? JulianDate.toIso8601(item.currentDiscreteJulianDate)
          : undefined
    }));
}
export function findLayer(terria: Terria, id: string): BaseModel {
  const item = terria.workbench.items
    .map(getDereferencedIfExists)
    .find((item) => "layer:" + item.uniqueId === id);
  if (!item) throw new Error("The layer is no longer loaded; select it again");
  return item;
}
function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  return JSON.stringify(value).slice(0, 1000);
}
export function readLayerRows(item: BaseModel): {
  rows: Row[];
  geometries?: (Geometry | null)[];
  names: string[];
} {
  if (GeoJsonMixin.isMixedInto(item) && item.readyData) {
    const features = item.readyData.features;
    if (features.length > 150000)
      throw new Error("Layer exceeds 150,000 rows; use a smaller resource");
    const rows = features.map((f) =>
      Object.fromEntries(
        Object.entries(f.properties ?? {}).map(([k, v]) => [k, cell(v)])
      )
    );
    return {
      rows,
      geometries: features.map((f) => f.geometry),
      names: [...new Set(rows.flatMap(Object.keys))]
    };
  }
  if (TableMixin.isMixedInto(item)) {
    const data = item.dataColumnMajor;
    if (!data?.length) throw new Error("The table is empty or still loading");
    if (data[0].length > 150001)
      throw new Error("Layer exceeds 150,000 rows; use a smaller resource");
    const names = item.tableColumns.map((c) => c.name);
    const rows = data[0]
      .slice(1)
      .map((_, i) =>
        Object.fromEntries(names.map((n, j) => [n, cell(data[j][i + 1])]))
      );
    return { rows, names };
  }
  throw new Error(
    "This layer only exposes map imagery or metadata, not numeric data"
  );
}

function rasterContext(
  item: CogCatalogItem | CogTimeSeriesCatalogItem,
  band: number
) {
  if (!(item instanceof CogTimeSeriesCatalogItem)) return "";
  const resolution = item.activeResolution;
  const selectedBand = item.availableBands.find((b) => b.band === band);
  return ` Source temporal resolution: ${resolution?.name ?? resolution?.id ?? "unspecified"}; source band: ${selectedBand?.name ?? selectedBand?.id ?? band}. Values retain the source band's aggregation (e.g. monthly median); sampled pixel/date counts are not counts of satellite acquisitions.`;
}

async function raster(
  item: CogCatalogItem | CogTimeSeriesCatalogItem,
  query: DataQuery,
  signal: AbortSignal,
  progress: (value: string) => void
): Promise<ToolResult> {
  if (!query.polygon && !query.point)
    throw new Error(
      "Select a point or draw an area before calculating raster values"
    );
  if (
    !["statistics", "time_series", "trend", "outliers", "rows"].includes(
      query.operation
    )
  )
    throw new Error(
      "This raster operation is not available; calculate a time series or zonal statistics"
    );
  const series = item instanceof CogTimeSeriesCatalogItem ? item : undefined;
  const band = query.band ?? item.renderOptions?.single?.band ?? 1;
  const metadata = item as unknown as {
    valueScale?: number;
    valueOffset?: number;
    noDataValues?: number[];
    unit?: string;
  };
  let entries: { time: string; cogs: readonly string[] }[] = series
    ? series.timeEntries
        .filter((e) => !!e.time)
        .map((e) => ({ time: e.time!, cogs: e.cogs }))
    : [{ time: "", cogs: item.url ? [item.url] : [] }];
  const start = query.start ? timestamp(query.start) : undefined;
  const end = query.end ? timestamp(query.end) : undefined;
  if ((query.start && start === undefined) || (query.end && end === undefined))
    throw new Error("Invalid date range");
  if (start !== undefined || end !== undefined)
    entries = entries.filter((e) => {
      const time = timestamp(e.time);
      return (
        time !== undefined &&
        (start === undefined || time >= start) &&
        (end === undefined ||
          time <= end + (query.end?.length === 10 ? 86400000 - 1 : 0))
      );
    });
  else if (series && ["statistics", "rows"].includes(query.operation)) {
    const current = series.currentDiscreteJulianDate
      ? JulianDate.toDate(series.currentDiscreteJulianDate).getTime()
      : undefined;
    entries =
      current === undefined
        ? entries.slice(-1)
        : entries.filter((e) => timestamp(e.time) === current);
  }
  if (!entries.length)
    throw new Error("No raster dates are available in this period");
  if (entries.length > 366)
    throw new Error(
      "More than 366 raster dates; select a shorter period or coarser dataset resolution"
    );
  const rows: Row[] = [];
  let failed = 0;
  let missing = 0;
  let maxOverview = 0;
  let singleStats: Record<string, Cell> | undefined;
  let mosaic = false;
  for (let i = 0; i < entries.length; i++) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const entry = entries[i];
    progress(`${i + 1}/${entries.length}`);
    const urls = entry.cogs.map((url) => proxyCatalogItemUrl(item, url));
    try {
      if (query.point) {
        const read = await readCogStepPointValue(
          urls,
          query.point[0],
          query.point[1],
          {
            band,
            noDataValues: metadata.noDataValues,
            signal,
            transform: series?.valueTransform ?? {
              scale: metadata.valueScale ?? 1,
              offset: metadata.valueOffset ?? 0
            }
          }
        );
        const value = read.status === "value" ? read.value : null;
        if (value === null) missing++;
        rows.push({ x: entry.time, y: value, count: value === null ? 0 : 1 });
        singleStats = statistics([value]);
      } else {
        // Fail the date on a tile error. The legacy mosaic helper silently skips failed tiles.
        const tiles = [];
        for (const url of urls)
          tiles.push(
            await calculateZonalStatistics({
              cogUrl: url,
              polygon: query.polygon!,
              band,
              valueScale: metadata.valueScale,
              valueOffset: metadata.valueOffset,
              noDataValues: metadata.noDataValues,
              signal
            })
          );
        const valid = tiles.filter((t) => t.statistics.count > 0);
        const count = valid.reduce((s, t) => s + t.statistics.count, 0);
        const sum = valid.reduce((s, t) => s + t.statistics.sum, 0);
        maxOverview = Math.max(
          maxOverview,
          ...tiles.map((t) => t.overviewLevel)
        );
        const mean = count ? sum / count : null;
        const nodata = tiles.reduce((s, t) => s + t.statistics.noDataCount, 0);
        mosaic ||= valid.length > 1;
        singleStats = {
          count,
          sum: count ? sum : null,
          mean,
          missing: nodata,
          min: valid.length
            ? Math.min(...valid.map((t) => t.statistics.min))
            : null,
          max: valid.length
            ? Math.max(...valid.map((t) => t.statistics.max))
            : null,
          median: valid.length === 1 ? valid[0].statistics.median : null,
          stddev:
            count && mean !== null
              ? Math.sqrt(
                  valid.reduce(
                    (s, t) =>
                      s +
                      t.statistics.count *
                        (t.statistics.stddev ** 2 +
                          (t.statistics.mean - mean) ** 2),
                    0
                  ) / count
                )
              : null
        };
        if (!count) missing++;
        rows.push({ x: entry.time, y: mean, count, nodata });
      }
    } catch (error) {
      if (signal.aborted) throw error;
      failed++;
      rows.push({ x: entry.time, y: null, count: 0, error: "Read failed" });
    }
  }
  const result: ToolResult = {
    rows,
    statistics:
      rows.length === 1 ? singleStats : statistics(rows.map((r) => r.y)),
    rows_total: entries.length,
    rows_used: entries.length - failed,
    complete: failed === 0,
    units: series?.displayUnit ?? metadata.unit ?? null,
    band,
    resolution: maxOverview,
    coverage: {
      dates: entries.length,
      failed_dates: failed,
      no_data_dates: missing,
      overview_level: maxOverview
    },
    start: entries[0].time,
    end: entries[entries.length - 1].time,
    method:
      (query.point
        ? "Full-resolution point reads"
        : rows.length === 1
          ? "Zonal pixel statistics"
          : "One zonal mean per date; temporal summary weights dates equally") +
      rasterContext(item, band),
    warning: mosaic
      ? "Multiple tiles: pixel-weighted means; overlaps are not deduplicated and combined median is unavailable"
      : failed
        ? "Some dates could not be read; results are incomplete"
        : undefined
  };
  if (["trend", "outliers"].includes(query.operation)) {
    const derived = calculateRows(rows, {
      source_id: query.source_id,
      operation: query.operation,
      column: "y",
      date_column: "x"
    });
    result.statistics = derived.statistics;
    if (derived.method)
      result.method = derived.method + rasterContext(item, band);
    if (derived.rows) result.rows = derived.rows;
  }
  return JSON.parse(
    JSON.stringify(result, (_key, value) =>
      typeof value === "number" && !Number.isFinite(value) ? null : value
    )
  );
}

export async function runLayerTool(
  terria: Terria,
  call: ToolCall,
  selection: Partial<DataQuery>,
  signal: AbortSignal,
  progress: (value: string) => void
): Promise<ToolResult> {
  const item = findLayer(terria, call.arguments.source_id);
  const query = { ...selection, ...call.arguments };
  if (
    item instanceof CogCatalogItem ||
    item instanceof CogTimeSeriesCatalogItem
  ) {
    if (call.name === "describe_source")
      return {
        columns: [{ name: "value", type: "number" }],
        rows_total:
          item instanceof CogTimeSeriesCatalogItem
            ? item.timeEntries.length
            : 1,
        units:
          item instanceof CogTimeSeriesCatalogItem ? item.displayUnit : null,
        band: item.renderOptions?.single?.band ?? 1,
        method:
          "Raster: select point or polygon; operation time_series reads all dates in the specified range." +
          rasterContext(item, item.renderOptions?.single?.band ?? 1)
      };
    return raster(item, query, signal, progress);
  }
  const data = readLayerRows(item);
  if (call.name === "describe_source")
    return describeRows(data.rows, data.names);
  if (TableMixin.isMixedInto(item) && query.polygon && !data.geometries) {
    query.longitude_column ??= item.tableColumns.find((c) =>
      /^(lon|longitude|lng)$/i.test(c.name)
    )?.name;
    query.latitude_column ??= item.tableColumns.find((c) =>
      /^(lat|latitude)$/i.test(c.name)
    )?.name;
    if (!query.latitude_column || !query.longitude_column)
      throw new Error(
        "Choose latitude and longitude columns for this area filter"
      );
  }
  const result = calculateRows(data.rows, query, data.geometries);
  if (TableMixin.isMixedInto(item) && query.column)
    result.units =
      item.tableColumns.find((c) => c.name === query.column)?.units ?? null;
  return result;
}
