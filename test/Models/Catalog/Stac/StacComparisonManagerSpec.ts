import { configure, runInAction } from "mobx";
import Terria from "../../../../lib/Models/Terria";
import { StacComparisonManager } from "../../../../lib/Models/Catalog/Stac/StacComparisonManager";
import StacCatalogItem from "../../../../lib/Models/Catalog/Stac/StacCatalogItem";

configure({
  enforceActions: "observed",
  computedRequiresReaction: true
});

describe("StacComparisonManager", () => {
  let terria: Terria;
  let comparisonManager: StacComparisonManager;
  let leftItem: StacCatalogItem;
  let rightItem: StacCatalogItem;

  beforeEach(() => {
    terria = new Terria({
      baseUrl: "test/"
    });
    comparisonManager = new StacComparisonManager();

    // Create test items
    leftItem = new StacCatalogItem("left-item", terria);
    rightItem = new StacCatalogItem("right-item", terria);
    
    runInAction(() => {
      leftItem.setTrait("definition", "url", "https://example.com/stac");
      leftItem.setTrait("definition", "stacItemId", "item-1");
      leftItem.setTrait("definition", "name", "Left Test Item");
      
      rightItem.setTrait("definition", "url", "https://example.com/stac");
      rightItem.setTrait("definition", "stacItemId", "item-2");
      rightItem.setTrait("definition", "name", "Right Test Item");
    });
  });

  describe("comparison lifecycle", () => {
    it("starts comparison between two items", () => {
      expect(comparisonManager.isComparisonActive).toBe(false);
      
      comparisonManager.startComparison(leftItem, rightItem, "side-by-side");
      
      expect(comparisonManager.isComparisonActive).toBe(true);
      expect(comparisonManager.currentComparison?.leftItem).toBe(leftItem);
      expect(comparisonManager.currentComparison?.rightItem).toBe(rightItem);
      expect(comparisonManager.currentComparison?.method).toBe("side-by-side");
    });

    it("prevents comparison of same item", () => {
      expect(() => {
        comparisonManager.startComparison(leftItem, leftItem, "side-by-side");
      }).toThrowError();
    });

    it("stops comparison", () => {
      comparisonManager.startComparison(leftItem, rightItem);
      expect(comparisonManager.isComparisonActive).toBe(true);
      
      comparisonManager.stopComparison();
      expect(comparisonManager.isComparisonActive).toBe(false);
      expect(comparisonManager.currentComparison).toBeUndefined();
    });

    it("tracks comparison history", () => {
      comparisonManager.startComparison(leftItem, rightItem);
      expect(comparisonManager.comparisonHistory.length).toBe(1);
      
      comparisonManager.stopComparison();
      comparisonManager.startComparison(rightItem, leftItem);
      expect(comparisonManager.comparisonHistory.length).toBe(2);
    });
  });

  describe("comparison controls", () => {
    beforeEach(() => {
      comparisonManager.startComparison(leftItem, rightItem);
    });

    it("updates comparison method", () => {
      comparisonManager.updateComparisonMethod("swipe");
      expect(comparisonManager.currentComparison?.method).toBe("swipe");
    });

    it("updates opacity", () => {
      comparisonManager.updateOpacity("left", 0.5);
      expect(comparisonManager.currentComparison?.opacity.left).toBe(0.5);
      
      comparisonManager.updateOpacity("right", 0.8);
      expect(comparisonManager.currentComparison?.opacity.right).toBe(0.8);
    });

    it("clamps opacity values", () => {
      comparisonManager.updateOpacity("left", -0.1);
      expect(comparisonManager.currentComparison?.opacity.left).toBe(0);
      
      comparisonManager.updateOpacity("left", 1.5);
      expect(comparisonManager.currentComparison?.opacity.left).toBe(1);
    });

    it("updates swipe position", () => {
      comparisonManager.updateComparisonMethod("swipe");
      comparisonManager.updateSwipePosition(0.3);
      expect(comparisonManager.currentComparison?.swipePosition).toBe(0.3);
    });

    it("clamps swipe position", () => {
      comparisonManager.updateComparisonMethod("swipe");
      
      comparisonManager.updateSwipePosition(-0.1);
      expect(comparisonManager.currentComparison?.swipePosition).toBe(0);
      
      comparisonManager.updateSwipePosition(1.5);
      expect(comparisonManager.currentComparison?.swipePosition).toBe(1);
    });

    it("toggles synchronization options", () => {
      expect(comparisonManager.currentComparison?.synchronizeView).toBe(true);
      expect(comparisonManager.currentComparison?.synchronizeTime).toBe(false);
      
      comparisonManager.toggleSynchronization("view");
      expect(comparisonManager.currentComparison?.synchronizeView).toBe(false);
      
      comparisonManager.toggleSynchronization("time");
      expect(comparisonManager.currentComparison?.synchronizeTime).toBe(true);
    });
  });

  describe("analysis functionality", () => {
    beforeEach(() => {
      comparisonManager.startComparison(leftItem, rightItem);
    });

    it("performs analysis when comparison starts", async () => {
      // Wait for analysis to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(comparisonManager.analysisResults).toBeDefined();
      expect(comparisonManager.analysisResults?.spatialOverlap).toBeDefined();
      expect(comparisonManager.analysisResults?.temporalRelation).toBeDefined();
      expect(comparisonManager.analysisResults?.assetComparison).toBeDefined();
      expect(comparisonManager.analysisResults?.qualityMetrics).toBeDefined();
    });

    it("generates comparison summary", async () => {
      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const summary = comparisonManager.getComparisonSummary();
      expect(summary).toBeTruthy();
      expect(summary).toContain("spatial overlap");
    });

    it("provides quality recommendations", async () => {
      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const recommendation = comparisonManager.getQualityRecommendation();
      expect(typeof recommendation).toBe("string");
    });
  });

  describe("change detection", () => {
    beforeEach(() => {
      comparisonManager.startComparison(leftItem, rightItem);
    });

    it("performs change detection", async () => {
      const results = await comparisonManager.performChangeDetection("ndvi", 0.1);
      
      expect(Array.isArray(results)).toBe(true);
      expect(comparisonManager.changeDetectionResults.length).toBe(results.length);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.changeType).toMatch(/increase|decrease|no-change|new|removed/);
        expect(typeof result.magnitude).toBe("number");
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.location.lat).toBeDefined();
        expect(result.location.lon).toBeDefined();
      }
    });

    it("throws error when no comparison active", async () => {
      comparisonManager.stopComparison();
      
      try {
        await comparisonManager.performChangeDetection();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("supports different change detection methods", async () => {
      const ndviResults = await comparisonManager.performChangeDetection("ndvi");
      const ndwiResults = await comparisonManager.performChangeDetection("ndwi");
      
      expect(Array.isArray(ndviResults)).toBe(true);
      expect(Array.isArray(ndwiResults)).toBe(true);
    });
  });

  describe("difference visualization", () => {
    beforeEach(() => {
      comparisonManager.startComparison(leftItem, rightItem);
    });

    it("creates difference visualization", () => {
      comparisonManager.createDifferenceVisualization("visual", "red", "ndvi", "RdYlBu");
      
      const viz = comparisonManager.differenceVisualization;
      expect(viz).toBeDefined();
      expect(viz?.asset).toBe("visual");
      expect(viz?.band).toBe("red");
      expect(viz?.method).toBe("ndvi");
      expect(viz?.colorMap).toBe("RdYlBu");
      expect(viz?.statistics).toBeDefined();
    });

    it("includes statistical information", () => {
      comparisonManager.createDifferenceVisualization("visual", "red");
      
      const viz = comparisonManager.differenceVisualization;
      expect(typeof viz?.statistics.min).toBe("number");
      expect(typeof viz?.statistics.max).toBe("number");
      expect(typeof viz?.statistics.mean).toBe("number");
      expect(typeof viz?.statistics.stdDev).toBe("number");
      expect(Array.isArray(viz?.statistics.histogram)).toBe(true);
    });
  });

  describe("report generation", () => {
    beforeEach(async () => {
      comparisonManager.startComparison(leftItem, rightItem);
      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it("exports comparison report", () => {
      const report = comparisonManager.exportComparisonReport();
      
      expect(report).toContain("# STAC Comparison Report");
      expect(report).toContain("Left Test Item");
      expect(report).toContain("Right Test Item");
      expect(report).toContain("## Spatial Analysis");
      expect(report).toContain("## Temporal Analysis");
      expect(report).toContain("## Asset Comparison");
      expect(report).toContain("## Quality Metrics");
    });

    it("includes change detection results in report", async () => {
      await comparisonManager.performChangeDetection();
      const report = comparisonManager.exportComparisonReport();
      
      expect(report).toContain("## Change Detection Results");
    });

    it("handles empty comparison", () => {
      comparisonManager.stopComparison();
      const report = comparisonManager.exportComparisonReport();
      
      expect(report).toBe("No comparison data available");
    });
  });

  describe("spatial analysis", () => {
    it("calculates spatial overlap correctly", async () => {
      // Create items with known bounding boxes
      const item1 = new StacCatalogItem("item1", terria);
      const item2 = new StacCatalogItem("item2", terria);
      
      // Mock STAC item data with specific bounding boxes
      spyOn(comparisonManager as any, "getStacItemData").and.callFake((item: any) => {
        if (item === item1) {
          return Promise.resolve({
            bbox: [0, 0, 10, 10], // 100 square units
            properties: { datetime: "2020-01-01T00:00:00Z" },
            assets: {},
            geometry: null,
            type: "Feature",
            id: "item1",
            collection: "test"
          });
        } else {
          return Promise.resolve({
            bbox: [5, 5, 15, 15], // 100 square units, 25 square units overlap
            properties: { datetime: "2020-01-02T00:00:00Z" },
            assets: {},
            geometry: null,
            type: "Feature",
            id: "item2",
            collection: "test"
          });
        }
      });

      comparisonManager.startComparison(item1, item2);
      
      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const results = comparisonManager.analysisResults;
      expect(results?.spatialOverlap.intersectionArea).toBe(25);
      expect(results?.spatialOverlap.overlapPercentage).toBeCloseTo(14.29, 1); // 25/(100+100-25)*100
    });
  });

  describe("temporal analysis", () => {
    it("calculates temporal relationships correctly", async () => {
      const item1 = new StacCatalogItem("item1", terria);
      const item2 = new StacCatalogItem("item2", terria);
      
      spyOn(comparisonManager as any, "getStacItemData").and.callFake((item: any) => {
        if (item === item1) {
          return Promise.resolve({
            bbox: [0, 0, 10, 10],
            properties: { datetime: "2020-01-01T00:00:00Z" },
            assets: {},
            geometry: null,
            type: "Feature",
            id: "item1",
            collection: "test"
          });
        } else {
          return Promise.resolve({
            bbox: [0, 0, 10, 10],
            properties: { datetime: "2020-01-02T00:00:00Z" },
            assets: {},
            geometry: null,
            type: "Feature",
            id: "item2",
            collection: "test"
          });
        }
      });

      comparisonManager.startComparison(item1, item2);
      
      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const results = comparisonManager.analysisResults;
      expect(results?.temporalRelation.relation).toBe("before"); // item1 is before item2
      expect(results?.temporalRelation.timeDifference).toBe(24 * 60 * 60 * 1000); // 1 day in ms
    });
  });

  describe("asset analysis", () => {
    it("compares assets correctly", async () => {
      const item1 = new StacCatalogItem("item1", terria);
      const item2 = new StacCatalogItem("item2", terria);
      
      spyOn(comparisonManager as any, "getStacItemData").and.callFake((item: any) => {
        if (item === item1) {
          return Promise.resolve({
            bbox: [0, 0, 10, 10],
            properties: { datetime: "2020-01-01T00:00:00Z" },
            assets: {
              "visual": {},
              "nir": {},
              "metadata": {}
            },
            geometry: null,
            type: "Feature",
            id: "item1",
            collection: "test"
          });
        } else {
          return Promise.resolve({
            bbox: [0, 0, 10, 10],
            properties: { datetime: "2020-01-02T00:00:00Z" },
            assets: {
              "visual": {},
              "thermal": {},
              "metadata": {}
            },
            geometry: null,
            type: "Feature",
            id: "item2",
            collection: "test"
          });
        }
      });

      comparisonManager.startComparison(item1, item2);
      
      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const results = comparisonManager.analysisResults;
      expect(results?.assetComparison.commonAssets).toEqual(["visual", "metadata"]);
      expect(results?.assetComparison.leftOnlyAssets).toEqual(["nir"]);
      expect(results?.assetComparison.rightOnlyAssets).toEqual(["thermal"]);
    });
  });
});