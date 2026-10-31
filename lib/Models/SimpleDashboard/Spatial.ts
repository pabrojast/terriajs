import type { Polygon } from "geojson";
import type Terria from "../Terria";
import type { DashboardBounds, DashboardState } from "./Types";

export function validBounds(value: unknown): value is DashboardBounds {
  const b = value as DashboardBounds | undefined;
  return (
    !!b &&
    [b.west, b.south, b.east, b.north].every(
      (n) => typeof n === "number" && Number.isFinite(n)
    ) &&
    b.west >= -180 &&
    b.west <= 180 &&
    b.east >= -180 &&
    b.east <= 180 &&
    b.south >= -90 &&
    b.north <= 90 &&
    b.south < b.north &&
    b.west !== b.east &&
    !(b.west === 180 && b.east === -180)
  );
}

export function boundsPolygons(b: DashboardBounds): Polygon[] {
  const spans =
    b.west < b.east
      ? [[b.west, b.east]]
      : [
          [b.west, 180],
          [-180, b.east]
        ];
  return spans
    .filter(([w, e]) => w !== e)
    .map(([w, e]) => ({
      type: "Polygon",
      coordinates: [
        [
          [w, b.south],
          [e, b.south],
          [e, b.north],
          [w, b.north],
          [w, b.south]
        ]
      ]
    }));
}

export function mapBounds(terria: Terria): DashboardBounds | undefined {
  if (terria.userProperties.get("dashboardOnly") === "1") return undefined;
  let b: DashboardBounds;
  if (terria.leaflet) {
    const value = terria.leaflet.map.getBounds();
    const wrap = (n: number) => ((((n + 180) % 360) + 360) % 360) - 180;
    const whole = value.getEast() - value.getWest() >= 360;
    b = {
      west: whole ? -180 : wrap(value.getWest()),
      east: whole ? 180 : wrap(value.getEast()),
      south: Math.max(-90, value.getSouth()),
      north: Math.min(90, value.getNorth())
    };
  } else if (terria.cesium) {
    const scene = terria.cesium.scene;
    const r = scene.camera.computeViewRectangle(scene.globe.ellipsoid);
    if (!r) return undefined;
    const degrees = (n: number) => (n * 180) / Math.PI;
    b = {
      west: degrees(r.west),
      south: degrees(r.south),
      east: degrees(r.east),
      north: degrees(r.north)
    };
  } else return undefined;
  return validBounds(b)
    ? (Object.fromEntries(
        Object.entries(b).map(([k, v]) => [k, Math.round(v * 1e7) / 1e7])
      ) as unknown as DashboardBounds)
    : undefined;
}

export function validDashboardState(value: unknown): value is DashboardState {
  if (!value || typeof value !== "object") return false;
  const state = value as DashboardState;
  if (
    [state.start, state.end].some(
      (v) =>
        v !== null &&
        v !== undefined &&
        (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    )
  )
    return false;
  const s = state.spatial;
  return (
    !s ||
    (["configured", "viewport", "fixed"].includes(s.mode) &&
      (!s.quality || ["quick", "native"].includes(s.quality)) &&
      (s.quality !== "native" || s.mode === "fixed") &&
      (s.mode === "configured" || validBounds(s.bounds)))
  );
}
