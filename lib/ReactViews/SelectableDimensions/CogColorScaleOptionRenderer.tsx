import { ReactChild } from "react";
import { OptionRenderer } from "../../Models/SelectableDimensions/SelectableDimensions";
import { COG_COLOR_SCALES } from "../../Models/Catalog/CatalogItems/CogColorScales";
import { ColorScaleNames } from "../../Traits/TraitsClasses/CogCatalogItemTraits";

const height = 20;
const width = 200;

/**
 * Interpolates between two hex colors
 */
function interpolateColor(
  color1: string,
  color2: string,
  factor: number
): string {
  const hex = (c: string) => parseInt(c, 16);
  const c1 = color1.replace("#", "");
  const c2 = color2.replace("#", "");

  const r1 = hex(c1.substring(0, 2));
  const g1 = hex(c1.substring(2, 4));
  const b1 = hex(c1.substring(4, 6));

  const r2 = hex(c2.substring(0, 2));
  const g2 = hex(c2.substring(2, 4));
  const b2 = hex(c2.substring(4, 6));

  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);

  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Generates an array of colors for the gradient based on color scale definition
 */
function generateGradientColors(
  colors: string[],
  positions?: number[],
  steps: number = width
): string[] {
  if (colors.length === 0) return [];
  if (colors.length === 1) return Array(steps).fill(colors[0]);

  // Create position array if not provided (evenly spaced)
  const pos =
    positions && positions.length === colors.length
      ? positions
      : colors.map((_, i) => i / (colors.length - 1));

  const result: string[] = [];

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);

    // Find which segment this t value falls into
    let segmentIndex = 0;
    for (let j = 0; j < pos.length - 1; j++) {
      if (t >= pos[j] && t <= pos[j + 1]) {
        segmentIndex = j;
        break;
      }
    }

    // Calculate local t within this segment
    const segmentStart = pos[segmentIndex];
    const segmentEnd = pos[segmentIndex + 1];
    const localT =
      segmentEnd === segmentStart
        ? 0
        : (t - segmentStart) / (segmentEnd - segmentStart);

    result.push(
      interpolateColor(colors[segmentIndex], colors[segmentIndex + 1], localT)
    );
  }

  return result;
}

/**
 * Renders a color ramp for a COG color scale
 */
function ramp(scaleName: string | undefined): ReactChild {
  if (!scaleName) {
    return <span style={{ color: "#ccc" }}>Select a color scale</span>;
  }

  const scale = COG_COLOR_SCALES[scaleName as ColorScaleNames];
  if (!scale) {
    return <span style={{ color: "#ccc" }}>Unknown scale: {scaleName}</span>;
  }

  const colors = generateGradientColors(scale.colors, scale.positions);

  // Create canvas for smooth gradient
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 1;
  const context = canvas.getContext("2d");

  if (!context) {
    // Fallback to SVG if canvas fails
    return (
      <svg
        viewBox={`0 0 ${scale.colors.length} 1`}
        preserveAspectRatio="none"
        style={{
          display: "block",
          shapeRendering: "crispEdges",
          height: `${height}px`,
          width: "100%",
          maxWidth: `${width}px`
        }}
      >
        {scale.colors.map((c, i) => (
          <rect key={i} x={i} width={1} height={1} fill={c} />
        ))}
      </svg>
    );
  }

  // Draw gradient on canvas
  for (let i = 0; i < colors.length; i++) {
    context.fillStyle = colors[i];
    context.fillRect(i, 0, 1, 1);
  }

  const displayName = scaleName.charAt(0).toUpperCase() + scaleName.slice(1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        width: "100%"
      }}
    >
      <span style={{ fontSize: "12px", fontWeight: 500 }}>{displayName}</span>
      <img
        style={{
          height: `${height}px`,
          width: "100%",
          maxWidth: `${width}px`,
          imageRendering: "auto",
          borderRadius: "2px"
        }}
        src={canvas.toDataURL("image/png")}
        alt={`${displayName} color scale`}
      />
    </div>
  );
}

/**
 * Option renderer for COG color scales that displays a visual color ramp
 */
export const CogColorScaleOptionRenderer: OptionRenderer = (option) =>
  ramp(option.value);
