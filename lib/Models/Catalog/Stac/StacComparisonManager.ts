/**
 * STAC Comparison Manager
 * 
 * Enables side-by-side comparison of STAC items, including temporal analysis,
 * change detection, and difference visualization
 */

import { action, computed, makeObservable, observable } from "mobx";
import i18next from "i18next";
import TerriaError from "../../../Core/TerriaError";
import StacCatalogItem from "./StacCatalogItem";
import { StacItem } from "./StacApiHelpers";

export type ComparisonMethod = "side-by-side" | "swipe" | "difference" | "change-detection";

export interface ComparisonState {
  leftItem: StacCatalogItem;
  rightItem: StacCatalogItem;
  method: ComparisonMethod;
  isActive: boolean;
  synchronizeView: boolean;
  synchronizeTime: boolean;
  opacity: {
    left: number;
    right: number;
  };
  swipePosition?: number; // 0-1, position of swipe divider
}

export interface ComparisonAnalysis {
  // Metadata comparison
  spatialOverlap: {
    intersectionArea: number;
    leftOnlyArea: number;
    rightOnlyArea: number;
    overlapPercentage: number;
  };
  
  temporalRelation: {
    timeDifference: number; // milliseconds
    relation: "before" | "after" | "same" | "overlapping";
  };
  
  // Asset comparison
  assetComparison: {
    commonAssets: string[];
    leftOnlyAssets: string[];
    rightOnlyAssets: string[];
    bandComparison: BandComparisonResult[];
  };
  
  // Quality metrics
  qualityMetrics: {
    cloudCover: {
      left: number | null;
      right: number | null;
      difference: number | null;
    };
    resolution: {
      left: number | null;
      right: number | null;
      difference: number | null;
    };
    quality: {
      left: string | null;
      right: string | null;
    };
  };
}

export interface BandComparisonResult {
  bandName: string;
  available: {
    left: boolean;
    right: boolean;
  };
  wavelength: {
    left: number | null;
    right: number | null;
    difference: number | null;
  };
  resolution: {
    left: number | null;
    right: number | null;
    difference: number | null;
  };
}

export interface ChangeDetectionResult {
  changeType: "increase" | "decrease" | "no-change" | "new" | "removed";
  magnitude: number;
  confidence: number;
  timestamp: Date;
  location: {
    lat: number;
    lon: number;
  };
  metadata: Record<string, any>;
}

export interface DifferenceVisualization {
  asset: string;
  band: string;
  method: "ndvi" | "ndwi" | "rgb" | "thermal" | "custom";
  threshold: number;
  colorMap: string;
  statistics: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    histogram: number[];
  };
}

export class StacComparisonManager {
  @observable
  private _currentComparison?: ComparisonState;

  @observable
  private _comparisonHistory: ComparisonState[] = [];

  @observable
  private _analysisResults?: ComparisonAnalysis;

  @observable
  private _isAnalyzing: boolean = false;

  @observable
  private _changeDetectionResults: ChangeDetectionResult[] = [];

  @observable
  private _differenceVisualization?: DifferenceVisualization;

  constructor() {
    makeObservable(this);
  }

  @computed
  get currentComparison(): ComparisonState | undefined {
    return this._currentComparison;
  }

  @computed
  get comparisonHistory(): ComparisonState[] {
    return [...this._comparisonHistory];
  }

  @computed
  get analysisResults(): ComparisonAnalysis | undefined {
    return this._analysisResults;
  }

  @computed
  get isAnalyzing(): boolean {
    return this._isAnalyzing;
  }

  @computed
  get changeDetectionResults(): ChangeDetectionResult[] {
    return [...this._changeDetectionResults];
  }

  @computed
  get differenceVisualization(): DifferenceVisualization | undefined {
    return this._differenceVisualization;
  }

  @computed
  get isComparisonActive(): boolean {
    return this._currentComparison?.isActive || false;
  }

