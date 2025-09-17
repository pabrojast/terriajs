import { runInAction } from "mobx";
import fetchMock from "fetch-mock";
import StacCatalogItem from "../../../../lib/Models/Catalog/Stac/StacCatalogItem";
import Terria from "../../../../lib/Models/Terria";

// Mock STAC item response
const mockStacItem = {
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
    description: "Sample Sentinel-2 L2A image for testing",
    instruments: ["MSI"],
    platform: ["Sentinel-2A"],
    "eo:cloud_cover": 15.5,
    gsd: 10,
    "eo:bands": [
      {
        name: "B04",
        common_name: "red",
        center_wavelength: 0.665
      },
      {
        name: "B03", 
        common_name: "green",
        center_wavelength: 0.560
      },
      {
        name: "B02",
        common_name: "blue",
        center_wavelength: 0.490
      }
    ]
  },
  assets: {
    visual: {
      href: "https://example.com/s2a_visual.tif",
      type: "image/tiff",
      title: "Visual composite",
      roles: ["visual"],
      "file:size": 123456789
    },
    thumbnail: {
      href: "https://example.com/s2a_thumb.jpg", 
      type: "image/jpeg",
      title: "Thumbnail",
      roles: ["thumbnail"],
      "file:size": 12345
    },
    data: {
      href: "https://example.com/s2a_data.tif",
      type: "image/tiff",
      title: "Raw data",
      roles: ["data"],
      "eo:bands": [0, 1, 2, 3],
      "file:size": 987654321
    }
  },
  links: [
    {
      rel: "self",
      href: "https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a/items/S2A_MSIL2A_20231201T103251_N0509_R108_T32UPU_20231201T134115"
    },
    {
      rel: "collection",
      href: "https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a"
    }
  ]
};

