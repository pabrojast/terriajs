import { FC, ReactNode, useMemo } from "react";
import { ThemeProvider, useTheme } from "styled-components";

export const analysisColors = {
  surface: "#FFFFFF",
  muted: "#F4F7FA",
  ink: "#1F2937",
  secondary: "#536579",
  accent: "#0F6B82",
  border: "#DCE4EB"
};

/** Local light surfaces; the map and other workflows retain the app theme. */
const AnalysisTheme: FC<{ children: ReactNode }> = ({ children }) => {
  const outer = useTheme();
  const theme = useMemo(
    () => ({
      ...outer,
      analysisSurface: true,
      colorPrimary: analysisColors.accent,
      textLight: analysisColors.ink,
      textLightDimmed: analysisColors.secondary,
      textDark: analysisColors.ink,
      textDarker: analysisColors.ink,
      dark: analysisColors.surface,
      darkLighter: analysisColors.muted,
      darkWithOverlay: analysisColors.muted,
      transparentDark: analysisColors.surface,
      overlay: "rgba(15,107,130,0.08)",
      modalBg: analysisColors.surface,
      modalText: analysisColors.ink,
      gridColor: "#E5EBF0",
      scrollbarColor: "#AABAC7",
      scrollbarTrackColor: analysisColors.muted
    }),
    [outer]
  );
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

export default AnalysisTheme;
