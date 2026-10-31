import { http, HttpResponse } from "msw";
import Terria from "../../../../lib/Models/Terria";
import StacCollectionCatalogItem from "../../../../lib/Models/Catalog/Stac/StacCollectionCatalogItem";
import terrascopeStacInit from "../../../../wwwroot/test/init/terrascope-stac-timeseries.json";
import { worker } from "../../../mocks/browser";

describe("Terrascope STAC init", function () {
  let terria: Terria;

  beforeEach(async function () {
    worker.use(
      http.get("*/serverconfig/*", () => HttpResponse.json({})),
      http.get("*/test-config.json", () => HttpResponse.json({}))
    );
    // The init source only needs the model definition; loading the real
    // Terrascope collection would leave requests running into the next suite.
    // Loaders are bound when the model is constructed inside applyInitData.
    spyOn(
      StacCollectionCatalogItem.prototype as any,
      "forceLoadMetadata"
    ).and.resolveTo();
    spyOn(
      StacCollectionCatalogItem.prototype as any,
      "forceLoadMapItems"
    ).and.resolveTo();
    terria = new Terria({ appBaseHref: "/", baseUrl: "./" });
    await terria.start({
      configUrl: "test-config.json",
      i18nOptions: { skipInit: true }
    });
  });

  it("loads the Terrascope STAC time-series init source", async function () {
    await terria.applyInitData({
      initData: terrascopeStacInit
    });

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
