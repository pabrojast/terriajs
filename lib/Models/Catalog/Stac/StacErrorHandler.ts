/**
 * STAC Error Handler
 * 
 * Specialized error handling for STAC APIs with user-friendly error messages,
 * retry strategies, and diagnostic information
 */

import { action, computed, makeObservable, observable } from "mobx";
import i18next from "i18next";
import TerriaError from "../../../Core/TerriaError";

export type StacErrorType = 
  | "network"
  | "authentication" 
  | "authorization"
  | "not_found"
  | "invalid_request"
  | "server_error"
  | "rate_limit"
  | "conformance"
  | "timeout"
  | "parse_error"
  | "validation_error"
  | "unsupported_feature";

export interface StacError {
  type: StacErrorType;
  code?: string | number;
  message: string;
  userMessage: string;
  details?: any;
  url?: string;
  method?: string;
  timestamp: Date;
  retryable: boolean;
  suggestions: string[];
}

export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrorTypes: StacErrorType[];
}

export class StacErrorHandler {
  @observable
  private _recentErrors: StacError[] = [];

  @observable
  private _retryAttempts: Map<string, number> = new Map();

  private readonly defaultRetryStrategy: RetryStrategy = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    retryableErrorTypes: ["network", "server_error", "timeout", "rate_limit"]
  };

  constructor() {
    makeObservable(this);
  }

  @computed
  get recentErrors(): StacError[] {
    return [...this._recentErrors];
  }

  @computed
  get lastError(): StacError | undefined {
    return this._recentErrors[this._recentErrors.length - 1];
  }

  @action
  handleError(
    error: Error | any,
    context: {
      url?: string;
      method?: string;
      operation?: string;
      catalogItem?: any;
    } = {}
  ): StacError {
    const stacError = this.parseError(error, context);
    
    // Add to recent errors (keep last 10)
    this._recentErrors.push(stacError);
    if (this._recentErrors.length > 10) {
      this._recentErrors.shift();
    }

    return stacError;
  }

  @action
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      url?: string;
      method?: string;
      operation?: string;
    } = {},
    retryStrategy: Partial<RetryStrategy> = {}
  ): Promise<T> {
    const strategy = { ...this.defaultRetryStrategy, ...retryStrategy };
    const operationKey = `${context.method || "GET"}:${context.url || "unknown"}`;
    let attempts = this._retryAttempts.get(operationKey) || 0;

    while (attempts < strategy.maxAttempts) {
      try {
        const result = await operation();
        // Reset retry count on success
        this._retryAttempts.delete(operationKey);
        return result;
      } catch (error) {
        attempts++;
        this._retryAttempts.set(operationKey, attempts);

        const stacError = this.handleError(error, context);
        
        // Don't retry if not retryable or max attempts reached
        if (!strategy.retryableErrorTypes.includes(stacError.type) || 
            attempts >= strategy.maxAttempts) {
          this._retryAttempts.delete(operationKey);
          throw this.createTerriaError(stacError);
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          strategy.baseDelay * Math.pow(strategy.backoffFactor, attempts - 1),
          strategy.maxDelay
        );

        console.warn(`STAC operation failed, retrying in ${delay}ms (attempt ${attempts}/${strategy.maxAttempts}):`, stacError);
        
        await this.delay(delay);
      }
    }

    throw new Error("Should not reach here");
  }

  private parseError(error: any, context: any): StacError {
    let stacError: StacError;

    if (error instanceof Response) {
      stacError = this.parseHttpError(error, context);
    } else if (error instanceof TypeError && error.message.includes("fetch")) {
      stacError = this.parseNetworkError(error, context);
    } else if (error instanceof SyntaxError) {
      stacError = this.parseParseError(error, context);
    } else if (error instanceof TerriaError) {
      stacError = this.parseTerriaError(error, context);
    } else {
      stacError = this.parseGenericError(error, context);
    }

    return stacError;
  }

  private parseHttpError(response: Response, context: any): StacError {
    const status = response.status;
    let type: StacErrorType;
    let userMessage: string;
    let suggestions: string[] = [];

    switch (status) {
      case 400:
        type = "invalid_request";
        userMessage = i18next.t("models.stacCatalogItem.errors.invalidRequest");
        suggestions = [
          i18next.t("models.stacCatalogItem.errors.suggestions.checkFilters"),
          i18next.t("models.stacCatalogItem.errors.suggestions.validateParameters")
        ];
        break;
      case 401:
        type = "authentication";
        userMessage = i18next.t("models.stacCatalogItem.errors.authenticationRequired");
        suggestions = [
          i18next.t("models.stacCatalogItem.errors.suggestions.checkToken"),
          i18next.t("models.stacCatalogItem.errors.suggestions.refreshAuth")
        ];
        break;
      case 403:
        type = "authorization";
        userMessage = i18next.t("models.stacCatalogItem.errors.accessDenied");
        suggestions = [
          i18next.t("models.stacCatalogItem.errors.suggestions.checkPermissions"),
          i18next.t("models.stacCatalogItem.errors.suggestions.contactAdmin")
        ];
        break;
      case 404:
        type = "not_found";
        userMessage = i18next.t("models.stacCatalogItem.errors.resourceNotFound");
        suggestions = [
          i18next.t("models.stacCatalogItem.errors.suggestions.checkUrl"),
          i18next.t("models.stacCatalogItem.errors.suggestions.verifyCollection")
        ];
        break;
      case 429:
        type = "rate_limit";
        userMessage = i18next.t("models.stacCatalogItem.errors.rateLimited");
        suggestions = [
          i18next.t("models.stacCatalogItem.errors.suggestions.waitAndRetry"),
          i18next.t("models.stacCatalogItem.errors.suggestions.reduceRequests")
        ];
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        type = "server_error";
        userMessage = i18next.t("models.stacCatalogItem.errors.serverError");
        suggestions = [
          i18next.t("models.stacCatalogItem.errors.suggestions.tryLater"),
          i18next.t("models.stacCatalogItem.errors.suggestions.contactSupport")
        ];
        break;
      default:
        type = "server_error";
        userMessage = i18next.t("models.stacCatalogItem.errors.unknownHttpError", { status });
        suggestions = [
          i18next.t("models.stacCatalogItem.errors.suggestions.checkConnection"),
          i18next.t("models.stacCatalogItem.errors.suggestions.tryLater")
        ];
    }

    return {
      type,
      code: status,
      message: `HTTP ${status}: ${response.statusText}`,
      userMessage,
      details: response,
      url: context.url,
      method: context.method,
      timestamp: new Date(),
      retryable: [500, 502, 503, 504, 429].includes(status),
      suggestions
    };
  }

  private parseNetworkError(error: TypeError, context: any): StacError {
    const suggestions: string[] = [
      i18next.t("models.stacCatalogItem.errors.suggestions.checkConnection"),
      i18next.t("models.stacCatalogItem.errors.suggestions.checkCORS"),
      i18next.t("models.stacCatalogItem.errors.suggestions.tryLater")
    ];

    if (context.url && !context.url.startsWith("https://")) {
      suggestions.unshift(i18next.t("models.stacCatalogItem.errors.suggestions.useHTTPS"));
    }

    return {
      type: "network",
      message: error.message,
      userMessage: i18next.t("models.stacCatalogItem.errors.networkError"),
      details: error,
      url: context.url,
      method: context.method,
      timestamp: new Date(),
      retryable: true,
      suggestions
    };
  }

  private parseParseError(error: SyntaxError, context: any): StacError {
    return {
      type: "parse_error",
      message: error.message,
      userMessage: i18next.t("models.stacCatalogItem.errors.parseError"),
      details: error,
      url: context.url,
      method: context.method,
      timestamp: new Date(),
      retryable: false,
      suggestions: [
        i18next.t("models.stacCatalogItem.errors.suggestions.checkFormat"),
        i18next.t("models.stacCatalogItem.errors.suggestions.validateJson"),
        i18next.t("models.stacCatalogItem.errors.suggestions.contactSupport")
      ]
    };
  }

  private parseTerriaError(error: TerriaError, context: any): StacError {
    let type: StacErrorType = "validation_error";
    
    if (error.title?.toLowerCase().includes("network")) {
      type = "network";
    } else if (error.title?.toLowerCase().includes("auth")) {
      type = "authentication";
    } else if (error.title?.toLowerCase().includes("conformance")) {
      type = "conformance";
    }

    return {
      type,
      message: error.message || error.title || "Unknown error",
      userMessage: error.message || i18next.t("models.stacCatalogItem.errors.genericError"),
      details: error,
      url: context.url,
      method: context.method,
      timestamp: new Date(),
      retryable: type === "network" || (type as any) === "timeout" || (type as any) === "rate_limit",
      suggestions: [
        i18next.t("models.stacCatalogItem.errors.suggestions.checkConfiguration"),
        i18next.t("models.stacCatalogItem.errors.suggestions.tryLater")
      ]
    };
  }

  private parseGenericError(error: any, context: any): StacError {
    let type: StacErrorType = "server_error";
    let userMessage = i18next.t("models.stacCatalogItem.errors.genericError");
    let suggestions = [
      i18next.t("models.stacCatalogItem.errors.suggestions.tryLater"),
      i18next.t("models.stacCatalogItem.errors.suggestions.contactSupport")
    ];

    if (error?.name === "TimeoutError" || error?.message?.includes("timeout")) {
      type = "timeout";
      userMessage = i18next.t("models.stacCatalogItem.errors.timeout");
      suggestions = [
        i18next.t("models.stacCatalogItem.errors.suggestions.checkConnection"),
        i18next.t("models.stacCatalogItem.errors.suggestions.tryLater"),
        i18next.t("models.stacCatalogItem.errors.suggestions.reduceFilters")
      ];
    }

    return {
      type,
      message: error?.message || String(error),
      userMessage,
      details: error,
      url: context.url,
      method: context.method,
      timestamp: new Date(),
      retryable: type === "timeout" || type === "server_error",
      suggestions
    };
  }

  private createTerriaError(stacError: StacError): TerriaError {
    let title = i18next.t(`models.stacCatalogItem.errorTypes.${stacError.type}`);
    
    if (!title || title.startsWith("models.stacCatalogItem.errorTypes.")) {
      title = i18next.t("models.stacCatalogItem.errors.genericErrorTitle");
    }

    let message = stacError.userMessage;
    
    if (stacError.suggestions.length > 0) {
      message += "\n\n" + i18next.t("models.stacCatalogItem.errors.suggestions.title") + "\n";
      message += stacError.suggestions.map(s => `• ${s}`).join("\n");
    }

    return new TerriaError({
      title,
      message,
      importance: stacError.type === "authentication" ? 1 : 0
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Diagnostic methods
  getDiagnosticInfo(error: StacError): string {
    const info: string[] = [
      `Error Type: ${error.type}`,
      `Timestamp: ${error.timestamp.toISOString()}`,
      `Message: ${error.message}`
    ];

    if (error.url) info.push(`URL: ${error.url}`);
    if (error.method) info.push(`Method: ${error.method}`);
    if (error.code) info.push(`Code: ${error.code}`);
    
    info.push(`Retryable: ${error.retryable}`);
    
    if (error.suggestions.length > 0) {
      info.push(`Suggestions: ${error.suggestions.join(", ")}`);
    }

    return info.join("\n");
  }

  getErrorsReport(): string {
    if (this._recentErrors.length === 0) {
      return "No recent errors recorded.";
    }

    let report = `# STAC Errors Report\n\n`;
    report += `Total Errors: ${this._recentErrors.length}\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Group errors by type
    const errorsByType = new Map<StacErrorType, StacError[]>();
    this._recentErrors.forEach(error => {
      const errors = errorsByType.get(error.type) || [];
      errors.push(error);
      errorsByType.set(error.type, errors);
    });

    errorsByType.forEach((errors, type) => {
      report += `## ${type.toUpperCase()} (${errors.length})\n\n`;
      
      errors.forEach((error, index) => {
        report += `### Error ${index + 1}\n`;
        report += `- **Time**: ${error.timestamp.toISOString()}\n`;
        report += `- **Message**: ${error.message}\n`;
        if (error.url) report += `- **URL**: ${error.url}\n`;
        if (error.method) report += `- **Method**: ${error.method}\n`;
        report += `- **Retryable**: ${error.retryable}\n`;
        report += `- **Suggestions**: ${error.suggestions.join("; ")}\n\n`;
      });
    });

    return report;
  }

  @action
  clearErrors(): void {
    this._recentErrors = [];
    this._retryAttempts.clear();
  }
}