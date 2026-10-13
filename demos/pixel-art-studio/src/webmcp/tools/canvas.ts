/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Canvas-level tools: inspect, resize, clear, presentation. Exporting stays a user action in the UI. */
import { bool, int, LAYER, oneOf } from "../schema";
import type { Helpers } from "../helpers";
import type { ToolContext, ToolSpec } from "../types";

export function canvasTools(ctx: ToolContext, helpers: Helpers): ToolSpec[] {
  const { studio, view } = ctx;
  return [
    {
      name: "get_canvas_info",
      description:
        "Read the studio state: canvas size, palette (index, paint char, hex), primary/secondary colors, layers and the user's selection. Call this first. To draw a picture, block in big shapes with draw_svg, add small details with paint_rows, then check the result with get_region_pixels.",
      execute: () => ({
        result: helpers.canvasInfo(),
        summary: `${studio.w}×${studio.h}, ${studio.palette.length} colors, ${studio.layers.length} layers`,
      }),
      annotations: { readOnlyHint: true },
    },

    {
      name: "set_canvas_size",
      description:
        "Resize the canvas. Common sizes are 32, 64 and 128. Existing artwork is kept, anchored at the center (or top-left). Clears the selection. Undoable.",
      inputSchema: {
        type: "object",
        properties: {
          size: oneOf([32, 64, 128], "Square size shortcut.", 64),
          width: int("Custom width (8–256).", 8, 256),
          height: int("Custom height (8–256).", 8, 256),
          anchor: oneOf(["center", "top-left"], "Where existing art is anchored.", "center"),
        },
      },
      execute: (input) => {
        const width = input.width ?? input.size ?? 64,
          height = input.height ?? input.size ?? width;
        if (width < 8 || height < 8 || width > 256 || height > 256)
          throw new Error("Size must be between 8 and 256");
        studio.checkpoint("Resize");
        studio.resize(width, height, input.anchor ?? "center");
        studio.emit("resize");
        view.fit();
        return { result: { ok: true, width, height }, summary: `${width}×${height}` };
      },
    },

    {
      name: "clear_canvas",
      description:
        'Erase pixels. scope "all" clears every layer, "layer" only the target layer, "selection" only inside the selection on the target layer. Undoable.',
      inputSchema: {
        type: "object",
        properties: {
          scope: oneOf(["all", "layer", "selection"], "What to erase.", "all"),
          layer: LAYER,
          reset_layers: bool('With scope "all": also collapse to a single Background layer.'),
        },
      },
      execute: (input) => {
        const scope = input.scope ?? "all";
        if (scope === "all") {
          studio.checkpoint("Clear canvas");
          if (input.reset_layers) studio.reset(studio.w, studio.h);
          else studio.layers.forEach((entry) => entry.data.fill(0));
          studio.emit("clear");
          return { result: { ok: true }, summary: "all layers" };
        }
        const layer = helpers.layer(input.layer);
        studio.begin("Clear", layer);
        for (const [x, y] of studio.regionPts(undefined, scope === "selection"))
          studio.set(x, y, 0, false, layer);
        const changes = studio.end("agent");
        return {
          result: { ok: true, changed: changes.length },
          changes,
          order: "radial",
          summary: `${scope} · ${changes.length} px`,
        };
      },
    },

    {
      name: "set_view",
      description:
        "Adjust presentation only (artwork is untouched): zoom (pixel size on screen), fit to screen, grid overlay, bloom glow and CRT scanlines.",
      inputSchema: {
        type: "object",
        properties: {
          zoom: int("Screen pixels per art pixel (1–80).", 1, 80),
          fit: bool("Fit the canvas to the viewport."),
          grid: bool("Show the pixel grid."),
          bloom: bool("Enable the bloom glow effect."),
          crt: bool("Enable CRT scanlines."),
        },
      },
      execute: (input) => {
        if (input.fit) view.fit();
        if (input.zoom) view.zoomAt(input.zoom / view.zoom);
        if (input.grid !== undefined) view.grid = !!input.grid;
        if (input.bloom !== undefined) view.bloom = !!input.bloom;
        if (input.crt !== undefined) view.crt = !!input.crt;
        ctx.refresh();
        return {
          result: { ok: true, zoom: view.zoom, grid: view.grid, bloom: view.bloom, crt: view.crt },
          summary: `zoom ${view.zoom}`,
        };
      },
    },
  ];
}
