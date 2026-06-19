import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { RawButton } from "../../../../Styled/Button";
import { ChartTableModel } from "./ChartJsTypes";

export interface ChartDataTableProps {
  model: ChartTableModel;
}

/** Number of rows rendered before the "show all" control appears. */
const INITIAL_ROWS = 500;

const TableContainer = styled.div`
  flex: 1;
  min-height: 0;
  max-height: 100%;
  overflow: auto;
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: ${(props) => props.theme.textLight};
  font-size: 12px;

  th,
  td {
    padding: 4px 8px;
    text-align: left;
    border-bottom: 1px solid ${(props) => props.theme.overlay};
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: ${(props) => props.theme.dark};
    font-weight: bold;
  }

  tbody tr:nth-child(even) {
    background-color: ${(props) => props.theme.overlay};
  }
`;

const EmptyState = styled.div`
  padding: 16px;
  color: ${(props) => props.theme.textLightDimmed};
  font-size: 13px;
`;

const ShowAllButton = styled(RawButton)`
  margin: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  color: ${(props) => props.theme.textLight};
  background-color: ${(props) => props.theme.overlay};
  &:hover,
  &:focus {
    opacity: 0.9;
  }
`;

/**
 * Presentational data table for the Chart.js chart. Renders rows as React text
 * nodes only (never `dangerouslySetInnerHTML`), with a sticky header, scroll
 * container and a row cap that the user can expand. No chart.js dependency.
 */
const ChartDataTable: FC<ChartDataTableProps> = ({ model }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  if (model.rows.length === 0) {
    return <EmptyState>{t("chart.noData")}</EmptyState>;
  }

  const visibleRows = showAll ? model.rows : model.rows.slice(0, INITIAL_ROWS);
  const hasMore = model.rows.length > visibleRows.length;

  return (
    <TableContainer>
      <StyledTable>
        <thead>
          <tr>
            {model.columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {model.columns.map((column, colIndex) => (
                <td key={column.key}>{row[colIndex]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </StyledTable>
      {hasMore && (
        <ShowAllButton type="button" onClick={() => setShowAll(true)}>
          {t("chart.showAllRows", { count: model.rows.length })}
        </ShowAllButton>
      )}
    </TableContainer>
  );
};

export default ChartDataTable;
