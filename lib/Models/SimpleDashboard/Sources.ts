import getDereferencedIfExists from "../../Core/getDereferencedIfExists";
import CatalogMemberMixin from "../../ModelMixins/CatalogMemberMixin";
import TableMixin from "../../ModelMixins/TableMixin";
import GeoJsonMixin from "../../ModelMixins/GeojsonMixin";
import CogTimeSeriesCatalogItem from "../Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CogCatalogItem from "../Catalog/CatalogItems/CogCatalogItem";
import type Terria from "../Terria";
import { DashboardSource } from "./Types";
export function dashboardSources(terria: Terria): DashboardSource[] {
  return terria.workbench.items
    .map(getDereferencedIfExists)
    .flatMap((item, i) => {
      if (!CatalogMemberMixin.isMixedInto(item)) return [];
      const common = {
        id: `source-${i}`,
        name: item.name || item.uniqueId || "Data",
        local_id: "layer:" + item.uniqueId,
        resource_id: item.ckanResourceId
      };
      if (
        item instanceof CogTimeSeriesCatalogItem &&
        item.waterQuality?.dataUrl
      )
        return [
          {
            ...common,
            kind: "water",
            resource_id: undefined,
            catalog_url: item.waterQuality.dataUrl,
            product: item.waterQuality.product,
            resolution: "monthly"
          } as DashboardSource
        ];
      if (
        item instanceof CogTimeSeriesCatalogItem ||
        item instanceof CogCatalogItem
      )
        return [{ ...common, kind: "cog" } as DashboardSource];
      if (GeoJsonMixin.isMixedInto(item))
        return [{ ...common, kind: "geojson" } as DashboardSource];
      if (TableMixin.isMixedInto(item))
        return [{ ...common, kind: "table" } as DashboardSource];
      return [];
    });
}
