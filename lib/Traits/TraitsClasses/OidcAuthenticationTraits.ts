import objectTrait from "../Decorators/objectTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import ModelTraits from "../ModelTraits";

export class OidcTokenPersistenceTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Token Persistence",
    description:
      "Where to persist Terrascope access and refresh tokens. `page` keeps them only in memory for the current load. `sessionStorage` persists them for the current browser tab."
  })
  mode: "page" | "sessionStorage" = "sessionStorage";
}

export default class OidcAuthenticationTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Authentication Mode",
    description:
      "Authentication mode for protected assets. Use `oidc_password` for Terrascope OIDC password grant, `bearer` for pre-issued tokens, or `none` to disable auth."
  })
  mode: "none" | "bearer" | "oidc_password" = "none";

  @primitiveTrait({
    type: "string",
    name: "Token URL",
    description: "OAuth/OIDC token endpoint."
  })
  tokenUrl?: string;

  @primitiveTrait({
    type: "string",
    name: "Client ID",
    description: "OAuth/OIDC client identifier."
  })
  clientId?: string;

  @primitiveTrait({
    type: "string",
    name: "Scope",
    description: "Optional OAuth scope."
  })
  scope?: string;

  @objectTrait({
    type: OidcTokenPersistenceTraits,
    name: "Token Persistence",
    description:
      "Controls whether Terrascope tokens are kept only for the current page load or for the current browser tab."
  })
  tokenPersistence?: OidcTokenPersistenceTraits;
}
