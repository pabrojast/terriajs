import { observer } from "mobx-react";
import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
} from "chart.js";
import { Bar, Line, Scatter } from "react-chartjs-2";
import ViewState from "../../../ReactViewModels/ViewState";
import {
  dataCsv,
  getDataAssistant
} from "../../../ReactViewModels/DataAssistantViewModel";
import { Evidence, Row } from "../../../Models/DataAssistant/Types";
import { number } from "../../../Models/DataAssistant/TableTools";
import formatAnswer from "../../../Models/DataAssistant/formatAnswer";
import WorkflowPanel from "../../Workflow/WorkflowPanel";
import Icon from "../../../Styled/Icon";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);
function resultRows(e: Evidence): Row[] {
  return (
    e.rows ??
    Object.entries(e.statistics ?? {}).map(([metric, value]) => ({
      metric,
      value
    }))
  );
}
export function downloadEvidence(e: Evidence) {
  const metadata: Row[] = [
    { field: "evidence", value: e.id },
    { field: "source", value: e.source?.name ?? "" },
    { field: "resource", value: e.source?.resource_id ?? "" },
    { field: "units", value: e.units ?? "" },
    { field: "parameters", value: JSON.stringify(e.parameters ?? {}) },
    { field: "coverage", value: JSON.stringify(e.coverage ?? {}) },
    { field: "complete", value: e.complete !== false },
    { field: "truncated", value: e.truncated === true }
  ];
  const blob = new Blob(
    ["\uFEFF", dataCsv(metadata), "\r\n\r\n", dataCsv(resultRows(e))],
    { type: "text/csv;charset=utf-8" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ihp-analysis-${e.id}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Result({
  evidence: e,
  chart = "table"
}: {
  evidence: Evidence;
  chart?: string;
}) {
  const { t } = useTranslation();
  const rows = resultRows(e);
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const points = e.rows?.filter((r) => "x" in r && "y" in r) ?? [];
  const dataset = {
    label: e.units ?? e.source?.name ?? e.id,
    borderColor: "#086b85",
    backgroundColor: "rgba(8,107,133,.4)",
    pointRadius: 2,
    spanGaps: false
  };
  const chartData = {
    labels: points.map((p) => String(p.x)),
    datasets: [{ ...dataset, data: points.map((p) => number(p.y) ?? null) }]
  };
  return (
    <EvidenceCard id={`data-evidence-${e.id}`}>
      <strong>
        [{e.id}] {e.source?.name ?? t("dataAssistant.comparison")}
      </strong>
      {e.source?.url?.startsWith("/dataset/") && (
        <a href={e.source.url} target="_blank" rel="noopener noreferrer">
          {t("dataAssistant.source")}
        </a>
      )}
      <small>
        {e.units ?? t("dataAssistant.unknownUnits")} ·{" "}
        {t("dataAssistant.observations", {
          count: e.rows_used ?? e.rows_total ?? 0
        })}
      </small>
      {e.complete === false && <Notice>{t("dataAssistant.incomplete")}</Notice>}
      {e.truncated && <Notice>{t("dataAssistant.truncated")}</Notice>}
      {e.warning && <Notice>{e.warning}</Notice>}
      {points.length > 0 && chart !== "table" && (
        <ChartBox>
          {chart === "scatter" ? (
            <Scatter
              data={{
                datasets: [
                  {
                    ...dataset,
                    data: points.flatMap((p) => {
                      const x = number(p.x),
                        y = number(p.y);
                      return x === undefined || y === undefined
                        ? []
                        : [{ x, y }];
                    })
                  }
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false
              }}
            />
          ) : chart === "bar" ? (
            <Bar
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false
              }}
            />
          ) : (
            <Line
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false
              }}
            />
          )}
        </ChartBox>
      )}
      <details>
        <summary>{t("dataAssistant.details")}</summary>
        <p>{e.method}</p>
        <pre>
          {JSON.stringify(
            {
              parameters: e.parameters,
              statistics: e.statistics,
              coverage: e.coverage,
              resolution: e.resolution
            },
            null,
            2
          )}
        </pre>
        {rows.length > 0 && (
          <TableScroll>
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>
                        {r[c] === null || r[c] === undefined
                          ? "—"
                          : String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </details>
      <Button type="button" onClick={() => downloadEvidence(e)}>
        {t("dataAssistant.csv")}
      </Button>
    </EvidenceCard>
  );
}
const DataAssistantTool = observer(
  ({ viewState }: { viewState: ViewState }) => {
    const { t } = useTranslation();
    const vm = getDataAssistant(viewState);
    const [question, setQuestion] = useState("");
    const end = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const opener = useRef(document.activeElement as HTMLElement | null);
    useEffect(() => {
      void vm.initialize();
      input.current?.focus();
      const trigger = opener.current;
      const close = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !vm.drawing) viewState.closeTool();
      };
      document.addEventListener("keydown", close);
      return () => {
        document.removeEventListener("keydown", close);
        if (vm.drawing) vm.clearArea();
        if (trigger?.isConnected) trigger.focus();
      };
    }, [vm, viewState]);
    useEffect(() => {
      end.current?.scrollIntoView({ block: "nearest" });
    }, [vm.entries.length, vm.busy]);
    const submit = () => {
      if (question.trim() && !vm.busy) {
        void vm.ask(question);
        setQuestion("");
      }
    };
    const content = (
      <Body>
        <Intro>{t("dataAssistant.intro")}</Intro>
        <details>
          <summary>
            {t("dataAssistant.context", { count: vm.selectedIds.length })}
          </summary>
          <Sources>
            {vm.sources.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  disabled={vm.busy}
                  checked={vm.selectedIds.includes(s.id)}
                  onChange={() => vm.toggleSource(s.id)}
                />
                {s.name}
              </label>
            ))}
          </Sources>
          {!vm.sources.length && <p>{t("dataAssistant.noLayers")}</p>}
          <Dates>
            <label>
              {t("dataAssistant.from")}
              <input
                type="date"
                value={vm.start}
                disabled={vm.busy}
                onChange={(e) => vm.setDates(e.target.value, vm.end)}
              />
            </label>
            <label>
              {t("dataAssistant.to")}
              <input
                type="date"
                value={vm.end}
                disabled={vm.busy}
                onChange={(e) => vm.setDates(vm.start, e.target.value)}
              />
            </label>
          </Dates>
        </details>
        <Actions>
          <Button type="button" disabled={vm.busy} onClick={vm.drawArea}>
            {t("dataAssistant.draw")}
          </Button>
          <Button type="button" disabled={vm.busy} onClick={vm.usePickedPoint}>
            {t("dataAssistant.usePoint")}
          </Button>
          {(vm.polygon || vm.point || vm.drawing) && (
            <Button type="button" onClick={vm.clearArea}>
              {t("dataAssistant.clearArea")}
            </Button>
          )}
        </Actions>
        {(vm.polygon || vm.point) && (
          <small>
            {vm.polygon
              ? t("dataAssistant.areaSelected")
              : `${t("dataAssistant.pointSelected")}: ${vm.point!.map((n) => n.toFixed(4)).join(", ")}`}
          </small>
        )}
        {vm.drawing && (
          <Notice role="status">{t("dataAssistant.drawing")}</Notice>
        )}
        {!vm.drawing && (
          <>
            <Conversation
              aria-live="polite"
              aria-relevant="additions text"
              aria-label={t("dataAssistant.conversation")}
            >
              {vm.entries.map((entry, index) => (
                <article key={index}>
                  <Question>{entry.question}</Question>
                  {entry.turn?.answer && (
                    <Answer
                      dangerouslySetInnerHTML={{
                        __html: formatAnswer(entry.turn.answer)
                      }}
                    />
                  )}
                  {entry.turn?.error && (
                    <Notice role="alert">{entry.turn.error}</Notice>
                  )}
                  {entry.turn?.status === "cancelled" && (
                    <small>{t("dataAssistant.cancelled")}</small>
                  )}
                  {entry.turn?.evidence?.map((e) => (
                    <Result
                      key={e.id}
                      evidence={e}
                      chart={
                        entry.turn?.artifacts?.find((a) => a.result_id === e.id)
                          ?.chart
                      }
                    />
                  ))}
                  {entry.turn?.actions?.map((action, i) => (
                    <Button
                      type="button"
                      key={i}
                      disabled={vm.busy}
                      onClick={() => void vm.apply(action)}
                    >
                      {action.title ??
                        t(`dataAssistant.actions.${action.action}`)}
                    </Button>
                  ))}
                </article>
              ))}
              {vm.busy && (
                <Notice role="status">
                  {t("dataAssistant.working")} {vm.progress}
                </Notice>
              )}
              <div ref={end} />
            </Conversation>
            {!vm.entries.length && (
              <Actions>
                {["suggestStats", "suggestTrend", "suggestCatalog"].map(
                  (key) => (
                    <Button
                      type="button"
                      key={key}
                      onClick={() => {
                        setQuestion(t(`dataAssistant.${key}`));
                        input.current?.focus();
                      }}
                    >
                      {t(`dataAssistant.${key}`)}
                    </Button>
                  )
                )}
              </Actions>
            )}
            {vm.error && <Notice role="alert">{vm.error}</Notice>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label htmlFor="data-assistant-question">
                {t("dataAssistant.question")}
              </label>
              <textarea
                ref={input}
                id="data-assistant-question"
                rows={3}
                maxLength={8000}
                value={question}
                placeholder={t("dataAssistant.placeholder")}
                disabled={!vm.authenticated || vm.busy}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <Actions>
                <Button
                  type="submit"
                  $primary
                  disabled={!vm.authenticated || vm.busy || !question.trim()}
                >
                  {t("dataAssistant.send")}
                </Button>
                {vm.busy && (
                  <Button type="button" onClick={vm.cancel}>
                    {t("dataAssistant.cancel")}
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={vm.busy}
                  onClick={() => vm.reset()}
                >
                  {t("dataAssistant.newChat")}
                </Button>
              </Actions>
            </form>
            <small>{t("dataAssistant.privacy")}</small>
          </>
        )}
      </Body>
    );
    if (viewState.useSmallScreenInterface)
      return ReactDOM.createPortal(
        <Mobile
          $drawing={vm.drawing}
          role="region"
          aria-label={t("dataAssistant.title")}
        >
          <MobileHeader>
            <strong>{t("dataAssistant.title")}</strong>
            <Button
              aria-label={t("dataAssistant.close")}
              onClick={() => viewState.closeTool()}
            >
              ×
            </Button>
          </MobileHeader>
          {content}
        </Mobile>,
        document.body
      );
    return (
      <WorkflowPanel
        viewState={viewState}
        title={t("dataAssistant.title")}
        icon={Icon.GLYPHS.search}
        appearance="analysis"
        onClose={() => viewState.closeTool()}
      >
        {content}
      </WorkflowPanel>
    );
  }
);
export default DataAssistantTool;
const Body = styled.div`
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #1f2937;
  background: #fff;
  min-width: 0;
  font-size: 14px;
  label {
    display: block;
  }
  input,
  textarea {
    color: #1f2937;
    background: #fff;
    border: 1px solid #9ca3af;
    border-radius: 6px;
    padding: 8px;
    box-sizing: border-box;
    max-width: 100%;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font: inherit;
    margin: 6px 0;
  }
  small {
    color: #526174;
    line-height: 1.5;
  }
  summary {
    cursor: pointer;
  }
`;
const Intro = styled.p`
  margin: 0;
  line-height: 1.5;
`;
const Sources = styled.div`
  max-height: 140px;
  overflow: auto;
  margin: 8px 0;
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    overflow-wrap: anywhere;
  }
`;
const Dates = styled.div`
  display: flex;
  gap: 8px;
  label {
    flex: 1;
    min-width: 0;
  }
  input {
    width: 100%;
  }
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;
const Button = styled.button<{ $primary?: boolean }>`
  border: 1px solid #b7cbd3;
  border-radius: 7px;
  padding: 8px 10px;
  cursor: pointer;
  line-height: 1.4;
  font: inherit;
  background: ${(p) => (p.$primary ? "#086b85" : "#f4f8fa")};
  color: ${(p) => (p.$primary ? "#fff" : "#17475a")};
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid #087ea4;
    outline-offset: 2px;
  }
`;
const Conversation = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  article {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
`;
const Question = styled.div`
  background: #e8f3f7;
  border-radius: 10px;
  padding: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;
const Answer = styled.div`
  overflow-wrap: anywhere;
  line-height: 1.6;
  h1,
  h2,
  h3,
  h4 {
    font-size: 1.05em;
    margin: 14px 0 6px;
  }
  p {
    margin: 8px 0;
  }
  ul,
  ol {
    padding-left: 22px;
  }
  pre {
    white-space: pre-wrap;
  }
`;
const Notice = styled.div`
  background: #fff8e6;
  border-left: 3px solid #d9a12a;
  padding: 9px;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;
const EvidenceCard = styled.div`
  border: 1px solid #cbd8df;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  a {
    color: #086b85;
    text-decoration: underline;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 11px;
  }
`;
const TableScroll = styled.div`
  overflow: auto;
  max-height: 240px;
  table {
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    border: 1px solid #dce3e8;
    padding: 5px;
    text-align: left;
    max-width: 180px;
    overflow-wrap: anywhere;
  }
`;
const ChartBox = styled.div`
  height: 220px;
  min-width: 0;
  position: relative;
`;
const Mobile = styled.div<{ $drawing: boolean }>`
  position: fixed;
  z-index: 10000;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: ${(p) => (p.$drawing ? "30dvh" : "75dvh")};
  overflow: auto;
  background: white;
  border-radius: 14px 14px 0 0;
  box-shadow: 0 -4px 24px #0003;
  padding-bottom: env(safe-area-inset-bottom);
`;
const MobileHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  color: #17475a;
  position: sticky;
  top: 0;
  z-index: 1;
`;
