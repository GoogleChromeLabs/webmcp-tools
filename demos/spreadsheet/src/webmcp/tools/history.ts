/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Undo and redo. People and agents share one history, and each tool call is one step in it. */
import { SpreadsheetError } from "../../model/workbook.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { int, object } from "../schema.ts";

export function historyTools(host: ToolHost): ToolSpec[] {
  const { wb } = host;
  const steps = (verb: string) =>
    int(`How many changes to ${verb}.`, { default: 1, minimum: 1, maximum: 20 });
  const repeat = (count: number, step: () => string | null) => {
    const labels: string[] = [];
    while (labels.length < count) {
      const label = step();
      if (label === null) break;
      labels.push(label);
    }
    return labels;
  };
  return [
    defineTool({
      name: "undo_spreadsheet_action",
      description: "Undoes the latest changes, whether a person or an agent made them.",
      inputSchema: object({ steps: steps("undo") }),
      execute: ({ steps: count }) => {
        const undone = repeat(count, () => wb.undo());
        if (!undone.length) throw new SpreadsheetError("There is nothing to undo.");
        return {
          result: { undone, next_undo: wb.undoLabel },
          summary: `Undid ${undone.join(", ")}`,
        };
      },
    }),
    defineTool({
      name: "redo_spreadsheet_action",
      description: "Redoes changes that were just undone.",
      inputSchema: object({ steps: steps("redo") }),
      execute: ({ steps: count }) => {
        const redone = repeat(count, () => wb.redo());
        if (!redone.length) throw new SpreadsheetError("There is nothing to redo.");
        return {
          result: { redone, next_redo: wb.redoLabel },
          summary: `Redid ${redone.join(", ")}`,
        };
      },
    }),
  ];
}
