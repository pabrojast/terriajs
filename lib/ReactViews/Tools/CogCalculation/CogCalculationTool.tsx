import { observer } from "mobx-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Icon, { GLYPHS } from "../../../Styled/Icon";
import AnalysisTheme from "../../../Styled/AnalysisTheme";
import ViewState from "../../../ReactViewModels/ViewState";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import WorkflowPanel from "../../Workflow/WorkflowPanel";
import CogCalculationConfigPanel from "./CogCalculationConfigPanel";
import CogCalculationResultsPanel from "./CogCalculationResultsPanel";
import {
  Action,
  Actions,
  Card,
  Heading,
  Hint,
  Notice,
  Stack
} from "./AnalysisUi";

export const COG_CALCULATION_TOOL_ID = "cog-calculation-tool";
interface Props {
  viewState: ViewState;
  itemId?: string;
}

const CogCalculationTool: React.FC<Props> = observer(
  ({ viewState, itemId }) => {
    const { t } = useTranslation();
    const tr = (key: string, options?: Record<string, unknown>) =>
      t(`models.cogCalculation.${key}`, options);
    const vm = useMemo(
      () => new CogCalculationViewModel(viewState, itemId),
      [viewState, itemId]
    );
    const [expanded, setExpanded] = useState(false);
    const heading = useRef<HTMLHeadingElement>(null);
    const trigger = useRef(document.activeElement as HTMLElement | null);
    const mobile = viewState.useSmallScreenInterface;
    const drawing = vm.phase === "drawing";
    const step =
      drawing || vm.phase === "idle" ? 0 : vm.phase === "results" ? 2 : 1;

    useEffect(() => {
      if (vm.hasCogItems) vm.startDrawing();
      const opener = trigger.current;
      const onKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !document.querySelector('[role="dialog"][aria-modal="true"]')
        ) {
          event.preventDefault();
          viewState.closeTool();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      return () => {
        vm.dispose();
        document.removeEventListener("keydown", onKeyDown);
        if (opener?.isConnected) opener.focus();
        else
          document
            .querySelector<HTMLButtonElement>("[data-area-launcher] button")
            ?.focus();
      };
    }, [vm, viewState]);

    useEffect(() => {
      setExpanded(!drawing);
      heading.current?.focus();
    }, [drawing, vm.phase, viewState]);

    const content = (
      <Body>
        <Steps aria-label={tr("steps")}>
          {["areaStep", "settingsStep", "resultsStep"].map((key, index) => (
            <Step
              key={key}
              $active={index === step}
              aria-current={index === step ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {tr(key)}
            </Step>
          ))}
        </Steps>
        <Stack>
          {!vm.hasCogItems ? (
            <Card>
              <Heading>{tr("noLayers")}</Heading>
              <Hint>{tr("addLayer")}</Hint>
            </Card>
          ) : null}
          {drawing && vm.hasCogItems ? (
            <>
              <div>
                <Heading tabIndex={-1} ref={heading}>
                  {tr("drawTitle")}
                </Heading>
                <Hint>{tr("drawHelp")}</Hint>
              </div>
              <DrawingSummary role="status">
                <PolygonIcon aria-hidden="true">
                  <svg viewBox="0 0 48 48">
                    <path d="M10 33 16 10 38 17 33 38Z" />
                    <circle cx="16" cy="10" r="4" />
                    <circle cx="38" cy="17" r="3" />
                    <circle cx="33" cy="38" r="3" />
                    <circle cx="10" cy="33" r="3" />
                  </svg>
                </PolygonIcon>
                <div>
                  <strong>
                    {tr("vertices", { count: vm.drawnPoints.length })}
                  </strong>
                  <Hint>
                    {vm.canFinishDrawing
                      ? tr("readyToClose")
                      : tr("minimumVertices")}
                  </Hint>
                </div>
              </DrawingSummary>
              {vm.error ? <Notice role="alert">{vm.error}</Notice> : null}
              <Actions>
                <Action
                  disabled={!vm.drawnPoints.length}
                  onClick={() => vm.undoDrawing()}
                >
                  {tr("undo")}
                </Action>
                <Action
                  disabled={!vm.drawnPoints.length}
                  onClick={() => vm.startDrawing()}
                >
                  {tr("restart")}
                </Action>
                <Action
                  $primary
                  disabled={!vm.canFinishDrawing}
                  onClick={() => vm.finishDrawing()}
                >
                  {tr("closeArea")}
                </Action>
              </Actions>
            </>
          ) : null}
          {vm.phase === "configuring" ? (
            <CogCalculationConfigPanel vm={vm} />
          ) : null}
          {vm.phase === "calculating" ? (
            <>
              <Heading tabIndex={-1} ref={heading}>
                {tr("calculating")}
              </Heading>
              <Hint>{tr("calculationHelp")}</Hint>
              <Progress
                role="progressbar"
                aria-label={tr("calculating")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((vm.progress?.fraction ?? 0) * 100)}
              >
                <span
                  style={{ width: `${(vm.progress?.fraction ?? 0) * 100}%` }}
                />
              </Progress>
              <Hint role="status">
                {tr("progress", {
                  completed: vm.progress?.completed ?? 0,
                  total: vm.progress?.total ?? vm.estimatedWork.timeSteps
                })}
              </Hint>
              <Action onClick={() => vm.cancelCalculation()}>
                {tr("cancelCalculation")}
              </Action>
            </>
          ) : null}
          {vm.phase === "results" ? (
            <CogCalculationResultsPanel vm={vm} />
          ) : null}
          {vm.phase === "error" ? (
            <>
              <Notice role="alert">{vm.error}</Notice>
              <Action onClick={() => vm.cancelCalculation()}>
                {tr("backToSettings")}
              </Action>
            </>
          ) : null}
        </Stack>
      </Body>
    );

    return (
      <AnalysisTheme>
        {mobile ? (
          ReactDOM.createPortal(
            <MobileSheet
              role="region"
              aria-label={tr("title")}
              $expanded={expanded}
            >
              <MobileHeader>
                <Title>{tr("title")}</Title>
                <Action
                  aria-label={
                    expanded ? tr("collapsePanel") : tr("expandPanel")
                  }
                  aria-expanded={expanded}
                  onClick={() => setExpanded(!expanded)}
                >
                  <Icon glyph={expanded ? GLYPHS.collapse : GLYPHS.expand} />
                </Action>
                <Action
                  aria-label={tr("closeTool")}
                  onClick={() => viewState.closeTool()}
                >
                  <Icon glyph={GLYPHS.close} />
                </Action>
              </MobileHeader>
              {expanded || drawing ? (
                content
              ) : (
                <CompactActions>
                  <Hint>{vm.selectedItem?.name}</Hint>
                  <Action $primary onClick={() => setExpanded(true)}>
                    {tr(
                      vm.phase === "results" ? "resultsStep" : "settingsStep"
                    )}
                  </Action>
                </CompactActions>
              )}
            </MobileSheet>,
            document.body
          )
        ) : (
          <WorkflowPanel
            viewState={viewState}
            title={tr("title")}
            icon={GLYPHS.lineChart}
            appearance="analysis"
            closeButtonLabel={tr("closeTool")}
            onClose={() => viewState.closeTool()}
          >
            {content}
          </WorkflowPanel>
        )}
      </AnalysisTheme>
    );
  }
);
export default CogCalculationTool;

const Body = styled.div`
  padding: 18px;
  overflow-y: auto;
  min-height: 0;
  color: ${(p) => p.theme.textLight};
  @media (max-width: 767px) {
    padding: 12px 16px;
  }
`;
const Steps = styled.ol`
  display: flex;
  list-style: none;
  gap: 8px;
  padding: 0 0 18px;
  margin: 0;
  border-bottom: 1px solid ${(p) => p.theme.darkLighter};
  margin-bottom: 18px;
  @media (max-width: 767px) {
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
`;
const Step = styled.li<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: ${(p) => (p.$active ? 700 : 400)};
  color: ${(p) => (p.$active ? p.theme.colorPrimary : p.theme.textLightDimmed)};
  span {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: ${(p) =>
      p.$active ? p.theme.colorPrimary : p.theme.darkWithOverlay};
    color: ${(p) => (p.$active ? "white" : p.theme.textLightDimmed)};
  }
`;
const DrawingSummary = styled(Card)`
  display: flex;
  gap: 12px;
  align-items: center;
  strong {
    font-size: 14px;
  }
`;
const PolygonIcon = styled.div`
  flex: 0 0 44px;
  svg {
    width: 44px;
    height: 44px;
    overflow: visible;
  }
  path {
    fill: ${(p) => p.theme.darkWithOverlay};
    stroke: ${(p) => p.theme.colorPrimary};
    stroke-width: 2;
  }
  circle {
    fill: white;
    stroke: ${(p) => p.theme.colorPrimary};
    stroke-width: 2;
  }
`;
const Progress = styled.div`
  height: 8px;
  background: ${(p) => p.theme.darkWithOverlay};
  border-radius: 4px;
  overflow: hidden;
  span {
    display: block;
    height: 100%;
    background: ${(p) => p.theme.colorPrimary};
    transition: width 150ms;
  }
`;
const MobileSheet = styled.section<{ $expanded: boolean }>`
  position: fixed;
  z-index: 1000;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: ${(p) => (p.$expanded ? "70dvh" : "min(380px, 55dvh)")};
  display: flex;
  flex-direction: column;
  background: ${(p) => p.theme.dark};
  color: ${(p) => p.theme.textLight};
  border: 1px solid ${(p) => p.theme.darkLighter};
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -4px 24px rgba(31, 41, 55, 0.14);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  font-family: inherit;
  box-sizing: border-box;
`;
const MobileHeader = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid ${(p) => p.theme.darkLighter};
  flex-shrink: 0;
`;
const Title = styled.h2`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  flex: 1;
`;
const CompactActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  p {
    flex: 1;
    margin: 0;
  }
`;
