/**
 * STAC Performance Monitor
 * 
 * Monitors and analyzes performance metrics for STAC operations,
 * providing insights for optimization and troubleshooting
 */

import { action, computed, makeObservable, observable } from "mobx";

export interface PerformanceMetric {
  id: string;
  operation: string;
  url?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  metadata: {
    itemCount?: number;
    responseSize?: number;
    cacheHit?: boolean;
    retryCount?: number;
    filterCount?: number;
    collectionCount?: number;
    [key: string]: any;
  };
}

export interface PerformanceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  averageDuration: number;
  medianDuration: number;
  p95Duration: number;
  totalDataTransferred: number;
  cacheHitRate: number;
  operationsByType: Record<string, number>;
  slowestOperations: PerformanceMetric[];
  recentErrors: PerformanceMetric[];
}

export interface PerformanceBenchmark {
  operation: string;
  expectedDuration: number;
  warningThreshold: number;
  errorThreshold: number;
}

export class StacPerformanceMonitor {
  @observable
  private _metrics: PerformanceMetric[] = [];

  @observable
  private _isEnabled: boolean = true;

  @observable
  private _maxMetrics: number = 1000;

  private _activeOperations: Map<string, PerformanceMetric> = new Map();

  private readonly benchmarks: PerformanceBenchmark[] = [
    { operation: "getCatalog", expectedDuration: 500, warningThreshold: 2000, errorThreshold: 5000 },
    { operation: "getCollections", expectedDuration: 1000, warningThreshold: 3000, errorThreshold: 8000 },
    { operation: "searchItems", expectedDuration: 2000, warningThreshold: 5000, errorThreshold: 15000 },
    { operation: "getItem", expectedDuration: 300, warningThreshold: 1000, errorThreshold: 3000 },
    { operation: "loadAsset", expectedDuration: 1000, warningThreshold: 5000, errorThreshold: 15000 }
  ];

  constructor() {
    makeObservable(this);
  }

  @computed
  get isEnabled(): boolean {
    return this._isEnabled;
  }

  @computed
  get metrics(): PerformanceMetric[] {
    return [...this._metrics];
  }

  @computed
  get stats(): PerformanceStats {
    const completedMetrics = this._metrics.filter(m => m.endTime && m.duration !== undefined);
    
    if (completedMetrics.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        successRate: 0,
        averageDuration: 0,
        medianDuration: 0,
        p95Duration: 0,
        totalDataTransferred: 0,
        cacheHitRate: 0,
        operationsByType: {},
        slowestOperations: [],
        recentErrors: []
      };
    }

    const successful = completedMetrics.filter(m => m.success);
    const failed = completedMetrics.filter(m => !m.success);
    
    const durations = completedMetrics.map(m => m.duration!).sort((a, b) => a - b);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    
    const operationsByType: Record<string, number> = {};
    completedMetrics.forEach(m => {
      operationsByType[m.operation] = (operationsByType[m.operation] || 0) + 1;
    });

    const responseSizes = completedMetrics
      .map(m => m.metadata.responseSize || 0)
      .filter(size => size > 0);
    const totalDataTransferred = responseSizes.reduce((sum, size) => sum + size, 0);

    const cacheHits = completedMetrics.filter(m => m.metadata.cacheHit === true).length;
    const cacheableOperations = completedMetrics.filter(m => m.metadata.cacheHit !== undefined).length;

