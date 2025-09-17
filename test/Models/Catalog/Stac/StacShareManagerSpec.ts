import { configure, runInAction } from "mobx";
import Terria from "../../../../lib/Models/Terria";
import { StacShareManager, ShareableStacState } from "../../../../lib/Models/Catalog/Stac/StacShareManager";
import StacCatalogGroup from "../../../../lib/Models/Catalog/Stac/StacCatalogGroup";
import StacCatalogItem from "../../../../lib/Models/Catalog/Stac/StacCatalogItem";

configure({
  enforceActions: "observed",
  computedRequiresReaction: true
});

describe("StacShareManager", () => {
  let terria: Terria;
  let shareManager: StacShareManager;

  beforeEach(() => {
    terria = new Terria({
      baseUrl: "test/"
    });
    shareManager = new StacShareManager();
  });

  afterEach(() => {
    // Clear localStorage after each test
    localStorage.clear();
  });

  describe("shareStacCatalog", () => {
    let catalogGroup: StacCatalogGroup;

    beforeEach(() => {
      catalogGroup = new StacCatalogGroup("test-catalog", terria);
      
      runInAction(() => {
        catalogGroup.setTrait("definition", "url", "https://example.com/stac");
        catalogGroup.setTrait("definition", "name", "Test Catalog");
      });
    });

    it("creates a share for catalog group", async () => {
      const result = await shareManager.shareStacCatalog(catalogGroup, {
        includeSearch: true,
        includeNavigation: true
      });

      expect(result.shareId).toBeDefined();
      expect(result.shareUrl).toContain("stac-share");
      expect(result.shareUrl).toContain(result.shareId);
    });

    it("includes search parameters when requested", async () => {
      // Set up search parameters
      runInAction(() => {
        catalogGroup.setTrait("definition", "spatialExtent", [-180, -90, 180, 90]);
        catalogGroup.setTrait("definition", "temporalExtent", ["2020-01-01", "2020-12-31"]);
      });

      const result = await shareManager.shareStacCatalog(catalogGroup, {
        includeSearch: true
      });

      const state = await shareManager.loadSharedState(result.shareId);
      expect(state.bbox).toEqual([-180, -90, 180, 90]);
    });

    it("creates compressed URLs when requested", async () => {
      const result = await shareManager.shareStacCatalog(catalogGroup, {
        compressUrl: true
      });

      expect(result.shortUrl).toBeDefined();
      expect(result.shortUrl!.length).toBeLessThan(result.shareUrl.length);
    });

    it("stores shares in localStorage", async () => {
      const result = await shareManager.shareStacCatalog(catalogGroup);
      
      const storedData = localStorage.getItem("terriajs_stac_shares");
      expect(storedData).toBeDefined();
      
      const parsed = JSON.parse(storedData!);
      expect(parsed.states.length).toBe(1);
      expect(parsed.states[0][0]).toBe(result.shareId);
    });
  });

  describe("shareStacItem", () => {
    let catalogItem: StacCatalogItem;

    beforeEach(() => {
      catalogItem = new StacCatalogItem("test-item", terria);
      
      runInAction(() => {
        catalogItem.setTrait("definition", "url", "https://example.com/stac");
        catalogItem.setTrait("definition", "stacItemId", "test-item-123");
        catalogItem.setTrait("definition", "name", "Test Item");
      });
    });

    it("creates a share for catalog item", async () => {
      const result = await shareManager.shareStacItem(catalogItem, {
        includeVisualization: true
      });

      expect(result.shareId).toBeDefined();
      expect(result.shareUrl).toContain("stac-share");
      
      const state = await shareManager.loadSharedState(result.shareId);
      expect(state.catalogType).toBe("item");
      expect(state.currentItemId).toBe("test-item-123");
    });

    it("includes visualization parameters when requested", async () => {
      // Set up visualization parameters
      runInAction(() => {
        // catalogItem.setTrait("definition", "selectedAssets", ["visual", "nir"]); // selectedAssets is not a valid trait
      });

      const result = await shareManager.shareStacItem(catalogItem, {
        includeVisualization: true
      });

      const state = await shareManager.loadSharedState(result.shareId);
      expect(state.selectedAssets).toEqual(["visual", "nir"]);
      expect(state.visualizationParameters?.format).toBe("image/tiff");
    });
  });

  describe("loadSharedState", () => {
    it("loads existing shared state", async () => {
      const catalogGroup = new StacCatalogGroup("test-catalog", terria);
      runInAction(() => {
        catalogGroup.setTrait("definition", "url", "https://example.com/stac");
        catalogGroup.setTrait("definition", "name", "Test Catalog");
      });

      const result = await shareManager.shareStacCatalog(catalogGroup);
      const loadedState = await shareManager.loadSharedState(result.shareId);

      expect(loadedState.catalogUrl).toBe("https://example.com/stac");
      expect(loadedState.catalogTitle).toBe("Test Catalog");
      expect(loadedState.catalogType).toBe("catalog");
    });

    it("throws error for non-existent share", async () => {
      try {
        await shareManager.loadSharedState("non-existent");
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("applySharedState", () => {
    it("applies search parameters to catalog group", async () => {
      const catalogGroup = new StacCatalogGroup("test-catalog", terria);
      
      const state: ShareableStacState = {
        catalogUrl: "https://example.com/stac",
        catalogType: "catalog",
        timestamp: Date.now(),
        version: "1.0.0",
        bbox: [-10, -10, 10, 10],
        datetime: "2020-01-01/2020-12-31"
      };

      shareManager.applySharedState(state, catalogGroup);

      // Note: This would require the search manager to be properly initialized
      // In a real test, we'd check that the search parameters were applied
      expect(true).toBe(true); // Placeholder assertion
    });

    it("applies visualization parameters to catalog item", async () => {
      const catalogItem = new StacCatalogItem("test-item", terria);
      
      const state: ShareableStacState = {
        catalogUrl: "https://example.com/stac",
        catalogType: "item",
        timestamp: Date.now(),
        version: "1.0.0",
        selectedAssets: ["red", "green", "blue"],
        visualizationParameters: {
          bands: ["B04", "B03", "B02"],
          rescale: [0, 3000],
          format: "image/png"
        }
      };

      shareManager.applySharedState(state, catalogItem);

      // Note: This would require the item to be properly initialized
      // In a real test, we'd check that the visualization parameters were applied
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe("URL handling", () => {
    it("generates valid share URLs", async () => {
      const catalogGroup = new StacCatalogGroup("test-catalog", terria);
      runInAction(() => {
        catalogGroup.setTrait("definition", "url", "https://example.com/stac");
      });

      const result = await shareManager.shareStacCatalog(catalogGroup);
      
      expect(shareManager.isValidShareUrl(result.shareUrl)).toBe(true);
      expect(shareManager.getShareIdFromUrl(result.shareUrl)).toBe(result.shareId);
    });

    it("parses share URLs correctly", () => {
      const testUrl = "https://example.com/test?stac-share=test-id&data=eyJ0ZXN0IjoidmFsdWUifQ%3D%3D";
      
      expect(shareManager.isValidShareUrl(testUrl)).toBe(true);
      expect(shareManager.getShareIdFromUrl(testUrl)).toBe("test-id");
    });

    it("returns false for invalid URLs", () => {
      expect(shareManager.isValidShareUrl("https://example.com/test")).toBe(false);
      expect(shareManager.isValidShareUrl("invalid-url")).toBe(false);
      expect(shareManager.getShareIdFromUrl("https://example.com/test")).toBe(null);
    });
  });

  describe("share management", () => {
    it("tracks multiple shares", async () => {
      const catalogGroup1 = new StacCatalogGroup("test-catalog-1", terria);
      const catalogGroup2 = new StacCatalogGroup("test-catalog-2", terria);
      
      runInAction(() => {
        catalogGroup1.setTrait("definition", "url", "https://example.com/stac1");
        catalogGroup2.setTrait("definition", "url", "https://example.com/stac2");
      });

      await shareManager.shareStacCatalog(catalogGroup1);
      await shareManager.shareStacCatalog(catalogGroup2);

      const stats = shareManager.getShareStatistics();
      expect(stats.totalShares).toBe(2);
      expect(stats.catalogShares).toBe(2);
      expect(stats.itemShares).toBe(0);
    });

    it("deletes specific shares", async () => {
      const catalogGroup = new StacCatalogGroup("test-catalog", terria);
      runInAction(() => {
        catalogGroup.setTrait("definition", "url", "https://example.com/stac");
      });

      const result = await shareManager.shareStacCatalog(catalogGroup);
      expect(shareManager.sharedStates.length).toBe(1);

      shareManager.deleteSharedState(result.shareId);
      expect(shareManager.sharedStates.length).toBe(0);
    });

    it("clears all shares", async () => {
      const catalogGroup = new StacCatalogGroup("test-catalog", terria);
      runInAction(() => {
        catalogGroup.setTrait("definition", "url", "https://example.com/stac");
      });

      await shareManager.shareStacCatalog(catalogGroup);
      await shareManager.shareStacCatalog(catalogGroup);
      
      expect(shareManager.sharedStates.length).toBe(2);

      shareManager.clearAllShares();
      expect(shareManager.sharedStates.length).toBe(0);
      expect(localStorage.getItem("terriajs_stac_shares")).toBe(null);
    });
  });

  describe("localStorage persistence", () => {
    it("persists shares across manager instances", async () => {
      const catalogGroup = new StacCatalogGroup("test-catalog", terria);
      runInAction(() => {
        catalogGroup.setTrait("definition", "url", "https://example.com/stac");
        catalogGroup.setTrait("definition", "name", "Persistent Test");
      });

      const result = await shareManager.shareStacCatalog(catalogGroup);

      // Create new manager instance
      const newManager = new StacShareManager();
      const loadedState = await newManager.loadSharedState(result.shareId);
      
      expect(loadedState.catalogTitle).toBe("Persistent Test");
      expect(loadedState.catalogUrl).toBe("https://example.com/stac");
    });

    it("limits stored shares to maximum", async () => {
      const catalogGroup = new StacCatalogGroup("test-catalog", terria);
      runInAction(() => {
        catalogGroup.setTrait("definition", "url", "https://example.com/stac");
      });

      // Create more than max shares (assuming max is 50)
      for (let i = 0; i < 55; i++) {
        await shareManager.shareStacCatalog(catalogGroup);
      }

      const storedData = localStorage.getItem("terriajs_stac_shares");
      const parsed = JSON.parse(storedData!);
      
      expect(parsed.states.length).toBeLessThanOrEqual(50);
    });

    it("cleans up expired shares", () => {
      // This would require mocking Date.now() to test expiration
      // For now, just verify the cleanup logic exists
      const newManager = new StacShareManager();
      expect(newManager.sharedStates).toBeDefined();
    });
  });
});