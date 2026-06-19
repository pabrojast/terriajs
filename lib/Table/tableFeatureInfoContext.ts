import { JsonObject } from "../Core/Json";
import CatalogMemberMixin, { getName } from "../ModelMixins/CatalogMemberMixin";
import TableMixin from "../ModelMixins/TableMixin";
import hasTraits from "../Models/Definition/hasTraits";
import { BaseModel } from "../Models/Definition/Model";
import TerriaFeature from "../Models/Feature/Feature";
import { isTerriaFeatureData } from "../Models/Feature/FeatureData";
import CsvCatalogItemTraits from "../Traits/TraitsClasses/CsvCatalogItemTraits";

/**
 * Returns the extra `<chart>` attributes to emit when the catalog item is a CSV
 * item with the interactive Chart.js renderer enabled. Returns an empty string
 * otherwise, so the emitted markup is byte-identical to the legacy behaviour
 * when the trait is off/absent.
 *
 * Uses a safe trait check (no `CsvCatalogItem` import) to avoid module cycles.
 */
function chartJsAttributes(catalogItem: BaseModel | undefined): string {
  if (
    catalogItem &&
    hasTraits(catalogItem, CsvCatalogItemTraits, "useChartJsTimeSeries") &&
    catalogItem.useChartJsTimeSeries === true
  ) {
    const showDataTable =
      hasTraits(catalogItem, CsvCatalogItemTraits, "chartJsShowDataTable") &&
      catalogItem.chartJsShowDataTable === false
        ? "false"
        : "true";
    return ` renderer="chartjs" show-data-table="${showDataTable}"`;
  }
  return "";
}

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

    const chartJsAttrs = chartJsAttributes(catalogItem);

    const timeSeriesContext: TimeSeriesContext = {
      title: style.colorColumn?.title,
      xName: style.timeColumn?.title,
      yName: style.colorColumn?.title,
      units: chartColumns.map((column) => column.units || ""),
      id: featureId,
      data: csvData,
      chart: `<chart ${'identifier="' + featureId + '" '} ${
        title ? `title="${title}"` : ""
      }${chartJsAttrs}>${csvData}</chart>`
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
      const chartJsAttrs = chartJsAttributes(catalogItem);
      return {
        terria: {
          timeSeries: {
            title,
            id: featureId,
            data: csvData,
            chart: `<chart ${'identifier="' + featureId + '" '} ${
              title ? `title="${title}"` : ""
            }${chartJsAttrs}>${csvData}</chart>`
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
            // Provide a pre-formatted chart element
            chart: `<json-chart ${'identifier="' + featureId + '" '} ${
              title ? `title="${title}"` : ""
            } x-column="time" y-columns="mean">${jsonString}</json-chart>`
          }
        }
      };
    } catch (e) {
      console.warn("Failed to process JSON feature info context", e);
      return {};
    }
  };
