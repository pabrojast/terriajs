/**
 * Shared, colourblind-safe palette and line-style helpers for the Chart.js
 * renderer. This module deliberately does NOT import chart.js so it can be used
 * by light components (the legend) and by the feature-info pick hook without
 * pulling the heavy chart.js chunk into the main bundle.
 */

/**
 * Okabe–Ito 8-colour qualitative palette — designed to remain distinguishable
 * for the most common forms of colour-vision deficiency. Pure black is replaced
 * with a mid grey so series stay visible on the dark chart background.
 *
 * @see https://jfly.uni-koeln.de/color/
 */
export const OKABE_ITO_PALETTE: readonly string[] = [
  "#0072B2", // blue
  "#E69F00", // orange
  "#009E73", // bluish green
  "#D55E00", // vermillion
  "#CC79A7", // reddish purple
  "#56B4E9", // sky blue
  "#F0E442", // yellow
  "#999999" // grey (substitutes pure black on dark backgrounds)
];

/**
 * Pick a colourblind-safe colour for the series at `index`, cycling through the
 * Okabe–Ito palette so each accumulated series gets a distinct hue.
 */
export function paletteColor(index: number): string {
  return OKABE_ITO_PALETTE[index % OKABE_ITO_PALETTE.length];
}

/**
 * Line dash patterns cycled per series (in addition to colour) so overlapping,
 * similarly-coloured lines stay distinguishable without relying on colour alone.
 * The first entry (`[]`) is a solid line.
 */
export const SERIES_DASH_PATTERNS: readonly number[][] = [
  [], // solid
  [6, 3],
  [2, 2],
  [8, 3, 2, 3],
  [10, 4]
];

/** Pick a dash pattern for the series at `index`, cycling the patterns above. */
export function seriesDash(index: number): number[] {
  return SERIES_DASH_PATTERNS[index % SERIES_DASH_PATTERNS.length];
}

/**
 * Return `color` with its alpha set to `alpha` (0–1). Handles hex (`#rgb` /
 * `#rrggbb`) and `rgb()`/`rgba()` inputs; any other format is returned
 * unchanged so the original colour is still used.
 */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));

  const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  const rgbMatch = /^rgba?\(\s*([^)]+)\)$/i.exec(color.trim());
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((p) => p.trim());
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }

  return color;
}
