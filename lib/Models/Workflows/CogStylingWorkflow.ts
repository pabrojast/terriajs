import i18next from "i18next";
import { action, computed, makeObservable, runInAction } from "mobx";
import filterOutUndefined from "../../Core/filterOutUndefined";
import isDefined from "../../Core/isDefined";
import CogCatalogItem from "../Catalog/CatalogItems/CogCatalogItem";
import Icon from "../../Styled/Icon";
import CommonStrata from "../Definition/CommonStrata";
import {
  SelectableDimensionButton,
  SelectableDimensionCheckbox,
  SelectableDimensionColor,
  SelectableDimensionEnum,
  SelectableDimensionNumeric,
  SelectableDimensionText
} from "../SelectableDimensions/SelectableDimensions";
import SelectableDimensionWorkflow, {
  SelectableDimensionWorkflowGroup
} from "./SelectableDimensionWorkflow";
import { ColorScaleNames } from "../../Traits/TraitsClasses/CogCatalogItemTraits";
import LegendTraits, {
  LegendItemTraits
} from "../../Traits/TraitsClasses/LegendTraits";
import createStratumInstance from "../Definition/createStratumInstance";
import StratumFromTraits from "../Definition/StratumFromTraits";
import Model from "../Definition/Model";
import { COG_COLOR_SCALES } from "../Catalog/CatalogItems/CogColorScales";

/** Available color scales for COG rendering */
const COLOR_SCALES: ColorScaleNames[] = [
  "rainbow",
  "jet",
  "hsv",
  "hot",
  "cool",
  "spring",
  "summer",
  "autumn",
  "winter",
  "bone",
  "copper",
  "greys",
  "ylgnbu",
  "greens",
  "ylorrd",
  "bluered",
  "rdbu",
  "picnic",
  "portland",
  "blackbody",
  "earth",
  "electric"
];

const DEFAULT_LEGEND_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc949",
  "#af7aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac"
];

/** SelectableDimensionWorkflow for styling COG (Cloud Optimized GeoTIFF) catalog items */
export default class CogStylingWorkflow implements SelectableDimensionWorkflow {
  static type = "cog-styling";

  /** Cached numeric domain derived from previous legend synchronisations */
  private cachedLegendDomain?: [number, number];

  constructor(readonly item: CogCatalogItem) {
    makeObservable(this);
  }

  get name() {
    return "Edit Style";
  }

  get icon() {
    return Icon.GLYPHS.layers;
  }

  get footer() {
    return {
      buttonText: "Reset to Defaults",
      onClick: action(() => {
        // Delete user stratum for renderOptions to reset to defaults
        this.cachedLegendDomain = undefined;
        this.item.renderOptions?.strata.delete(CommonStrata.user);
        this.item.renderOptions?.single?.strata.delete(CommonStrata.user);
      })
    };
  }

  get menu() {
    return undefined;
  }

  @computed
  get selectableDimensions(): SelectableDimensionWorkflowGroup[] {
    return filterOutUndefined([
      this.colorSchemeGroup,
      this.domainGroup,
      this.additionalColorsGroup,
      this.customColorsGroup,
      this.legendGroup,
      this.displayRangeGroup,
      this.advancedGroup
    ]);
  }

  /** Color Scheme Selection Group */
  @computed
  private get colorSchemeGroup(): SelectableDimensionWorkflowGroup | undefined {
    const colorScaleDim = this.colorScaleSelectableDim;
    const typeDim = this.renderTypeSelectableDim;
    const numberOfBinsDim = this.numberOfBinsSelectableDim;
    const reverseColorScaleDim = this.reverseColorScaleSelectableDim;

    if (!colorScaleDim && !typeDim && !numberOfBinsDim && !reverseColorScaleDim)
      return undefined;

    return {
      type: "group",
      id: "color-scheme",
      name: "Color Scheme",
      selectableDimensions: filterOutUndefined([
        colorScaleDim,
        reverseColorScaleDim,
        typeDim,
        numberOfBinsDim
      ]),
      isOpen: true
    };
  }

  /** Domain (min/max values) Group */
  @computed
  private get domainGroup(): SelectableDimensionWorkflowGroup | undefined {
    const minDim = this.domainMinSelectableDim;
    const maxDim = this.domainMaxSelectableDim;
    const autoDetectButton = this.autoDetectDomainButton;

    if (!minDim && !maxDim) return undefined;

    return {
      type: "group",
      id: "domain",
      name: "Value Range",
      selectableDimensions: filterOutUndefined([
        minDim,
        maxDim,
        autoDetectButton
      ]),
      isOpen: true
    };
  }

  /** Display Range Group */
  @computed
  private get displayRangeGroup():
    | SelectableDimensionWorkflowGroup
    | undefined {
    const applyDim = this.applyDisplayRangeSelectableDim;
    const minDim = this.displayRangeMinSelectableDim;
    const maxDim = this.displayRangeMaxSelectableDim;

    // Always show this group - it's an important feature
    return {
      type: "group",
      id: "display-range",
      name: i18next.t("models.cogStyling.displayRange"),
      selectableDimensions: filterOutUndefined([applyDim, minDim, maxDim]),
      isOpen: true
    };
  }

  /** Advanced Options Group */
  @computed
  private get advancedGroup(): SelectableDimensionWorkflowGroup | undefined {
    const bandDim = this.bandSelectableDim;
    const clampLowDim = this.clampLowSelectableDim;
    const clampHighDim = this.clampHighSelectableDim;

    if (!bandDim && !clampLowDim && !clampHighDim) return undefined;

    return {
      type: "group",
      id: "advanced",
      name: "Advanced",
      selectableDimensions: filterOutUndefined([
        bandDim,
        clampLowDim,
        clampHighDim
      ]),
      isOpen: false
    };
  }

