import { observer } from "mobx-react";
import { runInAction } from "mobx";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useViewState } from "../../Context";
import MobileMenuItem from "../../Mobile/MobileMenuItem";

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
      <Button type="button" onClick={open} title={title}>
        {t("dataAssistant.title")}
      </Button>
    );
  }
);
export default DataAssistantButton;
const Button = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 5px;
  color: ${(p) => p.theme.textLight};
  background: ${(p) => p.theme.dark};
  cursor: pointer;
  padding: 8px;
  font: inherit;
  &:focus-visible {
    outline: 2px solid #50d8ff;
  }
`;
