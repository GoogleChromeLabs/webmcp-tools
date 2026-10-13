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
import { rangeStats } from "../../model/stats.ts";
import { SpreadsheetError, type Sheet, type Workbook } from "../../model/workbook.ts";
import { chartInfo, plainValue, plural, readCells, readRange, ruleInfo, where } from "../refs.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { bool, object, str } from "../schema.ts";

const MAX_READ = 5000;
const MAX_MATCHES = 100;
/** For tools that return what cells hold: text a person typed, pasted or imported from anywhere. */
const READS_CELLS: WebMCP.ToolAnnotations = { readOnlyHint: true, untrustedContentHint: true };

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
      annotations: { readOnlyHint: true },
    }),
    defineTool({
      name: "get_selection",
      description:
        'Returns the cells the person has selected, with their values, formulas and the count, sum and average of the numbers. Use it when the person refers to "these cells" or "the selection".',
      execute: () => {
        const { sheet, range, active } = host.selection();
        const stats = rangeStats(wb, sheet, range);
        const data = trimmed(wb, sheet, range);
        const small = data && rangeRows(data) * rangeCols(data) <= MAX_READ;
        return {
          result: {
            selection: where({ sheet, range }),
            active_cell: qualifiedName(sheet.name, {
              r1: active.row,
              c1: active.col,
              r2: active.row,
              c2: active.col,
            }),
            ...(data &&
              small && { range: where({ sheet, range: data }), ...readCells(wb, sheet, data) }),
            ...(data &&
              !small && {
                note: "The selection is too large to return. Read parts of it with read_range.",
              }),
            count: stats.filled,
            ...(stats.numbers > 0 && { sum: stats.sum, average: stats.average }),
          },
          summary: `Read the selection ${rangeName(range)}`,
        };
      },
      annotations: READS_CELLS,
    }),
    defineTool({
      name: "read_range",
      description:
        "Reads cell values, formulas and formula errors. Values are row by row from the range's top-left cell; empty rows and columns after the sheet's data are left out. Dates read as text like 2026-10-13.",
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
        const cells = rangeRows(data) * rangeCols(data);
        if (cells > MAX_READ) {
          const part = {
            ...data,
            r2: data.r1 + Math.max(1, Math.floor(MAX_READ / rangeCols(data))) - 1,
          };
          throw new SpreadsheetError(
            `${where({ ...target, range: data })} has ${cells} cells. Read up to ${MAX_READ} at a time, like ${rangeName(part)}.`,
          );
        }
        const read = { sheet: target.sheet, range: data };
        return {
          result: { range: where(read), ...readCells(wb, read.sheet, data, include_formats) },
          summary: `Read ${plural(cells, "cell")}`,
          target: read,
        };
      },
      annotations: READS_CELLS,
    }),
    defineTool({
      name: "find_cells",
      description:
        "Finds cells whose text contains the query, on one sheet or all of them. Returns up to 100 matches.",
      inputSchema: object(
        {
          query: str("Text to look for.", { minLength: 1 }),
          sheet: str("Sheet to search. Leave out to search every sheet."),
          match_case: bool("Match upper and lower case exactly.", { default: false }),
          entire_cell: bool("Match only cells whose whole text is the query.", { default: false }),
          search_formulas: bool("Also look inside formulas.", { default: false }),
        },
        ["query"],
      ),
      execute: ({ query, sheet, match_case, entire_cell, search_formulas }) => {
        const options = {
          matchCase: match_case,
          entireCell: entire_cell,
          formulas: search_formulas,
        };
        const hits = (sheet === undefined ? wb.sheets : [wb.sheet(sheet)]).flatMap((s) =>
          wb.search(s, query, options).map(({ row, col }) => ({ sheet: s, row, col })),
        );
        const matches = hits.slice(0, MAX_MATCHES).map(({ sheet: s, row, col }) => ({
          cell: qualifiedName(s.name, { r1: row, c1: col, r2: row, c2: col }),
          value: plainValue(wb, s, row, col),
          formula: wb.cell(s, row, col)?.f,
        }));
        return {
          result: {
            count: hits.length,
            matches,
            ...(hits.length > MAX_MATCHES && { note: `Showing the first ${MAX_MATCHES}.` }),
          },
          summary: `Found ${plural(hits.length, "match", "matches")} for "${query}"`,
        };
      },
      annotations: READS_CELLS,
    }),
  ];
}
