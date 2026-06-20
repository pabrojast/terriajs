import classNames from "classnames";
import {
  action,
  reaction,
  runInAction,
  makeObservable,
  type IReactionDisposer
} from "mobx";
import { observer } from "mobx-react";
import {
  Component,
  createRef,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent
} from "react";
import { withTranslation, TFunction } from "react-i18next";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Entity from "terriajs-cesium/Source/DataSources/Entity";
import flatten from "../../Core/flatten";
import isDefined from "../../Core/isDefined";
import { featureBelongsToCatalogItem } from "../../Map/PickedFeatures/PickedFeatures";
import prettifyCoordinates from "../../Map/Vector/prettifyCoordinates";
import MappableMixin from "../../ModelMixins/MappableMixin";
import TimeFilterMixin from "../../ModelMixins/TimeFilterMixin";
import CompositeCatalogItem from "../../Models/Catalog/CatalogItems/CompositeCatalogItem";
import CsvCatalogItem from "../../Models/Catalog/CatalogItems/CsvCatalogItem";
import { BaseModel } from "../../Models/Definition/Model";
import TerriaFeature from "../../Models/Feature/Feature";
import { isTerriaFeatureData } from "../../Models/Feature/FeatureData";
import type {
  DraggableElementDimensions,
  DraggableElementPosition,
  FeatureInfoPanelState
} from "../../Models/InitSource";
import {
  addMarker,
  isMarkerVisible,
  removeMarker
} from "../../Models/LocationMarkerUtils";
import Terria from "../../Models/Terria";
import Workbench from "../../Models/Workbench";
import ViewState from "../../ReactViewModels/ViewState";
import Icon from "../../Styled/Icon";
import Loader from "../Loader";
import { withViewState } from "../Context";
import { paletteColor } from "../Custom/Chart/ChartJs/chartJsPalette";
import Styles from "./feature-info-panel.scss";
import FeatureInfoCatalogItem from "./FeatureInfoCatalogItem";

interface Props {
  viewState: ViewState;
  printView?: boolean;
  t: TFunction;
}

const DRAG_MARGIN = 8;
const RESIZE_SAVE_DEBOUNCE_MS = 100;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseTranslate = (transform?: string | null) => {
  if (!transform) return { x: 0, y: 0 };

  const translate3d = transform.match(
    /translate3d\(([^,]+),\s*([^,]+),\s*[^)]+\)/
  );
  if (translate3d) {
    const x = parseFloat(translate3d[1]);
    const y = parseFloat(translate3d[2]);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0
    };
  }

  const matrix = transform.match(
    /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/
  );
  if (matrix) {
    const x = parseFloat(matrix[1]);
    const y = parseFloat(matrix[2]);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0
    };
  }

  const translate2d = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
  if (translate2d) {
    const x = parseFloat(translate2d[1]);
    const y = parseFloat(translate2d[2]);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0
    };
  }

  return { x: 0, y: 0 };
};

const getViewportSize = () => ({
  width: window.innerWidth || document.documentElement.clientWidth || 0,
  height: window.innerHeight || document.documentElement.clientHeight || 0
});

const getDragBounds = (element: HTMLElement, dx: number, dy: number) => {
  const rect = element.getBoundingClientRect();
  const { width: viewportWidth, height: viewportHeight } = getViewportSize();

  if (!viewportWidth || !viewportHeight || !rect.width || !rect.height) {
    return null;
  }

  const baseLeft = rect.left - dx;
  const baseTop = rect.top - dy;

  return {
    minAllowedDx: DRAG_MARGIN - baseLeft,
    maxAllowedDx: viewportWidth - DRAG_MARGIN - rect.width - baseLeft,
    minAllowedDy: DRAG_MARGIN - baseTop,
    maxAllowedDy: viewportHeight - DRAG_MARGIN - rect.height - baseTop
  };
};

const getRelativePosition = (
  dx: number,
  dy: number,
  bounds: NonNullable<ReturnType<typeof getDragBounds>>
): Pick<DraggableElementPosition, "xRatio" | "yRatio"> => {
  const rangeX = bounds.maxAllowedDx - bounds.minAllowedDx;
  const rangeY = bounds.maxAllowedDy - bounds.minAllowedDy;

  return {
    xRatio: rangeX > 0 ? clamp01((dx - bounds.minAllowedDx) / rangeX) : 0,
    yRatio: rangeY > 0 ? clamp01((dy - bounds.minAllowedDy) / rangeY) : 0
  };
};

