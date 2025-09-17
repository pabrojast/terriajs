/**
 * STAC Authentication Manager
 * 
 * Handles authentication for STAC APIs including token management,
 * refresh mechanisms, and multiple authentication methods
 */

import { action, computed, makeObservable, observable, reaction } from "mobx";
import isDefined from "../../../Core/isDefined";
import TerriaError from "../../../Core/TerriaError";

export type AuthenticationMethod = "bearer" | "basic" | "oauth2" | "api-key" | "none";

export interface AuthenticationConfig {
  method: AuthenticationMethod;
  endpoint?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string[];
  tokenEndpoint?: string;
  authorizationEndpoint?: string;
  redirectUri?: string;
}

export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
  expiresAt?: Date;
  scope?: string[];
}

export interface AuthenticationState {
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  method: AuthenticationMethod;
  tokenInfo?: TokenInfo;
  lastError?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    organization?: string;
  };
}

export class StacAuthenticationManager {
  @observable
  private _authState: AuthenticationState = {
    isAuthenticated: false,
    isAuthenticating: false,
    method: "none"
  };

  @observable
  private _config?: AuthenticationConfig;

  @observable
  private _tokenRefreshTimer?: number;

  private readonly storageKey = "terriajs_stac_auth";

  constructor() {
    makeObservable(this);
    this.loadStoredAuth();
    this.setupTokenRefreshWatcher();
  }

  @computed
  get authState(): AuthenticationState {
    return { ...this._authState };
  }

  @computed
  get isAuthenticated(): boolean {
    return this._authState.isAuthenticated;
  }

  @computed
  get isAuthenticating(): boolean {
    return this._authState.isAuthenticating;
  }

  @computed
  get accessToken(): string | undefined {
    return this._authState.tokenInfo?.accessToken;
  }

  @computed
  get authHeader(): Record<string, string> {
    if (!this.isAuthenticated || !this._authState.tokenInfo) {
      return {};
    }

    const token = this._authState.tokenInfo;
    
    switch (this._authState.method) {
      case "bearer":
        return { 
          "Authorization": `${token.tokenType || "Bearer"} ${token.accessToken}` 
        };
      case "api-key":
        // API key can be in header or query param - we'll use header
        return { 
          "X-API-Key": token.accessToken 
        };
      case "basic":
        // Basic auth would typically use username:password, but we'll use token
        return { 
          "Authorization": `Basic ${btoa(token.accessToken + ":")}` 
        };
      default:
        return {};
    }
  }

  @computed
  get needsRefresh(): boolean {
    if (!this._authState.tokenInfo?.expiresAt) return false;
    
    // Refresh if expires within 5 minutes
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return this._authState.tokenInfo.expiresAt <= fiveMinutesFromNow;
  }

  @action
  configure(config: AuthenticationConfig): void {
    this._config = config;
    
    // Reset auth state when config changes
    if (this._authState.method !== config.method) {
      this.logout();
    }
  }