  @action
  startComparison(
    leftItem: StacCatalogItem,
    rightItem: StacCatalogItem,
    method: ComparisonMethod = "side-by-side"
  ): void {
    if (leftItem === rightItem) {
      throw new TerriaError({
        title: i18next.t("models.stacComparison.sameItemError"),
        message: i18next.t("models.stacComparison.sameItemErrorMessage")
      });
    }

    this._currentComparison = {
      leftItem,
      rightItem,
      method,
      isActive: true,
      synchronizeView: true,
      synchronizeTime: false,
      opacity: {
        left: 1.0,
        right: 1.0
      },
      swipePosition: 0.5
    };

    // Add to history
    this._comparisonHistory.unshift({ ...this._currentComparison });
    if (this._comparisonHistory.length > 10) {
      this._comparisonHistory.pop();
    }

    // Start analysis
    this.analyzeComparison();
  }

  @action
  updateComparisonMethod(method: ComparisonMethod): void {
    if (this._currentComparison) {
      this._currentComparison.method = method;
    }
  }

  @action
  updateOpacity(side: "left" | "right", opacity: number): void {
    if (this._currentComparison) {
      this._currentComparison.opacity[side] = Math.max(0, Math.min(1, opacity));
    }
  }

  @action
  updateSwipePosition(position: number): void {
    if (this._currentComparison && this._currentComparison.method === "swipe") {
      this._currentComparison.swipePosition = Math.max(0, Math.min(1, position));
    }
  }

  @action
  toggleSynchronization(type: "view" | "time"): void {
    if (this._currentComparison) {
      if (type === "view") {
        this._currentComparison.synchronizeView = !this._currentComparison.synchronizeView;
      } else {
        this._currentComparison.synchronizeTime = !this._currentComparison.synchronizeTime;
      }
    }
  }

  @action
  stopComparison(): void {
    this._currentComparison = undefined;
    this._analysisResults = undefined;
    this._changeDetectionResults = [];
    this._differenceVisualization = undefined;
  }

  @action
  private async analyzeComparison(): Promise<void> {
    if (!this._currentComparison) return;

    this._isAnalyzing = true;

    try {
      const analysis = await this.performComparisonAnalysis(
        this._currentComparison.leftItem,
        this._currentComparison.rightItem
      );

      this._analysisResults = analysis;
    } catch (error) {
      console.error("Comparison analysis failed:", error);
    } finally {
      this._isAnalyzing = false;
    }
  }

  private async performComparisonAnalysis(
    leftItem: StacCatalogItem,
    rightItem: StacCatalogItem
  ): Promise<ComparisonAnalysis> {
    // Get STAC item data
    const leftStacItem = await this.getStacItemData(leftItem);
    const rightStacItem = await this.getStacItemData(rightItem);

    // Spatial analysis
    const spatialOverlap = this.analyzeSpatialOverlap(leftStacItem, rightStacItem);
    
    // Temporal analysis
    const temporalRelation = this.analyzeTemporalRelation(leftStacItem, rightStacItem);
    
    // Asset analysis
    const assetComparison = this.analyzeAssets(leftStacItem, rightStacItem);
    
    // Quality metrics
    const qualityMetrics = this.analyzeQualityMetrics(leftStacItem, rightStacItem);

    return {
      spatialOverlap,
      temporalRelation,
      assetComparison,
      qualityMetrics
    };
  }

