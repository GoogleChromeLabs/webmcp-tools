/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Sample data: quarterly sales with formulas, formats, rules, a chart, and a lookup sheet. */
import type { Workbook } from "./model/workbook.ts";

const REGIONS: [string, number, number, number, number, number][] = [
  ["North", 12500, 13800, 14250, 15900, 55000],
  ["South", 9800, 9400, 10100, 11050, 42000],
  ["East", 15200, 16100, 15800, 17400, 62000],
  ["West", 11300, 12650, 13900, 14800, 50000],
  ["Central", 8700, 8200, 7900, 8350, 36000],
];

/** Replaces the workbook with the sample (one undo step). */
export function loadSample(wb: Workbook): void {
  wb.transact("Load sample data", () => {
    const [sales, targets] = wb.resetSheets(["Sales", "Targets"]);
    const last = REGIONS.length + 1;
    wb.setBlock(sales, 0, 0, [
      ["Region", "Q1", "Q2", "Q3", "Q4", "Total", "Growth"],
      ...REGIONS.map(([name, ...quarters], i) => [
        name,
        ...quarters.slice(0, 4).map(String),
        `=SUM(B${i + 2}:E${i + 2})`,
        `=E${i + 2}/B${i + 2}-1`,
      ]),
      [
        "Total",
        ...["B", "C", "D", "E", "F"].map((col) => `=SUM(${col}2:${col}${last})`),
        `=E${last + 1}/B${last + 1}-1`,
      ],
    ]);
    const header = { r1: 0, c1: 0, r2: 0, c2: 6 };
    wb.format(sales, header, { bold: true, fill: "#e8e6ff", color: "#2f2a9e" });
    wb.format(sales, { r1: 0, c1: 1, r2: last, c2: 6 }, { align: "right" });
    wb.format(sales, { r1: 1, c1: 1, r2: last, c2: 5 }, { numFmt: "currency", decimals: 0 });
    wb.format(sales, { r1: 1, c1: 6, r2: last, c2: 6 }, { numFmt: "percent", decimals: 1 });
    wb.format(sales, { r1: last, c1: 0, r2: last, c2: 6 }, { bold: true, fill: "#f0eee8" });
    wb.setWidths(sales, 0, 0, 120);
    wb.setFrozen(sales, 1, 0);
    wb.addRule(sales, {
      range: { r1: 1, c1: 6, r2: last - 1, c2: 6 },
      condition: "less_than",
      value: 0,
      style: { color: "#b42318", fill: "#fde3df" },
    });
    wb.addRule(sales, {
      range: { r1: 1, c1: 5, r2: last - 1, c2: 5 },
      condition: "color_scale",
      scale: { min: "#ffffff", max: "#bcb9fb" },
    });
    wb.addChart(sales, {
      type: "column",
      title: "Quarterly sales by region",
      range: { r1: 0, c1: 0, r2: last - 1, c2: 4 },
      anchor: { row: last + 2, col: 0 },
      width: 560,
      height: 300,
      headerRow: true,
      labelColumn: true,
    });

    wb.setBlock(targets, 0, 0, [
      ["Region", "Target", "Actual", "Attainment", "Status"],
      ...REGIONS.map(([name, , , , , target], i) => [
        name,
        String(target),
        `=VLOOKUP(A${i + 2},Sales!$A$2:$F$${last},6,FALSE)`,
        `=C${i + 2}/B${i + 2}`,
        `=IF(D${i + 2}>=1,"On track","Behind")`,
      ]),
    ]);
    wb.format(
      targets,
      { r1: 0, c1: 0, r2: 0, c2: 4 },
      { bold: true, fill: "#ffe8d6", color: "#8a3a0a" },
    );
    wb.format(targets, { r1: 1, c1: 1, r2: last - 1, c2: 2 }, { numFmt: "currency", decimals: 0 });
    wb.format(targets, { r1: 1, c1: 3, r2: last - 1, c2: 3 }, { numFmt: "percent", decimals: 0 });
    wb.setWidths(targets, 0, 4, 110);
    wb.addRule(targets, {
      range: { r1: 1, c1: 4, r2: last - 1, c2: 4 },
      condition: "equal_to",
      value: "Behind",
      style: { color: "#b42318", bold: true },
    });
  });
}
