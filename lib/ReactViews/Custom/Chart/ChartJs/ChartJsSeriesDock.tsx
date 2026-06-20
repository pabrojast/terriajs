import { observer } from "mobx-react";
import {
  FC,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
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

// Header keeps a compact toolbar + legend above/below the chart so the chart
// itself keeps a usable height. The dock body height is user-adjustable.
const DEFAULT_DOCK_HEIGHT = 280;
const MIN_DOCK_HEIGHT = 140;
const MAX_DOCK_HEIGHT = 520;
const HEADER_HEIGHT = 36;
const INLINE_CHART_HEIGHT = 180;

// Session-scoped dock state. Module-level so it survives unmount/remount (e.g.
// the dock toggling visibility) but resets on a full reload.
let sessionDockHeight = DEFAULT_DOCK_HEIGHT;
let sessionCollapsed = false;

const clampDockHeight = (height: number) =>
  Math.min(MAX_DOCK_HEIGHT, Math.max(MIN_DOCK_HEIGHT, height));

const DockHolder = styled.div`
  left: 0;
  right: 0;
  background: ${(props) => props.theme.transparentDark};
  border-radius: 8px 8px 0 0;
  margin-bottom: 6px;
  box-sizing: border-box;
`;

// Thin grip strip along the top edge for vertical (height) resizing.
const ResizeGrip = styled.div`
  height: 6px;
  width: 100%;
  flex-shrink: 0;
  cursor: ns-resize;
  border-radius: 8px 8px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.theme.overlay};
  opacity: 0.6;
  &:hover {
    opacity: 1;
  }
  &::after {
    content: "";
    width: 36px;
    height: 2px;
    border-radius: 2px;
    background: ${(props) => props.theme.textLight};
  }
`;

const DockInner = styled.div<{ $height: number }>`
  display: flex;
  flex-direction: column;
  height: ${(props) => props.$height}px;
  padding: 0 8px 8px 8px;
  box-sizing: border-box;
`;

const DockHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: ${HEADER_HEIGHT}px;
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

const DockIconButton = styled(RawButton)`
  display: flex;
  align-items: center;
  padding: 4px;
  color: ${(props) => props.theme.textLight};
  border-radius: 3px;
  opacity: 0.85;
  &:hover,
  &:focus {
    opacity: 1;
    background: ${(props) => props.theme.colorPrimary};
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
 *
 * The dock height is user-resizable from a grip on its top edge and it can be
 * collapsed to just the header; both states persist for the session.
 */
const ChartJsSeriesDock: FC<ChartJsSeriesDockProps> = observer((props) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(sessionDockHeight);
  const [collapsed, setCollapsed] = useState(sessionCollapsed);

  // Keep the session-scoped values in sync so a remount restores the last state.
  useEffect(() => {
    sessionDockHeight = dockHeight;
  }, [dockHeight]);
  useEffect(() => {
    sessionCollapsed = collapsed;
  }, [collapsed]);

  // Vertical resize from the top grip: dragging up grows the dock. Listeners are
  // attached to the document for the duration of the drag (mouse + touch).
  const startResize = useCallback(
    (startClientY: number) => {
      const startHeight = dockHeight;

      const onMove = (clientY: number) => {
        setDockHeight(clampDockHeight(startHeight + (startClientY - clientY)));
      };

      const onMouseMove = (e: MouseEvent) => onMove(e.clientY);
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches[0]) onMove(e.touches[0].clientY);
      };
      const onEnd = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onEnd);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onEnd);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchmove", onTouchMove);
      document.addEventListener("touchend", onEnd);
    },
    [dockHeight]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startResize(e.clientY);
    },
    [startResize]
  );
  const handleResizeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches[0]) startResize(e.touches[0].clientY);
    },
    [startResize]
  );

  const resizeGripRef = useRef<HTMLDivElement>(null);
  // React's onTouchStart is passive by default; attach a non-passive listener so
  // the resize drag does not also scroll the page on touch devices.
  useEffect(() => {
    const node = resizeGripRef.current;
    if (!node) return;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
    };
    node.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => node.removeEventListener("touchstart", onTouchStart);
  }, []);

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

  // When collapsed the dock shows only the header bar (no grip, no chart).
  const collapsedHeight = HEADER_HEIGHT + 8;

  return (
    <DockHolder>
      {collapsed ? null : (
        <ResizeGrip
          ref={resizeGripRef}
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("chart.resize")}
          title={t("chart.resize")}
          onMouseDown={handleResizeMouseDown}
          onTouchStart={handleResizeTouchStart}
        />
      )}
      <DockInner $height={collapsed ? collapsedHeight : dockHeight}>
        <DockHeader>
          <DockTitle title={title}>{title}</DockTitle>
          <DockButton
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label={t("chart.viewAll")}
            title={t("chart.viewAll")}
          >
            {t("chart.viewAll")}
          </DockButton>
          <DockButton
            type="button"
            onClick={() => item.clearAccumulatedSeries()}
            aria-label={t("chart.clearSeries")}
            title={t("chart.clearSeries")}
          >
            {t("chart.clearSeries")}
          </DockButton>
          <DockIconButton
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? t("chart.expand") : t("chart.collapse")}
            aria-expanded={!collapsed}
            title={collapsed ? t("chart.expand") : t("chart.collapse")}
          >
            <StyledIcon
              glyph={collapsed ? Icon.GLYPHS.expand : Icon.GLYPHS.collapse}
              styledWidth="14px"
              light
            />
          </DockIconButton>
          <DockIconButton
            type="button"
            onClick={clearAndClose}
            aria-label={t("chart.clearSeries")}
            title={t("chart.clearSeries")}
          >
            <StyledIcon glyph={Icon.GLYPHS.close} styledWidth="14px" light />
          </DockIconButton>
        </DockHeader>
        {collapsed ? null : (
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
        )}
      </DockInner>

      <ChartJsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={title}
        persistKey={`${item.uniqueId}:chartModal`}
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