  private async getStacItemData(catalogItem: StacCatalogItem): Promise<StacItem> {
    // This would fetch the actual STAC item data
    // For now, we'll create a mock implementation
    return {
      stac_version: "1.0.0",
      type: "Feature",
      id: catalogItem.stacItemId || "unknown",
      collection: catalogItem.collectionId || "unknown",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
          [-180, -90]
        ]]
      },
      bbox: [-180, -90, 180, 90],
      properties: {
        datetime: new Date().toISOString(),
        "eo:cloud_cover": 10,
        "gsd": 10
      },
      assets: {},
      links: []
    };
  }

  private analyzeSpatialOverlap(leftItem: StacItem, rightItem: StacItem) {
    // Calculate spatial overlap using bounding boxes
    const leftBbox = leftItem.bbox || [-180, -90, 180, 90];
    const rightBbox = rightItem.bbox || [-180, -90, 180, 90];

    // Calculate intersection
    const intersectionWest = Math.max(leftBbox[0], rightBbox[0]);
    const intersectionSouth = Math.max(leftBbox[1], rightBbox[1]);
    const intersectionEast = Math.min(leftBbox[2], rightBbox[2]);
    const intersectionNorth = Math.min(leftBbox[3], rightBbox[3]);

    let intersectionArea = 0;
    if (intersectionWest < intersectionEast && intersectionSouth < intersectionNorth) {
      intersectionArea = (intersectionEast - intersectionWest) * (intersectionNorth - intersectionSouth);
    }

    const leftArea = (leftBbox[2] - leftBbox[0]) * (leftBbox[3] - leftBbox[1]);
    const rightArea = (rightBbox[2] - rightBbox[0]) * (rightBbox[3] - rightBbox[1]);

    const leftOnlyArea = leftArea - intersectionArea;
    const rightOnlyArea = rightArea - intersectionArea;

    const totalArea = leftArea + rightArea - intersectionArea;
    const overlapPercentage = totalArea > 0 ? (intersectionArea / totalArea) * 100 : 0;

    return {
      intersectionArea,
      leftOnlyArea,
      rightOnlyArea,
      overlapPercentage
    };
  }

  private analyzeTemporalRelation(leftItem: StacItem, rightItem: StacItem) {
    const leftDatetime = new Date(leftItem.properties.datetime || 0);
    const rightDatetime = new Date(rightItem.properties.datetime || 0);

    const timeDifference = rightDatetime.getTime() - leftDatetime.getTime();

    let relation: "before" | "after" | "same" | "overlapping";
    if (Math.abs(timeDifference) < 1000 * 60 * 60) { // Within 1 hour
      relation = "same";
    } else if (timeDifference > 0) {
      relation = "before"; // left is before right
    } else {
      relation = "after"; // left is after right
    }

    return {
      timeDifference,
      relation
    };
  }

  private analyzeAssets(leftItem: StacItem, rightItem: StacItem) {
    const leftAssets = Object.keys(leftItem.assets || {});
    const rightAssets = Object.keys(rightItem.assets || {});

    const commonAssets = leftAssets.filter(asset => rightAssets.includes(asset));
    const leftOnlyAssets = leftAssets.filter(asset => !rightAssets.includes(asset));
    const rightOnlyAssets = rightAssets.filter(asset => !leftAssets.includes(asset));

    // Analyze bands if EO extension is present
    const bandComparison = this.compareBands(leftItem, rightItem);

    return {
      commonAssets,
      leftOnlyAssets,
      rightOnlyAssets,
      bandComparison
    };
  }

  private compareBands(leftItem: StacItem, rightItem: StacItem): BandComparisonResult[] {
    const leftBands = leftItem.properties["eo:bands"] || [];
    const rightBands = rightItem.properties["eo:bands"] || [];

    const allBandNames = new Set([
      ...leftBands.map((b: any) => b.name),
      ...rightBands.map((b: any) => b.name)
    ]);

    return Array.from(allBandNames).map(bandName => {
      const leftBand = leftBands.find((b: any) => b.name === bandName);
      const rightBand = rightBands.find((b: any) => b.name === bandName);

      const leftWavelength = leftBand?.center_wavelength || null;
      const rightWavelength = rightBand?.center_wavelength || null;
      const wavelengthDiff = leftWavelength && rightWavelength ? 
        Math.abs(leftWavelength - rightWavelength) : null;

      const leftRes = (leftBand as any)?.gsd || null;
      const rightRes = (rightBand as any)?.gsd || null;
      const resDiff = leftRes && rightRes ? Math.abs(leftRes - rightRes) : null;

      return {
        bandName,
        available: {
          left: !!leftBand,
          right: !!rightBand
        },
        wavelength: {
          left: leftWavelength,
          right: rightWavelength,
          difference: wavelengthDiff
        },
        resolution: {
          left: leftRes,
          right: rightRes,
          difference: resDiff
        }
      };
    });
  }

  private analyzeQualityMetrics(leftItem: StacItem, rightItem: StacItem) {
    const leftCloudCover = leftItem.properties["eo:cloud_cover"] || null;
    const rightCloudCover = rightItem.properties["eo:cloud_cover"] || null;
    const cloudCoverDiff = leftCloudCover !== null && rightCloudCover !== null ?
      rightCloudCover - leftCloudCover : null;

    const leftResolution = leftItem.properties.gsd || null;
    const rightResolution = rightItem.properties.gsd || null;
    const resolutionDiff = leftResolution !== null && rightResolution !== null ?
      rightResolution - leftResolution : null;

    return {
      cloudCover: {
        left: leftCloudCover,
        right: rightCloudCover,
        difference: cloudCoverDiff
      },
      resolution: {
        left: leftResolution,
        right: rightResolution,
        difference: resolutionDiff
      },
      quality: {
        left: leftItem.properties["data:quality"] || null,
        right: rightItem.properties["data:quality"] || null
      }
    };
  }

  @action
  async performChangeDetection(
    method: "ndvi" | "ndwi" | "custom" = "ndvi",
    threshold: number = 0.1
  ): Promise<ChangeDetectionResult[]> {
    if (!this._currentComparison) {
      throw new TerriaError({
        title: i18next.t("models.stacComparison.noComparisonError"),
        message: i18next.t("models.stacComparison.noComparisonErrorMessage")
      });
    }

    this._isAnalyzing = true;

    try {
      // This would perform actual change detection analysis
      // For now, we'll generate mock results
      const results = await this.generateMockChangeDetection(method, threshold);
      this._changeDetectionResults = results;
      return results;
    } catch (error) {
      throw new TerriaError({
        title: i18next.t("models.stacComparison.changeDetectionError"),
        message: error instanceof Error ? error.message : "Change detection failed"
      });
    } finally {
      this._isAnalyzing = false;
    }
  }

  private async generateMockChangeDetection(
    method: string,
    threshold: number
  ): Promise<ChangeDetectionResult[]> {
    // Generate mock change detection results
    const results: ChangeDetectionResult[] = [];
    
    for (let i = 0; i < 10; i++) {
      results.push({
        changeType: Math.random() > 0.5 ? "increase" : "decrease",
        magnitude: Math.random() * 2 - 1, // -1 to 1
        confidence: 0.5 + Math.random() * 0.5, // 0.5 to 1
        timestamp: new Date(),
        location: {
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360
        },
        metadata: {
          method,
          threshold,
          pixelCount: Math.floor(Math.random() * 1000)
        }
      });
    }

    return results;
  }

  @action
  createDifferenceVisualization(
    asset: string,
    band: string,
    method: "ndvi" | "ndwi" | "rgb" | "thermal" | "custom" = "ndvi",
    colorMap: string = "RdYlBu"
  ): void {
    if (!this._currentComparison) return;

    this._differenceVisualization = {
      asset,
      band,
      method,
      threshold: 0.1,
      colorMap,
      statistics: {
        min: -1,
        max: 1,
        mean: 0,
        stdDev: 0.3,
        histogram: new Array(256).fill(0).map(() => Math.floor(Math.random() * 100))
      }
    };
  }

  // Utility methods for UI integration

  getComparisonSummary(): string {
    if (!this._analysisResults) return "";

    const analysis = this._analysisResults;
    const overlap = analysis.spatialOverlap.overlapPercentage.toFixed(1);
    const timeDiff = Math.abs(analysis.temporalRelation.timeDifference);
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    
    return i18next.t("models.stacComparison.summary", {
      overlap,
      days,
      commonAssets: analysis.assetComparison.commonAssets.length
    });
  }

  getQualityRecommendation(): string {
    if (!this._analysisResults) return "";

    const quality = this._analysisResults.qualityMetrics;
    
    if (quality.cloudCover.left !== null && quality.cloudCover.right !== null) {
      const better = quality.cloudCover.left < quality.cloudCover.right ? "left" : "right";
      return i18next.t("models.stacComparison.qualityRecommendation", { better });
    }

    return "";
  }

  @action
  exportComparisonReport(): string {
    if (!this._currentComparison || !this._analysisResults) {
      return "No comparison data available";
    }

    const analysis = this._analysisResults;
    const comparison = this._currentComparison;

    let report = `# STAC Comparison Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    report += `## Items Compared\n`;
    report += `- **Left**: ${comparison.leftItem.name}\n`;
    report += `- **Right**: ${comparison.rightItem.name}\n`;
    report += `- **Method**: ${comparison.method}\n\n`;

    report += `## Spatial Analysis\n`;
    report += `- Overlap: ${analysis.spatialOverlap.overlapPercentage.toFixed(2)}%\n`;
    report += `- Intersection Area: ${analysis.spatialOverlap.intersectionArea.toFixed(2)}\n`;
    report += `- Left Only Area: ${analysis.spatialOverlap.leftOnlyArea.toFixed(2)}\n`;
    report += `- Right Only Area: ${analysis.spatialOverlap.rightOnlyArea.toFixed(2)}\n\n`;

    report += `## Temporal Analysis\n`;
    report += `- Relation: ${analysis.temporalRelation.relation}\n`;
    report += `- Time Difference: ${Math.abs(analysis.temporalRelation.timeDifference / (1000 * 60 * 60 * 24)).toFixed(1)} days\n\n`;

    report += `## Asset Comparison\n`;
    report += `- Common Assets: ${analysis.assetComparison.commonAssets.join(", ")}\n`;
    report += `- Left Only: ${analysis.assetComparison.leftOnlyAssets.join(", ")}\n`;
    report += `- Right Only: ${analysis.assetComparison.rightOnlyAssets.join(", ")}\n\n`;

    if (analysis.assetComparison.bandComparison.length > 0) {
      report += `## Band Comparison\n`;
      analysis.assetComparison.bandComparison.forEach(band => {
        report += `- **${band.bandName}**: `;
        report += `Available (L: ${band.available.left}, R: ${band.available.right})`;
        if (band.wavelength.difference !== null) {
          report += `, Wavelength diff: ${band.wavelength.difference.toFixed(2)}nm`;
        }
        report += `\n`;
      });
      report += `\n`;
    }

    report += `## Quality Metrics\n`;
    if (analysis.qualityMetrics.cloudCover.left !== null) {
      report += `- Cloud Cover (Left): ${analysis.qualityMetrics.cloudCover.left}%\n`;
    }
    if (analysis.qualityMetrics.cloudCover.right !== null) {
      report += `- Cloud Cover (Right): ${analysis.qualityMetrics.cloudCover.right}%\n`;
    }
    if (analysis.qualityMetrics.resolution.left !== null) {
      report += `- Resolution (Left): ${analysis.qualityMetrics.resolution.left}m\n`;
    }
    if (analysis.qualityMetrics.resolution.right !== null) {
      report += `- Resolution (Right): ${analysis.qualityMetrics.resolution.right}m\n`;
    }

    if (this._changeDetectionResults.length > 0) {
      report += `\n## Change Detection Results\n`;
      report += `Total changes detected: ${this._changeDetectionResults.length}\n`;
      
      const increases = this._changeDetectionResults.filter(r => r.changeType === "increase").length;
      const decreases = this._changeDetectionResults.filter(r => r.changeType === "decrease").length;
      
      report += `- Increases: ${increases}\n`;
      report += `- Decreases: ${decreases}\n`;
    }

    return report;
  }
}