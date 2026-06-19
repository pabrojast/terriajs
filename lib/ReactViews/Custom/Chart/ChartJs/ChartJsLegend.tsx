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

const LegendRow = styled.div<{ $hidden: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
  max-width: 220px;
  background-color: ${(props) => props.theme.overlay};
  opacity: ${(props) => (props.$hidden ? 0.45 : 1)};
`;

const Swatch = styled.span<{ $color: string }>`
  display: inline-block;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 2px;
  background-color: ${(props) => props.$color};
`;

const SeriesName = styled.span<{ $hidden: boolean }>`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) => props.theme.textLight};
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
  onRemove
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <LegendBox role="list" aria-label={t("chart.sectionLabel")}>
      {series.map((s) => (
        <LegendRow key={s.key} role="listitem" $hidden={s.hidden} theme={theme}>
          <Swatch $color={s.color} aria-hidden="true" />
          <SeriesName $hidden={s.hidden} title={s.name} theme={theme}>
            {s.name}
          </SeriesName>
          <LegendButton
            type="button"
            theme={theme}
            onClick={() => onToggle(s.key)}
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
              onClick={() => onRemove(s.key)}
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
      ))}
    </LegendBox>
  );
};

export default ChartJsLegend;
