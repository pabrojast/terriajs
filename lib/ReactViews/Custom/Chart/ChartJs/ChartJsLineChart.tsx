import type { Chart as ChartJsInstance } from "chart.js";
import { ChartData, ChartOptions } from "chart.js";
import moment from "moment";
import { observer } from "mobx-react";
import {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { Line } from "react-chartjs-2";
import createGuid from "terriajs-cesium/Source/Core/createGuid";
import styled, { useTheme } from "styled-components";
import ChartableMixin, {
  ChartItem
} from "../../../../ModelMixins/ChartableMixin";
import MappableMixin from "../../../../ModelMixins/MappableMixin";
import { ChartStatusText } from "../FeatureInfoPanelChart";
import ChartDataTable from "./ChartDataTable";
import { buildCsv, slugifyFilename } from "./chartJsExport";
import ChartJsToolbar from "./ChartJsToolbar";
import {
  ChartJsChartProps,
  ChartTableColumn,
  ChartTableModel,
  ChartTableRow
} from "./ChartJsTypes";
import { registerChartJs } from "./registerChartJs";

// Register Chart.js controllers/elements/scales/plugins once when this lazy
// chunk is loaded.
registerChartJs();

/** A point with x normalised to epoch milliseconds. */
type LinePoint = { x: number; y: number };

/** Hard cap on the number of points per dataset (DoS/perf guard). */
const MAX_POINTS = 50000;

const isLineType = (chartItem: ChartItem) =>
  chartItem.type === "line" || chartItem.type === "lineAndPoint";

/** Normalise a chart point x value to epoch milliseconds. */
function toEpochMs(x: number | Date): number {
  return x instanceof Date ? x.getTime() : Number(x);
}

/**
 * Convert a chart item's points to finite, ascending-sorted, capped line
 * points.
 */
function buildLinePoints(chartItem: ChartItem): LinePoint[] {
  const points: LinePoint[] = [];
  for (const point of chartItem.points) {
    const x = toEpochMs(point.x);
    const y = Number(point.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  points.sort((a, b) => a.x - b.x);

  if (points.length > MAX_POINTS) {
    // Keep an evenly-sampled subset.
    const sampled: LinePoint[] = [];
    const step = points.length / MAX_POINTS;
    for (let i = 0; i < MAX_POINTS; i++) {
      sampled.push(points[Math.floor(i * step)]);
    }
    return sampled;
  }

  return points;
}

/** Format an original (un-normalised) x value for the table/CSV. */
function formatX(x: number | Date, isTime: boolean): string | number {
  if (x instanceof Date) {
    return moment(x).format("YYYY-MM-DD HH:mm:ss");
  }
  if (isTime && Number.isFinite(Number(x))) {
    return moment(Number(x)).format("YYYY-MM-DD HH:mm:ss");
  }
  return x;
}

const FillColumn = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const ChartArea = styled.div<{ $fill: boolean; $height: number }>`
  position: relative;
  width: 100%;
  ${(props) =>
    props.$fill ? `flex: 1; min-height: 0;` : `height: ${props.$height}px;`}
`;

const TabList = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin: 8px 0;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 6px 12px;
  border: none;
  border-bottom: 2px solid
    ${(props) => (props.$active ? props.theme.colorPrimary : "transparent")};
  background: transparent;
  color: ${(props) => props.theme.textLight};
  cursor: pointer;
  opacity: ${(props) => (props.$active ? 1 : 0.7)};
  &:hover,
  &:focus {
    opacity: 1;
  }
`;

const TabPanel = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

/**
 * The heavy, lazily-loaded Chart.js renderer. This is the ONLY module that
 * imports chart.js / react-chartjs-2 / chartjs-plugin-zoom. All interaction with
 * the live Chart.js instance (reset zoom, PNG export) lives here so the wrapper,
 * modal, toolbar and table can stay light.
 */
const ChartJsLineChart: FC<ChartJsChartProps> = observer((props) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const variant = props.variant ?? "inline";
  const fillHeight = props.height === "100%";
  const pixelHeight = typeof props.height === "number" ? props.height : 110;
  const catalogItem = props.item;

  const chartRef = useRef<ChartJsInstance<"line", LinePoint[]>>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);

  // Stable unique id base for the tablist (avoid React 18's `useId` so the lib
  // still compiles against consuming apps with older React typings).
  const tabBaseIdRef = useRef<string>();
  if (!tabBaseIdRef.current) {
    tabBaseIdRef.current = `chartjs-tabs-${createGuid()}`;
  }
  const tabBaseId = tabBaseIdRef.current;
  const [activeTab, setActiveTab] = useState<"chart" | "data">("chart");

  const primaryColor: string =
    (theme && (theme.colorPrimary as string)) || "#519ac2";
  const textColor: string = (theme && (theme.textLight as string)) || "#ffffff";
  // `gridColor` is not a theme key, so always fall back.
  const gridColor: string =
    (theme && ((theme as any).gridColor as string)) ||
    "rgba(255, 255, 255, 0.15)";

  const lineChartItems = useMemo(() => {
    if (!ChartableMixin.isMixedInto(catalogItem)) {
      return [];
    }
    const all = catalogItem.chartItems.filter(isLineType);
    // If a yColumn is provided, prefer the matching column to keep single-series
    // parity with the legacy preview chart.
    if (props.yColumn) {
      const matching = all.filter((it) => it.id === props.yColumn);
      if (matching.length > 0) {
        return matching;
      }
    }
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItem, (catalogItem as any).chartItems, props.yColumn]);

  // Determine a single common x-axis type. Use "time" only when every series is
  // time-based, otherwise fall back to linear.
  const xScaleType: "time" | "linear" = useMemo(
    () =>
      lineChartItems.length > 0 &&
      lineChartItems.every((it) => it.xAxis?.scale === "time")
        ? ("time" as const)
        : ("linear" as const),
    [lineChartItems]
  );

  // Resolve a stable per-series color array up front so it can be a memo
  // dependency: a color change without a `lineChartItems` identity change would
  // otherwise leave borderColor/backgroundColor stale.
  const seriesColors = useMemo(
    () =>
      lineChartItems.map(
        (chartItem) =>
          (typeof chartItem.getColor === "function"
            ? chartItem.getColor()
            : undefined) || primaryColor
      ),
    [lineChartItems, primaryColor]
  );
  // Join into a primitive so the `data` memo re-runs on any color change.
  const seriesColorsKey = seriesColors.join("|");

  const data = useMemo<ChartData<"line", LinePoint[]>>(() => {
    return {
      datasets: lineChartItems.map((chartItem, index) => {
        const color = seriesColors[index] || primaryColor;
        return {
          label: chartItem.name,
          data: buildLinePoints(chartItem),
          borderColor: color,
          backgroundColor: color,
          pointRadius: 0,
          borderWidth: 1.5,
          spanGaps: true
        };
      })
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineChartItems, primaryColor, seriesColors, seriesColorsKey]);

  const options = useMemo<ChartOptions<"line">>(() => {
    const firstItem = lineChartItems[0];
    const units = firstItem?.units;
    return {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      scales: {
        x: {
          type: xScaleType,
          ticks: { color: textColor, maxRotation: 0, autoSkip: true },
          grid: { color: gridColor },
          title: props.xAxisLabel
            ? { display: true, text: props.xAxisLabel, color: textColor }
            : undefined
        },
        y: {
          ticks: { color: textColor },
          grid: { color: gridColor }
        }
      },
      plugins: {
        decimation: {
          enabled: true,
          algorithm: "lttb"
        },
        legend: {
          display: lineChartItems.length > 1,
          labels: { color: textColor }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const name = context.dataset.label ?? "";
              const value = context.parsed.y;
              return units ? `${name}: ${value} ${units}` : `${name}: ${value}`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true },
            mode: "x"
          },
          pan: {
            enabled: true,
            mode: "x"
          }
        }
      }
    };
  }, [lineChartItems, xScaleType, textColor, gridColor, props.xAxisLabel]);

  // Unified data model shared by the table and CSV export. Joins all selected
  // series by their ORIGINAL x value (ascending). The first column is x; each
  // series gets one column labelled `name (units)`.
  const tableModel = useMemo<ChartTableModel>(() => {
    const isTime = xScaleType === "time";
    const xLabel = props.xAxisLabel || (isTime ? "Time" : "X");
    const columns: ChartTableColumn[] = [{ key: "__x__", label: xLabel }];

    // Map of epoch-ms key -> { displayX, values[seriesIndex] }.
    const rowsByX = new Map<
      number,
      { displayX: string | number; values: (string | number)[] }
    >();

    lineChartItems.forEach((chartItem, seriesIndex) => {
      const units = chartItem.units;
      columns.push({
        key: chartItem.id || `series-${seriesIndex}`,
        label: units ? `${chartItem.name} (${units})` : chartItem.name
      });
      for (const point of chartItem.points) {
        const xKey = toEpochMs(point.x);
        const y = Number(point.y);
        if (!Number.isFinite(xKey) || !Number.isFinite(y)) {
          continue;
        }
        let row = rowsByX.get(xKey);
        if (!row) {
          row = {
            displayX: formatX(point.x, isTime),
            values: new Array(lineChartItems.length).fill("")
          };
          rowsByX.set(xKey, row);
        }
        row.values[seriesIndex] = y;
      }
    });

    const sortedKeys = Array.from(rowsByX.keys()).sort((a, b) => a - b);
    const rows: ChartTableRow[] = sortedKeys.map((xKey) => {
      const row = rowsByX.get(xKey)!;
      return [row.displayX, ...row.values];
    });

    return { columns, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineChartItems, xScaleType, props.xAxisLabel]);

  // Base filename for downloads.
  const baseName =
    (catalogItem as { name?: string }).name ||
    lineChartItems[0]?.name ||
    props.yColumn ||
    "chart";

  const resetZoom = useCallback(() => {
    chartRef.current?.resetZoom?.();
  }, []);

  const triggerDownload = useCallback((href: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, []);

  const downloadPng = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const url = chart.toBase64Image();
    triggerDownload(url, `${slugifyFilename(baseName)}.png`);
  }, [baseName, triggerDownload]);

  const downloadCsv = useCallback(() => {
    const csv = buildCsv(tableModel);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      triggerDownload(url, `${slugifyFilename(baseName)}.csv`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [baseName, tableModel, triggerDownload]);

  // When filling the parent, keep the canvas in sync with the container size so
  // it recovers from being remounted/shown and tracks viewport changes.
  useEffect(() => {
    if (!fillHeight) {
      return;
    }
    const container = chartAreaRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      // Debounce via requestAnimationFrame so a burst of resize events only
      // triggers a single chart resize.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        chartRef.current?.resize();
      });
    });
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fillHeight]);

  const hasData = data.datasets.some((d) => (d.data as LinePoint[]).length > 0);
  if (!hasData) {
    // Distinguish "still loading" from "ready and genuinely empty": only show
    // the no-data message once the item has finished loading its map items.
    // The wrapper normally gates the loading state, but a re-render can land
    // here before `chartItems` populates (e.g. activeTableStyle not ready yet).
    const stillLoading =
      MappableMixin.isMixedInto(catalogItem) && catalogItem.isLoadingMapItems;
    return (
      <ChartStatusText width={0} height={fillHeight ? 110 : pixelHeight}>
        {stillLoading ? t("chart.loading") : t("chart.noData")}
      </ChartStatusText>
    );
  }

  const ariaLabel = lineChartItems[0]?.name
    ? `${lineChartItems[0].name} chart`
    : "Chart";

  const chartElement = (
    <ChartArea
      ref={chartAreaRef}
      $fill={fillHeight}
      $height={pixelHeight}
      role="img"
      aria-label={ariaLabel}
    >
      <Line ref={chartRef} data={data} options={options} />
    </ChartArea>
  );

  // Inline variant: compact chart only, no toolbar/tabs/table.
  if (variant === "inline") {
    return chartElement;
  }

  const showDataTable = props.showDataTable === true;

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActiveTab("data");
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveTab("chart");
    }
  };

  const chartTabId = `${tabBaseId}-tab-chart`;
  const dataTabId = `${tabBaseId}-tab-data`;
  const chartPanelId = `${tabBaseId}-panel-chart`;
  const dataPanelId = `${tabBaseId}-panel-data`;

  return (
    <FillColumn>
      <ChartJsToolbar
        onResetZoom={resetZoom}
        onDownloadPng={downloadPng}
        onDownloadCsv={downloadCsv}
        canDownloadCsv={tableModel.rows.length > 0}
      />
      {showDataTable ? (
        <>
          <TabList role="tablist" aria-label={t("chart.sectionLabel")}>
            <Tab
              type="button"
              role="tab"
              id={chartTabId}
              aria-selected={activeTab === "chart"}
              aria-controls={chartPanelId}
              tabIndex={activeTab === "chart" ? 0 : -1}
              $active={activeTab === "chart"}
              onClick={() => setActiveTab("chart")}
              onKeyDown={onTabKeyDown}
            >
              {t("chart.chartTab")}
            </Tab>
            <Tab
              type="button"
              role="tab"
              id={dataTabId}
              aria-selected={activeTab === "data"}
              aria-controls={dataPanelId}
              tabIndex={activeTab === "data" ? 0 : -1}
              $active={activeTab === "data"}
              onClick={() => setActiveTab("data")}
              onKeyDown={onTabKeyDown}
            >
              {t("chart.dataTab")}
            </Tab>
          </TabList>
          {activeTab === "chart" ? (
            <TabPanel
              role="tabpanel"
              id={chartPanelId}
              aria-labelledby={chartTabId}
              tabIndex={0}
            >
              {chartElement}
            </TabPanel>
          ) : (
            <TabPanel
              role="tabpanel"
              id={dataPanelId}
              aria-labelledby={dataTabId}
              tabIndex={0}
            >
              <ChartDataTable model={tableModel} />
            </TabPanel>
          )}
        </>
      ) : (
        chartElement
      )}
    </FillColumn>
  );
});

export default ChartJsLineChart;
