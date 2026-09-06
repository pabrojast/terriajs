import i18next from "i18next";
import {
  action,
  comparer,
  computed,
  makeObservable,
  observable,
  reaction,
  runInAction
} from "mobx";
import RequestErrorEvent from "terriajs-cesium/Source/Core/RequestErrorEvent";
import getDereferencedIfExists from "../Core/getDereferencedIfExists";
import { isJsonObject } from "../Core/Json";
import loadJson from "../Core/loadJson";
import TerriaError from "../Core/TerriaError";
import GroupMixin from "../ModelMixins/GroupMixin";
import ReferenceMixin from "../ModelMixins/ReferenceMixin";
import CatalogMemberTraits from "../Traits/TraitsClasses/CatalogMemberTraits";
import CommonStrata from "./Definition/CommonStrata";
import hasTraits from "./Definition/hasTraits";
import { BaseModel } from "./Definition/Model";
import type Terria from "./Terria";

/**
 * Configuration for the same-origin CKAN session integration
 * (`configParameters.ckanSession`). Every URL must be a relative path starting
 * with "/" so that requests carry the CKAN session cookie and never go through
 * the terriajs-server proxy.
 */
export interface CkanSessionConfig {
  /** Whoami endpoint. Default "/api/terria/user/session". */
  sessionUrl?: string;
  /** Private catalog index used when the whoami does not provide `private_catalog_url`. Default "/api/terria/user/private-catalog". */
  privateCatalogUrl?: string;
  /** CKAN login page. Default "/user/login". */
  loginUrl?: string;
  /** CKAN logout URL. Default "/user/_logout". */
  logoutUrl?: string;
  /** Optional profile URL template (`{{user}}` is replaced by the user name). The whoami `profile_url` takes precedence. */
  profileUrl?: string;
  /** Optional name template for the private catalog group (`{{user}}`). Defaults to the i18n key `ckanSession.privateCatalogName`. */
  catalogGroupName?: string;
  /** Id of the root catalog group that wraps the private catalog. Default "ckan-private-catalog". */
  catalogGroupId?: string;
  /** Re-check the session when the window regains focus/visibility. Default true. */
  checkOnFocus?: boolean;
  /** Minimum interval between focus re-checks in milliseconds. Default 5000. */
  focusThrottleMs?: number;
}

export type CkanSessionStatus =
  | "unknown"
  | "anonymous"
  | "authenticated"
  | "error";

export interface CkanSessionUser {
  name: string;
  displayName: string;
  sysadmin: boolean;
}

/** Prefix of the model ids emitted by the CKAN private catalog endpoints. */
export const CKAN_PRIVATE_CATALOG_ID_PREFIX = "__ckan_private_catalog__/";

/** Catalog member type registered by `CkanPrivateCatalogReference`. */
const PRIVATE_CATALOG_REFERENCE_TYPE = "ckan-private-catalog-reference";

const DEFAULT_CONFIG = {
  sessionUrl: "/api/terria/user/session",
  privateCatalogUrl: "/api/terria/user/private-catalog",
  loginUrl: "/user/login",
  logoutUrl: "/user/_logout",
  catalogGroupId: "ckan-private-catalog",
  checkOnFocus: true,
  focusThrottleMs: 5000
};

/** Focus throttle used while a login/logout tab has been opened and not yet detected. */
const PENDING_FOCUS_THROTTLE_MS = 1000;

type ResolvedConfig = typeof DEFAULT_CONFIG &
  Pick<CkanSessionConfig, "profileUrl" | "catalogGroupName">;

interface SyncState {
  ready: boolean;
  status: CkanSessionStatus;
  name: string | undefined;
  url: string | undefined;
}

interface ServerUrls {
  login?: string;
  logout?: string;
  profile?: string;
}

/**
 * True for same-origin relative paths only: the value starts with "/" but not
 * "//", and contains no backslash, whitespace or control characters.
 */
export function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value[0] !== "/" || value[1] === "/") return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || value[i] === "\\") return false;
  }
  return true;
}

function appendQuery(url: string, query: string): string {
  return url + (url.includes("?") ? "&" : "?") + query;
}

function appendCameFrom(url: string): string {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : undefined;
  return appendQuery(url, "came_from=" + encodeURIComponent(pathname || "/"));
}

