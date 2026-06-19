import { FC } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { RawButton } from "../../../../Styled/Button";
import Box from "../../../../Styled/Box";
import Icon, { StyledIcon } from "../../../../Styled/Icon";

export interface ChartJsToolbarProps {
  onResetZoom: () => void;
  onDownloadPng: () => void;
  onDownloadCsv: () => void;
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
 * Presentational toolbar for the large Chart.js chart: reset zoom and download
 * (PNG / CSV) actions. It deliberately does NOT import chart.js; all actions are
 * delegated to the heavy renderer via callbacks so this file stays light.
 */
const ChartJsToolbar: FC<ChartJsToolbarProps> = ({
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
        onClick={onResetZoom}
        aria-label={t("chart.resetZoom")}
        title={t("chart.resetZoom")}
      >
        <StyledIcon glyph={Icon.GLYPHS.zoomReset} styledWidth="16px" light />
        {t("chart.resetZoom")}
      </ToolbarButton>
      <ToolbarButton
        type="button"
        onClick={onDownloadPng}
        aria-label={t("chart.downloadPng")}
        title={t("chart.downloadPng")}
      >
        <StyledIcon glyph={Icon.GLYPHS.gallery} styledWidth="16px" light />
        {t("chart.downloadPng")}
      </ToolbarButton>
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
    </ToolbarBox>
  );
};

export default ChartJsToolbar;
