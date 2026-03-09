/**
 * CogCalculationConfigPanel — Configuration UI for the zonal calculation tool.
 *
 * Allows users to select: COG layer, band, statistic, date range, and overview level.
 */

import { observer } from "mobx-react";
import { useCallback } from "react";
import styled from "styled-components";
import CogCalculationViewModel from "../../../ReactViewModels/CogCalculationViewModel";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Select from "../../../Styled/Select";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";

const STATISTIC_OPTIONS = [
  { value: "mean", label: "Promedio (mean)" },
  { value: "min", label: "Mínimo" },
  { value: "max", label: "Máximo" },
  { value: "sum", label: "Suma" },
  { value: "count", label: "Conteo de píxeles" },
  { value: "median", label: "Mediana" },
  { value: "stddev", label: "Desviación estándar" }
];

interface Props {
  vm: CogCalculationViewModel;
}

const CogCalculationConfigPanel: React.FC<Props> = observer(({ vm }) => {
  const handleCalculate = useCallback(() => {
    vm.startCalculation();
  }, [vm]);

  const handleEditPolygon = useCallback(() => {
    vm.editPolygon();
  }, [vm]);

  return (
    <Container>
      <Text medium bold>
        Configuración del Cálculo
      </Text>
      <Spacing bottom={1} />

      {/* Layer Selector */}
      <FieldGroup>
        <Label>Capa COG:</Label>
        <Select
          value={vm.selectedItem ? (vm.selectedItem as any).uniqueId : ""}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            vm.setSelectedItem(e.target.value)
          }
        >
          {vm.cogItemsInWorkbench.map((item: any) => (
            <option key={item.uniqueId} value={item.uniqueId}>
              {item.name || item.uniqueId}
            </option>
          ))}
        </Select>
      </FieldGroup>

      {/* Band Selector */}
      <FieldGroup>
        <Label>Banda:</Label>
        <NumberInput
          type="number"
          min={1}
          max={20}
          value={vm.selectedBand}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            vm.setBand(parseInt(e.target.value, 10) || 1)
          }
        />
      </FieldGroup>

      {/* Statistic Selector */}
      <FieldGroup>
        <Label>Estadística:</Label>
        <Select
          value={vm.selectedStatistic}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            vm.setStatistic(e.target.value as any)
          }
        >
          {STATISTIC_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </FieldGroup>

      {/* Time Series Options */}
      {vm.isTimeSeries && (
        <>
          <Spacing bottom={1} />
          <Text small bold>
            Opciones de Serie de Tiempo
          </Text>
          <Spacing bottom={0.5} />

          <FieldGroup>
            <Label>Fecha inicio:</Label>
            <DateInput
              type="date"
              value={vm.startDate || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                vm.setDateRange(e.target.value || undefined, vm.endDate)
              }
            />
          </FieldGroup>

          <FieldGroup>
            <Label>Fecha fin:</Label>
            <DateInput
              type="date"
              value={vm.endDate || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                vm.setDateRange(vm.startDate, e.target.value || undefined)
              }
            />
          </FieldGroup>

          <FieldGroup>
            <Label>Cada N pasos:</Label>
            <NumberInput
              type="number"
              min={1}
              max={100}
              value={vm.subsampleStep}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                vm.setSubsampleStep(parseInt(e.target.value, 10) || 1)
              }
            />
          </FieldGroup>

          {/* Estimation */}
          <Spacing bottom={0.5} />
          <EstimateBox>
            <Text small>
              Se procesarán{" "}
              <Text as="span" bold>
                {vm.estimatedWork.timeSteps} pasos temporales
              </Text>{" "}
              ({vm.estimatedWork.totalCogs} COGs en total)
            </Text>
            {vm.estimatedWork.timeSteps > 30 && (
              <>
                <Spacing bottom={0.3} />
                <WarningText small>
                  ⚠️ Más de 30 pasos puede demorar significativamente. Considera
                  reducir el rango de fechas o aumentar el subsampling.
                </WarningText>
              </>
            )}
          </EstimateBox>
        </>
      )}

      {/* Polygon Info */}
      <Spacing bottom={1} />
      <Box gap>
        <Text small textLight>
          ✓ Polígono dibujado ({vm.drawnPoints.length} vértices)
        </Text>
        <Button
          secondary
          shortMinHeight
          onClick={handleEditPolygon}
          textProps={{ small: true }}
        >
          Redibujar
        </Button>
      </Box>

      {/* Action Buttons */}
      <Spacing bottom={1.5} />
      <Box gap>
        <Button
          primary
          fullWidth
          onClick={handleCalculate}
          textProps={{ medium: true }}
          disabled={!vm.selectedItem || !vm.polygon}
        >
          Calcular
        </Button>
      </Box>
    </Container>
  );
});

export default CogCalculationConfigPanel;

// ─── Styled Components ──────────────────────────────────────────

const Container = styled.div``;

const FieldGroup = styled.div`
  margin-bottom: 10px;
`;

const Label = styled(Text).attrs({
  small: true,
  textLight: true
})`
  margin-bottom: 4px;
`;

const NumberInput = styled.input`
  width: 80px;
  padding: 4px 8px;
  border: 1px solid ${(p) => p.theme.darkLighter};
  border-radius: 3px;
  background: ${(p) => p.theme.dark};
  color: ${(p) => p.theme.textLight};
  font-size: 13px;
`;

const DateInput = styled.input`
  padding: 4px 8px;
  border: 1px solid ${(p) => p.theme.darkLighter};
  border-radius: 3px;
  background: ${(p) => p.theme.dark};
  color: ${(p) => p.theme.textLight};
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;

  &::-webkit-calendar-picker-indicator {
    filter: invert(1);
  }
`;

const EstimateBox = styled.div`
  padding: 8px 10px;
  background: ${(p) => p.theme.darkLighter};
  border-radius: 4px;
`;

const WarningText = styled(Text)`
  color: #e67e22;
`;
