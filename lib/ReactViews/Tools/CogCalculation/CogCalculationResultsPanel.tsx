import { observer } from "mobx-react";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import {
  calculateDomain,
  ChartItem
} from "../../../ModelMixins/ChartableMixin";
import ChartJsModal from "../../Custom/Chart/ChartJs/ChartJsModal";
import Text from "../../../Styled/Text";
import { ZonalStatistics } from "../../../Core/CogZonalEngine";
import {
  Action,
  Actions,
  Card,
  Details,
  Grid,
  Heading,
  Hint,
  Stack
} from "./AnalysisUi";
const ChartJsLineChart = lazy(
  () => import("../../Custom/Chart/ChartJs/ChartJsLineChart")
);
const formatValue = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "—";

const CogCalculationResultsPanel = observer(
  ({ vm }: { vm: CogCalculationViewModel }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const [expanded, setExpanded] = useState(false);
    const expandButton = useRef<HTMLButtonElement>(null);
    const item = vm.selectedTimeSeriesItem;
    const points =
      vm.timeSeriesResults
        ?.map((r) => ({
          x: Date.parse(r.time),
          y: r.statistics[vm.selectedStatistic]
        }))
        .filter((p) => Number.isFinite(p.y)) ?? [];
    const chartItems: ChartItem[] = item
      ? [
          {
            id: "drawn-area",
            key: "drawn-area",
            name: `${t(
              `models.cogCalculation.statistics.${vm.selectedStatistic}`
            )} · ${vm.resultContext?.resolutionName ?? vm.resolutionName} · ${
              vm.resultContext?.period ?? vm.periodLabel
            }`,
            item,
            type: "line",
            units:
              vm.selectedStatistic === "count"
                ? undefined
                : vm.resultContext?.unit,
            showInChartPanel: true,
            isSelectedInWorkbench: true,
            xAxis: { name: "Time", scale: "time" },
            points,
            domain: calculateDomain(points),
            getColor: () => theme.colorPrimary,
            updateIsSelectedInWorkbench: () => {}
          }
        ]
      : [];
    const tr = (key: string, options?: Record<string, unknown>) =>
      t(`models.cogCalculation.${key}`, options);
    return (
      <Stack>
        <div>
          <Heading>{tr("resultsTitle")}</Heading>
          <Hint>{vm.selectedItem?.name}</Hint>
          {vm.isTimeSeries && (
            <Hint>
              {vm.resultContext?.resolutionName} · {vm.resultContext?.period}
            </Hint>
          )}
        </div>
        {vm.singleResult ? (
          <>
            <Hint>
              {tr("overview", {
                level: vm.singleResult.overviewLevel,
                resolution: vm.singleResult.pixelResolution
                  .map((r) => r.toFixed(1))
                  .join(" × ")
              })}
            </Hint>
            <Grid>
              {Object.entries(vm.singleResult.statistics).map(
                ([key, value]) => (
                  <Card key={key}>
                    <Hint>{tr(`statistics.${key}`)}</Hint>
                    <Heading>{formatValue(value)}</Heading>
                  </Card>
                )
              )}
            </Grid>
          </>
        ) : vm.timeSeriesResults?.length ? (
          <>
            <Card>
              <Heading>{tr(`statistics.${vm.selectedStatistic}`)}</Heading>
              <Hint>
                {tr("processed", { count: vm.timeSeriesResults.length })}
                {vm.resultContext?.unit ? ` · ${vm.resultContext.unit}` : ""}
              </Hint>
            </Card>
            <TimeSeriesChart
              results={vm.timeSeriesResults}
              statistic={vm.selectedStatistic}
            />
            <Details>
              <summary>{tr("table")}</summary>
              <TableScroll>
                <table>
                  <thead>
                    <tr>
                      <th>{tr("date")}</th>
                      <th>{tr(`statistics.${vm.selectedStatistic}`)}</th>
                      <th>{tr("pixels")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.timeSeriesResults.map((r, i) => (
                      <tr key={i}>
                        <td>{r.time.slice(0, 10)}</td>
                        <td>
                          {formatValue(r.statistics[vm.selectedStatistic])}
                        </td>
                        <td>{r.statistics.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Details>
            <Actions>
              <Action $primary onClick={() => vm.exportCsv()}>
                {tr("export")}
              </Action>
              <Action ref={expandButton} onClick={() => setExpanded(true)}>
                {tr("expandChart")}
              </Action>
            </Actions>
          </>
        ) : (
          <Hint>{tr("noResults")}</Hint>
        )}
        <ChartJsModal
          isOpen={expanded}
          onClose={() => setExpanded(false)}
          title={`${tr("resultsTitle")} · ${
            vm.resultContext?.resolutionName ?? ""
          } · ${vm.resultContext?.period ?? ""}`}
          triggerRef={expandButton}
        >
          <Suspense fallback={<Hint>{t("chart.loading")}</Hint>}>
            <ChartJsLineChart
              chartItemsOverride={chartItems}
              variant="modal"
              height="100%"
              showDataTable
              activeX={item?.chartDock?.activeX}
              onSelectX={item?.chartDock?.onSelectX}
            />
          </Suspense>
        </ChartJsModal>
        <Actions>
          <Action onClick={() => vm.cancelCalculation()}>
            {tr("backToSettings")}
          </Action>
          <Action onClick={() => vm.startDrawing()}>
            {tr("newCalculation")}
          </Action>
        </Actions>
      </Stack>
    );
  }
);
export default CogCalculationResultsPanel;

// ─── Mini SVG Time Series Chart ─────────────────────────────────

interface ChartProps {
  results: Array<{
    time: string;
    statistics: ZonalStatistics;
  }>;
  statistic: string;
}

const TimeSeriesChart: React.FC<ChartProps> = observer(
  ({ results, statistic }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const chartData = useMemo(() => {
      const values = results.map((r) => ({
        time: new Date(r.time).getTime(),
        value: (r.statistics as any)[statistic] as number
      }));

      const validValues = values.filter((v) => isFinite(v.value));
      if (validValues.length === 0) return null;

      const minTime = Math.min(...validValues.map((v) => v.time));
      const maxTime = Math.max(...validValues.map((v) => v.time));
      const minVal = Math.min(...validValues.map((v) => v.value));
      const maxVal = Math.max(...validValues.map((v) => v.value));

      const width = 320;
      const height = 160;
      const padding = { top: 10, right: 10, bottom: 25, left: 50 };

      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;

      const timeRange = maxTime - minTime || 1;
      const valRange = maxVal - minVal || 1;

      const points = validValues.map((v) => ({
        x: padding.left + ((v.time - minTime) / timeRange) * chartWidth,
        y: padding.top + (1 - (v.value - minVal) / valRange) * chartHeight,
        time: new Date(v.time).toISOString().slice(0, 10),
        value: v.value
      }));

      const linePath = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ");

      return {
        points,
        linePath,
        width,
        height,
        padding,
        minVal,
        maxVal,
        minTime,
        maxTime
      };
    }, [results, statistic]);

    if (!chartData) {
      return (
        <Text small textLight>
          {t("models.cogCalculation.noValues")}
        </Text>
      );
    }

    const {
      points,
      linePath,
      width,
      height,
      padding,
      minVal,
      maxVal,
      minTime,
      maxTime
    } = chartData;

    return (
      <ChartContainer>
        <svg
          role="img"
          aria-label={t("models.cogCalculation.resultsTitle")}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke={theme.darkLighter}
            strokeWidth={1}
          />
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke={theme.darkLighter}
            strokeWidth={1}
          />

          {/* Y-axis labels */}
          <text
            x={padding.left - 5}
            y={padding.top + 4}
            fill={theme.textLight}
            fontSize={9}
            textAnchor="end"
          >
            {formatValue(maxVal)}
          </text>
          <text
            x={padding.left - 5}
            y={height - padding.bottom + 4}
            fill={theme.textLight}
            fontSize={9}
            textAnchor="end"
          >
            {formatValue(minVal)}
          </text>

          {/* X-axis labels */}
          <text
            x={padding.left}
            y={height - 5}
            fill={theme.textLight}
            fontSize={9}
            textAnchor="start"
          >
            {new Date(minTime).toISOString().slice(0, 10)}
          </text>
          <text
            x={width - padding.right}
            y={height - 5}
            fill={theme.textLight}
            fontSize={9}
            textAnchor="end"
          >
            {new Date(maxTime).toISOString().slice(0, 10)}
          </text>

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={theme.colorPrimary}
            strokeWidth={2.5}
          />

          {/* Data points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={theme.colorPrimary}>
              <title>
                {p.time}: {formatValue(p.value)}
              </title>
            </circle>
          ))}
        </svg>
      </ChartContainer>
    );
  }
);

const ChartContainer = styled.div`
  border: 1px solid ${(p) => p.theme.darkLighter};
  border-radius: 10px;
  padding: 12px 6px;
  background: ${(p) => p.theme.dark};
  svg {
    display: block;
    max-width: 100%;
  }
`;
const TableScroll = styled.div`
  overflow: auto;
  max-height: 260px;
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    text-align: left;
    padding: 9px 6px;
    border-bottom: 1px solid ${(p) => p.theme.darkLighter};
  }
  th {
    color: ${(p) => p.theme.textLightDimmed};
    font-weight: 600;
  }
`;
