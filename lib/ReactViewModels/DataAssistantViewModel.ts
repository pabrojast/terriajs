import i18next from "i18next";
import { makeAutoObservable, reaction, runInAction } from "mobx";
import type { Polygon } from "geojson";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import type Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import { isSafeRelativePath } from "../Models/CkanSession";
import {
  findLayer,
  layerSources,
  selectedLayerDateRange,
  readLayerRows,
  runLayerTool
} from "../Models/DataAssistant/LayerTools";
import { filterRows } from "../Models/DataAssistant/TableTools";
import {
  DataQuery,
  DataTurn,
  MapAction,
  Row,
  MapProposal,
  MapSource
} from "../Models/DataAssistant/Types";
import {
  mapContext,
  applyMapChanges,
  undoMapChanges,
  canUndo,
  MapUndo
} from "../Models/DataAssistant/MapEdits";
import CkanItemReference from "../Models/Catalog/Ckan/CkanItemReference";
import CsvCatalogItem from "../Models/Catalog/CatalogItems/CsvCatalogItem";
import GeoJsonCatalogItem from "../Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import GeoJsonMixin from "../ModelMixins/GeojsonMixin";
import MappableMixin from "../ModelMixins/MappableMixin";
import CommonStrata from "../Models/Definition/CommonStrata";
import { BaseModel } from "../Models/Definition/Model";
import UserDrawing from "../Models/UserDrawing";
import ViewState from "./ViewState";

export function dataCsv(rows: Row[], spreadsheetSafe = true): string {
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const escape = (value: unknown) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (
      spreadsheetSafe &&
      typeof value === "string" &&
      /^[=+\-@\t\r]/.test(text)
    )
      text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return [
    columns.map(escape).join(","),
    ...rows.map((r) => columns.map((c) => escape(r[c])).join(","))
  ].join("\r\n");
}
export interface ChatEntry {
  question: string;
  turn?: DataTurn;
}
const instances = new WeakMap<ViewState, DataAssistantViewModel>();
export function getDataAssistant(viewState: ViewState): DataAssistantViewModel {
  let vm = instances.get(viewState);
  if (!vm) {
    vm = new DataAssistantViewModel(viewState);
    instances.set(viewState, vm);
    viewState.disposeDataAssistant = () => {
      vm!.dispose();
      instances.delete(viewState);
    };
  }
  return vm;
}

export default class DataAssistantViewModel {
  entries: ChatEntry[] = [];
  selectedIds: string[] = [];
  busy = false;
  error = "";
  progress = "";
  start = "";
  end = "";
  datesAutomatic = true;
  polygon: Polygon | undefined;
  point: [number, number] | undefined;
  drawing = false;
  ready = false;
  mapEditing = false;
  editing = false;
  appliedIds: string[] = [];
  history: MapUndo[] = [];
  private csrf = "";
  private conversation: string | undefined;
  private turnId: string | undefined;
  private generation = 0;
  private controller: AbortController | undefined;
  private drawingTool: UserDrawing | undefined;
  private derived: BaseModel[] = [];
  private readonly disposeSession: () => void;
  private readonly disposeDates: () => void;

