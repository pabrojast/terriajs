import { observer } from "mobx-react";
import { runInAction } from "mobx";
import { useTranslation } from "react-i18next";
import { useViewState } from "../../Context";
import MobileMenuItem from "../../Mobile/MobileMenuItem";
import { tr } from "../../SimpleDashboard/text";
import Styles from "../MenuBar/menu-bar.scss";
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
      viewState.terria.simpleDashboardOpen =
        !viewState.terria.simpleDashboardOpen;
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
      className={Styles.dataBtn}
      aria-expanded={viewState.terria.simpleDashboardOpen}
    >
      <span>{tr("title")}</span>
    </button>
  );
});
