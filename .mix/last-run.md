## Last run — Chart.js opt-in renderer for CSV time-series

**Task**: opt-in config for CSV that switches the feature-info time-series chart to Chart.js (zoom/pan/tooltips), opening a large modal on click with a data table, keeping the legacy Visx path intact.

**Outcome**: COMPLETE. 5 increments, all `tsc --noEmit` strong-verified; one adversarial review (mix-reviewer) caught a HIGH blocker (renderer never called `loadMapItems`) which was fixed; pure CSV/slug logic verified at runtime (15 assertions) + a Jasmine spec (`test/ReactViews/Custom/Chart/ChartJs/chartJsExportSpec.ts`, 10 cases).

**Files**: NEW `lib/ReactViews/Custom/Chart/ChartJs/` (registerChartJs, ChartJsFeatureInfoChart, ChartJsModal, ChartJsLineChart, ChartJsToolbar, ChartDataTable, ChartJsTypes, chartJsExport) + spec. MODIFIED CsvCatalogItemTraits, ChartCustomComponent, tableFeatureInfoContext, package.json, yarn.lock, en/es translation.json. Plan in `.mix/plan.md`.

**Verification gap / pending**: full BROWSER runtime (chart actually rendering, modal/tab/ResizeObserver behavior, zoom/pan) was NOT executed here — only typecheck + adversarial review + pure-logic runtime tests. User should run the app (gulp dev / a CSV with `useChartJsTimeSeries: true`) and `gulp test` to confirm rendering. Decision asked & chosen: chart opens in a large MODAL (not inline-only).
