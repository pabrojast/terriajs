import i18next from "i18next";
import { computed, makeObservable } from "mobx";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import LegendTraits, {
  LegendItemTraits
} from "../../../Traits/TraitsClasses/LegendTraits";
import CogCatalogItem from "./CogCatalogItem";
import { COG_COLOR_SCALES } from "./CogColorScales";
import { ColorScaleNames } from "../../../Traits/TraitsClasses/CogCatalogItemTraits";

/**
 * LoadableStratum for generating COG legends based on color scale and domain
 */
export class CogLegendStratum extends LoadableStratum(LegendTraits) {
  static stratumName = "cog-legend";

  constructor(readonly catalogItem: CogCatalogItem) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new CogLegendStratum(newModel as CogCatalogItem) as this;
  }

  @computed
  get title(): string | undefined {
    return i18next.t("models.cog.legendTitle");
  }

  @computed
  get items(): StratumFromTraits<LegendItemTraits>[] | undefined {
    const renderOptions = this.catalogItem.renderOptions?.single;
    if (!renderOptions) return undefined;

    const colorScale = renderOptions.colorScale ?? "viridis";
    const domain = renderOptions.domain;
    const type = renderOptions.type ?? "continuous";

    // Only show legend if we have a domain (either set by user or calculated)
    if (!domain || domain.length !== 2) return undefined;

    const [minValue, maxValue] = domain;

    // Get colors for the selected scale
    if (typeof colorScale !== "string") return undefined;
    const scaleColors = COG_COLOR_SCALES[colorScale as ColorScaleNames];
    if (!scaleColors) return undefined;

    const colors = scaleColors.colors;

    if (type === "discrete") {
      // For discrete legends, show a fixed number of bins
      const numBins = Math.min(colors.length, 8);
      const binSize = (maxValue - minValue) / numBins;

      return Array.from({ length: numBins }, (_, i) => {
        const binMin = minValue + i * binSize;
        const binMax = minValue + (i + 1) * binSize;
        const colorIndex = Math.floor((i / numBins) * colors.length);

        return createStratumInstance(LegendItemTraits, {
          color: colors[colorIndex],
          title: `${this._formatValue(binMin)} - ${this._formatValue(binMax)}`
        });
      }).reverse();
    } else {
      // For continuous legends, show a gradient with 7 samples
      const numSamples = 7;
      return Array.from({ length: numSamples }, (_, i) => {
        const value =
          maxValue - ((maxValue - minValue) * i) / (numSamples - 1);
        const colorIndex = Math.floor(
          ((numSamples - 1 - i) / (numSamples - 1)) * (colors.length - 1)
        );

        return createStratumInstance(LegendItemTraits, {
          color: colors[colorIndex],
          title: this._formatValue(value)
        });
      });
    }
  }

  private _formatValue(value: number): string {
    // Format numbers nicely
    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
      return value.toExponential(2);
    }
    return value.toFixed(2);
  }
}
