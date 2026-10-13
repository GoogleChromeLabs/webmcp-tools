/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** The spreadsheet's WebMCP tools, one module per area. */
import { toWebMCP, type ToolHost } from "./runtime.ts";
import { cellTools } from "./tools/cells.ts";
import { chartTools } from "./tools/charts.ts";
import { formatTools } from "./tools/format.ts";
import { historyTools } from "./tools/history.ts";
import { readTools } from "./tools/read.ts";
import { sheetTools } from "./tools/sheets.ts";
import { structureTools } from "./tools/structure.ts";

export { registerTools, type Registration, type ToolHost } from "./runtime.ts";

export const buildTools = (host: ToolHost): WebMCP.ModelContextTool[] =>
  [
    ...readTools(host),
    ...cellTools(host),
    ...structureTools(host),
    ...formatTools(host),
    ...sheetTools(host),
    ...chartTools(host),
    ...historyTools(host),
  ].map((spec) => toWebMCP(spec, host));
