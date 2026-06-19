import ChartableMixin, {
  ChartItem
} from "../../../../ModelMixins/ChartableMixin";

/**
 * Where a Chart.js chart is being rendered. `inline` is the compact chart shown
 * directly in the feature-info panel; `dock` is the accumulating bottom panel
 * (compact toolbar + legend, no tabs/table); `modal` is the large "view larger"
 * chart with toolbar, legend, tabs and data table.
 */
export type ChartVariant = "inline" | "dock" | "modal";

/**
 * A single per-feature time-series accumulated by clicking map features when the
 * interactive Chart.js renderer is enabled. `x` is always normalised to epoch
 * milliseconds so the stored data is plain, serialisable and renderer-agnostic
 * (no chart.js types leak into the store).
 */
export interface AccumulatedSeries {
  /** Stable per-feature id used to de-duplicate re-clicks of the same feature. */
  key: string;
  /** Display name for the series (feature name or plotted column title). */
  name: string;
  /** Units of the plotted (y) column, if any. */
  units?: string;
  /** Distinct line colour for this series. */
  color: string;
  /** Ascending-by-x points; `x` is epoch milliseconds. */
  points: { x: number; y: number }[];
}

/**
 * Props shared by the light wrapper and the heavy `ChartJsLineChart` renderer.
 * Kept here so the heavy chunk never has to import the wrapper (which would
 * break lazy isolation).
 */
export interface ChartJsChartProps {
  /**
   * The chartable catalog item whose `chartItems` are rendered. Optional when
   * `chartItemsOverride` is supplied (the dock passes pre-resolved series and
   * has no single backing item to derive from).
   */
  item?: ChartableMixin.Instance;
  /**
   * Pre-resolved series to render directly, bypassing the `item.chartItems`
   * derivation and the map-items loading gate. Used by the accumulating bottom
   * dock, which already holds fully-resolved data.
   */
  chartItemsOverride?: ChartItem[];
  xAxisLabel?: string;
  yColumn?: string;
  showDataTable?: boolean;
  /**
   * Either a fixed pixel height (inline charts) or `"100%"` to fill the parent
   * (modal charts).
   */
  height?: number | "100%";
  variant?: ChartVariant;
  /**
   * Called when the user removes a series from the chart's own legend. Used by
   * the accumulating dock/modal to drop the series from the shared store. When
   * omitted, the legend's remove button is not rendered.
   */
  onRemoveSeries?: (key: string) => void;
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
