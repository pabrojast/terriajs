import Terria from "../../../../lib/Models/Terria";
import StacCatalogGroup from "../../../../lib/Models/Catalog/Stac/StacCatalogGroup";
import CommonStrata from "../../../../lib/Models/Definition/CommonStrata";

describe("StacCatalogGroup", function () {
  let group: StacCatalogGroup;
  let terria: Terria;

  beforeEach(function () {
    terria = new Terria();
    group = new StacCatalogGroup("test-stac-group", terria);
  });

  it("should have a type 'stac-catalog'", function () {
    expect(group.type).toEqual("stac-catalog");
  });

  it("can be instantiated", function () {
    expect(group).toBeDefined();
  });

  describe("traits", function () {
    it("can set url trait", function () {
      group.setTrait(CommonStrata.user, "url", "https://stac.terrascope.be/");
      expect(group.url).toBe("https://stac.terrascope.be/");
    });

    it("can set flatten trait", function () {
      group.setTrait(CommonStrata.user, "flatten", true);
      expect(group.flatten).toBe(true);
    });

    it("can set collectionsFilter trait", function () {
      group.setTrait(
        CommonStrata.user,
        "collectionsFilter",
        "collection1,collection2"
      );
      expect(group.collectionsFilter).toBe("collection1,collection2");
    });

    it("can set maximumCollections trait", function () {
      group.setTrait(CommonStrata.user, "maximumCollections", 50);
      expect(group.maximumCollections).toBe(50);
    });
  });

  describe("typeName", function () {
    it("returns STAC Catalog", function () {
      expect(group.typeName).toBe("STAC Catalog");
    });
  });

  describe("cacheDuration", function () {
    it("defaults to 1d", function () {
      expect(group.cacheDuration).toBe("1d");
    });

    it("can be overridden", function () {
      group.setTrait(CommonStrata.user, "cacheDuration", "1h");
      expect(group.cacheDuration).toBe("1h");
    });
  });
});
