/**
 * CogAreaCalculationPanel — Shows precalculated area statistics for
 * CogTimeSeriesCatalogItem items that have `areaCalculations` with
 * inline or remote values.  Also shows a prominent "Calculate area"
 * button for any cog-time-series item on the workbench so users
 * can easily launch the zonal calculation tool.
 *
 * Renders in the BottomDock when a qualifying item is on the workbench.
 * Displays: current-time value badges + mini SVG line chart per calculation.
 */

import { observer } from "mobx-react";
import React, { useCallback, useMemo, useState } from "react";
import styled from "styled-components";
import CogTimeSeriesCatalogItem from "../../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import Terria from "../../../Models/Terria";
import ViewState from "../../../ReactViewModels/ViewState";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import { GLYPHS } from "../../../Styled/Icon";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import { COG_CALCULATION_TOOL_ID } from "./CogCalculationTool";

interface Props {
  terria: Terria;
  viewState: ViewState;
}

function formatValue(value: number): string {
  if (isNaN(value)) return "N/A";
  if (Number.isInteger(value)) return value.toLocaleString();
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(2);
}

/**
 * Find CogTimeSeriesCatalogItem instances on the workbench.
 */
function getCogTimeSeriesItems(terria: Terria): CogTimeSeriesCatalogItem[] {
  return terria.workbench.items.filter(
    (item): item is CogTimeSeriesCatalogItem =>
      item.type === "cog-time-series" &&
      item instanceof CogTimeSeriesCatalogItem
  );
}

const CogAreaCalculationPanel: React.FC<Props> = observer(
  ({ terria, viewState }) => {
    const items = getCogTimeSeriesItems(terria);
    if (items.length === 0) return null;

    return (
      <PanelContainer>
        {items.map((item) => (
          <ItemAreaPanel
            key={item.uniqueId}
            item={item}
            viewState={viewState}
          />
        ))}
      </PanelContainer>
    );
  }
);

export default CogAreaCalculationPanel;

// ─── Per-item area calculation display ──────────────────────────

interface ItemAreaPanelProps {
  item: CogTimeSeriesCatalogItem;
  viewState: ViewState;
}

