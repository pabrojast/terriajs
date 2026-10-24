import { observer } from "mobx-react";
import { FC, useRef } from "react";
import { useTranslation } from "react-i18next";
import Box from "../../Styled/Box";
import ActionBarPortal from "../ActionBar/ActionBarPortal";
import BottomDock from "../BottomDock/BottomDock";
import { useViewState } from "../Context";
import Loader from "../Loader";
import SlideUpFadeIn from "../Transitions/SlideUpFadeIn/SlideUpFadeIn";
import { BottomBar } from "./BottomBar";
import BottomLeftBar from "./BottomLeftBar/BottomLeftBar";
import { MapNavigation } from "./MapNavigation";
import MenuBar from "./MenuBar/MenuBar";
import { ProgressBar } from "./ProgressBar";
import { TerriaViewerWrapper } from "./TerriaViewerWrapper";
import Toast from "./Toast";
import { BasemapCreditOverlay } from "./BottomBar/Credits/SentinelCreditOverlay";
import { useTheme } from "styled-components";
import WaterQualityPanel from "../WaterQuality/WaterQualityPanel";
import Legend from "../Workbench/Controls/Legend";
import MappableMixin from "../../ModelMixins/MappableMixin";
import hasTraits from "../../Models/Definition/hasTraits";
import LegendOwnerTraits from "../../Traits/TraitsClasses/LegendOwnerTraits";
import CatalogMemberTraits from "../../Traits/TraitsClasses/CatalogMemberTraits";

interface IMapColumnProps {
  animationDuration: number;
  customElements: any;
}

/**
 * Right-hand column that contains the map, controls that sit over the map and sometimes the bottom dock containing
 * the timeline and charts.
 */
export const MapColumn: FC<IMapColumnProps> = observer(
  ({ customElements, animationDuration }) => {
    const viewState = useViewState();
    const theme = useTheme();
    const { t } = useTranslation();
    const loaderRef = useRef(null);
    const narrative = viewState.terria.userProperties.get("narrative") === "1";

    return (
      <Box
        column
        fullWidth
        fullHeight
        css={`
          * {
            box-sizing: border-box;
          }
        `}
      >
        <Box column fullWidth fullHeight>
          <div
            css={{
              position: "absolute",
              top: "0",
              left: "0",
              zIndex: 1,
              width: "100%"
            }}
          >
            <ProgressBar />
          </div>
          {!viewState.hideMapUi && (
            <div
              css={`
                ${viewState.explorerPanelIsVisible && "opacity: 0.3;"}
              `}
            >
              {!narrative && (
                <MenuBar
                  menuItems={customElements.menu}
                  menuLeftItems={customElements.menuLeft}
                  animationDuration={animationDuration}
                  elementConfig={viewState.terria.elements.get("menu-bar")}
                />
              )}
              <MapNavigation
                viewState={viewState}
                navItems={customElements.nav}
                elementConfig={viewState.terria.elements.get("map-navigation")}
              />
            </div>
          )}
          <Box
            position="absolute"
            css={{ top: "0", zIndex: 0 }}
            fullWidth
            fullHeight
          >
            <TerriaViewerWrapper />
          </Box>
          {narrative && !viewState.hideMapUi && (
            <details
              aria-label="Map legend"
              css={`
                position: absolute;
                z-index: 11;
                left: 12px;
                top: 12px;
                max-width: 230px;
                max-height: 42%;
                overflow: auto;
                padding: 9px 12px;
                border-radius: 7px;
                background: ${theme.transparentDark};
                color: ${theme.textLight};
                font-size: 12px;
                summary {
                  cursor: pointer;
                  font-weight: 600;
                }
              `}
            >
              <summary>{t("legend.title", "Map legend")}</summary>
              {viewState.terria.workbench.items
                .filter(
                  (item) =>
                    MappableMixin.isMixedInto(item) &&
                    item.show &&
                    hasTraits(item, LegendOwnerTraits, "legends") &&
                    item.legends?.length
                )
                .map((item) => (
                  <div key={item.uniqueId}>
                    <strong>
                      {hasTraits(item, CatalogMemberTraits, "name")
                        ? item.name
                        : item.uniqueId}
                    </strong>
                    <Legend item={item} />
                  </div>
                ))}
            </details>
          )}
          {!viewState.hideMapUi && !viewState.explorerPanelIsVisible && (
            <WaterQualityPanel />
          )}
          {!viewState.hideMapUi && (
            <>
              <ActionBarPortal show={viewState.isActionBarVisible} />
              <SlideUpFadeIn
                isVisible={viewState.isMapZooming}
                nodeRef={loaderRef}
              >
                <Toast ref={loaderRef}>
                  <Loader
                    message={t("toast.mapIsZooming")}
                    textProps={{
                      style: {
                        padding: "0 5px"
                      }
                    }}
                  />
                </Toast>
              </SlideUpFadeIn>
              <div
                css={`
                  position: absolute;
                  margin-left: ${viewState.useSmallScreenInterface ||
                  viewState.terria.elements.get("show-workbench")?.visible ===
                    false
                    ? `0px`
                    : viewState.isMapFullScreen
                      ? `${theme.workbenchMargin}px`
                      : `calc(${theme.workbenchWidth}px + 2 * ${theme.workbenchMargin}px)`};
                  margin-right: ${viewState.useSmallScreenInterface ||
                  viewState.terria.elements.get("show-workbench")?.visible ===
                    false
                    ? `0px`
                    : `calc(34px + 2 *${theme.workbenchMargin}px)`};
                  bottom: ${viewState.useSmallScreenInterface ||
                  viewState.terria.elements.get("show-workbench")?.visible ===
                    false
                    ? `0px`
                    : `${theme.workbenchMargin}px`};
                  left: 0;
                  right: 0;
                `}
              >
                <BasemapCreditOverlay terria={viewState.terria} />
                <BottomLeftBar />
                <BottomDock
                  terria={viewState.terria}
                  viewState={viewState}
                  elementConfig={viewState.terria.elements.get("bottom-dock")}
                />
                <BottomBar />
              </div>

              {viewState.terria.configParameters.printDisclaimer && (
                <a
                  css={`
                    display: none;
                    @media print {
                      display: block;
                      width: 100%;
                      clear: both;
                    }
                  `}
                  href={viewState.terria.configParameters.printDisclaimer.url}
                >
                  {viewState.terria.configParameters.printDisclaimer.text}
                </a>
              )}
            </>
          )}
        </Box>
      </Box>
    );
  }
);

export default MapColumn;
