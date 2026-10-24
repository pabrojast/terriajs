import { computed, makeObservable } from "mobx";
import ViewState from "../../../ReactViewModels/ViewState";
import { GLYPHS } from "../../../Styled/Icon";
import MapNavigationItemController from "../../../ViewModels/MapNavigation/MapNavigationItemController";
import { COG_CALCULATION_TOOL_ID } from "./CogCalculationTool";

/** One controller for the menu and map shortcut; active state follows the tool. */
export default class CogCalculationToolController extends MapNavigationItemController {
  constructor(private readonly viewState: ViewState) {
    super();
    makeObservable(this);
  }
  get glyph() {
    return GLYPHS.lineChart;
  }
  get viewerMode() {
    return undefined;
  }
  @computed get active() {
    return this.viewState.currentTool?.toolName === COG_CALCULATION_TOOL_ID;
  }
  activate() {
    const measure =
      this.viewState.terria.mapNavigationModel.findItem(
        "measure-tool"
      )?.controller;
    if (measure?.active) measure.deactivate();
    if (this.active) return;
    this.viewState.openTool({
      toolName: COG_CALCULATION_TOOL_ID,
      getToolComponent: () =>
        import("./CogCalculationTool").then((m) => m.default as any)
    });
  }
  deactivate() {
    if (this.active) this.viewState.closeTool();
  }
}
