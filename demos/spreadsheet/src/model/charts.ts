/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Reads a chart's data range: category labels down the first column, one series per column. */
import { columnName, type Range } from "../engine/address.ts";
import type { Chart, Sheet, Workbook } from "./workbook.ts";

/** Chart sizes in pixels. */
export const CHART_LIMITS = {
  minWidth: 240,
  maxWidth: 1200,
  minHeight: 160,
  maxHeight: 800,
} as const;

export interface ChartSeries {
  name: string;
  values: (number | null)[];
}

export interface ChartData {
  categories: string[];
  series: ChartSeries[];
}

/** Text in the first row means series names; text down the first column means category labels. */
export function detectLayout(
  wb: Workbook,
  sheet: Sheet,
  range: Range,
): { headerRow: boolean; labelColumn: boolean } {
  const isText = (r: number, c: number) => typeof wb.value(sheet, r, c) === "string";
  let [headerRow, labelColumn] = [false, false];
  for (let c = range.c1; c <= range.c2 && !headerRow; c++) headerRow = isText(range.r1, c);
  for (let r = range.r1 + 1; r <= range.r2 && !labelColumn; r++) labelColumn = isText(r, range.c1);
  return { headerRow, labelColumn };
}

export function chartData(wb: Workbook, sheet: Sheet, chart: Omit<Chart, "id">): ChartData {
  const { range, headerRow, labelColumn } = chart;
  const firstRow = range.r1 + (headerRow ? 1 : 0);
  const firstCol = range.c1 + (labelColumn ? 1 : 0);
  const rows: number[] = [];
  for (let r = firstRow; r <= range.r2; r++) rows.push(r);
  const categories = rows.map((r, i) =>
    labelColumn ? wb.display(sheet, r, range.c1) : String(i + 1),
  );
  const series: ChartSeries[] = [];
  for (let c = firstCol; c <= range.c2; c++) {
    const values = rows.map((r) => {
      const v = wb.value(sheet, r, c);
      return typeof v === "number" ? v : null;
    });
    if (values.some((v) => v !== null))
      series.push({ name: (headerRow && wb.display(sheet, range.r1, c)) || columnName(c), values });
  }
  return { categories, series };
}
