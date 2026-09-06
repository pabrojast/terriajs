import { runInAction } from "mobx";
import GroupMixin from "../../lib/ModelMixins/GroupMixin";
import CatalogGroup from "../../lib/Models/Catalog/CatalogGroup";
import CkanPrivateCatalogReference from "../../lib/Models/Catalog/CatalogReferences/CkanPrivateCatalogReference";
import CkanSession, {
  CKAN_PRIVATE_CATALOG_ID_PREFIX,
  isSafeRelativePath
} from "../../lib/Models/CkanSession";
import CommonStrata from "../../lib/Models/Definition/CommonStrata";
import { BaseModel } from "../../lib/Models/Definition/Model";
import Terria from "../../lib/Models/Terria";
import SimpleCatalogItem from "../Helpers/SimpleCatalogItem";

const SESSION_RE = /\/api\/terria\/user\/session/;
const INDEX_RE = /\/api\/terria\/user\/private-catalog\?catalog_id=/;
const GROUP_ID = "ckan-private-catalog";
const REFERENCE_ID = "ckan-private-catalog/catalog";
const GROUP_NAME_TEMPLATE = "Private datasets ({{user}})";

const ANONYMOUS_JSON = {
  authenticated: false,
  user: null,
  private_catalog_url: null,
  login_url: "/user/login",
  logout_url: null,
  profile_url: null
};

function sessionJson(
  name: string,
  nonce: string,
  extra: Record<string, unknown> = {}
) {
  return {
    authenticated: true,
    user: {
      name,
      display_name: name.charAt(0).toUpperCase() + name.slice(1),
      sysadmin: false
    },
    private_catalog_url: `/api/terria/user/private-catalog?catalog_id=${nonce}`,
    login_url: "/user/login",
    logout_url: "/user/_logout",
    profile_url: `/user/${name}`,
    ...extra
  };
}

function datasetId(nonce: string) {
  return `${CKAN_PRIVATE_CATALOG_ID_PREFIX}${nonce}/dataset/ds-1`;
}

function catalogJson(nonce: string) {
  return {
    catalog: [
      {
        type: "group",
        name: "Org A",
        isOpen: true,
        shareable: false,
        members: [
          {
            id: datasetId(nonce),
            type: "terria-reference",
            name: "Dataset 1",
            isGroup: true,
            url: `/api/terria/user/private-catalog/dataset/ds-1?catalog_id=${nonce}`
          }
        ]
      }
    ]
  };
}

function stubSession(json: unknown, status = 200) {
  jasmine.Ajax.stubRequest(SESSION_RE).andReturn({
    status,
    contentType: "application/json",
    responseText: status === 200 ? JSON.stringify(json) : ""
  });
}

function stubCatalog(nonce: string) {
  jasmine.Ajax.stubRequest(INDEX_RE).andReturn({
    status: 200,
    contentType: "application/json",
    responseText: JSON.stringify(catalogJson(nonce))
  });
}

function sessionRequests() {
  return jasmine.Ajax.requests.filter(SESSION_RE).length;
}

function indexRequests() {
  return jasmine.Ajax.requests.filter(INDEX_RE).length;
}

function rootMembers(terria: Terria): string[] {
  return terria.catalog.group.members.filter(
    (m): m is string => typeof m === "string"
  );
}

function privateModelIds(terria: Terria): string[] {
  return terria.modelIds.filter(
    (id) =>
      id.startsWith(GROUP_ID) || id.startsWith(CKAN_PRIVATE_CATALOG_ID_PREFIX)
  );
}

function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Waits for the eager load of the private catalog reference (if any). */
async function settle(terria: Terria) {
  const ref = terria.getModelById(CkanPrivateCatalogReference, REFERENCE_ID);
  if (ref) await ref.loadReference();
  await flush();
}

