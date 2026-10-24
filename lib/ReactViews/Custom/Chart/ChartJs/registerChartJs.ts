import {
  CategoryScale,
  Chart,
  Decimation,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip
} from "chart.js";
// Side-effect import: registers the moment-based date adapter used by the time scale.
import "chartjs-adapter-moment";
import zoomPlugin from "chartjs-plugin-zoom";

let registered = false;

/**
 * Idempotently registers the Chart.js controllers, elements, scales and plugins
 * required by the Chart.js feature-info renderer.
 *
 * This module is only ever imported by the lazily-loaded `ChartJsLineChart`
 * chunk, never by anything in the main bundle.
 */
export function registerChartJs(): void {
  if (registered) {
    return;
  }
  registered = true;

  Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    TimeScale,
    CategoryScale,
    Tooltip,
    Legend,
    Filler,
    Decimation,
    zoomPlugin
  );
}