/** 16 base64url characters (matches the CKAN `catalog_id` pattern `^[A-Za-z0-9_-]{8,64}$`). */
function generateNonce(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/[=]+$/, "");
}

function resolveConfig(config: CkanSessionConfig): ResolvedConfig {
  const resolved: ResolvedConfig = { ...DEFAULT_CONFIG };
  const urlKeys = [
    "sessionUrl",
    "privateCatalogUrl",
    "loginUrl",
    "logoutUrl"
  ] as const;
  urlKeys.forEach((key) => {
    const value = config[key];
    if (value === undefined) return;
    if (isSafeRelativePath(value)) {
      resolved[key] = value;
    } else {
      console.warn(
        `CkanSession: ignoring unsafe ${key} "${value}" (only relative paths starting with "/" are allowed); using "${DEFAULT_CONFIG[key]}"`
      );
    }
  });
  if (config.profileUrl !== undefined) {
    if (isSafeRelativePath(config.profileUrl)) {
      resolved.profileUrl = config.profileUrl;
    } else {
      console.warn(
        `CkanSession: ignoring unsafe profileUrl "${config.profileUrl}"`
      );
    }
  }
  if (typeof config.catalogGroupName === "string" && config.catalogGroupName) {
    resolved.catalogGroupName = config.catalogGroupName;
  }
  if (typeof config.catalogGroupId === "string" && config.catalogGroupId) {
    resolved.catalogGroupId = config.catalogGroupId;
  }
  if (typeof config.checkOnFocus === "boolean") {
    resolved.checkOnFocus = config.checkOnFocus;
  }
  if (
    typeof config.focusThrottleMs === "number" &&
    isFinite(config.focusThrottleMs) &&
    config.focusThrottleMs >= 0
  ) {
    resolved.focusThrottleMs = config.focusThrottleMs;
  }
  return resolved;
}

/**
 * Tracks the CKAN portal session of the current browser (same-origin cookie)
 * and keeps a root catalog group with the user's private datasets in sync
 * with it.
 *
 * - `refresh()` calls the whoami endpoint (relative URL, never proxied).
 * - When the user is authenticated (and `setReady()` has been called) a root
 *   group `groupId` wrapping a `ckan-private-catalog-reference` is added to
 *   the catalog and loaded eagerly.
 * - When the user becomes anonymous the group, its loaded descendants, the
 *   workbench items and any orphan `__ckan_private_catalog__/*` model are
 *   removed.
 * - In the CKAN embedded view the `#start=` data already injects a root member
 *   whose id starts with `CKAN_PRIVATE_CATALOG_ID_PREFIX`; in that case no
 *   extra group is added.
 */
export default class CkanSession {
  @observable status: CkanSessionStatus = "unknown";
  @observable.ref user: CkanSessionUser | undefined = undefined;
  @observable isRefreshing = false;
  /** A login tab was opened and the session change has not been observed yet. */
  @observable pendingLogin = false;
  /** A logout tab was opened and the session change has not been observed yet. */
  @observable pendingLogout = false;
  @observable.ref lastError: TerriaError | undefined = undefined;
  /** Incremented every time the private catalog group is added or removed. */
  @observable catalogGeneration = 0;

  @observable private ready = false;
  /** Full private catalog URL (with `catalog_id`). Only replaced when the user name changes. */
  @observable private privateCatalogUrl: string | undefined = undefined;
  @observable.ref private serverUrls: ServerUrls = {};

  readonly groupId: string;
  readonly referenceId: string;

  private readonly config: ResolvedConfig;
  private _seq = 0;
  private _inflight: Promise<void> | undefined = undefined;
  private _lastCheck = 0;
  private _attached: { name: string; url: string } | undefined = undefined;
  private _shareLoginNotified = false;
  private readonly _disposers: (() => void)[] = [];

