/**
 * STAC Conformance Validator
 * 
 * Validates STAC API conformance classes and capabilities
 */

import { action, computed, makeObservable, observable } from "mobx";
import isDefined from "../../../Core/isDefined";
import TerriaError from "../../../Core/TerriaError";
import { StacApiClient } from "./StacApiHelpers";

// Standard STAC conformance classes
export const STAC_CONFORMANCE_CLASSES = {
  // Core conformance classes
  CORE: "https://api.stacspec.org/v1.0.0/core",
  COLLECTIONS: "https://api.stacspec.org/v1.0.0/collections",
  FEATURES: "https://api.stacspec.org/v1.0.0/ogcapi-features",
  
  // Item Search conformance classes
  ITEM_SEARCH: "https://api.stacspec.org/v1.0.0/item-search",
  ITEM_SEARCH_FILTER: "https://api.stacspec.org/v1.0.0/item-search#filter",
  ITEM_SEARCH_QUERY: "https://api.stacspec.org/v1.0.0/item-search#query",
  ITEM_SEARCH_SORT: "https://api.stacspec.org/v1.0.0/item-search#sort",
  ITEM_SEARCH_FIELDS: "https://api.stacspec.org/v1.0.0/item-search#fields",
  ITEM_SEARCH_CONTEXT: "https://api.stacspec.org/v1.0.0/item-search#context",
  
  // Extension conformance classes
  AGGREGATION: "https://api.stacspec.org/v1.0.0/aggregation",
  AUTHENTICATION: "https://api.stacspec.org/v1.0.0/authentication",
  BROWSE: "https://api.stacspec.org/v1.0.0/browse",
  CHILDREN: "https://api.stacspec.org/v1.0.0/children",
  
  // Filter extension
  FILTER: "http://www.opengis.net/spec/cql2/1.0/conf/cql2-text",
  FILTER_JSON: "http://www.opengis.net/spec/cql2/1.0/conf/cql2-json",
  FILTER_BASIC_CQL2: "http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2",
  FILTER_ADVANCED_CQL2: "http://www.opengis.net/spec/cql2/1.0/conf/advanced-comparison-operators",
  
  // Transaction extension
  TRANSACTION: "https://api.stacspec.org/v1.0.0/transaction",
  
  // Queryables extension  
  QUERYABLES: "https://api.stacspec.org/v1.0.0/queryables"
} as const;

export interface ConformanceDeclaration {
  conformsTo: string[];
}

export interface StacApiCapabilities {
  // Core capabilities
  supportsCollections: boolean;
  supportsItemSearch: boolean;
  supportsFeatures: boolean;
  
  // Search capabilities
  supportsFiltering: boolean;
  supportsQuery: boolean;
  supportsSorting: boolean;
  supportsFields: boolean;
  supportsContext: boolean;
  
  // Filter capabilities
  supportsCQL2Text: boolean;
  supportsCQL2Json: boolean;
  supportsBasicCQL2: boolean;
  supportsAdvancedComparison: boolean;
  
  // Extension capabilities
  supportsAggregation: boolean;
  supportsAuthentication: boolean;
  supportsBrowse: boolean;
  supportsChildren: boolean;
  supportsTransaction: boolean;
  supportsQueryables: boolean;
  
  // API metadata
  conformsTo: string[];
  stacVersion?: string;
  apiVersion?: string;
  title?: string;
  description?: string;
}

export class StacConformanceValidator {
  @observable
  private _capabilities?: StacApiCapabilities;

  @observable
  private _conformanceDeclaration?: ConformanceDeclaration;

  @observable
  private _isValidating: boolean = false;

  @observable
  private _validationErrors: string[] = [];

  @observable
  private _lastValidated?: Date;

  private client: StacApiClient;

  constructor(client: StacApiClient) {
    makeObservable(this);
    this.client = client;
  }

  @computed
  get capabilities(): StacApiCapabilities | undefined {
    return this._capabilities;
  }

  @computed
  get conformanceDeclaration(): ConformanceDeclaration | undefined {
    return this._conformanceDeclaration;
  }

  @computed
  get isValidating(): boolean {
    return this._isValidating;
  }

  @computed
  get validationErrors(): string[] {
    return [...this._validationErrors];
  }

  @computed
  get lastValidated(): Date | undefined {
    return this._lastValidated;
  }

  @computed
  get isValid(): boolean {
    return this._validationErrors.length === 0 && isDefined(this._capabilities);
  }

