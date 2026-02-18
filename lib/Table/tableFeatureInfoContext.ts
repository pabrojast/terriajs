import { JsonObject } from "../Core/Json";
import CatalogMemberMixin, { getName } from "../ModelMixins/CatalogMemberMixin";
import TableMixin from "../ModelMixins/TableMixin";
import TerriaFeature from "../Models/Feature/Feature";
import { isTerriaFeatureData } from "../Models/Feature/FeatureData";

export interface TimeSeriesFeatureInfoContext extends JsonObject {
  layerTitle?: string;
  terria?: { timeSeries?: TimeSeriesContext };
}

export interface TimeSeriesContext extends JsonObject {
  /** Chart titile */
  title?: string;
  /** X-column name */
  xName?: string;
  /** Y-column name */
  yName?: string;
  /** Units for each column */
  units?: string[];
  /** Feature ID */
  id?: string;
  /** Csv data */
  data?: string;
  /** Chart HTML */
  chart?: string;
  /** True when the payload contains usable data points or values. */
  hasData?: boolean;
  /** True when payload looks like time-series data and can be charted. */
  isTimeSeries?: boolean;
  /** Comma-separated y-columns used by json-chart. */
  yColumns?: string;
  /** Optional message for templates when no data is available. */
  message?: string;
}

/** Adds timeseries chart to feature info context (on terria.timeSeries property).
 * This enables timeseries chart to be used in featureInfoTemplate like so:
 * - default chart = `{{terria.timeSeries.chart}}`
 * - customised chart:
 * ```
 *   <h4>{{terria.timeSeries.title}}</h4>
 *   <chart x-column="{{terria.timeSeries.xName}}"
 *       y-column="{{terria.timeSeries.yName}}"
 *       id="{{terria.timeSeries.id}}"
 *       column-units="{{terria.timeSeries.units}}">
 *           {{terria.timeSeries.data}}
 *   </chart>
 * ```
 */
