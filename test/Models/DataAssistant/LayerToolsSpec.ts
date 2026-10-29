import { runLayerTool } from "../../../lib/Models/DataAssistant/LayerTools";
import CogTimeSeriesCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../../lib/Models/Definition/updateModelFromJson";
import Terria from "../../../lib/Models/Terria";

describe("DataAssistant raster metadata", function () {
  it("distinguishes monthly composites from individual satellite acquisitions", async function () {
    const terria = new Terria();
    const item = new CogTimeSeriesCatalogItem("monthly-chl", terria);
    updateModelFromJson(item, CommonStrata.definition, {
      unit: "mg m-3",
      resolutions: [
        {
          id: "monthly",
          name: "Monthly",
          bands: [{ id: "median", name: "Median of satellite passes", band: 1 }]
        }
      ]
    }).throwIfError();
    spyOnProperty(terria.workbench, "items", "get").and.returnValue([item]);
    const result = await runLayerTool(
      terria,
      {
        id: "describe",
        name: "describe_source",
        arguments: { source_id: "layer:monthly-chl", operation: "rows" }
      },
      {},
      new AbortController().signal,
      () => {}
    );
    expect(result.method).toContain("Monthly");
    expect(result.method).toContain("Median of satellite passes");
    expect(result.method).toContain("not counts of satellite acquisitions");
    expect(result.units).toBe("mg m-3");
  });
});
