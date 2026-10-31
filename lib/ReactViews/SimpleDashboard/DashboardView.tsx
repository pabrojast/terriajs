import QueryRunner from "../../Models/SimpleDashboard/QueryRunner";
import SpatialControls from "./SpatialControls";
import useDashboardSpatial from "./useDashboardSpatial";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { tr, dashboardLocale, dashboardMessage } from "./text";

export function DashboardResults({
  config,
  result,
  terria
}: {
  config: DashboardConfig;
  result?: DashboardResult;
  terria: Terria;
}) {
  useTranslation();
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
      {result?.error && <p role="alert">{dashboardMessage(result.error)}</p>}
      {config.blocks.map((block) => (
        <section className="simple-card" key={block.id}>
          <h3>{block.title}</h3>
          <SpatialResult result={result?.results?.[block.id]} />
          <DashboardChart
            block={block}
            result={result?.results?.[block.id]}
            onDate={onDate}
            generatedColumns={config.sources.some(
              (s) =>
                s.id === block.source_id && ["water", "cog"].includes(s.kind)
            )}
          />
        </section>
      ))}
      {result?.warnings?.map((w) => (
        <p key={w}>{dashboardMessage(w)}</p>
      ))}
      <details>
        <summary>{tr("details")}</summary>
        {result?.checked_at && (
          <p>
            {tr("checked")}:{" "}
            {new Date(result.checked_at * 1000).toLocaleString(
              dashboardLocale()
            )}
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
          const methods: Record<string, string> = {
            "Water-body core: daily median, monthly median, annual mean of monthly medians.":
              tr("waterMethod"),
            "Pixel value": tr("pixelMethod"),
            "Polygon mean": tr("polygonMethod")
          };
          const resolution = value?.resolution;
          return (
            <p key={block.id}>
              {block.title}:{" "}
              {value?.method
                ? methods[value.method] || value.method
                : tr(block.aggregate)}{" "}
              · {value?.unit || block.unit}{" "}
              {resolution === "daily" ||
              resolution === "monthly" ||
              resolution === "annual"
                ? tr(resolution)
                : resolution}{" "}
              {value?.source_version && <small>{value.source_version}</small>}
            </p>
          );
        })}
      </details>
    </>
  );
}
function SpatialResult({
  result
}: {
  result?: import("../../Models/SimpleDashboard/Types").BlockResult;
}) {
  if (!result) return null;
  const scopes = {
    configured: "scopeConfigured",
    observations: "scopeObservations",
    entities: "scopeEntities",
    pixels: "scopePixels",
    bodies: "scopeBodies",
    unfiltered: "scopeUnfiltered"
  } as const;
  const count =
    result.body_count ??
    result.pixel_count ??
    result.valid_count ??
    result.count;
  const mode = result.spatial_state?.mode;
  return (
    <div className="simple-spatial-result">
      <small>
        {mode === "viewport"
          ? tr("scopeViewport") + " · "
          : mode === "fixed"
            ? tr("scopeFixed") + " · "
            : ""}
        {tr(scopes[result.spatial_scope ?? "configured"])}
        {count !== undefined &&
          ` · ${count.toLocaleString(dashboardLocale())} ${tr("validData")}`}
      </small>
      {count === 0 && <p>{tr("extentEmpty")}</p>}
      {result.spatial_scope === "bodies" && (
        <p>
          <small>
            {result.method ===
            "Area-weighted median of intersecting water bodies"
              ? tr("bodiesMedian")
              : tr("waterMethod")}
          </small>
        </p>
      )}
      {result.spatial_scope === "pixels" && (
        <p>
          <small>
            {result.quality === "native"
              ? tr("nativeResolution")
              : tr("quickResolution")}{" "}
            · {tr("pixelResolution")}:{" "}
            {result.pixel_resolutions
              ?.map((r) => r.map((v) => Number(v.toPrecision(5))).join(" × "))
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(", ")}
          </small>
        </p>
      )}
    </div>
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
  useTranslation();
  const api = useMemo(() => new SimpleDashboardApi(), []);
  const [item, setItem] = useState<SavedDashboard>();
  const [response, setResponse] = useState<{
    key: string;
    value: DashboardResult;
  }>();
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<DashboardState>();
  const authenticated = terria.ckanSession?.isAuthenticated;
  const requested =
    selection ?? state ?? reference.state ?? item?.config.state ?? {};
  const chosen: DashboardState =
    terria.userProperties.get("dashboardOnly") === "1" &&
    requested.spatial?.mode === "viewport" &&
    requested.spatial.bounds
      ? { ...requested, spatial: { ...requested.spatial, mode: "fixed" } }
      : requested;
  const spatial = useDashboardSpatial(terria, chosen);
  const stateKey = JSON.stringify(spatial.effective);
  const result = response?.key === stateKey ? response.value : undefined;
  const runner = useRef<QueryRunner>();
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    const controller = new AbortController();
    setItem(undefined);
    setResponse(undefined);
    setSelection(undefined);
    setError("");
    void (async () => {
      try {
        await api.initialize(controller.signal);
        const saved = await api.request<SavedDashboard>(
          `/${reference.id}?revision=${reference.revision}`,
          undefined,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setItem(saved);
          onLoaded?.(saved);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(String(e));
          onStatusRef.current?.(false, String(e));
        }
      }
    })();
    const query = new QueryRunner(
      async (key, signal) => {
        await api.initialize(signal);
        return api.request<DashboardResult>(
          `/${reference.id}/query`,
          { revision: reference.revision, state: JSON.parse(key) },
          signal
        );
      },
      (key, value) => {
        setResponse({ key, value });
        setError("");
        onStatusRef.current?.(
          value.status === "pending" || !!value.refreshing,
          value.error
        );
      },
      (_key, e) => {
        setResponse(undefined);
        setError(String(e));
        onStatusRef.current?.(false, String(e));
      }
    );
    runner.current = query;
    return () => {
      controller.abort();
      query.dispose();
    };
  }, [api, reference.id, reference.revision, authenticated, onLoaded]);
  useEffect(() => {
    runner.current?.update(item && spatial.enabled ? stateKey : undefined);
    if (item && spatial.enabled) {
      setError("");
      onStatusRef.current?.(true);
    }
    if (item && spatial.needsMap)
      onStatusRef.current?.(false, tr("extentRequired"));
  }, [stateKey, item, spatial.enabled, spatial.needsMap]);
  useEffect(() => {
    if (!item || !spatial.enabled) return;
    runInAction(() => {
      if (
        terria.simpleDashboard?.id === reference.id &&
        terria.simpleDashboard.revision === reference.revision
      )
        terria.simpleDashboard = {
          ...terria.simpleDashboard,
          state: JSON.parse(stateKey)
        };
    });
  }, [
    terria,
    item,
    reference.id,
    reference.revision,
    stateKey,
    spatial.enabled
  ]);
  return (
    <Surface className="simple-dashboard-content" lang={dashboardLocale()}>
      {error && <p role="alert">{dashboardMessage(error)}</p>}
      {!item && !error && <p role="status">{tr("loading")}</p>}
      {item && (
        <>
          <h2>{item.config.title}</h2>
          <small>
            {tr("revision")} {reference.revision} ·{" "}
            {item.published ? tr("published") : tr("private")}
          </small>
          <SpatialControls
            terria={terria}
            state={spatial.effective}
            onChange={setSelection}
            needsMap={spatial.needsMap}
            native={item.config.sources.some(
              (s) => s.kind === "cog" || !!s.analysis_resource_id
            )}
          />
          <div className="simple-row">
            <label>
              {tr("start")}
              <input
                type="date"
                value={chosen.start || ""}
                onChange={(e) =>
                  setSelection({
                    ...chosen,
                    start: e.target.value
                  })
                }
              />
            </label>
            <label>
              {tr("end")}
              <input
                type="date"
                value={chosen.end || ""}
                onChange={(e) =>
                  setSelection({
                    ...chosen,
                    end: e.target.value
                  })
                }
              />
            </label>
          </div>
          {!spatial.needsMap && (
            <DashboardResults
              terria={terria}
              config={item.config}
              result={result}
            />
          )}
          <button
            type="button"
            disabled={
              !result?.results ||
              result.status === "pending" ||
              result.refreshing ||
              !spatial.enabled
            }
            onClick={() =>
              void api
                .export(item.id, {
                  revision: reference.revision,
                  state: spatial.effective
                })
                .catch((e) => setError(String(e)))
            }
          >
            {tr("csv")} ↓
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
