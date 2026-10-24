import type { FeatureCollection } from "geojson";
import { runInAction } from "mobx";
import GeoJsonCatalogItem from "../../Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import CommonStrata from "../../Models/Definition/CommonStrata";
import createStratumInstance from "../../Models/Definition/createStratumInstance";
import StyleTraits from "../../Traits/TraitsClasses/StyleTraits";

/** Derived boundaries are reconstructed from the pilot URL, never stored in a share. */
export default function configureWaterQualityOverlay(
  overlay: GeoJsonCatalogItem,
  geojson: FeatureCollection,
  pilotId: string | undefined,
  name: string
) {
  runInAction(() => {
    overlay.setTrait(CommonStrata.definition, "name", name);
    overlay.setTrait(
      CommonStrata.definition,
      "style",
      createStratumInstance(StyleTraits, {
        stroke: "#176f9e",
        "stroke-width": 1.5,
        fill: "#147ba8",
        "fill-opacity": 0.035
      })
    );
    overlay.setTrait(CommonStrata.definition, "geoJsonData", {
      type: "FeatureCollection",
      features: geojson.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          waterQualityBodyId: feature.properties?.id,
          waterQualityPilot: pilotId
        }
      }))
    } as never);
  });
}
