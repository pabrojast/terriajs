import { FC } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  computeSeriesStats,
  computeTrendPerYear,
  formatStatValue,
  maxPoint,
  StatsPoint,
  valueAtX
} from "./chartJsStats";

const Row = styled.div`
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 6px 10px 2px;
  overflow-x: auto;
`;

const Subject = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 190px;
  font-size: 12px;
  color: ${(props) => props.theme.textLight};
  opacity: 0.85;
`;

/** The series colour lives on a mark, never on the text (identity ≠ ink). */
const Swatch = styled.span<{ $color: string }>`
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(props) => props.$color};
`;

const SubjectName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Tile = styled.div`
  flex: 0 0 auto;
  min-width: 96px;
  padding: 4px 10px;
  border-radius: 4px;
  background: ${(props) => props.theme.darkLighter};
  color: ${(props) => props.theme.textLight};
`;

const Label = styled.div`
  font-size: 11px;
  opacity: 0.7;
  white-space: nowrap;
`;

const Value = styled.div`
  font-size: 17px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
`;

const Unit = styled.span`
  margin-left: 4px;
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
`;

const Note = styled.div`
  font-size: 11px;
  opacity: 0.7;
  white-space: nowrap;
`;

export interface ChartJsKpiSeries {
  name: string;
  color: string;
  units?: string;
  points: readonly StatsPoint[];
}

export interface ChartJsKpiTilesProps {
  /** The series the tiles describe (the dock passes the most recent one). */
  series: ChartJsKpiSeries;
  /** x of the date displayed on the map, to show the value at that date. */
  activeX?: number;
  activeXLabel?: string;
  formatDate?: (x: number) => string;
}

/**
 * Headline numbers for one series: value at the displayed date, mean, maximum
 * and trend. Light on purpose (no chart.js), so the dock renders it at once.
 */
const ChartJsKpiTiles: FC<ChartJsKpiTilesProps> = ({
  series,
  activeX,
  activeXLabel,
  formatDate
}) => {
  const { t } = useTranslation();
  const stats = computeSeriesStats(series.points);
  if (!stats) return null;

  const peak = maxPoint(series.points);
  const trend = computeTrendPerYear(series.points);
  const current = valueAtX(series.points, activeX);
  const unit = series.units ? <Unit>{series.units}</Unit> : null;

  return (
    <Row role="group" aria-label={series.name}>
      <Subject title={series.name}>
        <Swatch $color={series.color} aria-hidden="true" />
        <SubjectName>{series.name}</SubjectName>
      </Subject>
      {activeX !== undefined ? (
        <Tile>
          <Label>{activeXLabel ?? t("chart.kpi.current")}</Label>
          <Value>
            {formatStatValue(current)}
            {current !== undefined ? unit : null}
          </Value>
        </Tile>
      ) : null}
      <Tile>
        <Label>{t("chart.kpi.mean")}</Label>
        <Value>
          {formatStatValue(stats.mean)}
          {unit}
        </Value>
      </Tile>
      <Tile>
        <Label>{t("chart.kpi.max")}</Label>
        <Value>
          {formatStatValue(stats.max)}
          {unit}
        </Value>
        {peak && formatDate ? <Note>{formatDate(peak.x)}</Note> : null}
      </Tile>
      {trend !== undefined ? (
        <Tile>
          <Label>{t("chart.kpi.trend")}</Label>
          <Value>
            {/* Direction only: whether "up" is good depends on the variable. */}
            <span aria-hidden="true">
              {trend > 0 ? "↗ " : trend < 0 ? "↘ " : ""}
            </span>
            {trend > 0 ? "+" : ""}
            {formatStatValue(trend)}
            <Unit>
              {series.units
                ? t("chart.kpi.perYearWithUnit", { unit: series.units })
                : t("chart.kpi.perYear")}
            </Unit>
          </Value>
        </Tile>
      ) : null}
    </Row>
  );
};

export default ChartJsKpiTiles;
