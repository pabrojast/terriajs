import type { ChartItem } from "../ModelMixins/ChartableMixin";
import type { AccumulatedSeries } from "../ReactViews/Custom/Chart/ChartJs/ChartJsTypes";

/**
 * A catalog item that accumulates chart series as the user clicks the map
 * (features of a CSV, points of a COG time series…) and shows them in the
 * Chart.js bottom dock.
 *
 * Deliberately a structural interface with no concrete imports: the dock, the
 * share link and `Terria` all work against it, so none of them depend on a
 * specific catalog item class.
 */
export interface ChartSeriesAccumulator {
  uniqueId?: string;
  name?: string;
  /** Whether this item currently feeds the dock. */
  readonly isChartSeriesAccumulationActive: boolean;
  readonly accumulatedChartSeries: AccumulatedSeries[];
  readonly accumulatedChartItems: ChartItem[];
  addAccumulatedSeries(series: AccumulatedSeries): void;
  removeAccumulatedSeries(key: string): void;
  clearAccumulatedSeries(): void;
  /** Optional link between the chart and what the map is showing. */
  readonly chartDock?: ChartDockContext;
}

export interface ChartDockContext {
  /** x (epoch ms) of the date displayed on the map; drawn as a marker. */
  activeX?: number;
  activeXLabel?: string;
  /** Called with the x of the point the user clicked on the chart. */
  onSelectX?: (x: number) => void;
  /** Progress of series still being read. */
  status?: ChartDockStatus;
}

export interface ChartDockStatus {
  loading: boolean;
  loaded: number;
  total: number;
  /** Dates that could not be read. */
  errors: number;
  cancel?: () => void;
}

export function isChartSeriesAccumulator(
  model: unknown
): model is ChartSeriesAccumulator {
  const candidate = model as Partial<ChartSeriesAccumulator> | undefined;
  return (
    !!candidate &&
    Array.isArray(candidate.accumulatedChartSeries) &&
    typeof candidate.addAccumulatedSeries === "function" &&
    typeof candidate.removeAccumulatedSeries === "function" &&
    typeof candidate.clearAccumulatedSeries === "function" &&
    typeof candidate.isChartSeriesAccumulationActive === "boolean"
  );
}
