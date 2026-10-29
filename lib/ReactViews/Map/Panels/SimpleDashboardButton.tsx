import { observer } from "mobx-react";
import { runInAction } from "mobx";
import { useTranslation } from "react-i18next";
import { useViewState } from "../../Context";
import MobileMenuItem from "../../Mobile/MobileMenuItem";
import { tr } from "../../SimpleDashboard/text";
export default observer(function SimpleDashboardButton({
  smallScreen = false
}: {
  smallScreen?: boolean;
}) {
  useTranslation();
  const viewState = useViewState();
  if (!viewState.terria.configParameters.simpleDashboards?.enabled) return null;
  const open = () =>
    runInAction(() => {
      viewState.terria.simpleDashboardOpen = true;
      viewState.mobileMenuVisible = false;
    });
  return smallScreen ? (
    <MobileMenuItem>
      <MobileMenuItem.Button onClick={open}>
        {tr("title")}
      </MobileMenuItem.Button>
    </MobileMenuItem>
  ) : (
    <button
      type="button"
      onClick={open}
      style={{
        font: "inherit",
        padding: 8,
        color: "white",
        background: "#183c50",
        border: "1px solid #ffffff55",
        borderRadius: 5
      }}
    >
      {tr("title")}
    </button>
  );
});
