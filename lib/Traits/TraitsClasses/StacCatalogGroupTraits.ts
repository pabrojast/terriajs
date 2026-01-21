import primitiveTrait from "../Decorators/primitiveTrait";
import { traitClass } from "../Trait";
import mixTraits from "../mixTraits";
import CatalogMemberTraits from "./CatalogMemberTraits";
import GroupTraits from "./GroupTraits";
import UrlTraits from "./UrlTraits";

@traitClass({
  description:
    "Creates a catalog group from a STAC Catalog or API root. Lists all collections as children.",
  example: {
    name: "Terrascope STAC",
    type: "stac-catalog",
    url: "https://stac.terrascope.be/"
  }
})
export default class StacCatalogGroupTraits extends mixTraits(
  UrlTraits,
  GroupTraits,
  CatalogMemberTraits
) {
  @primitiveTrait({
    type: "boolean",
    name: "Flatten",
    description:
      "If true, all collections will be shown as a flat list regardless of catalog hierarchy."
  })
  flatten?: boolean;

  @primitiveTrait({
    type: "string",
    name: "Collections Filter",
    description:
      "A comma-separated list of collection IDs to include. If not specified, all collections are shown."
  })
  collectionsFilter?: string;

  @primitiveTrait({
    type: "number",
    name: "Maximum Collections",
    description:
      "Maximum number of collections to fetch. Default is 100."
  })
  maximumCollections?: number;
}
