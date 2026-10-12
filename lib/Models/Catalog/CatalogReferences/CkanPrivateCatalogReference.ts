import i18next from "i18next";
import RequestErrorEvent from "terriajs-cesium/Source/Core/RequestErrorEvent";
import TerriaError from "../../../Core/TerriaError";
import TerriaReference from "./TerriaReference";

/**
 * A `terria-reference` pointing at the CKAN private catalog index of the
 * current portal session (same-origin, cookie authenticated).
 *
 * It behaves exactly like `TerriaReference`, but a 401/403 answer is mapped
 * to a translated error (default `Error` severity, so the user sees it) and
 * `terria.ckanSession` is asked to re-check the session.
 */
export default class CkanPrivateCatalogReference extends TerriaReference {
  static readonly type = "ckan-private-catalog-reference";

  get type() {
    return CkanPrivateCatalogReference.type;
  }

  protected async loadInitJson(): Promise<unknown> {
    try {
      return await super.loadInitJson();
    } catch (e) {
      if (e instanceof RequestErrorEvent) {
        const statusCode = e.statusCode;
        if (statusCode === 401 || statusCode === 403) {
          this.terria.ckanSession?.handleUnauthorized(statusCode);
          throw new TerriaError({
            sender: this,
            title: i18next.t("ckanSession.errors.title"),
            message: i18next.t(
              statusCode === 401
                ? "ckanSession.errors.sessionExpired"
                : "ckanSession.errors.forbidden"
            )
          });
        }
      }
      throw e;
    }
  }
}
