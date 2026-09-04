import i18next from "i18next";
import { action, computed, makeObservable } from "mobx";
import filterOutUndefined from "../../Core/filterOutUndefined";
import isDefined from "../../Core/isDefined";
import CogCatalogItem from "../Catalog/CatalogItems/CogCatalogItem";
import CogTimeSeriesCatalogItem from "../Catalog/CatalogItems/CogTimeSeriesCatalogItem";
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
import { CogColorScaleOptionRenderer } from "../../ReactViews/SelectableDimensions/CogColorScaleOptionRenderer";
import { COG_COLOR_SCALE_NAMES } from "../Catalog/CatalogItems/CogColorScales";
import {
  getValidDisplayRange,
  getValidDomain,
  resolveCogColorStops,
  sampleCogColor
} from "../Catalog/CatalogItems/CogRenderStyle";

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

/** Items that can be styled with this workflow. Both share the same
 *  `renderOptions: CogRenderOptionsTraits` and `LegendOwnerTraits`, so the
 *  workflow operates on either without further branching. */
export type CogStylableItem = CogCatalogItem | CogTimeSeriesCatalogItem;

/** SelectableDimensionWorkflow for styling COG (Cloud Optimized GeoTIFF) catalog items */
export default class CogStylingWorkflow implements SelectableDimensionWorkflow {
  static type = "cog-styling";

  /** Cached numeric domain derived from previous legend synchronisations */
  private cachedLegendDomain?: [number, number];

  constructor(readonly item: CogStylableItem) {
    makeObservable(this);
  }

  get name() {
    return i18next.t("models.cog.editStyle");
  }

  get icon() {
    return Icon.GLYPHS.layers;
  }

