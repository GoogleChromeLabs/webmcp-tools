/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Tools for sheets: add, rename, reorder, freeze rows and columns, and delete. */
import { SpreadsheetError, type Sheet } from "../../model/workbook.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { int, object, str } from "../schema.ts";

export function sheetTools(host: ToolHost): ToolSpec[] {
  const { wb } = host;
  const info = (sheet: Sheet) => ({
    name: sheet.name,
    position: wb.sheets.indexOf(sheet) + 1,
    frozen_rows: sheet.frozenRows,
    frozen_columns: sheet.frozenCols,
  });
  return [
    defineTool({
      name: "add_sheet",
      description:
        "Adds an empty sheet, at the end or at a given tab position. Write to it with references like Name!A1.",
      inputSchema: object({
        name: str("Name for the sheet. Leave out for the next free name, like Sheet2."),
        position: int("Tab position, 1 for first. Leave out to add it at the end.", {
          minimum: 1,
        }),
      }),
      execute: ({ name, position }) => {
        const sheet = wb.addSheet(name, position === undefined ? undefined : position - 1);
        return {
          result: info(sheet),
          summary: `Added sheet ${sheet.name}`,
          target: { sheet, range: { r1: 0, c1: 0, r2: 0, c2: 0 } },
        };
      },
    }),
    defineTool({
      name: "update_sheet",
      description:
        "Renames a sheet, moves its tab, or freezes rows and columns so they stay in view while scrolling. Formulas that refer to a renamed sheet are updated.",
      inputSchema: object(
        {
          sheet: str("Name of the sheet to change.", { minLength: 1 }),
          name: str("New name."),
          position: int("New tab position, 1 for first.", { minimum: 1 }),
          frozen_rows: int("How many rows to keep in view at the top; 0 for none.", { minimum: 0 }),
          frozen_columns: int("How many columns to keep in view on the left; 0 for none.", {
            minimum: 0,
          }),
        },
        ["sheet"],
      ),
      execute: ({ sheet: current, name, position, frozen_rows, frozen_columns }) => {
        if ([name, position, frozen_rows, frozen_columns].every((value) => value === undefined))
          throw new SpreadsheetError(
            "Pass what to change: name, position, frozen_rows or frozen_columns.",
          );
        const sheet = wb.sheet(current);
        if (name !== undefined) wb.renameSheet(sheet, name);
        if (position !== undefined) wb.moveSheet(sheet, position - 1);
        const freeze = frozen_rows !== undefined || frozen_columns !== undefined;
        if (freeze)
          wb.setFrozen(sheet, frozen_rows ?? sheet.frozenRows, frozen_columns ?? sheet.frozenCols);
        // Outline what now stays in view: frozen rows across the sheet, frozen columns down it, or both.
        const { frozenRows: rows, frozenCols: cols } = sheet;
        const target =
          freeze && (rows || cols)
            ? {
                sheet,
                range: { r1: 0, c1: 0, r2: (rows || sheet.rows) - 1, c2: (cols || sheet.cols) - 1 },
              }
            : undefined;
        return { result: info(sheet), summary: `Updated sheet ${sheet.name}`, target };
      },
    }),
    defineTool({
      name: "delete_sheet",
      description:
        "Deletes a sheet and everything on it. Formulas on other sheets that refer to it become #REF!. Undo brings it back.",
      inputSchema: object({ sheet: str("Name of the sheet to delete.", { minLength: 1 }) }, [
        "sheet",
      ]),
      execute: ({ sheet: name }) => {
        const sheet = wb.sheet(name);
        wb.deleteSheet(sheet);
        return {
          result: { deleted: sheet.name, sheets: wb.sheets.map((s) => s.name) },
          summary: `Deleted sheet ${sheet.name}`,
        };
      },
    }),
  ];
}
