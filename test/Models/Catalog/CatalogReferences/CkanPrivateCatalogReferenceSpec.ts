import { runInAction } from "mobx";
import { TerriaErrorSeverity } from "../../../../lib/Core/TerriaError";
import GroupMixin from "../../../../lib/ModelMixins/GroupMixin";
import CatalogMemberFactory from "../../../../lib/Models/Catalog/CatalogMemberFactory";
import CkanPrivateCatalogReference from "../../../../lib/Models/Catalog/CatalogReferences/CkanPrivateCatalogReference";
import CkanSession from "../../../../lib/Models/CkanSession";
import CommonStrata from "../../../../lib/Models/Definition/CommonStrata";
import Terria from "../../../../lib/Models/Terria";

const CATALOG_URL = "/api/terria/user/private-catalog?catalog_id=nonceA";
const CATALOG_RE = /\/api\/terria\/user\/private-catalog/;

const CATALOG_JSON = {
  catalog: [
    {
      type: "group",
      name: "Org A",
      isOpen: true,
      members: [
        {
          id: "__ckan_private_catalog__/nonceA/dataset/ds-1",
          type: "terria-reference",
          name: "Dataset 1",
          isGroup: true,
          url: "/api/terria/user/private-catalog/dataset/ds-1?catalog_id=nonceA"
        }
      ]
    }
  ]
};

function stubCatalog(status: number) {
  jasmine.Ajax.stubRequest(CATALOG_RE).andReturn({
    status,
    contentType: "application/json",
    responseText: status === 200 ? JSON.stringify(CATALOG_JSON) : ""
  });
}

describe("CkanPrivateCatalogReference", function () {
  let terria: Terria;
  let session: CkanSession;
  let ref: CkanPrivateCatalogReference;

  beforeEach(function () {
    terria = new Terria({ appBaseHref: "/", baseUrl: "./" });
    jasmine.Ajax.install();
    jasmine.Ajax.stubRequest(/.*/).andError({});
    session = new CkanSession(terria, { checkOnFocus: false });
    runInAction(() => {
      terria.ckanSession = session;
    });
    ref = new CkanPrivateCatalogReference("test", terria);
    ref.setTrait(CommonStrata.definition, "url", CATALOG_URL);
    ref.setTrait(CommonStrata.definition, "isGroup", true);
    ref.setTrait(CommonStrata.definition, "name", "Organisations");
  });

  afterEach(function () {
    session.dispose();
    jasmine.Ajax.uninstall();
  });

  it("is registered in CatalogMemberFactory under its type", function () {
    expect(CkanPrivateCatalogReference.type).toBe(
      "ckan-private-catalog-reference"
    );
    expect(CatalogMemberFactory.find(CkanPrivateCatalogReference.type)).toBe(
      CkanPrivateCatalogReference
    );
    const created = CatalogMemberFactory.create(
      CkanPrivateCatalogReference.type,
      "created",
      terria
    );
    expect(created instanceof CkanPrivateCatalogReference).toBe(true);
    expect(created?.type).toBe("ckan-private-catalog-reference");
  });

  it("loads like a terria-reference", async function () {
    stubCatalog(200);
    const result = await ref.loadReference();
    expect(result.error).toBeUndefined();

    const target = ref.target;
    expect(GroupMixin.isMixedInto(target)).toBe(true);
    if (GroupMixin.isMixedInto(target)) {
      expect(target.memberModels.length).toBe(1);
    }
    const requests = jasmine.Ajax.requests.filter(CATALOG_RE);
    expect(requests.length).toBe(1);
    expect(requests[0].url).toBe(CATALOG_URL);
    expect(requests[0].url).not.toContain("proxy/");
  });

  it("maps 401 to an Error-severity TerriaError with ckanSession.errors.sessionExpired and calls handleUnauthorized(401)", async function () {
    stubCatalog(401);
    const handleUnauthorized = spyOn(session, "handleUnauthorized");

    const result = await ref.loadReference();

    expect(ref.target).toBeUndefined();
    const error = result.error;
    expect(error).toBeDefined();
    expect(error!.title).toBe("ckanSession.errors.title");
    expect(error!.severity).toBe(TerriaErrorSeverity.Error);
    const flattened = error!.flatten();
    expect(
      flattened.some((e) => e.message === "ckanSession.errors.sessionExpired")
    ).toBe(true);
    expect(
      flattened.every((e) => e.severity === TerriaErrorSeverity.Error)
    ).toBe(true);
    expect(handleUnauthorized).toHaveBeenCalledWith(401);
  });

  it("maps 403 to ckanSession.errors.forbidden and calls handleUnauthorized(403)", async function () {
    stubCatalog(403);
    const handleUnauthorized = spyOn(session, "handleUnauthorized");

    const result = await ref.loadReference();

    const error = result.error;
    expect(error).toBeDefined();
    expect(error!.title).toBe("ckanSession.errors.title");
    expect(
      error!.flatten().some((e) => e.message === "ckanSession.errors.forbidden")
    ).toBe(true);
    expect(handleUnauthorized).toHaveBeenCalledWith(403);
  });

  it("rethrows other errors unchanged (500 -> network request error)", async function () {
    stubCatalog(500);
    const handleUnauthorized = spyOn(session, "handleUnauthorized");

    const result = await ref.loadReference();

    const error = result.error;
    expect(error).toBeDefined();
    expect(
      error!
        .flatten()
        .some((e) => e.title === "core.terriaError.networkRequestTitle")
    ).toBe(true);
    expect(
      error!.flatten().some((e) => e.title === "ckanSession.errors.title")
    ).toBe(false);
    expect(handleUnauthorized).not.toHaveBeenCalled();
  });

  it("works without terria.ckanSession", async function () {
    runInAction(() => {
      terria.ckanSession = undefined;
    });
    stubCatalog(401);

    const result = await ref.loadReference();

    expect(result.error).toBeDefined();
    expect(result.error!.title).toBe("ckanSession.errors.title");
  });
});
