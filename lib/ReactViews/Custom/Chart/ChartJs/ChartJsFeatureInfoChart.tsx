import { observer } from "mobx-react";
import {
  Component,
  FC,
  ReactNode,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import MappableMixin from "../../../../ModelMixins/MappableMixin";
import { RawButton } from "../../../../Styled/Button";
import Icon, { StyledIcon } from "../../../../Styled/Icon";
import { ChartStatusText } from "../FeatureInfoPanelChart";
import ChartJsModal from "./ChartJsModal";
import { ChartJsChartProps } from "./ChartJsTypes";

// Lazily load the heavy Chart.js renderer so that chart.js, react-chartjs-2,
// chartjs-plugin-zoom and chartjs-adapter-moment stay out of the main bundle.
// This file (and everything that statically imports it) MUST NOT import any of
// those libraries. The SAME lazy reference is reused for both the inline and
// the modal chart so webpack emits a single shared chunk.
const ChartJsLineChart = lazy(() => import("./ChartJsLineChart"));

export type ChartJsFeatureInfoChartProps = Omit<
  ChartJsChartProps,
  "height" | "variant"
> & {
  height?: number;
};

interface ChartJsErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ChartJsErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches errors thrown while lazily loading or rendering the Chart.js renderer
 * so that a failure (e.g. a failed dynamic `import()`) never breaks the whole
 * feature-info panel.
 */
class ChartJsErrorBoundary extends Component<
  ChartJsErrorBoundaryProps,
  ChartJsErrorBoundaryState
> {
  constructor(props: ChartJsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ChartJsErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const ChartContainer = styled.div`
  position: relative;
`;

const ExpandButton = styled(RawButton)`
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  padding: 2px;
  color: ${(props) => props.theme.textLight};
  opacity: 0.8;
  &:hover,
  &:focus {
    opacity: 1;
  }
`;

/**
 * Light wrapper rendered in the feature-info panel when the Chart.js renderer is
 * enabled. It lazy-loads the actual chart and guards it with loading and error
 * states, and exposes a "view larger" button that opens the chart in a modal.
 */
const ChartJsFeatureInfoChart: FC<ChartJsFeatureInfoChartProps> = observer(
  (props) => {
    const { t } = useTranslation();
    const [modalOpen, setModalOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const height = props.height ?? 110;

    const item = props.item;

    // The feature-info flow hands us a freshly-constructed, disconnected
    // CsvCatalogItem whose `chartItems` getter returns [] until its map items
    // have loaded (TableMixin gates `chartItems` on activeTableStyle.ready &&
    // !isLoadingMapItems). Trigger that load here exactly as the legacy
    // FeatureInfoPanelChart does, re-running if the item identity changes.
    useEffect(() => {
      if (MappableMixin.isMixedInto(item)) {
        item.loadMapItems().then((result) => {
          result.logError();
        });
      }
    }, [item]);

    // While the (mappable) item is still loading its map items, the chart data
    // isn't ready yet. Show the loading state instead of mounting the lazy chart
    // (which would otherwise flash "No chart data" before data arrives). Because
    // this component is an observer it re-renders once `isLoadingMapItems`
    // flips and `chartItems` populates.
    const isLoading = MappableMixin.isMixedInto(item) && item.isLoadingMapItems;

    // Prefer the dataset/catalog item name as the modal title, falling back to
    // the plotted column and finally a generic label. `name` lives on
    // CatalogMemberMixin and is not guaranteed by the bare ChartableMixin type,
    // so read it defensively.
    const itemName = (item as { name?: string }).name;
    const modalTitle = itemName || props.yColumn || t("chart.sectionLabel");

    const loadingFallback = (
      <ChartStatusText width={0} height={height}>
        {t("chart.loading")}
      </ChartStatusText>
    );
    const errorFallback = (
      <ChartStatusText width={0} height={height}>
        {t("chart.noData")}
      </ChartStatusText>
    );

    return (
      <ChartContainer>
        <ExpandButton
          ref={triggerRef}
          type="button"
          aria-label={t("chart.viewLarger")}
          title={t("chart.viewLarger")}
          onClick={() => setModalOpen(true)}
        >
          <StyledIcon glyph={Icon.GLYPHS.maximize} styledWidth="16px" light />
        </ExpandButton>

        {/* Only one ChartJsLineChart is mounted at a time: when the modal is
            open we hide the inline chart so we never run two live Chart.js
            instances. While the item's map items are still loading we show the
            loading state instead of mounting the chart. */}
        {modalOpen ? (
          <ChartStatusText width={0} height={height} />
        ) : isLoading ? (
          loadingFallback
        ) : (
          <ChartJsErrorBoundary fallback={errorFallback}>
            <Suspense fallback={loadingFallback}>
              <ChartJsLineChart {...props} variant="inline" />
            </Suspense>
          </ChartJsErrorBoundary>
        )}

        <ChartJsModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={modalTitle}
          triggerRef={triggerRef}
        >
          {isLoading ? (
            loadingFallback
          ) : (
            <ChartJsErrorBoundary fallback={errorFallback}>
              <Suspense fallback={loadingFallback}>
                {/* Fill the modal body: toolbar, tabs and data table live in the
                    heavy renderer. */}
                <ChartJsLineChart
                  {...props}
                  variant="modal"
                  showDataTable={props.showDataTable}
                  height="100%"
                />
              </Suspense>
            </ChartJsErrorBoundary>
          )}
        </ChartJsModal>
      </ChartContainer>
    );
  }
);

export default ChartJsFeatureInfoChart;
