/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Palette and active-color tools. */
import { CHARSET, MAX_PALETTE, u32ToHex } from "../../model";
import { PALETTES } from "../../palettes";
import { COLOR, COLOR_LIST, oneOf, str } from "../schema";
import type { Helpers } from "../helpers";
import type { ToolContext, ToolSpec } from "../types";

export function paletteTools({ studio }: ToolContext, helpers: Helpers): ToolSpec[] {
  return [
    {
      name: "set_palette",
      description: `Replace the working palette with a curated preset (${PALETTES.map((palette) => palette.id).join(", ")}) or a custom list of colors (max ${MAX_PALETTE}). Palette order defines the paint chars (0-9, a-z, A-Z, …). Existing pixels are not recolored.`,
      inputSchema: {
        type: "object",
        properties: {
          preset: oneOf(
            PALETTES.map((palette) => palette.id),
            "Curated palette id.",
          ),
          colors: COLOR_LIST(
            'Custom colors, e.g. ["#0b0723","#ff7b5c"]. Used when preset is omitted.',
          ),
          name: str('Display name for a custom palette. Default "Custom".'),
        },
      },
      execute: (input) => {
        if (input.preset) {
          const preset = PALETTES.find((palette) => palette.id === input.preset);
          if (!preset) throw new Error(`Unknown preset "${input.preset}"`);
          studio.palette = [...preset.colors];
          studio.paletteName = preset.name;
        } else if (Array.isArray(input.colors) && input.colors.length) {
          studio.palette = input.colors
            .slice(0, MAX_PALETTE)
            .map((color: string) => u32ToHex(studio.color(color)));
          studio.paletteName = input.name || "Custom";
        } else throw new Error("Provide preset or colors");
        studio.emit("palette");
        return {
          result: { ok: true, palette: helpers.paletteInfo() },
          summary: `${studio.paletteName} · ${studio.palette.length}`,
        };
      },
    },

    {
      name: "add_color",
      description:
        "Append one color to the palette (if not already present) and return its index and paint char.",
      inputSchema: { type: "object", properties: { color: COLOR }, required: ["color"] },
      execute: (input) => {
        const hex = u32ToHex(studio.color(input.color));
        let index = studio.palette.indexOf(hex);
        if (index < 0) {
          if (studio.palette.length >= MAX_PALETTE) throw new Error("Palette is full");
          studio.palette.push(hex);
          index = studio.palette.length - 1;
          studio.paletteName = "Custom";
        }
        studio.emit("palette");
        return { result: { ok: true, index, char: CHARSET[index], hex }, summary: hex };
      },
    },

    {
      name: "set_colors",
      description:
        "Set the primary and/or secondary drawing color shown in the UI (the primary is also the default color for draw tools).",
      inputSchema: { type: "object", properties: { primary: COLOR, secondary: COLOR } },
      execute: (input) => {
        if (input.primary !== undefined) studio.primary = u32ToHex(studio.color(input.primary));
        if (input.secondary !== undefined)
          studio.secondary = u32ToHex(studio.color(input.secondary));
        studio.emit("colors");
        return {
          result: { ok: true, primary: studio.primary, secondary: studio.secondary },
          summary: `${studio.primary} / ${studio.secondary}`,
        };
      },
    },
  ];
}
