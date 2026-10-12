/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** WebMCP tool surface of Pixel Art Studio: one module per tool group. */
import { createHelpers } from "./helpers";
import { wrapTools } from "./runtime";
import { canvasTools } from "./tools/canvas";
import { drawTools } from "./tools/draw";
import { historyTools } from "./tools/history";
import { layerTools } from "./tools/layers";
import { paletteTools } from "./tools/palette";
import { selectionTools } from "./tools/selection";
import type { ToolContext } from "./types";

export { registerTools, type Registration } from "./runtime";
export type { FeedApi, ToolContext } from "./types";

/** Build every tool, grouped by concern. */
export function buildTools(ctx: ToolContext): WebMCP.ModelContextTool[] {
  const h = createHelpers(ctx);
  return wrapTools(
    [
      ...canvasTools(ctx, h),
      ...paletteTools(ctx, h),
      ...drawTools(ctx, h),
      ...selectionTools(ctx, h),
      ...layerTools(ctx, h),
      ...historyTools(ctx),
    ],
    ctx,
  );
}
