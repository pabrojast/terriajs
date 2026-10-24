import CommonStrata from "../../../../lib/Models/Definition/CommonStrata";
import Terria from "../../../../lib/Models/Terria";
import StacItemCatalogItem from "../../../../lib/Models/Catalog/Stac/StacItemCatalogItem";
import TerrascopeAuthWorkflow from "../../../../lib/Models/Workflows/TerrascopeAuthWorkflow";

describe("StacItemCatalogItem", function () {
  let terria: Terria;
  let item: StacItemCatalogItem;

  beforeEach(function () {
    terria = new Terria();
    item = new StacItemCatalogItem("test-stac-item", terria);
  });

  it("has a type 'stac-item'", function () {
    expect(item.type).toBe("stac-item");
  });

  it("can set auth configuration", function () {
    item.setTrait(CommonStrata.user, "auth", {
      mode: "oidc_password",
      tokenUrl: "https://sso.example.com/token",
      clientId: "public",
      scope: undefined,
      tokenPersistence: undefined
    });

    expect(item.auth?.mode).toBe("oidc_password");
    expect(item.auth?.tokenUrl).toBe("https://sso.example.com/token");
    expect(item.auth?.clientId).toBe("public");
  });

  it("exposes a Terrascope login viewing control for Terrascope STAC items", function () {
    item.setTrait(
      CommonStrata.user,
      "url",
      "https://stac.terrascope.be/collections/terrascope-s2-chl-v1/items/item-1"
    );

    expect(item.supportsTerrascopeAuthentication).toBe(true);
    expect(
      item.viewingControls.some(
        (control) => control.id === TerrascopeAuthWorkflow.type
      )
    ).toBe(true);
  });
});
