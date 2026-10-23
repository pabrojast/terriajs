import type { Polygon, Position } from "geojson";

/** Normalize a user-drawn, simple ring without silently repairing its shape. */
export default function createAreaPolygon(
  points: readonly Position[]
): Polygon | undefined {
  const same = (a: Position, b: Position) =>
    Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
  const ring = points
    .filter((p, i) => i === 0 || !same(p, points[i - 1]))
    .map((p) => [p[0], p[1]]);
  if (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop();
  if (ring.length < 3 || ring.some((p) => !p.every(Number.isFinite))) return;
  // Unwrap longitude for local areas crossing the antimeridian.
  const flat = ring.map((p) => [...p]);
  for (let i = 1; i < flat.length; i++) {
    while (flat[i][0] - flat[i - 1][0] > 180) flat[i][0] -= 360;
    while (flat[i][0] - flat[i - 1][0] < -180) flat[i][0] += 360;
  }
  const cross = (a: Position, b: Position, c: Position) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: Position, b: Position, p: Position) =>
    Math.abs(cross(a, b, p)) < 1e-12 &&
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1]);
  const n = flat.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = flat[i],
      b = flat[(i + 1) % n];
    area += cross(flat[0], a, b);
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = flat[j],
        d = flat[(j + 1) % n];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      )
        return;
    }
  }
  if (Math.abs(area) < 1e-12) return;
  return { type: "Polygon", coordinates: [[...ring, [...ring[0]]]] };
}
