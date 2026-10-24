import Terria from "../../Terria";
import { isTerrascopeUrl } from "./stacAssetUtils";

export type TerrascopeAuthMode = "none" | "bearer" | "oidc_password";
export type TerrascopeTokenPersistence = "page" | "sessionStorage";

export interface TerrascopeAuthConfig {
  mode?: TerrascopeAuthMode;
  tokenUrl?: string;
  clientId?: string;
  scope?: string;
  tokenPersistence?: TerrascopeTokenPersistence;
}

interface TokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
}

interface StoredTokenState {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface TokenPersistence {
  get(key: string): StoredTokenState | undefined;
  set(key: string, value: StoredTokenState): void;
  clear(key: string): void;
}

const DEFAULT_TERRASCOPE_TOKEN_URL =
  "https://sso.terrascope.be/auth/realms/terrascope/protocol/openid-connect/token";
const DEFAULT_TERRASCOPE_CLIENT_ID = "public";
const STORAGE_PREFIX = "terrascope-auth:";
const EXPIRY_SKEW_MS = 20_000;

class PageTokenPersistence implements TokenPersistence {
  private readonly values = new Map<string, StoredTokenState>();

  get(key: string): StoredTokenState | undefined {
    return this.values.get(key);
  }

  set(key: string, value: StoredTokenState): void {
    this.values.set(key, value);
  }

  clear(key: string): void {
    this.values.delete(key);
  }
}

class SessionStorageTokenPersistence implements TokenPersistence {
  get(key: string): StoredTokenState | undefined {
    try {
      if (typeof sessionStorage === "undefined") return undefined;
      const raw = sessionStorage.getItem(key);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return undefined;
      return parsed as StoredTokenState;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: StoredTokenState): void {
    try {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage write failures and continue in-memory.
    }
  }

  clear(key: string): void {
    try {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}

const tokenPersistenceLookup: Record<
  TerrascopeTokenPersistence,
  TokenPersistence
> = {
  page: new PageTokenPersistence(),
  sessionStorage: new SessionStorageTokenPersistence()
};

export function getDefaultTerrascopeAuthConfig(
  url: string | undefined,
  auth?: TerrascopeAuthConfig
): TerrascopeAuthConfig | undefined {
  const isTerrascope = isTerrascopeUrl(url);
  if (!auth && !isTerrascope) return undefined;

  const explicitMode = auth?.mode;
  if (explicitMode === "none" && !isTerrascope) {
    return {
      mode: "none",
      tokenPersistence: auth?.tokenPersistence ?? "sessionStorage"
    };
  }

  const mode =
    explicitMode ?? (isTerrascope ? ("oidc_password" as const) : "none");

  return {
    mode,
    tokenUrl:
      auth?.tokenUrl ??
      (isTerrascope ? DEFAULT_TERRASCOPE_TOKEN_URL : undefined),
    clientId:
      auth?.clientId ??
      (isTerrascope ? DEFAULT_TERRASCOPE_CLIENT_ID : undefined),
    scope: auth?.scope,
    tokenPersistence: auth?.tokenPersistence ?? "sessionStorage"
  };
}

export function canUseTerrascopeAuth(
  url: string | undefined,
  auth?: TerrascopeAuthConfig
): boolean {
  const config = getDefaultTerrascopeAuthConfig(url, auth);
  return (
    !!config && config.mode !== "none" && !!config.tokenUrl && !!config.clientId
  );
}

export class TerrascopeAuthSession {
  private accessToken?: string;
  private refreshToken?: string;
  private accessExpiresAt?: number;
  private username?: string;
  private password?: string;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  readonly headers: Record<string, string> = {};

  constructor(
    readonly key: string,
    private readonly config: TerrascopeAuthConfig,
    private readonly persistence: TokenPersistence
  ) {
    const stored = persistence.get(key);
    if (stored) {
      this.accessToken = stored.accessToken;
      this.refreshToken = stored.refreshToken;
      this.accessExpiresAt = stored.expiresAt;
      this.syncHeaders();
      this.scheduleRefresh();
    }
  }

  get hasToken(): boolean {
    return !!this.accessToken;
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  get currentUsername(): string | undefined {
    return this.username;
  }

  async ensureAuthenticated(): Promise<boolean> {
    if (this.config.mode === "none") return false;

    if (this.hasUsableAccessToken()) {
      this.scheduleRefresh();
      this.syncHeaders();
      return true;
    }

    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return true;
      } catch {
        // Fall back to password grant below when credentials are available.
      }
    }

    if (
      this.config.mode === "oidc_password" &&
      this.username &&
      this.password
    ) {
      await this.passwordGrant();
      return true;
    }

    if (this.config.mode === "bearer" && this.accessToken) {
      this.syncHeaders();
      return true;
    }

    this.syncHeaders();
    return false;
  }

  async loginWithPassword(username: string, password: string): Promise<void> {
    this.username = username.trim();
    this.password = password;
    await this.passwordGrant();
  }

  clear(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.accessExpiresAt = undefined;
    this.username = undefined;
    this.password = undefined;
    this.persistence.clear(this.key);
    this.syncHeaders();
  }

  private hasUsableAccessToken(): boolean {
    if (!this.accessToken) return false;
    if (!this.accessExpiresAt) return true;
    return Date.now() < this.accessExpiresAt - EXPIRY_SKEW_MS;
  }

  private async passwordGrant(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error("Terrascope credentials are required.");
    }

    const payload = new URLSearchParams();
    payload.set("grant_type", "password");
    payload.set(
      "client_id",
      this.config.clientId ?? DEFAULT_TERRASCOPE_CLIENT_ID
    );
    payload.set("username", this.username);
    payload.set("password", this.password);
    if (this.config.scope) {
      payload.set("scope", this.config.scope);
    }

    const tokenPayload = await requestToken(
      this.config.tokenUrl ?? DEFAULT_TERRASCOPE_TOKEN_URL,
      payload
    );
    this.applyTokenPayload(tokenPayload);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No Terrascope refresh token is available.");
    }

    const payload = new URLSearchParams();
    payload.set("grant_type", "refresh_token");
    payload.set("refresh_token", this.refreshToken);
    payload.set(
      "client_id",
      this.config.clientId ?? DEFAULT_TERRASCOPE_CLIENT_ID
    );
    if (this.config.scope) {
      payload.set("scope", this.config.scope);
    }

    const tokenPayload = await requestToken(
      this.config.tokenUrl ?? DEFAULT_TERRASCOPE_TOKEN_URL,
      payload
    );
    this.applyTokenPayload(tokenPayload);
  }

