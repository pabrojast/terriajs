import CogTimeSeriesCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import GeoJsonCatalogItem from "../../../lib/Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import CommonStrata from "../../../lib/Models/Definition/CommonStrata";
import Terria from "../../../lib/Models/Terria";
import { getShareData } from "../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";
import configureWaterQualityOverlay from "../../../lib/ReactViews/WaterQuality/configureWaterQualityOverlay";

describe("Water quality sharing", function () {
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