describe("CkanSession", function () {
  let terria: Terria;
  let session: CkanSession;

  beforeEach(function () {
    terria = new Terria({ appBaseHref: "/", baseUrl: "./" });
    jasmine.Ajax.install();
    // Fail all requests by default.
    jasmine.Ajax.stubRequest(/.*/).andError({});
    session = new CkanSession(terria, {
      checkOnFocus: false,
      catalogGroupName: GROUP_NAME_TEMPLATE
    });
    session.setReady();
  });

  afterEach(function () {
    session.dispose();
    jasmine.Ajax.uninstall();
  });

  async function login(name: string, nonce: string) {
    stubSession(sessionJson(name, nonce));
    stubCatalog(nonce);
    await session.refresh();
    await settle(terria);
  }

  it("is inert without configParameters.ckanSession", function () {
    expect(terria.configParameters.ckanSession).toBeUndefined();
    expect(terria.ckanSession).toBeUndefined();
    expect(sessionRequests()).toBe(0);
    expect(session.status).toBe("unknown");
  });

  it("keeps ckanSession through Terria.updateParameters", function () {
    const config = {
      sessionUrl: "/api/terria/user/session",
      checkOnFocus: false
    };
    terria.updateParameters({ ckanSession: config });
    expect(terria.configParameters.ckanSession).toEqual(config);
  });

  it("stays anonymous and adds nothing", async function () {
    stubSession(ANONYMOUS_JSON);
    await session.refresh();
    expect(session.status).toBe("anonymous");
    expect(session.isAuthenticated).toBe(false);
    expect(session.displayName).toBe("");
    expect(session.isRefreshing).toBe(false);
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
    expect(session.activeCatalogId).toBeUndefined();
    expect(indexRequests()).toBe(0);
  });

  it("adds one wrapper group + reference when authenticated and loads it eagerly", async function () {
    await login("alice", "nonceA");

    expect(session.status).toBe("authenticated");
    expect(session.isAuthenticated).toBe(true);
    expect(session.displayName).toBe("Alice");
    expect(session.profileUrl).toBe("/user/alice");
    expect(rootMembers(terria).filter((id) => id === GROUP_ID).length).toBe(1);
    expect(session.activeCatalogId).toBe(GROUP_ID);

    const group = terria.getModelById(CatalogGroup, GROUP_ID);
    expect(group).toBeDefined();
    expect(group!.name).toBe("Private datasets (Alice)");
    expect(group!.isOpen).toBe(true);
    expect(group!.shareable).toBe(false);
    expect(group!.description).toBeDefined();
    expect(group!.members).toEqual([REFERENCE_ID]);

    const ref = terria.getModelById(CkanPrivateCatalogReference, REFERENCE_ID);
    expect(ref).toBeDefined();
    expect(ref!.type).toBe("ckan-private-catalog-reference");
    expect(ref!.isGroup).toBe(true);
    expect(ref!.url).toBe("/api/terria/user/private-catalog?catalog_id=nonceA");
    expect(ref!.name).toBe("ckanSession.organisations");

    expect(indexRequests()).toBe(1);
    expect(jasmine.Ajax.requests.filter(INDEX_RE)[0].url).not.toContain(
      "proxy/"
    );

    const target = ref!.target;
    expect(GroupMixin.isMixedInto(target)).toBe(true);
    if (GroupMixin.isMixedInto(target)) {
      expect(target.isOpen).toBe(true);
      expect((target as CatalogGroup).shareable).toBe(false);
      expect(target.memberModels.length).toBe(1);
    }
    expect(terria.getModelById(BaseModel, datasetId("nonceA"))).toBeDefined();
    expect(session.catalogGeneration).toBeGreaterThan(0);
  });

  it("re-checking the same user keeps the first nonce, does not re-add and does not refetch", async function () {
    await login("alice", "nonceA");
    const generation = session.catalogGeneration;
    const ref = terria.getModelById(CkanPrivateCatalogReference, REFERENCE_ID);

    stubSession(sessionJson("alice", "nonceX"));
    await session.refresh();
    await settle(terria);

    expect(rootMembers(terria).filter((id) => id === GROUP_ID).length).toBe(1);
    expect(terria.getModelById(CkanPrivateCatalogReference, REFERENCE_ID)).toBe(
      ref
    );
    expect(ref!.url).toContain("catalog_id=nonceA");
    expect(indexRequests()).toBe(1);
    expect(session.catalogGeneration).toBe(generation);
  });

  it("removes the group, its loaded descendants, orphan ids and workbench items on logout and notifies each time", async function () {
    await login("alice", "nonceA");
    const leaf = terria.getModelById(BaseModel, datasetId("nonceA"));
    expect(leaf).toBeDefined();
    runInAction(() => {
      terria.workbench.items = [leaf!];
    });
    expect(terria.workbench.items.length).toBe(1);

    stubSession(ANONYMOUS_JSON);
    await session.refresh();

    expect(session.status).toBe("anonymous");
    expect(session.user).toBeUndefined();
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
    expect(privateModelIds(terria)).toEqual([]);
    expect(terria.workbench.items.length).toBe(0);
    expect(session.activeCatalogId).toBeUndefined();

    const first = terria.notificationState.currentNotification;
    expect(first).toBeDefined();
    expect(first!.key).toMatch(/^ckanSession\/loggedOut\//);
    expect(first!.title).toBe("ckanSession.notifications.loggedOutTitle");
    expect(first!.message).toBe("ckanSession.notifications.loggedOutMessage");
    terria.notificationState.dismissCurrentNotification();

    // Second login/logout cycle notifies again (per-event key).
    await login("alice", "nonceA");
    const leaf2 = terria.getModelById(BaseModel, datasetId("nonceA"));
    runInAction(() => {
      terria.workbench.items = [leaf2!];
    });
    stubSession(ANONYMOUS_JSON);
    await session.refresh();

    const second = terria.notificationState.currentNotification;
    expect(second).toBeDefined();
    expect(second!.key).toMatch(/^ckanSession\/loggedOut\//);
    expect(second!.key).not.toBe(first!.key);
    expect(privateModelIds(terria)).toEqual([]);
  });

  it("does not notify on logout when no private layer was on the workbench", async function () {
    await login("alice", "nonceA");
    stubSession(ANONYMOUS_JSON);
    await session.refresh();
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
    expect(terria.notificationState.currentNotification).toBeUndefined();
  });

  it("switching user A -> B replaces models and refetches with the new nonce", async function () {
    await login("alice", "nonceA");
    expect(terria.getModelById(BaseModel, datasetId("nonceA"))).toBeDefined();

    await login("bob", "nonceB");

    expect(terria.modelIds.some((id) => id.includes("nonceA"))).toBe(false);
    expect(rootMembers(terria).filter((id) => id === GROUP_ID).length).toBe(1);
    const group = terria.getModelById(CatalogGroup, GROUP_ID);
    expect(group!.name).toBe("Private datasets (Bob)");
    const ref = terria.getModelById(CkanPrivateCatalogReference, REFERENCE_ID);
    expect(ref!.url).toContain("catalog_id=nonceB");
    expect(indexRequests()).toBe(2);
    expect(terria.getModelById(BaseModel, datasetId("nonceB"))).toBeDefined();
  });

  it("dedups against a member pre-created by a share link with the same id", async function () {
    terria.catalog.group
      .addMembersFromJson(CommonStrata.definition, [
        { id: GROUP_ID, type: "group", name: "Shared wrapper" }
      ])
      .throwIfError();
    expect(rootMembers(terria)).toContain(GROUP_ID);

    await login("alice", "nonceA");

    expect(rootMembers(terria).filter((id) => id === GROUP_ID).length).toBe(1);
    const group = terria.getModelById(CatalogGroup, GROUP_ID);
    expect(group!.name).toBe("Private datasets (Alice)");
    const ref = terria.getModelById(CkanPrivateCatalogReference, REFERENCE_ID);
    expect(ref!.url).toContain("catalog_id=nonceA");
    expect(indexRequests()).toBe(1);
  });

  it("does not add its own group when a root member injected by #start= exists", async function () {
    const injectedId = `${CKAN_PRIVATE_CATALOG_ID_PREFIX}x/browser`;
    terria.catalog.group
      .addMembersFromJson(CommonStrata.user, [
        { id: injectedId, type: "group", name: "Injected private catalog" }
      ])
      .throwIfError();
    const root = terria.catalog.group as CatalogGroup;
    expect(root.getTrait(CommonStrata.user, "members")).toContain(injectedId);

    await login("alice", "nonceA");

    expect(rootMembers(terria)).not.toContain(GROUP_ID);
    expect(session.injectedPrivateCatalogId).toBe(injectedId);
    expect(session.activeCatalogId).toBe(injectedId);
    expect(indexRequests()).toBe(0);

    stubSession(ANONYMOUS_JSON);
    await session.refresh();

    expect(rootMembers(terria)).not.toContain(injectedId);
    expect(root.getTrait(CommonStrata.user, "members") ?? []).not.toContain(
      injectedId
    );
    expect(terria.getModelById(BaseModel, injectedId)).toBeUndefined();
    expect(session.injectedPrivateCatalogId).toBeUndefined();

    await login("alice", "nonceA");

    expect(rootMembers(terria)).toContain(GROUP_ID);
    expect(session.activeCatalogId).toBe(GROUP_ID);
    expect(indexRequests()).toBe(1);
  });

  it("keeps the catalog on transient errors (500) and never raises to the user; 401 means anonymous", async function () {
    const raiseErrorToUser = spyOn(terria, "raiseErrorToUser");
    await login("alice", "nonceA");

    stubSession(undefined, 500);
    await session.refresh();

    expect(session.status).toBe("error");
    expect(session.user?.name).toBe("alice");
    expect(session.lastError).toBeDefined();
    expect(session.isAuthenticated).toBe(false);
    expect(session.displayName).toBe("Alice");
    expect(rootMembers(terria)).toContain(GROUP_ID);
    expect(raiseErrorToUser).not.toHaveBeenCalled();

    stubSession(undefined, 401);
    await session.refresh();

    expect(session.status).toBe("anonymous");
    expect(session.user).toBeUndefined();
    expect(session.lastError).toBeUndefined();
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
    expect(privateModelIds(terria)).toEqual([]);
    expect(raiseErrorToUser).not.toHaveBeenCalled();
  });

  it("handleUnauthorized forces a re-check and removes the catalog when the session is gone", async function () {
    await login("alice", "nonceA");
    stubSession(undefined, 401);

    session.handleUnauthorized(401);
    await session.refresh();

    expect(sessionRequests()).toBe(2);
    expect(session.status).toBe("anonymous");
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
  });

  it("ignores a stale whoami response that resolves after a newer one", async function () {
    let respondSlow: (() => void) | undefined;
    jasmine.Ajax.stubRequest(SESSION_RE).andCallFunction((request) => {
      respondSlow = () =>
        request.respondWith({
          status: 200,
          contentType: "application/json",
          responseText: JSON.stringify(sessionJson("alice", "nonceA"))
        });
    });

    const slow = session.refresh();
    expect(session.isRefreshing).toBe(true);

    stubSession(ANONYMOUS_JSON);
    session.handleUnauthorized(401);
    await session.refresh();

    expect(session.status).toBe("anonymous");
    expect(session.isRefreshing).toBe(false);

    expect(respondSlow).toBeDefined();
    respondSlow!();
    await slow;

    expect(session.status).toBe("anonymous");
    expect(session.user).toBeUndefined();
    expect(session.isRefreshing).toBe(false);
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
  });

  it("tolerates malformed payloads", async function () {
    for (const payload of [
      "garbage",
      {},
      { authenticated: true, user: null },
      { authenticated: true, user: { name: "" } },
      { authenticated: "yes", user: { name: "alice" } }
    ]) {
      stubSession(payload);
      await session.refresh();
      expect(session.status).toBe("anonymous");
      expect(session.user).toBeUndefined();
    }
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
  });

  it("rejects unsafe server-provided urls", async function () {
    stubSession(
      sessionJson("alice", "nonceA", {
        private_catalog_url: "//evil.example/x",
        login_url: "https://evil.example/x",
        logout_url: "data:text/html,evil",
        profile_url: "/user/alice"
      })
    );
    stubCatalog("local");
    await session.refresh();
    await settle(terria);

    expect(session.loginUrl).toBe("/user/login");
    expect(session.logoutUrl).toBe("/user/_logout");
    expect(session.profileUrl).toBe("/user/alice");
    const ref = terria.getModelById(CkanPrivateCatalogReference, REFERENCE_ID);
    expect(ref!.url).toMatch(
      /^\/api\/terria\/user\/private-catalog\?catalog_id=[A-Za-z0-9_-]{8,64}$/
    );
    expect(indexRequests()).toBe(1);
  });

  it("rejects unsafe urls from the configuration and falls back to defaults", async function () {
    const warn = spyOn(console, "warn");
    session.dispose();
    session = new CkanSession(terria, {
      checkOnFocus: false,
      sessionUrl: "https://evil.example/session",
      loginUrl: "//evil.example/login",
      logoutUrl: "/user/_logout?x=1",
      privateCatalogUrl: "relative/path"
    });
    expect(warn).toHaveBeenCalled();
    expect(session.loginUrl).toBe("/user/login");
    expect(session.logoutUrl).toBe("/user/_logout?x=1");

    stubSession(ANONYMOUS_JSON);
    await session.refresh();
    expect(sessionRequests()).toBe(1);
    expect(jasmine.Ajax.requests.mostRecent().url).toMatch(
      /^\/api\/terria\/user\/session\?_=\d+$/
    );
  });

  it("isSafeRelativePath only accepts same-origin paths", function () {
    expect(isSafeRelativePath("/user/login")).toBe(true);
    expect(isSafeRelativePath("/api/terria/user/session?x=1&y=2")).toBe(true);
    expect(isSafeRelativePath("/")).toBe(true);
    expect(isSafeRelativePath("//evil.example/x")).toBe(false);
    expect(isSafeRelativePath("https://evil.example/x")).toBe(false);
    expect(isSafeRelativePath("data:text/html,evil")).toBe(false);
    expect(isSafeRelativePath("api/relative")).toBe(false);
    expect(isSafeRelativePath("/with space")).toBe(false);
    expect(isSafeRelativePath("/back\\slash")).toBe(false);
    expect(isSafeRelativePath("/new\nline")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath(undefined)).toBe(false);
    expect(isSafeRelativePath(42)).toBe(false);
  });

  it("buildLoginHref uses came_from = pathname only", async function () {
    const cameFrom = encodeURIComponent(window.location.pathname);
    expect(session.buildLoginHref()).toBe(`/user/login?came_from=${cameFrom}`);
    expect(session.buildLogoutHref()).toBe(
      `/user/_logout?came_from=${cameFrom}`
    );
    expect(session.buildLoginHref()).not.toContain("#");

    stubSession({ ...ANONYMOUS_JSON, login_url: "/user/login?next=1" });
    await session.refresh();
    expect(session.buildLoginHref()).toBe(
      `/user/login?next=1&came_from=${cameFrom}`
    );
  });

  it("openLogin/openLogout open a new tab with noopener,noreferrer and mark the pending state", async function () {
    const open = spyOn(window, "open").and.returnValue(null);

    session.openLogin();
    expect(open).toHaveBeenCalledWith(
      session.buildLoginHref(),
      "_blank",
      "noopener,noreferrer"
    );
    expect(session.pendingLogin).toBe(true);

    await login("alice", "nonceA");
    expect(session.pendingLogin).toBe(false);

    session.openLogout();
    expect(open).toHaveBeenCalledWith(
      session.buildLogoutHref()!,
      "_blank",
      "noopener,noreferrer"
    );
    expect(session.pendingLogout).toBe(true);

    stubSession(ANONYMOUS_JSON);
    await session.refresh();
    expect(session.pendingLogout).toBe(false);
  });

  it("throttles focus re-checks and shortens the interval while a login is pending", async function () {
    session.dispose();
    spyOnProperty(document, "visibilityState", "get").and.returnValue(
      "visible"
    );
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(0));
    session = new CkanSession(terria, {
      checkOnFocus: true,
      focusThrottleMs: 5000
    });
    session.setReady();
    stubSession(ANONYMOUS_JSON);

    try {
      window.dispatchEvent(new Event("focus"));
      expect(sessionRequests()).toBe(0);

      jasmine.clock().tick(5001);
      window.dispatchEvent(new Event("focus"));
      expect(sessionRequests()).toBe(1);
      await session.refresh();
      expect(session.status).toBe("anonymous");

      jasmine.clock().tick(1001);
      document.dispatchEvent(new Event("visibilitychange"));
      expect(sessionRequests()).toBe(1);

      session.markLoginOpened();
      window.dispatchEvent(new Event("focus"));
      expect(sessionRequests()).toBe(2);
      await session.refresh();
      expect(session.pendingLogin).toBe(false);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("notifies once when anonymous and the catalog contains CKAN private ids from a share link", async function () {
    const orphanId = `${CKAN_PRIVATE_CATALOG_ID_PREFIX}x/resource/r/view/0`;
    const orphan = new SimpleCatalogItem(orphanId, terria);
    terria.addModel(orphan);
    runInAction(() => {
      terria.workbench.items = [orphan];
    });

    stubSession(ANONYMOUS_JSON);
    await session.refresh();

    const notification = terria.notificationState.currentNotification;
    expect(notification).toBeDefined();
    expect(notification!.key).toBe("ckanSession/shareRequiresLogin");
    expect(notification!.title).toBe(
      "ckanSession.notifications.shareRequiresLoginTitle"
    );
    expect(notification!.confirmText).toBe("ckanSession.btnLogin");
    expect(notification!.denyText).toBe("ckanSession.notifications.dismiss");
    expect(terria.getModelById(BaseModel, orphanId)).toBeUndefined();
    expect(terria.workbench.items.length).toBe(0);

    const open = spyOn(window, "open").and.returnValue(null);
    notification!.confirmAction!();
    expect(open).toHaveBeenCalled();
    expect(session.pendingLogin).toBe(true);
    terria.notificationState.dismissCurrentNotification();

    // Going through login and logout again must not repeat the share notification.
    await login("alice", "nonceA");
    terria.addModel(new SimpleCatalogItem(orphanId, terria));
    stubSession(ANONYMOUS_JSON);
    await session.refresh();
    expect(terria.getModelById(BaseModel, orphanId)).toBeUndefined();
    expect(terria.notificationState.currentNotification).toBeUndefined();
  });

  it("dispose removes listeners and stops the reaction", async function () {
    session.dispose();
    session = new CkanSession(terria, { checkOnFocus: true });
    session.setReady();
    const windowRemove = spyOn(window, "removeEventListener").and.callThrough();
    const documentRemove = spyOn(
      document,
      "removeEventListener"
    ).and.callThrough();

    session.dispose();

    expect(windowRemove).toHaveBeenCalledWith("focus", jasmine.any(Function));
    expect(documentRemove).toHaveBeenCalledWith(
      "visibilitychange",
      jasmine.any(Function)
    );

    stubSession(sessionJson("alice", "nonceA"));
    await session.refresh();
    expect(session.status).toBe("authenticated");
    expect(rootMembers(terria)).not.toContain(GROUP_ID);
    expect(indexRequests()).toBe(0);
  });
});
