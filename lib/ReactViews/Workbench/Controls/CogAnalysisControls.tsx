import { observer } from "mobx-react";
import { runInAction } from "mobx";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import CogTimeSeriesCatalogItem from "../../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import { BaseModel } from "../../../Models/Definition/Model";
import ViewState from "../../../ReactViewModels/ViewState";
import openCogCalculationTool from "../../Tools/CogCalculation/openCogCalculationTool";

export default observer(function CogAnalysisControls({
  item,
  viewState
}: {
  item: BaseModel;
  viewState: ViewState;
}) {
  const { t } = useTranslation();
  if (item.type !== "cog" && item.type !== "cog-time-series") return null;
  return (
    <Actions>
      <button
        type="button"
        data-area-launcher
        onClick={() => openCogCalculationTool(viewState, item.uniqueId)}
      >
        {t("models.cogCalculation.drawAndCalculate")}
      </button>
      {item instanceof CogTimeSeriesCatalogItem &&
        item.waterQuality?.dataUrl && (
          <button
            type="button"
            onClick={() =>
              runInAction(() => {
                viewState.terria.waterQualityPanelClosed = false;
                viewState.terria.simpleDashboardOpen = false;
                viewState.closeTool();
                if (viewState.useSmallScreenInterface)
                  viewState.switchMobileView(null);
              })
            }
          >
            {t("waterQuality.openPanel")}
          </button>
        )}
    </Actions>
  );
});

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 10px;
  button {
    border: 1px solid ${(p) => p.theme.colorPrimary};
    border-radius: 4px;
    color: ${(p) => p.theme.textLight};
    background: ${(p) => p.theme.darkLighter};
    font: inherit;
    font-size: 12px;
    padding: 8px 10px;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid ${(p) => p.theme.colorPrimary};
    outline-offset: 2px;
  }
`;
