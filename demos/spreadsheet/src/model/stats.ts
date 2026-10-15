/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Sum, average and counts of a range: the status bar and the get_spreadsheet_selection tool show them. */
import type { Range } from "../engine/address.ts";
import type { Sheet, Workbook } from "./workbook.ts";

export interface RangeStats {
  cells: number;
  filled: number;
  numbers: number;
  sum: number;
  average: number | null;
}

export function rangeStats(wb: Workbook, sheet: Sheet, range: Range): RangeStats {
  const stats: RangeStats = { cells: 0, filled: 0, numbers: 0, sum: 0, average: null };
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      stats.cells++;
      const value = wb.value(sheet, r, c);
      if (value !== null && value !== "") stats.filled++;
      if (typeof value === "number") {
        stats.numbers++;
        stats.sum += value;
      }
    }
  stats.sum = Number(stats.sum.toPrecision(15));
  stats.average = stats.numbers ? Number((stats.sum / stats.numbers).toPrecision(15)) : null;
  return stats;
}
