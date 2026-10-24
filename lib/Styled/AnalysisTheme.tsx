import { FC, ReactNode, useMemo } from "react";
import { ThemeProvider, useTheme } from "styled-components";

/** Keep analysis sizing/accessibility while inheriting Terria's configured colours. */
const AnalysisTheme: FC<{ children: ReactNode }> = ({ children }) => {
  const outer = useTheme();
  const theme = useMemo(() => ({ ...outer, analysisSurface: true }), [outer]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
export default AnalysisTheme;
