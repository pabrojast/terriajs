import ChartableMixin from "../../../../ModelMixins/ChartableMixin";

/**
 * Where a Chart.js chart is being rendered. `inline` is the compact chart shown
 * directly in the feature-info panel; `modal` is the large "view larger" chart
 * with toolbar, tabs and data table.
 */
export type ChartVariant = "inline" | "modal";

/**
 * Props shared by the light wrapper and the heavy `ChartJsLineChart` renderer.
 * Kept here so the heavy chunk never has to import the wrapper (which would
 * break lazy isolation).
 */
export interface ChartJsChartProps {
  item: ChartableMixin.Instance;
  xAxisLabel?: string;
  yColumn?: string;
  showDataTable?: boolean;
  /**
   * Either a fixed pixel height (inline charts) or `"100%"` to fill the parent
   * (modal charts).
   */
  height?: number | "100%";
  variant?: ChartVariant;
}

/** A single column in the normalised chart data table. */
export interface ChartTableColumn {
  key: string;
  label: string;
}

/** A single row of the normalised chart data table (one cell per column). */
export type ChartTableRow = (string | number)[];

/**
 * A normalised, presentation-ready view of the chart data shared by the chart,
 * the data table and the CSV export. Built in the heavy chunk and passed to the
 * light presentational components.
 */
export interface ChartTableModel {
  columns: ChartTableColumn[];
  rows: ChartTableRow[];
}
