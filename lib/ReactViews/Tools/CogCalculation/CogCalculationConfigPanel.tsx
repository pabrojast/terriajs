import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import { cogStatisticLabel } from "../../Workbench/Controls/cogStatisticHelp";
import {
  Action,
  Actions,
  Card,
  Details,
  Field,
  Grid,
  Heading,
  Hint,
  Stack
} from "./AnalysisUi";

const CogCalculationConfigPanel = observer(
  ({ vm }: { vm: CogCalculationViewModel }) => {
    const { t } = useTranslation();
    const tr = (key: string, options?: Record<string, unknown>) =>
      t(`models.cogCalculation.${key}`, options);
    return (
      <Stack>
        <Card>
          <Actions>
            <div style={{ flex: 1 }}>
              <Heading>{tr("areaReady")}</Heading>
              <Hint>{tr("vertices", { count: vm.drawnPoints.length })}</Hint>
            </div>
            <Action onClick={() => vm.editPolygon()}>{tr("redraw")}</Action>
          </Actions>
        </Card>
        <Field>
          {tr("layer")}
          <select
            value={vm.selectedItem?.uniqueId ?? ""}
            onChange={(e) => vm.setSelectedItem(e.target.value)}
          >
            {vm.cogItemsInWorkbench.map((item) => (
              <option key={item.uniqueId} value={item.uniqueId}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          {tr("statistic")}
          <select
            value={vm.selectedStatistic}
            onChange={(e) =>
              vm.setStatistic(e.target.value as typeof vm.selectedStatistic)
            }
          >
            {["mean", "min", "max", "sum", "count", "median", "stddev"].map(
              (key) => (
                <option key={key} value={key}>
                  {tr(`statistics.${key}`)}
                </option>
              )
            )}
          </select>
        </Field>
        <Hint>{tr("areaStatisticHelp")}</Hint>
        {vm.selectedTimeSeriesItem && (
          <Hint>
            {tr("bandHelp", {
              name: cogStatisticLabel(
                vm.selectedTimeSeriesItem.availableBands.find(
                  (band) => band.band === vm.selectedBand
                )?.name || String(vm.selectedBand)
              ),
              band: vm.selectedBand
            })}
          </Hint>
        )}
        {vm.isTimeSeries ? (
          <Grid>
            <Field>
              {tr("startDate")}
              <input
                type="date"
                value={vm.startDate ?? ""}
                max={vm.endDate}
                onChange={(e) =>
                  vm.setDateRange(e.target.value || undefined, vm.endDate)
                }
              />
            </Field>
            <Field>
              {tr("endDate")}
              <input
                type="date"
                value={vm.endDate ?? ""}
                min={vm.startDate}
                onChange={(e) =>
                  vm.setDateRange(vm.startDate, e.target.value || undefined)
                }
              />
            </Field>
          </Grid>
        ) : null}
        <Field>
          {tr("resolution")}
          <select
            value={
              vm.overviewLevel === undefined ? "auto" : String(vm.overviewLevel)
            }
            onChange={(e) =>
              vm.setOverviewLevel(
                e.target.value === "auto" ? undefined : Number(e.target.value)
              )
            }
          >
            <option value="auto">{tr("automatic")}</option>
            <option value="0">{tr("native")}</option>
          </select>
        </Field>
        <Hint>
          {tr(
            vm.overviewLevel === undefined ? "approximateHelp" : "nativeHelp"
          )}
        </Hint>
        <Details>
          <summary>{tr("advanced")}</summary>
          <Grid>
            <Field>
              {tr("band")}
              <input
                type="number"
                min={1}
                max={20}
                value={vm.selectedBand}
                onChange={(e) => vm.setBand(parseInt(e.target.value, 10) || 1)}
              />
            </Field>
            {vm.isTimeSeries ? (
              <Field>
                {tr("sampling")}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={vm.subsampleStep}
                  onChange={(e) =>
                    vm.setSubsampleStep(parseInt(e.target.value, 10) || 1)
                  }
                />
              </Field>
            ) : null}
          </Grid>
        </Details>
        {vm.isTimeSeries ? (
          <Card>
            <strong>
              {tr("estimate", { count: vm.estimatedWork.timeSteps })}
            </strong>
            <Hint>{tr("estimateHelp")}</Hint>
          </Card>
        ) : null}
        <Action
          $primary
          disabled={
            !vm.selectedItem ||
            !vm.polygon ||
            (vm.isTimeSeries && vm.estimatedWork.timeSteps === 0) ||
            !!(vm.startDate && vm.endDate && vm.startDate > vm.endDate)
          }
          onClick={() => vm.startCalculation()}
        >
          {tr("calculate")}
        </Action>
      </Stack>
    );
  }
);
export default CogCalculationConfigPanel;