const getPositionFromRelative = (
  bounds: NonNullable<ReturnType<typeof getDragBounds>>,
  xRatio: number,
  yRatio: number
) => {
  const rangeX = bounds.maxAllowedDx - bounds.minAllowedDx;
  const rangeY = bounds.maxAllowedDy - bounds.minAllowedDy;

  return {
    x:
      rangeX > 0
        ? bounds.minAllowedDx + clamp01(xRatio) * rangeX
        : bounds.maxAllowedDx,
    y:
      rangeY > 0
        ? bounds.minAllowedDy + clamp01(yRatio) * rangeY
        : bounds.maxAllowedDy
  };
};

@observer
class FeatureInfoPanel extends Component<Props> {
  pickedFeaturesReactionDisposer?: IReactionDisposer = undefined;
  chartJsAccumulateReactionDisposer?: IReactionDisposer = undefined;
  panelStateReactionDisposer?: IReactionDisposer = undefined;
  panelVisibilityReactionDisposer?: IReactionDisposer = undefined;
  panelCollapsedReactionDisposer?: IReactionDisposer = undefined;
  panelWrapperRef = createRef<HTMLDivElement>();
  panelResizeObserver?: ResizeObserver = undefined;
  panelResizeTimeout?: ReturnType<typeof setTimeout> = undefined;
  panelSyncFrame?: number = undefined;
  windowResizeFrame?: number = undefined;

  constructor(props: Props) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    const { t } = this.props;
    const terria = this.props.viewState.terria;

    this.pickedFeaturesReactionDisposer = reaction(
      () => terria.pickedFeatures,
      (pickedFeatures) => {
        if (!isDefined(pickedFeatures)) {
          terria.selectedFeature = undefined;
        } else {
          terria.selectedFeature = TerriaFeature.fromEntity(
            new Entity({
              id: t("featureInfo.pickLocation"),
              position: pickedFeatures.pickPosition
            })
          );
          if (isDefined(pickedFeatures.allFeaturesAvailablePromise)) {
            pickedFeatures.allFeaturesAvailablePromise.then(() => {
              if (this.props.viewState.featureInfoPanelIsVisible === false) {
                // Panel is closed, refrain from setting selectedFeature
                return;
              }

              // We only show features that are associated with a catalog item, so make sure the one we select to be
              // open initially is one we're actually going to show.
              const featuresShownAtAll = pickedFeatures.features.filter((x) =>
                isDefined(determineCatalogItem(terria.workbench, x))
              );

              // Return if `terria.selectedFeatures` already showing a valid feature?
              if (
                featuresShownAtAll.some(
                  (feature) => feature === terria.selectedFeature
                )
              ) {
                return;
              }

              // Otherwise find first feature with data to show
              let selectedFeature = featuresShownAtAll.filter(
                (feature) =>
                  isDefined(feature.properties) ||
                  isDefined(feature.description)
              )[0];

              if (
                !isDefined(selectedFeature) &&
                featuresShownAtAll.length > 0
              ) {
                // Handles the case when no features have info - still want something to be open.
                selectedFeature = featuresShownAtAll[0];
              }

              runInAction(() => {
                terria.selectedFeature = selectedFeature;
              });
            });
          }
        }
      }
    );

    // When the interactive Chart.js renderer is enabled on a CSV layer,
    // automatically accumulate the clicked feature's time-series into the
    // non-blocking bottom dock so the map stays clickable and more points can
    // be added without re-opening a modal.
    this.chartJsAccumulateReactionDisposer = reaction(
      () => terria.selectedFeature,
      (feature) => {
        if (isDefined(feature)) {
          this.accumulateChartJsSeries(feature);
        }
      }
    );

    if (this.props.printView) {
      return;
    }

    this.panelStateReactionDisposer = reaction(
      () => terria.featureInfoPanelState,
      () => {
        this.syncPanelLayout();
      }
    );

    this.panelVisibilityReactionDisposer = reaction(
      () => this.props.viewState.featureInfoPanelIsVisible,
      () => {
        this.syncPanelLayout();
      }
    );

