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

    // Don't auto-generate legend if no colorScale is explicitly set
    // This prevents showing a rainbow legend when the COG is rendering in grayscale
    if (!renderOptions || !renderOptions.colorScale) return undefined;

    const colorScale = renderOptions.colorScale;
    const type = renderOptions.type ?? "continuous";
    const numberOfBins = renderOptions.numberOfBins;
    const reverseColorScale = renderOptions.reverseColorScale ?? false;

    // Try to get domain from multiple sources in priority order:
    // 1. User-defined domain
    // 2. Provider statistics (from COG metadata)
    // 3. displayRange as fallback
    let effectiveDomain: [number, number] | undefined;

    if (renderOptions.domain && renderOptions.domain.length === 2) {
      effectiveDomain = [renderOptions.domain[0], renderOptions.domain[1]];
    } else {
      // Try to get domain from provider statistics
      effectiveDomain = this.getProviderDomain();
    }

    if (
      !effectiveDomain &&
      renderOptions.displayRange &&
      renderOptions.displayRange.length === 2
    ) {
      // Try displayRange as last resort
      effectiveDomain = [
        renderOptions.displayRange[0],
        renderOptions.displayRange[1]
      ];
    }

    // Only show legend if we have a valid domain
    if (!effectiveDomain) return undefined;

    const [minValue, maxValue] = effectiveDomain;

    // Get colors for the selected scale
    const scaleColors =
      COG_COLOR_SCALES[colorScale as keyof typeof COG_COLOR_SCALES];
    if (!scaleColors) return undefined;

    let colors = scaleColors.colors;

    // Reverse colors if requested
    if (reverseColorScale) {
      colors = [...colors].reverse();
    }

    const items = this._getLegendItems(
      colors,
      minValue,
      maxValue,
      type,
      numberOfBins
    );
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
      const userBins =
        numberOfBins && numberOfBins > 0 ? numberOfBins : defaultBins;
      const numBins = Math.max(1, userBins);
      const binSize = (maxValue - minValue) / numBins;

      return Array.from({ length: numBins }, (_, i) => {
        const binMin = minValue + i * binSize;
        const binMax = minValue + (i + 1) * binSize;
        const colorIndex = Math.min(
          colors.length - 1,
          Math.round(
            (numBins === 1 ? 0 : i / (numBins - 1)) * (colors.length - 1)
          )
        );

        const value = i === numBins - 1 ? binMax : binMin;
        return createStratumInstance(LegendItemTraits, {
          color: colors[colorIndex],
          title: `${this._formatValue(binMin)} - ${this._formatValue(binMax)}`,
          value
        });
      }).reverse();
    } else {
      // For continuous legends, show a gradient with samples
      // Use user-specified numberOfBins or default to 7
      const defaultSamples = 7;
      const numSamples =
        numberOfBins && numberOfBins > 0 ? numberOfBins : defaultSamples;
      return Array.from({ length: numSamples }, (_, i) => {
        const value = maxValue - ((maxValue - minValue) * i) / (numSamples - 1);
        const colorIndex = Math.floor(
          ((numSamples - 1 - i) / (numSamples - 1)) * (colors.length - 1)
        );

        return createStratumInstance(LegendItemTraits, {
          color: colors[colorIndex],
          title: this._formatValue(value),
          value
        });
      });
    }
  }

  private _formatValue(value: number): string {
    // Format numbers nicely for user display
    const absValue = Math.abs(value);

    // For very small numbers (but not zero)
    if (absValue > 0 && absValue < 0.01) {
      return value.toExponential(2);
    }

    // For large numbers, use thousands separator
    if (absValue >= 10000) {
      return value.toLocaleString("en-US", {
        maximumFractionDigits: 0
      });
    }

    // For numbers between 1000 and 10000, show with thousands separator and decimals if needed
    if (absValue >= 1000) {
      return value.toLocaleString("en-US", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0
      });
    }

    // For regular numbers, show up to 2 decimal places
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
  }

  /**
   * Extracts the domain (min/max) from the imagery provider statistics
   * This searches through various possible locations where the provider might store statistics
   */
  private getProviderDomain(): [number, number] | undefined {
    const mapItems = (this.catalogItem.mapItems ?? []) as any[];
    if (!Array.isArray(mapItems) || mapItems.length === 0) return undefined;
    const provider = mapItems[0]?.imageryProvider as any;
    if (!provider) return undefined;

    // First, try to extract from provider.bands (most reliable for COGs)
    if (provider.bands && typeof provider.bands === "object") {
      const bandKeys = Object.keys(provider.bands);
      if (bandKeys.length > 0) {
        // Get the first band (or the band specified in renderOptions)
        const targetBand = provider.renderOptions?.single?.band || 1;
        const bandStats =
          provider.bands[targetBand] || provider.bands[bandKeys[0]];

        if (bandStats && typeof bandStats === "object") {
          const range = this._extractRange(bandStats);
          if (range) {
            // Filter out noData values from the range
            let [min, max] = range;
            const noData = provider.noData;

            // If min equals noData, it's likely not a real data value
            // In this case, we should use a reasonable minimum or let the user set it
            // For now, we'll return the range as-is, but mark it for potential adjustment
            if (typeof noData === "number" && min === noData) {
              // The minimum is the noData value, which means the actual minimum is higher
              // Use 0 as min if noData is negative and max is positive
              if (noData < 0 && max > 0) {
                return [0, max];
              }
            }

            return range;
          }
        }
      }
    }

    // Direct property candidates
    const directCandidates = [
      provider.renderOptions?.single?.domain,
      provider.renderOptions?.single?.displayRange,
      provider.domain,
      provider.displayRange,
      provider.dataRange,
      provider.range,
      provider._domain,
      provider._displayRange
    ];

    for (const candidate of directCandidates) {
      const range = this._extractRange(candidate);
      if (range) return range;
    }

    // Statistics candidates (from COG metadata)
    const statsCandidates = [
      provider.statistics,
      provider._statistics,
      provider.statistics?.global,
      provider.statistics?.overall,
      provider.statistics?.band,
      provider.statistics?.band0,
      provider.statistics?.band1,
      Array.isArray(provider.statisticsBySample)
        ? provider.statisticsBySample[0]
        : undefined,
      Array.isArray(provider.statisticsByBand)
        ? provider.statisticsByBand[0]
        : undefined
    ];

    for (const candidate of statsCandidates) {
      const range = this._extractRange(candidate);
      if (range) return range;
    }

    return undefined;
  }

  /**
   * Helper to extract a numeric range from various data structures
   */
  private _extractRange(candidate: any): [number, number] | undefined {
    if (candidate === undefined || candidate === null) return undefined;

    const normalizePair = (min: number, max: number) => {
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return undefined;
      }
      return min <= max
        ? ([min, max] as [number, number])
        : ([max, min] as [number, number]);
    };

    // Array format: [min, max]
    if (Array.isArray(candidate)) {
      if (candidate.length >= 2) {
        const pair = normalizePair(Number(candidate[0]), Number(candidate[1]));
        if (pair) return pair;
      }
      if (candidate.length >= 1) {
        const nested = this._extractRange(candidate[0]);
        if (nested) return nested;
      }
    }

    // Object format: { min, max } or variations
    if (typeof candidate === "object") {
      const minKeys = [
        "min",
        "minimum",
        "minValue",
        "minimumValue",
        "low",
        "lower",
        "lo"
      ];
      const maxKeys = [
        "max",
        "maximum",
        "maxValue",
        "maximumValue",
        "high",
        "upper",
        "hi"
      ];
      let min: number | undefined;
      let max: number | undefined;
      for (const key of minKeys) {
        if (candidate[key] !== undefined) {
          const value = Number(candidate[key]);
          if (Number.isFinite(value)) {
            min = value;
            break;
          }
        }
      }
      for (const key of maxKeys) {
        if (candidate[key] !== undefined) {
          const value = Number(candidate[key]);
          if (Number.isFinite(value)) {
            max = value;
            break;
          }
        }
      }
      if (min !== undefined && max !== undefined) {
        const pair = normalizePair(min, max);
        if (pair) return pair;
      }

      if (Array.isArray(candidate.values) && candidate.values.length >= 2) {
        const nested = this._extractRange(candidate.values);
        if (nested) return nested;
      }
    }

    return undefined;
  }
}