  @action
  async authenticate(credentials?: {
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
  }): Promise<void> {
    if (!this._config) {
      throw new TerriaError({
        title: "Authentication not configured",
        message: "Authentication configuration is required"
      });
    }

    this._authState.isAuthenticating = true;
    this._authState.lastError = undefined;

    try {
      let tokenInfo: TokenInfo;

      switch (this._config.method) {
        case "bearer":
          if (credentials?.token) {
            tokenInfo = {
              accessToken: credentials.token,
              tokenType: "Bearer"
            };
          } else {
            throw new TerriaError({
              title: "Token required",
              message: "Bearer token is required for authentication"
            });
          }
          break;

        case "api-key":
          if (credentials?.apiKey) {
            tokenInfo = {
              accessToken: credentials.apiKey,
              tokenType: "API-Key"
            };
          } else {
            throw new TerriaError({
              title: "API key required", 
              message: "API key is required for authentication"
            });
          }
          break;

        case "basic":
          if (credentials?.username && credentials?.password) {
            const basicToken = btoa(`${credentials.username}:${credentials.password}`);
            tokenInfo = {
              accessToken: basicToken,
              tokenType: "Basic"
            };
          } else {
            throw new TerriaError({
              title: "Credentials required",
              message: "Username and password are required for basic authentication"
            });
          }
          break;

        case "oauth2":
          tokenInfo = await this.authenticateOAuth2(credentials);
          break;

        default:
          throw new TerriaError({
            title: "Unsupported authentication method",
            message: `Authentication method ${this._config.method} is not supported`
          });
      }

      this._authState.tokenInfo = tokenInfo;
      this._authState.isAuthenticated = true;
      this._authState.method = this._config.method;
      
      this.saveAuth();
      this.scheduleTokenRefresh();
      
      // Try to get user info if possible
      await this.loadUserInfo();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Authentication failed";
      this._authState.lastError = errorMessage;
      this._authState.isAuthenticated = false;
      
      throw new TerriaError({
        title: "Authentication failed",
        message: errorMessage
      });
    } finally {
      this._authState.isAuthenticating = false;
    }
  }

  @action
  async refreshToken(): Promise<void> {
    if (!this._authState.tokenInfo?.refreshToken || !this._config?.tokenEndpoint) {
      // If no refresh token, try to re-authenticate
      throw new TerriaError({
        title: "Cannot refresh token",
        message: "No refresh token available"
      });
    }

    this._authState.isAuthenticating = true;

    try {
      const response = await fetch(this._config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this._authState.tokenInfo.refreshToken,
          client_id: this._config.clientId || "",
          client_secret: this._config.clientSecret || ""
        })
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData = await response.json();
      
      this._authState.tokenInfo = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || this._authState.tokenInfo.refreshToken,
        tokenType: tokenData.token_type || "Bearer",
        expiresIn: tokenData.expires_in,
        expiresAt: tokenData.expires_in ? 
          new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
        scope: tokenData.scope ? tokenData.scope.split(" ") : undefined
      };

