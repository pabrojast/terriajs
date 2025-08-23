import { observer } from "mobx-react";
import { FC } from "react";
import styled from "styled-components";
import MappableMixin from "../../../../ModelMixins/MappableMixin";
import Terria from "../../../../Models/Terria";
import Box from "../../../../Styled/Box";
import parseCustomHtmlToReact from "../../../Custom/parseCustomHtmlToReact";

interface ISentinelCreditOverlayProps {
  terria: Terria;
}

const SentinelCreditContainer = styled(Box).attrs(() => ({
  position: "absolute",
  fullWidth: true,
  paddedHorizontally: 2,
  paddedVertically: 1
}))`
  bottom: 30px; /* Just above the bottom bar which is typically 30px high */
  left: 0;
  background: ${(props) => props.theme.transparentDark};
  backdrop-filter: ${(props) => props.theme.blur};
  font-size: 0.7rem;
  color: ${(props) => props.theme.textLight};
  pointer-events: none; /* Allow clicks to pass through */
  z-index: 100;

  a {
    color: ${(props) => props.theme.textLight};
    text-decoration: underline;
    pointer-events: auto; /* Re-enable clicks for links */
  }
`;

export const SentinelCreditOverlay: FC<ISentinelCreditOverlayProps> = observer(
  ({ terria }) => {
    // Check if the current basemap is Sentinel-2 cloudless
    const baseMap = terria.mainViewer.baseMap;

    // Check if it's a mappable item and has the Sentinel-2 cloudless identifier
    if (baseMap && MappableMixin.isMixedInto(baseMap)) {
      // Multiple ways to identify the Sentinel-2 cloudless basemap
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

      if (isSentinel2Cloudless) {
        // Get the attribution from the basemap
        const attribution = baseMap.attribution;

        if (attribution) {
          return (
            <SentinelCreditContainer>
              {parseCustomHtmlToReact(attribution)}
            </SentinelCreditContainer>
          );
        }
      }
    }

    // Don't render anything if it's not the Sentinel-2 cloudless basemap
    return null;
  }
);
