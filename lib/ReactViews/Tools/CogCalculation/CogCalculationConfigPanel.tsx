import { periodInput } from "../../../Core/cogAnalysisPeriod";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import {
  Action,
  Actions,
  Card,
  Details,
  Field,
  Grid,
  Heading,
  Hint,
  Notice,
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
        {vm.isTimeSeries &&
          (vm.resolutions.length > 1 ? (
            <Field>
              {tr("temporalResolution")}
              <select
                value={vm.resolutionId ?? ""}
                onChange={(e) => vm.setResolution(e.target.value)}
              >
                {vm.resolutions.map((resolution) => (
                  <option key={resolution.id} value={resolution.id}>
                    {resolution.name ?? resolution.id}
                  </option>
                ))}
              </select>
              <Hint>{tr("syncedResolution")}</Hint>
            </Field>
          ) : (
            <Hint>
              {tr("temporalResolution")}: {vm.resolutionName}
            </Hint>
          ))}
        {vm.isLoadingResolution && (
          <Hint role="status">{tr("loadingResolution")}</Hint>
        )}
        {vm.resolutionError && (
          <Notice role="alert">
            {vm.resolutionError}
            <Action onClick={() => void vm.loadResolution()}>
              {tr("retryResolution")}
            </Action>
          </Notice>
        )}
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
        {vm.isTimeSeries ? (
          <>
            <Grid>
              <PeriodField vm={vm} />
              <PeriodField vm={vm} end />
            </Grid>
            {(vm.periodType === "monthly" || vm.periodType === "annual") && (
              <Hint>{tr("completePeriods")}</Hint>
            )}
          </>
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
              {vm.selectedTimeSeriesItem?.availableBands.length ? (
                <select
                  value={vm.selectedBand}
                  onChange={(e) => vm.setBand(Number(e.target.value))}
                >
                  {vm.selectedTimeSeriesItem.availableBands.map((b) => (
                    <option key={b.id} value={b.band}>
                      {b.name ?? b.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={vm.selectedBand}
                  onChange={(e) =>
                    vm.setBand(parseInt(e.target.value, 10) || 1)
                  }
                />
              )}
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
            <Hint>{vm.periodLabel}</Hint>
            <Hint>{tr("estimateHelp")}</Hint>
            {!vm.isLoadingResolution &&
              !vm.resolutionError &&
              vm.estimatedWork.timeSteps === 0 && (
                <Hint role="status">{tr("noDatesInPeriod")}</Hint>
              )}
          </Card>
        ) : null}
        <Action
          $primary
          disabled={
            vm.isLoadingResolution ||
            !!vm.resolutionError ||
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

const PeriodField = observer(
  ({ vm, end = false }: { vm: CogCalculationViewModel; end?: boolean }) => {
    const { t } = useTranslation();
    const value = periodInput(end ? vm.endDate : vm.startDate, vm.resolutionId);
    const update = (next: string) =>
      vm.setDateRange(
        end ? vm.startDate : next || undefined,
        end ? next || undefined : vm.endDate
      );
    const years = Array.from(
      new Set([...vm.availableYears, value].filter(Boolean))
    ).sort();
    return (
      <Field>
        {t(`models.cogCalculation.${end ? "endDate" : "startDate"}`)}
        {vm.periodType === "annual" ? (
          <select
            value={value}
            disabled={vm.isLoadingResolution}
            onChange={(e) => update(e.target.value)}
          >
            <option value="">{t("models.cogCalculation.allYears")}</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={vm.periodType === "monthly" ? "month" : "date"}
            value={value}
            disabled={vm.isLoadingResolution}
            min={end ? periodInput(vm.startDate, vm.resolutionId) : undefined}
            max={!end ? periodInput(vm.endDate, vm.resolutionId) : undefined}
            onChange={(e) => update(e.target.value)}
          />
        )}
      </Field>
    );
  }
);
