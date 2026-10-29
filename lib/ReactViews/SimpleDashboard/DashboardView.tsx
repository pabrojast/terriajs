import styled from "styled-components";
import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { runInAction } from "mobx";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import Terria from "../../Models/Terria";
import { SimpleDashboardApi } from "../../Models/SimpleDashboard/Api";
import {
  DashboardConfig,
  DashboardResult,
  DashboardState,
  SavedDashboard,
  SimpleDashboardRef
} from "../../Models/SimpleDashboard/Types";
import DashboardChart from "./DashboardChart";
import { tr } from "./text";

export function DashboardResults({
  config,
  result,
  terria
}: {
  config: DashboardConfig;
  result?: DashboardResult;
  terria: Terria;
}) {
  const onDate = (date: string) => {
    try {
      const value = JulianDate.fromIso8601(date);
      runInAction(() => {
        terria.timelineClock.currentTime = value;
      });
    } catch (_) {
      /* Non-date categories stay local. */
    }
  };
  return (
    <>
      {(!result || result.status === "pending") && (
        <p role="status">{tr("calculating")}</p>
      )}
      {result?.status === "stale" && <p role="status">{tr("stale")}</p>}
      {result?.error && <p role="alert">{result.error}</p>}
      {config.blocks.map((block) => (
        <section className="simple-card" key={block.id}>
          <h3>{block.title}</h3>
          <DashboardChart
            block={block}
            result={result?.results?.[block.id]}
            onDate={onDate}
          />
        </section>
      ))}
      {result?.warnings?.map((w) => (
        <p key={w}>{w}</p>
      ))}
      <details>
        <summary>{tr("details")}</summary>
        {result?.checked_at && (
          <p>
            {tr("checked")}:{" "}
            {new Date(result.checked_at * 1000).toLocaleString()}
          </p>
        )}
        {config.sources.map((source) => (
          <p key={source.id}>
            {source.name}{" "}
            {source.resource_id && (
              <a
                href={`/dataset/resource/${source.resource_id}`}
                target="_blank"
                rel="noreferrer"
              >
                IHP
              </a>
            )}
          </p>
        ))}
        {config.blocks.map((block) => {
          const value = result?.results?.[block.id];
          return (
            <p key={block.id}>
              {block.title}: {value?.method || block.aggregate} ·{" "}
              {value?.unit || block.unit} {value?.resolution}{" "}
              {value?.source_version && <small>{value.source_version}</small>}
            </p>
          );
        })}
      </details>
    </>
  );
}
export const DashboardView = observer(function DashboardView({
  reference,
  terria,
  state,
  onLoaded,
  onStatus
}: {
  reference: SimpleDashboardRef;
  terria: Terria;
  state?: DashboardState;
  onLoaded?: (item: SavedDashboard) => void;
  onStatus?: (pending: boolean, error?: string) => void;
}) {
  const api = useMemo(() => new SimpleDashboardApi(), []);
  const [item, setItem] = useState<SavedDashboard>();
  const [result, setResult] = useState<DashboardResult>();
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<DashboardState>();
  const authenticated = terria.ckanSession?.isAuthenticated;
  const stateKey = JSON.stringify(selection ?? state);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setItem(undefined);
    setResult(undefined);
    setError("");
    async function refresh() {
      try {
        onStatus?.(true);
        await api.initialize(controller.signal);
        const saved = await api.request<SavedDashboard>(
          `/${reference.id}?revision=${reference.revision}`,
          undefined,
          controller.signal
        );
        const value = await api.request<DashboardResult>(
          `/${reference.id}/query`,
          {
            revision: reference.revision,
            ...(stateKey ? { state: JSON.parse(stateKey) } : {})
          },
          controller.signal
        );
        if (controller.signal.aborted) return;
        setItem(saved);
        setResult(value);
        setError("");
        onLoaded?.(saved);
        onStatus?.(value.status === "pending", value.error);
        timer = setTimeout(
          refresh,
          value.status === "pending" || value.refreshing ? 2000 : 300000
        );
      } catch (e) {
        if (controller.signal.aborted) return;
        setItem(undefined);
        setResult(undefined);
        setError(String(e));
        onStatus?.(false, String(e));
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    api,
    reference.id,
    reference.revision,
    authenticated,
    stateKey,
    onLoaded,
    onStatus
  ]);
  return (
    <Surface className="simple-dashboard-content">
      {error && <p role="alert">{error}</p>}
      {!item && !error && <p role="status">{tr("loading")}</p>}
      {item && (
        <>
          <h2>{item.config.title}</h2>
          <small>
            {tr("revision")} {reference.revision} ·{" "}
            {item.published ? tr("published") : tr("private")}
          </small>
          <div className="simple-row">
            <label>
              {tr("start")}
              <input
                type="date"
                value={(selection ?? state ?? item.config.state).start || ""}
                onChange={(e) =>
                  setSelection({
                    ...item.config.state,
                    ...state,
                    ...selection,
                    start: e.target.value
                  })
                }
              />
            </label>
            <label>
              {tr("end")}
              <input
                type="date"
                value={(selection ?? state ?? item.config.state).end || ""}
                onChange={(e) =>
                  setSelection({
                    ...item.config.state,
                    ...state,
                    ...selection,
                    end: e.target.value
                  })
                }
              />
            </label>
          </div>
          <DashboardResults
            terria={terria}
            config={item.config}
            result={result}
          />
          <button
            type="button"
            onClick={() =>
              void api
                .export(item.id, {
                  revision: reference.revision,
                  ...((selection ?? state) ? { state: selection ?? state } : {})
                })
                .catch((e) => setError(String(e)))
            }
          >
            CSV ↓
          </button>
        </>
      )}
    </Surface>
  );
});

const Surface = styled.div`
  color: #183c50;
  font:
    13px/1.5 Arial,
    sans-serif;
  max-width: 900px;
  margin: auto;
  h2 {
    font-size: 22px;
    margin: 5px 0 12px;
  }
  h3 {
    font-size: 14px;
    margin: 0 0 10px;
  }
  .simple-card {
    background: #f5f8fa;
    border-left: 3px solid #087bac;
    border-radius: 5px;
    padding: 14px;
    margin: 16px 0;
  }
  .simple-kpi {
    font-size: 28px;
    font-weight: bold;
    margin: 12px 0;
  }
  .simple-kpi small {
    font-size: 12px;
    font-weight: normal;
  }
  small {
    color: #526f82;
  }
  button {
    padding: 8px 10px;
    color: #086b91;
    border: 1px solid #c9dce6;
    background: #f4f9fc;
    border-radius: 6px;
    cursor: pointer;
  }
  details {
    margin: 14px 0;
  }
  summary {
    cursor: pointer;
    color: #087bac;
  }
  details p {
    overflow-wrap: anywhere;
  }
  .simple-row {
    display: flex;
    gap: 10px;
    margin-top: 12px;
  }
  label {
    flex: 1;
    min-width: 0;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid #bfd5e2;
    border-radius: 5px;
    font: inherit;
  }
  .simple-table {
    overflow: auto;
    max-height: 300px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    padding: 7px;
    text-align: left;
    border-bottom: 1px solid #dce6ec;
    white-space: nowrap;
  }
  [role="alert"] {
    color: #973b2a;
    background: #fff4ef;
    padding: 10px;
  }
  :focus-visible {
    outline: 2px solid #087bac;
    outline-offset: 2px;
  }
`;
