import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import Color from "terriajs-cesium/Source/Core/Color";
import {
  CogColorScaleMode,
  ColorScaleNames
} from "../../../Traits/TraitsClasses/CogCatalogItemTraits";
import { COG_COLOR_SCALES, COG_DEFAULT_COLOR_SCALE } from "./CogColorScales";

export type CogRange = [number, number];

export interface CogColorStop {
  position: number;
  color: string;
}

export interface CogEffectiveStyle {
  isSingleBand: boolean;
  domain?: CogRange;
  displayRange?: CogRange;
  applyDisplayRange: boolean;
  invalidDomain: boolean;
  invalidDisplayRange: boolean;
  clampLow: boolean;
  clampHigh: boolean;
  type: "continuous" | "discrete";
  numberOfBins: number;
  reverseColorScale: boolean;
  colorScaleName?: string;
  stops: CogColorStop[];
}

export interface CogSingleStyleInput {
  colorScaleMode?: CogColorScaleMode;
  colorScale?: ColorScaleNames;
  colors?: readonly (string | readonly [number, string])[];
  useRealValue?: boolean;
  type?: "continuous" | "discrete";
  domain?: readonly number[];
  displayRange?: readonly number[];
  applyDisplayRange?: boolean;
  clampLow?: boolean;
  clampHigh?: boolean;
  expression?: string;
  band?: number;
  numberOfBins?: number;
  reverseColorScale?: boolean;
  noDataColor?: string;
}

export interface CogRenderOptionsInput {
  single?: CogSingleStyleInput;
  nodata?: number;
  convertToRGB?: boolean;
  resampleMethod?: "nearest" | "bilinear";
}

/** Build only options understood by terriajs-tiff-imagery-provider. */
export function buildCogRenderOptions(
  options: CogRenderOptionsInput | undefined
): any | undefined {
  if (!options) return undefined;

  const single = options.single;
  const renderOptions: any = {};
  const singleOptions: any = {};

  if (hasSingleRenderIntent(single)) {
    singleOptions.band = single?.band ?? 1;

    const mode = getColorScaleMode(single);
    if (mode === "custom" && hasCustomColors(single?.colors)) {
      singleOptions.colors = copyColors(single!.colors!);
      singleOptions.useRealValue = single?.useRealValue ?? false;
    } else if (mode === "named" && single?.colorScale) {
      singleOptions.colorScale = single.colorScale;
    } else if (mode === "default") {
      singleOptions.colorScale = "blackwhite";
    }

    if (single?.type !== undefined) singleOptions.type = single.type;
    const domain = getValidDomain(single?.domain);
    if (domain) singleOptions.domain = domain;
    if (single?.expression !== undefined)
      singleOptions.expression = single.expression;

    const clampLow = single?.clampLow ?? true;
    singleOptions.clampLow = clampLow;
    singleOptions.clampHigh = single?.clampHigh ?? clampLow;

    // displayRange is finalized after provider statistics are available. This
    // avoids the provider's [min,max) interpretation and its [0,1] fallback.
    singleOptions.applyDisplayRange = false;
    renderOptions.single = singleOptions;
  }

  if (options.nodata !== undefined) renderOptions.nodata = options.nodata;
  if (options.convertToRGB !== undefined)
    renderOptions.convertToRGB = options.convertToRGB;
  if (options.resampleMethod !== undefined)
    renderOptions.resampleMethod = options.resampleMethod;

  return Object.keys(renderOptions).length > 0 ? renderOptions : undefined;
}

/**
 * Applies the final shared domain, palette and inclusive display range after
 * every provider in a (possibly mosaicked) timestep has loaded its metadata.
 */
export function finalizeCogProviders(
  providers: readonly TIFFImageryProvider[],
  single: CogSingleStyleInput | undefined
): CogEffectiveStyle | undefined {
  const singleProviders = providers.filter((provider) => provider.plot);
  if (singleProviders.length === 0) return undefined;

  const configuredDomain = getValidDomain(single?.domain);
  const domain =
    configuredDomain ??
    getAggregateProviderDomain(singleProviders, single?.band);
  const invalidDomain = single?.domain !== undefined && !configuredDomain;
  const configuredDisplayRange = getValidDisplayRange(single?.displayRange);
  const invalidDisplayRange =
    single?.displayRange !== undefined && !configuredDisplayRange;
  const applyDisplayRange =
    single?.applyDisplayRange === true && !invalidDisplayRange && !!domain;
  const displayRange = applyDisplayRange
    ? configuredDisplayRange ?? domain
    : undefined;
  const clampLow = single?.clampLow ?? true;
  const clampHigh = single?.clampHigh ?? clampLow;
  const type = single?.type ?? "continuous";
  const stops = resolveCogColorStops(single, domain);

  for (const provider of singleProviders) {
    const plot = provider.plot!;
    if (domain) plot.setDomain(domain.slice());
    plot.setClamp(clampLow, clampHigh);
    plot.setColorType(type);

    const canvas = createCogColorScaleCanvas(stops, type);
    if (canvas) {
      // plotty's 2D renderer reads colorScaleCanvas directly, while WebGL
      // reads colorScaleImage/textureScale through setColorScaleImage.
      (plot as any).colorScaleCanvas = canvas;
      plot.setColorScaleImage(canvas);
    }

    if (displayRange) {
      plot.setDisplayRange([
        displayRange[0],
        inclusiveProviderMaximum(displayRange[1], !!(plot as any).gl)
      ]);
    } else {
      plot.applyDisplayRange = false;
    }
  }

  const mode = getColorScaleMode(single);
  return {
    isSingleBand: singleProviders.length === providers.length,
    domain,
    displayRange,
    applyDisplayRange,
    invalidDomain,
    invalidDisplayRange,
    clampLow,
    clampHigh,
    type,
    numberOfBins: getLegendBinCount(single?.numberOfBins),
    reverseColorScale: single?.reverseColorScale ?? false,
    colorScaleName:
      mode === "named"
        ? single?.colorScale
        : mode === "default"
        ? "blackwhite"
        : undefined,
    stops
  };
}

