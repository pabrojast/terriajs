import Terria from "../../../../lib/Models/Terria";
import StacCollectionCatalogItem from "../../../../lib/Models/Catalog/Stac/StacCollectionCatalogItem";
import terrascopeStacInit from "../../../../wwwroot/test/init/terrascope-stac-timeseries.json";

describe("Terrascope STAC init", function () {
  let terria: Terria;

  beforeEach(async function () {
    terria = new Terria();
    await terria.start({ configUrl: "" });
  });

  it("loads the Terrascope STAC time-series init source", async function () {
    terria.applyInitData({
      initData: terrascopeStacInit
    });

    await terria.loadInitSources();

    const model = terria.getModelById(
      StacCollectionCatalogItem,
      "terrascope-chl-timeseries"
    );

    expect(model).toBeDefined();
    expect(model?.url).toBe(
      "https://stac.terrascope.be/collections/terrascope-s2-chl-v1"
    );
    expect(model?.auth?.mode as string | undefined).toBe("oidc_password");
    expect(model?.asset?.assetKey).toBe("CHL");
    expect(model?.render?.renderKey).toBe("chl");
    expect(model?.timeSeries?.enabled).toBe(true);
    expect(model?.timeSeries?.chartEnabled).toBe(true);
    expect(model?.timeSeries?.providerCacheSize).toBe(4);
    expect(terria.corsProxy.corsDomains).toContain("stac.terrascope.be");
    expect(terria.timelineStack.alwaysShowingTimeline).toBe(true);
    expect(terria.workbench.items.map((item) => item.uniqueId)).toContain(
      "terrascope-chl-timeseries"
    );
  });
});