  /** Color Scale selector */
  @computed
  private get colorScaleSelectableDim(): SelectableDimensionEnum | undefined {
    const colorScale = this.item.renderOptions?.single?.colorScale;

    return {
      type: "select",
      id: "color-scale",
      name: "Color Scale",
      selectedId: colorScale,
      allowUndefined: true,
      undefinedLabel: "None (use default)",
      options: COLOR_SCALES.map((scale) => ({
        id: scale,
        name: scale.charAt(0).toUpperCase() + scale.slice(1)
      })),
      setDimensionValue: action(
        (stratumId: string, value: string | undefined) => {
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "colorScale",
            value as ColorScaleNames | undefined
          );

          if (value !== undefined && this.item.renderOptions.single?.colors) {
            // Remove dataset-provided custom colors so the selected scale can apply
            this.item.renderOptions.single!.setTrait(
              stratumId,
              "colors",
              undefined
            );
          }
        }
      )
    };
  }

  /** Render Type selector (continuous/discrete) */
  @computed
  private get renderTypeSelectableDim(): SelectableDimensionEnum | undefined {
    const type = this.item.renderOptions?.single?.type ?? "continuous";

    return {
      type: "select",
      id: "render-type",
      name: "Render Type",
      selectedId: type,
      allowUndefined: false,
      options: [
        { id: "continuous", name: "Continuous" },
        { id: "discrete", name: "Discrete" }
      ],
      setDimensionValue: action((stratumId: string, value: string) => {
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(
          stratumId,
          "type",
          value as "continuous" | "discrete"
        );
      })
    };
  }

  /** Number of bins for legend */
  @computed
  private get numberOfBinsSelectableDim():
    | SelectableDimensionNumeric
    | undefined {
    const numberOfBins = this.item.renderOptions?.single?.numberOfBins;
    const type = this.item.renderOptions?.single?.type ?? "continuous";
    const defaultValue = type === "discrete" ? 8 : 7;

    return {
      type: "numeric",
      id: "number-of-bins",
      name: "Legend Steps",
      value: numberOfBins ?? defaultValue,
      min: 2,
      max: 30,
      allowUndefined: true,
      setDimensionValue: action(
        (stratumId: string, value: number | undefined) => {
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "numberOfBins",
            value !== undefined
              ? Math.max(2, Math.min(30, Math.floor(value)))
              : undefined
          );
        }
      )
    };
  }

  /** Reverse color scale checkbox */
  @computed
  private get reverseColorScaleSelectableDim():
    | SelectableDimensionCheckbox
    | undefined {
    const reverseColorScale =
      this.item.renderOptions?.single?.reverseColorScale ?? false;

    return {
      type: "checkbox",
      id: "reverse-color-scale",
      name: "Reverse Colors",
      selectedId: reverseColorScale ? "true" : "false",
      options: [{ id: "true" }],
      setDimensionValue: action(
        (stratumId: string, value: "true" | "false" | undefined) => {
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "reverseColorScale",
            value === "true"
          );
        }
      )
    };
  }

  /** Additional Colors Group */
  @computed
  private get additionalColorsGroup():
    | SelectableDimensionWorkflowGroup
    | undefined {
    const noDataColorDim = this.noDataColorSelectableDim;

    if (!noDataColorDim) return undefined;

    return {
      type: "group",
      id: "additional-colors",
      name: "Additional Colors",
      selectableDimensions: filterOutUndefined([noDataColorDim]),
      isOpen: false
    };
  }

  /** Custom Colors Group */
  @computed
  private get customColorsGroup():
    | SelectableDimensionWorkflowGroup
    | undefined {
    const stops = this.customColorStops;

    const stopDimensions = stops.flatMap((stop, index) =>
      filterOutUndefined([
        {
          type: "color",
          id: `custom-color-${index}`,
          name: i18next.t("models.cogStyling.customColors.stopColor", {
            index: index + 1
          }),
          value: stop.color,
          allowUndefined: false,
          setDimensionValue: action(
            (stratumId: string, value: string | undefined) => {
              if (!isDefined(value)) return;
              this.updateColorStop(stratumId, index, { color: value });
            }
          )
        } as SelectableDimensionColor,
        {
          type: "numeric",
          id: `custom-position-${index}`,
          name: i18next.t("models.cogStyling.customColors.stopPosition", {
            index: index + 1
          }),
          value: stop.position,
          min: 0,
          max: 1,
          allowUndefined: false,
          setDimensionValue: action(
            (stratumId: string, value: number | undefined) => {
              if (!isDefined(value)) return;
              this.updateColorStop(stratumId, index, {
                position: clamp01(value)
              });
            }
          )
        } as SelectableDimensionNumeric,
        stops.length > 1
          ? ({
              type: "button",
              id: `custom-remove-${index}`,
              value: i18next.t("models.cogStyling.customColors.remove"),
              setDimensionValue: action((stratumId: string) =>
                this.removeColorStop(stratumId, index)
              )
            } as SelectableDimensionButton)
          : undefined
      ])
    );

    const controls = [
      ...stopDimensions,
      {
        type: "button",
        id: "custom-add",
        value: i18next.t("models.cogStyling.customColors.addStop"),
        setDimensionValue: action((stratumId: string) =>
          this.addColorStop(stratumId)
        )
      } as SelectableDimensionButton
    ];

    if (stops.length > 0) {
      controls.push({
        type: "button",
        id: "custom-clear",
        value: i18next.t("models.cogStyling.customColors.clear"),
        setDimensionValue: action((stratumId: string) =>
          this.clearColorStops(stratumId)
        )
      });
    }

    return {
      type: "group",
      id: "custom-colors",
      name: i18next.t("models.cogStyling.customColors.name"),
      selectableDimensions: controls,
      isOpen: stops.length > 0
    };
  }

  /** Legend editing group */
  @computed
  private get legendGroup(): SelectableDimensionWorkflowGroup | undefined {
    const legend = this.primaryLegend;

    if (!legend) {
      return {
        type: "group",
        id: "legend",
        name: i18next.t("models.cogStyling.legend.name"),
        selectableDimensions: [
          {
            type: "button",
            id: "legend-generate",
            value: i18next.t("models.cogStyling.legend.generate"),
            setDimensionValue: action((stratumId: string) =>
              this.ensureLegendUserStratum(stratumId)
            )
          } as SelectableDimensionButton
        ],
        isOpen: false
      };
    }

    const baselineItems = legend.items?.map((item) => ({
      title: item.title,
      value: item.value ?? this.extractNumericValue(item.title)
    }));

    const dimensions = filterOutUndefined([
      {
        type: "text",
        id: "legend-title",
        name: i18next.t("models.cogStyling.legend.title"),
        value: legend.title,
        disable: !this.hasManualLegend,
        setDimensionValue: action(
          (stratumId: string, value: string | undefined) =>
            this.updateLegendTitle(stratumId, value)
        )
      } as SelectableDimensionText,
      {
        type: "checkbox",
        id: "legend-auto",
        name: i18next.t("models.cogStyling.legend.auto"),
        selectedId: this.hasManualLegend ? "false" : "true",
        options: [{ id: "true" }],
        setDimensionValue: action(
          (stratumId: string, value: "true" | "false" | undefined) => {
            if (value === "true") {
              this.item.setTrait(stratumId, "legends", undefined);
            } else {
              this.ensureLegendUserStratum(stratumId);
            }
          }
        )
      } as SelectableDimensionCheckbox,
      !this.hasManualLegend
        ? ({
            type: "text",
            id: "legend-auto-info",
            value: i18next.t("models.cogStyling.legend.autoInfo", {
              scale: this.item.renderOptions?.single?.colorScale ?? "rainbow",
              steps: this.getLegendBinCount()
            })
          } as SelectableDimensionText)
        : undefined,
      !this.hasManualLegend
        ? ({
            type: "button",
            id: "legend-disable-auto",
            value: i18next.t("models.cogStyling.legend.disableAuto"),
            setDimensionValue: action((stratumId: string) =>
              this.ensureLegendUserStratum(stratumId)
            )
          } as SelectableDimensionButton)
        : undefined,
      this.hasManualLegend
        ? ({
            type: "button",
            id: "legend-sync",
            value: i18next.t("models.cogStyling.legend.sync"),
            setDimensionValue: action((stratumId: string) =>
              this.generateLegendFromColorScale(stratumId, baselineItems)
            )
          } as SelectableDimensionButton)
        : undefined,
      ...(this.hasManualLegend
        ? (legend.items?.flatMap((item, index) =>
            filterOutUndefined([
              {
                type: "color",
                id: `legend-color-${index}`,
                name: i18next.t("models.cogStyling.legend.itemColor", {
                  index: index + 1
                }),
                value: item.color,
                allowUndefined: false,
                setDimensionValue: action(
                  (stratumId: string, value: string | undefined) => {
                    if (!isDefined(value)) return;
                    this.updateLegendItemColor(stratumId, index, value);
                  }
                )
              } as SelectableDimensionColor,
              {
                type: "numeric",
                id: `legend-value-${index}`,
                name: i18next.t("models.cogStyling.legend.itemValue", {
                  index: index + 1
                }),
                value: item.value,
                allowUndefined: true,
                setDimensionValue: action(
                  (stratumId: string, value: number | undefined) =>
                    this.updateLegendItemValue(stratumId, index, value)
                )
              } as SelectableDimensionNumeric,
              {
                type: "text",
                id: `legend-item-${index}`,
                name: i18next.t("models.cogStyling.legend.itemTitle", {
                  index: index + 1
                }),
                value: item.title ?? "",
                setDimensionValue: action(
                  (stratumId: string, value: string | undefined) => {
                    this.updateLegendItemTitle(stratumId, index, value);
                  }
                )
              } as SelectableDimensionText,
              legend.items.length > 1
                ? ({
                    type: "button",
                    id: `legend-remove-${index}`,
                    value: i18next.t("models.cogStyling.legend.removeItem"),
                    setDimensionValue: action((stratumId: string) =>
                      this.removeLegendItem(stratumId, index)
                    )
                  } as SelectableDimensionButton)
                : undefined
            ])
          ) ?? [])
        : []),
      this.hasManualLegend
        ? ({
            type: "button",
            id: "legend-add",
            value: i18next.t("models.cogStyling.legend.addItem"),
            setDimensionValue: action((stratumId: string) =>
              this.addLegendItem(stratumId)
            )
          } as SelectableDimensionButton)
        : undefined,
      this.hasManualLegend
        ? ({
            type: "button",
            id: "legend-reset",
            value: i18next.t("models.cogStyling.legend.reset"),
            setDimensionValue: action((stratumId: string) =>
              this.clearLegendOverrides(stratumId)
            )
          } as SelectableDimensionButton)
        : undefined
    ]);

    return {
      type: "group",
      id: "legend",
      name: i18next.t("models.cogStyling.legend.name"),
      selectableDimensions: dimensions,
      isOpen: false
    };
  }
  /** No data color selector */
  @computed
  private get noDataColorSelectableDim(): SelectableDimensionColor | undefined {
    const noDataColor = this.item.renderOptions?.single?.noDataColor;

    return {
      type: "color",
      id: "no-data-color",
      name: "No Data Color",
      value: noDataColor,
      allowUndefined: true,
      setDimensionValue: action(
        (stratumId: string, value: string | undefined) => {
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "noDataColor",
            value
          );
        }
      )
    };
  }

  private get customColorStops(): CustomColorStop[] {
    const colors = this.item.renderOptions?.single?.colors;
    if (!colors || colors.length === 0) return [];

    if (typeof colors[0] === "string") {
      const stringColors = colors as unknown as readonly string[];
      if (stringColors.length === 1) {
        return [{ position: 0, color: stringColors[0] }];
      }
      return stringColors.map((color, index) => ({
        position:
          stringColors.length === 1 ? 0 : index / (stringColors.length - 1),
        color
      }));
    }

    return (colors as unknown as readonly [number, string][])
      .map(([position, color]) => ({
        position: clamp01(position ?? 0),
        color
      }))
      .sort((a, b) => a.position - b.position);
  }

  private updateColorStop(
    stratumId: string,
    index: number,
    partial: Partial<CustomColorStop>
  ) {
    const stops = this.customColorStops;
    if (!stops[index]) return;
    const updated = [...stops];
    updated[index] = {
      position:
        partial.position !== undefined
          ? clamp01(partial.position)
          : updated[index].position,
      color: partial.color ?? updated[index].color
    };
    this.writeColorStops(stratumId, updated);
  }

  private addColorStop(stratumId: string) {
    const stops = this.customColorStops;
    let position = 0.5;
    if (stops.length === 0) {
      position = 0.5;
    } else if (stops.length === 1) {
      const single = stops[0].position;
      position = single >= 0.5 ? single / 2 : (single + 1) / 2;
    } else {
      let largestGapIndex = 0;
      let largestGap = -1;
      const sortedStops = stops.slice().sort((a, b) => a.position - b.position);
      for (let i = 0; i < sortedStops.length - 1; i++) {
        const gap = sortedStops[i + 1].position - sortedStops[i].position;
        if (gap > largestGap) {
          largestGap = gap;
          largestGapIndex = i;
        }
      }
      position =
        sortedStops[largestGapIndex].position +
        (Number.isFinite(largestGap) ? largestGap / 2 : 0);
    }
    const defaultColor =
      stops.slice().sort((a, b) => a.position - b.position)[stops.length - 1]
        ?.color ?? "#ff0000";
    this.writeColorStops(stratumId, [
      ...stops,
      { position: clamp01(position), color: defaultColor }
    ]);
  }
  private removeColorStop(stratumId: string, index: number) {
    const stops = this.customColorStops;
    if (!stops[index]) return;
    const updated = stops.slice();
    updated.splice(index, 1);
    this.writeColorStops(stratumId, updated);
  }

  private clearColorStops(stratumId: string) {
    this.ensureSingleRenderOptions(stratumId);
    this.item.renderOptions.single!.setTrait(stratumId, "colors", undefined);
    this.cachedLegendDomain = undefined;
    this.item.setTrait(stratumId, "legends", undefined);
  }

  private writeColorStops(stratumId: string, stops: CustomColorStop[]) {
    this.ensureSingleRenderOptions(stratumId);
    if (stops.length === 0) {
      this.item.renderOptions.single!.setTrait(stratumId, "colors", undefined);
      if (!this.hasManualLegend) {
        this.item.setTrait(stratumId, "legends", undefined);
      }
      return;
    }

    const sanitized = stops
      .filter((stop) => stop.color)
      .map(
        (stop) => [clamp01(stop.position ?? 0), stop.color] as [number, string]
      )
      .sort((a, b) => a[0] - b[0]);

    this.item.renderOptions.single!.setTrait(
      stratumId,
      "colors",
      sanitized as any
    );
    if (!this.hasManualLegend) {
      this.syncLegendWithColorStops(stratumId, sanitized);
    }
  }

  private get hasManualLegend(): boolean {
    return (
      this.item.legends?.some((legend) =>
        legend.strata.has(CommonStrata.user)
      ) ?? false
    );
  }

  private ensureSingleRenderOptions(stratumId: string) {
    if (!this.item.renderOptions.single) {
      this.item.renderOptions.setTrait(stratumId, "single", undefined);
    }
  }

  private get primaryLegend(): Model<LegendTraits> | undefined {
    const legends = this.item.legends;
    if (!legends || legends.length === 0) return undefined;
    const userLegend = legends.find((legend) =>
      legend.strata.has(CommonStrata.user)
    );
    return userLegend ?? legends[0];
  }

  private updateLegendTitle(stratumId: string, title: string | undefined) {
    this.applyLegendMutation(stratumId, (legend) => {
      legend.title = title;
    });
  }

  private updateLegendItemTitle(
    stratumId: string,
    index: number,
    title: string | undefined
  ) {
    this.applyLegendMutation(stratumId, (legend) => {
      if (!legend.items || !legend.items[index]) return;
      legend.items[index].title = title;
    });
  }

  private updateLegendItemValue(
    stratumId: string,
    index: number,
    value: number | undefined
  ) {
    this.applyLegendMutation(stratumId, (legend) => {
      if (!legend.items || !legend.items[index]) return;
      legend.items[index].value = value;
      if (value !== undefined && !legend.items[index].title) {
        legend.items[index].title = this.formatLegendValue(value);
      }
    });
  }

  private updateLegendItemColor(
    stratumId: string,
    index: number,
    color: string
  ) {
    this.applyLegendMutation(stratumId, (legend) => {
      if (!legend.items || !legend.items[index]) return;
      const items = legend.items.map((item, i) =>
        i === index ? { ...item, color } : item
      );
      legend.items = items;
    });
  }

  private addLegendItem(stratumId: string) {
    this.ensureLegendUserStratum(stratumId);
    const baselineItems =
      this.primaryLegend?.items?.map((item) => ({
        title: item.title,
        value: item.value ?? this.extractNumericValue(item.title)
      })) ?? [];
    const stops = this.getColorStopsForLegend(this.getLegendBinCount());
    const targetIndex = this.primaryLegend?.items?.length ?? 0;
    const stop = stops[
      Math.min(targetIndex, Math.max(0, stops.length - 1))
    ] ?? [0, DEFAULT_LEGEND_COLORS[0]];
    const domain =
      this.getActiveDomain() ??
      this.deriveDomainFromBaseline(baselineItems) ??
      this.cachedLegendDomain;
    const stopMin = stops[0]?.[0] ?? 0;
    const stopMax = stops[stops.length - 1]?.[0] ?? stopMin;
    const entry = this.createLegendEntry(
      stop[0],
      stop[1],
      domain,
      stopMin,
      stopMax,
      targetIndex,
      baselineItems
    );
    this.applyLegendMutation(stratumId, (legend) => {
      const items = legend.items ? [...legend.items] : [];
      items.push(
        createStratumInstance(LegendItemTraits, {
          color: entry.color,
          title: entry.title,
          value: entry.value
        })
      );
      legend.items = items;
    });
  }

  private removeLegendItem(stratumId: string, index: number) {
    this.applyLegendMutation(stratumId, (legend) => {
      if (!legend.items || !legend.items[index]) return;
      const items = legend.items.slice();
      items.splice(index, 1);
      legend.items = items;
    });
  }

  private clearLegendOverrides(stratumId: string) {
    this.cachedLegendDomain = undefined;
    this.item.setTrait(stratumId, "legends", undefined);
  }

  private ensureLegendUserStratum(stratumId: string) {
    const legend = this.primaryLegend;
    if (!legend) {
      const generated = this.buildLegendFromStops(
        this.getColorStopsForLegend(this.getLegendBinCount()),
        this.getActiveDomain()
      );
      if (generated) {
        this.item.setTrait(stratumId, "legends", [generated]);
      }
      return;
    }

    if (!legend.strata.has(CommonStrata.user)) {
      const clone = createStratumInstance(LegendTraits, {
        title: legend.title,
        items:
          legend.items?.map((item) =>
            createStratumInstance(LegendItemTraits, {
              title: item.title,
              color: item.color,
              value: item.value
            })
          ) ?? []
      });
      this.item.setTrait(stratumId, "legends", [clone]);
    }
  }

  private generateLegendFromColorScale(
    stratumId: string,
    baselineItems?: LegendItemSnapshot[]
  ) {
    this.ensureLegendUserStratum(stratumId);
    const baseline =
      baselineItems ??
      this.primaryLegend?.items?.map((item) => ({
        title: item.title,
        value: item.value ?? this.extractNumericValue(item.title)
      }));
    const legend = this.buildLegendFromStops(
      this.getColorStopsForLegend(this.getLegendBinCount()),
      this.getActiveDomain() ?? this.deriveDomainFromBaseline(baseline),
      baseline
    );
    if (legend) {
      this.item.setTrait(stratumId, "legends", [legend]);
    }
  }

  private applyLegendMutation(
    stratumId: string,
    mutator: (legend: StratumFromTraits<LegendTraits>) => void
  ) {
    this.ensureLegendUserStratum(stratumId);
    const legend = this.buildLegendDefinition();
    if (!legend) return;
    mutator(legend);
    this.item.setTrait(stratumId, "legends", [legend]);
  }

  private buildLegendDefinition(): StratumFromTraits<LegendTraits> | undefined {
    const legend = this.primaryLegend;
    if (!legend) return undefined;

    return createStratumInstance(LegendTraits, {
      title: legend.title,
      items: legend.items?.map((item) =>
        createStratumInstance(LegendItemTraits, {
          title: item.title,
          value: item.value,
          multipleTitles: item.multipleTitles
            ? [...item.multipleTitles]
            : undefined,
          maxMultipleTitlesShowed: item.maxMultipleTitlesShowed,
          titleAbove: item.titleAbove,
          titleBelow: item.titleBelow,
          color: item.color,
          outlineColor: item.outlineColor,
          outlineWidth: item.outlineWidth,
          outlineStyle: item.outlineStyle,
          multipleColors: item.multipleColors
            ? [...item.multipleColors]
            : undefined,
          imageUrl: item.imageUrl,
          marker: item.marker,
          rotation: item.rotation,
          addSpacingAbove: item.addSpacingAbove,
          imageHeight: item.imageHeight,
          imageWidth: item.imageWidth
        })
      )
    });
  }

  private syncLegendWithColorStops(
    stratumId: string,
    stops: [number, string][]
  ) {
    if (stops.length === 0) {
      this.item.setTrait(stratumId, "legends", undefined);
      return;
    }
    const baseline = this.primaryLegend?.items?.map((item) => ({
      title: item.title,
      value: item.value ?? this.extractNumericValue(item.title)
    }));
    const providerDomain = this.getProviderDomain();
    const baselineDomain =
      this.deriveDomainFromBaseline(baseline) ?? providerDomain;
    if (baselineDomain) {
      this.cachedLegendDomain = baselineDomain;
    }
    const expandedStops = this.expandStopsForLegend(
      stops,
      this.getLegendBinCount()
    );
    const legend = this.buildLegendFromStops(
      expandedStops,
      this.getActiveDomain() ??
        baselineDomain ??
        this.cachedLegendDomain ??
        providerDomain,
      baseline
    );
    if (legend) {
      this.item.setTrait(stratumId, "legends", [legend]);
    }
  }

  private buildLegendFromStops(
    stops: [number, string][],
    domainOverride?: [number, number],
    baselineItems?: LegendItemSnapshot[]
  ): StratumFromTraits<LegendTraits> | undefined {
    if (stops.length === 0) return undefined;
    const sortedStops = stops
      .map(([position, color]) => [position, color] as [number, string])
      .sort((a, b) => a[0] - b[0]);

    const providerDomain = this.getProviderDomain();
    const derivedDomain =
      this.deriveDomainFromBaseline(baselineItems) ?? providerDomain;
    const domain =
      domainOverride ??
      this.getActiveDomain() ??
      derivedDomain ??
      this.cachedLegendDomain;
    if (domain) {
      this.cachedLegendDomain = domain;
    }

    const stopMin = sortedStops[0][0];
    const stopMax = sortedStops[sortedStops.length - 1][0];

    return createStratumInstance(LegendTraits, {
      title: this.primaryLegend?.title,
      items: sortedStops.map(([position, color], index) =>
        createStratumInstance(
          LegendItemTraits,
          this.createLegendEntry(
            position,
            color,
            domain,
            stopMin,
            stopMax,
            index,
            baselineItems
          )
        )
      )
    });
  }

  private getStopTuplesFromCustomStops(
    stops: CustomColorStop[]
  ): [number, string][] {
    if (stops.length === 0) {
      return [];
    }
    return stops
      .map(
        (stop) => [clamp01(stop.position ?? 0), stop.color] as [number, string]
      )
      .sort((a, b) => a[0] - b[0]);
  }

  private createLegendEntry(
    position: number,
    color: string,
    domain: [number, number] | undefined,
    stopMin: number,
    stopMax: number,
    index: number,
    baselineItems?: LegendItemSnapshot[]
  ): { color: string; title: string; value?: number } {
    const range = stopMax - stopMin;
    const normalizedPosition =
      range === 0 ? 0 : clamp01((position - stopMin) / range);
    if (domain && domain.length === 2) {
      const value = domain[0] + normalizedPosition * (domain[1] - domain[0]);
      if (Number.isFinite(value)) {
        return { color, title: this.formatLegendValue(value), value };
      }
    }
    const baseline = baselineItems?.[index];
    if (baseline) {
      const baselineNumeric =
        baseline.value ?? this.extractNumericValue(baseline.title);
      if (baselineNumeric !== undefined) {
        return {
          color,
          title: this.formatLegendValue(baselineNumeric),
          value: baselineNumeric
        };
      }
      if (baseline.title) {
        return { color, title: baseline.title };
      }
    }
    const fallbackValue =
      range === 0 ? position : stopMin + normalizedPosition * range;
    return {
      color,
      title: this.formatLegendValue(fallbackValue),
      value: fallbackValue
    };
  }

  private getColorStopsForLegend(desiredBins?: number): [number, string][] {
    const targetBins = desiredBins ?? this.getLegendBinCount();
    const customStops = this.getStopTuplesFromCustomStops(
      this.customColorStops
    );
    if (customStops.length > 0) {
      return this.expandStopsForLegend(customStops, targetBins);
    }
    const defaultStops = this.getDefaultScaleStops();
    if (defaultStops.length === 0) {
      return this.expandStopsForLegend(
        [[0, DEFAULT_LEGEND_COLORS[0]]],
        targetBins
      );
    }
    return this.expandStopsForLegend(defaultStops, targetBins);
  }

  private getDefaultScaleStops(): [number, string][] {
    const renderOptions = this.item.renderOptions?.single;
    const scaleName = (renderOptions?.colorScale ??
      "rainbow") as ColorScaleNames;
    const scale = COG_COLOR_SCALES[scaleName];
    if (!scale) return [];

    let palette = scale.colors.slice();
    let positions =
      scale.positions && scale.positions.length === palette.length
        ? scale.positions.slice()
        : undefined;

    if (renderOptions?.reverseColorScale) {
      palette = palette.reverse();
      if (positions) {
        positions = positions.map((pos) => 1 - pos).reverse();
      }
    }

    if (positions && positions.length === palette.length) {
      return positions.map((pos, index) => [pos, palette[index]]);
    }

    if (palette.length === 0) {
      return [];
    }
    if (palette.length === 1) {
      return [[0, palette[0]]];
    }

    return palette.map((color, index) => [index / (palette.length - 1), color]);
  }

  private expandStopsForLegend(
    stops: [number, string][],
    desiredBins: number
  ): [number, string][] {
    const count = Math.max(1, desiredBins);
    const sorted = stops
      .filter(([, color]) => !!color)
      .map(([position, color]) => [position ?? 0, color] as [number, string])
      .sort((a, b) => a[0] - b[0]);
    if (sorted.length === 0) {
      return [];
    }
    if (sorted.length === 1) {
      return Array.from({ length: count }, () => [sorted[0][0], sorted[0][1]]);
    }

    const minPos = sorted[0][0];
    const maxPos = sorted[sorted.length - 1][0];
    const range = maxPos - minPos;

    const evaluateColor = (target: number): string => {
      if (target <= minPos) {
        return sorted[0][1];
      }
      if (target >= maxPos) {
        return sorted[sorted.length - 1][1];
      }
      for (let i = 0; i < sorted.length - 1; i++) {
        const [posA, colorA] = sorted[i];
        const [posB, colorB] = sorted[i + 1];
        if (target >= posA && target <= posB) {
          const localT = posB === posA ? 0 : (target - posA) / (posB - posA);
          return interpolateColor(colorA, colorB, localT);
        }
      }
      return sorted[sorted.length - 1][1];
    };

    return Array.from({ length: count }, (_, index) => {
      const t = count === 1 ? 0 : index / (count - 1);
      const targetPos = range === 0 ? minPos : minPos + t * range;
      return [targetPos, evaluateColor(targetPos)] as [number, string];
    });
  }

  private getProviderDomain(): [number, number] | undefined {
    const mapItems = (this.item.mapItems ?? []) as any[];
    if (!Array.isArray(mapItems) || mapItems.length === 0) return undefined;
    const provider = mapItems[0]?.imageryProvider as any;
    if (!provider) return undefined;

    // Debug logging to see what's available
    console.log(
      "[COG Auto-detect Debug] Provider keys:",
      Object.keys(provider)
    );
    console.log("[COG Auto-detect Debug] Statistics:", provider.statistics);
    console.log("[COG Auto-detect Debug] _statistics:", provider._statistics);
    console.log("[COG Auto-detect Debug] pool:", provider.pool);
    console.log("[COG Auto-detect Debug] tiffImages:", provider.tiffImages);

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
      const range = this.extractRange(candidate);
      if (range) {
        console.log(
          "[COG Auto-detect Debug] Found domain from direct candidate:",
          range
        );
        return range;
      }
    }

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
      const range = this.extractRange(candidate);
      if (range) {
        console.log(
          "[COG Auto-detect Debug] Found domain from statistics:",
          range
        );
        return range;
      }
    }

    // Try to extract from tiffImages if available (some versions store it there)
    if (
      provider.tiffImages &&
      Array.isArray(provider.tiffImages) &&
      provider.tiffImages.length > 0
    ) {
      const tiffImage = provider.tiffImages[0];
      console.log(
        "[COG Auto-detect Debug] tiffImage keys:",
        tiffImage ? Object.keys(tiffImage) : "null"
      );
      if (tiffImage) {
        const tiffCandidates = [
          tiffImage.stats,
          tiffImage.statistics,
          tiffImage.metadata?.stats,
          tiffImage.metadata?.statistics,
          tiffImage.fileDirectory?.GDAL_METADATA,
          tiffImage.gdalMetadata
        ];

        for (const candidate of tiffCandidates) {
          console.log(
            "[COG Auto-detect Debug] Checking tiff candidate:",
            candidate
          );
          const range = this.extractRange(candidate);
          if (range) {
            console.log(
              "[COG Auto-detect Debug] Found domain from tiffImage:",
              range
            );
            return range;
          }
        }
      }
    }

    // Try pool.images if available
    if (
      provider.pool?.images &&
      Array.isArray(provider.pool.images) &&
      provider.pool.images.length > 0
    ) {
      const poolImage = provider.pool.images[0];
      console.log(
        "[COG Auto-detect Debug] poolImage keys:",
        poolImage ? Object.keys(poolImage) : "null"
      );
      if (poolImage) {
        const poolCandidates = [
          poolImage.stats,
          poolImage.statistics,
          poolImage.metadata?.stats,
          poolImage.metadata?.statistics
        ];

        for (const candidate of poolCandidates) {
          const range = this.extractRange(candidate);
          if (range) {
            console.log(
              "[COG Auto-detect Debug] Found domain from pool image:",
              range
            );
            return range;
          }
        }
      }
    }

    console.log("[COG Auto-detect Debug] No domain found in provider");
    return undefined;
  }

  private extractRange(candidate: any): [number, number] | undefined {
    if (candidate === undefined || candidate === null) return undefined;

    const normalizePair = (min: number, max: number) => {
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return undefined;
      }
      return min <= max
        ? ([min, max] as [number, number])
        : ([max, min] as [number, number]);
    };

    if (Array.isArray(candidate)) {
      if (candidate.length >= 2) {
        const pair = normalizePair(Number(candidate[0]), Number(candidate[1]));
        if (pair) return pair;
      }
      if (candidate.length >= 1) {
        const nested = this.extractRange(candidate[0]);
        if (nested) return nested;
      }
    }

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
        const nested = this.extractRange(candidate.values);
        if (nested) return nested;
      }
    }

    return undefined;
  }

  private getLegendBinCount(): number {
    const renderOptions = this.item.renderOptions?.single;
    const type = renderOptions?.type ?? "continuous";
    const defaultBins = type === "discrete" ? 8 : 7;
    return renderOptions?.numberOfBins && renderOptions.numberOfBins > 0
      ? renderOptions.numberOfBins
      : defaultBins;
  }

  private getActiveDomain(): [number, number] | undefined {
    return (
      toMutableDisplayRange(this.item.renderOptions?.single?.displayRange) ??
      toMutableDisplayRange(this.item.renderOptions?.single?.domain)
    );
  }

  private deriveDomainFromBaseline(
    baselineItems?: LegendItemSnapshot[]
  ): [number, number] | undefined {
    if (!baselineItems || baselineItems.length === 0) return undefined;
    const values = baselineItems
      .map((item) => item.value ?? this.extractNumericValue(item.title))
      .filter((v): v is number => v !== undefined && isFinite(v));
    if (values.length < 2) return undefined;
    const derived: [number, number] = [
      Math.min(...values),
      Math.max(...values)
    ];
    if (
      Number.isFinite(derived[0]) &&
      Number.isFinite(derived[1]) &&
      derived[0] <= derived[1]
    ) {
      this.cachedLegendDomain = derived;
    }
    return derived;
  }

  private extractNumericValue(title?: string | null): number | undefined {
    if (!title) return undefined;
    const match = title.match(
      /[-+\u2212]?\d[\d\s\.,\u00A0\u202F\u2009\u2007\-\+\u2212]*/
    );
    if (!match) return undefined;
    let candidate = match[0].trim();
    if (!candidate) return undefined;
    candidate = candidate.replace(/[\s\u00A0\u202F\u2009\u2007]+/g, "");
    candidate = candidate.replace(/\u2212/g, "-");
    const separatorMatches = [...candidate.matchAll(/[.,]/g)].map((result) => ({
      char: result[0],
      index: result.index ?? -1
    }));
    let normalized = candidate;
    if (separatorMatches.length > 0) {
      const { index } = separatorMatches[separatorMatches.length - 1];
      if (index >= 0) {
        const integerPart = normalized.slice(0, index).replace(/[.,]/g, "");
        const fractionalPart = normalized.slice(index + 1).replace(/[.,]/g, "");
        normalized = `${integerPart}.${fractionalPart}`;
      } else {
        normalized = normalized.replace(/[.,]/g, "");
      }
    }
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }

  private formatLegendValue(value: number): string {
    const absValue = Math.abs(value);
    if (absValue > 0 && absValue < 0.01) {
      return value.toExponential(2);
    }
    if (absValue >= 10000) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (absValue >= 1000) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  /** Domain minimum value */
  @computed
  private get domainMinSelectableDim(): SelectableDimensionNumeric | undefined {
    const domain = this.item.renderOptions?.single?.domain;
    const providerDomain = this.getProviderDomain();
    const value = domain?.[0] ?? providerDomain?.[0];

    return {
      type: "numeric",
      id: "domain-min",
      name: "Minimum Value",
      value: value,
      allowUndefined: true,
      setDimensionValue: action(
        (stratumId: string, value: number | undefined) => {
          if (value === undefined) {
            // Clear the domain if undefined
            if (this.item.renderOptions.single) {
              this.item.renderOptions.single.setTrait(
                stratumId,
                "domain",
                undefined
              );
            }
            return;
          }
          const currentDomain = this.item.renderOptions?.single?.domain;
          const providerDomain = this.getProviderDomain();
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "domain", [
            value,
            currentDomain?.[1] ?? providerDomain?.[1] ?? value + 100
          ]);
        }
      )
    };
  }

  /** Domain maximum value */
  @computed
  private get domainMaxSelectableDim(): SelectableDimensionNumeric | undefined {
    const domain = this.item.renderOptions?.single?.domain;
    const providerDomain = this.getProviderDomain();
    const value = domain?.[1] ?? providerDomain?.[1];

    return {
      type: "numeric",
      id: "domain-max",
      name: "Maximum Value",
      value: value,
      allowUndefined: true,
      setDimensionValue: action(
        (stratumId: string, value: number | undefined) => {
          if (value === undefined) {
            // Clear the domain if undefined
            if (this.item.renderOptions.single) {
              this.item.renderOptions.single.setTrait(
                stratumId,
                "domain",
                undefined
              );
            }
            return;
          }
          const currentDomain = this.item.renderOptions?.single?.domain;
          const providerDomain = this.getProviderDomain();
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "domain", [
            currentDomain?.[0] ?? providerDomain?.[0] ?? value - 100,
            value
          ]);
        }
      )
    };
  }

  /** Auto-detect domain button */
  @computed
  private get autoDetectDomainButton(): SelectableDimensionButton | undefined {
    const providerDomain = this.getProviderDomain();
    const currentDomain = this.item.renderOptions?.single?.domain;

    // Only show button if:
    // 1. Provider has statistics available, OR
    // 2. User has set a domain and might want to reset it
    if (!providerDomain && !currentDomain) return undefined;

    return {
      type: "button",
      id: "auto-detect-domain",
      value: providerDomain
        ? i18next.t("models.cogStyling.domain.autoDetect")
        : i18next.t("models.cogStyling.domain.clearManual"),
      setDimensionValue: action((stratumId: string) => {
        if (providerDomain) {
          // Set domain from provider statistics
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "domain",
            providerDomain
          );
        } else {
          // Clear manual domain
          if (this.item.renderOptions.single) {
            this.item.renderOptions.single.setTrait(
              stratumId,
              "domain",
              undefined
            );
          }
        }
      })
    };
  }

  /** Apply display range checkbox */
  @computed
  private get applyDisplayRangeSelectableDim(): SelectableDimensionCheckbox {
    const applyDisplayRange =
      this.item.renderOptions?.single?.applyDisplayRange ?? false;

    return {
      type: "checkbox",
      id: "apply-display-range",
      name: i18next.t("models.cogStyling.applyDisplayRange"),
      selectedId: applyDisplayRange ? "true" : "false",
      allowUndefined: true,
      options: [{ id: "true" }],
      setDimensionValue: action(
        (stratumId: string, value: "true" | "false" | undefined) => {
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "applyDisplayRange",
            value === "true"
          );
        }
      )
    };
  }

  /** Display range minimum value */
  @computed
  private get displayRangeMinSelectableDim(): SelectableDimensionNumeric {
    const displayRange = this.item.renderOptions?.single?.displayRange;
    const domain = this.item.renderOptions?.single?.domain;
    const providerDomain = this.getProviderDomain();
    const value = displayRange?.[0] ?? domain?.[0] ?? providerDomain?.[0];

    return {
      type: "numeric",
      id: "display-range-min",
      name: i18next.t("models.cogStyling.displayRangeMin"),
      value: value,
      allowUndefined: true,
      setDimensionValue: action(
        (stratumId: string, value: number | undefined) => {
          if (value === undefined) {
            if (this.item.renderOptions.single) {
              this.item.renderOptions.single.setTrait(
                stratumId,
                "displayRange",
                undefined
              );
            }
            return;
          }
          const currentRange = this.item.renderOptions?.single?.displayRange;
          const domain = this.item.renderOptions?.single?.domain;
          const providerDomain = this.getProviderDomain();
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "displayRange", [
            value,
            currentRange?.[1] ??
              domain?.[1] ??
              providerDomain?.[1] ??
              value + 100
          ]);
        }
      )
    };
  }

  /** Display range maximum value */
  @computed
  private get displayRangeMaxSelectableDim(): SelectableDimensionNumeric {
    const displayRange = this.item.renderOptions?.single?.displayRange;
    const domain = this.item.renderOptions?.single?.domain;
    const providerDomain = this.getProviderDomain();
    const value = displayRange?.[1] ?? domain?.[1] ?? providerDomain?.[1];

    return {
      type: "numeric",
      id: "display-range-max",
      name: i18next.t("models.cogStyling.displayRangeMax"),
      value: value,
      allowUndefined: true,
      setDimensionValue: action(
        (stratumId: string, value: number | undefined) => {
          if (value === undefined) {
            if (this.item.renderOptions.single) {
              this.item.renderOptions.single.setTrait(
                stratumId,
                "displayRange",
                undefined
              );
            }
            return;
          }
          const currentRange = this.item.renderOptions?.single?.displayRange;
          const domain = this.item.renderOptions?.single?.domain;
          const providerDomain = this.getProviderDomain();
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "displayRange", [
            currentRange?.[0] ??
              domain?.[0] ??
              providerDomain?.[0] ??
              value - 100,
            value
          ]);
        }
      )
    };
  }

  /** Band selector */
  @computed
  private get bandSelectableDim(): SelectableDimensionNumeric | undefined {
    const band = this.item.renderOptions?.single?.band ?? 1;

    return {
      type: "numeric",
      id: "band",
      name: "Band",
      value: band,
      min: 1,
      setDimensionValue: action((stratumId: string, value: number) => {
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(
          stratumId,
          "band",
          Math.max(1, Math.floor(value))
        );
      })
    };
  }

  /** Clamp low values checkbox */
  @computed
  private get clampLowSelectableDim(): SelectableDimensionCheckbox | undefined {
    const clampLow = this.item.renderOptions?.single?.clampLow ?? false;

    return {
      type: "checkbox",
      id: "clamp-low",
      name: "Clamp Low Values",
      selectedId: clampLow ? "true" : "false",
      options: [{ id: "true" }],
      setDimensionValue: action(
        (stratumId: string, value: "true" | "false" | undefined) => {
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "clampLow",
            value === "true"
          );
        }
      )
    };
  }

  /** Clamp high values checkbox */
  @computed
  private get clampHighSelectableDim():
    | SelectableDimensionCheckbox
    | undefined {
    const clampHigh = this.item.renderOptions?.single?.clampHigh ?? false;

    return {
      type: "checkbox",
      id: "clamp-high",
      name: "Clamp High Values",
      selectedId: clampHigh ? "true" : "false",
      options: [{ id: "true" }],
      setDimensionValue: action(
        (stratumId: string, value: "true" | "false" | undefined) => {
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "clampHigh",
            value === "true"
          );
        }
      )
    };
  }
}

