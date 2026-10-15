/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Undo / redo tools. */
import { STEPS } from "../schema";
import { repeat } from "../helpers";
import type { ToolContext, ToolSpec } from "../types";

export function historyTools({ studio }: ToolContext): ToolSpec[] {
  return [
    {
      name: "undo_pixel_art_action",
      description: "Undo the last change(s), human or agent.",
      inputSchema: { type: "object", properties: { steps: STEPS } },
      execute: (input) => {
        const undone = repeat(input.steps, () => studio.undo());
        return { result: { ok: true, undone }, summary: undone.join(", ") || "nothing" };
      },
    },
    {
      name: "redo_pixel_art_action",
      description: "Redo previously undone change(s).",
      inputSchema: { type: "object", properties: { steps: STEPS } },
      execute: (input) => {
        const redone = repeat(input.steps, () => studio.redo());
        return { result: { ok: true, redone }, summary: redone.join(", ") || "nothing" };
      },
    },
  ];
}
