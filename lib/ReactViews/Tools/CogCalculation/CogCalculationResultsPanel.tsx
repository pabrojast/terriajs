/**
 * CogCalculationResultsPanel — Displays zonal calculation results.
 *
 * For single COGs: shows a statistics table.
 * For time series: shows a line chart + table + CSV export button.
 */

import { observer } from "mobx-react";
import { useMemo } from "react";
import styled, { useTheme } from "styled-components";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import { ZonalStatistics } from "../../../Core/CogZonalEngine";

interface Props {
  vm: CogCalculationViewModel;
}

const STAT_LABELS: Record<string, string> = {
  mean: "Mean",
  min: "Minimum",
  max: "Maximum",
  sum: "Sum",
  count: "Valid pixels",
  noDataCount: "NoData pixels",
  median: "Median",
  stddev: "Std. deviation"
};

function formatValue(value: number): string {
  if (isNaN(value)) return "N/A";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(4);
}

const CogCalculationResultsPanel: React.FC<Props> = observer(({ vm }) => {
  // Single COG result
  if (vm.singleResult) {
    return (
      <Container>
        <Text medium bold>
          Zonal Statistics Results
        </Text>
        <Spacing bottom={0.5} />
        <Text small textLight>
          Overview level: {vm.singleResult.overviewLevel} | Resolution:{" "}
          {vm.singleResult.pixelResolution.map((r) => r.toFixed(1)).join(" × ")}{" "}
          units/px
        </Text>
        <Spacing bottom={1} />

        <StatsTable>
          <tbody>
            {Object.entries(vm.singleResult.statistics).map(([key, value]) => (
              <tr key={key}>
                <StatLabel>{STAT_LABELS[key] || key}</StatLabel>
                <StatValue>{formatValue(value)}</StatValue>
              </tr>
            ))}
          </tbody>
        </StatsTable>

        <Spacing bottom={1.5} />
        <Box gap>
          <Button
            secondary
            onClick={() => vm.startDrawing()}
            textProps={{ small: true }}
          >
            New calculation
          </Button>
          <Button
            secondary
            onClick={() => vm.editPolygon()}
            textProps={{ small: true }}
          >
            Redraw polygon
          </Button>
        </Box>
      </Container>
    );
  }

  // Time series result
  if (vm.timeSeriesResults && vm.timeSeriesResults.length > 0) {
    return (
      <Container>
        <Text medium bold>
          Time Series —{" "}
          {STAT_LABELS[vm.selectedStatistic] || vm.selectedStatistic}
        </Text>
        <Spacing bottom={0.5} />
        <Text small textLight>
          {vm.timeSeriesResults.length} time steps processed
        </Text>
        <Spacing bottom={1} />

        {/* Mini Chart - SVG Line Chart */}
        <TimeSeriesChart
          results={vm.timeSeriesResults}
          statistic={vm.selectedStatistic}
        />

        <Spacing bottom={1} />

        {/* Values Table (collapsible) */}
        <StyledDetails>
          <StyledSummary>
            <Text as="span" small bold>
              View values table ({vm.timeSeriesResults.length} rows)
            </Text>
          </StyledSummary>
          <Spacing bottom={0.5} />
          <ScrollableTable>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>
                    {STAT_LABELS[vm.selectedStatistic] || vm.selectedStatistic}
                  </th>
                  <th>Pixels</th>
                </tr>
              </thead>
              <tbody>
                {vm.timeSeriesResults.map((r, i) => (
                  <tr key={i}>
                    <td>{r.time.slice(0, 10)}</td>
                    <td>
                      {formatValue((r.statistics as any)[vm.selectedStatistic])}
                    </td>
                    <td>{r.statistics.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </StyledDetails>

        <Spacing bottom={1.5} />
        <Box gap flexWrap>
          <Button
            primary={!vm.isTimeSeriesResultExpandedInChartPanel}
            secondary={vm.isTimeSeriesResultExpandedInChartPanel}
            onClick={() => vm.toggleTimeSeriesResultChartPanel()}
            textProps={{ small: true }}
          >
            {vm.isTimeSeriesResultExpandedInChartPanel ? "Collapse" : "Expand"}
          </Button>
          <Button
            primary
            onClick={() => vm.exportCsv()}
            textProps={{ small: true }}
          >
            Export CSV
          </Button>
          <Button
            secondary
            onClick={() => vm.startDrawing()}
            textProps={{ small: true }}
          >
            New calculation
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container>
      <Text small textLight>
        No results to display.
      </Text>
    </Container>
  );
});

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
          No valid values to chart.
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
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
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
            strokeWidth={1.5}
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

// ─── Styled Components ──────────────────────────────────────────

const Container = styled.div`
  color: ${(p) => p.theme.textLight};
`;

const StatsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const StatLabel = styled.td`
  padding: 6px 8px;
  font-size: 13px;
  color: ${(p) => p.theme.textLight};
  border-bottom: 1px solid ${(p) => p.theme.darkLighter};
`;

const StatValue = styled.td`
  padding: 6px 8px;
  font-size: 13px;
  font-weight: bold;
  text-align: right;
  color: ${(p) => p.theme.textLight};
  border-bottom: 1px solid ${(p) => p.theme.darkLighter};
`;

const StyledDetails = styled.details`
  color: ${(p) => p.theme.textLight};
`;

const StyledSummary = styled.summary`
  cursor: pointer;
  padding: 4px 0;
  color: ${(p) => p.theme.textLight};
  &:hover {
    opacity: 0.85;
  }
  &::marker {
    color: ${(p) => p.theme.textLight};
  }
`;

const ScrollableTable = styled.div`
  max-height: 250px;
  overflow-y: auto;

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th,
  td {
    padding: 4px 6px;
    text-align: left;
    border-bottom: 1px solid ${(p) => p.theme.darkLighter};
    color: ${(p) => p.theme.textLight};
  }

  th {
    font-weight: bold;
    position: sticky;
    top: 0;
    background: ${(p) => p.theme.dark};
  }
`;

const ChartContainer = styled.div`
  background: ${(p) => p.theme.darkLighter};
  border-radius: 4px;
  padding: 5px;
  overflow: hidden;

  text {
    fill: ${(p) => p.theme.textLight};
  }
`;
