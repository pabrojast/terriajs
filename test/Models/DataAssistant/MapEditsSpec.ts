import { runInAction } from "mobx";
import Terria from "../../../lib/Models/Terria";
import GeoJsonCatalogItem from "../../../lib/Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import CogCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogCatalogItem";
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
  const noSource = () => Promise.reject(new Error("Unexpected catalog fetch"));
  const proposal = (operations: MapEdit[]): MapProposal => ({
    id: "test-proposal",
    title: "Map edit",
    base_revision: mapContext(terria).revision,
    operations
  });
  beforeEach(function () {
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