interface CustomColorStop {
  position: number;
  color: string;
}

function clamp01(value: number): number {
  if (!isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function interpolateHexColor(start: string, end: string, t: number): string {
  const startRgb = parseColorToRgb(start);
  const endRgb = parseColorToRgb(end);
  if (!startRgb || !endRgb) {
    return t < 0.5 ? start : end;
  }
  const interpolateChannel = (a: number, b: number) =>
    Math.round(a + (b - a) * Math.min(Math.max(t, 0), 1));
  const [r, g, b] = [
    interpolateChannel(startRgb[0], endRgb[0]),
    interpolateChannel(startRgb[1], endRgb[1]),
    interpolateChannel(startRgb[2], endRgb[2])
  ];
  return rgbToHex(r, g, b);
}

function interpolateColor(start: string, end: string, t: number): string {
  return interpolateHexColor(start, end, t);
}

function parseColorToRgb(color: string): [number, number, number] | undefined {
  const trimmed = color.trim();
  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }

  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(
    trimmed
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if ([r, g, b].every((v) => v >= 0 && v <= 255)) {
      return [r, g, b];
    }
  }

  return undefined;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)));
  const toHex = (value: number) => clamp(value).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface LegendItemSnapshot {
  title?: string;
  value?: number;
}

function toMutableDisplayRange(
  value: ReadonlyArray<number> | undefined,
  fallback?: ReadonlyArray<number> | undefined
): [number, number] | undefined {
  const range = value ?? fallback;
  if (!range || range.length < 2) {
    return;
  }
  return [range[0], range[1]];
}
