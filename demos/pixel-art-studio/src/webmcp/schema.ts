/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Shared JSON Schema fragments so every tool describes common params identically. */
import type { JsonSchema, ToolInput } from "./types";

export const int = (description: string, minimum?: number, maximum?: number): JsonSchema => ({
  type: "integer",
  description,
  ...(minimum !== undefined && { minimum }),
  ...(maximum !== undefined && { maximum }),
});
export const bool = (description: string): JsonSchema => ({ type: "boolean", description });
export const str = (description: string): JsonSchema => ({ type: "string", description });
export const oneOf = (values: readonly (string | number)[], description: string): JsonSchema => ({
  type: typeof values[0] === "number" ? "integer" : "string",
  enum: [...values],
  description,
});

export const LAYER = str(
  'Target layer: id (e.g. "L2"), name, or 0-based index as a string. Defaults to the active layer.',
);
export const COLOR = str(
  'Color: "#rrggbb", any CSS color, a palette index or char from get_canvas_info, or "transparent" to erase. Default: the primary color.',
);
export const COLOR_LIST = (description: string, minItems?: number): JsonSchema => ({
  type: "array",
  items: { type: "string" },
  description,
  ...(minItems !== undefined && { minItems }),
});
export const RECT = {
  x: int("Left edge in pixels (0 = left)."),
  y: int("Top edge in pixels (0 = top)."),
  width: int("Width in pixels.", 1),
  height: int("Height in pixels.", 1),
};
export const REGION: JsonSchema = {
  type: "object",
  description:
    "Rectangle in pixel coordinates. If omitted, the current selection is used, else the whole canvas.",
  properties: RECT,
  required: ["x", "y", "width", "height"],
};
export const DITHER = oneOf(
  ["none", "bayer2", "bayer4", "bayer8"],
  "Ordered (Bayer) dithering matrix used to blend between color stops. Default bayer4.",
);
export const DIRECTION = oneOf(
  ["vertical", "horizontal", "diagonal", "diagonal-up", "radial"],
  "Gradient direction. vertical = first color at top. Default vertical.",
);
export const FILLED = bool("Fill the shape (true, default) or draw only its outline (false).");
export const ROWS: JsonSchema = {
  type: "array",
  items: { type: "string" },
  description:
    'One string per pixel row, top to bottom, all the same length. Each char is a palette char or a legend char; "." = unchanged, "~" = erase.',
};
export const LEGEND: JsonSchema = {
  type: "object",
  additionalProperties: { type: "string" },
  description:
    'Optional extra char → color map (e.g. {"P":"#ff77a8"}) overriding palette chars for this call.',
};
export const STEPS = int("How many steps (default 1).", 1, 50);

/** Throws a descriptive, agent-actionable error when integer params are missing. */
export function requireInts(input: ToolInput, keys: string[]): void {
  const bad = keys.filter(
    (k) => input[k] === null || input[k] === "" || !Number.isFinite(Number(input[k])),
  );
  if (bad.length) throw new Error(`Missing or non-numeric parameter(s): ${bad.join(", ")}`);
}
