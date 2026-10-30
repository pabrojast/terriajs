import { observer } from "mobx-react";
import { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import ViewState from "../../../ReactViewModels/ViewState";
import { getDatasetSearch } from "../../../ReactViewModels/DatasetSearchViewModel";
import { getDataAssistant } from "../../../ReactViewModels/DataAssistantViewModel";
import WorkflowPanel from "../../Workflow/WorkflowPanel";
import Icon from "../../../Styled/Icon";

const DatasetSearchTool = observer(
  ({ viewState }: { viewState: ViewState }) => {
    const { t } = useTranslation();
    const vm = getDatasetSearch(viewState);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
      input.current?.focus();
      const close = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !vm.drawing) viewState.closeTool();
      };
      document.addEventListener("keydown", close);
      return () => {
        document.removeEventListener("keydown", close);
        vm.deactivate();
      };
    }, [vm, viewState]);
    const useInAssistant = () => {
      if (!vm.polygon || !vm.authenticated) return;
      getDataAssistant(viewState).useArea(vm.polygon);
      viewState.openTool({
        toolName: "data-assistant",
        getToolComponent: () =>
          import("../DataAssistant/DataAssistantTool").then((m) => m.default)
      });
    };
    const groups = new Map<string, NonNullable<typeof vm.result>["sources"]>();
    vm.result?.sources.forEach((source) => {
      const key = source.dataset_id ?? source.id;
      groups.set(key, [...(groups.get(key) ?? []), source]);
    });
    const content = (
      <Body>
        {!vm.authenticated ? (
          <>
            <p>{t("datasetSearch.signInDescription")}</p>
            <Button
              type="button"
              onClick={() => viewState.terria.ckanSession?.openLogin()}
            >
              {t("datasetSearch.signIn")}
            </Button>
          </>
        ) : vm.drawing ? (
          <>
            <p role="status">{t("datasetSearch.drawing")}</p>
            <Button type="button" onClick={vm.clearArea}>
              {t("datasetSearch.cancelDrawing")}
            </Button>
          </>
        ) : (
          <>
            <p>{t("datasetSearch.intro")}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void vm.search();
              }}
            >
              <label htmlFor="dataset-search-query">
                {t("datasetSearch.query")}
              </label>
              <input
                id="dataset-search-query"
                ref={input}
                value={vm.query}
                maxLength={500}
                placeholder={t("datasetSearch.placeholder")}
                onChange={(event) => vm.setFilter("query", event.target.value)}
              />
              <Area>
                {vm.polygon && (
                  <strong>{t("datasetSearch.areaSelected")}</strong>
                )}
                <Actions>
                  <Button
                    type="button"
                    disabled={vm.working}
                    onClick={vm.drawArea}
                  >
                    {t(
                      vm.polygon ? "datasetSearch.redraw" : "datasetSearch.draw"
                    )}
                  </Button>
                  {vm.polygon && (
                    <Button
                      type="button"
                      disabled={vm.loadingSource}
                      onClick={vm.clearArea}
                    >
                      {t("datasetSearch.clearArea")}
                    </Button>
                  )}
                </Actions>
              </Area>
              <details>
                <summary>{t("datasetSearch.filters")}</summary>
                <label htmlFor="dataset-search-format">
                  {t("dataAssistant.format")}
                </label>
                <select
                  id="dataset-search-format"
                  value={vm.format}
                  onChange={(event) =>
                    vm.setFilter("format", event.target.value)
                  }
                >
                  <option value="">{t("dataAssistant.allFormats")}</option>
                  {[
                    "CSV",
                    "GeoJSON",
                    "SHP",
                    "COG",
                    "TIF",
                    "WMS",
                    "WFS",
                    "KML"
                  ].map((format) => (
                    <option key={format}>{format}</option>
                  ))}
                </select>
                <label htmlFor="dataset-search-organization">
                  {t("dataAssistant.organization")}
                </label>
                <input
                  id="dataset-search-organization"
                  value={vm.organization}
                  maxLength={200}
                  onChange={(event) =>
                    vm.setFilter("organization", event.target.value)
                  }
                />
                <label htmlFor="dataset-search-tags">
                  {t("dataAssistant.tags")}
                </label>
                <input
                  id="dataset-search-tags"
                  value={vm.tags}
                  maxLength={1000}
                  onChange={(event) => vm.setFilter("tags", event.target.value)}
                />
              </details>
              <Button $primary type="submit" disabled={vm.working}>
                {t(
                  vm.polygon
                    ? "datasetSearch.searchArea"
                    : "datasetSearch.search"
                )}
              </Button>
            </form>
            {vm.searching && (
              <p role="status">{t("datasetSearch.searching")}</p>
            )}
            {vm.loadingSource && (
              <p role="status">{t("datasetSearch.loading")}</p>
            )}
            {vm.result && (
              <section
                aria-label={t("datasetSearch.results")}
                aria-live="polite"
              >
                <h3>
                  {t("datasetSearch.resultsCount", { count: groups.size })}
                </h3>
                {vm.result.spatial_basis && (
                  <p>
                    <small>{t("dataAssistant.coverageNotice")}</small>
                  </p>
                )}
                {!groups.size && (
                  <p>
                    {t(
                      vm.result.next_cursor
                        ? "datasetSearch.moreCandidates"
                        : "datasetSearch.noResults"
                    )}
                  </p>
                )}
                {[...groups.entries()].map(([id, sources]) => (
                  <Result key={id}>
                    <h4>{sources[0].dataset_title ?? sources[0].name}</h4>
                    {sources[0].organization && (
                      <small>{sources[0].organization}</small>
                    )}
                    {sources[0].dataset_id && (
                      <a
                        href={`/dataset/${encodeURIComponent(sources[0].dataset_id)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("datasetSearch.details")}
                      </a>
                    )}
                    {sources.map((source) => (
                      <Resource key={source.id}>
                        <p>
                          {source.name} · {source.format}
                        </p>
                        {source.resource_id && (
                          <>
                            {vm.mapSources.has(source.resource_id) ? (
                              vm.mapSources.get(source.resource_id)!.views
                                .length > 0 && (
                                <label>
                                  {t("dataAssistant.savedView")}
                                  <select
                                    value={
                                      vm.selectedViews.get(
                                        source.resource_id
                                      ) ?? ""
                                    }
                                    disabled={vm.loadingSource}
                                    onChange={(event) =>
                                      vm.setView(
                                        source.resource_id!,
                                        event.target.value
                                      )
                                    }
                                  >
                                    <option value="">
                                      {t("datasetSearch.defaultView")}
                                    </option>
                                    {vm.mapSources
                                      .get(source.resource_id)!
                                      .views.map((view) => (
                                        <option value={view.id} key={view.id}>
                                          {view.title}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                              )
                            ) : (
                              <Button
                                type="button"
                                disabled={vm.working}
                                onClick={() => void vm.inspect(source)}
                              >
                                {t("datasetSearch.views")}
                              </Button>
                            )}
                            <Button
                              $primary
                              type="button"
                              disabled={vm.working || vm.isAdded(source)}
                              onClick={() => void vm.add(source)}
                            >
                              {t(
                                vm.isAdded(source)
                                  ? "datasetSearch.added"
                                  : "datasetSearch.add"
                              )}
                            </Button>
                          </>
                        )}
                      </Resource>
                    ))}
                  </Result>
                ))}
                {vm.result.next_cursor && (
                  <Button
                    type="button"
                    disabled={vm.working}
                    onClick={() => void vm.search(true)}
                  >
                    {t("datasetSearch.more")}
                  </Button>
                )}
              </section>
            )}
            {vm.polygon && (
              <Button
                type="button"
                disabled={vm.working}
                onClick={useInAssistant}
              >
                {t("datasetSearch.useInAssistant")}
              </Button>
            )}
          </>
        )}
        {vm.error && <p role="alert">{vm.error}</p>}
        {!vm.drawing && (
          <Actions>
            <Button
              type="button"
              onClick={() => {
                viewState.closeTool();
                viewState.openAddData();
              }}
            >
              {t("datasetSearch.catalog")}
            </Button>
            {!viewState.terria.configParameters.disableUserAddedData && (
              <Button
                type="button"
                onClick={() => {
                  viewState.closeTool();
                  viewState.openUserData();
                }}
              >
                {t("datasetSearch.myData")}
              </Button>
            )}
          </Actions>
        )}
      </Body>
    );
    if (viewState.useSmallScreenInterface)
      return ReactDOM.createPortal(
        <Mobile
          $drawing={vm.drawing}
          role="region"
          aria-label={t("datasetSearch.title")}
        >
          <Header>
            <strong>{t("datasetSearch.title")}</strong>
            <Button
              type="button"
              aria-label={t("datasetSearch.close")}
              onClick={() => viewState.closeTool()}
            >
              ×
            </Button>
          </Header>
          {content}
        </Mobile>,
        document.body
      );
    return (
      <WorkflowPanel
        viewState={viewState}
        title={t("datasetSearch.title")}
        icon={Icon.GLYPHS.search}
        appearance="analysis"
        closeButtonLabel={t("datasetSearch.close")}
        onClose={() => viewState.closeTool()}
      >
        {content}
      </WorkflowPanel>
    );
  }
);
export default DatasetSearchTool;

const Body = styled.div`
  padding: 14px;
  color: #1f2937;
  background: #fff;
  font-size: 14px;
  line-height: 1.5;
  min-width: 0;
  overflow-wrap: anywhere;
  p {
    margin: 0 0 10px;
  }
  h3,
  h4 {
    font-size: 1em;
    margin: 8px 0;
  }
  label,
  small {
    display: block;
  }
  input,
  select {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;
    padding: 8px;
    border: 1px solid #9ca3af;
    border-radius: 5px;
    color: #1f2937;
    background: white;
    margin: 5px 0 12px;
    font: inherit;
  }
  details {
    margin: 10px 0;
  }
  summary {
    cursor: pointer;
  }
  small {
    color: #526174;
  }
  a {
    display: block;
    color: #086b85;
    text-decoration: underline;
  }
  [role="alert"] {
    background: #fff8e6;
    padding: 10px;
  }
`;
const Button = styled.button<{ $primary?: boolean }>`
  font: inherit;
  padding: 8px 10px;
  border: 1px solid #b7cbd3;
  border-radius: 6px;
  cursor: pointer;
  color: ${(p) => (p.$primary ? "white" : "#17475a")};
  background: ${(p) => (p.$primary ? "#086b85" : "#f4f8fa")};
  margin: 4px 6px 4px 0;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
  &:focus-visible {
    outline: 3px solid #087ea4;
    outline-offset: 2px;
  }
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;
const Area = styled.div`
  padding: 8px;
  border: 1px solid #d7e4e9;
  border-radius: 6px;
  margin: 8px 0;
`;
const Result = styled.article`
  border: 1px solid #cbd8df;
  border-radius: 8px;
  padding: 10px;
  margin: 12px 0;
`;
const Resource = styled.div`
  border-top: 1px solid #e2e8ec;
  padding-top: 10px;
  margin-top: 10px;
`;
const Mobile = styled.div<{ $drawing: boolean }>`
  position: fixed;
  z-index: 10000;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: ${(p) => (p.$drawing ? "30dvh" : "75dvh")};
  overflow: auto;
  border-radius: 14px 14px 0 0;
  background: white;
  box-shadow: 0 -4px 24px #0003;
  padding-bottom: env(safe-area-inset-bottom);
`;
const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  position: sticky;
  top: 0;
  color: #17475a;
  background: white;
`;
