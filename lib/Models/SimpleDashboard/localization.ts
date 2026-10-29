import i18next from "i18next";
import type en from "../../../wwwroot/languages/en/translation.json";

type DashboardText = Exclude<keyof typeof en.simpleDashboard, "messages">;
export const dashboardText = (key: DashboardText) =>
  i18next.t(`simpleDashboard.${key}`);
export const dashboardLocale = () =>
  (i18next.resolvedLanguage || i18next.language || "en").replace(/_/g, "-");

export function dashboardMessage(message: string) {
  const plain = message.replace(/^Error: /, "");
  const messages: unknown = i18next.t("simpleDashboard.messages", {
    returnObjects: true
  });
  if (
    messages &&
    typeof messages === "object" &&
    Object.prototype.hasOwnProperty.call(messages, plain)
  ) {
    const translated = (messages as Record<string, unknown>)[plain];
    if (typeof translated === "string") return translated;
  }
  return plain;
}

export function formatDashboardValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return dashboardText(value ? "yes" : "no");
  if (typeof value === "number")
    return value.toLocaleString(dashboardLocale(), {
      maximumFractionDigits: 3
    });
  return String(value);
}

export function formatDashboardDate(value: string) {
  if (!/^\d{4}-\d{2}(?:-\d{2}(?:T[\d:.]+Z?)?)?$/.test(value)) return value;
  const date = new Date(value.length === 7 ? value + "-01T00:00:00Z" : value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(dashboardLocale(), {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    ...(value.length > 7 ? { day: "numeric" as const } : {})
  });
}
