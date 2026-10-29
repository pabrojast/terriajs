import { runInAction } from "mobx";
import ViewState from "../../../ReactViewModels/ViewState";

export default function openCogCalculationTool(
  viewState: ViewState,
  itemId?: string
) {
  runInAction(() => {
    viewState.terria.simpleDashboardOpen = false;
    viewState.mobileMenuVisible = false;
    if (viewState.useSmallScreenInterface) viewState.switchMobileView(null);
    viewState.openTool({
      toolName: "cog-calculation-tool",
      getToolComponent: () =>
        import("./CogCalculationTool").then((module) => module.default as any),
      params: { itemId }
    });
  });
}