describe("StacCatalogItem", function () {
  let terria: Terria;
  let stacItem: StacCatalogItem;

  beforeEach(function () {
    terria = new Terria();
    stacItem = new StacCatalogItem("test-stac-item", terria);
  });

  afterEach(function () {
    fetchMock.restore();
  });

  it("has the correct type", function () {
    expect(stacItem.type).toBe("stac-item");
  });

  it("has the correct typeName", function () {
    expect(stacItem.typeName).toBe("models.stacCatalogItem.name");
  });

  describe("loading from direct URL", function () {
    beforeEach(function () {
      fetchMock.mock("https://example.com/stac-item.json", {
        body: JSON.stringify(mockStacItem)
      });

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://example.com/stac-item.json");
      });
    });

    it("loads STAC item metadata", async function () {
      await stacItem.loadMetadata();

      expect(stacItem.name).toBe("Sentinel-2 L2A Image");
      expect(stacItem.description).toBe("Sample Sentinel-2 L2A image for testing");
      expect(stacItem.datetime).toBe("2023-12-01T10:32:51Z");
      expect(stacItem.cloudCover).toBe(15.5);
      expect(stacItem.instruments).toEqual(["MSI"]);
      expect(stacItem.platform).toEqual(["Sentinel-2A"]);
      expect(stacItem.groundSampleDistance).toBe(10);
      expect(stacItem.bbox).toEqual([5.0, 50.0, 6.0, 51.0]);
    });

    it("loads assets correctly", async function () {
      await stacItem.loadMetadata();

      expect(stacItem.assets).toBeDefined();
      expect(stacItem.assets?.length).toBe(3);

      const visualAsset = stacItem.assets?.find(a => a.key === "visual");
      expect(visualAsset?.title).toBe("Visual composite");
      expect(visualAsset?.mediaType).toBe("image/tiff");
      expect(visualAsset?.roles).toEqual(["visual"]);
      expect(visualAsset?.url).toBe("https://example.com/s2a_visual.tif");
    });

    it("auto-selects preferred asset", async function () {
      await stacItem.loadMetadata();

      // Should auto-select "visual" asset as it's preferred
      expect(stacItem.selectedAssetKey).toBe("visual");
      expect(stacItem.selectedAsset?.key).toBe("visual");
    });
  });

  describe("loading from API with collection and item ID", function () {
    beforeEach(function () {
      const collectionId = "sentinel-2-l2a";
      const itemId = "S2A_MSIL2A_20231201T103251_N0509_R108_T32UPU_20231201T134115";
      
      fetchMock.mock(
        `https://stac.dataspace.copernicus.eu/v1/collections/${collectionId}/items/${itemId}`,
        { body: JSON.stringify(mockStacItem) }
      );

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://stac.dataspace.copernicus.eu/v1/");
        stacItem.setTrait("definition", "collectionId", collectionId);
        stacItem.setTrait("definition", "stacItemId", itemId);
      });
    });

    it("loads item from STAC API", async function () {
      await stacItem.loadMetadata();

      expect(stacItem.name).toBe("Sentinel-2 L2A Image");
      expect(stacItem.stacItemId).toBe("S2A_MSIL2A_20231201T103251_N0509_R108_T32UPU_20231201T134115");
      expect(stacItem.collectionId).toBe("sentinel-2-l2a");
    });
  });

  describe("asset selection", function () {
    beforeEach(function () {
      fetchMock.mock("https://example.com/stac-item.json", {
        body: JSON.stringify(mockStacItem)
      });

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://example.com/stac-item.json");
      });
    });

    it("allows manual asset selection", async function () {
      await stacItem.loadMetadata();

      stacItem.selectAsset("data");
      
      expect(stacItem.selectedAssetKey).toBe("data");
      expect(stacItem.selectedAsset?.key).toBe("data");
    });

    it("respects preferred asset types", async function () {
      runInAction(() => {
        stacItem.setTrait("definition", "preferredAssetTypes", ["data", "visual"]);
      });

      await stacItem.loadMetadata();

      // Should prefer "data" over "visual" based on order
      expect(stacItem.selectedAssetKey).toBe("data");
    });
  });

  describe("bands information", function () {
    beforeEach(function () {
      fetchMock.mock("https://example.com/stac-item.json", {
        body: JSON.stringify(mockStacItem)
      });

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://example.com/stac-item.json");
      });
    });

    it("loads band information from STAC item", async function () {
      await stacItem.loadMetadata();

      expect(stacItem.bands).toBeDefined();
      expect(stacItem.bands?.length).toBe(3);

      const redBand = stacItem.bands?.find(b => b.commonName === "red");
      expect(redBand?.name).toBe("B04");
      expect(redBand?.centerWavelength).toBe(0.665);
    });
  });

  describe("short report", function () {
    beforeEach(function () {
      fetchMock.mock("https://example.com/stac-item.json", {
        body: JSON.stringify(mockStacItem)
      });

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://example.com/stac-item.json");
      });
    });

    it("generates informative short report", async function () {
      await stacItem.loadMetadata();

      const report = stacItem.shortReport;
      
      expect(report).toContain("Date/Time");
      expect(report).toContain("2023-12-01T10:32:51Z");
      expect(report).toContain("Cloud Cover");
      expect(report).toContain("15.5%");
      expect(report).toContain("Instruments");
      expect(report).toContain("MSI");
      expect(report).toContain("Platform");
      expect(report).toContain("Sentinel-2A");
      expect(report).toContain("Ground Sample Distance");
      expect(report).toContain("10m");
      expect(report).toContain("Selected Asset");
      expect(report).toContain("Visual composite");
    });
  });

  describe("authentication", function () {
    it("includes auth token in requests", async function () {
      fetchMock.mock("https://example.com/protected-item.json", {
        body: JSON.stringify(mockStacItem)
      });

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://example.com/protected-item.json");
        stacItem.setTrait("definition", "authToken", "test-token-123");
      });

      await stacItem.loadMetadata();

      const calls = fetchMock.calls("https://example.com/protected-item.json");
      expect(calls.length).toBe(1);
      
      const requestHeaders = calls[0][1]?.headers as Record<string, string>;
      expect(requestHeaders?.Authorization).toBe("Bearer test-token-123");
    });
  });

  describe("error handling", function () {
    it("handles missing URL gracefully", async function () {
      try {
        await stacItem.loadMetadata();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("handles HTTP errors gracefully", async function () {
      fetchMock.mock("https://example.com/invalid-item.json", 404);

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://example.com/invalid-item.json");
      });

      try {
        await stacItem.loadMetadata();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("handles invalid JSON gracefully", async function () {
      fetchMock.mock("https://example.com/malformed-item.json", {
        body: "invalid json"
      });

      runInAction(() => {
        stacItem.setTrait("definition", "url", "https://example.com/malformed-item.json");
      });

      try {
        await stacItem.loadMetadata();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});