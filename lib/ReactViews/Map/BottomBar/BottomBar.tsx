import { VFC } from "react";
import Box from "../../../Styled/Box";
import { useViewState } from "../../Context";
import { MapCredits } from "./Credits";
import { DistanceLegend } from "./DistanceLegend";
import { LocationBar } from "./LocationBar";
import { useTheme } from "styled-components";
import parseCustomHtmlToReact from "../../Custom/parseCustomHtmlToReact";

export const BottomBar: VFC = () => {
  const viewState = useViewState();
  const theme = useTheme();
  const baseMap = viewState.terria.mainViewer.baseMap as any;
  const isSentinelCloudless =
    baseMap?.uniqueId === "s2cloudless-2024" ||
    (typeof baseMap?.name === "string" &&
      baseMap.name.toLowerCase().includes("sentinel-2 cloudless"));
  const sentinelAttribution: string | undefined = baseMap?.attribution;
  return (
    <>
      {isSentinelCloudless && !!sentinelAttribution && (
        <Box
          fullWidth
          css={`
            background: ${theme.transparentDark};
            backdrop-filter: ${theme.blur};
            font-size: 0.7rem;
          `}
        >
          <Box paddedHorizontally={4} paddedVertically={2} gap={2}>
            <span>{parseCustomHtmlToReact(sentinelAttribution)}</span>
          </Box>
        </Box>
      )}
      <Box
        fullWidth
        justifySpaceBetween
        css={`
          background: ${theme.transparentDark};
          backdrop-filter: ${theme.blur};
          font-size: 0.7rem;
        `}
      >
        <MapCredits
          hideTerriaLogo={!!viewState.terria.configParameters.hideTerriaLogo}
          credits={viewState.terria.configParameters.extraCreditLinks?.slice()}
          currentViewer={viewState.terria.mainViewer.currentViewer}
        />
        <Box paddedHorizontally={4} gap={2}>
          <LocationBar
            mouseCoords={viewState.terria.currentViewer.mouseCoords}
          />
          <DistanceLegend />
        </Box>
      </Box>
    </>
  );
};
