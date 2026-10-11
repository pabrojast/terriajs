/** Native pilot analytics. Body summaries never come from display COG pixels. */
export interface WaterProduct {
  unit: string;
  label: Record<string, string>;
  breaks: number[];
  classes: Record<string, string[]>;
  firstDate?: string;
  lastDate?: string;
}
export interface WaterMeta {
  generatedAt: string;
  region: string;
  source: string;
  sourceVersion?: string;
  sourceId?: string;
  analysisGeometrySha256?: string;
  minCoverage: number;
  minMonthsFullYear: number;
  regionalSummaryAvailable?: boolean;
  bodyCutoffs?: Record<string, string>;
  products: Record<string, WaterProduct>;
  productOrder: string[];
  years: string[];
  months: string[];
  days?: string[];
}
export interface WaterBody {
  id: number;
  name: string | null;
  nameEn?: string;
  nameUk?: string;
  kind: string;
  area: number;
  lon: number;
  lat: number;
  bbox: number[];
  note?: Record<string, string>;
}
export interface WaterSeries {
  ids: number[];
  years: string[];
  months: string[];
  annual: (number | null)[][];
  annualMonths: number[][];
  monthly: (number | null)[][];
  monthlyDays: number[][];
  lastValid?: (string | null)[];
}
export interface WaterObservations {
  date: string[];
  acquisitionTimes?: string[][];
  cov: number[];
  med: (number | null)[];
  mean: (number | null)[];
  p10: (number | null)[];
  p90: (number | null)[];
  n: number[];
}
export interface WaterDetail {
  id: number;
  products: Record<string, WaterObservations>;
}
export type WaterResolution = "annual" | "monthly" | "daily";
export interface WaterPoint {
  date: string;
  value: number | null;
  coverage?: number;
  count?: number;
  partial?: boolean;
}

export function waterPeriodCrossesCutoff(
  date: string,
  cutoff: string
): boolean {
  const start =
    date.length === 4
      ? `${date}-01-01`
      : date.length === 7
      ? `${date}-01`
      : date;
  const end =
    date.length === 4
      ? `${date}-12-31`
      : date.length === 7
      ? new Date(
          Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)
        )
          .toISOString()
          .slice(0, 10)
      : date;
  return start <= cutoff && end > cutoff;
}

/** Loader fails closed on SPA fallbacks and never memoizes a failed response. */
const cache = new Map<string, Promise<unknown>>();
export function loadWaterJson<T>(base: string, path: string): Promise<T> {
  const url = `${base.replace(/\/$/, "")}/${path}`;
  let result = cache.get(url);
  if (!result) {
    result = fetch(url).then(async (response) => {
      if (!response.ok)
        throw new Error(`Data request failed (${response.status})`);
      if (!(response.headers.get("content-type") ?? "").includes("json")) {
        throw new Error("Expected JSON data, received another content type");
      }
      return response.json();
    });
    cache.set(url, result);
    result.catch(() => cache.delete(url));
  }
  return result as Promise<T>;
}

export function waterBodyName(body: WaterBody, language: string): string {
  return (
    (language === "uk" ? body.nameUk : body.nameEn) ||
    body.name ||
    `Water body ${body.id}`
  );
}

