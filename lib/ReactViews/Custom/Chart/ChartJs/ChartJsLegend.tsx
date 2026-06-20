import { FC } from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import { RawButton } from "../../../../Styled/Button";
import Icon, { StyledIcon } from "../../../../Styled/Icon";

/** A single legend entry. `hidden` reflects the live chart's dataset visibility. */
export interface ChartJsLegendSeries {
  key: string;
  name: string;
  color: string;
  hidden: boolean;
}

export interface ChartJsLegendProps {
  series: ChartJsLegendSeries[];
  /** Toggle the visibility of the series with the given key. */
  onToggle: (key: string) => void;
  /**
   * Permanently remove the series with the given key. When omitted, the remove
   * button is not rendered (e.g. when there is no backing store to mutate).
   */
  onRemove?: (key: string) => void;
  /** The series currently highlighted (emphasised) on the live chart, if any. */
  highlightedId?: string | null;
  /**
   * Highlight (or, with `null`, un-highlight) a series. Fired on row
   * hover/focus so the matching line is emphasised and the rest faded.
   */
  onHighlight?: (key: string | null) => void;
  /** The series currently isolated (shown alone) on the live chart, if any. */
  isolatedId?: string | null;
  /**
   * Isolate the series with the given key (show only it), or clear isolation if
   * it is already isolated. Fired by clicking the swatch/name.
   */
  onIsolate?: (key: string) => void;
}

const LegendBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  max-height: 64px;
  overflow-y: auto;
  padding: 4px 0;
`;

const LegendRow = styled.div<{
  $hidden: boolean;
  $highlighted: boolean;
  $isolated: boolean;
}>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
  max-width: 220px;
  background-color: ${(props) => props.theme.overlay};
  opacity: ${(props) => (props.$hidden ? 0.45 : props.$highlighted ? 1 : 0.92)};
  box-shadow: ${(props) =>
    props.$isolated ? `0 0 0 2px ${props.theme.colorPrimary}` : "none"};
`;

/** The swatch + name act as one clickable target that isolates the series. */
const IsolateButton = styled(RawButton)`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: 0;
  text-align: left;
  color: ${(props) => props.theme.textLight};
  &:focus {
    outline: 1px solid ${(props) => props.theme.colorPrimary};
    outline-offset: 1px;
  }
`;

const Swatch = styled.span<{ $color: string }>`
  display: inline-block;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 2px;
  background-color: ${(props) => props.$color};
`;

const SeriesName = styled.span<{ $hidden: boolean; $highlighted: boolean }>`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) => props.theme.textLight};
  font-weight: ${(props) => (props.$highlighted ? 700 : 400)};
  text-decoration: ${(props) => (props.$hidden ? "line-through" : "none")};
`;

const LegendButton = styled(RawButton)`
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 3px;
  color: ${(props) => props.theme.textLight};
  opacity: 0.85;
  &:hover,
  &:focus {
    opacity: 1;
    background-color: ${(props) => props.theme.colorPrimary};
  }
`;

/**
 * Light, presentational legend for the Chart.js renderer. Replaces the built-in
 * chart.js legend so each series can be toggled (eye) and optionally removed
 * (trash). It deliberately does NOT import chart.js: all interaction with the
 * live chart instance is delegated to the heavy renderer via callbacks, keeping
 * this file out of the lazy chart.js chunk.
 */
const ChartJsLegend: FC<ChartJsLegendProps> = ({
  series,
  onToggle,
  onRemove,
  highlightedId,
  onHighlight,
  isolatedId,
  onIsolate
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <LegendBox role="list" aria-label={t("chart.sectionLabel")}>
      {series.map((s) => {
        const highlighted = highlightedId === s.key;
        const isolated = isolatedId === s.key;
        return (
          <LegendRow
            key={s.key}
            role="listitem"
            $hidden={s.hidden}
            $highlighted={highlighted}
            $isolated={isolated}
            theme={theme}
            onMouseEnter={() => onHighlight?.(s.key)}
            onMouseLeave={() => onHighlight?.(null)}
          >
            <IsolateButton
              type="button"
              theme={theme}
              onClick={() => onIsolate?.(s.key)}
              onFocus={() => onHighlight?.(s.key)}
              onBlur={() => onHighlight?.(null)}
              aria-pressed={isolated}
              aria-label={t("chart.isolateSeries")}
              title={t("chart.isolateSeries")}
            >
              <Swatch $color={s.color} aria-hidden="true" />
              <SeriesName
                $hidden={s.hidden}
                $highlighted={highlighted}
                title={s.name}
                theme={theme}
              >
                {s.name}
              </SeriesName>
            </IsolateButton>
            <LegendButton
              type="button"
              theme={theme}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(s.key);
              }}
              aria-pressed={!s.hidden}
              aria-label={t("chart.toggleSeries")}
              title={t("chart.toggleSeries")}
            >
              <StyledIcon glyph={Icon.GLYPHS.eye} styledWidth="14px" light />
            </LegendButton>
            {onRemove ? (
              <LegendButton
                type="button"
                theme={theme}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(s.key);
                }}
                aria-label={t("chart.removeSeries")}
                title={t("chart.removeSeries")}
              >
                <StyledIcon
                  glyph={Icon.GLYPHS.trashcan}
                  styledWidth="14px"
                  light
                />
              </LegendButton>
            ) : null}
          </LegendRow>
        );
      })}
    </LegendBox>
  );
};

export default ChartJsLegend;
