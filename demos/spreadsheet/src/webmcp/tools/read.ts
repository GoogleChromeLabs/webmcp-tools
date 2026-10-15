/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Tools that read: the workbook's sheets, the person's selection, ranges, and searches. */
import {
  qualifiedName,
  rangeCols,
  rangeName,
  rangeRows,
  type Range,
} from "../../engine/address.ts";
import type { Scalar } from "../../engine/values.ts";
import { rangeStats } from "../../model/stats.ts";
import { SpreadsheetError, type Sheet, type Workbook } from "../../model/workbook.ts";
import {
  chartInfo,
  jsonLength,
  OUTPUT_BUDGET,
  plainValue,
  plural,
  readPage,
  readRange,
  RETURNS_CONTENT,
  ruleInfo,
  where,
} from "../refs.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { bool, int, object, str } from "../schema.ts";

/** Reading changes nothing, and what the workbook holds can come from anywhere. */
const READS: WebMCP.ToolAnnotations = { readOnlyHint: true, ...RETURNS_CONTENT };

const cellsIn = (range: Range) => rangeRows(range) * rangeCols(range);

/** Leaves out the empty rows and columns after the sheet's last value; null when nothing is left. */
function trimmed(wb: Workbook, sheet: Sheet, range: Range): Range | null {
  const used = wb.usedRange(sheet);
  const r2 = Math.min(range.r2, used?.r2 ?? -1);
  const c2 = Math.min(range.c2, used?.c2 ?? -1);
  return r2 < range.r1 || c2 < range.c1 ? null : { ...range, r2, c2 };
}

export function readTools(host: ToolHost): ToolSpec[] {
  const { wb } = host;
  return [
    defineTool({
      name: "get_workbook_info",
      description:
        "Lists every sheet with its used range, size, frozen rows and columns, charts and conditional formats. Also returns the sheet on screen, what the person has selected, and the changes undo and redo would revert.",
      execute: () => {
        const selection = host.selection();
        return {
          result: {
            active_sheet: wb.active.name,
            selection: where(selection),
            sheets: wb.sheets.map((sheet) => {
              const used = wb.usedRange(sheet);
              return {
                name: sheet.name,
                used_range: used && rangeName(used),
                rows: sheet.rows,
                columns: sheet.cols,
                frozen_rows: sheet.frozenRows,
                frozen_columns: sheet.frozenCols,
                charts: sheet.charts.map(chartInfo),
                conditional_formats: sheet.rules.map(ruleInfo),
              };
            }),
            next_undo: wb.undoLabel,
            next_redo: wb.redoLabel,
          },
          summary: `Looked at ${plural(wb.sheets.length, "sheet")}`,
        };
      },
      annotations: READS,
    }),
    defineTool({
      name: "get_spreadsheet_selection",
      description:
        'Returns the cells the person has selected, with their values, formulas and the count, sum and average of the numbers. Use it when the person refers to "these cells" or "the selection".',
      execute: () => {
        const { sheet, range, active } = host.selection();
        const stats = rangeStats(wb, sheet, range);
        const data = trimmed(wb, sheet, range);
        const about = {
          selection: where({ sheet, range }),
          active_cell: qualifiedName(sheet.name, {
            r1: active.row,
            c1: active.col,
            r2: active.row,
            c2: active.col,
          }),
        };
        // The count, sum and average cover the whole selection, even when the cells don't fit.
        const totals = {
          count: stats.filled,
          ...(stats.numbers > 0 && { sum: stats.sum, average: stats.average }),
        };
        const budget = OUTPUT_BUDGET - jsonLength({ ...about, ...totals });
        const page = data && readPage(wb, { sheet, range: data }, false, budget);
        return {
          result: { ...about, ...page?.result, ...totals },
          summary: `Read the selection ${rangeName(range)}`,
        };
      },
      annotations: READS,
    }),
    defineTool({
      name: "read_range",
      description:
        "Reads cell values, formulas and formula errors, row by row from the top-left cell. Empty rows and columns after the sheet's data are left out. Dates read as text like 2026-10-13. Long ranges come back a page at a time; read next_range to continue.",
      inputSchema: object({
        range: str(
          "Cells to read, like A1:G20, Sales!A:C or B2, or a sheet name to read all of it. Leave out to read all of the sheet on screen.",
        ),
        include_formats: bool("Also return each cell's formatting.", { default: false }),
      }),
      execute: ({ range: text, include_formats }) => {
        const named = text === undefined ? wb.active : wb.sheetByName(text);
        const target = named
          ? { sheet: named, range: wb.usedRange(named) ?? { r1: 0, c1: 0, r2: 0, c2: 0 } }
          : readRange(wb, text ?? "");
        const data = trimmed(wb, target.sheet, target.range);
        if (!data)
          return {
            result: { range: where(target), values: [] },
            summary: `Read ${where(target)} (empty)`,
            target,
          };
        const { result, read } = readPage(
          wb,
          { sheet: target.sheet, range: data },
          include_formats,
        );
        const [got, all] = [cellsIn(read.range), cellsIn(data)];
        return {
          result,
          summary:
            got < all ? `Read ${got} of ${plural(all, "cell")}` : `Read ${plural(got, "cell")}`,
          target: read,
        };
      },
      annotations: READS,
    }),
    defineTool({
      name: "find_cells",
      description:
        "Finds cells that contain some text, on one sheet or all of them. Returns the matches with their values and how many match in all. Many matches come back a page at a time, with next_start to continue.",
      inputSchema: object(
        {
          query: str("Text to look for.", { minLength: 1 }),
          sheet: str("Sheet to search. Leave out to search every sheet."),
          match_case: bool("Match upper and lower case exactly.", { default: false }),
          entire_cell: bool("Match only cells whose whole text is the query.", { default: false }),
          search_formulas: bool("Also look inside formulas.", { default: false }),
          start: int(
            "Number of the first match to return, 1 for the first. Use next_start from the previous result.",
            { default: 1, minimum: 1 },
          ),
        },
        ["query"],
      ),
      execute: ({ query, sheet, match_case, entire_cell, search_formulas, start }) => {
        const options = {
          matchCase: match_case,
          entireCell: entire_cell,
          formulas: search_formulas,
        };
        const hits = (sheet === undefined ? wb.sheets : [wb.sheet(sheet)]).flatMap((s) =>
          wb.search(s, query, options).map(({ row, col }) => ({ sheet: s, row, col })),
        );
        if (hits.length && start > hits.length)
          throw new SpreadsheetError(
            `There ${hits.length === 1 ? "is" : "are"} only ${plural(hits.length, "match", "matches")}, so start can be at most ${hits.length}.`,
          );
        type Match = { cell: string; value: Scalar; formula?: string };
        const result = (listed: Match[]) => {
          const next = start + listed.length;
          return {
            count: hits.length,
            matches: listed,
            ...(next <= hits.length && { truncated: true, next_start: next }),
          };
        };
        // As many matches as fit in the output budget, and at least one.
        const matches: Match[] = [];
        for (const { sheet: s, row, col } of hits.slice(start - 1)) {
          const match = {
            cell: qualifiedName(s.name, { r1: row, c1: col, r2: row, c2: col }),
            value: plainValue(wb, s, row, col),
            formula: wb.cell(s, row, col)?.f,
          };
          if (matches.length && jsonLength(result([...matches, match])) > OUTPUT_BUDGET) break;
          matches.push(match);
        }
        return {
          result: result(matches),
          summary: `Found ${plural(hits.length, "match", "matches")} for "${query}"`,
        };
      },
      annotations: READS,
    }),
  ];
}
