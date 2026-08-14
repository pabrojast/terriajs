import i18next from "i18next";
import { computed, makeObservable } from "mobx";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import CogCatalogItemTraits from "../../../Traits/TraitsClasses/CogCatalogItemTraits";
import CogTimeSeriesCatalogItemTraits from "../../../Traits/TraitsClasses/CogTimeSeriesCatalogItemTraits";
import LegendTraits, {
  LegendItemTraits
} from "../../../Traits/TraitsClasses/LegendTraits";
import type CogCatalogItem from "./CogCatalogItem";
import type CogTimeSeriesCatalogItem from "./CogTimeSeriesCatalogItem";
import { CogEffectiveStyle, sampleCogColor } from "./CogRenderStyle";

export class CogLegendStratum extends LoadableStratum(CogCatalogItemTraits) {
  static stratumName = "cog-legend";

  constructor(readonly catalogItem: CogCatalogItem) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new CogLegendStratum(newModel as CogCatalogItem) as this;
  }

  @computed
  get legends(): StratumFromTraits<LegendTraits>[] | undefined {
    return createAutomaticCogLegends(this.catalogItem.effectiveCogStyle);
  }
}

export class CogTimeSeriesLegendStratum extends LoadableStratum(
  CogTimeSeriesCatalogItemTraits
) {
  static stratumName = "cog-time-series-legend";

  constructor(readonly catalogItem: CogTimeSeriesCatalogItem) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new CogTimeSeriesLegendStratum(
      newModel as CogTimeSeriesCatalogItem
    ) as this;
  }

  @computed
  get legends(): StratumFromTraits<LegendTraits>[] | undefined {
    return createAutomaticCogLegends(this.catalogItem.effectiveCogStyle);
  }
}

export function createAutomaticCogLegends(
  style: CogEffectiveStyle | undefined
): StratumFromTraits<LegendTraits>[] | undefined {
  if (!style?.isSingleBand || !style.domain || style.stops.length === 0) {
    return undefined;
  }

  const [minimum, maximum] = style.domain;
  const title = i18next.t("models.cog.legendTitle");
  if (style.type === "continuous") {
    return [
      createStratumInstance(LegendTraits, {
        title,
        url: createGradientSvg(style, minimum, maximum),
        urlMimeType: "image/svg+xml"
      })
    ];
  }

  const binSize = (maximum - minimum) / style.numberOfBins;
  const items = Array.from({ length: style.numberOfBins }, (_, index) => {
    const binMinimum = minimum + index * binSize;
    const binMaximum =
      index === style.numberOfBins - 1
        ? maximum
        : minimum + (index + 1) * binSize;
    const samplePosition = (index + 0.5) / style.numberOfBins;
    return createStratumInstance(LegendItemTraits, {
      color: sampleCogColor(style.stops, samplePosition, "discrete"),
      title: `${formatValue(binMinimum)} – ${formatValue(binMaximum)}`,
      value: index === style.numberOfBins - 1 ? binMaximum : binMinimum
    });
  }).reverse();

  return [createStratumInstance(LegendTraits, { title, items })];
}

function createGradientSvg(
  style: CogEffectiveStyle,
  minimum: number,
  maximum: number
): string {
  const width = 300;
  const height = 42;
  const stops = style.stops
    .map(
      (stop) =>
        `<stop offset="${(stop.position * 100).toFixed(
          4
        )}%" stop-color="${escapeXml(stop.color)}"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="cog-gradient" x1="0%" y1="0%" x2="100%" y2="0%">${stops}</linearGradient></defs><text x="0" y="12" font-family="Arial,sans-serif" font-size="12" fill="#fff">${escapeXml(
    formatValue(minimum)
  )}</text><text x="${width}" y="12" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#fff">${escapeXml(
    formatValue(maximum)
  )}</text><rect x="0" y="18" width="${width}" height="20" fill="url(#cog-gradient)" stroke="#777" stroke-width="1"/></svg>`;
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(svg).toString("base64")
      : btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

function formatValue(value: number): string {
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < 0.01) return value.toExponential(2);
  if (absolute >= 10000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (absolute >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}