  private applyTokenPayload(tokenPayload: TokenPayload): void {
    const nextAccessToken = tokenPayload.access_token;
    if (!nextAccessToken) {
      throw new Error(
        "Terrascope token response did not include an access token."
      );
    }

    this.accessToken = nextAccessToken;
    if (tokenPayload.refresh_token) {
      this.refreshToken = tokenPayload.refresh_token;
    }

    const expiresInSeconds =
      typeof tokenPayload.expires_in === "string"
        ? parseInt(tokenPayload.expires_in, 10)
        : tokenPayload.expires_in;
    this.accessExpiresAt =
      typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds)
        ? Date.now() + expiresInSeconds * 1000
        : undefined;

    this.persistence.set(this.key, {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.accessExpiresAt
    });
    this.syncHeaders();
    this.scheduleRefresh();
  }

  private syncHeaders(): void {
    if (this.accessToken) {
      this.headers.Authorization = `Bearer ${this.accessToken}`;
    } else {
      delete this.headers.Authorization;
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (!this.accessExpiresAt || !this.refreshToken) return;

    const refreshDelay = Math.max(
      0,
      this.accessExpiresAt - Date.now() - EXPIRY_SKEW_MS
    );
    this.refreshTimer = setTimeout(() => {
      void this.refreshAccessToken().catch(() => {
        if (
          this.config.mode === "oidc_password" &&
          this.username &&
          this.password
        ) {
          void this.passwordGrant().catch(() => {
            // Keep last known token until a real request fails.
          });
        }
      });
    }, refreshDelay);
  }
}

class TerrascopeAuthService {
  private readonly sessions = new Map<string, TerrascopeAuthSession>();

  getSession(config: TerrascopeAuthConfig): TerrascopeAuthSession {
    const tokenUrl = config.tokenUrl ?? DEFAULT_TERRASCOPE_TOKEN_URL;
    const clientId = config.clientId ?? DEFAULT_TERRASCOPE_CLIENT_ID;
    const storageMode = config.tokenPersistence ?? "sessionStorage";
    const key = `${STORAGE_PREFIX}${tokenUrl}|${clientId}|${
      config.scope ?? ""
    }|${storageMode}`;
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const session = new TerrascopeAuthSession(
      key,
      config,
      tokenPersistenceLookup[storageMode] ??
        tokenPersistenceLookup.sessionStorage
    );
    this.sessions.set(key, session);
    return session;
  }
}

const authServices = new WeakMap<Terria, TerrascopeAuthService>();

export function getTerrascopeAuthService(
  terria: Terria
): TerrascopeAuthService {
  let service = authServices.get(terria);
  if (!service) {
    service = new TerrascopeAuthService();
    authServices.set(terria, service);
  }
  return service;
}

export async function getTerrascopeAuthHeaders(
  terria: Terria,
  url: string | undefined,
  auth?: TerrascopeAuthConfig
): Promise<Record<string, string> | undefined> {
  const config = getDefaultTerrascopeAuthConfig(url, auth);
  if (!config || config.mode === "none") return undefined;

  const session = getTerrascopeAuthService(terria).getSession(config);
  const authenticated = await session.ensureAuthenticated();
  return authenticated ? session.headers : undefined;
}

export function getTerrascopeAuthSession(
  terria: Terria,
  url: string | undefined,
  auth?: TerrascopeAuthConfig
): TerrascopeAuthSession | undefined {
  const config = getDefaultTerrascopeAuthConfig(url, auth);
  if (!config || config.mode === "none") return undefined;
  return getTerrascopeAuthService(terria).getSession(config);
}

async function requestToken(
  tokenUrl: string,
  payload: URLSearchParams
): Promise<TokenPayload> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  if (!response.ok) {
    throw new Error(`Terrascope authentication failed (${response.status}).`);
  }

  return (await response.json()) as TokenPayload;
}
