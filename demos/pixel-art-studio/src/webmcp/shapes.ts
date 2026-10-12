/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Procedural pixel shapes for draw_shape_preset. */
import type { Point } from "./helpers";

export const SHAPES = [
  "heart",
  "star",
  "circle",
  "diamond",
  "sparkle",
  "moon",
  "sun",
  "cloud",
] as const;
export type Shape = (typeof SHAPES)[number];

const STAR = Array.from({ length: 10 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 5,
    r = k % 2 ? 0.42 : 1;
  return [Math.cos(a) * r, Math.sin(a) * r + 0.08];
});
const CLOUD = [
  [-0.5, 0.25, 0.42],
  [0, -0.05, 0.55],
  [0.5, 0.2, 0.45],
  [0.05, 0.35, 0.4],
];

function inPolygon(u: number, w: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > w !== yj > w && u < ((xj - xi) * (w - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Classify unit-space point (u, w) ∈ [-1, 1]²: 0 = outside, 1 = body, 2 = accent (sun rays). */
function sample(shape: Shape, u: number, w: number): 0 | 1 | 2 {
  switch (shape) {
    case "circle":
      return u * u + w * w <= 1 ? 1 : 0;
    case "diamond":
      return Math.abs(u) + Math.abs(w) <= 1 ? 1 : 0;
    case "sparkle":
      return Math.sqrt(Math.abs(u)) + Math.sqrt(Math.abs(w)) <= 1 ? 1 : 0;
    case "heart": {
      const X = u * 1.22,
        Y = -w * 1.22 + 0.32;
      return (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0 ? 1 : 0;
    }
    case "star":
      return inPolygon(u, w, STAR) ? 1 : 0;
    case "moon":
      return u * u + w * w <= 1 && (u - 0.45) ** 2 + (w + 0.2) ** 2 > 0.62 ? 1 : 0;
    case "sun": {
      const d = Math.hypot(u, w);
      if (d <= 0.56) return 1;
      const ray = Math.abs(((((Math.atan2(w, u) / (Math.PI / 4)) % 1) + 1) % 1) - 0.5);
      return d > 0.7 && d <= 1 && ray > 0.38 ? 2 : 0;
    }
    case "cloud":
      return CLOUD.some(([cx, cy, r]) => (u - cx) ** 2 + (w - cy) ** 2 <= r * r) && w <= 0.62
        ? 1
        : 0;
  }
}

export const isShape = (v: unknown): v is Shape => SHAPES.includes(v as Shape);

/** Rasterize a shape centred at (x, y) with the given diameter. */
export function shapePoints(
  shape: Shape,
  x: number,
  y: number,
  size: number,
  filled: boolean,
): { body: Point[]; accent: Point[] } {
  const body: Point[] = [],
    accent: Point[] = [],
    r = size / 2;
  const at = (X: number, Y: number) => sample(shape, (X + 0.5 - x) / r, (Y + 0.5 - y) / r);
  for (let Y = Math.floor(y - r) - 1; Y <= y + r + 1; Y++) {
    for (let X = Math.floor(x - r) - 1; X <= x + r + 1; X++) {
      const k = at(X, Y);
      if (!k) continue;
      if (!filled && at(X - 1, Y) && at(X + 1, Y) && at(X, Y - 1) && at(X, Y + 1)) continue;
      (k === 2 ? accent : body).push([X, Y]);
    }
  }
  return { body, accent };
}