export const tableFeatureInfoContext: (
  catalogItem: TableMixin.Instance
) => (feature: TerriaFeature) => TimeSeriesFeatureInfoContext =
  (catalogItem) => (feature) => {
    if (!catalogItem.isSampled) return {};

    const style = catalogItem.activeTableStyle;

    // Corresponding row IDs for the selected feature are stored in TerriaFeatureData
    // See createLongitudeLatitudeFeaturePerId, createLongitudeLatitudeFeaturePerRow and createRegionMappedImageryProvider
    const rowIds = isTerriaFeatureData(feature.data)
      ? feature.data.rowIds ?? []
      : [];

    if (!style.timeColumn || !style.colorColumn || rowIds.length < 2) return {};

    const chartColumns = [style.timeColumn, style.colorColumn];
    const csvData = [
      chartColumns.map((col) => col!.title).join(","),
      ...rowIds.map((i) =>
        chartColumns!.map((col) => col.valueFunctionForType(i)).join(",")
      )
    ]
      .join("\n")
      .replace(/\\n/g, "\\n");

    const title = style.colorColumn?.title;

    const featureId = feature.id.replace(/"/g, "");

    const timeSeriesContext: TimeSeriesContext = {
      title: style.colorColumn?.title,
      xName: style.timeColumn?.title,
      yName: style.colorColumn?.title,
      units: chartColumns.map((column) => column.units || ""),
      id: featureId,
      data: csvData,
      chart: `<chart ${'identifier="' + featureId + '" '} ${
        title ? `title="${title}"` : ""
      }>${csvData}</chart>`
    };

    return {
      terria: {
        timeSeries: timeSeriesContext
      }
    };
  };

/** Add `TimeSeriesFeatureInfoContext` to features with CSV string data (on `data` property) */
export const csvFeatureInfoContext: (
  catalogItem: CatalogMemberMixin.Instance
) => (feature: TerriaFeature) => TimeSeriesFeatureInfoContext =
  (catalogItem) => (feature) => {
    // Check that feature data has return CSV as string
    if (typeof feature.data === "string") {
      const featureId = feature.id.replace(/"/g, "");
      // Remove comment lines in CSV (start with # and don't have any commas)
      const csvData = feature.data
        .split("\n")
        .filter((l) => !(l.startsWith("#") && !l.includes(",")))
        .join("\n");

      const title = getName(catalogItem);
      return {
        terria: {
          timeSeries: {
            title,
            id: featureId,
            data: csvData,
            chart: `<chart ${'identifier="' + featureId + '" '} ${
              title ? `title="${title}"` : ""
            }>${csvData}</chart>`
          }
        }
      };
    }

    return {};
  };

/**
 * Add TimeSeriesFeatureInfoContext to features with JSON data.
 * This makes JSON data from POST requests available in featureInfoTemplate.
 *
 * Handles JSON in these formats:
 * - { "result": [{...}, {...}] }
 * - { "data": [{...}, {...}] }
 * - [{ ...}, {...}]
 *
 * Exposes the data so it can be used in templates like:
 * ```
 * <json-chart
 *   title="{{terria.timeSeries.title}}"
 *   id="{{terria.timeSeries.id}}"
 *   x-column="time"
 *   y-columns="mean">
 *   {{terria.timeSeries.data}}
 * </json-chart>
 * ```
 */
export const jsonFeatureInfoContext: (
  catalogItem: CatalogMemberMixin.Instance
) => (feature: TerriaFeature) => TimeSeriesFeatureInfoContext =
  (catalogItem) => (feature) => {
    try {
      // Get the raw JSON data from the feature
      // ImageryLayerFeatureInfo stores the raw server response in .data property
      let jsonData = feature.data;

      // If data is a string (CSV), skip JSON processing
      if (typeof jsonData === "string") {
        return {};
      }

      // If data is not an object, try properties (but properties might have Cesium wrappers)
      if (!jsonData || typeof jsonData !== "object") {
        // Try to get valueOf() or the raw value if it's wrapped
        const props = feature.properties;
        if (props && typeof props === "object") {
          // Check if it's a Cesium property wrapper
          if (typeof (props as any).getValue === "function") {
            jsonData = (props as any).getValue();
          } else {
            jsonData = props;
          }
        }
      }

      // If still no valid data, return empty
      if (!jsonData || typeof jsonData !== "object") {
        return {};
      }

      const featureId = feature.id?.replace?.(/"/g, "") || "feature";
      const title = getName(catalogItem);

      // Get layerTitle from the catalog item name (for WMTS items)
      const layerTitle = getName(catalogItem);

      const hasData = payloadHasData(jsonData);
      const timeSeriesInfo = extractTimeSeriesInfo(jsonData);
      const isTimeSeries = timeSeriesInfo.isTimeSeries;
      const yColumns = timeSeriesInfo.yColumns.join(",");

      // Convert JSON object to JSON string for the template
      // Use a safe stringify that handles circular references
      let jsonString: string;
      try {
        jsonString = JSON.stringify(jsonData);
      } catch (stringifyError) {
        // If circular reference, try to extract just the essential data
        console.warn(
          "Circular reference detected in JSON data, trying to extract arrays",
          stringifyError
        );

        // Try to extract result or data arrays if they exist
        const extracted =
          (jsonData as any).result || (jsonData as any).data || jsonData;
        try {
          jsonString = JSON.stringify(extracted);
        } catch (e) {
          console.warn("Failed to stringify extracted data, giving up", e);
          return {};
        }
      }

      return {
        layerTitle, // Make layerTitle available directly in template as {{layerTitle}}
        terria: {
          timeSeries: {
            title,
            id: featureId,
            data: jsonString,
            hasData,
            isTimeSeries,
            yColumns: yColumns || "mean",
            message: hasData
              ? undefined
              : isTimeSeries
              ? "No time-series data available for this location."
              : "No data available for this location.",
            // Provide a pre-formatted chart element only for time-series payloads.
            chart:
              isTimeSeries && hasData
                ? `<json-chart ${'identifier="' + featureId + '" '} ${
                    title ? `title="${title}"` : ""
                  } x-column="time" y-columns="${
                    yColumns || "mean"
                  }">${jsonString}</json-chart>`
                : ""
          }
        }
      };
    } catch (e) {
      console.warn("Failed to process JSON feature info context", e);
      return {};
    }
  };

function payloadHasData(value: any): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    if (typeof value.count === "number") {
      return value.count > 0;
    }

    if ("result" in value) {
      return payloadHasData(value.result);
    }
    if ("data" in value) {
      return payloadHasData(value.data);
    }
    if ("values" in value) {
      return payloadHasData(value.values);
    }

    return Object.keys(value).length > 0;
  }

  return true;
}

function extractTimeSeriesInfo(value: any): {
  isTimeSeries: boolean;
  yColumns: string[];
} {
  const rows = getRowArray(value);
  const isTimeSeries = rows !== undefined;

  if (!rows || rows.length === 0) {
    return {
      isTimeSeries,
      yColumns: []
    };
  }

  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== "object") {
    return {
      isTimeSeries,
      yColumns: []
    };
  }

  const yColumns = Object.keys(firstRow).filter(
    (key) => key !== "time" && key !== "count_tot"
  );

  return {
    isTimeSeries,
    yColumns
  };
}

function getRowArray(value: any): any[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (Array.isArray(value.result)) {
    return value.result;
  }
  if (Array.isArray(value.data)) {
    return value.data;
  }
  if (Array.isArray(value.values)) {
    return value.values;
  }
  return undefined;
}
