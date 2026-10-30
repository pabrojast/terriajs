import i18next from "i18next";
import { runInAction } from "mobx";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import getDereferencedIfExists from "../../Core/getDereferencedIfExists";
import JsonValue, { JsonObject } from "../../Core/Json";
import CatalogMemberMixin from "../../ModelMixins/CatalogMemberMixin";
import DiscretelyTimeVaryingMixin from "../../ModelMixins/DiscretelyTimeVaryingMixin";
import GeoJsonMixin from "../../ModelMixins/GeojsonMixin";
import MappableMixin from "../../ModelMixins/MappableMixin";
import TableMixin from "../../ModelMixins/TableMixin";
import TimeVarying from "../../ModelMixins/TimeVarying";
import TableColumnType from "../../Table/TableColumnType";
import CameraView from "../CameraView";
import CatalogMemberFactory from "../Catalog/CatalogMemberFactory";
import CogCatalogItem from "../Catalog/CatalogItems/CogCatalogItem";
import CogTimeSeriesCatalogItem from "../Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import { createAutomaticCogLegends } from "../Catalog/CatalogItems/CogLegendStratum";
import {
  getValidDomain,
  resolveCogColorStops
} from "../Catalog/CatalogItems/CogRenderStyle";
import WebMapServiceCatalogItem from "../Catalog/Ows/WebMapServiceCatalogItem";
import createCatalogItemFromFileOrUrl from "../Catalog/createCatalogItemFromFileOrUrl";
import CommonStrata from "../Definition/CommonStrata";
import { BaseModel } from "../Definition/Model";
import saveStratumToJson from "../Definition/saveStratumToJson";
import updateModelFromJson from "../Definition/updateModelFromJson";
import Terria from "../Terria";
import HasLocalData from "../HasLocalData";
import { findLayer, selectedLayerDateRange } from "./LayerTools";
import {
  AssistantMapContext,
  MapEdit,
  MapLayerContext,
  MapProposal,
  MapSource
} from "./Types";

const editable = [
  "name",
  "show",
  "opacity",
  "hideLegendInWorkbench",
  "style",
  "styles",
  "activeStyle",
  "defaultStyle",
  "renderOptions",
  "legends",
  "clampToGround",
  "forceCesiumPrimitives",
  "currentTime",
  "selectedBandId"
];
const copy = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

/** Stable fingerprint for optimistic checks; it is not an authorization token. */
export function fingerprint(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++)
    hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16) + ":" + json.length;
}

function effective(item: BaseModel, keys: readonly string[]): JsonObject {
  const result: JsonObject = {};
  const properties = item as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (item.traits[key]) {
      const value = item.traits[key].toJson(properties[key]);
      if (value !== undefined) result[key] = copy(value);
    }
  }
  return result;
}

/** The model sees presentation metadata, never source URLs, tokens or raw files. */
function forModel(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.slice(0, 200).map(forModel);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !/url|token|password|secret|template|html/i.test(key)
        )
        .map(([key, item]) => [key, forModel(item)])
    );
  if (typeof value === "string")
    return /:\/\//.test(value) ? "[external reference]" : value.slice(0, 500);
  return value;
}

/** Restore fields deliberately omitted from the model context before applying a style. */
function preservePrivateStyle(
  original: JsonValue,
  patch: JsonValue
): JsonValue {
  if (patch === "[external reference]") return copy(original);
  if (Array.isArray(patch) && Array.isArray(original)) {
    const result = patch.map((value, index) => {
      const id =
        value && typeof value === "object" && !Array.isArray(value)
          ? value.id
          : undefined;
      const previous =
        id === undefined
          ? original[index]
          : original.find(
              (entry) =>
                entry &&
                typeof entry === "object" &&
                !Array.isArray(entry) &&
                entry.id === id
            );
      return preservePrivateStyle(previous, value);
    });
    return result;
  }
  if (
    patch &&
    typeof patch === "object" &&
    !Array.isArray(patch) &&
    original &&
    typeof original === "object" &&
    !Array.isArray(original)
  ) {
    return Object.fromEntries(
      Object.entries({ ...original, ...patch }).map(([key, value]) => [
        key,
        key in patch ? preservePrivateStyle(original[key], value) : copy(value)
      ])
    );
  }
  return copy(patch);
}

