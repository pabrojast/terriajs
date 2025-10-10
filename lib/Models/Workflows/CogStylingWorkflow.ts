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
  SelectableDimensionNumeric
} from "../SelectableDimensions/SelectableDimensions";
import SelectableDimensionWorkflow, {
  SelectableDimensionWorkflowGroup
} from "./SelectableDimensionWorkflow";
import { ColorScaleNames } from "../../Traits/TraitsClasses/CogCatalogItemTraits";

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

    if (!colorScaleDim && !typeDim && !numberOfBinsDim && !reverseColorScaleDim) return undefined;

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

    if (!applyDim && !minDim && !maxDim) return undefined;

    return {
      type: "group",
      id: "display-range",
      name: "Display Range (Transparency Filter)",
      selectableDimensions: filterOutUndefined([applyDim, minDim, maxDim]),
      isOpen: false
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
      setDimensionValue: action((stratumId: string, value: string | undefined) => {
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(
          stratumId,
          "colorScale",
          value as ColorScaleNames | undefined
        );
      })
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
  private get numberOfBinsSelectableDim(): SelectableDimensionNumeric | undefined {
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
      setDimensionValue: action((stratumId: string, value: number | undefined) => {
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(
          stratumId,
          "numberOfBins",
          value !== undefined ? Math.max(2, Math.min(30, Math.floor(value))) : undefined
        );
      })
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
  private get additionalColorsGroup(): SelectableDimensionWorkflowGroup | undefined {
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
      setDimensionValue: action((stratumId: string, value: string | undefined) => {
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(
          stratumId,
          "noDataColor",
          value
        );
      })
    };
  }

  /** Domain minimum value */
  @computed
  private get domainMinSelectableDim():
    | SelectableDimensionNumeric
    | undefined {
    const domain = this.item.renderOptions?.single?.domain;
    const value = domain?.[0];

    return {
      type: "numeric",
      id: "domain-min",
      name: "Minimum Value",
      value: value,
      allowUndefined: true,
      setDimensionValue: action((stratumId: string, value: number | undefined) => {
        if (value === undefined) {
          // Clear the domain if undefined
          if (this.item.renderOptions.single) {
            this.item.renderOptions.single.setTrait(stratumId, "domain", undefined);
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
      })
    };
  }

  /** Domain maximum value */
  @computed
  private get domainMaxSelectableDim():
    | SelectableDimensionNumeric
    | undefined {
    const domain = this.item.renderOptions?.single?.domain;
    const value = domain?.[1];

    return {
      type: "numeric",
      id: "domain-max",
      name: "Maximum Value",
      value: value,
      allowUndefined: true,
      setDimensionValue: action((stratumId: string, value: number | undefined) => {
        if (value === undefined) {
          // Clear the domain if undefined
          if (this.item.renderOptions.single) {
            this.item.renderOptions.single.setTrait(stratumId, "domain", undefined);
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
      })
    };
  }

  /** Apply display range checkbox */
  @computed
  private get applyDisplayRangeSelectableDim():
    | SelectableDimensionCheckbox
    | undefined {
    const applyDisplayRange =
      this.item.renderOptions?.single?.applyDisplayRange ?? false;

    return {
      type: "checkbox",
      id: "apply-display-range",
      name: "Enable (values outside range will be transparent)",
      selectedId: applyDisplayRange ? "true" : "false",
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
  private get displayRangeMinSelectableDim():
    | SelectableDimensionNumeric
    | undefined {
    const displayRange = this.item.renderOptions?.single?.displayRange;
    const value = displayRange?.[0];

    return {
      type: "numeric",
      id: "display-range-min",
      name: "Minimum",
      value: value,
      setDimensionValue: action((stratumId: string, value: number) => {
        const currentRange = this.item.renderOptions?.single?.displayRange;
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(stratumId, "displayRange", [
          value,
          currentRange?.[1] ?? value + 1
        ]);
      })
    };
  }

  /** Display range maximum value */
  @computed
  private get displayRangeMaxSelectableDim():
    | SelectableDimensionNumeric
    | undefined {
    const displayRange = this.item.renderOptions?.single?.displayRange;
    const value = displayRange?.[1];

    return {
      type: "numeric",
      id: "display-range-max",
      name: "Maximum",
      value: value,
      setDimensionValue: action((stratumId: string, value: number) => {
        const currentRange = this.item.renderOptions?.single?.displayRange;
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(stratumId, "displayRange", [
          currentRange?.[0] ?? value - 1,
          value
        ]);
      })
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
  private get clampLowSelectableDim():
    | SelectableDimensionCheckbox
    | undefined {
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
