import { runInAction } from "mobx";
import type { WaterResolution } from "../../Core/WaterQuality";
import CogTimeSeriesCatalogItem from "../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../Models/Definition/CommonStrata";

/** Keep native filters, visible imagery and the shared Terria timeline together. */
export default function activateWaterQualityProduct(
  current: CogTimeSeriesCatalogItem,
  next: CogTimeSeriesCatalogItem,
  items: readonly CogTimeSeriesCatalogItem[],
  resolution: WaterResolution
) {
  runInAction(() => {
    const time = current.currentTime;
    items.forEach((candidate) =>
      candidate.setTrait(CommonStrata.user, "show", candidate === next)
    );
    next.setActiveResolution(CommonStrata.user, resolution);
    next.setActiveBand(
      CommonStrata.user,
      resolution === "annual" ? "mean" : "median"
    );
    if (time) next.setTrait(CommonStrata.user, "currentTime", time);
    const timeline = next.terria.timelineStack;
    // Remove an existing entry before adding it, preserving all other layers
    // and avoiding duplicates when switching back to a previous product.
    if (timeline.contains(next)) timeline.remove(next);
    timeline.addToTop(next);
  });
}