function preserveStyleReferences(item: BaseModel, traits: JsonObject) {
  const current = effective(item, [
    "style",
    "styles",
    "defaultStyle",
    "renderOptions",
    "activeStyle"
  ]);
  for (const key of ["style", "styles", "defaultStyle", "renderOptions"]) {
    if (traits[key] === undefined) continue;
    if (
      key === "styles" &&
      Array.isArray(traits.styles) &&
      Array.isArray(current.styles)
    ) {
      const existing = current.styles;
      const active = existing.find(
        (style) =>
          style &&
          typeof style === "object" &&
          !Array.isArray(style) &&
          style.id === current.activeStyle
      );
      traits.styles = traits.styles.map((style) => {
        if (!style || typeof style !== "object" || Array.isArray(style))
          return style;
        const previous = existing.find(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            entry.id === style.id
        );
        return preservePrivateStyle(previous ?? active, style);
      });
    } else traits[key] = preservePrivateStyle(current[key], traits[key]);
  }
}

export function mapContext(terria: Terria): AssistantMapContext {
  const layers: MapLayerContext[] = terria.workbench.items
    .map(getDereferencedIfExists)
    .map((item) => {
      const capabilities = editable.filter((key) => !!item.traits[key]);
      if (MappableMixin.isMixedInto(item)) capabilities.push("zoom");
      if (TableMixin.isMixedInto(item)) capabilities.push("table_style");
      if (GeoJsonMixin.isMixedInto(item)) capabilities.push("vector_style");
      if (
        item instanceof CogCatalogItem ||
        item instanceof CogTimeSeriesCatalogItem
      )
        capabilities.push("raster_style");
      if (
        item instanceof WebMapServiceCatalogItem &&
        item.availableStyles.length === 1
      )
        capabilities.push("wms_style");
      const layer: MapLayerContext = {
        id: "layer:" + item.uniqueId,
        name: CatalogMemberMixin.isMixedInto(item)
          ? (item.name ?? item.uniqueId ?? "Layer").slice(0, 200)
          : "Layer",
        type: item.type,
        traits: forModel(effective(item, editable)) as JsonObject,
        capabilities,
        resource_id: CatalogMemberMixin.isMixedInto(item)
          ? item.ckanResourceId
          : undefined
      };
      if (TableMixin.isMixedInto(item))
        layer.columns = item.tableColumns.slice(0, 200).map((column) => ({
          name: column.name,
          type: TableColumnType[column.type]
        }));
      if (TimeVarying.is(item))
        layer.dates = selectedLayerDateRange(terria, [layer.id]);
      if (
        item instanceof WebMapServiceCatalogItem &&
        item.availableStyles.length === 1
      )
        layer.wms_styles = item.availableStyles[0].styles
          .map((style) => style.name)
          .filter((name): name is string => typeof name === "string")
          .slice(0, 100);
      if (item instanceof CogTimeSeriesCatalogItem)
        layer.bands = item.availableBands
          .map((b) => b.band)
          .filter((b): b is number => b !== undefined);
      return layer;
    });
  const basemaps = terria.baseMapsModel.baseMapItems.map(({ item }) => ({
    id: item.uniqueId!,
    name: CatalogMemberMixin.isMixedInto(item)
      ? (item.name ?? item.uniqueId!)
      : item.uniqueId!
  }));
  // Hash the full effective state, not the size-limited representation sent to the model.
  const revision = fingerprint({
    layers: terria.workbench.items
      .map(getDereferencedIfExists)
      .map((item) => [item.uniqueId, effective(item, editable)]),
    basemap: terria.mainViewer.baseMap?.uniqueId
  });
  return {
    revision,
    camera_revision: fingerprint(cameraKey(terria)),
    camera: Object.fromEntries(
      ["west", "south", "east", "north"].map((key) => [
        key,
        CesiumMath.toDegrees(
          terria.currentViewer.getCurrentCameraView().rectangle[
            key as keyof Rectangle
          ] as number
        )
      ])
    ) as AssistantMapContext["camera"],
    layers,
    basemaps,
    basemap_id: terria.mainViewer.baseMap?.uniqueId
  };
}

