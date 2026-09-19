import i18next from "i18next";
import { action } from "mobx";
import { CogColorScaleOptionRenderer } from "../../../ReactViews/SelectableDimensions/CogColorScaleOptionRenderer";
import {
  CogRenderOptionsTraits,
  ColorScaleNames
} from "../../../Traits/TraitsClasses/CogCatalogItemTraits";
import Model from "../../Definition/Model";
import { SelectableDimensionEnum } from "../../SelectableDimensions/SelectableDimensions";
import { COG_COLOR_SCALE_NAMES } from "./CogColorScales";

/** Anything with COG render options: `cog` and `cog-time-series` items. */
export interface HasCogRenderOptions {
  renderOptions: Model<CogRenderOptionsTraits>;
}

/**
 * Palette selector with a swatch per option. Shared by the "Edit style"
 * workflow and the workbench card of COG time series, so both always offer the
 * same palettes and write the same traits.
 */
export function createCogColorScaleDimension(
  item: HasCogRenderOptions,
  overrides: Partial<SelectableDimensionEnum> = {}
): SelectableDimensionEnum {
  const single = item.renderOptions?.single;
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
        if (!item.renderOptions.single) {
          item.renderOptions.setTrait(stratumId, "single", undefined);
        }
        item.renderOptions.single!.setTrait(
          stratumId,
          "colorScale",
          value as ColorScaleNames | undefined
        );
        item.renderOptions.single!.setTrait(
          stratumId,
          "colorScaleMode",
          value === undefined ? "default" : "named"
        );
      }
    ),
    ...overrides
  };
}
