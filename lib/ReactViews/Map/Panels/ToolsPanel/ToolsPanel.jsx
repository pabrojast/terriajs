"use strict";

import { observer } from "mobx-react";
import { runInAction } from "mobx";
import styled from "styled-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import MenuPanel from "../../../StandardUserInterface/customizable/MenuPanel";
import { useViewState } from "../../../Context";
import DropdownStyles from "../panel.scss";
import CountDatasets from "./CountDatasets";
import Styles from "./tools-panel.scss";

const ToolsPanel = observer(() => {
  const [isOpen, setIsOpen] = useState(false);
  const [resultsMessage, setResultsMessage] = useState("");
  const dropdownTheme = {
    btn: Styles.btnShare,
    outer: Styles.toolsPanel,
    inner: Styles.dropdownInner,
    icon: "settings"
  };
  const { t } = useTranslation();
  const viewState = useViewState();
  const technicalTools = viewState.terria.userProperties.get("tools") === "1";
  const hasCog = viewState.terria.workbench.items.some(
    (item) => item.type === "cog" || item.type === "cog-time-series"
  );
  const activate = (id) => {
    setIsOpen(false);
    runInAction(() => {
      viewState.mobileMenuVisible = false;
    });
    viewState.terria.mapNavigationModel.findItem(id)?.controller.activate();
  };
  return (
    <MenuPanel
      theme={dropdownTheme}
      btnText={t("toolsPanel.btnText")}
      viewState={viewState}
      btnTitle={t("toolsPanel.btnTitle")}
      onOpenChanged={setIsOpen}
      isOpen={isOpen}
      smallScreen={viewState.useSmallScreenInterface}
    >
      <div>
        <ToolList>
          <ToolAction
            disabled={!hasCog}
            onClick={() => activate("cog-calculation-tool")}
          >
            {t("models.cogCalculation.title")}
          </ToolAction>
          {!hasCog && <p>{t("models.cogCalculation.addLayer")}</p>}
          <ToolAction onClick={() => activate("measure-tool")}>
            {t("measure.measureDistance")}
          </ToolAction>
        </ToolList>
        {isOpen && technicalTools && (
          <div className={DropdownStyles.section}>
            <div className={Styles.this}>
              <CountDatasets updateResults={setResultsMessage} />
            </div>
          </div>
        )}
        {technicalTools && (
          <div className={Styles.results}>
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: resultsMessage }} />
          </div>
        )}
      </div>
    </MenuPanel>
  );
});

export default ToolsPanel;

const ToolList = styled.div`
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  p {
    margin: 4px 8px 12px;
    color: ${(p) => p.theme.textLightDimmed};
    font-size: 12px;
  }
`;
const ToolAction = styled.button`
  background: transparent;
  color: ${(p) => p.theme.textLight};
  border: 0;
  border-radius: 4px;
  padding: 12px;
  min-height: 44px;
  text-align: left;
  font: inherit;
  cursor: pointer;
  &:hover:not(:disabled),
  &:focus-visible {
    background: ${(p) => p.theme.darkWithOverlay};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;