/** Acquisitions below coverage are kept with null values, never interpolated. */
export function waterBodyPoints(
  bodyId: number,
  series: WaterSeries,
  detail: WaterDetail | undefined,
  product: string,
  resolution: WaterResolution,
  meta: WaterMeta
): WaterPoint[] {
  const cutoff = meta.bodyCutoffs?.[String(bodyId)];
  if (resolution === "daily") {
    const rows = detail?.products[product];
    if (!rows) return [];
    const index = new Map(rows.date.map((date, i) => [date, i]));
    return (meta.days ?? rows.date).map((date) => {
      const i = index.get(date);
      return {
        date,
        value:
          i !== undefined &&
          rows.cov[i] >= meta.minCoverage &&
          (!cutoff || date <= cutoff)
            ? rows.med[i]
            : null,
        coverage: i !== undefined ? rows.cov[i] : 0,
        count: i !== undefined ? rows.n[i] : 0
      };
    });
  }
  const index = series.ids.indexOf(bodyId);
  const dates = resolution === "annual" ? series.years : series.months;
  const matrix = resolution === "annual" ? series.annual : series.monthly;
  const counts =
    resolution === "annual" ? series.annualMonths : series.monthlyDays;
  return dates.map((date, i) => ({
    date,
    value: index >= 0 ? matrix[index]?.[i] ?? null : null,
    count: index >= 0 ? counts[index]?.[i] : undefined,
    partial:
      (resolution === "annual" &&
        (index < 0 || counts[index]?.[i] < meta.minMonthsFullYear)) ||
      (!!cutoff && waterPeriodCrossesCutoff(date, cutoff))
  }));
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface WaterTrend {
  slope: number;
  p: number;
  years: number;
}
/** Theil–Sen + two-sided Mann–Kendall with ties and continuity correction. */
export function waterTrend(points: WaterPoint[]): WaterTrend | undefined {
  const annual = points.filter(
    (point) =>
      /^\d{4}$/.test(point.date) &&
      !point.partial &&
      point.value !== null &&
      Number.isFinite(point.value)
  );
  if (annual.length < 5) return undefined;
  const slopes: number[] = [];
  let s = 0;
  for (let i = 0; i < annual.length - 1; i++) {
    for (let j = i + 1; j < annual.length; j++) {
      const dx = Number(annual[j].date) - Number(annual[i].date);
      if (dx === 0) continue;
      const dy = annual[j].value! - annual[i].value!;
      slopes.push(dy / dx);
      s += Math.sign(dy);
    }
  }
  const n = annual.length;
  const ties = new Map<number, number>();
  annual.forEach((point) =>
    ties.set(point.value!, (ties.get(point.value!) ?? 0) + 1)
  );
  let variance = n * (n - 1) * (2 * n + 5);
  ties.forEach((count) => {
    if (count > 1) variance -= count * (count - 1) * (2 * count + 5);
  });
  variance /= 18;
  const z =
    variance > 0 ? Math.abs((s - Math.sign(s)) / Math.sqrt(variance)) : 0;
  const t = 1 / (1 + 0.2316419 * z);
  const tail =
    0.3989423 *
    Math.exp((-z * z) / 2) *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return { slope: median(slopes), p: Math.min(1, 2 * tail), years: n };
}

export function waterClass(
  value: number | null | undefined,
  product: WaterProduct,
  language: string
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  const classes = product.classes[language] ?? product.classes.en ?? [];
  return (
    classes[product.breaks.filter((limit) => value >= limit).length] ?? "—"
  );
}

export function waterCsv(
  meta: WaterMeta,
  product: string,
  body: WaterBody,
  points: WaterPoint[],
  resolution: WaterResolution,
  observations?: WaterObservations
): string {
  const quote = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    `# Source: ${meta.source}; version: ${
      meta.sourceVersion ?? "unspecified"
    }; generated: ${meta.generatedAt}`,
    `# Unit: ${meta.products[product].unit}; analysis: water-body core; body: ${body.id}`,
    `# Coverage threshold: ${meta.minCoverage}; monthly: median of daily medians; annual: mean of monthly medians`,
    `# Minimum months for annual trend: ${meta.minMonthsFullYear}; trend requires five valid years; no interpolation`,
    `# Satellite screening; operational classes are not regulatory thresholds`,
    `# Geometry SHA256: ${meta.analysisGeometrySha256 ?? "not supplied"}`,
    `# Body valid through: ${
      meta.bodyCutoffs?.[String(body.id)] ?? "no temporal cutoff"
    }`,
    "body_id,name,product,resolution,date,value,unit,coverage,valid_pixels_or_periods,partial,acquisition_times_utc,observed_median"
  ];
  points.forEach((point) => {
    const row = observations?.date.indexOf(point.date) ?? -1;
    lines.push(
      [
        body.id,
        body.name,
        product,
        resolution,
        point.date,
        point.value,
        meta.products[product].unit,
        point.coverage,
        point.count,
        point.partial ?? false,
        row >= 0 ? observations?.acquisitionTimes?.[row]?.join(";") : "",
        row >= 0 ? observations?.med[row] : ""
      ]
        .map(quote)
        .join(",")
    );
  });
  return lines.join("\n");
}