function refreshLegend(item: BaseModel, traits: JsonObject) {
  let legends: unknown;
  if (
    item instanceof CogCatalogItem ||
    item instanceof CogTimeSeriesCatalogItem
  ) {
    const single = item.renderOptions?.single;
    const domain =
      getValidDomain(single?.domain) ?? item.effectiveCogStyle?.domain;
    if (domain)
      legends = createAutomaticCogLegends(
        {
          isSingleBand: true,
          domain,
          stops: resolveCogColorStops(single, domain),
          applyDisplayRange: single?.applyDisplayRange ?? false,
          invalidDomain: false,
          invalidDisplayRange: false,
          clampLow: single?.clampLow ?? true,
          clampHigh: single?.clampHigh ?? true,
          type: single?.type ?? "continuous",
          numberOfBins: single?.numberOfBins ?? 8,
          reverseColorScale: single?.reverseColorScale ?? false
        },
        single?.numberOfBins,
        item instanceof CogTimeSeriesCatalogItem ? item.displayUnit : undefined
      );
  }
  if (
    traits.style &&
    typeof traits.style === "object" &&
    !Array.isArray(traits.style)
  ) {
    const style = traits.style;
    const color = style.fill ?? style.stroke ?? style["marker-color"];
    if (typeof color === "string")
      legends = [
        {
          items: [
            {
              title: CatalogMemberMixin.isMixedInto(item) ? item.name : "",
              color
            }
          ]
        }
      ];
  }
  if (!legends)
    for (const [name, stratum] of item.strataTopToBottom) {
      if (name === CommonStrata.user || name === CommonStrata.definition)
        continue;
      const value = (stratum as Record<string, unknown>).legends;
      if (Array.isArray(value) && value.length) {
        legends = value;
        break;
      }
    }
  if (legends && item.traits.legends) {
    const json = item.traits.legends.toJson(legends);
    if (json !== undefined)
      updateModelFromJson(item, CommonStrata.user, {
        legends: json
      }).throwIfError();
  }
}

function validateTraits(item: BaseModel, traits: JsonObject) {
  if (
    !Object.keys(traits).length ||
    Object.keys(traits).some(
      (key) => !editable.includes(key) || !item.traits[key]
    )
  )
    throw new Error(i18next.t("dataAssistant.unsupported"));
  if (
    traits.opacity !== undefined &&
    (typeof traits.opacity !== "number" ||
      !Number.isFinite(traits.opacity) ||
      traits.opacity < 0 ||
      traits.opacity > 1)
  )
    throw new Error("Invalid opacity");
  if (traits.currentTime !== undefined) {
    if (!TimeVarying.is(item) || typeof traits.currentTime !== "string")
      throw new Error("Invalid date");
    const time = JulianDate.fromIso8601(traits.currentTime);
    if (
      DiscretelyTimeVaryingMixin.isMixedInto(item) &&
      item.discreteTimes?.length
    ) {
      const match = item.discreteTimes.find((entry) =>
        traits.currentTime!.toString().length === 10
          ? entry.time.slice(0, 10) === traits.currentTime
          : JulianDate.equals(JulianDate.fromIso8601(entry.time), time)
      );
      if (!match) throw new Error(i18next.t("dataAssistant.unavailableDate"));
      traits.currentTime = match.time;
    } else if (
      (item.startTimeAsJulianDate &&
        JulianDate.lessThan(time, item.startTimeAsJulianDate)) ||
      (item.stopTimeAsJulianDate &&
        JulianDate.greaterThan(time, item.stopTimeAsJulianDate))
    )
      throw new Error(i18next.t("dataAssistant.unavailableDate"));
  }
  if (typeof traits.styles === "string") {
    if (
      !(item instanceof WebMapServiceCatalogItem) ||
      item.availableStyles.length !== 1 ||
      !item.availableStyles[0].styles.some(
        (style) => style.name === traits.styles
      )
    )
      throw new Error("Unknown WMS style");
  }
  if (Array.isArray(traits.styles) && TableMixin.isMixedInto(item)) {
    const columns = new Set(item.tableColumns.map((column) => column.name));
    const visit = (value: JsonValue) => {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (
          /Column$/.test(key) &&
          typeof entry === "string" &&
          !columns.has(entry)
        )
          throw new Error("Unknown column: " + entry);
        visit(entry);
      }
    };
    visit(traits.styles);
  }
  const candidate = item.duplicateModel(
    "assistant-validation/" + item.uniqueId
  );
  try {
    updateModelFromJson(candidate, CommonStrata.user, traits).throwIfError();
  } finally {
    candidate.dispose();
  }
}

