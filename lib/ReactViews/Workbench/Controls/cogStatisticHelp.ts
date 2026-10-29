import i18next from "i18next";
import CogTimeSeriesCatalogItem from "../../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import { SelectableDimension } from "../../../Models/SelectableDimensions/SelectableDimensions";

// Translate the known provider labels; retain author-defined band names.
const labels: Record<string, string> = {
  mean: "mean",
  median: "median",
  p90: "p90",
  "90th percentile (peaks)": "p90",
  "highest month": "maxMonth",
  "months with data": "nMonths",
  "satellite passes used": "nObs",
  "mean of monthly medians": "meanMonthly",
  "median of monthly medians": "medianMonthly",
  n_obs: "nObs",
  n_months: "nMonths",
  max_month: "maxMonth"
};

export function cogStatisticLabel(name: string): string {
  const key = labels[name.toLowerCase()];
  return key ? i18next.t(`models.cogTimeSeries.statisticLabels.${key}`) : name;
}

/** Called during render so an EN/ES switch also updates cached dimensions. */
export default function cogStatisticHelp(
  dim: SelectableDimension,
  item: CogTimeSeriesCatalogItem
): SelectableDimension {
  if (dim.id !== "cog-series-band" || (dim.type && dim.type !== "select"))
    return dim;
  const t = (key: string) => i18next.t(`models.cogTimeSeries.${key}`);
  const key =
    labels[(item.activeBand?.name || item.activeBand?.id || "").toLowerCase()];
  return {
    ...dim,
    name: t("mapStatistic"),
    description: [
      t("statisticHelp"),
      key ? t(`statisticHelpText.${key}`) : "",
      item.waterQuality?.dataUrl ? t("bodyStatisticHelp") : ""
    ]
      .filter(Boolean)
      .join(" "),
    options: dim.options?.map((option) => {
      const label = labels[(option.name || option.id || "").toLowerCase()];
      return {
        ...option,
        name: label ? t(`statisticLabels.${label}`) : option.name
      };
    })
  };
}
