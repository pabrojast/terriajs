import { useTranslation } from "react-i18next";
import { localPreview } from "../../Models/SimpleDashboard/LocalPreview";
import DashboardEmbed from "./DashboardEmbed";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { runInAction } from "mobx";
import styled from "styled-components";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import UserDrawing from "../../Models/UserDrawing";
import { useViewState } from "../Context";
import { SimpleDashboardApi } from "../../Models/SimpleDashboard/Api";
import { dashboardSources } from "../../Models/SimpleDashboard/Sources";
import {
  DashboardBlock,
  DashboardConfig,
  DashboardResult,
  DashboardSource,
  SavedDashboard
} from "../../Models/SimpleDashboard/Types";
import { DashboardView, DashboardResults } from "./DashboardView";
import { tr } from "./text";

const empty = (): DashboardConfig => ({
  version: 1,
  title: "Dashboard",
  sources: [],
  blocks: [],
  state: {}
});
const coordinate = (point: Cartesian3): [number, number] => {
  const p = Cartographic.fromCartesian(point);
  return [CesiumMath.toDegrees(p.longitude), CesiumMath.toDegrees(p.latitude)];
};

export default observer(function SimpleDashboardPanel() {
  const { terria } = useViewState();
  if (
    !terria.configParameters.simpleDashboards?.enabled ||
    !terria.simpleDashboardOpen
  )
    return null;
  if (
    terria.userProperties.get("dashboardOnly") === "1" &&
    terria.simpleDashboard
  )
    return (
      <DashboardEmbed terria={terria} reference={terria.simpleDashboard} />
    );
  return (
    <Panel
      key={terria.ckanSession?.isAuthenticated ? "authenticated" : "public"}
    />
  );
});
const Panel = observer(function Panel() {
  useTranslation();
  const { terria } = useViewState();
  const api = useMemo(() => new SimpleDashboardApi(), []);
  const [step, setStep] = useState<
    "library" | "data" | "blocks" | "review" | "view"
  >(terria.simpleDashboard ? "view" : "library");
  const [collapsed, setCollapsed] = useState(false);
  const [config, setConfig] = useState<DashboardConfig>(empty);
  const [saved, setSaved] = useState<SavedDashboard>();
  const [library, setLibrary] = useState<SavedDashboard[]>([]);
  const [publicLibrary, setPublicLibrary] = useState(false);
  const [result, setResult] = useState<DashboardResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const drawingTool = useRef<UserDrawing>();
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [step]);
  const available = dashboardSources(terria);
  const authenticated = !!terria.ckanSession?.isAuthenticated;
  const configKey = JSON.stringify(config);
  const onLoaded = useCallback((value: SavedDashboard) => setSaved(value), []);
  const editConfig = (patch: Partial<DashboardConfig>) =>
    setConfig((old) => ({ ...old, ...patch }));
  const changeSource = (id: string, patch: Partial<DashboardSource>) =>
    editConfig({
      sources: config.sources.map((s) => (s.id === id ? { ...s, ...patch } : s))
    });
  const changeBlock = (id: string, patch: Partial<DashboardBlock>) =>
    editConfig({
      blocks: config.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))
    });
  const close = () =>
    runInAction(() => {
      terria.simpleDashboardOpen = false;
    });
  const open = (item: SavedDashboard) => {
    setSaved(item);
    setStep("view");
    setError("");
    runInAction(() => {
      terria.simpleDashboard = {
        id: item.id,
        revision: item.selected_revision || item.revision
      };
    });
  };
  const loadLibrary = useCallback(async () => {
    await api.initialize();
    const value = await api.request<{ items: SavedDashboard[] }>(
      publicLibrary || !authenticated ? "?public=1" : ""
    );
    setLibrary(value.items);
  }, [api, publicLibrary, authenticated]);
  useEffect(() => {
    if (step === "library")
      void loadLibrary().catch((e) => setError(String(e)));
  }, [step, loadLibrary]);
  useEffect(() => () => drawingTool.current?.cleanUp(), []);
  useEffect(() => {
    if (!["data", "blocks", "review"].includes(step) || !config.sources.length)
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function preview() {
      try {
        await api.initialize(controller.signal);
        const current: DashboardConfig = JSON.parse(configKey);
        const local = localPreview(terria, current);
        const durable = current.sources.filter(
          (s) => s.resource_id || s.catalog_url
        );
        const remote = durable.length
          ? await api.request<DashboardResult>(
              "/preview",
              {
                config: {
                  ...current,
                  sources: durable,
                  blocks: current.blocks.filter((b) =>
                    durable.some((s) => s.id === b.source_id)
                  )
                }
              },
              controller.signal
            )
          : local;
        const value = {
          ...remote,
          results: { ...local.results, ...remote.results },
          profiles: { ...local.profiles, ...remote.profiles }
        };
        if (controller.signal.aborted) return;
        setResult((old) => ({
          ...value,
          // Pending jobs have no profiles yet. Keep column/body choices stable
          // for the selected sources while their new results are calculated.
          profiles: Object.fromEntries(
            current.sources.flatMap((source) => {
              const profile =
                value.profiles?.[source.id] || old?.profiles?.[source.id];
              return profile ? [[source.id, profile]] : [];
            })
          )
        }));
        setError("");
        timer = setTimeout(
          preview,
          value.status === "pending" || value.refreshing ? 2000 : 300000
        );
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(String(e));
          setResult(undefined);
        }
      }
    }
    timer = setTimeout(preview, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, configKey, step, config.sources.length, terria]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await api.initialize();
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function addBlock() {
    const source = config.sources[0];
    const fields = result?.profiles?.[source.id]?.fields || [];
    editConfig({
      blocks: [
        ...config.blocks,
        {
          id: crypto.randomUUID(),
          source_id: source.id,
          title: source.name,
          type: "kpi",
          aggregate:
            fields.some((f) => f.type === "number") ||
            source.kind === "water" ||
            source.kind === "cog"
              ? "avg"
              : "count",
          y_field: fields.find((f) => f.type === "number")?.key,
          x_field: fields.find((f) => f.type === "date")?.key || fields[0]?.key,
          body_id: result?.profiles?.[source.id]?.bodies?.[0]?.id,
          limit: 100,
          time_grain: "none"
        }
      ]
    });
  }
  function draw() {
    drawingTool.current?.cleanUp();
    setDrawing(true);
    drawingTool.current = new UserDrawing({
      terria,
      allowPolygon: true,
      invisible: true,
      messageHeader: tr("draw"),
      completeOnClose: true,
      retainDrawingOnFinish: true,
      canComplete: (points) => points.length >= 3,
      onDrawingComplete: ({ points }) => {
        const ring = points.map(coordinate);
        ring.push([...ring[0]]);
        setConfig((old) => ({
          ...old,
          state: {
            ...old.state,
            area: { type: "Polygon", coordinates: [ring] }
          }
        }));
        setDrawing(false);
      },
      onCleanUp: () => setDrawing(false)
    });
    drawingTool.current.enterDrawMode();
  }
  const controls = (
    <div className="simple-row">
      <label>
        {tr("start")}
        <input
          type="date"
          value={config.state.start || ""}
          onChange={(e) =>
            editConfig({ state: { ...config.state, start: e.target.value } })
          }
        />
      </label>
      <label>
        {tr("end")}
        <input
          type="date"
          value={config.state.end || ""}
          onChange={(e) =>
            editConfig({ state: { ...config.state, end: e.target.value } })
          }
        />
      </label>
    </div>
  );
  return (
    <Shell $collapsed={collapsed} $drawing={drawing} aria-label={tr("title")}>
      <header>
        <div>
          <small>IHP-WINS</small>
          <h2>{tr("title")}</h2>
        </div>
        <button
          type="button"
          aria-label={collapsed ? tr("preview") : "−"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "+" : "−"}
        </button>
        <button type="button" aria-label={tr("close")} onClick={close}>
          ×
        </button>
      </header>
      {!collapsed && (
        <div className="simple-scroll" ref={scroll}>
          {error && <p role="alert">{error}</p>}
          {step === "library" && (
            <>
              <h3>{tr("library")}</h3>
              {authenticated ? (
                <button
                  className="simple-primary"
                  type="button"
                  onClick={() => {
                    setConfig(empty());
                    setSaved(undefined);
                    setResult(undefined);
                    setStep("data");
                  }}
                >
                  {tr("create")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => terria.ckanSession?.openLogin()}
                >
                  {tr("signIn")}
                </button>
              )}
              {authenticated && (
                <label className="simple-check">
                  <input
                    type="checkbox"
                    checked={publicLibrary}
                    onChange={(e) => setPublicLibrary(e.target.checked)}
                  />
                  {tr("public")}
                </label>
              )}
              {library.map((item) => (
                <button
                  className="simple-library-item"
                  type="button"
                  key={item.id}
                  onClick={() => open(item)}
                >
                  <strong>{item.title}</strong>
                  <small>
                    {item.published_revision ? tr("published") : tr("private")}{" "}
                    · {tr("revision")} {item.selected_revision}
                  </small>
                </button>
              ))}
            </>
          )}
          {step === "view" && terria.simpleDashboard && (
            <>
              <button type="button" onClick={() => setStep("library")}>
                ← {tr("library")}
              </button>
              <DashboardView
                key={saved?.published ? "published" : "private"}
                reference={terria.simpleDashboard}
                terria={terria}
                onLoaded={onLoaded}
              />
              {saved && authenticated && (
                <div className="simple-actions">
                  {saved.can_edit && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfig(saved.config);
                        setStep("data");
                      }}
                    >
                      {tr("edit")}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(async () =>
                        open(
                          await api.request<SavedDashboard>(
                            `/${saved.id}/duplicate`,
                            { revision: saved.selected_revision }
                          )
                        )
                      )
                    }
                  >
                    {tr("duplicate")}
                  </button>
                  {saved.can_edit && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api.request(`/${saved.id}/publish`, {
                            revision: saved.selected_revision,
                            publish:
                              saved.published_revision !==
                              saved.selected_revision
                          });
                          const item = await api.request<SavedDashboard>(
                            `/${saved.id}?revision=${saved.selected_revision}`
                          );
                          setSaved(item);
                        })
                      }
                    >
                      {saved.published_revision === saved.selected_revision
                        ? tr("unpublish")
                        : tr("publish")}
                    </button>
                  )}
                  {saved.revision !== saved.selected_revision && (
                    <button
                      type="button"
                      onClick={() =>
                        open({ ...saved, selected_revision: saved.revision })
                      }
                    >
                      {tr("latest")}
                    </button>
                  )}
                  {saved.can_edit && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        // eslint-disable-next-line no-alert -- Explicit confirmation before deleting saved revisions.
                        if (window.confirm(tr("confirmDelete")))
                          void act(async () => {
                            await api.request(
                              `/${saved.id}`,
                              {},
                              undefined,
                              "DELETE"
                            );
                            runInAction(() => {
                              terria.simpleDashboard = undefined;
                            });
                            setSaved(undefined);
                            setStep("library");
                          });
                      }}
                    >
                      {tr("delete")}
                    </button>
                  )}
                </div>
              )}
              <p className="simple-hint">{tr("pin")}</p>
            </>
          )}
          {["data", "blocks", "review"].includes(step) && (
            <>
              <nav aria-label={tr("create")}>
                {(["data", "blocks", "review"] as const).map((s) => (
                  <button
                    type="button"
                    key={s}
                    aria-current={s === step ? "step" : undefined}
                    disabled={s !== "data" && !config.sources.length}
                    onClick={() => setStep(s)}
                  >
                    {tr(s)}
                  </button>
                ))}
              </nav>
              <label>
                {tr("name")}
                <input
                  maxLength={200}
                  value={config.title}
                  onChange={(e) => editConfig({ title: e.target.value })}
                />
              </label>
              {step === "data" && (
                <>
                  <h3>{tr("choose")}</h3>
                  {!available.length && <p>{tr("empty")}</p>}
                  {available.map((source) => (
                    <label className="simple-check" key={source.id}>
                      <input
                        type="checkbox"
                        checked={config.sources.some((s) => s.id === source.id)}
                        disabled={
                          !config.sources.some((s) => s.id === source.id) &&
                          config.sources.length >= 6
                        }
                        onChange={(e) =>
                          editConfig({
                            sources: e.target.checked
                              ? [...config.sources, source]
                              : config.sources.filter(
                                  (s) => s.id !== source.id
                                ),
                            blocks: e.target.checked
                              ? config.blocks
                              : config.blocks.filter(
                                  (b) => b.source_id !== source.id
                                )
                          })
                        }
                      />
                      {source.name}
                      {!source.resource_id && !source.catalog_url && (
                        <small>{tr("local")}</small>
                      )}
                    </label>
                  ))}
                  {config.sources.map((source) => {
                    const profile = result?.profiles?.[source.id];
                    return (
                      <section className="simple-card" key={source.id}>
                        <strong>{source.name}</strong>
                        {source.kind === "water" ? (
                          <label>
                            {tr("period")}
                            <select
                              value={source.resolution}
                              onChange={(e) =>
                                changeSource(source.id, {
                                  resolution: e.target
                                    .value as DashboardSource["resolution"]
                                })
                              }
                            >
                              {(["daily", "monthly", "annual"] as const).map(
                                (r) => (
                                  <option key={r} value={r}>
                                    {tr(r)}
                                  </option>
                                )
                              )}
                            </select>
                          </label>
                        ) : (
                          source.kind !== "cog" && (
                            <>
                              <label>
                                {tr("dateField")}
                                <select
                                  value={source.date_field || ""}
                                  onChange={(e) =>
                                    changeSource(source.id, {
                                      date_field: e.target.value
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {profile?.fields
                                    ?.filter((f) => f.type === "date")
                                    .map((f) => (
                                      <option key={f.key} value={f.key}>
                                        {f.label}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <label>
                                {tr("category")}
                                <select
                                  value={source.filters?.[0]?.field || ""}
                                  onChange={(e) =>
                                    changeSource(source.id, {
                                      filters: e.target.value
                                        ? [
                                            {
                                              field: e.target.value,
                                              op: "eq",
                                              value: ""
                                            }
                                          ]
                                        : []
                                    })
                                  }
                                >
                                  <option value="">{tr("all")}</option>
                                  {profile?.fields?.map((f) => (
                                    <option key={f.key} value={f.key}>
                                      {f.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {source.filters?.length ? (
                                <input
                                  aria-label={tr("measure")}
                                  value={source.filters[0].value}
                                  onChange={(e) =>
                                    changeSource(source.id, {
                                      filters: [
                                        {
                                          ...source.filters![0],
                                          value: e.target.value
                                        }
                                      ]
                                    })
                                  }
                                />
                              ) : null}
                            </>
                          )
                        )}
                      </section>
                    );
                  })}
                  {controls}
                  {config.sources.some((s) => s.kind === "cog") && (
                    <div className="simple-actions">
                      <button type="button" onClick={draw}>
                        {tr("draw")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const point = terria.pickedFeatures?.pickPosition;
                          if (!point) setError(tr("needPoint"));
                          else
                            editConfig({
                              state: {
                                ...config.state,
                                area: {
                                  type: "Point",
                                  coordinates: coordinate(point)
                                }
                              }
                            });
                        }}
                      >
                        {tr("point")}
                      </button>
                      {config.state.area && (
                        <button
                          type="button"
                          onClick={() =>
                            editConfig({
                              state: { ...config.state, area: null }
                            })
                          }
                        >
                          {tr("clear")}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {step === "blocks" && (
                <>
                  {config.blocks.map((block, index) => {
                    const source = config.sources.find(
                      (s) => s.id === block.source_id
                    )!;
                    const profile = result?.profiles?.[source.id];
                    return (
                      <section className="simple-card" key={block.id}>
                        <div className="simple-actions">
                          <strong>{index + 1}</strong>
                          <button
                            type="button"
                            disabled={index === 0}
                            aria-label="↑"
                            onClick={() => {
                              const blocks = [...config.blocks];
                              [blocks[index - 1], blocks[index]] = [
                                blocks[index],
                                blocks[index - 1]
                              ];
                              editConfig({ blocks });
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === config.blocks.length - 1}
                            aria-label="↓"
                            onClick={() => {
                              const blocks = [...config.blocks];
                              [blocks[index + 1], blocks[index]] = [
                                blocks[index],
                                blocks[index + 1]
                              ];
                              editConfig({ blocks });
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              editConfig({
                                blocks: config.blocks.filter(
                                  (b) => b.id !== block.id
                                )
                              })
                            }
                          >
                            {tr("remove")}
                          </button>
                        </div>
                        <label>
                          {tr("titleField")}
                          <input
                            value={block.title}
                            onChange={(e) =>
                              changeBlock(block.id, { title: e.target.value })
                            }
                          />
                        </label>
                        <div className="simple-row">
                          <label>
                            {tr("source")}
                            <select
                              value={block.source_id}
                              onChange={(e) =>
                                changeBlock(block.id, {
                                  source_id: e.target.value,
                                  x_field: undefined,
                                  y_field: undefined,
                                  body_id: undefined
                                })
                              }
                            >
                              {config.sources.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {tr("blockType")}
                            <select
                              value={block.type}
                              onChange={(e) =>
                                changeBlock(block.id, {
                                  type: e.target.value as DashboardBlock["type"]
                                })
                              }
                            >
                              {(["kpi", "line", "bar", "table"] as const).map(
                                (k) => (
                                  <option value={k} key={k}>
                                    {tr(k)}
                                  </option>
                                )
                              )}
                            </select>
                          </label>
                        </div>
                        {source.kind === "water" && (
                          <label>
                            {tr("body")}
                            <select
                              value={block.body_id ?? ""}
                              onChange={(e) =>
                                changeBlock(block.id, {
                                  body_id: Number(e.target.value)
                                })
                              }
                            >
                              <option value="">—</option>
                              {profile?.bodies?.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {(source.kind === "table" ||
                          source.kind === "geojson") && (
                          <div className="simple-row">
                            <label>
                              {tr("measure")}
                              <select
                                value={block.y_field || ""}
                                onChange={(e) =>
                                  changeBlock(block.id, {
                                    y_field: e.target.value
                                  })
                                }
                              >
                                <option value="">—</option>
                                {profile?.fields
                                  ?.filter((f) => f.type === "number")
                                  .map((f) => (
                                    <option value={f.key} key={f.key}>
                                      {f.label}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {["line", "bar"].includes(block.type) && (
                              <label>
                                {tr("group")}
                                <select
                                  value={block.x_field || ""}
                                  onChange={(e) =>
                                    changeBlock(block.id, {
                                      x_field: e.target.value
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {profile?.fields?.map((f) => (
                                    <option key={f.key} value={f.key}>
                                      {f.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        )}
                        {source.kind === "cog" && (
                          <label>
                            Band
                            <input
                              type="number"
                              min={1}
                              max={256}
                              value={block.band || 1}
                              onChange={(e) =>
                                changeBlock(block.id, {
                                  band: Number(e.target.value)
                                })
                              }
                            />
                          </label>
                        )}
                        {block.type !== "table" && (
                          <label>
                            {tr("aggregate")}
                            <select
                              value={block.aggregate}
                              onChange={(e) =>
                                changeBlock(block.id, {
                                  aggregate: e.target
                                    .value as DashboardBlock["aggregate"]
                                })
                              }
                            >
                              {(
                                [
                                  "count",
                                  "avg",
                                  "median",
                                  "sum",
                                  "min",
                                  "max"
                                ] as const
                              ).map((a) => (
                                <option value={a} key={a}>
                                  {tr(a)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          {tr("unit")}
                          <input
                            maxLength={40}
                            value={block.unit || ""}
                            onChange={(e) =>
                              changeBlock(block.id, { unit: e.target.value })
                            }
                          />
                        </label>
                        <DashboardResults
                          terria={terria}
                          config={{ ...config, blocks: [block] }}
                          result={result}
                        />
                      </section>
                    );
                  })}
                  <button
                    type="button"
                    disabled={config.blocks.length >= 6}
                    onClick={addBlock}
                  >
                    ＋ {tr("add")} ({config.blocks.length}/6)
                  </button>
                </>
              )}
              {step === "review" && (
                <>
                  <p>{tr("draft")}</p>
                  <DashboardResults
                    terria={terria}
                    config={config}
                    result={result}
                  />
                  <button
                    className="simple-primary"
                    type="button"
                    disabled={
                      busy ||
                      !config.blocks.length ||
                      !config.title.trim() ||
                      config.sources.some(
                        (s) => !s.resource_id && !s.catalog_url
                      )
                    }
                    onClick={() =>
                      void act(async () => {
                        const item = await api.request<SavedDashboard>(
                          saved ? `/${saved.id}` : "",
                          { config, revision: saved?.revision }
                        );
                        open(item);
                      })
                    }
                  >
                    {saved ? tr("update") : tr("save")}
                  </button>
                </>
              )}
              <div className="simple-actions">
                <button
                  type="button"
                  onClick={() =>
                    setStep(
                      step === "data"
                        ? "library"
                        : step === "blocks"
                          ? "data"
                          : "blocks"
                    )
                  }
                >
                  ← {tr("back")}
                </button>
                {step !== "review" && (
                  <button
                    className="simple-primary"
                    type="button"
                    disabled={!config.sources.length}
                    onClick={() =>
                      setStep(step === "data" ? "blocks" : "review")
                    }
                  >
                    {tr("next")} →
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Shell>
  );
});
export const Shell = styled.aside<{ $collapsed?: boolean; $drawing?: boolean }>`
  position: absolute;
  top: 136px;
  right: 62px;
  width: 380px;
  max-width: calc(100% - 30px);
  max-height: calc(100% - 162px);
  z-index: 96;
  background: #fff;
  color: #183c50;
  border: 1px solid #d5e2e9;
  border-radius: 12px;
  box-shadow: 0 6px 26px #102f4626;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  * {
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 14px 18px;
    border-bottom: 1px solid #deebf0;
  }
  header > div {
    flex: 1;
  }
  header small {
    color: #087bac;
    font-size: 10px;
    letter-spacing: 1px;
    font-weight: bold;
  }
  h2 {
    font-size: 21px;
    margin: 3px 0 10px;
  }
  header h2 {
    margin-bottom: 0;
  }
  h3 {
    font-size: 14px;
    margin: 0 0 10px;
  }
  .simple-scroll {
    overflow: auto;
    padding: 18px;
    min-height: 0;
  }
  label {
    display: block;
    font-weight: 600;
    margin: 12px 0 6px;
  }
  input,
  select {
    display: block;
    width: 100%;
    margin-top: 5px;
    padding: 9px;
    border: 1px solid #bfd5e2;
    border-radius: 5px;
    background: white;
    color: #183c50;
    font: inherit;
  }
  button {
    font: inherit;
    color: #086b91;
    border: 1px solid #c9dce6;
    background: #f4f9fc;
    border-radius: 6px;
    padding: 8px 10px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  :focus-visible {
    outline: 2px solid #087bac;
    outline-offset: 2px;
  }
  .simple-primary,
  nav button[aria-current] {
    background: #087bac;
    color: white;
    border-color: #087bac;
  }
  nav,
  .simple-row,
  .simple-actions {
    display: flex;
    gap: 8px;
    margin: 12px 0;
    flex-wrap: wrap;
  }
  .simple-row > label {
    flex: 1;
    min-width: 100px;
  }
  nav {
    gap: 4px;
  }
  nav button {
    flex: 1;
    font-size: 11px;
  }
  .simple-check {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .simple-check input {
    width: auto;
    margin: 0;
  }
  .simple-check small {
    font-weight: normal;
    width: 100%;
    color: #637f91;
  }
  .simple-card {
    border-left: 3px solid #087bac;
    border-radius: 5px;
    background: #f5f8fa;
    padding: 12px;
    margin: 14px 0;
  }
  .simple-card .simple-card {
    padding: 0;
    border: 0;
  }
  .simple-kpi {
    font-size: 28px;
    font-weight: 700;
    margin: 12px 0;
  }
  .simple-kpi small {
    font-size: 12px;
    font-weight: normal;
  }
  .simple-library-item {
    display: block;
    width: 100%;
    text-align: left;
    margin-top: 10px;
    padding: 14px;
  }
  .simple-library-item small {
    display: block;
    margin-top: 7px;
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
  .simple-hint,
  small {
    color: #526f82;
    line-height: 1.5;
  }
  [role="alert"] {
    color: #973b2a;
    background: #fff4ef;
    padding: 10px;
    border-radius: 5px;
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
    text-align: left;
    padding: 6px;
    border-bottom: 1px solid #dce6ec;
    white-space: nowrap;
  }
  @media (min-width: 769px) and (max-width: 1024px) {
    top: 168px;
    max-height: calc(100% - 194px);
  }
  @media (max-width: 768px) {
    top: auto;
    bottom: 10px;
    right: 10px;
    left: 10px;
    width: auto;
    max-width: none;
    max-height: ${(p) => (p.$drawing ? "28dvh" : "70dvh")};
  }
`;
