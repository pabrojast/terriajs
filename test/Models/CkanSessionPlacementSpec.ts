import { runInAction } from "mobx";
import { http, HttpResponse } from "msw";
import getAncestors from "../../lib/Models/getAncestors";
import CatalogGroup from "../../lib/Models/Catalog/CatalogGroup";
import CkanPrivateCatalogReference from "../../lib/Models/Catalog/CatalogReferences/CkanPrivateCatalogReference";
import CkanSession, {
  CkanSessionConfig,
  CKAN_PRIVATE_CATALOG_ID_PREFIX
} from "../../lib/Models/CkanSession";
import CommonStrata from "../../lib/Models/Definition/CommonStrata";
import { BaseModel } from "../../lib/Models/Definition/Model";
import Terria from "../../lib/Models/Terria";
import ViewState from "../../lib/ReactViewModels/ViewState";
import { getShareData } from "../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";
import { InitSourceData } from "../../lib/Models/InitSource";
import { worker } from "../mocks/browser";

const PARENT = "//IHP-WINS";
const GROUP = "ckan-private-catalog";
const REFERENCE = `${GROUP}/catalog`;
const INJECTED = `${CKAN_PRIVATE_CATALOG_ID_PREFIX}embedded/browser`;

describe("CkanSession catalog placement", function () {
  let terria: Terria;
  let session: CkanSession;
  let user: string | undefined;
  let nonce: string;
  let requests: number;

  function install(config: CkanSessionConfig = {}) {
    session?.dispose();
    session = new CkanSession(terria, { checkOnFocus: false, ...config });
    runInAction(() => {
      terria.ckanSession = session;
    });
    session.setReady();
  }

  beforeEach(function () {
    terria = new Terria({ appBaseHref: "/", baseUrl: "./" });
    user = "alice";
    nonce = "nonce-alice";
    requests = 0;
    worker.use(
      http.get("*/api/terria/user/session", () =>
        HttpResponse.json({
          authenticated: user !== undefined,
          user: user ? { name: user, display_name: user } : null,
          private_catalog_url: `/api/terria/user/private-catalog?catalog_id=${nonce}`
        })
      ),
      http.get("*/api/terria/user/private-catalog", () => {
        requests++;
        return HttpResponse.json({
          catalog: [
            {
              id: `${CKAN_PRIVATE_CATALOG_ID_PREFIX}${nonce}/dataset/example`,
              type: "group",
              name: "Private dataset",
              members: []
            }
          ]
        });
      })
    );
    install();
  });

  afterEach(function () {
    session.dispose();
  });

  function addParent(id = PARENT): CatalogGroup {
    terria.catalog.group
      .addMembersFromJson(CommonStrata.definition, [
        {
          id,
          type: "group",
          name: "IHP-WINS",
          members: [{ id: "public-json", type: "group", name: "IHP-WINS" }]
        }
      ])
      .throwIfError();
    return terria.getModelById(CatalogGroup, id)!;
  }

  function inject(id = INJECTED, lazy = false) {
    terria.catalog.group
      .addMembersFromJson(CommonStrata.user, [
        {
          id,
          name: "Private datasets (alice)",
          type: lazy ? "terria-reference" : "group",
          ...(lazy
            ? {
                isGroup: true,
                url: "/api/terria/user/private-catalog?catalog_id=embedded"
              }
            : { members: [] })
        }
      ])
      .throwIfError();
    return terria.getModelById(BaseModel, id)!;
  }

  async function login() {
    await session.refresh();
    const reference = terria.getModelById(
      CkanPrivateCatalogReference,
      REFERENCE
    );
    if (reference) (await reference.loadReference()).throwIfError();
  }

  it("places a closed private group below the public JSON without changing IDs", async function () {
    const parent = addParent();
    await login();

    const wrapper = terria.getModelById(CatalogGroup, GROUP)!;
    expect(parent.members).toEqual(["public-json", GROUP]);
    expect(terria.catalog.group.members).not.toContain(GROUP);
    expect(wrapper.isOpen).toBe(false);
    expect(wrapper.shareable).toBe(false);
    expect(wrapper.members).toEqual([REFERENCE]);
    expect(wrapper.knownContainerUniqueIds).toEqual([PARENT]);
    expect(session.activeCatalogId).toBe(PARENT);
    expect(requests).toBe(1);
  });

  it("relocates after progressive init without reloading, changing the nonce or losing workbench items", async function () {
    await login();
    const wrapper = terria.getModelById(CatalogGroup, GROUP)!;
    const reference = terria.getModelById(
      CkanPrivateCatalogReference,
      REFERENCE
    )!;
    const layer = terria.getModelById(
      BaseModel,
      `${CKAN_PRIVATE_CATALOG_ID_PREFIX}${nonce}/dataset/example`
    )!;
    runInAction(() => {
      terria.workbench.items = [layer];
    });

    const parent = addParent();
    nonce = "new-nonce-ignored";
    await login();

    expect(parent.members).toEqual(["public-json", GROUP]);
    expect(terria.getModelById(CatalogGroup, GROUP)).toBe(wrapper);
    expect(terria.getModelById(CkanPrivateCatalogReference, REFERENCE)).toBe(
      reference
    );
    expect(reference.url).toContain("nonce-alice");
    expect(requests).toBe(1);
    expect(terria.workbench.items).toEqual([layer]);
    expect(getAncestors(reference).map((model) => model.uniqueId)).toEqual([
      PARENT,
      GROUP
    ]);
  });

  it("keeps the legacy root layout without IHP and when explicitly configured", async function () {
    await login();
    expect(session.activeCatalogId).toBe(GROUP);
    expect(terria.getModelById(CatalogGroup, GROUP)!.isOpen).toBe(true);
    install({ catalogParentGroupId: "/" });
    const parent = addParent();
    await login();
    expect(parent.members).toEqual(["public-json"]);
    expect(terria.catalog.group.members).toContain(GROUP);
    expect(session.activeCatalogId).toBe(GROUP);
  });

  it("supports a configured parent and ignores missing or private parents", async function () {
    install({ catalogParentGroupId: "custom-catalog" });
    const parent = addParent("custom-catalog");
    await login();
    expect(parent.members).toContain(GROUP);
    expect(session.activeCatalogId).toBe("custom-catalog");

    user = undefined;
    await session.refresh();
    install({ catalogParentGroupId: GROUP });
    user = "alice";
    await login();
    expect(session.activeCatalogId).toBe(GROUP);
    expect(terria.getModelById(CatalogGroup, GROUP)!.members).toEqual([
      REFERENCE
    ]);
  });

  it("falls back to the root when the parent is removed, then reuses it when restored", async function () {
    const parent = addParent();
    await login();
    const wrapper = terria.getModelById(CatalogGroup, GROUP)!;
    terria.catalog.group.remove(CommonStrata.definition, parent);
    expect(session.activeCatalogId).toBe(GROUP);
    expect(parent.members).toEqual(["public-json"]);
    terria.catalog.group.add(CommonStrata.definition, parent);
    expect(session.activeCatalogId).toBe(PARENT);
    expect(terria.getModelById(CatalogGroup, GROUP)).toBe(wrapper);
    expect(requests).toBe(1);
  });

  [false, true].forEach((lazy) => {
    it(`reuses the ${lazy ? "lazy" : "legacy inline"} embedded catalog without fetching another index`, async function () {
      const parent = addParent();
      const injected = inject(INJECTED, lazy);
      await login();
      await login();

      const wrapper = terria.getModelById(CatalogGroup, GROUP)!;
      expect(parent.members).toEqual(["public-json", GROUP]);
      expect(wrapper.members).toEqual([INJECTED]);
      expect(wrapper.isOpen).toBe(false);
      expect(terria.catalog.group.members).not.toContain(INJECTED);
      expect(injected.knownContainerUniqueIds).toEqual([GROUP]);
      expect(session.injectedPrivateCatalogId).toBe(INJECTED);
      expect(session.activeCatalogId).toBe(PARENT);
      expect(terria.getModelById(BaseModel, REFERENCE)).toBeUndefined();
      expect(requests).toBe(0);

      // If IHP disappears, the tab belongs to the wrapper, not its nested
      // injected reference. Its identity and contents must remain intact.
      terria.catalog.group.remove(CommonStrata.definition, parent);
      expect(session.activeCatalogId).toBe(GROUP);
      expect(wrapper.members).toEqual([INJECTED]);
      expect(injected.knownContainerUniqueIds).toEqual([GROUP]);
    });
  });

  it("groups late shared branches once and preserves layers from the previous index", async function () {
    const parent = addParent();
    await login();
    const layer = terria.getModelById(
      BaseModel,
      `${CKAN_PRIVATE_CATALOG_ID_PREFIX}${nonce}/dataset/example`
    )!;
    runInAction(() => {
      terria.workbench.items = [layer];
    });
    inject();
    const savedId = `${CKAN_PRIVATE_CATALOG_ID_PREFIX}saved/layers`;
    inject(savedId);
    await session.refresh();
    expect(parent.members).toEqual(["public-json", GROUP]);
    expect(terria.getModelById(CatalogGroup, GROUP)!.members).toEqual([
      INJECTED,
      savedId
    ]);
    expect(terria.workbench.items).toEqual([layer]);
    expect(requests).toBe(1);
    user = undefined;
    await session.refresh();
    expect(terria.workbench.items).toEqual([]);
    expect(parent.members).toEqual(["public-json"]);
    expect(
      terria.modelIds.some((id) =>
        id.startsWith(CKAN_PRIVATE_CATALOG_ID_PREFIX)
      )
    ).toBe(false);
  });

  it("cleans nested private memberships on logout while preserving public models and layers", async function () {
    const parent = addParent();
    inject();
    await login();
    const publicModel = terria.getModelById(BaseModel, "public-json")!;
    const injected = terria.getModelById(BaseModel, INJECTED)!;
    runInAction(() => {
      terria.workbench.items = [publicModel, injected];
    });
    user = undefined;
    await session.refresh();
    expect(parent.members).toEqual(["public-json"]);
    expect(terria.catalog.group.members).toEqual([PARENT]);
    expect(terria.workbench.items).toEqual([publicModel]);
    expect(terria.getModelById(BaseModel, GROUP)).toBeUndefined();
    expect(terria.getModelById(BaseModel, INJECTED)).toBeUndefined();
    expect(session.activeCatalogId).toBeUndefined();
  });

  it("replaces the previous user's nested catalog on account changes", async function () {
    const parent = addParent();
    await login();
    user = "bob";
    nonce = "nonce-bob";
    await login();
    expect(parent.members).toEqual(["public-json", GROUP]);
    expect(terria.modelIds.some((id) => id.includes("nonce-alice"))).toBe(
      false
    );
    expect(
      terria.getModelById(CkanPrivateCatalogReference, REFERENCE)!.url
    ).toContain("nonce-bob");
    expect(requests).toBe(2);
  });

  it("round-trips an active nested private layer through a share without the browser group or token", async function () {
    addParent();
    await login();
    const layerId = `${CKAN_PRIVATE_CATALOG_ID_PREFIX}nonce-alice/resource/point`;
    const wrapper = terria.getModelById(CatalogGroup, GROUP)!;
    wrapper
      .addMembersFromJson(CommonStrata.definition, [
        {
          id: layerId,
          type: "geojson",
          name: "Private station",
          url: "/api/terria/resource/point?token=secret&keep=1",
          geoJsonData: { type: "FeatureCollection", features: [] }
        }
      ])
      .throwIfError();
    runInAction(() => {
      terria.workbench.items = [terria.getModelById(BaseModel, layerId)!];
    });
    const initData = getShareData(terria).initSources[0] as InitSourceData;
    expect(initData.models?.[GROUP]).toBeUndefined();
    expect(initData.models?.[REFERENCE]).toBeUndefined();
    expect(initData.models?.[layerId].url).toBe(
      "/api/terria/resource/point?keep=1"
    );
    expect(initData.workbench).toEqual([layerId]);

    const restored = new Terria({ appBaseHref: "/", baseUrl: "./" });
    await restored.applyInitData({ initData });
    expect(restored.getModelById(BaseModel, layerId)).toBeDefined();
    expect(restored.workbench.itemIds).toEqual([layerId]);
    restored.dispose();
  });

  [true, false].forEach((tabbedCatalog) => {
    it(`reveals the nested private reference with tabbedCatalog=${tabbedCatalog}`, async function () {
      addParent();
      await login();
      runInAction(() => {
        terria.configParameters.tabbedCatalog = tabbedCatalog;
      });
      const viewState = new ViewState({ terria });
      try {
        const reference = terria.getModelById(
          CkanPrivateCatalogReference,
          REFERENCE
        )!;
        (await viewState.viewCatalogMember(reference)).throwIfError();
        expect(viewState.explorerPanelIsVisible).toBe(true);
        expect(terria.getModelById(CatalogGroup, GROUP)!.isOpen).toBe(true);
        if (tabbedCatalog) expect(viewState.activeTabIdInCategory).toBe(PARENT);
      } finally {
        viewState.dispose();
      }
    });
  });
});
