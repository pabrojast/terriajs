import { runInAction } from "mobx";
import { keepAlive } from "mobx-utils";
import Terria from "../../../lib/Models/Terria";
import GeoJsonCatalogItem from "../../../lib/Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import CogCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogCatalogItem";
import CsvCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CsvCatalogItem";
import { JsonObject } from "../../../lib/Core/Json";
import CommonStrata from "../../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../../lib/Models/Definition/updateModelFromJson";
import {
  applyMapChanges,
  undoMapChanges,
  mapContext,
  canUndo
} from "../../../lib/Models/DataAssistant/MapEdits";
import { MapEdit, MapProposal } from "../../../lib/Models/DataAssistant/Types";
import { getShareData } from "../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";
import registerCatalogMembers from "../../../lib/Models/Catalog/registerCatalogMembers";

describe("DataAssistant map editing", function () {
  let terria: Terria;
  let layer: GeoJsonCatalogItem;
  let disposeCaches: (() => void)[];
  const noSource = () => Promise.reject(new Error("Unexpected catalog fetch"));
  const proposal = (operations: MapEdit[]): MapProposal => ({
    id: "test-proposal",
    title: "Map edit",
    base_revision: mapContext(terria).revision,
    operations
  });
  beforeEach(function () {
    disposeCaches = [];
    terria = new Terria({ baseUrl: "./" });
    layer = new GeoJsonCatalogItem("water", terria);
    updateModelFromJson(layer, CommonStrata.definition, {
      name: "Water",
      style: { stroke: "black", "stroke-width": 2 },
      geoJsonData: { type: "FeatureCollection", features: [] }
    }).throwIfError();
    terria.addModel(layer);
    runInAction(() => {
      terria.workbench.items = [layer];
    });
  });

  afterEach(() => disposeCaches.reverse().forEach((dispose) => dispose()));

  function wideTable(columnCount = 215) {
    const table = new CsvCatalogItem("wide-table", terria, undefined);
    // The real workbench observes these computed values. Keep the same cache
    // lifetime in this model-only test while exercising hundreds of columns.
    for (const key of [
      "tableColumns",
      "styles",
      "tableStyles",
      "activeTableStyle"
    ])
      disposeCaches.push(keepAlive(table, key));
    updateModelFromJson(table, CommonStrata.definition, {
      activeStyle: "value214",
      defaultStyle: {
        longitudeColumn: "longitude",
        latitudeColumn: "latitude",
        point: { null: { rotation: 15, width: 13, height: 13 } },
        color: { minimumValue: 0, maximumValue: 100 }
      },
      styles: [
        {
          id: "value214",
          color: { colorColumn: "value214", colorPalette: "Blues" }
        }
      ]
    }).throwIfError();
    terria.addModel(table);
    runInAction(() => {
      table.dataColumnMajor = [
        ["longitude", "-70", "-71"],
        ["latitude", "-30", "-31"],
        ...Array.from({ length: columnCount }, (_, i) => [
          "value" + (i === columnCount - 1 ? 214 : i),
          "1",
          "2"
        ])
      ];
      terria.workbench.items = [table];
    });
    return table;
  }

  it("keeps a wide table's active style and referenced columns within a compact context", () => {
    const table = wideTable();
    expect(table.styles.length).toBeGreaterThan(200);
    const context = mapContext(terria);
    const current = context.layers[0];
    const styles = current.traits.styles as JsonObject[];
    expect(styles.length).toBe(1);
    expect(styles[0].id).toBe("value214");
    expect(current.traits.activeStyle).toBe("value214");
    expect(styles[0].point).toEqual(
      jasmine.objectContaining({
        null: jasmine.objectContaining({ rotation: 15, width: 13, height: 13 })
      })
    );
    expect(styles[0].color).toEqual(
      jasmine.objectContaining({
        colorColumn: "value214",
        minimumValue: 0,
        maximumValue: 100
      })
    );
    expect(current.columns?.length).toBe(200);
    expect(current.columns?.map((c) => c.name)).toEqual(
      jasmine.arrayContaining(["value214", "longitude", "latitude"])
    );
    expect(JSON.stringify(context).length).toBeLessThan(25000);
    // Inactive manual changes must still invalidate an outstanding proposal.
    updateModelFromJson(table, CommonStrata.user, {
      styles: [{ id: "value0", color: { nullColor: "red" } }]
    }).throwIfError();
    expect(mapContext(terria).revision).not.toBe(context.revision);
    expect(mapContext(terria).layers[0].traits).toEqual(current.traits);
  });

  it("describes the effective default style when a named table style is unavailable", () => {
    const table = wideTable();
    updateModelFromJson(table, CommonStrata.user, {
      activeStyle: "missing-style",
      defaultStyle: { color: { colorColumn: "value214" } }
    }).throwIfError();
    const current = mapContext(terria).layers[0];
    const styles = current.traits.styles as JsonObject[];
    expect(current.traits.activeStyle).toBe(table.activeTableStyle.id);
    expect(styles.map((s) => s.id)).toEqual([table.activeTableStyle.id]);
    expect(current.columns?.some((c) => c.name === "value214")).toBe(true);
  });

  it("preserves inactive user styles through compact proposals, sharing and undo", async () => {
    const table = wideTable(3);
    // Inline CSV lets a second Terria instance reopen this share without HTTP.
    runInAction(() =>
      table.setTrait(
        CommonStrata.definition,
        "csvString",
        table
          .dataColumnMajor![0].map((_, row) =>
            table.dataColumnMajor!.map((column) => column[row]).join(",")
          )
          .join("\n")
      )
    );
    const inactive = { id: "value0", color: { colorPalette: "Greens" } };
    const original = [
      inactive,
      { id: "value214", pointSize: { nullSize: 17 } }
    ];
    updateModelFromJson(table, CommonStrata.user, {
      styles: original
    }).throwIfError();
    const current = mapContext(terria).layers[0];
    const active = (current.traits.styles as JsonObject[])[0];
    const undo = await applyMapChanges(
      terria,
      proposal([
        {
          kind: "update_layer",
          source_id: "layer:wide-table",
          traits: {
            activeStyle: "assistant-red",
            styles: [
              ...(current.traits.styles as JsonObject[]),
              {
                ...active,
                id: "assistant-red",
                color: { mapType: "constant", nullColor: "#ff0000" }
              }
            ]
          }
        }
      ]),
      noSource,
      () => true
    );
    const saved = table.traits.styles.toJson(
      table.getTrait(CommonStrata.user, "styles")
    ) as JsonObject[];
    expect(saved.find((s) => s.id === "value0")).toEqual(inactive);
    expect(saved.length).toBe(3);
    expect(table.activeTableStyle.colorTraits.nullColor).toBe("#ff0000");
    expect(
      table.activeTableStyle.colorMap.mapValueToColor(1).toCssHexString()
    ).toBe("#ff0000");
    expect(table.activeTableStyle.pointSizeTraits.nullSize).toBe(17);
    const share = getShareData(terria);
    registerCatalogMembers();
    const restored = new Terria({ baseUrl: "./" });
    for (const initData of share.initSources ?? [])
      if (typeof initData === "object")
        await restored.applyInitData({ initData });
    const reopened = restored.workbench.items[0] as CsvCatalogItem;
    for (const key of [
      "tableColumns",
      "styles",
      "tableStyles",
      "activeTableStyle"
    ])
      disposeCaches.push(keepAlive(reopened, key));
    expect(reopened.activeStyle).toBe("assistant-red");
    expect(
      reopened.activeTableStyle.colorMap.mapValueToColor(1).toCssHexString()
    ).toBe("#ff0000");
    expect(
      reopened.styles.find((s) => s.id === "value0")?.color.colorPalette
    ).toBe("Greens");
    await undoMapChanges(terria, undo);
    expect(table.activeStyle).toBe("value214");
    expect(
      table.traits.styles.toJson(table.getTrait(CommonStrata.user, "styles"))
    ).toEqual(original);
  });

  it("restores inherited private symbol URLs when updating an existing compact style", async () => {
    const table = new CsvCatalogItem("symbols", terria, undefined);
    updateModelFromJson(table, CommonStrata.definition, {
      activeStyle: "named",
      defaultStyle: {
        point: { null: { marker: "https://example.test/private-symbol.svg" } }
      },
      styles: [{ id: "named", color: { colorColumn: "value" } }]
    }).throwIfError();
    terria.addModel(table);
    runInAction(() => {
      table.dataColumnMajor = [["value", "1", "2"]];
      terria.workbench.items = [table];
    });
    const context = mapContext(terria);
    expect(JSON.stringify(context)).not.toContain("private-symbol");
    await applyMapChanges(
      terria,
      proposal([
        {
          kind: "update_layer",
          source_id: "layer:symbols",
          traits: { styles: context.layers[0].traits.styles }
        }
      ]),
      noSource,
      () => true
    );
    expect(table.activeTableStyle.styleTraits.point.null.marker).toBe(
      "https://example.test/private-symbol.svg"
    );
  });

  it("changes presentation, preserves the original definition and undoes only affected traits", async function () {
    const undo = await applyMapChanges(
      terria,
      proposal([
        {
          kind: "update_layer",
          source_id: "layer:water",
          traits: { name: "Blue water", show: false }
        }
      ]),
      noSource,
      () => true
    );
    expect(layer.name).toBe("Blue water");
    expect(layer.show).toBe(false);
    expect(layer.getTrait(CommonStrata.definition, "name")).toBe("Water");
    runInAction(() =>
      layer.setTrait(CommonStrata.user, "description", "Manual notes")
    );
    await undoMapChanges(terria, undo);
    expect(layer.name).toBe("Water");
    expect(layer.show).toBe(true);
    expect(layer.description).toBe("Manual notes");
    expect(layer.getTrait(CommonStrata.user, "name")).toBeUndefined();
  });

  it("rejects stale proposals and conflicting undo without overwriting manual edits", async function () {
    const pending = proposal([
      {
        kind: "update_layer",
        source_id: "layer:water",
        traits: { name: "AI name" }
      }
    ]);
    runInAction(() => layer.setTrait(CommonStrata.user, "name", "Manual name"));
    await expectAsync(
      applyMapChanges(terria, pending, noSource, () => true)
    ).toBeRejected();
    expect(layer.name).toBe("Manual name");
    const undo = await applyMapChanges(
      terria,
      proposal(pending.operations),
      noSource,
      () => true
    );
    runInAction(() =>
      layer.setTrait(CommonStrata.user, "name", "Later manual name")
    );
    expect(canUndo(terria, undo)).toBe(false);
    await expectAsync(undoMapChanges(terria, undo)).toBeRejected();
    expect(layer.name).toBe("Later manual name");
  });

  it("keeps external style references local when applying the redacted model context", async function () {
    updateModelFromJson(layer, CommonStrata.definition, {
      style: {
        "marker-symbol": "https://example.test/private-symbol.svg",
        stroke: "black"
      }
    }).throwIfError();
    const context = mapContext(terria);
    expect(JSON.stringify(context)).not.toContain("private-symbol");
    const style = context.layers[0].traits.style as Record<string, string>;
    await applyMapChanges(
      terria,
      proposal([
        {
          kind: "update_layer",
          source_id: "layer:water",
          traits: { style: { ...style, stroke: "blue" } }
        }
      ]),
      noSource,
      () => true
    );
    expect(layer.style?.["marker-symbol"]).toBe(
      "https://example.test/private-symbol.svg"
    );
    expect(layer.style?.stroke).toBe("blue");
  });

  it("validates every operation before applying any part of a batch", async function () {
    const pending = proposal([
      {
        kind: "update_layer",
        source_id: "layer:water",
        traits: { name: "Must not apply" }
      },
      {
        kind: "update_layer",
        source_id: "layer:water",
        traits: { url: "https://untrusted.example/data" }
      }
    ]);
    await expectAsync(
      applyMapChanges(terria, pending, noSource, () => true)
    ).toBeRejected();
    expect(layer.name).toBe("Water");
  });

  it("undoes a reused CKAN layer without removing its existing catalog registration", async function () {
    const rid = "12345678-1234-1234-1234-123456789abc";
    const existing = new GeoJsonCatalogItem("assistant/" + rid, terria);
    updateModelFromJson(existing, CommonStrata.definition, {
      geoJsonData: { type: "FeatureCollection", features: [] }
    }).throwIfError();
    terria.addModel(existing);
    runInAction(() =>
      terria.catalog.userAddedDataGroup.add(CommonStrata.user, existing)
    );
    const undo = await applyMapChanges(
      terria,
      proposal([{ kind: "add_ckan", resource_id: rid }]),
      async () => ({
        source: { id: "ckan:" + rid, name: "Existing", format: "GeoJSON" },
        views: [],
        model: { type: "geojson" }
      }),
      () => true
    );
    expect(terria.workbench.contains(existing)).toBe(true);
    await undoMapChanges(terria, undo);
    expect(terria.workbench.contains(existing)).toBe(false);
    expect(terria.getModelById(GeoJsonCatalogItem, existing.uniqueId!)).toBe(
      existing
    );
    expect(terria.catalog.userAddedDataGroup.members).toContain(
      existing.uniqueId!
    );
  });

  it("rolls back earlier edits when a viewer operation fails", async function () {
    spyOn(terria.currentViewer, "zoomTo").and.returnValue(
      Promise.reject(new Error("Viewer failed"))
    );
    await expectAsync(
      applyMapChanges(
        terria,
        proposal([
          {
            kind: "update_layer",
            source_id: "layer:water",
            traits: { name: "Temporary" }
          },
          { kind: "zoom", source_id: "layer:water" }
        ]),
        noSource,
        () => true
      )
    ).toBeRejected();
    expect(layer.name).toBe("Water");
  });

  it("restores order and removed layers without deleting their models", async function () {
    const other = new GeoJsonCatalogItem("other", terria);
    terria.addModel(other);
    runInAction(() => {
      terria.workbench.items = [layer, other];
    });
    const undo = await applyMapChanges(
      terria,
      proposal([
        {
          kind: "update_layer",
          source_id: "layer:water",
          traits: { name: "Changed" }
        },
        { kind: "remove_layer", source_id: "layer:water" }
      ]),
      noSource,
      () => true
    );
    expect(terria.workbench.itemIds).toEqual(["other"]);
    await undoMapChanges(terria, undo);
    expect(terria.workbench.itemIds).toEqual(["water", "other"]);
    expect(layer.name).toBe("Water");
  });

  it("does not add a resource after the account changed during loading", async function () {
    let authorized = true;
    await expectAsync(
      applyMapChanges(
        terria,
        proposal([
          {
            kind: "add_ckan",
            resource_id: "00000000-0000-0000-0000-000000000001"
          }
        ]),
        async () => {
          authorized = false;
          return {
            source: { id: "resource", name: "Private", format: "geojson" },
            views: [],
            model: { type: "geojson", shareable: false }
          };
        },
        () => authorized
      )
    ).toBeRejected();
    expect(terria.workbench.itemIds).toEqual(["water"]);
  });

  it("keeps regenerated raster legends consistent and preserves the prior legend on undo", async function () {
    const raster = new CogCatalogItem("raster", terria);
    updateModelFromJson(raster, CommonStrata.definition, {
      legends: [{ title: "Original" }],
      renderOptions: {
        single: {
          domain: [0, 10],
          colorScale: "greens",
          colorScaleMode: "named"
        }
      }
    }).throwIfError();
    terria.addModel(raster);
    runInAction(() => {
      terria.workbench.items = [raster];
    });
    const undo = await applyMapChanges(
      terria,
      proposal([
        {
          kind: "update_layer",
          source_id: "layer:raster",
          traits: {
            renderOptions: {
              single: {
                domain: [0, 100],
                colorScale: "bluered",
                colorScaleMode: "named"
              }
            },
            legends: []
          },
          refresh_legend: true
        }
      ]),
      noSource,
      () => true
    );
    expect(raster.legends?.length).toBeGreaterThan(0);
    expect(raster.legends?.[0].title).not.toBe("Original");
    await undoMapChanges(terria, undo);
    expect(raster.legends?.[0].title).toBe("Original");
    expect(raster.renderOptions?.single?.domain).toEqual([0, 10]);
  });

  it("serializes edited map state and restores it through Terria init data", async function () {
    registerCatalogMembers();
    await applyMapChanges(
      terria,
      proposal([
        {
          kind: "update_layer",
          source_id: "layer:water",
          traits: {
            name: "Shared water",
            style: { stroke: "blue", "stroke-width": 4 }
          }
        }
      ]),
      noSource,
      () => true
    );
    const share = getShareData(terria);
    const restored = new Terria({ baseUrl: "./" });
    for (const initData of share.initSources ?? [])
      if (typeof initData === "object")
        await restored.applyInitData({ initData });
    const item = restored.workbench.items[0] as GeoJsonCatalogItem;
    expect(item.name).toBe("Shared water");
    expect(item.style.stroke).toBe("blue");
    expect(item.style["stroke-width"]).toBe(4);
    expect(JSON.stringify(share)).not.toContain("proposals");
  });
});
