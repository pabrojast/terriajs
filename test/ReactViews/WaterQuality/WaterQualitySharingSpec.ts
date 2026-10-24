import CogTimeSeriesCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import GeoJsonCatalogItem from "../../../lib/Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import CommonStrata from "../../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../../lib/Models/Definition/updateModelFromJson";
import Terria from "../../../lib/Models/Terria";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import { getShareData } from "../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";
import configureWaterQualityOverlay from "../../../lib/ReactViews/WaterQuality/configureWaterQualityOverlay";
import activateWaterQualityProduct from "../../../lib/ReactViews/WaterQuality/activateWaterQualityProduct";
import observeWaterQualityTimeline from "../../../lib/ReactViews/WaterQuality/observeWaterQualityTimeline";
import Result from "../../../lib/Core/Result";

describe("Water quality sharing", function () {
  it("restores the visible product after the real init reader orders the timeline by workbench", async function () {
    const terria = new Terria({ baseUrl: "./" });
    const [chl, tur] = ["chl", "tur"].map((product) => {
      const item = new CogTimeSeriesCatalogItem(`wq-${product}`, terria);
      updateModelFromJson(item, CommonStrata.definition, {
        waterQuality: { pilotId: "madagascar", product: product.toUpperCase() },
        startTime: "2023-01-01T00:00:00Z",
        stopTime: "2026-10-06T00:00:00Z",
        currentTime: "2026-09-29T00:00:00Z",
        activeResolutionId: "daily",
        activeBandId: "median",
        resolutions: [{ id: "daily" }],
        waterQualityBodyIds: ["15", "1", "16"],
        show: product === "tur"
      });
      spyOn(item, "loadMapItems").and.returnValue(
        Promise.resolve(new Result(undefined))
      );
      terria.addModel(item);
      return item;
    });
    const initData = {
      workbench: ["wq-chl", "wq-tur"],
      timeline: ["wq-tur", "wq-chl"]
    };
    await terria.applyInitData({ initData });
    expect(terria.timelineStack.top).toBe(chl);
    const dispose = observeWaterQualityTimeline(tur);
    expect(terria.timelineStack.top).toBe(tur);
    // Also cover a later asynchronous init application while the panel is open.
    await terria.applyInitData({ initData });
    expect(terria.timelineStack.top).toBe(tur);
    expect(tur.currentTime).toBe("2026-09-29T00:00:00Z");
    expect(tur.activeResolutionId).toBe("daily");
    expect(tur.activeBandId).toBe("median");
    expect(tur.waterQualityBodyIds).toEqual(["15", "1", "16"]);
    expect(terria.timelineStack.itemIds).toEqual(["wq-tur", "wq-chl"]);
    dispose();
    chl.dispose();
    tur.dispose();
  });

  it("does not replace another dataset on the timeline or keep observing after unmount", function () {
    const terria = new Terria({ baseUrl: "./" });
    const [chl, tur, other] = ["chl", "tur", "other"].map((product) => {
      const item = new CogTimeSeriesCatalogItem(product, terria);
      updateModelFromJson(item, CommonStrata.definition, {
        waterQuality:
          product === "other" ? undefined : { pilotId: "madagascar" },
        currentTime: "2026-09-29T00:00:00Z",
        startTime: "2023-01-01T00:00:00Z",
        stopTime: "2026-10-06T00:00:00Z",
        show: product !== "chl"
      });
      return item;
    });
    terria.timelineStack.addToTop(tur);
    terria.timelineStack.addToTop(other);
    const dispose = observeWaterQualityTimeline(tur);
    expect(terria.timelineStack.top).toBe(other);
    dispose();
    terria.timelineStack.addToTop(chl);
    expect(terria.timelineStack.top).toBe(chl);
    [chl, tur, other].forEach((item) => item.dispose());
  });

  it("promotes the visible product while retaining time, resolution and shared body IDs", function () {
    const terria = new Terria({ baseUrl: "./" });
    const products = ["chl", "tur"].map((product) => {
      const item = new CogTimeSeriesCatalogItem(`wq-${product}`, terria);
      updateModelFromJson(item, CommonStrata.definition, {
        startTime: "2023-01-01T00:00:00Z",
        stopTime: "2026-10-06T00:00:00Z",
        currentTime: "2026-09-29T00:00:00Z",
        activeResolutionId: product === "chl" ? "daily" : "annual",
        resolutions: [{ id: "annual" }, { id: "daily" }],
        waterQualityBodyIds: ["15", "1", "16"]
      });
      item.setTrait(CommonStrata.user, "waterQualityBodyIds", [
        "15",
        "1",
        "16"
      ]);
      terria.addModel(item);
      return item;
    });
    const [chl, tur] = products;
    terria.timelineStack.addToTop(chl);
    terria.timelineStack.activate();
    activateWaterQualityProduct(chl, tur, products, "daily");
    expect(terria.timelineStack.top).toBe(tur);
    expect(tur.show).toBe(true);
    expect(chl.show).toBe(false);
    expect(tur.activeResolutionId).toBe("daily");
    expect(tur.currentTime).toBe("2026-09-29T00:00:00Z");
    expect(tur.waterQualityBodyIds).toEqual(["15", "1", "16"]);

    terria.timelineClock.currentTime = JulianDate.fromIso8601(
      "2026-10-06T00:00:00Z"
    );
    terria.timelineClock.onTick.raiseEvent(terria.timelineClock);
    expect(
      JulianDate.equals(
        tur.currentTimeAsJulianDate,
        terria.timelineClock.currentTime
      )
    ).toBe(true);

    activateWaterQualityProduct(tur, chl, products, "annual");
    expect(terria.timelineStack.top).toBe(chl);
    expect(terria.timelineStack.itemIds).toEqual(["wq-chl", "wq-tur"]);
    expect(chl.activeBandId).toBe("mean");
    expect(chl.currentTime).toBe(tur.currentTime);
    const share = getShareData(terria);
    const source = share.initSources.find(
      (source) => typeof source === "object" && "models" in source
    ) as any;
    expect(source.timeline).toEqual(["wq-chl", "wq-tur"]);
    expect(source.models["wq-chl"].activeResolutionId).toBe("annual");
    expect(source.models["wq-chl"].currentTime).toBe(chl.currentTime);
    expect(source.models["wq-chl"].waterQualityBodyIds).toEqual([
      "15",
      "1",
      "16"
    ]);
    terria.timelineStack.deactivate();
    products.forEach((item) => item.dispose());
  });

  it("shares body selection without serializing the derived boundary geometry", function () {
    const terria = new Terria({ baseUrl: "./" });
    const item = new CogTimeSeriesCatalogItem("wq-ukraine-chl", terria);
    item.setTrait(CommonStrata.user, "waterQualityBodyIds", ["4", "1"]);
    terria.addModel(item);
    const overlay = new GeoJsonCatalogItem(
      "water-quality-bodies-ukraine",
      terria
    );
    configureWaterQualityOverlay(
      overlay,
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { id: 4, name: "Kyiv Reservoir" },
            geometry: { type: "Point", coordinates: [30.5, 50.7] }
          }
        ]
      },
      "ukraine",
      "Water-body boundaries"
    );
    terria.addModel(overlay);

    const share = getShareData(terria);
    const models = Object.assign(
      {},
      ...share.initSources.map((source) =>
        typeof source === "object" && "models" in source ? source.models : {}
      )
    );
    expect(models["wq-ukraine-chl"].waterQualityBodyIds).toEqual(["4", "1"]);
    expect(models["water-quality-bodies-ukraine"]).toBeUndefined();
    expect(JSON.stringify(share)).not.toContain("geoJsonData");
    expect((overlay.geoJsonData as any).features[0].properties).toEqual({
      id: 4,
      name: "Kyiv Reservoir",
      waterQualityBodyId: 4,
      waterQualityPilot: "ukraine"
    });
    overlay.dispose();
    item.dispose();
  });
});