  constructor(readonly viewState: ViewState) {
    makeAutoObservable<this, "disposeSession" | "disposeDates">(
      this,
      { viewState: false, disposeSession: false, disposeDates: false },
      { autoBind: true }
    );
    this.selectedIds = this.sources.map((s) => s.id);
    this.disposeDates = reaction(
      () => ({
        selection: this.selectedIds.slice().sort().join("\n"),
        ...this.availableDateRange
      }),
      (next, previous) => {
        if (this.datesAutomatic || next.selection !== previous?.selection)
          this.useDataDates();
      },
      { fireImmediately: true }
    );
    this.disposeSession = reaction(
      () => {
        const session = viewState.terria.ckanSession;
        return { name: session?.user?.name, status: session?.status };
      },
      (next, previous) => {
        if (next.name !== previous.name || next.status === "anonymous")
          this.reset(false);
        else if (next.status !== "authenticated") this.cancel();
      }
    );
  }
  get sources() {
    return layerSources(this.viewState.terria);
  }
  get availableDateRange() {
    return selectedLayerDateRange(this.viewState.terria, this.selectedIds);
  }
  useDataDates() {
    this.datesAutomatic = true;
    this.start = this.availableDateRange.start;
    this.end = this.availableDateRange.end;
  }
  get authenticated() {
    return this.viewState.terria.ckanSession?.isAuthenticated === true;
  }
  private get base() {
    const value =
      this.viewState.terria.configParameters.dataAssistant?.apiBaseUrl ??
      "/api/terriassistant/data";
    if (
      !isSafeRelativePath(value) ||
      value.includes("?") ||
      value.includes("#")
    )
      throw new Error("Invalid assistant endpoint");
    return value.replace(/\/$/, "");
  }
  private async api<T>(
    path: string,
    method = "GET",
    data?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const response = await fetch(this.base + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "X-CSRFToken": this.csrf } : {})
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    // CKAN's theme/gateway can render HTML for an expired session or an outage.
    // Check HTTP status even when that response has no JSON error envelope.
    const payload = await response.json().catch(() => ({
      error: i18next.t("dataAssistant.requestFailed")
    }));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.viewState.terria.ckanSession?.handleUnauthorized(response.status);
      }
      if (response.status === 404)
        runInAction(() => {
          this.conversation = undefined;
        });
      throw new Error(
        payload.error ?? i18next.t("dataAssistant.requestFailed")
      );
    }
    return payload;
  }
  async initialize() {
    if (!this.authenticated) return;
    const gen = this.generation;
    try {
      const config = await this.api<{
        csrf_token: string;
        enabled: boolean;
        capabilities?: { map_editing?: number };
      }>("/bootstrap");
      if (gen !== this.generation) return;
      runInAction(() => {
        this.csrf = config.csrf_token;
        this.ready = config.enabled;
        this.mapEditing = config.capabilities?.map_editing === 1;
      });
      if (!config.enabled)
        throw new Error(i18next.t("dataAssistant.unavailable"));
    } catch (error) {
      if (gen === this.generation)
        runInAction(() => {
          this.error = String((error as Error).message);
        });
    }
  }
  toggleSource(id: string) {
    this.selectedIds = this.selectedIds.includes(id)
      ? this.selectedIds.filter((s) => s !== id)
      : [...this.selectedIds, id];
  }
  setDates(start: string, end: string) {
    this.datesAutomatic = false;
    this.start = start;
    this.end = end;
  }
  clearArea() {
    this.drawingTool?.cleanUp();
    this.drawingTool = undefined;
    this.polygon = undefined;
    this.point = undefined;
    this.drawing = false;
  }
  useArea(polygon: Polygon) {
    this.clearArea();
    this.polygon = JSON.parse(JSON.stringify(polygon));
  }
  usePickedPoint() {
    const position = this.viewState.terria.pickedFeatures?.pickPosition;
    if (!position) {
      this.error = i18next.t("dataAssistant.pickFirst");
      return;
    }
    this.clearArea();
    this.point = this.coordinate(position);
  }
  private coordinate(point: Cartesian3): [number, number] {
    const c = Cartographic.fromCartesian(point);
    return [
      CesiumMath.toDegrees(c.longitude),
      CesiumMath.toDegrees(c.latitude)
    ];
  }
  drawArea() {
    this.clearArea();
    this.drawing = true;
    this.drawingTool = new UserDrawing({
      terria: this.viewState.terria,
      allowPolygon: true,
      invisible: true,
      messageHeader: i18next.t("dataAssistant.draw"),
      completeOnClose: true,
      retainDrawingOnFinish: true,
      polygonStyle: { stroke: "#0F6B82", fill: "rgba(15,107,130,.15)" },
      canComplete: (points) => points.length >= 3,
      onDrawingComplete: ({ points }) =>
        runInAction(() => {
          const ring = points.map(this.coordinate);
          if (ring.length >= 3) {
            ring.push([...ring[0]]);
            this.polygon = { type: "Polygon", coordinates: [ring] };
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
  async ask(question: string) {
    if (this.busy || this.editing || !this.authenticated || !question.trim())
      return;
    this.busy = true;
    this.turnId = undefined;
    this.error = "";
    this.progress = "";
    const gen = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const entry: ChatEntry = { question };
    this.entries.push(entry);
    const index = this.entries.length - 1;
    const selection: Partial<DataQuery> = {
      ...(this.start ? { start: this.start } : {}),
      ...(this.end ? { end: this.end } : {}),
      ...(this.polygon ? { polygon: this.polygon } : {}),
      ...(this.point ? { point: this.point } : {})
    };
    const selectedSources = this.sources.filter((s) =>
      this.selectedIds.includes(s.id)
    );
    try {
      await this.initialize();
      if (!this.ready || gen !== this.generation) return;
      if (!this.conversation) {
        const created = await this.api<{ id: string }>(
          "/conversations",
          "POST",
          {},
          controller.signal
        );
        if (gen !== this.generation) return;
        runInAction(() => {
          this.conversation = created.id;
        });
      }
      let turn = await this.api<DataTurn>(
        `/conversations/${this.conversation}/turns`,
        "POST",
        {
          request_id: crypto.randomUUID(),
          question,
          sources: selectedSources,
          selection,
          ...(this.mapEditing
            ? { map_context: mapContext(this.viewState.terria) }
            : {})
        },
        controller.signal
      );
      if (gen !== this.generation) return;
      runInAction(() => {
        this.turnId = turn.id;
      });
      const deadline = Date.now() + 310000;
      while (gen === this.generation && !controller.signal.aborted) {
        const currentTurn = turn;
        runInAction(() => {
          this.entries[index] = { question, turn: currentTurn };
          this.progress = currentTurn.progress
            ? i18next.t(`dataAssistant.tools.${currentTurn.progress}`)
            : "";
        });
        if (["completed", "cancelled", "error"].includes(turn.status)) break;
        if (Date.now() > deadline)
          throw new Error(i18next.t("dataAssistant.timeout"));
        if (!this.authenticated)
          throw new Error(i18next.t("dataAssistant.signIn"));
        if (turn.status === "awaiting_tools") {
          const results = [];
          for (const call of turn.pending ?? []) {
            if (
              !selectedSources.some((s) => s.id === call.arguments.source_id) ||
              !["describe_source", "query_data"].includes(call.name)
            )
              throw new Error("Unrecognized layer tool");
            try {
              const result = await runLayerTool(
                this.viewState.terria,
                call,
                selection,
                controller.signal,
                (value) =>
                  runInAction(() => {
                    this.progress = value;
                  })
              );
              results.push({ id: call.id, result });
            } catch (error) {
              if (controller.signal.aborted) throw error;
              results.push({
                id: call.id,
                result: {
                  error: String((error as Error).message).slice(0, 300)
                }
              });
            }
          }
          if (gen !== this.generation) return;
          turn = await this.api<DataTurn>(
            `/turns/${turn.id}/tool-results`,
            "POST",
            { results },
            controller.signal
          );
        } else {
          await new Promise<void>((resolve) => setTimeout(resolve, 1500));
          if (gen !== this.generation || controller.signal.aborted) return;
          turn = await this.api<DataTurn>(
            `/turns/${turn.id}`,
            "GET",
            undefined,
            controller.signal
          );
        }
      }
    } catch (error) {
      if (gen === this.generation && !controller.signal.aborted)
        runInAction(() => {
          this.error = String((error as Error).message);
        });
    } finally {
      if (gen === this.generation)
        runInAction(() => {
          this.busy = false;
          this.controller = undefined;
        });
    }
  }
  cancel() {
    this.controller?.abort();
    if (this.busy && this.turnId && this.csrf && this.authenticated)
      void this.api(`/turns/${this.turnId}/cancel`, "POST", {}).catch(() => {});
    else if (
      this.busy &&
      this.conversation &&
      this.csrf &&
      this.authenticated
    ) {
      // A POST may have reached CKAN even if its response was aborted before we learned the turn ID.
      void this.api(`/conversations/${this.conversation}`, "DELETE").catch(
        () => {}
      );
      this.conversation = undefined;
    }
    this.generation++;
    this.busy = false;
    this.controller = undefined;
    const last = this.entries[this.entries.length - 1];
    if (last?.turn && !["completed", "error"].includes(last.turn.status))
      last.turn = { ...last.turn, status: "cancelled" };
  }
  reset(removeServer = true) {
    this.cancel();
    if (removeServer && this.conversation && this.authenticated)
      void this.api(`/conversations/${this.conversation}`, "DELETE").catch(
        () => {}
      );
    this.conversation = undefined;
    this.turnId = undefined;
    this.csrf = "";
    this.ready = false;
    this.mapEditing = false;
    this.editing = false;
    this.appliedIds = [];
    this.history = [];
    this.entries = [];
    this.error = "";
    this.clearArea();
    this.derived.forEach((item) => {
      this.viewState.terria.workbench.remove(item);
      this.viewState.terria.removeModelReferences(item);
    });
    this.derived = [];
    this.useDataDates();
  }
  async apply(action: MapAction) {
    this.error = "";
    try {
      await this.viewState.terria.ckanSession?.refresh();
      if (!this.authenticated)
        throw new Error(i18next.t("dataAssistant.signIn"));
      const terria = this.viewState.terria;
      if (this.mapEditing && action.action !== "filter") {
        const proposal: MapProposal = {
          id: crypto.randomUUID(),
          title: action.title ?? action.source.name,
          base_revision: mapContext(terria).revision,
          operations:
            action.action === "add_layer"
              ? [{ kind: "add_ckan", resource_id: action.source.resource_id! }]
              : [{ kind: "zoom", source_id: action.source_id }]
        };
        await this.applyProposal(proposal);
        return;
      }
      if (action.action === "add_layer") {
        if (
          !action.source.resource_id ||
          !/^[a-f0-9-]{36}$/i.test(action.source.resource_id)
        )
          throw new Error("Invalid CKAN resource");
        const id =
          "__ckan_private_catalog__/assistant/" + action.source.resource_id;
        let ref = terria.getModelById(CkanItemReference, id);
        if (!ref) {
          ref = new CkanItemReference(id, terria);
          runInAction(() => {
            ref!.setTrait(
              CommonStrata.definition,
              "url",
              window.location.origin
            );
            ref!.setTrait(
              CommonStrata.definition,
              "resourceId",
              action.source.resource_id
            );
            terria.addModel(ref!);
          });
        }
        (await ref.loadReference()).throwIfError();
        if (!ref.target)
          throw new Error(i18next.t("dataAssistant.unsupported"));
        (await terria.workbench.add(ref.target)).throwIfError();
        runInAction(() => {
          this.selectedIds.push("layer:" + ref!.target!.uniqueId);
        });
        return;
      }
      const item = findLayer(terria, action.source_id);
      if (action.action === "zoom") {
        if (!MappableMixin.isMixedInto(item))
          throw new Error("This layer has no map extent");
        await terria.currentViewer.zoomTo(item);
        return;
      }
      const data = readLayerRows(item);
      const filtered = filterRows(data.rows, {
        source_id: action.source_id,
        operation: "rows",
        filters: action.filters,
        start: action.start,
        end: action.end,
        date_column: action.date_column
      });
      const id =
        "__ckan_private_catalog__/assistant-filter/" + crypto.randomUUID();
      let derived: CsvCatalogItem | GeoJsonCatalogItem;
      if (GeoJsonMixin.isMixedInto(item) && item.readyData) {
        const indices = new Set(filtered);
        const geo = new GeoJsonCatalogItem(id, terria);
        geo.setTrait(
          CommonStrata.definition,
          "geoJsonData",
          JSON.parse(
            JSON.stringify({
              type: "FeatureCollection",
              features: item.readyData.features.filter((_f, i) =>
                indices.has(data.rows[i])
              )
            })
          )
        );
        derived = geo;
      } else {
        const csv = new CsvCatalogItem(id, terria, undefined);
        csv.setTrait(
          CommonStrata.definition,
          "csvString",
          dataCsv(filtered, false)
        );
        derived = csv;
      }
      runInAction(() => {
        derived.setTrait(
          CommonStrata.definition,
          "name",
          `${action.source.name} · ${i18next.t("dataAssistant.filtered")}`
        );
        derived.setTrait(CommonStrata.definition, "shareable", false);
        derived.setTrait(
          CommonStrata.definition,
          "ckanResourceId",
          action.source.resource_id
        );
        terria.addModel(derived);
        this.derived.push(derived);
      });
      (await terria.workbench.add(derived)).throwIfError();
    } catch (error) {
      runInAction(() => {
        this.error = String((error as Error).message);
      });
    }
  }
  get working() {
    return this.busy || this.editing;
  }
  get undoAvailable() {
    const last = this.history[this.history.length - 1];
    return !!last && canUndo(this.viewState.terria, last);
  }
  async loadMapSource(resourceId: string, viewId?: string) {
    return this.api<MapSource>(
      `/sources/${encodeURIComponent(resourceId)}/map${viewId ? "?view_id=" + encodeURIComponent(viewId) : ""}`
    );
  }
  async applyProposal(proposal: MapProposal) {
    if (this.working || this.appliedIds.includes(proposal.id)) return;
    const gen = this.generation;
    const user = this.viewState.terria.ckanSession?.user?.name;
    this.editing = true;
    this.error = "";
    try {
      await this.viewState.terria.ckanSession?.refresh();
      const authorized = () =>
        gen === this.generation &&
        this.authenticated &&
        this.viewState.terria.ckanSession?.user?.name === user;
      const undo = await applyMapChanges(
        this.viewState.terria,
        proposal,
        this.loadMapSource,
        authorized
      );
      if (!authorized()) return;
      runInAction(() => {
        this.history.push(undo);
        this.appliedIds.push(proposal.id);
        this.selectedIds = [
          ...new Set([
            ...this.selectedIds,
            ...undo.added.map((item) => "layer:" + item.uniqueId)
          ])
        ];
      });
    } catch (error) {
      if (gen === this.generation)
        runInAction(() => {
          this.error = (error as Error).message;
        });
    } finally {
      if (gen === this.generation)
        runInAction(() => {
          this.editing = false;
        });
    }
  }
  async undo() {
    const last = this.history[this.history.length - 1];
    if (this.working || !last) return;
    const gen = this.generation;
    this.editing = true;
    this.error = "";
    try {
      await this.viewState.terria.ckanSession?.refresh();
      if (gen !== this.generation || !this.authenticated) return;
      await undoMapChanges(this.viewState.terria, last);
      if (gen === this.generation)
        runInAction(() => {
          this.history.pop();
          this.appliedIds = this.appliedIds.filter((id) => id !== last.id);
        });
    } catch (error) {
      if (gen === this.generation)
        runInAction(() => {
          this.error = (error as Error).message;
        });
    } finally {
      if (gen === this.generation)
        runInAction(() => {
          this.editing = false;
        });
    }
  }
  dispose() {
    this.disposeDates();
    this.reset();
    this.disposeSession();
  }
}