  @action
  async validateConformance(): Promise<StacApiCapabilities> {
    this._isValidating = true;
    this._validationErrors = [];

    try {
      // Load conformance declaration
      const conformanceDeclaration = await this.loadConformanceDeclaration();
      
      // Load landing page for additional metadata
      const landingPage = await this.client.getCatalog();

      // Analyze capabilities based on conformance classes
      const capabilities = this.analyzeCapabilities(conformanceDeclaration, landingPage);

      // Validate core requirements
      await this.validateCoreRequirements(capabilities);

      // Test optional features
      await this.testOptionalFeatures(capabilities);

      this._conformanceDeclaration = conformanceDeclaration;
      this._capabilities = capabilities;
      this._lastValidated = new Date();

      return capabilities;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown validation error";
      this._validationErrors.push(errorMessage);
      
      throw new TerriaError({
        title: "STAC Conformance Validation Failed",
        message: `Failed to validate STAC API conformance: ${errorMessage}`
      });
    } finally {
      this._isValidating = false;
    }
  }

  private async loadConformanceDeclaration(): Promise<ConformanceDeclaration> {
    try {
      return await this.client.fetchJson<ConformanceDeclaration>("conformance");
    } catch (_error) {
      // Fallback: try to infer from landing page
      const landingPage = await this.client.getCatalog();
      const conformsTo = (landingPage as any).conformsTo || [];
      
      if (conformsTo.length === 0) {
        throw new TerriaError({
          title: "No conformance information",
          message: "STAC API does not provide conformance information"
        });
      }

      return { conformsTo };
    }
  }

