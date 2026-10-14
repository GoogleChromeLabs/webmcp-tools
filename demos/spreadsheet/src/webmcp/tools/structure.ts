/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Tools that change a sheet's grid: insert and delete rows and columns, and resize columns. */
import { columnName, MAX_COLS, MAX_ROWS, quoteSheet, type Range } from "../../engine/address.ts";
import { DEFAULT_WIDTH, SpreadsheetError, type Sheet } from "../../model/workbook.ts";
import { plural, readColumn, readColumns, RETURNS_CONTENT } from "../refs.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { bool, int, object, str } from "../schema.ts";

const SHEET = str("Sheet name. Leave out to use the sheet on screen.");
const rowsName = (sheet: Sheet, r1: number, r2: number) =>
  `${quoteSheet(sheet.name)}!${r1 + 1}:${r2 + 1}`;
const colsName = (sheet: Sheet, c1: number, c2: number) =>
  `${quoteSheet(sheet.name)}!${columnName(c1)}:${columnName(c2)}`;
const wholeRows = (sheet: Sheet, r1: number, r2: number): Range => ({
  r1,
  c1: 0,
  r2,
  c2: sheet.cols - 1,
});
const wholeCols = (sheet: Sheet, c1: number, c2: number): Range => ({
  r1: 0,
  c1,
  r2: sheet.rows - 1,
  c2,
});

export function structureTools(host: ToolHost): ToolSpec[] {
  const { wb } = host;
  return [
    defineTool({
      name: "insert_rows",
      description:
        "Inserts empty rows. Cells below move down, and formulas, charts and conditional formats follow them.",
      inputSchema: object(
        {
          row: int(
            "Row number the new rows go above. One past the last row adds them at the end.",
            { minimum: 1, maximum: MAX_ROWS },
          ),
          count: int("How many rows to insert.", { default: 1, minimum: 1, maximum: MAX_ROWS }),
          sheet: SHEET,
        },
        ["row"],
      ),
      execute: ({ row, count, sheet: name }) => {
        const sheet = wb.sheet(name);
        if (row > sheet.rows + 1)
          throw new SpreadsheetError(
            `${sheet.name} has ${sheet.rows} rows, so row can be at most ${sheet.rows + 1}.`,
          );
        wb.insertRows(sheet, row - 1, count);
        const [r1, r2] = [row - 1, row + count - 2];
        return {
          result: { inserted: rowsName(sheet, r1, r2) },
          summary: `Inserted ${plural(count, "row")} at row ${row}`,
          target: { sheet, range: wholeRows(sheet, r1, r2) },
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "insert_columns",
      description:
        "Inserts empty columns. Cells to the right move over, and formulas, charts and conditional formats follow them.",
      inputSchema: object(
        {
          column: str(
            "Column letter the new columns go left of, like C. One past the last column adds them at the end.",
          ),
          count: int("How many columns to insert.", { default: 1, minimum: 1, maximum: MAX_COLS }),
          sheet: SHEET,
        },
        ["column"],
      ),
      execute: ({ column, count, sheet: name }) => {
        const sheet = wb.sheet(name);
        const col = readColumn(column);
        if (col > sheet.cols)
          throw new SpreadsheetError(
            `${sheet.name} has columns A to ${columnName(sheet.cols - 1)}, so column can be at most ${columnName(sheet.cols)}.`,
          );
        wb.insertColumns(sheet, col, count);
        const [c1, c2] = [col, col + count - 1];
        return {
          result: { inserted: colsName(sheet, c1, c2) },
          summary: `Inserted ${plural(count, "column")} at ${columnName(col)}`,
          target: { sheet, range: wholeCols(sheet, c1, c2) },
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "delete_rows",
      description:
        "Deletes rows and everything in them. Cells below move up; ranges in formulas shrink, and references to deleted cells become #REF!.",
      inputSchema: object(
        {
          row: int("First row number to delete.", { minimum: 1, maximum: MAX_ROWS }),
          count: int("How many rows to delete.", { default: 1, minimum: 1, maximum: MAX_ROWS }),
          sheet: SHEET,
        },
        ["row"],
      ),
      execute: ({ row, count, sheet: name }) => {
        const sheet = wb.sheet(name);
        const last = row + count - 1;
        if (last > sheet.rows)
          throw new SpreadsheetError(
            `${sheet.name} has ${sheet.rows} rows, so rows ${row} to ${last} don't all exist.`,
          );
        const deleted = rowsName(sheet, row - 1, last - 1);
        wb.deleteRows(sheet, row - 1, count);
        const at = Math.min(row - 1, sheet.rows - 1);
        return {
          result: { deleted },
          summary: `Deleted ${plural(count, "row")} from row ${row}`,
          target: { sheet, range: wholeRows(sheet, at, at) },
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "delete_columns",
      description:
        "Deletes columns and everything in them. Cells to the right move over; ranges in formulas shrink, and references to deleted cells become #REF!.",
      inputSchema: object(
        {
          column: str("First column letter to delete, like C."),
          count: int("How many columns to delete.", { default: 1, minimum: 1, maximum: MAX_COLS }),
          sheet: SHEET,
        },
        ["column"],
      ),
      execute: ({ column, count, sheet: name }) => {
        const sheet = wb.sheet(name);
        const col = readColumn(column);
        if (col + count > sheet.cols)
          throw new SpreadsheetError(
            `${sheet.name} has columns A to ${columnName(sheet.cols - 1)}, so ${plural(count, "column")} from ${columnName(col)} don't all exist.`,
          );
        const deleted = colsName(sheet, col, col + count - 1);
        wb.deleteColumns(sheet, col, count);
        const at = Math.min(col, sheet.cols - 1);
        return {
          result: { deleted },
          summary: `Deleted ${plural(count, "column")} from ${columnName(col)}`,
          target: { sheet, range: wholeCols(sheet, at, at) },
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "resize_columns",
      description: `Sets column widths in pixels, or fits columns to their widest value. New columns are ${DEFAULT_WIDTH} pixels wide.`,
      inputSchema: object(
        {
          columns: str("Columns to resize, like B, B:E or Sales!A:C."),
          width: int("Width in pixels.", { minimum: 24, maximum: 600 }),
          fit_to_content: bool("Fit each column to its widest value instead of a fixed width."),
        },
        ["columns"],
      ),
      execute: ({ columns, width, fit_to_content }) => {
        if (width === undefined && !fit_to_content)
          throw new SpreadsheetError("Pass width, or fit_to_content: true.");
        if (width !== undefined && fit_to_content)
          throw new SpreadsheetError("Pass width or fit_to_content, not both.");
        const { sheet, range } = readColumns(wb, columns);
        wb.setWidths(sheet, range.c1, range.c2, width ?? ((col) => host.fitWidth(sheet, col)));
        const widths = Object.fromEntries(
          sheet.widths.slice(range.c1, range.c2 + 1).map((w, i) => [columnName(range.c1 + i), w]),
        );
        return {
          result: { columns: colsName(sheet, range.c1, range.c2), widths },
          summary: `Resized ${plural(range.c2 - range.c1 + 1, "column")}`,
          target: { sheet, range: wholeCols(sheet, range.c1, range.c2) },
        };
      },
      annotations: RETURNS_CONTENT,
    }),
  ];
}