interface LayerSnapshot {
  model: BaseModel;
  keys: string[];
  before: JsonObject;
  after?: string;
  afterPresent?: boolean;
}
export interface MapUndo {
  id: string;
  title: string;
  layers: LayerSnapshot[];
  order?: BaseModel[];
  afterOrder?: string;
  baseMap?: MappableMixin.Instance;
  afterBaseMap?: string;
  camera?: CameraView;
  afterCamera?: string;
  added: BaseModel[];
}

function userTraits(item: BaseModel): JsonObject {
  const stratum = item.strata.get(CommonStrata.user);
  return stratum ? copy(saveStratumToJson(item.traits, stratum)) : {};
}

function cameraKey(terria: Terria) {
  // Viewer implementations can differ in insignificant floating-point digits.
  return JSON.stringify(
    terria.currentViewer.getCurrentCameraView(),
    (_key, value) =>
      typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value
  );
}

export function canUndo(terria: Terria, undo: MapUndo): boolean {
  return (
    undo.layers.every(
      ({ model, keys, after, afterPresent }) =>
        terria.workbench.contains(model) === afterPresent &&
        fingerprint(effective(model, keys)) === after
    ) &&
    (undo.afterOrder === undefined ||
      undo.afterOrder === fingerprint(terria.workbench.itemIds)) &&
    (undo.afterBaseMap === undefined ||
      undo.afterBaseMap === terria.mainViewer.baseMap?.uniqueId) &&
    (undo.afterCamera === undefined || undo.afterCamera === cameraKey(terria))
  );
}

async function restore(terria: Terria, undo: MapUndo) {
  runInAction(() => {
    for (const { model, keys, before } of undo.layers) {
      for (const key of keys) {
        if (before[key] === undefined)
          model.setTrait(CommonStrata.user, key, undefined);
        else
          updateModelFromJson(model, CommonStrata.user, {
            [key]: before[key]
          }).throwIfError();
      }
    }
    if (undo.order) terria.workbench.items = undo.order;
    for (const item of undo.added) {
      terria.workbench.remove(item);
      terria.catalog.userAddedDataGroup.remove(CommonStrata.user, item);
      terria.removeModelReferences(item);
    }
  });
  if (undo.baseMap) await terria.mainViewer.setBaseMap(undo.baseMap);
  if (undo.camera) await terria.currentViewer.zoomTo(undo.camera, 0);
}

export async function undoMapChanges(terria: Terria, undo: MapUndo) {
  if (!canUndo(terria, undo))
    throw new Error(i18next.t("dataAssistant.editConflict"));
  await restore(terria, undo);
}

