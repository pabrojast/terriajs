import CsvCatalogItem from "../../Models/Catalog/CatalogItems/CsvCatalogItem";
import CommonStrata from "../../Models/Definition/CommonStrata";
import { BaseModel } from "../../Models/Definition/Model";
import CsvChartCustomComponent from "./CsvChartCustomComponent";
import { ProcessNodeContext } from "./CustomComponent";

/**
 * A custom component for rendering charts from JSON timeseries data.
 *
 * This component accepts JSON data in the format:
 * { "result": [{"time": "ISO8601", "value1": number, "value2": number, ...}, ...] }
 *
 * Or any array of objects with consistent keys.
 *
 * Example usage in a feature info template:
 * <json-chart
 *   title="Time Series"
 *   x-column="time"
 *   y-columns="mean"
 *   data='{"result": [{"time": "2024-01-01T00:00:00Z", "mean": 1.5}, ...]}'
 * ></json-chart>
 *
 * Or with a URL:
 * <json-chart
 *   title="Time Series"
 *   src="https://api.example.com/timeseries/{{layerId}}"
 *   x-column="time"
 *   y-columns="mean"
 * ></json-chart>
 */
export default class JsonChartCustomComponent extends CsvChartCustomComponent {
  get name(): string {
    return "json-chart";
  }

  /**
   * Convert JSON data to CSV string format.
   * Handles both array-of-objects format and nested result format.
   */
  private jsonToCsv(jsonData: any): string {
    let data: any[] = [];

    // Handle different JSON formats
    if (Array.isArray(jsonData)) {
      data = jsonData;
    } else if (jsonData && typeof jsonData === "object") {
      // Check for common nested structures
      if (Array.isArray(jsonData.result)) {
        data = jsonData.result;
      } else if (Array.isArray(jsonData.data)) {
        data = jsonData.data;
      } else if (Array.isArray(jsonData.values)) {
        data = jsonData.values;
      } else {
        // Single object - wrap in array
        data = [jsonData];
      }
    }

    if (data.length === 0) {
      return "";
    }

    // Extract column names from first object
    const firstRow = data[0];
    const columns = Object.keys(firstRow);

    // Build CSV header
    const csvRows: string[] = [columns.join(",")];

    // Build CSV data rows
    data.forEach((row) => {
      const values = columns.map((col) => {
        const value = row[col];
        // Handle null/undefined values
        if (value === null || value === undefined) {
          return "";
        }
        // Quote strings that contain commas or quotes
        const stringValue = String(value);
        if (
          stringValue.includes(",") ||
          stringValue.includes('"') ||
          stringValue.includes("\n")
        ) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(","));
    });

    return csvRows.join("\n");
  }

  protected constructCatalogItem(
    id: string | undefined,
    context: ProcessNodeContext,
    sourceReference: BaseModel | undefined
  ) {
    return context.terria
      ? new CsvCatalogItem(id, context.terria, sourceReference)
      : undefined;
  }

  setTraitsFromBody = (item: CsvCatalogItem, bodyString: string) => {
    try {
      // Try to parse as JSON
      const jsonData = JSON.parse(bodyString);
      const csvString = this.jsonToCsv(jsonData);
      item.setTrait(CommonStrata.user, "csvString", csvString);
    } catch (e) {
      console.error("JsonChartCustomComponent: Failed to parse JSON data", e);
      // If parsing fails, treat as plain text (fallback to CSV)
      item.setTrait(CommonStrata.user, "csvString", bodyString);
    }
  };

  constructDownloadUrlFromBody = (body: string) => {
    try {
      // Convert JSON to CSV for download
      const jsonData = JSON.parse(body);
      const csvString = this.jsonToCsv(jsonData);
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error(
        "JsonChartCustomComponent: Failed to create download URL",
        e
      );
      // Fallback to JSON blob
      const blob = new Blob([body], { type: "application/json;charset=utf-8" });
      return URL.createObjectURL(blob);
    }
  };
}