    return {
      totalOperations: completedMetrics.length,
      successfulOperations: successful.length,
      failedOperations: failed.length,
      successRate: successful.length / completedMetrics.length,
      averageDuration: totalDuration / completedMetrics.length,
      medianDuration: durations[Math.floor(durations.length / 2)] || 0,
      p95Duration: durations[Math.floor(durations.length * 0.95)] || 0,
      totalDataTransferred,
      cacheHitRate: cacheableOperations > 0 ? cacheHits / cacheableOperations : 0,
      operationsByType,
      slowestOperations: completedMetrics
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 10),
      recentErrors: failed
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
        .slice(0, 5)
    };
  }

  @action
  setEnabled(enabled: boolean): void {
    this._isEnabled = enabled;
  }

  @action
  setMaxMetrics(maxMetrics: number): void {
    this._maxMetrics = Math.max(100, Math.min(10000, maxMetrics));
    this.trimMetrics();
  }

  @action
  startOperation(
    operation: string,
    metadata: PerformanceMetric['metadata'] = {},
    url?: string
  ): string {
    if (!this._isEnabled) return "";

    const id = this.generateId();
    const metric: PerformanceMetric = {
      id,
      operation,
      url,
      startTime: performance.now(),
      success: false,
      metadata
    };

    this._activeOperations.set(id, metric);
    return id;
  }

  @action
  endOperation(
    id: string,
    success: boolean = true,
    error?: string,
    additionalMetadata: Record<string, any> = {}
  ): PerformanceMetric | undefined {
    if (!this._isEnabled || !id) return undefined;

    const metric = this._activeOperations.get(id);
    if (!metric) return undefined;

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    const completedMetric: PerformanceMetric = {
      ...metric,
      endTime,
      duration,
      success,
      error,
      metadata: {
        ...metric.metadata,
        ...additionalMetadata
      }
    };

    this._activeOperations.delete(id);
    this._metrics.push(completedMetric);

    this.trimMetrics();
    this.checkPerformanceBenchmarks(completedMetric);

    return completedMetric;
  }

  @action
  recordInstantMetric(
    operation: string,
    success: boolean,
    duration: number,
    metadata: PerformanceMetric['metadata'] = {},
    url?: string,
    error?: string
  ): PerformanceMetric {
    if (!this._isEnabled) {
      return {
        id: "",
        operation,
        url,
        startTime: 0,
        endTime: 0,
        duration: 0,
        success: false,
        metadata: {}
      };
    }

    const now = performance.now();
    const metric: PerformanceMetric = {
      id: this.generateId(),
      operation,
      url,
      startTime: now - duration,
      endTime: now,
      duration,
      success,
      error,
      metadata
    };

    this._metrics.push(metric);
    this.trimMetrics();
    this.checkPerformanceBenchmarks(metric);

    return metric;
  }

  @action
  async measureOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata: PerformanceMetric['metadata'] = {},
    url?: string
  ): Promise<T> {
    if (!this._isEnabled) {
      return fn();
    }

    const id = this.startOperation(operation, metadata, url);
    
    try {
      const result = await fn();
      
      // Try to extract additional metadata from result if it's a response
      const additionalMetadata: Record<string, any> = {};
      if (result && typeof result === 'object') {
        const res = result as any;
        if ('features' in res && Array.isArray(res.features)) {
          additionalMetadata.itemCount = res.features.length;
        }
        if ('collections' in res && Array.isArray(res.collections)) {
          additionalMetadata.collectionCount = res.collections.length;
        }
      }

      this.endOperation(id, true, undefined, additionalMetadata);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.endOperation(id, false, errorMessage);
      throw error;
    }
  }

  private generateId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private trimMetrics(): void {
    if (this._metrics.length > this._maxMetrics) {
      const excess = this._metrics.length - this._maxMetrics;
      this._metrics.splice(0, excess);
    }
  }

  private checkPerformanceBenchmarks(metric: PerformanceMetric): void {
    if (!metric.duration) return;

    const benchmark = this.benchmarks.find(b => b.operation === metric.operation);
    if (!benchmark) return;

    if (metric.duration > benchmark.errorThreshold) {
      console.error(`STAC Performance Alert: ${metric.operation} took ${metric.duration}ms (threshold: ${benchmark.errorThreshold}ms)`, metric);
    } else if (metric.duration > benchmark.warningThreshold) {
      console.warn(`STAC Performance Warning: ${metric.operation} took ${metric.duration}ms (threshold: ${benchmark.warningThreshold}ms)`, metric);
    }
  }

  // Analysis methods
  getOperationStats(operation: string): Partial<PerformanceStats> {
    const operationMetrics = this._metrics.filter(m => 
      m.operation === operation && 
      m.endTime && 
      m.duration !== undefined
    );

    if (operationMetrics.length === 0) return {};

    const durations = operationMetrics.map(m => m.duration!).sort((a, b) => a - b);
    const successful = operationMetrics.filter(m => m.success);

    return {
      totalOperations: operationMetrics.length,
      successfulOperations: successful.length,
      failedOperations: operationMetrics.length - successful.length,
      successRate: successful.length / operationMetrics.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      medianDuration: durations[Math.floor(durations.length / 2)],
      p95Duration: durations[Math.floor(durations.length * 0.95)]
    };
  }

  getSlowOperations(threshold: number = 5000): PerformanceMetric[] {
    return this._metrics
      .filter(m => m.duration && m.duration > threshold)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));
  }

  getCachePerformance(): { hitRate: number; avgHitDuration: number; avgMissDuration: number } {
    const cacheableMetrics = this._metrics.filter(m => 
      m.metadata.cacheHit !== undefined && 
      m.duration !== undefined
    );

    if (cacheableMetrics.length === 0) {
      return { hitRate: 0, avgHitDuration: 0, avgMissDuration: 0 };
    }

    const hits = cacheableMetrics.filter(m => m.metadata.cacheHit === true);
    const misses = cacheableMetrics.filter(m => m.metadata.cacheHit === false);

    return {
      hitRate: hits.length / cacheableMetrics.length,
      avgHitDuration: hits.length > 0 ? 
        hits.reduce((sum, m) => sum + (m.duration || 0), 0) / hits.length : 0,
      avgMissDuration: misses.length > 0 ? 
        misses.reduce((sum, m) => sum + (m.duration || 0), 0) / misses.length : 0
    };
  }

  getTimeSeriesData(operation?: string, intervalMs: number = 60000): Array<{
    timestamp: number;
    count: number;
    avgDuration: number;
    successRate: number;
  }> {
    let relevantMetrics = this._metrics.filter(m => m.endTime && m.duration !== undefined);
    
    if (operation) {
      relevantMetrics = relevantMetrics.filter(m => m.operation === operation);
    }

    if (relevantMetrics.length === 0) return [];

    const now = performance.now();
    const startTime = now - (24 * 60 * 60 * 1000); // Last 24 hours
    const intervals = Math.floor((now - startTime) / intervalMs);

    const timeSeries = [];
    
    for (let i = 0; i < intervals; i++) {
      const intervalStart = startTime + (i * intervalMs);
      const intervalEnd = intervalStart + intervalMs;
      
      const intervalMetrics = relevantMetrics.filter(m => 
        m.endTime! >= intervalStart && m.endTime! < intervalEnd
      );

      if (intervalMetrics.length === 0) {
        timeSeries.push({
          timestamp: intervalStart,
          count: 0,
          avgDuration: 0,
          successRate: 0
        });
        continue;
      }

      const successful = intervalMetrics.filter(m => m.success);
      const avgDuration = intervalMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / intervalMetrics.length;

      timeSeries.push({
        timestamp: intervalStart,
        count: intervalMetrics.length,
        avgDuration,
        successRate: successful.length / intervalMetrics.length
      });
    }

    return timeSeries;
  }

  // Reporting
  generatePerformanceReport(): string {
    const stats = this.stats;
    
    let report = `# STAC Performance Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Monitoring Enabled: ${this._isEnabled}\n`;
    report += `Total Metrics: ${this._metrics.length}\n\n`;

    report += `## Overall Statistics\n`;
    report += `- Total Operations: ${stats.totalOperations}\n`;
    report += `- Success Rate: ${(stats.successRate * 100).toFixed(2)}%\n`;
    report += `- Average Duration: ${stats.averageDuration.toFixed(2)}ms\n`;
    report += `- Median Duration: ${stats.medianDuration.toFixed(2)}ms\n`;
    report += `- 95th Percentile: ${stats.p95Duration.toFixed(2)}ms\n`;
    report += `- Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(2)}%\n`;
    report += `- Total Data Transferred: ${this.formatBytes(stats.totalDataTransferred)}\n\n`;

    report += `## Operations by Type\n`;
    Object.entries(stats.operationsByType)
      .sort(([,a], [,b]) => b - a)
      .forEach(([operation, count]) => {
        const operationStats = this.getOperationStats(operation);
        report += `- **${operation}**: ${count} ops, `;
        report += `${(operationStats.successRate! * 100).toFixed(1)}% success, `;
        report += `${operationStats.averageDuration!.toFixed(2)}ms avg\n`;
      });

    if (stats.slowestOperations.length > 0) {
      report += `\n## Slowest Operations\n`;
      stats.slowestOperations.slice(0, 5).forEach((metric, i) => {
        report += `${i + 1}. ${metric.operation} - ${metric.duration!.toFixed(2)}ms`;
        if (metric.url) report += ` (${metric.url})`;
        report += `\n`;
      });
    }

    if (stats.recentErrors.length > 0) {
      report += `\n## Recent Errors\n`;
      stats.recentErrors.forEach(error => {
        report += `- ${error.operation}: ${error.error}`;
        if (error.url) report += ` (${error.url})`;
        report += `\n`;
      });
    }

    const cachePerf = this.getCachePerformance();
    if (cachePerf.hitRate > 0) {
      report += `\n## Cache Performance\n`;
      report += `- Hit Rate: ${(cachePerf.hitRate * 100).toFixed(2)}%\n`;
      report += `- Avg Hit Duration: ${cachePerf.avgHitDuration.toFixed(2)}ms\n`;
      report += `- Avg Miss Duration: ${cachePerf.avgMissDuration.toFixed(2)}ms\n`;
      report += `- Cache Benefit: ${((cachePerf.avgMissDuration - cachePerf.avgHitDuration) / cachePerf.avgMissDuration * 100).toFixed(2)}% faster\n`;
    }

    return report;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  @action
  clear(): void {
    this._metrics = [];
    this._activeOperations.clear();
  }

  @action
  exportData(): any {
    return {
      metrics: this._metrics,
      stats: this.stats,
      timestamp: new Date().toISOString(),
      config: {
        enabled: this._isEnabled,
        maxMetrics: this._maxMetrics
      }
    };
  }
}