export function getValidDomain(
  value: readonly number[] | undefined
): CogRange | undefined {
  if (
    value?.length !== 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    value[0] >= value[1]
  ) {
    return undefined;
  }
  return [value[0], value[1]];
}

export function getValidDisplayRange(
  value: readonly number[] | undefined
): CogRange | undefined {
  if (
    value?.length !== 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    value[0] > value[1]
  ) {
    return undefined;
  }
  return [value[0], value[1]];
}

export function getAggregateProviderDomain(
  providers: readonly TIFFImageryProvider[],
  band = 1
): CogRange | undefined {
  const ranges = providers
    .map((provider) => getProviderDomain(provider, band))
    .filter((range): range is CogRange => range !== undefined);
  if (ranges.length === 0) return undefined;
  return [
    Math.min(...ranges.map((range) => range[0])),
    Math.max(...ranges.map((range) => range[1]))
  ];
}

export function resolveCogColorStops(
  single: CogSingleStyleInput | undefined,
  domain: CogRange | undefined
): CogColorStop[] {
  const mode = getColorScaleMode(single);
  let stops: CogColorStop[];

  if (mode === "custom" && hasCustomColors(single?.colors)) {
    stops = customColorStops(
      single!.colors!,
      single?.useRealValue === true,
      domain
    );
  } else if (mode === "named" && single?.colorScale) {
    const definition = COG_COLOR_SCALES[single.colorScale];
    stops = definition.positions!.map((position, index) => ({
      position,
      color: definition.colors[index]
    }));
  } else {
    stops = COG_DEFAULT_COLOR_SCALE.positions.map((position, index) => ({
      position,
      color: COG_DEFAULT_COLOR_SCALE.colors[index]
    }));
  }

  stops = normalizeStops(stops);
  if (single?.reverseColorScale) {
    stops = stops
      .map((stop) => ({ position: 1 - stop.position, color: stop.color }))
      .reverse();
  }
  return normalizeStops(stops);
}

export function sampleCogColor(
  stops: readonly CogColorStop[],
  position: number,
  type: "continuous" | "discrete" = "continuous"
): string {
  if (stops.length === 0) return "#000000";
  const t = clamp01(position);
  if (type === "discrete") {
    let color = stops[0].color;
    for (const stop of stops) {
      if (stop.position > t) break;
      color = stop.color;
    }
    return color;
  }
  if (t <= stops[0].position) return stops[0].color;
  if (t >= stops[stops.length - 1].position)
    return stops[stops.length - 1].color;

  for (let index = 0; index < stops.length - 1; index++) {
    const start = stops[index];
    const end = stops[index + 1];
    if (t >= start.position && t <= end.position) {
      const local =
        start.position === end.position
          ? 0
          : (t - start.position) / (end.position - start.position);
      return interpolateCssColor(start.color, end.color, local);
    }
  }
  return stops[stops.length - 1].color;
}

/** Translate TerriaJS' inclusive maximum to plotty's exclusive maximum. */
export function inclusiveProviderMaximum(
  maximum: number,
  webGl: boolean
): number {
  return webGl ? nextFloat32(maximum) : nextFloat64(maximum);
}

function hasSingleRenderIntent(
  single: CogSingleStyleInput | undefined
): boolean {
  if (!single) return false;
  return [
    single.colorScaleMode,
    single.colorScale,
    hasCustomColors(single.colors) ? single.colors : undefined,
    single.useRealValue,
    single.type,
    single.domain,
    single.displayRange,
    single.applyDisplayRange,
    single.clampLow,
    single.clampHigh,
    single.expression,
    single.band,
    single.reverseColorScale
  ].some((value) => value !== undefined);
}

function getColorScaleMode(
  single: CogSingleStyleInput | undefined
): "default" | "named" | "custom" {
  if (single?.colorScaleMode) return single.colorScaleMode;
  if (hasCustomColors(single?.colors)) return "custom";
  if (single?.colorScale) return "named";
  return "default";
}

function hasCustomColors(
  colors: readonly (string | readonly [number, string])[] | undefined
): boolean {
  return Array.isArray(colors) && colors.length > 0;
}