  constructor(readonly terria: Terria, config: CkanSessionConfig = {}) {
    makeObservable(this);
    this.config = resolveConfig(config);
    this.groupId = this.config.catalogGroupId;
    this.referenceId = `${this.groupId}/catalog`;

    this._disposers.push(
      reaction(
        (): SyncState => ({
          ready: this.ready,
          status: this.status,
          name: this.user?.name,
          url: this.privateCatalogUrl
        }),
        (next, prev) => this.syncCatalog(next, prev),
        { equals: comparer.structural }
      )
    );

    if (this.config.checkOnFocus && typeof window !== "undefined") {
      window.addEventListener("focus", this.onFocus);
      this._disposers.push(() =>
        window.removeEventListener("focus", this.onFocus)
      );
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", this.onFocus);
        this._disposers.push(() =>
          document.removeEventListener("visibilitychange", this.onFocus)
        );
      }
    }
  }

  @computed
  get isAuthenticated(): boolean {
    return this.status === "authenticated" && this.user !== undefined;
  }

  @computed
  get displayName(): string {
    return this.user?.displayName || this.user?.name || "";
  }

  @computed
  get loginUrl(): string {
    return this.serverUrls.login ?? this.config.loginUrl;
  }

  @computed
  get logoutUrl(): string | undefined {
    return this.serverUrls.logout ?? this.config.logoutUrl;
  }

  @computed
  get profileUrl(): string | undefined {
    const name = this.user?.name;
    if (!name) return undefined;
    if (this.serverUrls.profile) return this.serverUrls.profile;
    const template = this.config.profileUrl;
    return template
      ? template.replace(/\{\{\s*user\s*\}\}/g, encodeURIComponent(name))
      : undefined;
  }

  /**
   * Id of a root catalog member injected by the CKAN embedded view
   * (`#start=` data), if any.
   */
  @computed
  get injectedPrivateCatalogId(): string | undefined {
    return this.terria.catalog.group.memberModels.find(
      (m) =>
        m.uniqueId !== undefined &&
        m.uniqueId.startsWith(CKAN_PRIVATE_CATALOG_ID_PREFIX)
    )?.uniqueId;
  }

  /** Id of the root member that currently holds the private catalog, if any. */
  @computed
  get activeCatalogId(): string | undefined {
    const injected = this.injectedPrivateCatalogId;
    if (injected !== undefined) return injected;
    return this.terria.catalog.group.memberModels.some(
      (m) => m.uniqueId === this.groupId
    )
      ? this.groupId
      : undefined;
  }

  buildLoginHref(): string {
    return appendCameFrom(this.loginUrl);
  }

  buildLogoutHref(): string | undefined {
    const url = this.logoutUrl;
    return url === undefined ? undefined : appendCameFrom(url);
  }

  /**
   * Re-checks the session. Never rejects. Concurrent calls share the
   * in-flight request.
   */
  refresh(): Promise<void> {
    return this._inflight ?? this.startRefresh();
  }

  @action
  markLoginOpened(): void {
    this.pendingLogin = true;
  }

  @action
  markLogoutOpened(): void {
    this.pendingLogout = true;
  }

  /** Opens the login page in a new tab (programmatic use / tests; the UI uses real links). */
  openLogin(): void {
    if (typeof window !== "undefined") {
      window.open(this.buildLoginHref(), "_blank", "noopener,noreferrer");
    }
    this.markLoginOpened();
  }

  /** Opens the logout URL in a new tab (programmatic use / tests; the UI uses real links). */
  openLogout(): void {
    const href = this.buildLogoutHref();
    if (href === undefined) return;
    if (typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer");
    }
    this.markLogoutOpened();
  }

  /**
   * Called by `CkanPrivateCatalogReference` when the private catalog answers
   * 401/403: re-checks the session immediately, superseding any in-flight
   * whoami (its response is then ignored).
   */
  handleUnauthorized(_statusCode: 401 | 403): void {
    void this.startRefresh();
  }

  /** Enables catalog changes. Called by `Terria.start()` once the init sources and share data have been applied. */
  @action
  setReady(): void {
    this.ready = true;
  }

  /** Removes listeners and stops the catalog reaction. Does not touch the catalog. */
  dispose(): void {
    this._disposers.splice(0).forEach((dispose) => dispose());
    ++this._seq;
  }

  private readonly onFocus = (): void => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }
    const min =
      this.pendingLogin || this.pendingLogout
        ? PENDING_FOCUS_THROTTLE_MS
        : this.config.focusThrottleMs;
    if (Date.now() - this._lastCheck < min) return;
    void this.refresh();
  };

  private startRefresh(): Promise<void> {
    const seq = ++this._seq;
    const promise = this.doRefresh(seq).finally(() => {
      if (this._inflight === promise) this._inflight = undefined;
    });
    this._inflight = promise;
    return promise;
  }

  private async doRefresh(seq: number): Promise<void> {
    runInAction(() => {
      this.isRefreshing = true;
    });
    try {
      const json: unknown = await loadJson(
        appendQuery(this.config.sessionUrl, "_=" + Date.now())
      );
      if (seq !== this._seq) return;
      this.applySessionJson(json);
    } catch (e) {
      if (seq !== this._seq) return;
      if (e instanceof RequestErrorEvent && e.statusCode === 401) {
        this.applySessionJson({ authenticated: false });
      } else {
        runInAction(() => {
          this.status = "error";
          this.lastError = TerriaError.from(e);
        });
      }
    } finally {
      if (seq === this._seq) {
        runInAction(() => {
          this.isRefreshing = false;
          this.pendingLogin = false;
          this.pendingLogout = false;
        });
        this._lastCheck = Date.now();
      }
    }
  }

  @action
  private applySessionJson(json: unknown): void {
    const payload = isJsonObject(json, false) ? json : undefined;
    const userJson =
      payload && isJsonObject(payload.user, false) ? payload.user : undefined;
    const name =
      userJson && typeof userJson.name === "string" ? userJson.name : "";

    if (payload) {
      const urls: ServerUrls = {};
      if (isSafeRelativePath(payload.login_url)) urls.login = payload.login_url;
      if (isSafeRelativePath(payload.logout_url))
        urls.logout = payload.logout_url;
      if (isSafeRelativePath(payload.profile_url))
        urls.profile = payload.profile_url;
      this.serverUrls = urls;
    }
    this.lastError = undefined;

    if (payload?.authenticated === true && userJson && name) {
      if (this.user?.name !== name) {
        if (this.user !== undefined) {
          // Switching between two users: nothing of the previous user may
          // survive (including orphan ids from share links).
          this.removePrivateCatalog(true);
        }
        this.privateCatalogUrl = isSafeRelativePath(payload.private_catalog_url)
          ? payload.private_catalog_url
          : appendQuery(
              this.config.privateCatalogUrl,
              "catalog_id=" + generateNonce()
            );
      }
      const displayName =
        typeof userJson.display_name === "string" && userJson.display_name
          ? userJson.display_name
          : name;
      this.user = {
        name,
        displayName,
        sysadmin: userJson.sysadmin === true
      };
      this.status = "authenticated";
    } else {
      this.user = undefined;
      this.privateCatalogUrl = undefined;
      this.status = "anonymous";
    }
  }

  @action
  private syncCatalog(next: SyncState, prev: SyncState | undefined): void {
    if (!next.ready) return;
    if (next.status === "authenticated") {
      const user = this.user;
      if (user !== undefined && next.name && next.url) {
        this.upsertPrivateCatalog(user, next.url);
      }
    } else if (next.status === "anonymous") {
      const wasAuthenticated = prev?.name !== undefined;
      const hasPrivateShareIds =
        !wasAuthenticated &&
        !this._shareLoginNotified &&
        this.terria.modelIds.some((id) =>
          id.startsWith(CKAN_PRIVATE_CATALOG_ID_PREFIX)
        );
      const removed = this.removePrivateCatalog(true);
      if (wasAuthenticated && removed.workbenchItems > 0) {
        this.terria.notificationState.addNotificationToQueue({
          key: `ckanSession/loggedOut/${this.catalogGeneration}`,
          title: i18next.t("ckanSession.notifications.loggedOutTitle"),
          message: i18next.t("ckanSession.notifications.loggedOutMessage", {
            count: removed.workbenchItems
          })
        });
      } else if (hasPrivateShareIds) {
        // A share link with private layers was opened without a session.
        this._shareLoginNotified = true;
        this.terria.notificationState.addNotificationToQueue({
          key: "ckanSession/shareRequiresLogin",
          title: i18next.t("ckanSession.notifications.shareRequiresLoginTitle"),
          message: i18next.t(
            "ckanSession.notifications.shareRequiresLoginMessage"
          ),
          confirmText: i18next.t("ckanSession.btnLogin"),
          confirmAction: () => this.openLogin(),
          denyText: i18next.t("ckanSession.notifications.dismiss")
        });
      }
    }
    // "unknown" / "error": leave the catalog untouched.
  }

  @action
  private upsertPrivateCatalog(user: CkanSessionUser, url: string): void {
    if (this.injectedPrivateCatalogId !== undefined) {
      // Embedded view: the `#start=` data already injected the private catalog.
      this._attached = undefined;
      return;
    }
    if (
      this._attached !== undefined &&
      this._attached.name === user.name &&
      this._attached.url === url &&
      this.terria.getModelById(BaseModel, this.groupId) !== undefined
    ) {
      return;
    }

    // Clears a previous wrapper (user switch, or an id pre-created by a share
    // link). Models loaded from a share link for this same user are kept.
    this.removePrivateCatalog(false);

    const root = this.terria.catalog.group;
    const name = this.groupName(user);
    root
      .addMembersFromJson(CommonStrata.definition, [
        {
          id: this.groupId,
          type: "group",
          name,
          isOpen: true,
          shareable: false,
          description: i18next.t("ckanSession.groupDescription", {
            user: user.displayName
          }),
          members: [
            {
              id: this.referenceId,
              type: PRIVATE_CATALOG_REFERENCE_TYPE,
              name: i18next.t("ckanSession.organisations"),
              isGroup: true,
              url
            }
          ]
        }
      ])
      .logError();
    this._attached = { name: user.name, url };
    this.catalogGeneration++;

    // Eager load (one GET with the session cookie) so the catalog tab shows
    // Group -> Organisations -> datasets without extra clicks.
    const ref = this.terria.getModelById(BaseModel, this.referenceId);
    if (ref !== undefined && ReferenceMixin.isMixedInto(ref)) {
      void ref.loadReference().then((result) => {
        result.logError();
        const target = ref.target;
        if (GroupMixin.isMixedInto(target)) {
          runInAction(() => {
            target.setTrait(CommonStrata.definition, "isOpen", true);
            if (hasTraits(target, CatalogMemberTraits, "shareable")) {
              target.setTrait(CommonStrata.definition, "shareable", false);
            }
          });
        }
      });
    }
  }

  /**
   * Removes the wrapper group, its loaded descendants and (when
   * `sweepOrphans` is true) every model whose id starts with
   * `CKAN_PRIVATE_CATALOG_ID_PREFIX` (injected by `#start=` or left by a
   * share link). Returns how many models and workbench items were removed.
   */
  @action
  private removePrivateCatalog(sweepOrphans: boolean): {
    models: number;
    workbenchItems: number;
  } {
    const terria = this.terria;
    const root = terria.catalog.group;
    const doomed: BaseModel[] = [];
    const seen = new Set<BaseModel>();
    const visit = (model: BaseModel): void => {
      if (seen.has(model)) return;
      seen.add(model);
      const dereferenced = getDereferencedIfExists(model);
      if (GroupMixin.isMixedInto(dereferenced)) {
        dereferenced.memberModels.forEach(visit);
      }
      if (dereferenced !== model && !seen.has(dereferenced)) {
        seen.add(dereferenced);
        doomed.push(dereferenced);
      }
      doomed.push(model);
    };

    const wrapper = terria.getModelById(BaseModel, this.groupId);
    if (wrapper !== undefined) visit(wrapper);

    const childPrefix = `${this.groupId}/`;
    terria.modelIds
      .filter(
        (id) =>
          id.startsWith(childPrefix) ||
          (sweepOrphans && id.startsWith(CKAN_PRIVATE_CATALOG_ID_PREFIX))
      )
      .forEach((id) => {
        const model = terria.getModelById(BaseModel, id);
        if (model !== undefined) visit(model);
      });

    const workbenchIndices = new Set<number>();
    doomed.forEach((model) => {
      const index = terria.workbench.indexOf(model);
      if (index >= 0) workbenchIndices.add(index);
    });
    const workbenchItems = workbenchIndices.size;

    doomed.forEach((model) => {
      terria.removeModelReferences(model);
      model.dispose();
    });

    // Root membership may live in any stratum (e.g. `#start=` uses `user`).
    const rootStrata = Array.from(root.strata.keys());
    doomed.forEach((model) => {
      rootStrata.forEach((stratumId) => root.remove(stratumId, model));
    });

    this._attached = undefined;
    if (doomed.length > 0) this.catalogGeneration++;
    return { models: doomed.length, workbenchItems };
  }

  private groupName(user: CkanSessionUser): string {
    const template = this.config.catalogGroupName;
    return template
      ? template.replace(/\{\{\s*user\s*\}\}/g, user.displayName)
      : i18next.t("ckanSession.privateCatalogName", {
          user: user.displayName
        });
  }
}