  get footer() {
    return {
      buttonText: i18next.t("models.cogStyling.reset"),
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
      this.transparencyGroup,
      this.customColorsGroup,
      this.legendGroup,
      this.advancedGroup
    ]);
  }

  /** Read-only inline help/warning text rendered as the first item of a group. */
  private makeInfoText(id: string, text: string): SelectableDimensionText {
    return {
      type: "text",
      id,
      value: text
    } as SelectableDimensionText;
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
      name: i18next.t("models.cogStyling.colorScheme"),
      selectableDimensions: filterOutUndefined([
        this.makeInfoText(
          "color-scheme-help",
          i18next.t("models.cogStyling.colorHelp")
        ),
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
      name: i18next.t("models.cogStyling.domain.title"),
      selectableDimensions: filterOutUndefined([
        this.makeInfoText(
          "domain-help",
          i18next.t("models.cogStyling.domain.help")
        ),
        minDim,
        maxDim,
        this.domainValidationWarning,
        autoDetectButton,
        this.autoFitTimestepButton
      ]),
      isOpen: true
    };
  }

  @computed
  private get domainValidationWarning(): SelectableDimensionText | undefined {
    const domain = this.item.renderOptions?.single?.domain;
    if (domain === undefined || getValidDomain(domain)) return undefined;
    return this.makeInfoText(
      "domain-validation-warning",
      i18next.t("models.cogStyling.domain.invalidRange")
    );
  }

  /** Transparency group: fuses no-data fill colour, "hide outside range" toggle,
   *  optional min/max (only when toggle is on) and a warning when the
   *  transparency range falls outside the colour scale range. */
  @computed
  private get transparencyGroup():
    | SelectableDimensionWorkflowGroup
    | undefined {
    const help = this.makeInfoText(
      "transparency-help",
      i18next.t("models.cogStyling.transparency.help")
    );
    const noDataColorDim = this.noDataColorSelectableDim;
    const applyDim = this.applyDisplayRangeSelectableDim;
    const isApplied =
      this.item.renderOptions?.single?.applyDisplayRange === true;
    const minDim = isApplied ? this.displayRangeMinSelectableDim : undefined;
    const maxDim = isApplied ? this.displayRangeMaxSelectableDim : undefined;
    const warning = this.transparencyOutsideRangeWarning;

    return {
      type: "group",
      id: "transparency",
      name: i18next.t("models.cogStyling.displayRange"),
      selectableDimensions: filterOutUndefined([
        help,
        noDataColorDim,
        applyDim,
        minDim,
        maxDim,
        warning
      ]),
      isOpen: false
    };
  }

  /** Warning shown when transparency range is set but falls outside the
   *  current color-scale range (e.g. user navigated time-series timestamps
   *  with very different value ranges). */
  @computed
  private get transparencyOutsideRangeWarning():
    | SelectableDimensionText
    | undefined {
    const single = this.item.renderOptions?.single;
    if (!single?.applyDisplayRange) return undefined;
    const tr = single.displayRange;
    if (!tr) return undefined;
    if (!getValidDisplayRange(tr)) {
      return this.makeInfoText(
        "transparency-warning",
        i18next.t("models.cogStyling.transparency.invalidRange")
      );
    }
    const dom = single.domain ?? this.getProviderDomain();
    if (!dom) return undefined;
    const outside =
      tr[0] > dom[1] || tr[1] < dom[0] || tr[0] > tr[1] || dom[0] > dom[1];
    if (!outside) return undefined;
    return this.makeInfoText(
      "transparency-warning",
      i18next.t("models.cogStyling.transparency.outsideRangeWarning", {
        trMin: this.formatLegendValue(tr[0]),
        trMax: this.formatLegendValue(tr[1]),
        dMin: this.formatLegendValue(dom[0]),
        dMax: this.formatLegendValue(dom[1])
      })
    );
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
      name: i18next.t("models.cogStyling.advanced"),
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
    const single = this.item.renderOptions?.single;
    const colorScale = single?.colorScale;
    const mode =
      single?.colorScaleMode ??
      (single?.colors && single.colors.length > 0
        ? "custom"
        : colorScale
        ? "named"
        : "default");

    return {
      type: "select",
      id: "color-scale",
      name: i18next.t("models.cogStyling.colorScale"),
      selectedId: mode === "named" ? colorScale : undefined,
      allowUndefined: true,
      undefinedLabel:
        mode === "custom"
          ? i18next.t("models.cogStyling.customColors.name")
          : i18next.t("models.cogStyling.defaultColorScale"),
      options: COG_COLOR_SCALE_NAMES.map((scale) => ({
        id: scale,
        name: scale.charAt(0).toUpperCase() + scale.slice(1)
      })),
      optionRenderer: CogColorScaleOptionRenderer,
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
          this.item.renderOptions.single!.setTrait(
            stratumId,
            "colorScaleMode",
            value === undefined ? "default" : "named"
          );
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
      name: i18next.t("models.cogStyling.renderType"),
      selectedId: type,
      allowUndefined: false,
      options: [
        { id: "continuous", name: i18next.t("models.cogStyling.continuous") },
        { id: "discrete", name: i18next.t("models.cogStyling.discrete") }
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
    const defaultValue = 8; // For discrete legends only (continuous uses SVG gradient)

    // Only show this control for discrete legends
    if (type !== "discrete") {
      return undefined;
    }

    return {
      type: "numeric",
      id: "number-of-bins",
      name: i18next.t("models.cogStyling.legendSteps"),
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
      name: i18next.t("models.cogStyling.reverseColors"),
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
    const renderType = this.item.renderOptions?.single?.type ?? "continuous";
    const isContinuous = renderType === "continuous";

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

    // For continuous mode: simpler UI without auto legend options
    // For discrete mode: full UI with auto legend checkbox
    const dimensions = filterOutUndefined([
      {
        type: "text",
        id: "legend-title",
        name: i18next.t("models.cogStyling.legend.title"),
        value: legend.title,
        disable: !isContinuous && !this.hasManualLegend,
        setDimensionValue: action(
          (stratumId: string, value: string | undefined) =>
            this.updateLegendTitle(stratumId, value)
        )
      } as SelectableDimensionText,
      // Only show auto legend checkbox for discrete mode
      !isContinuous
        ? ({
            type: "checkbox",
            id: "legend-auto",
            name: i18next.t("models.cogStyling.legend.auto"),
            selectedId: this.hasManualLegend ? "false" : "true",
            options: [{ id: "true" }],
            setDimensionValue: action(
              (stratumId: string, value: "true" | "false" | undefined) => {
                if (value === "true") {
                  // Remove legends from user stratum to allow CogLegendStratum to regenerate them automatically
                  this.item.legends?.forEach((legend) =>
                    legend.strata.delete(CommonStrata.user)
                  );
                } else {
                  this.ensureLegendUserStratum(stratumId);
                }
              }
            )
          } as SelectableDimensionCheckbox)
        : undefined,
      // Only show auto info for discrete mode when not in manual mode
      !isContinuous && !this.hasManualLegend
        ? ({
            type: "text",
            id: "legend-auto-info",
            value: i18next.t("models.cogStyling.legend.autoInfo", {
              scale: this.item.renderOptions?.single?.colorScale ?? "rainbow",
              steps: this.getLegendBinCount()
            })
          } as SelectableDimensionText)
        : undefined,
      // Only show disable auto button for discrete mode when not in manual mode
      !isContinuous && !this.hasManualLegend
        ? ({
            type: "button",
            id: "legend-disable-auto",
            value: i18next.t("models.cogStyling.legend.disableAuto"),
            setDimensionValue: action((stratumId: string) =>
              this.ensureLegendUserStratum(stratumId)
            )
          } as SelectableDimensionButton)
        : undefined,
      // Sync button: show for discrete manual mode, or for continuous mode
      (isContinuous || this.hasManualLegend) && !legend.url
        ? ({
            type: "button",
            id: "legend-sync",
            value: i18next.t("models.cogStyling.legend.sync"),
            setDimensionValue: action((stratumId: string) =>
              this.generateLegendFromColorScale(stratumId, baselineItems)
            )
          } as SelectableDimensionButton)
        : undefined,
      // Legend items editing: show for discrete manual mode, or for continuous mode
      ...(isContinuous || this.hasManualLegend
        ? legend.items?.flatMap((item, index) =>
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
          ) ?? []
        : []),
      // Add item button: show for discrete manual mode, or for continuous mode
      (isContinuous || this.hasManualLegend) && !legend.url
        ? ({
            type: "button",
            id: "legend-add",
            value: i18next.t("models.cogStyling.legend.addItem"),
            setDimensionValue: action((stratumId: string) =>
              this.addLegendItem(stratumId)
            )
          } as SelectableDimensionButton)
        : undefined,
      // Reset button: show for discrete manual mode, or for continuous mode
      isContinuous || this.hasManualLegend
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
      name: i18next.t("models.cogStyling.transparency.noDataColor"),
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
    const single = this.item.renderOptions?.single;
    const colors = single?.colors;
    const mode =
      single?.colorScaleMode ??
      (colors && colors.length > 0
        ? "custom"
        : single?.colorScale
        ? "named"
        : "default");
    if (mode !== "custom") return [];
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
    this.item.renderOptions.single!.setTrait(
      stratumId,
      "colorScaleMode",
      this.item.renderOptions.single?.colorScale ? "named" : "default"
    );
    this.cachedLegendDomain = undefined;
  }

  private writeColorStops(stratumId: string, stops: CustomColorStop[]) {
    this.ensureSingleRenderOptions(stratumId);
    if (stops.length === 0) {
      this.item.renderOptions.single!.setTrait(stratumId, "colors", undefined);
      this.item.renderOptions.single!.setTrait(
        stratumId,
        "colorScaleMode",
        this.item.renderOptions.single?.colorScale ? "named" : "default"
      );
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
    this.item.renderOptions.single!.setTrait(
      stratumId,
      "colorScaleMode",
      "custom"
    );
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

  private clearLegendOverrides(_stratumId: string) {
    this.cachedLegendDomain = undefined;
    // Remove legends from user stratum to allow CogLegendStratum to regenerate them automatically
    this.item.legends?.forEach((legend) =>
      legend.strata.delete(CommonStrata.user)
    );
  }

  private ensureLegendUserStratum(stratumId: string) {
    const legend = this.primaryLegend;
    if (!legend) {
      const generated = this.buildLegendFromStops(
        this.getColorStopsForLegend(this.getLegendBinCount()),
        this.getActiveDomain()
      );
      if (generated) {
        (this.item as CogCatalogItem).setTrait(stratumId, "legends", [
          generated
        ]);
      }
      return;
    }

    if (!legend.strata.has(CommonStrata.user)) {
      const clone = createStratumInstance(LegendTraits, {
        title: legend.title,
        url: legend.url,
        urlMimeType: legend.urlMimeType,
        imageScaling: legend.imageScaling,
        backgroundColor: legend.backgroundColor,
        items:
          legend.items?.map((item) =>
            createStratumInstance(LegendItemTraits, {
              title: item.title,
              color: item.color,
              value: item.value
            })
          ) ?? []
      });
      (this.item as CogCatalogItem).setTrait(stratumId, "legends", [clone]);
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
      (this.item as CogCatalogItem).setTrait(stratumId, "legends", [legend]);
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
    (this.item as CogCatalogItem).setTrait(stratumId, "legends", [legend]);
  }

  private buildLegendDefinition(): StratumFromTraits<LegendTraits> | undefined {
    const legend = this.primaryLegend;
    if (!legend) return undefined;

    return createStratumInstance(LegendTraits, {
      title: legend.title,
      url: legend.url,
      urlMimeType: legend.urlMimeType,
      imageScaling: legend.imageScaling,
      backgroundColor: legend.backgroundColor,
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
      items: sortedStops
        .map(([position, color], index) =>
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
        .reverse() // Reverse to show high values at top, matching auto-generated legend
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
    const stops =
      this.item.effectiveCogStyle?.stops ??
      resolveCogColorStops(
        this.item.renderOptions?.single,
        this.getActiveDomain()
      );
    return stops.map((stop) => [stop.position, stop.color]);
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
    const effectiveStops = sorted.map(([position, color]) => ({
      position,
      color
    }));

    return Array.from({ length: count }, (_, index) => {
      const t = count === 1 ? 0 : index / (count - 1);
      const targetPos = range === 0 ? minPos : minPos + t * range;
      return [
        targetPos,
        sampleCogColor(effectiveStops, targetPos, "continuous")
      ] as [number, string];
    });
  }

  private getProviderDomain(): [number, number] | undefined {
    return this.item.effectiveCogStyle?.domain;
  }

  private getLegendBinCount(): number {
    const renderOptions = this.item.renderOptions?.single;
    const defaultBins = 8; // Default for discrete legends
    return renderOptions?.numberOfBins && renderOptions.numberOfBins > 0
      ? renderOptions.numberOfBins
      : defaultBins;
  }

  private getActiveDomain(): [number, number] | undefined {
    return (
      getValidDomain(this.item.renderOptions?.single?.domain) ??
      this.item.effectiveCogStyle?.domain
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
      /[-+\u2212]?\d[\d\s.,\u00A0\u202F\u2009\u2007+\u2212-]*/
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
      const separatorKinds = new Set(separatorMatches.map(({ char }) => char));
      const lastSeparator = separatorMatches[separatorMatches.length - 1];
      const unsigned = candidate.replace(/^[-+]/, "");
      const groups = unsigned.split(lastSeparator.char);
      const looksLikeThousands =
        separatorKinds.size === 1 &&
        groups.length >= 2 &&
        groups.slice(1).every((group) => group.length === 3) &&
        groups[0] !== "0";

      if (looksLikeThousands) {
        normalized = normalized.replace(/[.,]/g, "");
      } else if (lastSeparator.index >= 0) {
        const integerPart = normalized
          .slice(0, lastSeparator.index)
          .replace(/[.,]/g, "");
        const fractionalPart = normalized
          .slice(lastSeparator.index + 1)
          .replace(/[.,]/g, "");
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
      name: i18next.t("models.cogStyling.minimumValue"),
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
      name: i18next.t("models.cogStyling.maximumValue"),
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

  /** Time-series only: write the current timestep's native statistics into
   *  `domain` so the colour scale (and legend) stay fixed at that range. */
  @computed
  private get autoFitTimestepButton(): SelectableDimensionButton | undefined {
    if (!(this.item instanceof CogTimeSeriesCatalogItem)) return undefined;
    const nativeDomain = this.item.effectiveCogStyle?.nativeDomain;
    if (!nativeDomain) return undefined;
    return {
      type: "button",
      id: "auto-fit-timestep",
      value: i18next.t("models.cogStyling.timeSeries.autoFit"),
      setDimensionValue: action((stratumId: string) => {
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(stratumId, "domain", [
          nativeDomain[0],
          nativeDomain[1]
        ]);
      })
    };
  }

  /** Auto-detect domain button */
  @computed
  private get autoDetectDomainButton(): SelectableDimensionButton | undefined {
    const providerDomain = this.getProviderDomain();
    const currentDomain = this.item.renderOptions?.single?.domain;

    if (!providerDomain && !currentDomain) return undefined;

    return {
      type: "button",
      id: "auto-detect-domain",
      value: i18next.t("models.cogStyling.domain.autoDetect"),
      setDimensionValue: action((stratumId: string) => {
        if (this.item.renderOptions.single) {
          this.item.renderOptions.single.setTrait(
            stratumId,
            "domain",
            undefined
          );
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
      name: i18next.t("models.cogStyling.band"),
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
    const clampLow = this.item.renderOptions?.single?.clampLow ?? true;

    return {
      type: "checkbox",
      id: "clamp-low",
      name: i18next.t("models.cogStyling.clampLow"),
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
    const clampHigh =
      this.item.renderOptions?.single?.clampHigh ??
      this.item.renderOptions?.single?.clampLow ??
      true;

    return {
      type: "checkbox",
      id: "clamp-high",
      name: i18next.t("models.cogStyling.clampHigh"),
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

interface LegendItemSnapshot {
  title?: string;
  value?: number;
}
