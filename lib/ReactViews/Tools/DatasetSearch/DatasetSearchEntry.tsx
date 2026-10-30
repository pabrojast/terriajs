import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import ViewState from "../../../ReactViewModels/ViewState";

export function openDatasetSearch(viewState: ViewState) {
  viewState.closeCatalog();
  viewState.openTool({
    toolName: "dataset-search",
    getToolComponent: () => import("./DatasetSearchTool").then((m) => m.default)
  });
}

const DatasetSearchEntry = observer(
  ({ viewState }: { viewState: ViewState }) => {
    const { t } = useTranslation();
    if (
      !viewState.terria.configParameters.dataAssistant?.enabled ||
      !viewState.terria.ckanSession
    )
      return null;
    return (
      <Container>
        <Entry type="button" onClick={() => openDatasetSearch(viewState)}>
          <strong>{t("datasetSearch.title")}</strong>
          <span>{t("datasetSearch.entryDescription")}</span>
        </Entry>
      </Container>
    );
  }
);
export default DatasetSearchEntry;

const Container = styled.div`
  padding: 12px 20px;
  background: white;
  flex-shrink: 0;
`;
const Entry = styled.button`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 18px;
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #9dbdc8;
  border-radius: 8px;
  background: #eef7fa;
  color: #17475a;
  text-align: left;
  cursor: pointer;
  font: inherit;
  &:focus-visible {
    outline: 3px solid #087ea4;
    outline-offset: 2px;
  }
`;
