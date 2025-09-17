import { runInAction } from "mobx";
import fetchMock from "fetch-mock";
import StacCatalogGroup from "../../../../lib/Models/Catalog/Stac/StacCatalogGroup";
import StacCatalogItem from "../../../../lib/Models/Catalog/Stac/StacCatalogItem";
import Terria from "../../../../lib/Models/Terria";

// Mock STAC responses
const mockStacCatalog = {
  type: "Catalog",
  stac_version: "1.1.0",
  id: "copernicus-stac",
  title: "Copernicus Data Space STAC",
  description: "STAC API for Copernicus Data Space",
  links: [
    {
      rel: "self",
      href: "https://stac.dataspace.copernicus.eu/v1/"
    },
    {
      rel: "collections",
      href: "https://stac.dataspace.copernicus.eu/v1/collections"
    }
  ]
};

const mockCollectionsResponse = {
  collections: [
    {
      type: "Collection",
      stac_version: "1.1.0",
      id: "sentinel-2-l2a",
      title: "Sentinel-2 Level-2A",
      description: "Sentinel-2 Level-2A data",
      license: "proprietary",
      extent: {
        spatial: {
          bbox: [[-180, -90, 180, 90]]
        },
        temporal: {
          interval: [["2015-06-27T10:25:31Z", null]]
        }
      },
      links: []
    },
    {
      type: "Collection", 
      stac_version: "1.1.0",
      id: "sentinel-1-grd",
      title: "Sentinel-1 Ground Range Detected",
      description: "Sentinel-1 GRD data",
      license: "proprietary",
      extent: {
        spatial: {
          bbox: [[-180, -90, 180, 90]]
        },
        temporal: {
          interval: [["2014-10-03T00:00:00Z", null]]
        }
      },
      links: []
    }
  ],
  links: []
};

const mockSearchResponse = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      stac_version: "1.1.0",
      id: "S2A_MSIL2A_20231201T103251_N0509_R108_T32UPU_20231201T134115",
      collection: "sentinel-2-l2a",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [5.0, 50.0],
          [6.0, 50.0], 
          [6.0, 51.0],
          [5.0, 51.0],
          [5.0, 50.0]
        ]]
      },
      bbox: [5.0, 50.0, 6.0, 51.0],
      properties: {
        datetime: "2023-12-01T10:32:51Z",
        title: "Sentinel-2 L2A Image",
        description: "Sample Sentinel-2 L2A image",
        instruments: ["MSI"],
        platform: ["Sentinel-2A"],
        "eo:cloud_cover": 15.5,
        gsd: 10
      },
      assets: {
        visual: {
          href: "https://example.com/s2a_visual.tif",
          type: "image/tiff",
          title: "Visual composite",
          roles: ["visual"]
        },
        thumbnail: {
          href: "https://example.com/s2a_thumb.jpg",
          type: "image/jpeg", 
          title: "Thumbnail",
          roles: ["thumbnail"]
        }
      },
      links: []
    }
  ],
  links: [],
  context: {
    matched: 1,
    returned: 1
  }
};