const ItemAreaPanel: React.FC<ItemAreaPanelProps> = observer(
  ({ item, viewState }) => {
    const [expanded, setExpanded] = useState(true);
    const [selectedCalc, setSelectedCalc] = useState<string | undefined>(
      undefined
    );

    const currentResults = item.currentAreaCalculationResults;
    const areaCalcs = item.areaCalculations ?? [];
    const hasAreaCalcs =
      areaCalcs.length > 0 &&
      areaCalcs.some((c) => c.values && c.values.length > 0);

    // Default to first calc
    const activeCalcName = selectedCalc ?? areaCalcs[0]?.name;

    const allSeries = useMemo(() => {
      const map: Record<string, Array<{ time: string; value: number }>> = {};
      for (const calc of areaCalcs) {
        if (!calc.name) continue;
        const series = item.getAreaCalculationTimeSeries(calc.name);
        if (series) map[calc.name] = series;
      }
      return map;
    }, [areaCalcs, item]);

    const openCalculationTool = useCallback(() => {
      viewState.openTool({
        toolName: COG_CALCULATION_TOOL_ID,
        getToolComponent: () =>
          import("./CogCalculationTool").then((m) => m.default as any),
        params: {}
      });
    }, [viewState]);

    return (
      <ItemContainer>
        <HeaderRow onClick={() => setExpanded(!expanded)}>
          <Box verticalCenter gap>
            <ChartIcon>📊</ChartIcon>
            <Text semiBold small>
              {item.name ?? "COG Time Series"}
            </Text>
          </Box>
          <CollapseButton>{expanded ? "▼" : "▶"}</CollapseButton>
        </HeaderRow>

        {expanded && (
          <>
            {/* Calculate button — always visible */}
            <ButtonRow>
              <CalculateButton onClick={openCalculationTool}>
                📐 Calcular área en serie de tiempo
              </CalculateButton>
            </ButtonRow>

            {/* Current time value badges (only if precalculated values exist) */}
            {hasAreaCalcs && currentResults.length > 0 && (
              <>
                <SectionLabel>Valores precalculados:</SectionLabel>
                <BadgeRow>
                  {currentResults.map((r) => (
                    <ValueBadge
                      key={r.name}
                      active={r.name === activeCalcName}
                      onClick={() => setSelectedCalc(r.name)}
                    >
                      <BadgeLabel>{r.name}</BadgeLabel>
                      <BadgeValue>
                        {r.value !== undefined ? formatValue(r.value) : "—"}
                        {r.unit ? ` ${r.unit}` : ""}
                      </BadgeValue>
                    </ValueBadge>
                  ))}
                </BadgeRow>

                {/* Chart for selected calculation */}
                {activeCalcName && allSeries[activeCalcName] && (
                  <ChartSection>
                    <MiniTimeSeriesChart
                      data={allSeries[activeCalcName]}
                      currentTime={item.currentDiscreteTimeTag}
                      unit={
                        areaCalcs.find((c) => c.name === activeCalcName)
                          ?.unit ?? ""
                      }
                      label={activeCalcName}
                    />
                  </ChartSection>
                )}

                {/* Values table (collapsible) */}
                {activeCalcName && allSeries[activeCalcName] && (
                  <details>
                    <summary style={{ padding: "0 12px", cursor: "pointer" }}>
                      <Text as="span" mini textLight>
                        Ver tabla ({allSeries[activeCalcName].length} fechas)
                      </Text>
                    </summary>
                    <ValuesTable>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>
                            {areaCalcs.find((c) => c.name === activeCalcName)
                              ?.statistic ?? "Valor"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allSeries[activeCalcName].map((v, i) => (
                          <tr key={i}>
                            <td>{v.time.slice(0, 10)}</td>
                            <td>
                              {formatValue(v.value)}{" "}
                              {areaCalcs.find((c) => c.name === activeCalcName)
                                ?.unit ?? ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </ValuesTable>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </ItemContainer>
    );
  }
);

// ─── Mini SVG Chart ─────────────────────────────────────────────

interface MiniChartProps {
  data: Array<{ time: string; value: number }>;
  currentTime?: string;
  unit: string;
  label: string;
}

const MiniTimeSeriesChart: React.FC<MiniChartProps> = observer(
  ({ data, currentTime, unit, label }) => {
    const chartData = useMemo(() => {
      const values = data.map((d) => ({
        time: new Date(d.time).getTime(),
        value: d.value,
        isoDate: d.time.slice(0, 10)
      }));

      const valid = values.filter((v) => isFinite(v.value));
      if (valid.length < 2) return null;

      const minTime = Math.min(...valid.map((v) => v.time));
      const maxTime = Math.max(...valid.map((v) => v.time));
      const minVal = Math.min(...valid.map((v) => v.value));
      const maxVal = Math.max(...valid.map((v) => v.value));

      const width = 380;
      const height = 120;
      const pad = { top: 8, right: 10, bottom: 22, left: 42 };
      const cw = width - pad.left - pad.right;
      const ch = height - pad.top - pad.bottom;
      const timeRange = maxTime - minTime || 1;
      const valRange = maxVal - minVal || 1;

      const points = valid.map((v) => ({
        x: pad.left + ((v.time - minTime) / timeRange) * cw,
        y: pad.top + (1 - (v.value - minVal) / valRange) * ch,
        isoDate: v.isoDate,
        value: v.value,
        isCurrent: currentTime ? v.isoDate === currentTime.slice(0, 10) : false
      }));

      const linePath = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ");

      // Area fill path
      const areaPath =
        linePath +
        ` L ${points[points.length - 1].x} ${height - pad.bottom}` +
        ` L ${points[0].x} ${height - pad.bottom} Z`;

      return {
        points,
        linePath,
        areaPath,
        width,
        height,
        pad,
        minVal,
        maxVal,
        minTime,
        maxTime
      };
    }, [data, currentTime]);

    if (!chartData) {
      return (
        <Text mini textLight>
          Datos insuficientes para graficar.
        </Text>
      );
    }

    const {
      points,
      linePath,
      areaPath,
      width,
      height,
      pad,
      minVal,
      maxVal,
      minTime,
      maxTime
    } = chartData;

    return (
      <ChartWrapper>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid */}
          <line
            x1={pad.left}
            y1={pad.top}
            x2={pad.left}
            y2={height - pad.bottom}
            stroke="#444"
            strokeWidth={1}
          />
          <line
            x1={pad.left}
            y1={height - pad.bottom}
            x2={width - pad.right}
            y2={height - pad.bottom}
            stroke="#444"
            strokeWidth={1}
          />

          {/* Y-axis */}
          <text
            x={pad.left - 4}
            y={pad.top + 3}
            fill="#888"
            fontSize={8}
            textAnchor="end"
          >
            {formatValue(maxVal)}
          </text>
          <text
            x={pad.left - 4}
            y={height - pad.bottom + 3}
            fill="#888"
            fontSize={8}
            textAnchor="end"
          >
            {formatValue(minVal)}
          </text>

          {/* X-axis */}
          <text
            x={pad.left}
            y={height - 4}
            fill="#888"
            fontSize={8}
            textAnchor="start"
          >
            {new Date(minTime).toISOString().slice(0, 7)}
          </text>
          <text
            x={width - pad.right}
            y={height - 4}
            fill="#888"
            fontSize={8}
            textAnchor="end"
          >
            {new Date(maxTime).toISOString().slice(0, 7)}
          </text>

          {/* Area fill */}
          <path d={areaPath} fill="rgba(74, 157, 248, 0.12)" />

          {/* Line */}
          <path d={linePath} fill="none" stroke="#4a9df8" strokeWidth={1.5} />

          {/* Data points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.isCurrent ? 4 : 2}
              fill={p.isCurrent ? "#ff6b6b" : "#4a9df8"}
              stroke={p.isCurrent ? "#fff" : "none"}
              strokeWidth={p.isCurrent ? 1.5 : 0}
            >
              <title>
                {p.isoDate}: {formatValue(p.value)} {unit}
              </title>
            </circle>
          ))}
        </svg>
        <ChartLabel>
          {label} ({unit})
        </ChartLabel>
      </ChartWrapper>
    );
  }
);

// ─── Styled Components ──────────────────────────────────────────

const PanelContainer = styled.div`
  padding: 6px 10px;
`;

const ItemContainer = styled.div`
  background: ${(p) => p.theme.dark};
  border-radius: 6px;
  margin-bottom: 6px;
  overflow: hidden;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  &:hover {
    background: ${(p) => p.theme.darkLighter};
  }
`;

const ChartIcon = styled.span`
  font-size: 14px;
`;

const CollapseButton = styled.span`
  font-size: 10px;
  color: ${(p) => p.theme.textLight};
`;

const ButtonRow = styled.div`
  padding: 4px 12px 8px;
`;

const CalculateButton = styled.button`
  width: 100%;
  padding: 10px 14px;
  border: 2px dashed rgba(74, 157, 248, 0.5);
  border-radius: 6px;
  background: rgba(74, 157, 248, 0.08);
  color: #4a9df8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    background: rgba(74, 157, 248, 0.18);
    border-color: rgba(74, 157, 248, 0.8);
  }
`;

const SectionLabel = styled.div`
  padding: 0 12px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${(p) => p.theme.textLight};
  opacity: 0.7;
`;

const BadgeRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 4px 12px 8px;
  flex-wrap: wrap;
`;

const ValueBadge = styled.div<{ active?: boolean }>`
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  min-width: 120px;
  background: ${(p) =>
    p.active ? "rgba(74, 157, 248, 0.15)" : p.theme.darkLighter};
  border: 1px solid
    ${(p) => (p.active ? "rgba(74, 157, 248, 0.5)" : "transparent")};
  transition: all 0.15s;
  &:hover {
    background: rgba(74, 157, 248, 0.1);
  }
`;

const BadgeLabel = styled.span`
  font-size: 10px;
  color: ${(p) => p.theme.textLight};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const BadgeValue = styled.span`
  font-size: 16px;
  font-weight: bold;
  color: #4a9df8;
  margin-top: 2px;
`;

const ChartSection = styled.div`
  padding: 0 12px 8px;
`;

const ChartWrapper = styled.div`
  background: ${(p) => p.theme.darkLighter};
  border-radius: 4px;
  padding: 4px;
  position: relative;
`;

const ChartLabel = styled.div`
  text-align: center;
  font-size: 9px;
  color: ${(p) => p.theme.textLight};
  margin-top: -2px;
  padding-bottom: 2px;
`;

const ValuesTable = styled.table`
  width: calc(100% - 24px);
  margin: 4px 12px 8px;
  border-collapse: collapse;
  font-size: 11px;

  th,
  td {
    padding: 3px 6px;
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
