import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import DataAssistantViewModel from "../../../ReactViewModels/DataAssistantViewModel";
import { MapProposal } from "../../../Models/DataAssistant/Types";

const Section = styled.section`
  margin: 10px 0;
  padding: 10px;
  border: 1px solid #879aa4;
  border-radius: 5px;
  color: #183748;
  background: #f7fafb;
  input,
  select {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 5px 0 8px;
    color: #183748;
    background: white;
    border: 1px solid #879aa4;
    border-radius: 3px;
    padding: 7px;
  }
  a {
    color: #075b83;
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
`;
const Button = styled.button`
  background: #175b76;
  color: white;
  border: 1px solid #175b76;
  border-radius: 4px;
  padding: 7px 10px;
  margin: 5px 6px 5px 0;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
  &:focus-visible {
    outline: 3px solid #e89b20;
    outline-offset: 2px;
  }
`;
const Result = styled.article`
  border-top: 1px solid #bac8ce;
  padding: 10px 0;
  p {
    margin: 3px 0;
  }
`;

export const ProposalCard = observer(
  ({ vm, proposal }: { vm: DataAssistantViewModel; proposal: MapProposal }) => {
    const { t } = useTranslation();
    const applied = vm.appliedIds.includes(proposal.id);
    return (
      <Section aria-label={t("dataAssistant.proposal")}>
        <strong>{proposal.title}</strong>
        <ul>
          {proposal.operations.map((op, index) => {
            const name =
              "source_id" in op
                ? (vm.sources.find((s) => s.id === op.source_id)?.name ??
                  op.source_id)
                : "";
            return (
              <li key={index}>
                {t(`dataAssistant.operations.${op.kind}`)}
                {name ? `: ${name}` : ""}
                {op.kind === "update_layer" && (
                  <ul>
                    {Object.entries(op.traits).map(([key, value]) => (
                      <li key={key}>
                        {t(`dataAssistant.properties.${key}`, {
                          defaultValue: key
                        })}
                        {typeof value === "string" || typeof value === "number"
                          ? `: ${value}`
                          : typeof value === "boolean"
                            ? `: ${t(value ? "dataAssistant.yes" : "dataAssistant.no")}`
                            : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {op.kind === "add_url" && <p>{op.url}</p>}
                {op.kind === "move_layer" && ` (${op.index + 1})`}
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          disabled={vm.working || applied}
          onClick={() => void vm.applyProposal(proposal)}
        >
          {t(applied ? "dataAssistant.applied" : "dataAssistant.apply")}
        </Button>
      </Section>
    );
  }
);

const MapAssistantControls = observer(
  ({ vm }: { vm: DataAssistantViewModel }) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [format, setFormat] = useState("");
    const [organization, setOrganization] = useState("");
    const [tags, setTags] = useState("");
    const [url, setUrl] = useState("");
    const [urlFormat, setUrlFormat] = useState("auto");
    const [views, setViews] = useState<Record<string, string>>({});
    const files = useRef<HTMLInputElement>(null);
    if (!vm.mapEditing) return null;
    return (
      <>
        <Section>
          <details open={vm.searchResult ? true : undefined}>
            <summary>{t("dataAssistant.findAndLoad")}</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void vm.searchCatalog(query, false, {
                  format,
                  organization,
                  tags
                });
              }}
            >
              <label>
                {t("dataAssistant.catalogQuery")}
                <input
                  value={query}
                  maxLength={500}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <details>
                <summary>{t("dataAssistant.searchFilters")}</summary>
                <label>
                  {t("dataAssistant.format")}
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
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
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("dataAssistant.organization")}
                  <input
                    value={organization}
                    maxLength={200}
                    onChange={(e) => setOrganization(e.target.value)}
                  />
                </label>
                <label>
                  {t("dataAssistant.tags")}
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </label>
              </details>
              <Button type="submit" disabled={vm.working}>
                {t(
                  vm.polygon
                    ? "dataAssistant.searchArea"
                    : "dataAssistant.searchCatalog"
                )}
              </Button>
            </form>
            {vm.searching && (
              <p role="status">{t("dataAssistant.searching")}</p>
            )}
            {vm.searchResult && (
              <div aria-live="polite">
                {vm.searchResult.spatial_basis && (
                  <p>{t("dataAssistant.coverageNotice")}</p>
                )}
                {!vm.searchResult.sources.length && (
                  <p>
                    {t(
                      vm.searchResult.truncated
                        ? "dataAssistant.moreCandidates"
                        : "dataAssistant.noResults"
                    )}
                  </p>
                )}
                {vm.searchResult.sources.map((source) => (
                  <Result key={source.id}>
                    <strong>{source.dataset_title ?? source.name}</strong>
                    <p>
                      {source.name} · {source.format}
                    </p>
                    {source.url && (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {t("dataAssistant.source")}
                      </a>
                    )}
                    {source.resource_id &&
                    vm.mapSources.get(source.resource_id)?.views.length ? (
                      <label>
                        {t("dataAssistant.savedView")}
                        <select
                          value={views[source.id] ?? ""}
                          onChange={(e) =>
                            setViews({ ...views, [source.id]: e.target.value })
                          }
                        >
                          <option value="">
                            {t("dataAssistant.defaultView")}
                          </option>
                          {vm.mapSources
                            .get(source.resource_id)!
                            .views.map((view) => (
                              <option key={view.id} value={view.id}>
                                {view.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                    <Button
                      type="button"
                      disabled={vm.working}
                      onClick={() => void vm.inspectMapSource(source)}
                    >
                      {t("dataAssistant.inspectViews")}
                    </Button>
                    <Button
                      type="button"
                      disabled={vm.working}
                      onClick={() => vm.proposeSource(source, views[source.id])}
                    >
                      {t("dataAssistant.proposeAdd")}
                    </Button>
                  </Result>
                ))}
                {vm.searchResult.next_cursor && (
                  <Button
                    type="button"
                    disabled={vm.working}
                    onClick={() => void vm.searchCatalog(query, true)}
                  >
                    {t("dataAssistant.moreResults")}
                  </Button>
                )}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                vm.proposeUrl(url, urlFormat);
              }}
            >
              <label>
                {t("dataAssistant.dataUrl")}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  required
                />
              </label>
              <label>
                {t("dataAssistant.format")}
                <select
                  value={urlFormat}
                  onChange={(e) => setUrlFormat(e.target.value)}
                >
                  <option value="auto">
                    {t("dataAssistant.detectFormat")}
                  </option>
                  {["csv", "geojson", "shp", "cog", "wms", "wfs", "kml"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    )
                  )}
                </select>
              </label>
              <Button type="submit" disabled={vm.working || !url.trim()}>
                {t("dataAssistant.proposeAdd")}
              </Button>
            </form>
            <input
              ref={files}
              type="file"
              multiple
              hidden
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.length) void vm.importFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              disabled={vm.working}
              onClick={() => files.current?.click()}
            >
              {t("dataAssistant.localFiles")}
            </Button>
            <p>{t("dataAssistant.localFilesNotice")}</p>
          </details>
        </Section>
        {vm.localProposals.map((proposal) => (
          <ProposalCard key={proposal.id} vm={vm} proposal={proposal} />
        ))}
        <Section>
          <Button
            type="button"
            disabled={vm.working || !vm.history.length}
            onClick={() => void vm.undo()}
          >
            {t("dataAssistant.undo")}
          </Button>
          <Button
            type="button"
            disabled={vm.working}
            onClick={() => void vm.shareMap()}
          >
            {t("dataAssistant.shareMap")}
          </Button>
          {vm.history.length > 0 && (
            <p>{vm.history[vm.history.length - 1].title}</p>
          )}
          {vm.editing && <p role="status">{t("dataAssistant.applying")}</p>}
          {vm.shareExcluded.length > 0 && (
            <p role="status">
              {t("dataAssistant.excludedFromShare")}:{" "}
              {vm.shareExcluded.join(", ")}
            </p>
          )}
          {vm.shareUrl && (
            <label>
              {t("dataAssistant.newLink")}
              <input
                readOnly
                value={vm.shareUrl}
                onFocus={(e) => e.target.select()}
              />
              <a href={vm.shareUrl} target="_blank" rel="noreferrer">
                {t("dataAssistant.openMap")}
              </a>
            </label>
          )}
        </Section>
      </>
    );
  }
);
export default MapAssistantControls;
