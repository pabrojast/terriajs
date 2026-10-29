import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import { cogStatisticLabel } from "../../Workbench/Controls/cogStatisticHelp";
import { Details, Hint } from "./AnalysisUi";

/** Disclose the input raster separately from the operation on the drawn area. */
export default observer(function CogCalculationSource({
  vm
}: {
  vm: CogCalculationViewModel;
}) {
  const { t } = useTranslation();
  const item = vm.selectedTimeSeriesItem;
  if (!item) return null;
  const mapBand =
    item.activeBand?.band ??
    item.activeResolution?.renderOptions?.single?.band ??
    item.renderOptions?.single?.band ??
    1;
  const band = item.availableBands.find(
    (band) => band.band === vm.selectedBand
  );
  return (
    <div>
      <Hint>
        {t(
          `models.cogCalculation.${vm.selectedBand === mapBand ? "usingMapValues" : "usingCustomValues"}`
        )}
      </Hint>
      <Details>
        <summary>{t("models.cogCalculation.inputDetails")}</summary>
        <Hint>
          {t("models.cogCalculation.bandHelp", {
            name: cogStatisticLabel(band?.name || String(vm.selectedBand)),
            band: vm.selectedBand
          })}
        </Hint>
      </Details>
    </div>
  );
});