      this.saveAuth();
      this.scheduleTokenRefresh();

    } catch (error) {
      this._authState.lastError = error instanceof Error ? error.message : "Token refresh failed";
      this.logout(); // Force logout on refresh failure
      throw error;
    } finally {
      this._authState.isAuthenticating = false;
    }
  }

  @action
  logout(): void {
    this._authState.isAuthenticated = false;
    this._authState.tokenInfo = undefined;
    this._authState.user = undefined;
    this._authState.lastError = undefined;
    this._authState.method = "none";

    this.clearStoredAuth();
    this.clearTokenRefreshTimer();
  }

  private async authenticateOAuth2(_credentials?: any): Promise<TokenInfo> {
    if (!this._config?.tokenEndpoint || !this._config?.clientId) {
      throw new TerriaError({
        title: "OAuth2 configuration incomplete",
        message: "OAuth2 requires tokenEndpoint and clientId"
      });
    }

    // For OAuth2, we typically need to redirect to authorization server
    // This is a simplified implementation for client credentials flow
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this._config.clientId,
      client_secret: this._config.clientSecret || "",
      scope: this._config.scope?.join(" ") || ""
    });

    const response = await fetch(this._config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`OAuth2 authentication failed: ${response.status}`);
    }

    const tokenData = await response.json();

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type || "Bearer",
      expiresIn: tokenData.expires_in,
      expiresAt: tokenData.expires_in ? 
        new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
      scope: tokenData.scope ? tokenData.scope.split(" ") : undefined
    };
  }

  private async loadUserInfo(): Promise<void> {
    // Try to load user info from a standard endpoint
    // This would depend on the specific STAC API implementation
    try {
      if (this._config?.endpoint) {
        const userInfoEndpoint = `${this._config.endpoint}/user`;
        const response = await fetch(userInfoEndpoint, {
          headers: this.authHeader
        });

        if (response.ok) {
          const userInfo = await response.json();
          this._authState.user = {
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            organization: userInfo.organization
          };
        }
      }
    } catch (error) {
      // User info is optional, don't fail if not available
      console.debug("Could not load user info:", error);
    }
  }

  private scheduleTokenRefresh(): void {
    this.clearTokenRefreshTimer();

    if (!this._authState.tokenInfo?.expiresAt) return;

    const refreshTime = this._authState.tokenInfo.expiresAt.getTime() - Date.now() - (5 * 60 * 1000); // 5 minutes before expiry
    
    if (refreshTime > 0) {
      this._tokenRefreshTimer = window.setTimeout(() => {
        this.refreshToken().catch(error => {
          console.error("Automatic token refresh failed:", error);
        });
      }, refreshTime);
    }
  }

  private clearTokenRefreshTimer(): void {
    if (isDefined(this._tokenRefreshTimer)) {
      window.clearTimeout(this._tokenRefreshTimer);
      this._tokenRefreshTimer = undefined;
    }
  }

  private setupTokenRefreshWatcher(): void {
    // Watch for changes that might require token refresh
    reaction(
      () => this.needsRefresh,
      (needsRefresh) => {
        if (needsRefresh && this.isAuthenticated) {
          this.refreshToken().catch(error => {
            console.error("Token refresh failed:", error);
          });
        }
      }
    );
  }

  private saveAuth(): void {
    try {
      const authData = {
        tokenInfo: this._authState.tokenInfo,
        method: this._authState.method,
        user: this._authState.user,
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(authData));
    } catch (error) {
      console.warn("Failed to save authentication data:", error);
    }
  }

  private loadStoredAuth(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const authData = JSON.parse(stored);
      
      // Check if stored auth is still valid
      if (authData.tokenInfo?.expiresAt) {
        const expiresAt = new Date(authData.tokenInfo.expiresAt);
        if (expiresAt <= new Date()) {
          this.clearStoredAuth();
          return;
        }
        authData.tokenInfo.expiresAt = expiresAt;
      }

      // Check if stored auth is not too old (max 7 days)
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (authData.timestamp && Date.now() - authData.timestamp > maxAge) {
        this.clearStoredAuth();
        return;
      }

      this._authState.tokenInfo = authData.tokenInfo;
      this._authState.method = authData.method || "bearer";
      this._authState.user = authData.user;
      this._authState.isAuthenticated = !!authData.tokenInfo?.accessToken;

      if (this.isAuthenticated) {
        this.scheduleTokenRefresh();
      }

    } catch (error) {
      console.warn("Failed to load stored authentication data:", error);
      this.clearStoredAuth();
    }
  }

  private clearStoredAuth(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn("Failed to clear stored authentication data:", error);
    }
  }

  // Utility methods
  isTokenExpired(): boolean {
    if (!this._authState.tokenInfo?.expiresAt) return false;
    return this._authState.tokenInfo.expiresAt <= new Date();
  }

  getTokenExpiryTime(): Date | undefined {
    return this._authState.tokenInfo?.expiresAt;
  }

  hasScope(requiredScope: string): boolean {
    if (!this._authState.tokenInfo?.scope) return true; // No scope restrictions
    return this._authState.tokenInfo.scope.includes(requiredScope);
  }

  // Static helper methods
  static createBearerConfig(endpoint?: string): AuthenticationConfig {
    return {
      method: "bearer",
      endpoint
    };
  }

  static createApiKeyConfig(endpoint?: string): AuthenticationConfig {
    return {
      method: "api-key",
      endpoint
    };
  }

  static createOAuth2Config(
    tokenEndpoint: string,
    authorizationEndpoint: string,
    clientId: string,
    clientSecret?: string,
    scope?: string[],
    redirectUri?: string
  ): AuthenticationConfig {
    return {
      method: "oauth2",
      tokenEndpoint,
      authorizationEndpoint,
      clientId,
      clientSecret,
      scope,
      redirectUri
    };
  }
}