export async function applyMapChanges(
  terria: Terria,
  proposal: MapProposal,
  loadSource: (resourceId: string, viewId?: string) => Promise<MapSource>,
  stillAuthorized: () => boolean
): Promise<MapUndo> {
  const assertCurrent = () => {
    if (!stillAuthorized()) throw new Error(i18next.t("dataAssistant.signIn"));
    if (mapContext(terria).revision !== proposal.base_revision)
      throw new Error(i18next.t("dataAssistant.editConflict"));
    if (
      proposal.view_revision &&
      proposal.view_revision !== fingerprint(cameraKey(terria))
    )
      throw new Error(i18next.t("dataAssistant.editConflict"));
  };
  assertCurrent();
  if (!proposal.operations.length || proposal.operations.length > 20)
    throw new Error("Invalid map proposal");
  const operations = copy(proposal.operations);
  const staged = new Map<MapEdit, BaseModel>();
  const created: BaseModel[] = [];
  const undo: MapUndo = {
    id: proposal.id,
    title: proposal.title,
    layers: [],
    added: []
  };
  try {
    for (const op of operations) {
      if (op.kind === "add_ckan" || op.kind === "add_url") {
        let item: BaseModel | undefined;
        if (op.kind === "add_ckan") {
          if (!/^[a-f0-9-]{36}$/i.test(op.resource_id))
            throw new Error("Invalid resource identifier");
          const source = await loadSource(op.resource_id, op.view_id);
          assertCurrent();
          const json = source.model;
          const id =
            (json.shareable === false
              ? "__ckan_private_catalog__/assistant/"
              : "assistant/") +
            op.resource_id +
            (op.view_id ? "/" + op.view_id : "");
          item = terria.getModelById(BaseModel, id);
          if (!item) {
            item = CatalogMemberFactory.create(String(json.type), id, terria);
            if (!item) throw new Error(i18next.t("dataAssistant.unsupported"));
            updateModelFromJson(
              item,
              CommonStrata.definition,
              json
            ).throwIfError();
            terria.addModel(item);
            created.push(item);
          }
        } else {
          const url = new URL(op.url);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new Error("Invalid data URL");
          item = await createCatalogItemFromFileOrUrl(
            terria,
            op.url,
            op.format === "wfs" ? "wfs-features" : (op.format ?? "auto")
          );
          if (item) created.push(item);
          assertCurrent();
          if (item && op.name)
            item.setTrait(CommonStrata.user, "name", op.name);
        }
        if (!item || !MappableMixin.isMixedInto(item))
          throw new Error(i18next.t("dataAssistant.unsupported"));
        (await item.loadMapItems()).throwIfError();
        assertCurrent();
        staged.set(op, item);
      } else if (op.kind === "set_basemap") {
        const base = terria.baseMapsModel.baseMapItems.find(
          ({ item }) => item.uniqueId === op.basemap_id
        )?.item;
        if (!base || !terria.mainViewer.baseMap)
          throw new Error("Unknown base map");
        (await base.loadMapItems()).throwIfError();
        assertCurrent();
        undo.baseMap ??= terria.mainViewer.baseMap;
      } else if (op.kind === "set_view") {
        const { west, east, south, north } = op.rectangle;
        if (
          ![west, east, south, north].every(Number.isFinite) ||
          west < -180 ||
          west > 180 ||
          east < -180 ||
          east > 180 ||
          south < -90 ||
          north > 90 ||
          south >= north ||
          west === east
        )
          throw new Error("Invalid map extent");
        undo.camera ??= terria.currentViewer.getCurrentCameraView();
      } else {
        const item = findLayer(terria, op.source_id);
        staged.set(op, item);
        if (op.kind === "update_layer") {
          preserveStyleReferences(item, op.traits);
          validateTraits(item, op.traits);
          let snapshot = undo.layers.find((entry) => entry.model === item);
          if (!snapshot) {
            snapshot = { model: item, keys: [], before: userTraits(item) };
            undo.layers.push(snapshot);
          }
          snapshot.keys = [
            ...new Set([...snapshot.keys, ...Object.keys(op.traits)])
          ];
        } else if (op.kind === "zoom") {
          if (!MappableMixin.isMixedInto(item))
            throw new Error("Layer has no map extent");
          undo.camera ??= terria.currentViewer.getCurrentCameraView();
        } else if (
          op.kind === "move_layer" &&
          (!Number.isInteger(op.index) ||
            op.index < 0 ||
            op.index >= terria.workbench.items.length)
        )
          throw new Error("Invalid layer position");
      }
    }
    assertCurrent();
    if (
      operations.some((op) =>
        ["add_ckan", "add_url", "remove_layer", "move_layer"].includes(op.kind)
      )
    )
      undo.order = [...terria.workbench.items];
    try {
      for (const op of operations) {
        if (!stillAuthorized())
          throw new Error(i18next.t("dataAssistant.signIn"));
        const item = staged.get(op);
        if (op.kind === "update_layer") {
          updateModelFromJson(
            item!,
            CommonStrata.user,
            op.traits
          ).throwIfError();
          if (op.refresh_legend) refreshLegend(item!, op.traits);
        } else if (op.kind === "remove_layer") terria.workbench.remove(item!);
        else if (op.kind === "move_layer")
          terria.workbench.moveItemToIndex(item!, op.index);
        else if (op.kind === "set_view") {
          const { west, east, south, north } = op.rectangle;
          await terria.currentViewer.zoomTo(
            new CameraView(Rectangle.fromDegrees(west, south, east, north)),
            0
          );
        } else if (op.kind === "zoom")
          await terria.currentViewer.zoomTo(item as MappableMixin.Instance, 0);
        else if (op.kind === "set_basemap")
          await terria.mainViewer.setBaseMap(
            terria.baseMapsModel.baseMapItems.find(
              ({ item: base }) => base.uniqueId === op.basemap_id
            )!.item
          );
        else if (item && !terria.workbench.contains(item)) {
          undo.added.push(item);
          (await terria.workbench.add(item)).throwIfError();
          if (!stillAuthorized())
            throw new Error(i18next.t("dataAssistant.signIn"));
          terria.catalog.userAddedDataGroup.add(CommonStrata.user, item);
        }
      }
      if (!stillAuthorized())
        throw new Error(i18next.t("dataAssistant.signIn"));
      undo.layers.forEach((entry) => {
        entry.after = fingerprint(effective(entry.model, entry.keys));
        entry.afterPresent = terria.workbench.contains(entry.model);
      });
      if (undo.order) undo.afterOrder = fingerprint(terria.workbench.itemIds);
      if (undo.baseMap) undo.afterBaseMap = terria.mainViewer.baseMap?.uniqueId;
      if (undo.camera) undo.afterCamera = cameraKey(terria);
      return undo;
    } catch (error) {
      // Logout may have purged private models. Never restore them into another account.
      if (stillAuthorized()) await restore(terria, undo);
      throw error;
    }
  } catch (error) {
    runInAction(() =>
      created.forEach((item) => {
        terria.workbench.remove(item);
        terria.removeModelReferences(item);
      })
    );
    throw error;
  }
}

