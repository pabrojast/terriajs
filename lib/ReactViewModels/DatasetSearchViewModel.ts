import i18next from "i18next";
import { makeAutoObservable, reaction, runInAction } from "mobx";
import type { Polygon } from "geojson";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import { isSafeRelativePath } from "../Models/CkanSession";
import {
  CatalogSearch,
  CatalogSearchResult,
  DataSourceRef,
  MapSource
} from "../Models/DataAssistant/Types";
import { applyMapChanges, mapContext } from "../Models/DataAssistant/MapEdits";
import UserDrawing from "../Models/UserDrawing";
import ViewState from "./ViewState";

const instances = new WeakMap<ViewState, DatasetSearchViewModel>();
export function getDatasetSearch(viewState: ViewState) {
  let vm = instances.get(viewState);
  if (!vm) {
    vm = new DatasetSearchViewModel(viewState);
    instances.set(viewState, vm);
    viewState.disposeDatasetSearch = () => {
      vm!.dispose();
      instances.delete(viewState);
    };
  }
  return vm;
}

/** Catalogue state belongs to the map session, never to an AI conversation. */
export default class DatasetSearchViewModel {
  query = "";
  format = "";
  organization = "";
  tags = "";
  polygon: Polygon | undefined;
  drawing = false;
  searching = false;
  loadingSource = false;
  error = "";
  result: CatalogSearchResult | undefined;
  request: CatalogSearch | undefined;
  mapSources = new Map<string, MapSource>();
  selectedViews = new Map<string, string>();
  added = new Map<string, { modelIds: string[]; viewId: string }>();
  private csrf = "";
  private generation = 0;
  private searchGeneration = 0;
  private controller: AbortController | undefined;
  private drawingTool: UserDrawing | undefined;
  private readonly disposeSession: () => void;

