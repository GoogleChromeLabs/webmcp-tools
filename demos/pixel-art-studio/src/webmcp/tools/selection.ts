/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Selection tools and region read-back (shared paint_rows encoding). */
import { CHARSET, cssToU32, u32ToHex } from "../../model";
import {
  bool,
  COLOR,
  COLOR_LIST,
  DIRECTION,
  DITHER,
  LAYER,
  LEGEND,
  oneOf,
  RECT,
  ROWS,
  str,
} from "../schema";
import { ditherSize, rowLengthWarning, type Helpers } from "../helpers";
import { normalizeSvg, quantize, renderSvg } from "../svg";
import type { ToolContext, ToolSpec } from "../types";

/** replace_selection modes; one list feeds both the schema enum and the runtime check. */
const REPLACE_MODES = ["svg", "rows", "clear", "fill", "gradient", "noise"];

export function selectionTools({ studio, view }: ToolContext, helpers: Helpers): ToolSpec[] {
  return [
    {
      name: "get_selection",
      description:
        'Return the rectangular or lasso selection the user drew with the mouse (bounds, pixel count; lasso also returns mask_rows). Use this when the user says "the selected area". Returns null when nothing is selected.',
      inputSchema: { type: "object", properties: {} },
      execute: () => ({
        result: { selection: helpers.selectionInfo() },
        summary: studio.selection
          ? `${studio.selection.w}×${studio.selection.h} @ ${studio.selection.x},${studio.selection.y}`
          : "none",
      }),
      annotations: { readOnlyHint: true },
    },

    {
      name: "set_selection",
      description:
        "Set the selection: a rectangle (x, y, width, height), a lasso polygon, the whole canvas, or clear it.",
      inputSchema: {
        type: "object",
        properties: {
          ...RECT,
          polygon: {
            type: "array",
            items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
            description: "Polygon vertices [[x,y],…] in pixel coordinates (lasso).",
          },
          all: bool("Select the whole canvas."),
          clear: bool("Remove the selection."),
        },
      },
      execute: (input) => {
        if (input.clear) studio.selection = null;
        else if (input.all) studio.setRectSelection(0, 0, studio.w, studio.h);
        else if (input.polygon) studio.setPolySelection(input.polygon);
        else if (input.width)
          studio.setRectSelection(
            input.x ?? 0,
            input.y ?? 0,
            input.width,
            input.height ?? input.width,
          );
        else throw new Error("Provide x/y/width/height, polygon, all or clear");
        view.awaitingAgent = false;
        studio.emit("selection");
        const selection = studio.selection;
        return {
          result: { ok: true, selection: helpers.selectionInfo() },
          focus: selection
            ? [selection.x + selection.w / 2, selection.y + selection.h / 2]
            : undefined,
          summary: selection ? `${selection.w}×${selection.h}` : "cleared",
        };
      },
    },

    {
      name: "replace_selection",
      description:
        'Replace the contents of the user\'s current selection. mode "svg" draws SVG markup fitted into the selection bounds — the best way to answer "replace the selected area with a palm tree"; mode "rows" paints char rows (paint_rows format) from its top-left corner. Pixels outside the (lasso) mask are never touched. A before/after onion ghost is shown. Undoable.',
      inputSchema: {
        type: "object",
        properties: {
          mode: oneOf(
            REPLACE_MODES,
            "svg = draw SVG fitted into the selection; rows = paint char rows; clear = erase; fill = solid color; gradient/noise = from colors.",
          ),
          svg: str(
            'mode "svg": SVG markup; its viewBox is fitted into the selection bounds (width/height from get_selection).',
          ),
          outline: {
            ...COLOR,
            description: 'mode "svg": optional 1-px outline color around the drawn shapes.',
          },
          snap_to_palette: bool('mode "svg": snap colors to the palette (default true).'),
          rows: ROWS,
          legend: LEGEND,
          color: COLOR,
          colors: COLOR_LIST("Stops for gradient / colors for noise. Default primary + secondary."),
          direction: DIRECTION,
          dither: DITHER,
          clear_first: bool("svg/rows mode: erase the selection before painting (default true)."),
          layer: LAYER,
        },
        required: ["mode"],
      },
      execute: async (input, { signal }) => {
        const selection = studio.selection;
        if (!selection)
          throw new Error("No selection. Ask the user to drag a selection, or call set_selection.");
        if (!REPLACE_MODES.includes(input.mode))
          throw new Error(`Unknown mode "${input.mode}". Use one of: ${REPLACE_MODES.join(", ")}.`);
        if (input.mode === "rows" && !Array.isArray(input.rows))
          throw new Error('mode "rows" needs rows: an array of strings in paint_rows format.');
        const layer = helpers.layer(input.layer),
          points = studio.regionPts();
        const inside = (x: number, y: number) =>
          x >= 0 &&
          y >= 0 &&
          x < studio.w &&
          y < studio.h &&
          selection.mask[y * studio.w + x] === 1;
        const stops = () =>
          (Array.isArray(input.colors) ? input.colors : [studio.primary, studio.secondary]).map(
            (color: unknown) => studio.color(color),
          );
        // Render SVG before opening the history step, so the async decode never splits an undo step.
        const raster =
          input.mode === "svg"
            ? quantize(
                await renderSvg(
                  normalizeSvg(input.svg, selection.w, selection.h),
                  selection.w,
                  selection.h,
                ),
                input.snap_to_palette === false ? [] : studio.palette,
              )
            : undefined;
        // The agent can cancel while the SVG decodes: stop before the selection changes.
        signal.throwIfAborted();
        const outline =
          input.mode === "svg" && input.outline !== undefined
            ? studio.color(input.outline)
            : undefined;
        let unknown: string[] = [];
        studio.begin("Replace selection", layer);
        if (
          input.mode === "clear" ||
          ((input.mode === "rows" || input.mode === "svg") && input.clear_first !== false)
        )
          for (const [x, y] of points) studio.set(x, y, 0, false, layer);
        if (input.mode === "fill") {
          const color = studio.color(input.color);
          for (const [x, y] of points) studio.set(x, y, color, false, layer);
        }
        if (input.mode === "gradient") {
          const pointColors = studio.gradientColors(
            points,
            stops(),
            input.direction ?? "vertical",
            ditherSize(input.dither),
          );
          points.forEach(([x, y], k) => studio.set(x, y, pointColors[k], false, layer));
        }
        if (input.mode === "noise") {
          const noiseColors = stops();
          for (const [x, y] of points)
            studio.set(
              x,
              y,
              noiseColors[Math.floor(Math.random() * noiseColors.length)],
              false,
              layer,
            );
        }
        if (input.mode === "rows") {
          const decoded = helpers.rowsToPoints(
            selection.x,
            selection.y,
            input.rows,
            input.legend,
            inside,
          );
          unknown = decoded.unknown;
          for (const [x, y, c] of decoded.points) studio.set(x, y, c, false, layer);
        }
        if (raster) {
          if (outline !== undefined)
            for (const { x, y } of raster.outline)
              if (inside(selection.x + x, selection.y + y))
                studio.set(selection.x + x, selection.y + y, outline, false, layer);
          for (const { x, y, color } of raster.pixels)
            if (inside(selection.x + x, selection.y + y))
              studio.set(selection.x + x, selection.y + y, color, false, layer);
        }
        const changes = studio.end("agent");
        view.awaitingAgent = false;
        const warnings = [
          unknown.length > 0 ? `Unknown chars ignored: ${unknown.join("")}` : undefined,
          input.mode === "rows" ? rowLengthWarning(input.rows) : undefined,
          raster && raster.pixels.length === 0
            ? "Nothing was drawn: the SVG rendered no opaque pixels. Give shapes a fill or stroke and keep them inside the viewBox."
            : undefined,
        ].filter(Boolean);
        return {
          result: {
            ok: true,
            changed: changes.length,
            selection: helpers.selectionInfo(),
            ...(warnings.length > 0 && { warning: warnings.join(" ") }),
          },
          changes,
          ghost: true,
          order: input.mode === "rows" || input.mode === "svg" ? "scan" : "radial",
          summary: `${input.mode} · ${changes.length} px`,
        };
      },
    },

    {
      name: "get_region_pixels",
      description:
        'Read pixels of a region as compact rows of palette chars (same encoding as paint_rows). "." = transparent; off-palette colors get extra chars listed in legend. Region defaults to the selection, else the whole canvas.',
      inputSchema: {
        type: "object",
        properties: {
          ...RECT,
          source: oneOf(
            ["composite", "layer"],
            "Read the flattened image (default) or a single layer.",
          ),
          layer: LAYER,
        },
      },
      execute: (input) => {
        const region = helpers.regionOf(
          input.width
            ? (input as { x: number; y: number; width: number; height: number })
            : undefined,
        );
        const pixels =
          input.source === "layer" ? helpers.layer(input.layer).data : studio.composite;
        const charOf = new Map<number, string>();
        studio.palette.forEach((hex, index) => {
          const color = cssToU32(hex);
          if (color !== null && !charOf.has(color)) charOf.set(color, CHARSET[index]);
        });
        const spare = Array.from(CHARSET.slice(studio.palette.length)),
          extra: Record<string, string> = {},
          used = new Set<string>();
        const rows: string[] = [];
        for (let y = region.y; y < region.y + region.h; y++) {
          let row = "";
          for (let x = region.x; x < region.x + region.w; x++) {
            const color =
              x < 0 || y < 0 || x >= studio.w || y >= studio.h ? 0 : pixels[y * studio.w + x];
            if (!color) {
              row += ".";
              continue;
            }
            let paintChar = charOf.get(color);
            if (!paintChar) {
              paintChar = spare.shift() ?? "?";
              charOf.set(color, paintChar);
              extra[paintChar] = u32ToHex(color);
            }
            used.add(paintChar);
            row += paintChar;
          }
          rows.push(row);
        }
        const legend: Record<string, string> = {};
        used.forEach((paintChar) => {
          legend[paintChar] = extra[paintChar] ?? studio.palette[CHARSET.indexOf(paintChar)] ?? "?";
        });
        return {
          result: { x: region.x, y: region.y, width: region.w, height: region.h, rows, legend },
          summary: `${region.w}×${region.h}`,
        };
      },
      annotations: { readOnlyHint: true },
    },
  ];
}
