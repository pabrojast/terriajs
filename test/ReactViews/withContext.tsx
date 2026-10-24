import { render, RenderOptions } from "@testing-library/react";
import { ReactElement, ReactNode } from "react";
import { create, TestRendererOptions } from "react-test-renderer";
import { StyleSheetManager, ThemeProvider } from "styled-components";
import ViewState from "../../lib/ReactViewModels/ViewState";
import { ViewStateProvider } from "../../lib/ReactViews/Context/ViewStateContext";
import { terriaTheme } from "../../lib/ReactViews/StandardUserInterface";
import { shouldForwardProp } from "../../lib/Styled/shouldForwardProp";

/**
 * The styled-components half of `ContextProviders`, for specs that render a
 * component without the full app shell.
 */
export const TerriaThemeProvider = (props: { children: ReactNode }) => (
  <StyleSheetManager shouldForwardProp={shouldForwardProp}>
    <ThemeProvider theme={terriaTheme}>{props.children}</ThemeProvider>
  </StyleSheetManager>
);

export function withThemeContext(node: ReactNode) {
  return <TerriaThemeProvider>{node}</TerriaThemeProvider>;
}

/**
 * Fork (IHP-WINS): wrap a react node in viewState and theme providers using
 * react-test-renderer. Kept for fork specs that still use the test renderer;
 * new specs should use {@link renderWithContexts}.
 */
export function createWithContexts(
  viewState: ViewState,
  node: ReactNode,
  testRendererOptions?: TestRendererOptions
) {
  return create(
    <ViewStateProvider viewState={viewState}>
      <ThemeProvider theme={terriaTheme}>{node}</ThemeProvider>
    </ViewStateProvider>,
    testRendererOptions
  );
}

export function renderWithContexts(
  node: ReactElement,
  viewState: ViewState,
  renderOptions?: Omit<RenderOptions, "wrapper">
) {
  return render(node, {
    wrapper: ({ children }) => (
      <ViewStateProvider viewState={viewState}>
        <TerriaThemeProvider>{children}</TerriaThemeProvider>
      </ViewStateProvider>
    ),
    ...renderOptions
  });
}
