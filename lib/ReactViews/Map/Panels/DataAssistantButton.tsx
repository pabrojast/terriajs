import { observer } from "mobx-react";
import { runInAction } from "mobx";
import { useTranslation } from "react-i18next";
import { useViewState } from "../../Context";
import MobileMenuItem from "../../Mobile/MobileMenuItem";
import Styles from "../MenuBar/menu-bar.scss";

const DataAssistantButton = observer(
  ({ smallScreen = false }: { smallScreen?: boolean }) => {
    const viewState = useViewState();
    const { t } = useTranslation();
    const { terria } = viewState;
    if (!terria.configParameters.dataAssistant?.enabled || !terria.ckanSession)
      return null;
    const open = () => {
      if (smallScreen)
        runInAction(() => {
          viewState.mobileMenuVisible = false;
        });
      if (!terria.ckanSession?.isAuthenticated) {
        terria.ckanSession?.openLogin();
        return;
      }
      viewState.openTool({
        toolName: "data-assistant",
        getToolComponent: () =>
          import("../../Tools/DataAssistant/DataAssistantTool").then(
            (m) => m.default
          )
      });
    };
    const title = terria.ckanSession.isAuthenticated
      ? t("dataAssistant.title")
      : t("dataAssistant.signIn");
    return smallScreen ? (
      <MobileMenuItem>
        <MobileMenuItem.Button onClick={open}>{title}</MobileMenuItem.Button>
      </MobileMenuItem>
    ) : (
      <button
        className={Styles.dataBtn}
        type="button"
        onClick={open}
        title={title}
      >
        <span>{t("dataAssistant.title")}</span>
      </button>
    );
  }
);
export default DataAssistantButton;
