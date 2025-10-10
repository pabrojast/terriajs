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
  SelectableDimensionEnum,
  SelectableDimensionNumeric
} from "../SelectableDimensions/SelectableDimensions";
import SelectableDimensionWorkflow, {
  SelectableDimensionWorkflowGroup
} from "./SelectableDimensionWorkflow";
import { ColorScaleNames } from "../../Traits/TraitsClasses/CogCatalogItemTraits";

/** Available color scales for COG rendering */
const COLOR_SCALES: ColorScaleNames[] = [
  "viridis",
  "plasma",
  "inferno",
  "magma",
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
  "yignbu",
  "greens",
  "yiorrd",
  "bluered",
  "rdbu",
  "picnic",
  "portland",
  "blackbody",
  "earth",
  "electric",
  "matter"
];

/** SelectableDimensionWorkflow for styling COG (Cloud Optimized GeoTIFF) catalog items */
export default class CogStylingWorkflow implements SelectableDimensionWorkflow {
  static type = "cog-styling";

  constructor(readonly item: CogCatalogItem) {
    makeObservable(this);
  }

  get name() {
    return i18next.t("models.cogStyling.name");
  }

  get icon() {
    return Icon.GLYPHS.layers;
  }

  get footer() {
    return {
      buttonText: i18next.t("models.cogStyling.reset"),
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
      this.displayRangeGroup,
      this.advancedGroup
    ]);
  }

  /** Color Scheme Selection Group */
  @computed
  private get colorSchemeGroup(): SelectableDimensionWorkflowGroup | undefined {
    const colorScaleDim = this.colorScaleSelectableDim;
    const typeDim = this.renderTypeSelectableDim;

    if (!colorScaleDim && !typeDim) return undefined;

    return {
      type: "group",
      id: "color-scheme",
      name: i18next.t("models.cogStyling.colorScheme"),
      selectableDimensions: filterOutUndefined([colorScaleDim, typeDim]),
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
      name: i18next.t("models.cogStyling.domain"),
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
      name: i18next.t("models.cogStyling.displayRange"),
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
    const colorScale =
      this.item.renderOptions?.single?.colorScale ?? "viridis";

    return {
      type: "select",
      id: "color-scale",
      name: i18next.t("models.cogStyling.colorScale"),
      selectedId: colorScale,
      allowUndefined: false,
      options: COLOR_SCALES.map((scale) => ({
        id: scale,
        name: scale.charAt(0).toUpperCase() + scale.slice(1)
      })),
      setDimensionValue: action((stratumId: string, value: string) => {
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(
          stratumId,
          "colorScale",
          value as ColorScaleNames
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
      name: i18next.t("models.cogStyling.minimumValue"),
      value: value,
      setDimensionValue: action((stratumId: string, value: number) => {
        const currentDomain = this.item.renderOptions?.single?.domain;
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(stratumId, "domain", [
          value,
          currentDomain?.[1] ?? value + 1
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
      name: i18next.t("models.cogStyling.maximumValue"),
      value: value,
      setDimensionValue: action((stratumId: string, value: number) => {
        const currentDomain = this.item.renderOptions?.single?.domain;
        if (!this.item.renderOptions.single) {
          this.item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        this.item.renderOptions.single!.setTrait(stratumId, "domain", [
          currentDomain?.[0] ?? value - 1,
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
      name: i18next.t("models.cogStyling.applyDisplayRange"),
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
      name: i18next.t("models.cogStyling.displayRangeMin"),
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
      name: i18next.t("models.cogStyling.displayRangeMax"),
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
  private get clampLowSelectableDim():
    | SelectableDimensionCheckbox
    | undefined {
    const clampLow = this.item.renderOptions?.single?.clampLow ?? false;

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
    const clampHigh = this.item.renderOptions?.single?.clampHigh ?? false;

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