function copyColors(
  colors: readonly (string | readonly [number, string])[]
): any[] {
  return colors.map((color) => (Array.isArray(color) ? [...color] : color));
}

function customColorStops(
  colors: readonly (string | readonly [number, string])[],
  useRealValue: boolean,
  domain: CogRange | undefined
): CogColorStop[] {
  if (typeof colors[0] === "string") {
    const stringColors = colors as readonly string[];
    return stringColors.map((color, index) => ({
      position:
        stringColors.length === 1 ? 0 : index / (stringColors.length - 1),
      color
    }));
  }

  return (colors as readonly (readonly [number, string])[]).map(
    ([value, color]) => ({
      position:
        useRealValue && domain
          ? domain[0] === domain[1]
            ? 0
            : (value - domain[0]) / (domain[1] - domain[0])
          : value,
      color
    })
  );
}

function normalizeStops(stops: CogColorStop[]): CogColorStop[] {
  const normalized = stops
    .filter(
      (stop) => Number.isFinite(stop.position) && typeof stop.color === "string"
    )
    .map((stop) => ({ position: clamp01(stop.position), color: stop.color }))
    .sort((a, b) => a.position - b.position);
  if (normalized.length === 0) {
    return [
      { position: 0, color: "#000000" },
      { position: 1, color: "#ffffff" }
    ];
  }
  if (normalized[0].position > 0) {
    normalized.unshift({ position: 0, color: normalized[0].color });
  }
  if (normalized[normalized.length - 1].position < 1) {
    normalized.push({
      position: 1,
      color: normalized[normalized.length - 1].color
    });
  }
  return normalized;
}

function getProviderDomain(
  provider: TIFFImageryProvider,
  band: number
): CogRange | undefined {
  const plotDomain = getFiniteProviderRange(provider.plot?.domain);
  if (plotDomain) return plotDomain;
  const bandStats = provider.bands?.[band];
  return getFiniteProviderRange(
    bandStats ? [Number(bandStats.min), Number(bandStats.max)] : undefined
  );
}

function getFiniteProviderRange(
  value: readonly number[] | undefined
): CogRange | undefined {
  if (
    value?.length !== 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    value[0] > value[1]
  ) {
    return undefined;
  }
  return [value[0], value[1]];
}

function getLegendBinCount(value: number | undefined): number {
  return Number.isFinite(value) && value! > 0
    ? Math.max(2, Math.min(30, Math.floor(value!)))
    : 8;
}

function createCogColorScaleCanvas(
  stops: readonly CogColorStop[],
  type: "continuous" | "discrete"
): HTMLCanvasElement | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  // plotty's 2D renderer clamps palette indices at 255, so this must remain
  // 256 pixels wide even though WebGL accepts larger textures.
  canvas.width = 256;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  if (type === "continuous") {
    const gradient = context.createLinearGradient(0, 0, canvas.width, 1);
    for (const stop of stops) gradient.addColorStop(stop.position, stop.color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, 1);
  } else {
    for (let index = 0; index < stops.length; index++) {
      const start = stops[index].position * canvas.width;
      const end = (stops[index + 1]?.position ?? 1) * canvas.width;
      context.fillStyle = stops[index].color;
      context.fillRect(start, 0, Math.max(0, end - start), 1);
    }
  }
  return canvas;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolateCssColor(start: string, end: string, t: number): string {
  const a = Color.fromCssColorString(start);
  const b = Color.fromCssColorString(end);
  if (!a || !b) return t < 0.5 ? start : end;
  const channel = (name: "red" | "green" | "blue") =>
    Math.round((a[name] + (b[name] - a[name]) * t) * 255)
      .toString(16)
      .padStart(2, "0");
  const alpha = a.alpha + (b.alpha - a.alpha) * t;
  const rgb = `#${channel("red")}${channel("green")}${channel("blue")}`;
  return alpha === 1
    ? rgb
    : `${rgb}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`;
}

function nextFloat32(value: number): number {
  if (!Number.isFinite(value)) return value;
  const buffer = new ArrayBuffer(4);
  const float = new Float32Array(buffer);
  const bits = new Uint32Array(buffer);
  float[0] = value;
  if (float[0] > value) return float[0];
  if (Object.is(float[0], -0) || float[0] === 0) return 2 ** -149;
  if (float[0] > 0) bits[0] += 1;
  else bits[0] -= 1;
  return float[0];
}

function nextFloat64(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (Object.is(value, -0) || value === 0) return Number.MIN_VALUE;

  const buffer = new ArrayBuffer(8);
  const float = new Float64Array(buffer);
  const words = new Uint32Array(buffer);
  float[0] = value;
  const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const lowIndex = littleEndian ? 0 : 1;
  const highIndex = littleEndian ? 1 : 0;

  if (value > 0) {
    words[lowIndex] += 1;
    if (words[lowIndex] === 0) words[highIndex] += 1;
  } else if (words[lowIndex] === 0) {
    words[highIndex] -= 1;
    words[lowIndex] = 0xffffffff;
  } else {
    words[lowIndex] -= 1;
  }
  return float[0];
}