    this.panelCollapsedReactionDisposer = reaction(
      () => this.props.viewState.featureInfoPanelIsCollapsed,
      () => {
        this.syncPanelLayout();
      }
    );

    if (typeof ResizeObserver !== "undefined" && this.panelWrapperRef.current) {
      this.panelResizeObserver = new ResizeObserver(() => {
        if (this.panelResizeTimeout) {
          clearTimeout(this.panelResizeTimeout);
        }

        this.panelResizeTimeout = setTimeout(() => {
          this.savePanelState();
        }, RESIZE_SAVE_DEBOUNCE_MS);
      });
      this.panelResizeObserver.observe(this.panelWrapperRef.current);
    }

    window.addEventListener("resize", this.handleWindowResize);
    this.syncPanelLayout();
  }

  componentWillUnmount(): void {
    if (isDefined(this.pickedFeaturesReactionDisposer)) {
      this.pickedFeaturesReactionDisposer();
    }
    if (isDefined(this.chartJsAccumulateReactionDisposer)) {
      this.chartJsAccumulateReactionDisposer();
    }
    if (isDefined(this.panelStateReactionDisposer)) {
      this.panelStateReactionDisposer();
    }
    if (isDefined(this.panelVisibilityReactionDisposer)) {
      this.panelVisibilityReactionDisposer();
    }
    if (isDefined(this.panelCollapsedReactionDisposer)) {
      this.panelCollapsedReactionDisposer();
    }
    if (this.panelResizeObserver) {
      this.panelResizeObserver.disconnect();
    }
    if (this.panelResizeTimeout) {
      clearTimeout(this.panelResizeTimeout);
    }
    if (isDefined(this.panelSyncFrame)) {
      cancelAnimationFrame(this.panelSyncFrame);
    }
    if (isDefined(this.windowResizeFrame)) {
      cancelAnimationFrame(this.windowResizeFrame);
    }
    if (!this.props.printView) {
      window.removeEventListener("resize", this.handleWindowResize);
    }
  }

  renderFeatureInfoCatalogItems(
    catalogItems: MappableMixin.Instance[],
    featureMap: Map<string, TerriaFeature[]>
  ) {
    return catalogItems.map((catalogItem, _i) => {
      // From the pairs, select only those with this catalog item, and pull the features out of the pair objects.
      const features =
        (catalogItem.uniqueId
          ? featureMap.get(catalogItem.uniqueId)
          : undefined) ?? [];
      return (
        <FeatureInfoCatalogItem
          key={catalogItem.uniqueId}
          viewState={this.props.viewState}
          catalogItem={catalogItem}
          features={features}
          onToggleOpen={this.toggleOpenFeature}
          printView={this.props.printView}
        />
      );
    });
  }

  @action.bound
  close() {
    this.props.viewState.featureInfoPanelIsVisible = false;

    // give the close animation time to finish before unselecting, to avoid jumpiness
    setTimeout(
      action(() => {
        this.props.viewState.terria.pickedFeatures = undefined;
        this.props.viewState.terria.selectedFeature = undefined;
      }),
      200
    );
  }

  @action.bound
  toggleCollapsed() {
    this.props.viewState.featureInfoPanelIsCollapsed =
      !this.props.viewState.featureInfoPanelIsCollapsed;
  }

  @action.bound
  toggleOpenFeature(feature: TerriaFeature) {
    const terria = this.props.viewState.terria;
    if (feature === terria.selectedFeature) {
      terria.selectedFeature = undefined;
    } else {
      terria.selectedFeature = feature;
    }
  }

  /**
   * If the clicked feature belongs to a CSV layer with the interactive Chart.js
   * renderer enabled and has a time-series, normalise it to epoch-ms points and
   * add it to that layer's accumulation store (which de-dups by key and caps the
   * total). Fully guarded: never throws into the feature-info flow, and never
   * loops (adding to the store does not change `selectedFeature`).
   */
  accumulateChartJsSeries(feature: TerriaFeature) {
    try {
      const terria = this.props.viewState.terria;
      const parent = determineCatalogItem(terria.workbench, feature);
      if (
        !(parent instanceof CsvCatalogItem) ||
        parent.useChartJsTimeSeries !== true
      ) {
        return;
      }

      const style = parent.activeTableStyle;
      const timeColumn = style.timeColumn;
      const colorColumn = style.colorColumn;
      if (!isDefined(timeColumn) || !isDefined(colorColumn)) {
        return;
      }

      const rowIds = isTerriaFeatureData(feature.data)
        ? feature.data.rowIds ?? []
        : [];
      if (rowIds.length < 2) {
        return;
      }

      const dates = timeColumn.valuesAsDates.values;
      const numbers = colorColumn.valuesAsNumbers.values;

      const points: { x: number; y: number }[] = [];
      for (const rowId of rowIds) {
        const date = dates[rowId];
        const value = numbers[rowId];
        if (date === null || value === null || value === undefined) {
          continue;
        }
        const x = date.getTime();
        const y = Number(value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ x, y });
        }
      }
      if (points.length < 2) {
        return;
      }
      points.sort((a, b) => a.x - b.x);

      const featureId =
        feature.id !== undefined && feature.id !== null
          ? String(feature.id)
          : String(rowIds[0]);
      const key = `${parent.uniqueId ?? "csv"}:${featureId}`;

      const featureName =
        (typeof feature.name === "string" && feature.name) || undefined;
      const name = featureName || colorColumn.title;

      // Cycle the colourblind-safe palette by the current accumulated count so
      // each newly clicked station gets a distinct, distinguishable colour.
      const color = paletteColor(parent.accumulatedChartSeries.length);

      runInAction(() => {
        parent.addAccumulatedSeries({
          key,
          name,
          units: colorColumn.units,
          color,
          points
        });
      });
    } catch (e) {
      // Never break the feature-info panel on accumulation errors.
      console.warn("Failed to accumulate Chart.js time-series", e);
    }
  }

  getMessageForNoResults() {
    const { t } = this.props;
    if (this.props.viewState.terria.workbench.items.length > 0) {
      // feature info shows up becuase data has been added for the first time
      if (this.props.viewState.firstTimeAddingData) {
        runInAction(() => {
          this.props.viewState.firstTimeAddingData = false;
        });
        return t("featureInfo.clickMap");
      }
      // if clicking on somewhere that has no data
      return t("featureInfo.noDataAvailable");
    } else {
      return t("featureInfo.clickToAddData");
    }
  }

  addManualMarker(longitude: number, latitude: number) {
    const { t } = this.props;
    addMarker(this.props.viewState.terria, {
      name: t("featureInfo.userSelection"),
      location: {
        latitude: latitude,
        longitude: longitude
      }
    });
  }

  pinClicked(longitude: number, latitude: number) {
    if (!isMarkerVisible(this.props.viewState.terria)) {
      this.addManualMarker(longitude, latitude);
    } else {
      removeMarker(this.props.viewState.terria);
    }
  }

  filterIntervalsByFeature(
    catalogItem: TimeFilterMixin.Instance,
    feature: TerriaFeature
  ) {
    try {
      catalogItem.setTimeFilterFeature(
        feature,
        this.props.viewState.terria.pickedFeatures?.providerCoords
      );
    } catch (e) {
      this.props.viewState.terria.raiseErrorToUser(e);
    }
  }

  renderLocationItem(cartesianPosition: Cartesian3) {
    const cartographic =
      Ellipsoid.WGS84.cartesianToCartographic(cartesianPosition);
    if (cartographic === undefined) {
      return null;
    }
    const latitude = CesiumMath.toDegrees(cartographic.latitude);
    const longitude = CesiumMath.toDegrees(cartographic.longitude);
    const pretty = prettifyCoordinates(longitude, latitude);

    const that = this;
    const pinClicked = function () {
      that.pinClicked(longitude, latitude);
    };

    const locationButtonStyle = isMarkerVisible(this.props.viewState.terria)
      ? Styles.btnLocationSelected
      : Styles.btnLocation;

    return (
      <div className={Styles.location}>
        <span>Lat / Lon&nbsp;</span>
        <span>
          {pretty.latitude + ", " + pretty.longitude}
          {!this.props.printView && (
            <button
              type="button"
              onClick={pinClicked}
              className={locationButtonStyle}
            >
              <Icon glyph={Icon.GLYPHS.location} />
            </button>
          )}
        </span>
      </div>
    );
  }

  private isValidDragHandle(target: EventTarget | null): boolean {
    const wrapper = this.panelWrapperRef.current;
    if (!wrapper || !target) return false;

    const handle = wrapper.querySelector(".drag-handle");
    return handle
      ? handle === target || handle.contains(target as Node)
      : false;
  }

  private updatePanelPosition(dx: number, dy: number) {
    const wrapper = this.panelWrapperRef.current;
    if (!wrapper) return;

    wrapper.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  private constrainToBounds() {
    const wrapper = this.panelWrapperRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const { x: currentDx, y: currentDy } = parseTranslate(
      wrapper.style.transform
    );
    const bounds = getDragBounds(wrapper, currentDx, currentDy);
    if (!bounds) return;

    const constrainedDx = Math.min(
      Math.max(currentDx, bounds.minAllowedDx),
      bounds.maxAllowedDx
    );
    const constrainedDy = Math.min(
      Math.max(currentDy, bounds.minAllowedDy),
      bounds.maxAllowedDy
    );

    this.updatePanelPosition(constrainedDx, constrainedDy);
  }

  private setPanelPosition(
    dx: number,
    dy: number,
    clampToBounds: boolean = false
  ) {
    this.updatePanelPosition(dx, dy);
    if (clampToBounds) {
      this.constrainToBounds();
    }
  }

  private resetPanelLayout() {
    const wrapper = this.panelWrapperRef.current;
    if (!wrapper) return;

    wrapper.style.transform = "";
    wrapper.style.width = "";
    wrapper.style.height = "";
  }

  private savePanelState() {
    const wrapper = this.panelWrapperRef.current;
    const { viewState } = this.props;
    const currentState = viewState.terria.featureInfoPanelState;

    if (
      !wrapper ||
      this.props.printView ||
      !viewState.featureInfoPanelIsVisible
    ) {
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const { x, y } = parseTranslate(wrapper.style.transform);
    const bounds = getDragBounds(wrapper, x, y);
    const position: DraggableElementPosition = {
      x,
      y,
      ...(bounds ? getRelativePosition(x, y, bounds) : {})
    };

    const dimensions: DraggableElementDimensions | undefined =
      viewState.featureInfoPanelIsCollapsed
        ? currentState?.dimensions
        : {
            width: rect.width,
            height: rect.height
          };

    const nextState: FeatureInfoPanelState = {
      position,
      ...(dimensions ? { dimensions } : {})
    };

    runInAction(() => {
      viewState.terria.featureInfoPanelState = nextState;
    });
  }

  private applyStoredPanelState(state: FeatureInfoPanelState) {
    const wrapper = this.panelWrapperRef.current;
    if (!wrapper) return;

    if (state.dimensions) {
      wrapper.style.width = `${state.dimensions.width}px`;
      wrapper.style.height = this.props.viewState.featureInfoPanelIsCollapsed
        ? ""
        : `${state.dimensions.height}px`;
    } else {
      wrapper.style.width = "";
      wrapper.style.height = "";
    }

    const currentPosition = parseTranslate(wrapper.style.transform);
    const bounds = getDragBounds(wrapper, currentPosition.x, currentPosition.y);

    if (
      bounds &&
      isFiniteNumber(state.position?.xRatio) &&
      isFiniteNumber(state.position?.yRatio)
    ) {
      const nextPosition = getPositionFromRelative(
        bounds,
        state.position.xRatio,
        state.position.yRatio
      );
      this.setPanelPosition(nextPosition.x, nextPosition.y, true);
      return;
    }

    if (
      isFiniteNumber(state.position?.x) &&
      isFiniteNumber(state.position?.y)
    ) {
      this.setPanelPosition(state.position.x, state.position.y, true);
      return;
    }

    this.constrainToBounds();
  }

  private syncPanelLayout() {
    if (this.props.printView) return;

    if (isDefined(this.panelSyncFrame)) {
      cancelAnimationFrame(this.panelSyncFrame);
    }

    this.panelSyncFrame = requestAnimationFrame(() => {
      const wrapper = this.panelWrapperRef.current;
      if (!wrapper || !this.props.viewState.featureInfoPanelIsVisible) {
        return;
      }

      const panelState = this.props.viewState.terria.featureInfoPanelState;
      if (panelState) {
        this.applyStoredPanelState(panelState);
      } else {
        this.resetPanelLayout();
        this.savePanelState();
      }
    });
  }

  private handleWindowResize = () => {
    if (this.props.printView) return;

    if (isDefined(this.windowResizeFrame)) {
      cancelAnimationFrame(this.windowResizeFrame);
    }

    this.windowResizeFrame = requestAnimationFrame(() => {
      const wrapper = this.panelWrapperRef.current;
      const panelState = this.props.viewState.terria.featureInfoPanelState;

      if (
        !wrapper ||
        !this.props.viewState.featureInfoPanelIsVisible ||
        !panelState
      ) {
        return;
      }

      const currentPosition = parseTranslate(wrapper.style.transform);
      const bounds = getDragBounds(
        wrapper,
        currentPosition.x,
        currentPosition.y
      );

      if (
        bounds &&
        isFiniteNumber(panelState.position?.xRatio) &&
        isFiniteNumber(panelState.position?.yRatio)
      ) {
        const nextPosition = getPositionFromRelative(
          bounds,
          panelState.position.xRatio,
          panelState.position.yRatio
        );
        this.setPanelPosition(nextPosition.x, nextPosition.y, true);
      } else {
        this.constrainToBounds();
      }

      this.savePanelState();
    });
  };

  private startDrag(clientX: number, clientY: number) {
    const wrapper = this.panelWrapperRef.current;
    if (!wrapper) return;

    const elementRect = wrapper.getBoundingClientRect();
    if (!elementRect.width || !elementRect.height) return;

    const offsetX = clientX - elementRect.left;
    const offsetY = clientY - elementRect.top;
    const initialPosition = parseTranslate(wrapper.style.transform);

    const moveHandler = (nextClientX: number, nextClientY: number) => {
      const dx = nextClientX - elementRect.left - offsetX + initialPosition.x;
      const dy = nextClientY - elementRect.top - offsetY + initialPosition.y;
      this.updatePanelPosition(dx, dy);
    };

    const endHandler = () => {
      this.constrainToBounds();
      this.savePanelState();
    };

    return { moveHandler, endHandler };
  }

  private handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!this.isValidDragHandle(e.target)) return;

    const dragResult = this.startDrag(e.clientX, e.clientY);
    if (!dragResult) return;

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      dragResult.moveHandler(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      dragResult.endHandler();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  private handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!this.isValidDragHandle(e.target)) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dragResult = this.startDrag(touch.clientX, touch.clientY);
    if (!dragResult) return;

    const handleTouchMove = (moveEvent: globalThis.TouchEvent) => {
      const nextTouch = moveEvent.touches[0];
      if (!nextTouch) return;
      dragResult.moveHandler(nextTouch.clientX, nextTouch.clientY);
    };

    const handleTouchEnd = () => {
      dragResult.endHandler();
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };

    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);
  };

  render() {
    const { t } = this.props;
    const terria = this.props.viewState.terria;
    const viewState = this.props.viewState;

    const { catalogItems, featureMap } = getFeatureMapByCatalogItems(
      this.props.viewState.terria
    );

    const featureInfoCatalogItems = this.renderFeatureInfoCatalogItems(
      catalogItems,
      featureMap
    );
    const panelClassName = classNames(Styles.panel, {
      [Styles.isCollapsed]: viewState.featureInfoPanelIsCollapsed,
      [Styles.isVisible]: viewState.featureInfoPanelIsVisible,
      [Styles.isTranslucent]: viewState.explorerPanelIsVisible
    });

    const filterableCatalogItems = catalogItems
      .filter(
        (catalogItem) =>
          TimeFilterMixin.isMixedInto(catalogItem) &&
          catalogItem.canFilterTimeByFeature
      )
      .map((catalogItem) => {
        const features =
          (catalogItem.uniqueId
            ? featureMap.get(catalogItem.uniqueId)
            : undefined) ?? [];
        return {
          catalogItem: catalogItem,
          feature: isDefined(features[0]) ? features[0] : undefined
        };
      })
      .filter((pair) => isDefined(pair.feature));

    const clock = terria.timelineClock?.currentTime;

    let position = terria.selectedFeature?.position?.getValue(clock);

    if (
      position === undefined ||
      isNaN(position.x) ||
      isNaN(position.y) ||
      isNaN(position.z)
    ) {
      position = undefined;
    }

    if (!isDefined(position)) {
      position = terria.pickedFeatures?.pickPosition;
    }

    const locationElements = position ? (
      <li>{this.renderLocationItem(position)}</li>
    ) : null;

    const panelContent = (
      <div
        className={panelClassName}
        aria-hidden={!viewState.featureInfoPanelIsVisible}
      >
        {!this.props.printView && (
          <div className={Styles.header}>
            <div className={classNames("drag-handle", Styles.btnPanelHeading)}>
              <span>{t("featureInfo.panelHeading")}</span>
              <button
                type="button"
                onClick={this.toggleCollapsed}
                className={Styles.btnToggleFeature}
              >
                {this.props.viewState.featureInfoPanelIsCollapsed ? (
                  <Icon glyph={Icon.GLYPHS.closed} />
                ) : (
                  <Icon glyph={Icon.GLYPHS.opened} />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={this.close}
              className={Styles.btnCloseFeature}
              title={t("featureInfo.btnCloseFeature")}
            >
              <Icon glyph={Icon.GLYPHS.close} />
            </button>
          </div>
        )}
        <ul className={Styles.body}>
          {this.props.printView && locationElements}

          {!viewState.featureInfoPanelIsCollapsed &&
          viewState.featureInfoPanelIsVisible ? (
            isDefined(terria.pickedFeatures) &&
            terria.pickedFeatures.isLoading ? (
              <li>
                <Loader light />
              </li>
            ) : featureInfoCatalogItems.length === 0 ? (
              <li className={Styles.noResults}>
                {this.getMessageForNoResults()}
              </li>
            ) : (
              featureInfoCatalogItems
            )
          ) : null}

          {!this.props.printView && locationElements}
          {filterableCatalogItems.map((pair) =>
            TimeFilterMixin.isMixedInto(pair.catalogItem) && pair.feature ? (
              <button
                key={pair.catalogItem.uniqueId}
                type="button"
                onClick={this.filterIntervalsByFeature.bind(
                  this,
                  pair.catalogItem,
                  pair.feature
                )}
                className={Styles.satelliteSuggestionBtn}
              >
                {t("featureInfo.satelliteSuggestionBtn", {
                  catalogItemName: pair.catalogItem.name
                })}
              </button>
            ) : null
          )}
        </ul>
      </div>
    );

    if (this.props.printView) {
      return panelContent;
    }

    return (
      <div
        ref={this.panelWrapperRef}
        className={classNames(Styles.wrapper, {
          [Styles.wrapperExpanded]: !viewState.featureInfoPanelIsCollapsed,
          [Styles.wrapperVisible]: viewState.featureInfoPanelIsVisible
        })}
        onMouseDown={this.handleMouseDown}
        onTouchStart={this.handleTouchStart}
      >
        {panelContent}
      </div>
    );
  }
}

function getFeatureMapByCatalogItems(terria: Terria) {
  const featureMap = new Map<string, TerriaFeature[]>();
  const catalogItems = new Set<MappableMixin.Instance>();

  if (!isDefined(terria.pickedFeatures)) {
    return { featureMap, catalogItems: Array.from(catalogItems) };
  }

  terria.pickedFeatures.features.forEach((feature) => {
    const catalogItem = determineCatalogItem(terria.workbench, feature);
    if (catalogItem?.uniqueId) {
      catalogItems.add(catalogItem);
      if (featureMap.has(catalogItem.uniqueId)) {
        featureMap.get(catalogItem.uniqueId)?.push(feature);
      } else {
        featureMap.set(catalogItem.uniqueId, [feature]);
      }
    }
  });

  return { featureMap, catalogItems: Array.from(catalogItems) };
}

export function determineCatalogItem(
  workbench: Workbench,
  feature: TerriaFeature
) {
  if (
    MappableMixin.isMixedInto(feature._catalogItem) &&
    workbench.items.includes(feature._catalogItem)
  ) {
    return feature._catalogItem;
  }

  const items = flatten(workbench.items.map(recurseIntoMembers)).filter(
    MappableMixin.isMixedInto
  );
  return items.find((item) => featureBelongsToCatalogItem(feature, item));
}

function recurseIntoMembers(catalogItem: BaseModel): BaseModel[] {
  if (catalogItem instanceof CompositeCatalogItem) {
    return flatten(catalogItem.memberModels.map(recurseIntoMembers));
  }
  return [catalogItem];
}

export { FeatureInfoPanel };
export default withTranslation()(withViewState(FeatureInfoPanel));
