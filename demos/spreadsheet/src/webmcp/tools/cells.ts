/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Tools that change what cells hold: write, clear, fill, copy, replace and sort; and select cells. */
import {
  MAX_COLS,
  MAX_ROWS,
  qualifiedName,
  rangeCols,
  rangeName,
  rangeRows,
} from "../../engine/address.ts";
import { SpreadsheetError } from "../../model/workbook.ts";
import { plural, readColumn, readRange, RETURNS_CONTENT, where, written } from "../refs.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { bool, list, object, oneOf, str } from "../schema.ts";

export function cellTools(host: ToolHost): ToolSpec[] {
  const { wb } = host;
  return [
    defineTool({
      name: "set_values",
      description:
        "Types values and formulas into cells the way a person would: 42, 3.5%, $1,200, 2026-10-13, TRUE, or a formula like =SUM(B2:B9). Returns the resulting values and any formula errors.",
      inputSchema: object(
        {
          range: str(
            "Where to write: the top-left cell, like B2 or Sales!B2, or a range the same size as values.",
          ),
          values: list(
            list(str("What to type in one cell."), "One row of cells.", { maxItems: MAX_COLS }),
            'Rows of cells. One value fills a larger range, with formulas adjusted like a fill. Start text with \' to keep it as typed. "" clears a cell.',
            { minItems: 1, maxItems: MAX_ROWS },
          ),
        },
        ["range", "values"],
      ),
      execute: ({ range: at, values }) => {
        const { sheet, range } = readRange(wb, at);
        const width = values.reduce((most, row) => Math.max(most, row.length), 0);
        if (width === 0)
          throw new SpreadsheetError('values has no cells. Pass rows like [["Name", "Total"]].');
        const single = rangeRows(range) === 1 && rangeCols(range) === 1;
        const fill = !single && values.length === 1 && width === 1;
        if (!single && !fill && (rangeRows(range) !== values.length || rangeCols(range) !== width))
          throw new SpreadsheetError(
            `values has ${plural(values.length, "row")} of up to ${plural(width, "cell")}, but ${rangeName(range)} is ${plural(rangeRows(range), "row")} by ${plural(rangeCols(range), "column")}. Pass only the top-left cell to write any size.`,
          );
        if (fill) wb.fillInput(sheet, range, values[0][0]);
        const target = {
          sheet,
          range: fill ? range : wb.setBlock(sheet, range.r1, range.c1, values),
        };
        const count = fill
          ? rangeRows(range) * rangeCols(range)
          : values.reduce((n, row) => n + row.length, 0);
        return { result: written(wb, target), summary: `Wrote ${plural(count, "cell")}`, target };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "clear_range",
      description: "Clears cells: their values and formulas, their formatting, or both.",
      inputSchema: object(
        {
          range: str("Cells to clear, like B2:D9, Sales!A:A or 5:5."),
          what: oneOf(["contents", "formats", "all"], "What to clear.", { default: "contents" }),
        },
        ["range"],
      ),
      execute: ({ range: text, what }) => {
        const target = readRange(wb, text);
        wb.clear(target.sheet, target.range, what);
        return {
          result: { cleared: where(target), what },
          summary:
            what === "all"
              ? `Cleared ${rangeName(target.range)}`
              : `Cleared ${what} in ${rangeName(target.range)}`,
          target,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "autofill",
      description:
        "Continues a pattern into more cells, like dragging the fill handle: 1, 2 goes on 3, 4; Jan goes on Feb; Item 1 goes on Item 2; formulas adjust their references; other values repeat.",
      inputSchema: object(
        {
          source: str("Cells with the pattern, like A2:A3 or Sales!B1:C1."),
          target: str(
            "The whole range to fill, source included, like A2:A13. It extends source up, down, left or right.",
          ),
        },
        ["source", "target"],
      ),
      execute: ({ source, target }) => {
        const from = readRange(wb, source);
        const to = readRange(wb, target, from.sheet);
        if (to.sheet !== from.sheet)
          throw new SpreadsheetError("source and target must be on the same sheet.");
        wb.autofill(from.sheet, from.range, to.range);
        return { result: written(wb, to), summary: `Filled ${rangeName(to.range)}`, target: to };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "copy_range",
      description:
        "Copies or moves cells to another place on the same sheet or another one. Copied formulas adjust their references like a paste. When moving, formulas that refer to the moved cells follow them.",
      inputSchema: object(
        {
          source: str("Cells to copy, like A1:D9 or Sales!A1:D9."),
          destination: str(
            "Top-left cell to paste at, like F1 (on the source's sheet) or Summary!A1.",
          ),
          paste: oneOf(
            ["all", "values", "formats", "formulas"],
            "What to paste. values pastes computed results without formulas; formulas pastes contents without formatting.",
            {
              default: "all",
            },
          ),
          move: bool("Move the cells instead of copying them.", { default: false }),
        },
        ["source", "destination"],
      ),
      execute: ({ source, destination, paste, move }) => {
        if (move && paste !== "all")
          throw new SpreadsheetError("Moving takes everything in the cells, so paste must be all.");
        const from = readRange(wb, source);
        const to = readRange(wb, destination, from.sheet);
        const target = {
          sheet: to.sheet,
          range: wb.copy(from.sheet, from.range, to.sheet, to.range.r1, to.range.c1, paste, move),
        };
        return {
          result: written(wb, target),
          summary: `${move ? "Moved" : "Copied"} ${where(from)} to ${where(target)}`,
          target,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "replace_text",
      description:
        'Replaces text in cell values, and optionally in formulas. The changed text is read again like typing, so replacing "$" with nothing in "$1,200" leaves the number 1200.',
      inputSchema: object(
        {
          find: str("Text to find.", { minLength: 1 }),
          replacement: str("Text to put in its place. An empty string deletes it."),
          range: str(
            "Where to replace, like A1:D20 or Sales!A:A. Leave out to replace on every sheet.",
          ),
          match_case: bool("Match upper and lower case exactly.", { default: false }),
          entire_cell: bool("Replace only in cells whose whole text is the find text.", {
            default: false,
          }),
          search_formulas: bool("Also replace inside formulas.", { default: false }),
        },
        ["find", "replacement"],
      ),
      execute: ({ find, replacement, range, match_case, entire_cell, search_formulas }) => {
        const options = {
          matchCase: match_case,
          entireCell: entire_cell,
          formulas: search_formulas,
        };
        const scopes =
          range === undefined
            ? wb.sheets.map((sheet) => ({
                sheet,
                range: { r1: 0, c1: 0, r2: sheet.rows - 1, c2: sheet.cols - 1 },
              }))
            : [readRange(wb, range)];
        const changed = scopes.flatMap(({ sheet, range: scope }) =>
          wb
            .replaceText(sheet, scope, find, replacement, options)
            .map(({ row, col }) => ({ sheet, row, col })),
        );
        // The feed outlines the changes on the first sheet that has any.
        const first = changed[0];
        const target = first && {
          sheet: first.sheet,
          range: changed
            .filter((cell) => cell.sheet === first.sheet)
            .reduce(
              (box, { row, col }) => ({
                r1: Math.min(box.r1, row),
                c1: Math.min(box.c1, col),
                r2: Math.max(box.r2, row),
                c2: Math.max(box.c2, col),
              }),
              { r1: first.row, c1: first.col, r2: first.row, c2: first.col },
            ),
        };
        return {
          result: {
            replaced: changed.length,
            cells: changed
              .slice(0, 100)
              .map(({ sheet, row, col }) =>
                qualifiedName(sheet.name, { r1: row, c1: col, r2: row, c2: col }),
              ),
          },
          summary: `Replaced "${find}" in ${plural(changed.length, "cell")}`,
          target,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "sort_range",
      description:
        "Sorts the rows of a range by one or more of its columns. Blank cells go last. Cells outside the range stay where they are.",
      inputSchema: object(
        {
          range: str("Rows to sort, like A2:G20 or Sales!A1:G20."),
          by: list(
            object(
              {
                column: str("Column letter inside range, like C."),
                descending: bool("Sort from highest to lowest, or Z to A.", { default: false }),
              },
              ["column"],
            ),
            "Columns to sort by, most important first.",
            { minItems: 1, maxItems: 3 },
          ),
          has_header: bool("The first row of range is a header and stays on top.", {
            default: false,
          }),
        },
        ["range", "by"],
      ),
      execute: ({ range: text, by, has_header }) => {
        const target = readRange(wb, text);
        const { range } = target;
        const keys = by.map(({ column, descending }) => {
          const col = readColumn(column);
          if (col < range.c1 || col > range.c2)
            throw new SpreadsheetError(
              `Column ${column.toUpperCase()} is outside ${rangeName(range)}.`,
            );
          return { col, descending: Boolean(descending) };
        });
        const rows = rangeRows(range) - (has_header ? 1 : 0);
        if (rows < 2)
          throw new SpreadsheetError(
            `${rangeName(range)} needs at least 2 rows to sort${has_header ? " below the header" : ""}.`,
          );
        wb.sort(target.sheet, range, keys, has_header);
        const order = by
          .map(
            ({ column, descending }) => `${column.toUpperCase()}${descending ? " descending" : ""}`,
          )
          .join(", ");
        return {
          result: { sorted: where(target), rows },
          summary: `Sorted ${rangeName(range)} by ${order}`,
          target,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "select_range",
      description:
        "Selects cells for the person and scrolls them into view, switching sheets if needed. Use it to point at the cells you are talking about.",
      inputSchema: object({ range: str("Cells to select, like B2:D9 or Sales!A1.") }, ["range"]),
      execute: ({ range }) => {
        const target = readRange(wb, range);
        return {
          result: { selected: where(target) },
          summary: `Selected ${where(target)}`,
          target,
          select: true,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
  ];
}
