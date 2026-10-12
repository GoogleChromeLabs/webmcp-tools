/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Drawing tools: SVG scenes, pixels, primitives, fills, presets and compact paint_rows. */
import { u32ToHex } from "../../model";
import {
  bool,
  COLOR,
  COLOR_LIST,
  DIRECTION,
  DITHER,
  FILLED,
  int,
  LAYER,
  LEGEND,
  oneOf,
  RECT,
  REGION,
  requireInts,
  ROWS,
  str,
} from "../schema";
import {
  ditherSize,
  rowLengthWarning,
  type ColoredPoint,
  type Helpers,
  type Point,
} from "../helpers";
import { isShape, SHAPES, shapePoints } from "../shapes";
import { normalizeSvg, quantize, renderSvg } from "../svg";
import type { ToolContext, ToolSpec } from "../types";

export function drawTools({ studio }: ToolContext, helpers: Helpers): ToolSpec[] {
  return [
    {
      name: "draw_svg",
      description:
        "Draw shapes or a whole picture from SVG markup: the best way to compose scenes and objects. Coordinates are canvas pixels (svg_viewbox from get_canvas_info). Use rect, circle, ellipse, line, polygon and path with solid fill and stroke colors. Edges render crisp, colors snap to the palette, and outline adds a 1-px pixel-art outline. Paint the background first and small details last, then check with get_region_pixels.",
      inputSchema: {
        type: "object",
        properties: {
          svg: str(
            'SVG markup, e.g. <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="9" fill="#ffc145"/></svg>. Max 20,000 chars.',
          ),
          region: {
            ...REGION,
            description: "Rectangle the SVG viewBox is fitted into. Default: the whole canvas.",
          },
          outline: {
            ...COLOR,
            description:
              'Optional 1-px outline color around the drawn shapes (classic pixel-art look), e.g. "#1b0f3b".',
          },
          snap_to_palette: bool(
            "Snap colors to the current palette (default true). False keeps the exact SVG colors.",
          ),
          layer: LAYER,
        },
        required: ["svg"],
      },
      execute: async (input, { signal }) => {
        if (input.region !== undefined)
          requireInts(input.region ?? {}, ["x", "y", "width", "height"]);
        const region = input.region
          ? helpers.regionOf(input.region)
          : { x: 0, y: 0, w: studio.w, h: studio.h };
        if (region.w < 1 || region.h < 1 || region.w > 256 || region.h > 256)
          throw new Error("region width and height must be between 1 and 256");
        const outline = input.outline !== undefined ? studio.color(input.outline) : undefined;
        const raster = quantize(
          await renderSvg(normalizeSvg(input.svg, region.w, region.h), region.w, region.h),
          input.snap_to_palette === false ? [] : studio.palette,
        );
        // The agent can cancel while the SVG decodes: stop before anything is painted.
        signal.throwIfAborted();
        const points: ColoredPoint[] = raster.pixels.map(({ x, y, color }): ColoredPoint => [
          region.x + x,
          region.y + y,
          color,
        ]);
        if (outline !== undefined)
          for (const { x, y } of raster.outline) points.push([region.x + x, region.y + y, outline]);
        const onCanvas = points.filter(
          ([x, y]) => x >= 0 && y >= 0 && x < studio.w && y < studio.h,
        );
        const changes = helpers.paint("Agent SVG", input.layer, onCanvas);
        const colors = [...new Set(raster.pixels.map((pixel) => u32ToHex(pixel.color)))];
        let bounds: { x: number; y: number; width: number; height: number } | null = null;
        if (onCanvas.length > 0) {
          let x0 = studio.w,
            y0 = studio.h,
            x1 = -1,
            y1 = -1;
          for (const [x, y] of onCanvas) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
          bounds = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
        }
        return {
          result: {
            ok: true,
            changed: changes.length,
            bounds,
            colors: colors.slice(0, 16),
            ...(onCanvas.length === 0 && {
              warning:
                "Nothing was drawn: the SVG rendered no opaque pixels on the canvas. Give shapes a fill or stroke and keep them inside the SVG viewBox.",
            }),
          },
          changes,
          order: "scan",
          summary: `${changes.length} px · ${colors.length} colors`,
        };
      },
    },

    {
      name: "draw_pixels",
      description:
        "Paint an arbitrary batch of individual pixels. For dense art prefer paint_rows, which is far more compact.",
      inputSchema: {
        type: "object",
        properties: {
          pixels: {
            type: "array",
            description: "Pixels to paint.",
            items: {
              type: "object",
              properties: { x: int("X coordinate."), y: int("Y coordinate."), color: COLOR },
              required: ["x", "y"],
            },
          },
          color: COLOR,
          layer: LAYER,
        },
        required: ["pixels"],
      },
      execute: (input) => {
        if (!Array.isArray(input.pixels))
          throw new Error("pixels must be an array of {x, y, color?}");
        const points: ColoredPoint[] = input.pixels.map(
          (pixel: { x: number; y: number; color?: unknown }) => [
            pixel.x,
            pixel.y,
            studio.color(pixel.color ?? input.color),
          ],
        );
        const changes = helpers.paint("Agent pixels", input.layer, points);
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: "random",
          summary: `${changes.length} px`,
        };
      },
    },

    {
      name: "draw_line",
      description: "Draw a Bresenham line (optionally thicker) between two points.",
      inputSchema: {
        type: "object",
        properties: {
          x0: int("Start x."),
          y0: int("Start y."),
          x1: int("End x."),
          y1: int("End y."),
          color: COLOR,
          thickness: int("Line thickness in pixels (1–8). Default 1.", 1, 8),
          layer: LAYER,
        },
        required: ["x0", "y0", "x1", "y1"],
      },
      execute: (input) => {
        requireInts(input, ["x0", "y0", "x1", "y1"]);
        const thickness = Math.max(1, Math.min(8, input.thickness ?? 1)),
          offset = Math.floor((thickness - 1) / 2),
          points: Point[] = [];
        for (const [x, y] of studio.linePts(input.x0, input.y0, input.x1, input.y1)) {
          for (let dy = 0; dy < thickness; dy++)
            for (let dx = 0; dx < thickness; dx++) points.push([x + dx - offset, y + dy - offset]);
        }
        const changes = helpers.paint("Agent line", input.layer, points, input.color);
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: "scan",
          summary: `${changes.length} px`,
        };
      },
    },

    {
      name: "draw_rect",
      description: "Draw a rectangle, filled (default) or outlined.",
      inputSchema: {
        type: "object",
        properties: { ...RECT, color: COLOR, filled: FILLED, layer: LAYER },
        required: ["x", "y", "width", "height"],
      },
      execute: (input) => {
        requireInts(input, ["x", "y", "width", "height"]);
        const changes = helpers.paint(
          "Agent rect",
          input.layer,
          studio.rectPts(
            input.x,
            input.y,
            input.x + input.width - 1,
            input.y + input.height - 1,
            input.filled !== false,
          ),
          input.color,
        );
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: "scan",
          summary: `${input.width}×${input.height} · ${changes.length} px`,
        };
      },
    },

    {
      name: "draw_ellipse",
      description:
        "Draw an ellipse/circle inscribed in the given bounding box, filled (default) or outlined.",
      inputSchema: {
        type: "object",
        properties: { ...RECT, color: COLOR, filled: FILLED, layer: LAYER },
        required: ["x", "y", "width", "height"],
      },
      execute: (input) => {
        requireInts(input, ["x", "y", "width", "height"]);
        const changes = helpers.paint(
          "Agent ellipse",
          input.layer,
          studio.ellipsePts(
            input.x,
            input.y,
            input.x + input.width - 1,
            input.y + input.height - 1,
            input.filled !== false,
          ),
          input.color,
        );
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: "radial",
          summary: `${input.width}×${input.height} · ${changes.length} px`,
        };
      },
    },

    {
      name: "flood_fill",
      description:
        "Bucket-fill the contiguous area of identical color starting at (x, y) on the target layer.",
      inputSchema: {
        type: "object",
        properties: {
          x: int("Seed x."),
          y: int("Seed y."),
          color: COLOR,
          clip_to_selection: bool("Restrict the fill to the user selection. Default false."),
          layer: LAYER,
        },
        required: ["x", "y"],
      },
      execute: (input) => {
        requireInts(input, ["x", "y"]);
        if (input.x < 0 || input.y < 0 || input.x >= studio.w || input.y >= studio.h)
          throw new Error(
            `Seed (${input.x}, ${input.y}) is outside the ${studio.w}×${studio.h} canvas`,
          );
        const points = studio.floodPts(
          input.x,
          input.y,
          !!input.clip_to_selection,
          helpers.layer(input.layer),
        );
        const changes = helpers.paint("Agent fill", input.layer, points, input.color);
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: "radial",
          summary: `${changes.length} px`,
        };
      },
    },

    {
      name: "gradient_fill",
      description:
        "Fill a region with a multi-stop gradient rendered with ordered Bayer dithering — ideal for skies, sunsets and water. Region defaults to the selection (respecting lasso shape) or the whole canvas.",
      inputSchema: {
        type: "object",
        properties: {
          colors: COLOR_LIST(
            "Two or more color stops (hex, CSS, palette index/char), first → last.",
            2,
          ),
          direction: DIRECTION,
          angle: {
            type: "number",
            description:
              "Optional angle in degrees (0 = left→right, 90 = top→bottom); overrides direction unless radial.",
          },
          dither: DITHER,
          region: REGION,
          layer: LAYER,
        },
        required: ["colors"],
      },
      execute: (input) => {
        const colorStops = (Array.isArray(input.colors) ? input.colors : []).map((color: unknown) =>
          studio.color(color),
        );
        if (colorStops.length < 2) throw new Error("Need at least 2 colors");
        const points = studio.regionPts(input.region),
          radial = input.direction === "radial";
        const pointColors = studio.gradientColors(
          points,
          colorStops,
          input.direction ?? "vertical",
          ditherSize(input.dither),
          radial ? undefined : input.angle,
        );
        const changes = helpers.paint(
          "Agent gradient",
          input.layer,
          points.map(([x, y], k): ColoredPoint => [x, y, pointColors[k]]),
        );
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: radial ? "radial" : "scan",
          summary: `${colorStops.length} stops · ${input.dither ?? "bayer4"} · ${changes.length} px`,
        };
      },
    },

    {
      name: "draw_shape_preset",
      description: `Stamp a procedural pixel shape (${SHAPES.join(", ")}) centered at (x, y). For "sun", color2 colors the rays.`,
      inputSchema: {
        type: "object",
        properties: {
          shape: oneOf(SHAPES, "Shape to draw."),
          x: int("Center x."),
          y: int("Center y."),
          size: int("Diameter in pixels (3–128).", 3, 128),
          color: COLOR,
          color2: { ...COLOR, description: "Secondary color (sun rays). Defaults to color." },
          filled: FILLED,
          layer: LAYER,
        },
        required: ["shape", "x", "y", "size"],
      },
      execute: (input) => {
        if (!isShape(input.shape))
          throw new Error(`Unknown shape "${input.shape}". Use one of: ${SHAPES.join(", ")}`);
        requireInts(input, ["x", "y", "size"]);
        const { body, accent } = shapePoints(
          input.shape,
          input.x,
          input.y,
          input.size,
          input.filled !== false,
        );
        const bodyColor = studio.color(input.color),
          accentColor = input.color2 !== undefined ? studio.color(input.color2) : bodyColor;
        const points: ColoredPoint[] = [
          ...body.map(([x, y]): ColoredPoint => [x, y, bodyColor]),
          ...accent.map(([x, y]): ColoredPoint => [x, y, accentColor]),
        ];
        const changes = helpers.paint("Agent " + input.shape, input.layer, points);
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: "radial",
          summary: `${input.shape} ${input.size}px`,
        };
      },
    },

    {
      name: "paint_rows",
      description:
        'Paint small details or sprites (up to about 24×24 px) as rows of chars, one string per row, starting at (x, y). Each char is one pixel: a palette char from get_canvas_info (0-9, a-z, A-Z, …) or a char from legend. "." or " " leaves the pixel unchanged, "~" erases. Keep all rows the same length. Example: {"x":10,"y":4,"rows":["..44..",".4bb4.","4bbbb4"]}. For big shapes or whole scenes, use draw_svg.',
      inputSchema: {
        type: "object",
        properties: {
          x: int("Left of row 0 (default 0)."),
          y: int("Top row (default 0)."),
          rows: ROWS,
          legend: LEGEND,
          clip_to_selection: bool("Only paint inside the user selection. Default false."),
          animate: oneOf(
            ["scan", "random", "radial"],
            "Materialize animation order. Default scan.",
          ),
          layer: LAYER,
        },
        required: ["rows"],
      },
      execute: (input) => {
        if (!Array.isArray(input.rows)) throw new Error("rows must be an array of strings");
        const { points, unknown } = helpers.rowsToPoints(
          input.x ?? 0,
          input.y ?? 0,
          input.rows,
          input.legend,
          input.clip_to_selection ? (x, y) => studio.inSel(x, y) : undefined,
        );
        const changes = helpers.paint("Agent paint rows", input.layer, points);
        const warnings = [
          unknown.length > 0
            ? `Unknown chars ignored: ${unknown.join("")}. Check get_canvas_info palette chars or pass a legend.`
            : undefined,
          rowLengthWarning(input.rows),
        ].filter(Boolean);
        return {
          result: {
            ok: true,
            changed: changes.length,
            rows: input.rows.length,
            ...(warnings.length > 0 && { warning: warnings.join(" ") }),
          },
          changes,
          order: input.animate ?? "scan",
          summary: `${input.rows.length} rows · ${changes.length} px`,
        };
      },
    },
  ];
}
