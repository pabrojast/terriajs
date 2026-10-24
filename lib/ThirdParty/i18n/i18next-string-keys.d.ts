// Fork (IHP-WINS): upstream enables i18next's typed selector API
// (`enableSelector: true` in ./i18next.d.ts), which removes the plain string
// key overloads from `t`. The fork still has hundreds of `t("some.key")`
// calls, so re-add string keys next to the selector overloads. Selector calls
// keep their type checking; string keys are not validated against resources.
import "i18next";
import type { DefaultNamespace, Namespace, TOptions } from "i18next";

declare module "i18next" {
  interface TFunction<
    Ns extends Namespace = DefaultNamespace,
    KPrefix = undefined
  > {
    (
      key: string | string[],
      options?: TOptions & Record<string, unknown>
    ): string;
    (
      key: string | string[],
      defaultValue: string,
      options?: TOptions & Record<string, unknown>
    ): string;
  }
}
