import { FC } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { RawButton } from "../../../../Styled/Button";
import Box from "../../../../Styled/Box";
import Icon, { StyledIcon } from "../../../../Styled/Icon";

export interface ChartJsToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  /** When omitted, the Download PNG button is not rendered (compact toolbar). */
  onDownloadPng?: () => void;
  /** When omitted, the Download CSV button is not rendered (compact toolbar). */
  onDownloadCsv?: () => void;
  canDownloadCsv?: boolean;
}

const ToolbarBox = styled(Box)`
  flex-shrink: 0;
`;

const ToolbarButton = styled(RawButton)`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  color: ${(props) => props.theme.textLight};
  opacity: 0.85;
  &:hover,
  &:focus {
    opacity: 1;
    background-color: ${(props) => props.theme.overlay};
  }
  &[disabled] {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

/**
 * Presentational toolbar for the large Chart.js chart: zoom in / zoom out /
 * reset zoom and (optionally) download (PNG / CSV) actions. It deliberately does
 * NOT import chart.js; all actions are delegated to the heavy renderer via
 * callbacks so this file stays light. Download buttons are only rendered when
 * their callback is provided, allowing a compact toolbar for the dock.
 */
const ChartJsToolbar: FC<ChartJsToolbarProps> = ({
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onDownloadPng,
  onDownloadCsv,
  canDownloadCsv = true
}) => {
  const { t } = useTranslation();

  return (
    <ToolbarBox
      gap
      verticalCenter
      role="toolbar"
      aria-label={t("chart.sectionLabel")}
    >
      <ToolbarButton
        type="button"
        onClick={onZoomIn}
        aria-label={t("chart.zoomIn")}
        title={t("chart.zoomIn")}
      >
        <StyledIcon glyph={Icon.GLYPHS.zoomIn} styledWidth="16px" light />
        {t("chart.zoomIn")}
      </ToolbarButton>
      <ToolbarButton
        type="button"
        onClick={onZoomOut}
        aria-label={t("chart.zoomOut")}
        title={t("chart.zoomOut")}
      >
        <StyledIcon glyph={Icon.GLYPHS.zoomOut} styledWidth="16px" light />
        {t("chart.zoomOut")}
      </ToolbarButton>
      <ToolbarButton
        type="button"
        onClick={onResetZoom}
        aria-label={t("chart.resetZoom")}
        title={t("chart.resetZoom")}
      >
        <StyledIcon glyph={Icon.GLYPHS.zoomReset} styledWidth="16px" light />
        {t("chart.resetZoom")}
      </ToolbarButton>
      {onDownloadPng ? (
        <ToolbarButton
          type="button"
          onClick={onDownloadPng}
          aria-label={t("chart.downloadPng")}
          title={t("chart.downloadPng")}
        >
          <StyledIcon glyph={Icon.GLYPHS.gallery} styledWidth="16px" light />
          {t("chart.downloadPng")}
        </ToolbarButton>
      ) : null}
      {onDownloadCsv ? (
        <ToolbarButton
          type="button"
          onClick={onDownloadCsv}
          disabled={!canDownloadCsv}
          aria-label={t("chart.downloadCsv")}
          title={t("chart.downloadCsv")}
        >
          <StyledIcon glyph={Icon.GLYPHS.download} styledWidth="16px" light />
          {t("chart.downloadCsv")}
        </ToolbarButton>
      ) : null}
    </ToolbarBox>
  );
};

export default ChartJsToolbar;
