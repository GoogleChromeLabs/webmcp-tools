/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Studio helpers shared by tool groups: layer lookup, painting, row encoding, state snapshots. */
import { CHARSET, cssToU32, type Change, type Layer } from "../model";
import type { ToolContext } from "./types";

export type Point = [number, number];
export type ColoredPoint = [number, number, number];
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createHelpers({ studio }: ToolContext) {
  /** Resolve a layer reference (id, name, numeric index or index string); default = active. */
  const layer = (ref: unknown): Layer => {
    if (ref === undefined || ref === null || ref === "") return studio.findLayer();
    return studio.findLayer(/^\d+$/.test(String(ref)) ? Number(ref) : String(ref));
  };

  /** Paint points as one undoable step. Uncoloured points use `color` (default primary). */
  const paint = (
    label: string,
    layerRef: unknown,
    points: (Point | ColoredPoint)[],
    color?: unknown,
    clip = false,
  ): Change[] => {
    const targetLayer = layer(layerRef),
      fallback = studio.color(color);
    studio.begin(label, targetLayer);
    for (const point of points)
      studio.set(
        point[0],
        point[1],
        point.length > 2 ? (point as ColoredPoint)[2] : fallback,
        clip,
        targetLayer,
      );
    return studio.end("agent");
  };

  /** Decode paint_rows strings at (x0, y0) into coloured points; collects unknown chars. */
  const rowsToPoints = (
    x0: number,
    y0: number,
    rows: string[],
    legend?: Record<string, string>,
    mask?: (x: number, y: number) => boolean,
  ) => {
    const points: ColoredPoint[] = [],
      cache = new Map<string, number>(),
      unknown = new Set<string>();
    rows.forEach((row, dy) =>
      [...String(row)].forEach((paintChar, dx) => {
        if (paintChar === "." || paintChar === " ") return;
        const x = x0 + dx,
          y = y0 + dy;
        if (x < 0 || y < 0 || x >= studio.w || y >= studio.h || (mask && !mask(x, y))) return;
        let color = cache.get(paintChar);
        if (color === undefined) {
          if (paintChar === "~") color = 0;
          else if (legend?.[paintChar] !== undefined) color = studio.color(legend[paintChar]);
          else {
            const paletteIndex = CHARSET.indexOf(paintChar);
            if (paletteIndex >= 0 && paletteIndex < studio.palette.length)
              color = cssToU32(studio.palette[paletteIndex]) ?? undefined;
          }
          if (color === undefined) {
            unknown.add(paintChar);
            return;
          }
          cache.set(paintChar, color);
        }
        points.push([x, y, color]);
      }),
    );
    return { points, unknown: [...unknown] };
  };

  const paletteInfo = () =>
    studio.palette.map((hex, index) => ({ index, char: CHARSET[index], hex }));

  const layersInfo = () =>
    studio.layers.map((entry, index) => ({
      index,
      id: entry.id,
      name: entry.name,
      visible: entry.visible,
      opacity: entry.opacity,
      active: index === studio.active,
      filled_pixels: entry.data.reduce((count, pixel) => count + (pixel ? 1 : 0), 0),
    }));

  const selectionInfo = () => {
    const selection = studio.selection;
    if (!selection) return null;
    return {
      kind: selection.kind,
      x: selection.x,
      y: selection.y,
      width: selection.w,
      height: selection.h,
      pixel_count: selection.mask.reduce((count, inside) => count + inside, 0),
      ...(selection.kind === "lasso" && {
        mask_rows: studio.maskRows(),
        mask_legend: '"#" = inside selection, "." = outside',
      }),
    };
  };

  const canvasInfo = () => ({
    width: studio.w,
    height: studio.h,
    palette_name: studio.paletteName,
    palette: paletteInfo(),
    primary_color: studio.primary,
    secondary_color: studio.secondary,
    layers: layersInfo(),
    active_layer: studio.layer.id,
    selection: selectionInfo(),
    can_undo: studio.undoStack.length,
    can_redo: studio.redoStack.length,
    svg_viewbox: `0 0 ${studio.w} ${studio.h}`,
    workflow:
      "To draw a picture: block in big shapes with draw_svg (in svg_viewbox coordinates), add small details with paint_rows, then check the result with get_region_pixels.",
    encoding:
      'paint_rows/get_region_pixels use one char per pixel: palette[i].char; "." = unchanged/transparent, "~" = erase. Origin (0,0) is top-left.',
  });

  /** Explicit rect, else the selection bounds, else the whole canvas. */
  const regionOf = (rect?: { x: number; y: number; width: number; height: number }): Rect => {
    if (rect) return { x: rect.x | 0, y: rect.y | 0, w: rect.width | 0, h: rect.height | 0 };
    if (studio.selection)
      return {
        x: studio.selection.x,
        y: studio.selection.y,
        w: studio.selection.w,
        h: studio.selection.h,
      };
    return { x: 0, y: 0, w: studio.w, h: studio.h };
  };

  return {
    layer,
    paint,
    rowsToPoints,
    paletteInfo,
    layersInfo,
    selectionInfo,
    canvasInfo,
    regionOf,
  };
}

export type Helpers = ReturnType<typeof createHelpers>;

/** Bayer matrix size for a dither option name (default bayer4). */
export const ditherSize = (dither?: string): number =>
  dither === "none" ? 0 : dither === "bayer2" ? 2 : dither === "bayer8" ? 8 : 4;

/**
 * Rows of different lengths are the usual sign of misaligned, hand-typed art (models lose
 * count of repeated chars). Returns an agent-facing warning, or undefined when rows line up.
 */
export function rowLengthWarning(rows: unknown[]): string | undefined {
  if (rows.length < 2) return undefined;
  const lengths = rows.map((row) => [...String(row)].length);
  const min = Math.min(...lengths),
    max = Math.max(...lengths);
  return min === max
    ? undefined
    : `Rows have different lengths (${min}–${max} chars). Rows are left-aligned at x, so pad them to the same length or the art will look skewed.`;
}

/** Repeat an action up to `steps` times, stopping when it returns null. */
export function repeat(steps: number | undefined, fn: () => string | null): string[] {
  const done: string[] = [];
  for (let k = 0; k < (steps ?? 1); k++) {
    const label = fn();
    if (!label) break;
    done.push(label);
  }
  return done;
}