  private analyzeCapabilities(
    conformance: ConformanceDeclaration, 
    landingPage: any
  ): StacApiCapabilities {
    const conformsTo = conformance.conformsTo;

    return {
      // Core capabilities
      supportsCollections: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.COLLECTIONS),
      supportsItemSearch: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.ITEM_SEARCH),
      supportsFeatures: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.FEATURES),

      // Search capabilities
      supportsFiltering: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.ITEM_SEARCH_FILTER),
      supportsQuery: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.ITEM_SEARCH_QUERY),
      supportsSorting: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.ITEM_SEARCH_SORT),
      supportsFields: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.ITEM_SEARCH_FIELDS),
      supportsContext: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.ITEM_SEARCH_CONTEXT),

      // Filter capabilities
      supportsCQL2Text: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.FILTER),
      supportsCQL2Json: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.FILTER_JSON),
      supportsBasicCQL2: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.FILTER_BASIC_CQL2),
      supportsAdvancedComparison: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.FILTER_ADVANCED_CQL2),

      // Extension capabilities
      supportsAggregation: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.AGGREGATION),
      supportsAuthentication: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.AUTHENTICATION),
      supportsBrowse: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.BROWSE),
      supportsChildren: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.CHILDREN),
      supportsTransaction: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.TRANSACTION),
      supportsQueryables: this.conformsTo(conformsTo, STAC_CONFORMANCE_CLASSES.QUERYABLES),

      // API metadata
      conformsTo: conformsTo,
      stacVersion: landingPage.stac_version,
      apiVersion: landingPage.api_version,
      title: landingPage.title,
      description: landingPage.description
    };
  }

  private conformsTo(conformsTo: string[], conformanceClass: string): boolean {
    return conformsTo.includes(conformanceClass);
  }

  private async validateCoreRequirements(capabilities: StacApiCapabilities): Promise<void> {
    const errors: string[] = [];

    // Core conformance class is required
    if (!this.conformsTo(capabilities.conformsTo, STAC_CONFORMANCE_CLASSES.CORE)) {
      errors.push("Missing required Core conformance class");
    }

    // At least one of Collections or Item Search should be supported
    if (!capabilities.supportsCollections && !capabilities.supportsItemSearch) {
      errors.push("Must support either Collections or Item Search");
    }

    // Validate STAC version
    if (!capabilities.stacVersion) {
      errors.push("Missing STAC version information");
    } else if (!this.isValidStacVersion(capabilities.stacVersion)) {
      errors.push(`Unsupported STAC version: ${capabilities.stacVersion}`);
    }

    this._validationErrors.push(...errors);
  }

  private async testOptionalFeatures(capabilities: StacApiCapabilities): Promise<void> {
    const warnings: string[] = [];

    // Test collections endpoint if supported
    if (capabilities.supportsCollections) {
      try {
        await this.client.getCollections();
      } catch (_error) {
        warnings.push("Collections endpoint not accessible despite conformance claim");
      }
    }

    // Test item search endpoint if supported  
    if (capabilities.supportsItemSearch) {
      try {
        await this.client.searchItems({ limit: 1 });
      } catch (_error) {
        warnings.push("Item search endpoint not accessible despite conformance claim");
      }
    }

    // Test queryables if supported
    if (capabilities.supportsQueryables) {
      try {
        await this.client.fetchJson("queryables");
      } catch (_error) {
        warnings.push("Queryables endpoint not accessible despite conformance claim");
      }
    }

    // Warnings don't fail validation but are logged
    if (warnings.length > 0) {
      console.warn("STAC API conformance warnings:", warnings);
    }
  }

  private isValidStacVersion(version: string): boolean {
    // Support STAC versions 1.0.0 and above
    const supportedVersions = ["1.0.0", "1.1.0", "1.2.0"];
    return supportedVersions.includes(version) || version.startsWith("1.");
  }

  // Utility methods for checking specific capabilities

  canUseAdvancedFiltering(): boolean {
    return this._capabilities?.supportsFiltering && 
           (this._capabilities?.supportsCQL2Text || this._capabilities?.supportsCQL2Json) || false;
  }

  canUseSorting(): boolean {
    return this._capabilities?.supportsSorting || false;
  }

  canUseFields(): boolean {
    return this._capabilities?.supportsFields || false;
  }

  canUseContext(): boolean {
    return this._capabilities?.supportsContext || false;
  }

  canUseQueryables(): boolean {
    return this._capabilities?.supportsQueryables || false;
  }

  getBestFilterFormat(): "cql2-text" | "cql2-json" | "query" | null {
    if (!this._capabilities) return null;

    if (this._capabilities.supportsCQL2Json) return "cql2-json";
    if (this._capabilities.supportsCQL2Text) return "cql2-text";
    if (this._capabilities.supportsQuery) return "query";
    
    return null;
  }

  getRecommendations(): string[] {
    const recommendations: string[] = [];

    if (!this._capabilities) {
      return ["Validate conformance first"];
    }

    if (!this._capabilities.supportsFiltering) {
      recommendations.push("Consider using STAC APIs with filtering support for better search capabilities");
    }

    if (!this._capabilities.supportsSorting) {
      recommendations.push("Sorting not supported - results may not be in optimal order");
    }

    if (!this._capabilities.supportsQueryables) {
      recommendations.push("Queryables not supported - limited dynamic property discovery");
    }

    if (!this._capabilities.supportsContext) {
      recommendations.push("Context not supported - pagination information may be limited");
    }

    return recommendations;
  }

  generateCapabilityReport(): string {
    if (!this._capabilities) {
      return "No capabilities information available. Run validateConformance() first.";
    }

    const cap = this._capabilities;
    let report = `# STAC API Capabilities Report\n\n`;
    
    report += `**API Title:** ${cap.title || "Unknown"}\n`;
    report += `**STAC Version:** ${cap.stacVersion || "Unknown"}\n`;
    report += `**API Version:** ${cap.apiVersion || "Unknown"}\n`;
    report += `**Validation Date:** ${this._lastValidated?.toISOString() || "Unknown"}\n\n`;

    report += `## Core Capabilities\n`;
    report += `- Collections: ${cap.supportsCollections ? "✅" : "❌"}\n`;
    report += `- Item Search: ${cap.supportsItemSearch ? "✅" : "❌"}\n`;
    report += `- OGC Features: ${cap.supportsFeatures ? "✅" : "❌"}\n\n`;

    report += `## Search Capabilities\n`;
    report += `- Filtering: ${cap.supportsFiltering ? "✅" : "❌"}\n`;
    report += `- Query Parameters: ${cap.supportsQuery ? "✅" : "❌"}\n`;
    report += `- Sorting: ${cap.supportsSorting ? "✅" : "❌"}\n`;
    report += `- Field Selection: ${cap.supportsFields ? "✅" : "❌"}\n`;
    report += `- Context Information: ${cap.supportsContext ? "✅" : "❌"}\n\n`;

    report += `## Filter Capabilities\n`;
    report += `- CQL2 Text: ${cap.supportsCQL2Text ? "✅" : "❌"}\n`;
    report += `- CQL2 JSON: ${cap.supportsCQL2Json ? "✅" : "❌"}\n`;
    report += `- Basic CQL2: ${cap.supportsBasicCQL2 ? "✅" : "❌"}\n`;
    report += `- Advanced Comparison: ${cap.supportsAdvancedComparison ? "✅" : "❌"}\n\n`;

    report += `## Extensions\n`;
    report += `- Aggregation: ${cap.supportsAggregation ? "✅" : "❌"}\n`;
    report += `- Authentication: ${cap.supportsAuthentication ? "✅" : "❌"}\n`;
    report += `- Browse: ${cap.supportsBrowse ? "✅" : "❌"}\n`;
    report += `- Children: ${cap.supportsChildren ? "✅" : "❌"}\n`;
    report += `- Transaction: ${cap.supportsTransaction ? "✅" : "❌"}\n`;
    report += `- Queryables: ${cap.supportsQueryables ? "✅" : "❌"}\n\n`;

    if (this._validationErrors.length > 0) {
      report += `## Validation Errors\n`;
      this._validationErrors.forEach(error => {
        report += `- ❌ ${error}\n`;
      });
      report += `\n`;
    }

    const recommendations = this.getRecommendations();
    if (recommendations.length > 0) {
      report += `## Recommendations\n`;
      recommendations.forEach(rec => {
        report += `- 💡 ${rec}\n`;
      });
    }

    return report;
  }

  @action
  reset(): void {
    this._capabilities = undefined;
    this._conformanceDeclaration = undefined;
    this._validationErrors = [];
    this._lastValidated = undefined;
    this._isValidating = false;
  }
}