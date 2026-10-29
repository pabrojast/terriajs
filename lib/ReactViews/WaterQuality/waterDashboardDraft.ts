import CogTimeSeriesCatalogItem from "../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import { dashboardSources } from "../../Models/SimpleDashboard/Sources";
import { DashboardConfig } from "../../Models/SimpleDashboard/Types";
import { WaterBody, waterBodyName } from "../../Core/WaterQuality";

/** Creates an unsaved personal design; never edits the pilot or a shared revision. */
export default function waterDashboardDraft(
  item: CogTimeSeriesCatalogItem,
  bodies: WaterBody[],
  date: string,
  language: string
): DashboardConfig {
  const source = dashboardSources(item.terria).find(
    (s) => s.local_id === `layer:${item.uniqueId}`
  )!;
  const resolution = item.activeResolution?.id;
  const end = /^\d{4}-\d{2}$/.test(date)
    ? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5)), 0))
        .toISOString()
        .slice(0, 10)
    : /^\d{4}$/.test(date)
      ? `${date}-12-31`
      : date;
  return {
    version: 1,
    title: item.name || item.waterQuality?.pilotId || "Water",
    sources: [
      {
        ...source,
        resolution:
          resolution === "daily" || resolution === "annual"
            ? resolution
            : "monthly"
      }
    ],
    blocks: bodies.slice(0, 3).flatMap((body) => [
      {
        id: `history-${body.id}`,
        source_id: source.id,
        title: waterBodyName(body, language),
        type: "line" as const,
        aggregate: "avg" as const,
        body_id: body.id,
        unit: item.unit
      },
      {
        id: `values-${body.id}`,
        source_id: source.id,
        title: waterBodyName(body, language),
        type: "table" as const,
        aggregate: "avg" as const,
        body_id: body.id,
        unit: item.unit
      }
    ]),
    state: end ? { start: `${end.slice(0, 4)}-01-01`, end } : {}
  };
}
