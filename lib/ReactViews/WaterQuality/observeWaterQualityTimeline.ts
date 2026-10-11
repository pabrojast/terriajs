import { reaction, runInAction } from "mobx";
import CogTimeSeriesCatalogItem from "../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";

/** Repair pilot timeline order after init/share restores workbench order. */
export default function observeWaterQualityTimeline(
  item: CogTimeSeriesCatalogItem
) {
  const timeline = item.terria.timelineStack;
  return reaction(
    () => ({ visible: item.show, top: timeline.top }),
    ({ visible, top }) => {
      if (
        !visible ||
        !item.waterQuality?.pilotId ||
        top === item ||
        !(top instanceof CogTimeSeriesCatalogItem) ||
        top.waterQuality?.pilotId !== item.waterQuality.pilotId
      )
        return;
      runInAction(() => {
        if (timeline.contains(item)) timeline.remove(item);
        timeline.addToTop(item);
      });
    },
    { fireImmediately: true }
  );
}
