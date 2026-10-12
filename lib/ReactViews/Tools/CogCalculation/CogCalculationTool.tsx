/**
 * CogCalculationTool — Main React component for the COG Zonal Calculation tool.
 *
 * This is the tool opened via ToolButtonController. It orchestrates the
 * workflow: drawing polygon → configuring parameters → calculating → showing results.
 */

import { observer } from "mobx-react";
import { useEffect, useMemo } from "react";
import styled from "styled-components";
import { GLYPHS } from "../../../Styled/Icon";
import ViewState from "../../../ReactViewModels/ViewState";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import WorkflowPanel from "../../Workflow/WorkflowPanel";
import CogCalculationConfigPanel from "./CogCalculationConfigPanel";
import CogCalculationResultsPanel from "./CogCalculationResultsPanel";
import Text from "../../../Styled/Text";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Spacing from "../../../Styled/Spacing";

export const COG_CALCULATION_TOOL_ID = "cog-calculation-tool";

interface Props {
  viewState: ViewState;
}

const CogCalculationTool: React.FC<Props> = observer(({ viewState }) => {
  const vm = useMemo(() => new CogCalculationViewModel(viewState), [viewState]);

  useEffect(() => {
    return () => vm.dispose();
  }, [vm]);

  // Auto-start drawing on mount
  useEffect(() => {
    if (vm.hasCogItems) {
      vm.startDrawing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    vm.dispose();
    viewState.closeTool();
  };

  return (
    <WorkflowPanel
      viewState={viewState}
      title="COG Zonal Statistics"
      icon={GLYPHS.lineChart}
      onClose={handleClose}
    >
      <PanelContent>
        {!vm.hasCogItems && (
          <EmptyState>
            <Text medium>No COG layers on the workbench.</Text>
            <Spacing bottom={1} />
            <Text small textLight>
              Add a COG or COG Time Series layer to the map to use this tool.
            </Text>
          </EmptyState>
        )}

        {vm.phase === "drawing" && vm.hasCogItems && (
          <DrawingState>
            <Text medium>Draw a polygon on the map</Text>
            <Spacing bottom={1} />
            <Text small textLight>
              Click on the map to add vertices. Click the first point to close
              the polygon.
            </Text>
          </DrawingState>
        )}

        {vm.phase === "configuring" && <CogCalculationConfigPanel vm={vm} />}

        {vm.phase === "calculating" && (
          <CalculatingState>
            <Text medium>Calculating…</Text>
            <Spacing bottom={1} />
            {vm.progress && (
              <>
                <ProgressBar>
                  <ProgressFill
                    style={{ width: `${vm.progress.fraction * 100}%` }}
                  />
                </ProgressBar>
                <Spacing bottom={0.5} />
                <Text small textLight>
                  {vm.progress.completed} / {vm.progress.total} steps completed
                  {vm.progress.currentTime && ` — ${vm.progress.currentTime}`}
                </Text>
              </>
            )}
            <Spacing bottom={1} />
            <Button
              secondary
              onClick={() => vm.cancelCalculation()}
              textProps={{ small: true }}
            >
              Cancel
            </Button>
          </CalculatingState>
        )}

        {vm.phase === "results" && <CogCalculationResultsPanel vm={vm} />}

        {vm.phase === "error" && (
          <ErrorState>
            <ErrorText medium>Error</ErrorText>
            <Spacing bottom={0.5} />
            <Text small>{vm.error}</Text>
            <Spacing bottom={1} />
            <Button
              primary
              onClick={() => vm.startDrawing()}
              textProps={{ small: true }}
            >
              Try again
            </Button>
          </ErrorState>
        )}
      </PanelContent>
    </WorkflowPanel>
  );
});

export default CogCalculationTool;

// ─── Styled Components ──────────────────────────────────────────

const PanelContent = styled.div`
  padding: 15px;
  overflow-y: auto;
`;

const EmptyState = styled(Box).attrs({
  column: true,
  centered: true
})`
  padding: 30px 15px;
  text-align: center;
`;

const DrawingState = styled(Box).attrs({
  column: true
})`
  padding: 15px 0;
`;

const CalculatingState = styled(Box).attrs({
  column: true
})`
  padding: 15px 0;
`;

const ErrorState = styled(Box).attrs({
  column: true
})`
  padding: 15px 0;
`;

const ErrorText = styled(Text)`
  color: ${(p) => p.theme.colorSecondary};
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: ${(p) => p.theme.darkLighter};
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${(p) => p.theme.colorPrimary};
  border-radius: 4px;
  transition: width 0.3s ease;
`;
