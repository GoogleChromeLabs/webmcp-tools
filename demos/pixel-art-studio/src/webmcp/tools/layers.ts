/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Layer management tools. */
import { bool, int, LAYER, str } from "../schema";
import type { Helpers } from "../helpers";
import type { ToolContext, ToolSpec } from "../types";

export function layerTools({ studio }: ToolContext, helpers: Helpers): ToolSpec[] {
  return [
    {
      name: "add_layer",
      description:
        "Create a new empty layer (placed above the active layer unless position is given) and make it active.",
      inputSchema: {
        type: "object",
        properties: {
          name: str('Layer name. Default "Layer N".'),
          position: int("0-based stack index (0 = bottom).", 0),
        },
      },
      execute: (input) => {
        studio.checkpoint("Add layer");
        const layer = studio.addLayer(input.name, input.position);
        studio.emit("layers");
        return {
          result: { ok: true, id: layer.id, index: studio.layers.indexOf(layer), name: layer.name },
          summary: layer.name,
        };
      },
    },

    {
      name: "update_layer",
      description: "Rename, show/hide, change opacity, reorder, or activate a layer. Undoable.",
      inputSchema: {
        type: "object",
        properties: {
          layer: LAYER,
          name: str("New layer name."),
          visible: bool("Show (true) or hide (false) the layer."),
          opacity: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Layer opacity from 0 (transparent) to 1 (opaque).",
          },
          move_to: int("New 0-based stack index (0 = bottom).", 0),
          make_active: bool("Make this the active layer for drawing."),
        },
      },
      execute: (input) => {
        const layer = helpers.layer(input.layer);
        studio.checkpoint("Update layer");
        if (input.name !== undefined) layer.name = String(input.name);
        if (input.visible !== undefined) layer.visible = !!input.visible;
        if (input.opacity !== undefined) layer.opacity = Math.max(0, Math.min(1, +input.opacity));
        const active = studio.layer;
        if (input.move_to !== undefined) {
          studio.layers.splice(studio.layers.indexOf(layer), 1);
          studio.layers.splice(
            Math.max(0, Math.min(studio.layers.length, input.move_to)),
            0,
            layer,
          );
          studio.active = studio.layers.indexOf(active);
        }
        if (input.make_active) studio.active = studio.layers.indexOf(layer);
        studio.emit("layers");
        return { result: { ok: true, layers: helpers.layersInfo() }, summary: layer.name };
      },
    },

    {
      name: "delete_layer",
      description: "Delete a layer (the last remaining layer cannot be deleted). Undoable.",
      inputSchema: { type: "object", properties: { layer: LAYER } },
      execute: (input) => {
        if (studio.layers.length <= 1) throw new Error("Cannot delete the only layer");
        const layer = helpers.layer(input.layer);
        studio.checkpoint("Delete layer");
        studio.layers.splice(studio.layers.indexOf(layer), 1);
        studio.active = Math.min(studio.active, studio.layers.length - 1);
        studio.emit("layers");
        return { result: { ok: true, deleted: layer.id }, summary: layer.name };
      },
    },
  ];
}
