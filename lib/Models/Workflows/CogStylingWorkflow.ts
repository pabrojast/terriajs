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

    if (!minDim && !maxDim) return undefined;

    return {
      type: "group",
      id: "domain",
      name: "Value Range",
      selectableDimensions: filterOutUndefined([minDim, maxDim]),
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
      this.hasManualLegend
        ? ({
            type: "button",
            id: "legend-sync",
            value: i18next.t("models.cogStyling.legend.sync"),
            setDimensionValue: action((stratumId: string) =>
              this.generateLegendFromColorScale(stratumId)
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
    if (stops.length === 1) {
      position =
        stops[0].position >= 0.5
          ? clamp01(stops[0].position / 2)
          : clamp01((stops[0].position + 1) / 2);
    } else if (stops.length > 1) {
      let largestGapIndex = 0;
      let largestGap = -1;
      for (let i = 0; i < stops.length - 1; i++) {
        const gap = stops[i + 1].position - stops[i].position;
        if (gap > largestGap) {
          largestGap = gap;
          largestGapIndex = i;
        }
      }
      position = stops[largestGapIndex].position + largestGap / 2;
    }
    const defaultColor = stops[stops.length - 1]?.color ?? "#ff0000";
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
    const entry = this.createLegendEntryFromStops(
      this.getColorStopsForLegend(this.getLegendBinCount()),
      this.getActiveDomain(),
      this.primaryLegend?.items?.length ?? 0
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

  private getLegendItemDefaultColor(index: number): string {
    const stops = this.getColorStopsForLegend(this.getLegendBinCount());
    const stop = stops[Math.min(index, stops.length - 1)];
    return (
      stop?.[1] ?? DEFAULT_LEGEND_COLORS[index % DEFAULT_LEGEND_COLORS.length]
    );
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

  private generateLegendFromColorScale(stratumId: string) {
    this.ensureLegendUserStratum(stratumId);
    const legend = this.buildLegendFromStops(
      this.getColorStopsForLegend(this.getLegendBinCount()),
      this.getActiveDomain()
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
    const legend = this.buildLegendFromStops(stops, this.getActiveDomain());
    if (legend) {
      this.item.setTrait(stratumId, "legends", [legend]);
    }
  }

  private buildLegendFromStops(
    stops: [number, string][],
    domainOverride?: [number, number]
  ): StratumFromTraits<LegendTraits> | undefined {
    if (stops.length === 0) return undefined;
    const domain = domainOverride ?? this.getActiveDomain();
    const hasDomain = !!domain;
    const [min, max] = domain ?? [0, 1];

    return createStratumInstance(LegendTraits, {
      title: this.primaryLegend?.title,
      items: stops.map(([position, color], index) => {
        const value = hasDomain ? min + position * (max - min) : undefined;
        return createStratumInstance(LegendItemTraits, {
          color,
          title:
            value !== undefined
              ? this.formatLegendValue(value)
              : `${Math.round(position * 100)}%`,
          value: value
        });
      })
    });
  }

  private getStopTuplesFromCustomStops(
    stops: CustomColorStop[]
  ): [number, string][] {
    if (stops.length === 0) {
      return [];
    }
    return stops.map((stop) => [clamp01(stop.position ?? 0), stop.color]);
  }

  private createLegendEntryFromStops(
    stops: [number, string][],
    domain: [number, number] | undefined,
    index: number
  ): { color: string; title: string; value?: number } {
    if (stops.length === 0) {
      return { color: DEFAULT_LEGEND_COLORS[0], title: "" };
    }
    const clampedIndex = Math.min(index, stops.length - 1);
    const [position, color] = stops[clampedIndex];
    if (domain && domain.length === 2) {
      const value = domain[0] + position * (domain[1] - domain[0]);
      return { color, title: this.formatLegendValue(value), value };
    }
    return { color, title: Math.round(position * 100) + "%" };
  }

  private getColorStopsForLegend(desiredBins?: number): [number, string][] {
    const customStops = this.getStopTuplesFromCustomStops(
      this.customColorStops
    );
    if (customStops.length > 0) {
      return customStops.sort((a, b) => a[0] - b[0]);
    }

    const colors = this.sampleScaleColors(desiredBins);
    if (colors.length === 0) {
      return [[0, DEFAULT_LEGEND_COLORS[0]]];
    }

    return colors.map((color, index) => [
      colors.length === 1 ? 0 : index / (colors.length - 1),
      color
    ]);
  }

  private sampleScaleColors(desiredBins?: number): string[] {
    const renderOptions = this.item.renderOptions?.single;
    const scaleName = (renderOptions?.colorScale ??
      "rainbow") as ColorScaleNames;
    const scale = COG_COLOR_SCALES[scaleName];
    if (!scale) return [];

    let palette = scale.colors.slice();
    if (renderOptions?.reverseColorScale) {
      palette = palette.reverse();
    }

    const count = desiredBins ?? this.getLegendBinCount();
    if (count <= 0) return palette;
    if (count >= palette.length) return palette.slice();
    if (count === 1) return [palette[0]];

    return Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      const idx = Math.round(t * (palette.length - 1));
      return palette[idx];
    });
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
    const value = domain?.[0];

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
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "domain", [
            value,
            currentDomain?.[1] ?? value + 100
          ]);
        }
      )
    };
  }

  /** Domain maximum value */
  @computed
  private get domainMaxSelectableDim(): SelectableDimensionNumeric | undefined {
    const domain = this.item.renderOptions?.single?.domain;
    const value = domain?.[1];

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
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "domain", [
            currentDomain?.[0] ?? value - 100,
            value
          ]);
        }
      )
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
    const value = displayRange?.[0] ?? domain?.[0];

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
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "displayRange", [
            value,
            currentRange?.[1] ?? value + 100
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
    const value = displayRange?.[1] ?? domain?.[1];

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
          if (!this.item.renderOptions.single) {
            this.item.renderOptions.setTrait(stratumId, "single", undefined);
          }
          this.item.renderOptions.single!.setTrait(stratumId, "displayRange", [
            currentRange?.[0] ?? value - 100,
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