export async function addLocalFiles(
  terria: Terria,
  files: File[],
  authorized: () => boolean
): Promise<MapUndo> {
  const undo: MapUndo = {
    id: crypto.randomUUID(),
    title: files.map((file) => file.name).join(", "),
    layers: [],
    order: [...terria.workbench.items],
    added: []
  };
  try {
    for (const file of files) {
      if (!authorized()) throw new Error(i18next.t("dataAssistant.signIn"));
      const item = await createCatalogItemFromFileOrUrl(terria, file);
      if (!item || !HasLocalData.is(item) || !MappableMixin.isMixedInto(item))
        throw new Error(i18next.t("dataAssistant.unsupported"));
      undo.added.push(item);
      (await item.loadMapItems()).throwIfError();
      if (!authorized()) throw new Error(i18next.t("dataAssistant.signIn"));
    }
    if (
      fingerprint(terria.workbench.itemIds) !==
      fingerprint(undo.order!.map((item) => item.uniqueId))
    )
      throw new Error(i18next.t("dataAssistant.editConflict"));
    for (const item of undo.added) {
      (await terria.workbench.add(item)).throwIfError();
      if (!authorized()) throw new Error(i18next.t("dataAssistant.signIn"));
      terria.catalog.userAddedDataGroup.add(CommonStrata.user, item);
    }
    undo.afterOrder = fingerprint(terria.workbench.itemIds);
    return undo;
  } catch (error) {
    if (authorized()) await restore(terria, undo);
    else
      undo.added.forEach((item) => {
        terria.workbench.remove(item);
        terria.removeModelReferences(item);
      });
    throw error;
  }
}
