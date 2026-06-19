import { observer } from "mobx-react";
import { FC, Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import CsvCatalogItem from "../../../../Models/Catalog/CatalogItems/CsvCatalogItem";
import Terria from "../../../../Models/Terria";
import { RawButton } from "../../../../Styled/Button";
import Icon, { StyledIcon } from "../../../../Styled/Icon";
import { ChartStatusText } from "../FeatureInfoPanelChart";
import { ChartJsErrorBoundary } from "./ChartJsFeatureInfoChart";
import ChartJsModal from "./ChartJsModal";

// Reuse the SAME lazy chunk as the feature-info wrapper so webpack emits a
// single shared Chart.js bundle. This file MUST NOT statically import chart.js
// (or its wrappers) — only this dynamic `import()` pulls in the heavy chunk.
const ChartJsLineChart = lazy(() => import("./ChartJsLineChart"));

// Raised to fit the compact toolbar + legend above/below the chart so the chart
// itself keeps a usable height.
const DOCK_HEIGHT = 280;
const INLINE_CHART_HEIGHT = 180;

const DockHolder = styled.div`
  left: 0;
  right: 0;
  background: ${(props) => props.theme.transparentDark};
  border-radius: 8px 8px 0 0;
  margin-bottom: 6px;
  box-sizing: border-box;
`;

const DockInner = styled.div`
  display: flex;
  flex-direction: column;
  height: ${DOCK_HEIGHT}px;
  padding: 0 8px 8px 8px;
  box-sizing: border-box;
`;

const DockHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  flex-shrink: 0;
  color: ${(props) => props.theme.textLight};
`;

const DockTitle = styled.span`
  font-weight: bold;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DockButton = styled(RawButton)`
  display: flex;
  align-items: center;
  padding: 4px 8px;
  color: ${(props) => props.theme.textLight};
  border-radius: 3px;
  opacity: 0.9;
  &:hover,
  &:focus {
    opacity: 1;
    background: ${(props) => props.theme.colorPrimary};
  }
`;

const CloseDockButton = styled(RawButton)`
  display: flex;
  align-items: center;
  padding: 4px;
  color: ${(props) => props.theme.textLight};
  opacity: 0.8;
  &:hover,
  &:focus {
    opacity: 1;
  }
`;

const DockBody = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
`;

interface ChartJsSeriesDockProps {
  terria: Terria;
}

/** Is this workbench item an actively-accumulating Chart.js CSV item? */
function isActiveAccumulatingItem(item: unknown): item is CsvCatalogItem {
  return (
    item instanceof CsvCatalogItem &&
    item.useChartJsTimeSeries === true &&
    item.accumulatedChartSeries.length > 0
  );
}

/**
 * Non-blocking bottom panel that accumulates per-feature time-series for a CSV
 * layer with the interactive Chart.js renderer enabled. Stays light: only the
 * lazily-loaded `ChartJsLineChart` pulls in chart.js. Supports the FIRST active
 * accumulating CSV item (one interactive CSV at a time for Increment 1).
 */
const ChartJsSeriesDock: FC<ChartJsSeriesDockProps> = observer((props) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  // First workbench item that is an active accumulating Chart.js CSV item.
  const item = props.terria.workbench.items.find(isActiveAccumulatingItem) as
    | CsvCatalogItem
    | undefined;

  if (!item) {
    return null;
  }

  const chartItems = item.accumulatedChartItems;
  const title = `${item.name ?? t("chart.sectionLabel")} — ${t(
    "chart.seriesLabel"
  )}`;

  const clearAndClose = () => {
    setModalOpen(false);
    item.clearAccumulatedSeries();
  };

  const loadingFallback = (
    <ChartStatusText width={0} height={INLINE_CHART_HEIGHT}>
      {t("chart.loading")}
    </ChartStatusText>
  );
  const errorFallback = (
    <ChartStatusText width={0} height={INLINE_CHART_HEIGHT}>
      {t("chart.noData")}
    </ChartStatusText>
  );

  return (
    <DockHolder>
      <DockInner>
        <DockHeader>
          <DockTitle title={title}>{title}</DockTitle>
          <DockButton
            type="button"
            onClick={() => setModalOpen(true)}
            title={t("chart.viewAll")}
          >
            {t("chart.viewAll")}
          </DockButton>
          <DockButton
            type="button"
            onClick={() => item.clearAccumulatedSeries()}
            title={t("chart.clearSeries")}
          >
            {t("chart.clearSeries")}
          </DockButton>
          <CloseDockButton
            type="button"
            onClick={clearAndClose}
            aria-label={t("chart.clearSeries")}
            title={t("chart.clearSeries")}
          >
            <StyledIcon glyph={Icon.GLYPHS.close} styledWidth="14px" light />
          </CloseDockButton>
        </DockHeader>
        <DockBody>
          {modalOpen ? null : (
            <ChartJsErrorBoundary fallback={errorFallback}>
              <Suspense fallback={loadingFallback}>
                <ChartJsLineChart
                  chartItemsOverride={chartItems}
                  variant="dock"
                  height={INLINE_CHART_HEIGHT}
                  onRemoveSeries={(key) => item.removeAccumulatedSeries(key)}
                />
              </Suspense>
            </ChartJsErrorBoundary>
          )}
        </DockBody>
      </DockInner>

      <ChartJsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={title}
      >
        <ChartJsErrorBoundary fallback={errorFallback}>
          <Suspense fallback={loadingFallback}>
            <ChartJsLineChart
              chartItemsOverride={chartItems}
              variant="modal"
              showDataTable
              height="100%"
              onRemoveSeries={(key) => item.removeAccumulatedSeries(key)}
            />
          </Suspense>
        </ChartJsErrorBoundary>
      </ChartJsModal>
    </DockHolder>
  );
});

export default ChartJsSeriesDock;
