/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Reads the A1 references, columns and colors agents pass, and describes cells in results. */
import {
  cellName,
  columnIndex,
  columnName,
  MAX_COLS,
  MAX_ROWS,
  parseRef,
  qualifiedName,
  rangeCols,
  rangeName,
  rangeRows,
  refRange,
  type Range,
} from "../engine/address.ts";
import { formatValue, type CellFormat } from "../engine/format.ts";
import { isError, type Scalar } from "../engine/values.ts";
import {
  SpreadsheetError,
  type Chart,
  type ConditionalRule,
  type Sheet,
  type Workbook,
} from "../model/workbook.ts";
import type { Target } from "../ui/activity.ts";

/** A cell or range like "B2:D9" or "Sales!B2:D9"; without a sheet name it is on `sheet`. */
export function readRange(wb: Workbook, text: string, sheet: Sheet = wb.active): Target {
  const ref = parseRef(text);
  if (!ref)
    throw new SpreadsheetError(
      `"${text}" isn't a cell or range. Use A1 notation, like B2, B2:D9, A:C or Sales!B2:D9.`,
    );
  const on = ref.sheet === null ? sheet : wb.sheet(ref.sheet);
  const range = refRange(ref, on.rows, on.cols);
  if (range.r2 >= MAX_ROWS || range.c2 >= MAX_COLS)
    throw new SpreadsheetError(
      `"${text}" is outside the sheet. Sheets go up to row ${MAX_ROWS} and column ${columnName(MAX_COLS - 1)}.`,
    );
  return { sheet: on, range };
}

/** Columns like "C", "B:E" or "Sales!B:E". */
export function readColumns(wb: Workbook, text: string): Target {
  const single = /^(.*!)?\$?([A-Za-z]{1,3})$/.exec(text.trim());
  return readRange(wb, single ? `${single[1] ?? ""}${single[2]}:${single[2]}` : text);
}

/** A column letter like "C" as a 0-based index. */
export function readColumn(text: string): number {
  const letters = text.trim();
  if (!/^[A-Za-z]{1,3}$/.test(letters))
    throw new SpreadsheetError(`"${text}" isn't a column. Use letters, like C or AB.`);
  const col = columnIndex(letters);
  if (col >= MAX_COLS)
    throw new SpreadsheetError(
      `Column ${letters.toUpperCase()} is outside the sheet. Columns go up to ${columnName(MAX_COLS - 1)}.`,
    );
  return col;
}

/** A CSS color, or null for "none". */
export function readColor(text: string): string | null {
  const color = text.trim();
  if (color.toLowerCase() === "none") return null;
  if (!CSS.supports("color", color) || /^(inherit|initial|unset|revert|revert-layer)$/i.test(color))
    throw new SpreadsheetError(`"${text}" isn't a color. Use a CSS color, like #4d48d8 or red.`);
  return color;
}

export const where = ({ sheet, range }: Target): string => qualifiedName(sheet.name, range);
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** A chart with the same names add_chart takes. */
export const chartInfo = (chart: Chart) => ({
  id: chart.id,
  type: chart.type,
  title: chart.title,
  range: rangeName(chart.range),
  position: cellName(chart.anchor.row, chart.anchor.col),
  width: chart.width,
  height: chart.height,
  header_row: chart.headerRow,
  label_column: chart.labelColumn,
});

/** A conditional format rule with the same names add_conditional_format takes. */
export const ruleInfo = (rule: ConditionalRule) => ({
  id: rule.id,
  range: rangeName(rule.range),
  condition: rule.condition,
  value: rule.value,
  value2: rule.value2,
  formula: rule.formula,
  text_color: rule.style?.color,
  fill_color: rule.style?.fill,
  bold: rule.style?.bold,
  italic: rule.style?.italic,
  strikethrough: rule.style?.strike,
  min_color: rule.scale?.min,
  max_color: rule.scale?.max,
});
const filled = <T extends object>(record: T): T | undefined =>
  Object.keys(record).length ? record : undefined;

/** A cell's value for agents: errors as their code, dates and times as the text they show, numbers to 15 digits. */
export function plainValue(wb: Workbook, sheet: Sheet, row: number, col: number): Scalar {
  const value = wb.value(sheet, row, col);
  if (isError(value)) return value.code;
  if (typeof value !== "number") return value;
  const fmt = wb.cell(sheet, row, col)?.fmt;
  const dated = fmt?.numFmt === "date" || fmt?.numFmt === "time" || fmt?.numFmt === "datetime";
  return dated ? formatValue(value, fmt) : Number(value.toPrecision(15));
}

/** A cell format with the same names format_cells takes. */
export function formatInfo(fmt: CellFormat): Record<string, unknown> {
  const { bold, italic, underline, strike, color, fill, align, numFmt, decimals, currency } = fmt;
  const info = {
    bold,
    italic,
    underline,
    strikethrough: strike,
    text_color: color,
    fill_color: fill,
    align,
    number_format: numFmt,
    decimals,
    currency,
  };
  return Object.fromEntries(Object.entries(info).filter(([, value]) => value !== undefined));
}

/** Values row by row, plus formulas, formula errors and (when asked) formats by cell. */
export function readCells(
  wb: Workbook,
  sheet: Sheet,
  range: Range,
  withFormats = false,
): Record<string, unknown> {
  const values: Scalar[][] = [];
  const formulas: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const formats: Record<string, Record<string, unknown>> = {};
  for (let r = range.r1; r <= range.r2; r++) {
    const row: Scalar[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      const [cell, value, name] = [wb.cell(sheet, r, c), wb.value(sheet, r, c), cellName(r, c)];
      row.push(plainValue(wb, sheet, r, c));
      if (cell?.f) formulas[name] = cell.f;
      if (isError(value)) errors[name] = value.message;
      if (withFormats && cell?.fmt) formats[name] = formatInfo(cell.fmt);
    }
    values.push(row);
  }
  return {
    values,
    formulas: filled(formulas),
    formula_errors: filled(errors),
    formats: filled(formats),
  };
}

/** What a write returns: where it landed, the values when there are few, and any formula errors. */
export function written(wb: Workbook, target: Target): Record<string, unknown> {
  const { values, formula_errors } = readCells(wb, target.sheet, target.range);
  const small = rangeRows(target.range) * rangeCols(target.range) <= 100;
  return { range: where(target), values: small ? values : undefined, formula_errors };
}
