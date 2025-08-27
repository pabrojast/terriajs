import { observer } from "mobx-react";
import { FC } from "react";
import styled from "styled-components";
import MappableMixin from "../../../../ModelMixins/MappableMixin";
import Terria from "../../../../Models/Terria";
import Box from "../../../../Styled/Box";
import parseCustomHtmlToReact from "../../../Custom/parseCustomHtmlToReact";
import { useViewState } from "../../../Context";

interface ISentinelCreditOverlayProps {
  terria: Terria;
}

interface AttributionOverlayContainerProps {
  $isMapFullScreen: boolean;
}

const AttributionOverlayContainer = styled(Box).attrs(() => ({
  position: "absolute",
  styledHeight: "30px",
  styledMaxHeight: "30px",
  verticalCenter: true,
  gap: true
}))<AttributionOverlayContainerProps>`
  bottom: 38px; /* Reduced spacing from the bottom bar */
  left: 0;
  /* Adjust right positioning based on whether sidebar is visible */
  right: ${(props) => (props.$isMapFullScreen ? "25%" : "45%")};
  background: ${(props) => props.theme.transparentDark};
  backdrop-filter: ${(props) => props.theme.blur};
  font-size: 0.7rem;
  color: ${(props) => props.theme.textLight};
  pointer-events: none; /* Allow clicks to pass through */
  z-index: 101; /* Higher than bottom bar to ensure visibility */
  padding: 4px 8px; /* Vertical and horizontal padding */
  white-space: nowrap; /* Force single line */
  overflow: hidden; /* Hide overflow if text is too long */
  text-overflow: ellipsis; /* Add ellipsis if text is truncated */
  display: flex;
  align-items: center;

  /* Responsive adjustments for better mobile experience */
  @media (max-width: 768px) {
    right: ${(props) =>
      props.$isMapFullScreen ? "10%" : "15%"}; /* Use more width on mobile */
    font-size: 0.6rem; /* Slightly smaller text on mobile */
  }

  @media (max-width: 480px) {
    right: ${(props) =>
      props.$isMapFullScreen
        ? "5%"
        : "10%"}; /* Use almost full width on very small screens */
    font-size: 0.55rem; /* Even smaller text on very small screens */
    padding: 3px 6px; /* Reduce padding to save space */
  }

  a {
    color: ${(props) => props.theme.textLight};
    text-decoration: underline;
    pointer-events: auto; /* Re-enable clicks for links */
    white-space: nowrap; /* Keep links on single line too */
    display: inline; /* Use inline for links within the flex container */
  }
`;

export const SentinelCreditOverlay: FC<ISentinelCreditOverlayProps> = observer(
  ({ terria }) => {
    const viewState = useViewState();

    // Check if the current basemap needs attribution overlay
    const baseMap = terria.mainViewer.baseMap;

    // Check if it's a mappable item and needs attribution overlay
    if (baseMap && MappableMixin.isMixedInto(baseMap)) {
      // Check for Sentinel-2 cloudless basemap
      const isSentinel2Cloudless =
        baseMap.uniqueId === "s2cloudless-2024" ||
        // Check if it's a WMS with the specific layer
        (baseMap as any).layers === "s2cloudless-2024" ||
        // Check various ID properties
        (baseMap as any).id === "s2cloudless-2024" ||
        // Check by name (case insensitive)
        ((baseMap as any).name &&
          (baseMap as any).name
            .toLowerCase()
            .includes("sentinel-2 cloudless")) ||
        // Check if layers includes the sentinel layer (for comma-separated layers)
        ((baseMap as any).layers?.includes &&
          (baseMap as any).layers.includes("s2cloudless-2024")) ||
        // Check URL for EOX sentinel service
        ((baseMap as any).url &&
          (baseMap as any).url.includes("tiles.maps.eox.at") &&
          (baseMap as any).layers?.includes &&
          (baseMap as any).layers.includes("s2cloudless"));

      // Check for OpenStreetMap (EOX) WMTS basemap
      const isOpenStreetMapEOX =
        (baseMap as any).id === "osm-eox-wmts" ||
        baseMap.uniqueId === "osm-eox-wmts" ||
        // Check if it's a WMTS with the specific layer
        ((baseMap as any).layer === "osm_3857" &&
          (baseMap as any).url &&
          (baseMap as any).url.includes("tiles.maps.eox.at")) ||
        // Check by name (case insensitive)
        ((baseMap as any).name &&
          (baseMap as any).name.toLowerCase().includes("openstreetmap") &&
          (baseMap as any).name.toLowerCase().includes("eox"));

      // Show overlay if it's either Sentinel-2 cloudless or OpenStreetMap (EOX)
      if (isSentinel2Cloudless || isOpenStreetMapEOX) {
        // Get the attribution from the basemap
        const attribution = baseMap.attribution;

        if (attribution) {
          return (
            <AttributionOverlayContainer
              $isMapFullScreen={viewState.isMapFullScreen}
            >
              {parseCustomHtmlToReact(attribution)}
            </AttributionOverlayContainer>
          );
        }
      }
    }

    // Don't render anything if it doesn't need attribution overlay
    return null;
  }
);
