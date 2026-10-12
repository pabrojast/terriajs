import fetchMock from "fetch-mock";
import Terria from "../../../../lib/Models/Terria";
import {
  canUseTerrascopeAuth,
  getDefaultTerrascopeAuthConfig,
  getTerrascopeAuthHeaders,
  getTerrascopeAuthSession
} from "../../../../lib/Models/Catalog/Stac/TerrascopeAuth";

describe("TerrascopeAuth", function () {
  let terria: Terria;

  beforeEach(function () {
    terria = new Terria();
    sessionStorage.clear();
    fetchMock.restore();
  });

  afterEach(function () {
    fetchMock.restore();
    sessionStorage.clear();
  });

  it("defaults Terrascope URLs to oidc_password auth", function () {
    const config = getDefaultTerrascopeAuthConfig(
      "https://stac.terrascope.be/collections/terrascope-s2-chl-v1"
    );

    expect(config?.mode).toBe("oidc_password");
    expect(config?.clientId).toBe("public");
    expect(config?.tokenUrl).toContain("/protocol/openid-connect/token");
    expect(
      canUseTerrascopeAuth(
        "https://stac.terrascope.be/collections/terrascope-s2-chl-v1"
      )
    ).toBe(true);
  });

  it("requests an access token with password grant and exposes bearer headers", async function () {
    fetchMock.post("https://sso.example.com/token", {
      body: JSON.stringify({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3600
      }),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const session = getTerrascopeAuthSession(
      terria,
      "https://stac.terrascope.be/collections/test",
      {
        mode: "oidc_password",
        tokenUrl: "https://sso.example.com/token",
        clientId: "public",
        tokenPersistence: "page"
      }
    )!;

    await session.loginWithPassword("user@example.com", "secret");

    expect(session.isAuthenticated).toBe(true);
    expect(session.headers.Authorization).toBe("Bearer access-1");

    const lastCall = fetchMock.lastCall("https://sso.example.com/token") as
      | [string, RequestInit]
      | undefined;
    expect(lastCall).toBeDefined();
    expect(String(lastCall?.[1].body)).toContain("grant_type=password");
    expect(String(lastCall?.[1].body)).toContain("username=user%40example.com");
    expect(String(lastCall?.[1].body)).toContain("password=secret");

    session.clear();
  });

  it("refreshes expired tokens before returning auth headers", async function () {
    fetchMock.post("https://sso.example.com/token", {
      body: JSON.stringify({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3600
      }),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const session = getTerrascopeAuthSession(
      terria,
      "https://stac.terrascope.be/collections/test",
      {
        mode: "oidc_password",
        tokenUrl: "https://sso.example.com/token",
        clientId: "public",
        tokenPersistence: "page"
      }
    )!;
    await session.loginWithPassword("user@example.com", "secret");

    fetchMock.restore();
    fetchMock.post("https://sso.example.com/token", {
      body: JSON.stringify({
        access_token: "access-2",
        refresh_token: "refresh-2",
        expires_in: 3600
      }),
      headers: {
        "Content-Type": "application/json"
      }
    });

    (session as any).accessExpiresAt = Date.now() - 1000;

    const headers = await getTerrascopeAuthHeaders(
      terria,
      "https://services.terrascope.be/download/protected.tif",
      {
        mode: "oidc_password",
        tokenUrl: "https://sso.example.com/token",
        clientId: "public",
        tokenPersistence: "page"
      }
    );

    expect(headers?.Authorization).toBe("Bearer access-2");
    expect((session as any).refreshToken).toBe("refresh-2");

    const lastCall = fetchMock.lastCall("https://sso.example.com/token") as
      | [string, RequestInit]
      | undefined;
    expect(String(lastCall?.[1].body)).toContain("grant_type=refresh_token");
    expect(String(lastCall?.[1].body)).toContain("refresh_token=refresh-1");

    session.clear();
  });

  it("persists tokens without storing username or password", async function () {
    fetchMock.post("https://sso.example.com/token", {
      body: JSON.stringify({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3600
      }),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const session = getTerrascopeAuthSession(
      terria,
      "https://stac.terrascope.be/collections/test",
      {
        mode: "oidc_password",
        tokenUrl: "https://sso.example.com/token",
        clientId: "public",
        tokenPersistence: "sessionStorage"
      }
    )!;
    await session.loginWithPassword("user@example.com", "super-secret");

    const storageKeys = Array.from(
      { length: sessionStorage.length },
      (_, index) => sessionStorage.key(index)
    ).filter((key): key is string => key !== null);

    expect(storageKeys.length).toBe(1);
    expect(storageKeys[0]).toContain("terrascope-auth:");

    const storedValue = sessionStorage.getItem(storageKeys[0]);
    expect(storedValue).toContain("accessToken");
    expect(storedValue).toContain("refreshToken");
    expect(storedValue).not.toContain("user@example.com");
    expect(storedValue).not.toContain("super-secret");

    session.clear();
    expect(sessionStorage.length).toBe(0);
  });
});
