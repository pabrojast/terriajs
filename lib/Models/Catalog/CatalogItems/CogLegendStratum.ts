import { computed, makeObservable } from "mobx";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import LegendTraits, {
  LegendItemTraits
} from "../../../Traits/TraitsClasses/LegendTraits";
import CogCatalogItemTraits from "../../../Traits/TraitsClasses/CogCatalogItemTraits";
import CogCatalogItem from "./CogCatalogItem";
import { COG_COLOR_SCALES } from "./CogColorScales";

/**
 * LoadableStratum for generating COG legends based on color scale and domain
 */
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
    const renderOptions = this.catalogItem.renderOptions?.single;
    if (!renderOptions) return undefined;

    const colorScale = renderOptions.colorScale ?? "rainbow";
    const domain = renderOptions.domain;
    const type = renderOptions.type ?? "continuous";
    const numberOfBins = renderOptions.numberOfBins;
    const reverseColorScale = renderOptions.reverseColorScale ?? false;

    // Only show legend if we have a domain (either set by user or calculated)
    if (!domain || domain.length !== 2) return undefined;

    const [minValue, maxValue] = domain;

    // Get colors for the selected scale
    const scaleColors = COG_COLOR_SCALES[colorScale as keyof typeof COG_COLOR_SCALES];
    if (!scaleColors) return undefined;

    let colors = scaleColors.colors;
    
    // Reverse colors if requested
    if (reverseColorScale) {
      colors = [...colors].reverse();
    }

    const items = this._getLegendItems(colors, minValue, maxValue, type, numberOfBins);
    if (!items) return undefined;

    return [
      createStratumInstance(LegendTraits, {
        title: "Color Scale",
        items
      })
    ];
  }

  private _getLegendItems(
    colors: string[],
    minValue: number,
    maxValue: number,
    type: "continuous" | "discrete",
    numberOfBins?: number
  ): StratumFromTraits<LegendItemTraits>[] | undefined {
    if (type === "discrete") {
      // For discrete legends, show a fixed number of bins
      // Use user-specified numberOfBins or default to 8
      const defaultBins = 8;
      const userBins = numberOfBins && numberOfBins > 0 ? numberOfBins : defaultBins;
      const numBins = Math.min(colors.length, userBins);
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
      // For continuous legends, show a gradient with samples
      // Use user-specified numberOfBins or default to 7
      const defaultSamples = 7;
      const numSamples = numberOfBins && numberOfBins > 0 ? numberOfBins : defaultSamples;
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