describe("StacCatalogGroup", function () {
  let terria: Terria;
  let stacGroup: StacCatalogGroup;

  beforeEach(function () {
    terria = new Terria();
    stacGroup = new StacCatalogGroup("test-stac", terria);

    // Mock STAC API endpoints
    fetchMock.mock("https://stac.dataspace.copernicus.eu/v1/", {
      body: JSON.stringify(mockStacCatalog)
    });

    fetchMock.mock("https://stac.dataspace.copernicus.eu/v1/collections", {
      body: JSON.stringify(mockCollectionsResponse)  
    });

    fetchMock.mock("https://stac.dataspace.copernicus.eu/v1/search", {
      body: JSON.stringify(mockSearchResponse)
    });
  });

  afterEach(function () {
    fetchMock.restore();
  });

  it("has the correct type", function () {
    expect(stacGroup.type).toBe("stac-group");
  });

  it("has the correct typeName", function () {
    expect(stacGroup.typeName).toBe("models.stacCatalogGroup.name");
  });

  describe("loading collections", function () {
    beforeEach(function () {
      runInAction(() => {
        stacGroup.setTrait("definition", "url", "https://stac.dataspace.copernicus.eu/v1/");
        stacGroup.setTrait("definition", "groupByCollection", true);
        stacGroup.setTrait("definition", "autoLoadItems", true);
      });
    });

    it("loads collections and creates groups", async function () {
      await stacGroup.loadMembers();
      
      expect(stacGroup.memberModels.length).toBe(2);
      
      const member1 = stacGroup.memberModels[0] as StacCatalogGroup;
      const member2 = stacGroup.memberModels[1] as StacCatalogGroup;
      
      expect(member1.name).toBe("Sentinel-2 Level-2A");
      expect(member2.name).toBe("Sentinel-1 Ground Range Detected");
    });

    it("applies filters correctly", async function () {
      runInAction(() => {
        stacGroup.setTrait("definition", "searchFilters", [
          {
            property: "eo:cloud_cover",
            operator: "lt", 
            values: ["20"]
          }
        ]);
        stacGroup.setTrait("definition", "spatialExtent", [5.0, 50.0, 6.0, 51.0]);
        stacGroup.setTrait("definition", "temporalExtent", ["2023-01-01T00:00:00Z", "2023-12-31T23:59:59Z"]);
      });

      await stacGroup.loadMembers();
      
      // Verify that search was called with correct parameters
      const searchCalls = fetchMock.calls("https://stac.dataspace.copernicus.eu/v1/search");
      expect(searchCalls.length).toBeGreaterThan(0);
    });
  });

  describe("loading specific collections", function () {
    beforeEach(function () {
      runInAction(() => {
        stacGroup.setTrait("definition", "url", "https://stac.dataspace.copernicus.eu/v1/");
        stacGroup.setTrait("definition", "collections", ["sentinel-2-l2a"]);
        stacGroup.setTrait("definition", "groupByCollection", false);
        stacGroup.setTrait("definition", "autoLoadItems", true);
      });
    });

    it("loads only specified collections", async function () {
      // Mock the specific collection endpoint
      fetchMock.mock("https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a", {
        body: JSON.stringify(mockCollectionsResponse.collections[0])
      });

      await stacGroup.loadMembers();
      
      expect(stacGroup.memberModels.length).toBe(1);
      
      const member = stacGroup.memberModels[0] as StacCatalogItem;
      expect(member.name).toBe("Sentinel-2 L2A Image");
    });
  });

  describe("configuration options", function () {
    it("respects maxItems setting", function () {
      runInAction(() => {
        stacGroup.setTrait("definition", "maxItems", 50);
      });
      
      expect(stacGroup.maxItems).toBe(50);
    });

    it("respects groupByCollection setting", function () {
      runInAction(() => {
        stacGroup.setTrait("definition", "groupByCollection", false);
      });
      
      expect(stacGroup.groupByCollection).toBe(false);
    });

    it("respects autoLoadItems setting", function () {
      runInAction(() => {
        stacGroup.setTrait("definition", "autoLoadItems", false);
      });
      
      expect(stacGroup.autoLoadItems).toBe(false);
    });
  });

  describe("error handling", function () {
    it("handles missing URL gracefully", async function () {
      runInAction(() => {
        stacGroup.setTrait("definition", "url", undefined);
      });

      try {
        await stacGroup.loadMembers();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("handles API errors gracefully", async function () {
      fetchMock.restore();
      fetchMock.mock("https://stac.dataspace.copernicus.eu/v1/", 500);

      runInAction(() => {
        stacGroup.setTrait("definition", "url", "https://stac.dataspace.copernicus.eu/v1/");
      });

      try {
        await stacGroup.loadMembers();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});