  constructor(readonly viewState: ViewState) {
    makeAutoObservable<this, "disposeSession">(
      this,
      { viewState: false, disposeSession: false },
      { autoBind: true }
    );
    this.disposeSession = reaction(
      () => ({
        name: viewState.terria.ckanSession?.user?.name,
        status: viewState.terria.ckanSession?.status
      }),
      (next, previous) => {
        if (next.name !== previous.name || next.status === "anonymous")
          this.reset();
      }
    );
  }
  get authenticated() {
    return this.viewState.terria.ckanSession?.isAuthenticated === true;
  }
  get working() {
    return this.searching || this.loadingSource || this.drawing;
  }
  private get base() {
    const base =
      this.viewState.terria.configParameters.dataAssistant?.apiBaseUrl ??
      "/api/terriassistant/data";
    if (!isSafeRelativePath(base) || base.includes("?") || base.includes("#"))
      throw new Error("Invalid catalogue endpoint");
    return base.replace(/\/$/, "");
  }
  private async api<T>(
    path: string,
    data?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const generation = this.generation;
    const response = await fetch(this.base + path, {
      method: data === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(data === undefined ? {} : { "X-CSRFToken": this.csrf })
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (
        generation === this.generation &&
        (response.status === 401 || response.status === 403)
      )
        this.viewState.terria.ckanSession?.handleUnauthorized(response.status);
      throw new Error(payload.error ?? i18next.t("datasetSearch.failed"));
    }
    return payload;
  }
  private invalidateSearch() {
    this.searchGeneration++;
    this.controller?.abort();
    this.controller = undefined;
    this.searching = false;
    this.request = undefined;
    this.result = undefined;
    this.error = "";
  }
  setFilter(key: "query" | "format" | "organization" | "tags", value: string) {
    this[key] = value;
    this.invalidateSearch();
  }
  setView(resourceId: string, viewId: string) {
    this.selectedViews.set(resourceId, viewId);
  }
  setArea(polygon: Polygon | undefined) {
    this.polygon = polygon ? JSON.parse(JSON.stringify(polygon)) : undefined;
    this.invalidateSearch();
  }
  clearArea() {
    this.drawingTool?.cleanUp();
    this.drawingTool = undefined;
    this.drawing = false;
    this.setArea(undefined);
  }
  drawArea() {
    if (this.working || !this.authenticated) return;
    this.clearArea();
    this.drawing = true;
    this.drawingTool = new UserDrawing({
      terria: this.viewState.terria,
      allowPolygon: true,
      invisible: true,
      messageHeader: i18next.t("datasetSearch.draw"),
      completeOnClose: true,
      retainDrawingOnFinish: true,
      polygonStyle: { stroke: "#0F6B82", fill: "rgba(15,107,130,.15)" },
      canComplete: (points) => points.length >= 3,
      onDrawingComplete: ({ points }) =>
        runInAction(() => {
          const ring = points.map((point) => {
            const c = Cartographic.fromCartesian(point);
            return [
              CesiumMath.toDegrees(c.longitude),
              CesiumMath.toDegrees(c.latitude)
            ];
          });
          if (ring.length >= 3) {
            ring.push([...ring[0]]);
            this.setArea({ type: "Polygon", coordinates: [ring] });
          }
          this.drawing = false;
        }),
      onCleanUp: () =>
        runInAction(() => {
          this.drawing = false;
        })
    });
    this.drawingTool.enterDrawMode();
  }
  /** Closing a tool cancels unfinished input; completed areas and results survive. */
  deactivate() {
    if (this.drawing) this.clearArea();
  }
  async search(more = false) {
    if (
      this.working ||
      !this.authenticated ||
      (more && !this.result?.next_cursor)
    )
      return;
    const generation = this.generation;
    const searchGeneration = ++this.searchGeneration;
    const controller = new AbortController();
    this.controller = controller;
    this.searching = true;
    this.error = "";
    const current = () =>
      generation === this.generation &&
      searchGeneration === this.searchGeneration;
    const request: CatalogSearch =
      more && this.request
        ? { ...this.request, cursor: this.result!.next_cursor! }
        : {
            query: this.query.trim(),
            ...(this.polygon
              ? { polygon: JSON.parse(JSON.stringify(this.polygon)) }
              : {}),
            ...(this.format ? { formats: [this.format] } : {}),
            ...(this.organization.trim()
              ? { organization: this.organization.trim() }
              : {}),
            ...(this.tags.trim()
              ? {
                  tags: this.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                }
              : {})
          };
    try {
      const config = await this.api<{
        csrf_token: string;
        capabilities?: { spatial_search?: number };
      }>("/bootstrap", undefined, controller.signal);
      if (!current()) return;
      if (config.capabilities?.spatial_search !== 1)
        throw new Error(i18next.t("datasetSearch.unavailable"));
      runInAction(() => {
        this.csrf = config.csrf_token;
      });
      const result = await this.api<CatalogSearchResult>(
        "/catalog/search",
        request,
        controller.signal
      );
      if (!current()) return;
      runInAction(() => {
        this.request = request;
        this.result = {
          ...result,
          sources: more
            ? [
                ...new Map(
                  [...(this.result?.sources ?? []), ...result.sources].map(
                    (s) => [s.id, s]
                  )
                ).values()
              ]
            : result.sources
        };
      });
    } catch (error) {
      if (current())
        runInAction(() => {
          this.error = (error as Error).message;
        });
    } finally {
      if (current())
        runInAction(() => {
          this.searching = false;
          this.controller = undefined;
        });
    }
  }
  loadMapSource(resourceId: string, viewId?: string) {
    return this.api<MapSource>(
      `/sources/${encodeURIComponent(resourceId)}/map${viewId ? "?view_id=" + encodeURIComponent(viewId) : ""}`
    );
  }
  async inspect(source: DataSourceRef) {
    if (!source.resource_id || this.working || !this.authenticated) return;
    const gen = this.generation;
    this.loadingSource = true;
    this.error = "";
    try {
      const result = await this.loadMapSource(source.resource_id);
      if (gen === this.generation)
        runInAction(() => this.mapSources.set(source.resource_id!, result));
    } catch (error) {
      if (gen === this.generation)
        runInAction(() => {
          this.error = (error as Error).message;
        });
    } finally {
      if (gen === this.generation)
        runInAction(() => {
          this.loadingSource = false;
        });
    }
  }
  isAdded(source: DataSourceRef) {
    const added = this.added.get(source.resource_id ?? "");
    return (
      !!added &&
      added.viewId === (this.selectedViews.get(source.resource_id!) ?? "") &&
      added.modelIds.length > 0 &&
      added.modelIds.every((id) =>
        this.viewState.terria.workbench.items.some(
          (item) => item.uniqueId === id
        )
      )
    );
  }
  async add(source: DataSourceRef) {
    if (
      !source.resource_id ||
      this.working ||
      !this.authenticated ||
      this.isAdded(source)
    )
      return;
    const gen = this.generation;
    const user = this.viewState.terria.ckanSession?.user?.name;
    const viewId = this.selectedViews.get(source.resource_id) ?? "";
    this.loadingSource = true;
    this.error = "";
    try {
      await this.viewState.terria.ckanSession?.refresh();
      const authorized = () =>
        gen === this.generation &&
        this.authenticated &&
        this.viewState.terria.ckanSession?.user?.name === user;
      if (!authorized()) return;
      const undo = await applyMapChanges(
        this.viewState.terria,
        {
          id: crypto.randomUUID(),
          title: source.name,
          base_revision: mapContext(this.viewState.terria).revision,
          operations: [
            {
              kind: "add_ckan",
              resource_id: source.resource_id,
              ...(viewId ? { view_id: viewId } : {})
            }
          ]
        },
        this.loadMapSource,
        authorized
      );
      if (authorized())
        runInAction(() => {
          this.added.set(source.resource_id!, {
            modelIds: undo.added.map((m) => m.uniqueId!),
            viewId
          });
        });
    } catch (error) {
      if (gen === this.generation)
        runInAction(() => {
          this.error = (error as Error).message;
        });
    } finally {
      if (gen === this.generation)
        runInAction(() => {
          this.loadingSource = false;
        });
    }
  }
  reset() {
    this.generation++;
    this.clearArea();
    this.query = this.format = this.organization = this.tags = this.csrf = "";
    this.loadingSource = false;
    this.mapSources.clear();
    this.selectedViews.clear();
    this.added.clear();
  }
  dispose() {
    this.disposeSession();
    this.reset();
  }
}
