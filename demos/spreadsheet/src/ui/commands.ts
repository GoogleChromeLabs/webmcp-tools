/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Every user command, shared by the toolbar, the menus and the keyboard shortcuts. */
import { rangeName, type Range } from "../engine/address.ts";
import type { NumberFormat } from "../engine/format.ts";
import { chartData, detectLayout } from "../model/charts.ts";
import type { FormatPatch } from "../model/workbook.ts";
import type { App } from "./app.ts";

export type Commands = Record<string, (value?: string) => void>;

export function createCommands(app: App): Commands {
  const { wb } = app;
  const here = () => ({ sheet: app.grid.sheet, range: app.grid.range, active: app.grid.active });
  const activeFormat = () => {
    const { sheet, active } = here();
    return wb.cell(sheet, active.row, active.col)?.fmt ?? {};
  };
  const format = (patch: FormatPatch) =>
    app.run(() => wb.format(here().sheet, here().range, patch));
  const toggle = (key: "bold" | "italic" | "underline" | "strike") =>
    format({ [key]: activeFormat()[key] ? null : true });
  const align = (value: "left" | "center" | "right") =>
    format({ align: activeFormat().align === value ? null : value });

  function decimals(delta: number): void {
    const { sheet, active } = here();
    const fmt = activeFormat();
    const keep = fmt.numFmt === "number" || fmt.numFmt === "currency" || fmt.numFmt === "percent";
    const value = wb.value(sheet, active.row, active.col);
    const shown = typeof value === "number" ? (String(value).split(".")[1]?.length ?? 0) : 0;
    const current = fmt.decimals ?? (keep ? 2 : Math.min(shown, 10));
    format({
      numFmt: keep ? fmt.numFmt : "number",
      decimals: Math.max(0, Math.min(10, current + delta)),
    });
  }

  /** Sorts the selection, or with one cell or column selected, the data below the frozen rows. */
  function sort(descending: boolean): void {
    const { sheet, range, active } = here();
    const used = wb.usedRange(sheet);
    if (!used) return;
    const target =
      range.r2 > range.r1 && range.c2 > range.c1
        ? range
        : { ...used, r1: Math.max(used.r1, sheet.frozenRows) };
    if (target.r1 < target.r2)
      app.run(() => wb.sort(sheet, target, [{ col: active.col, descending }], false));
  }

  /** Σ: totals under each selected column, or a SUM of the numbers next to the active cell. */
  function autoSum(): void {
    const { sheet, range, active } = here();
    const numeric = (r: number, c: number) => typeof wb.value(sheet, r, c) === "number";
    const sum = (r: Range) => `=SUM(${rangeName(r)})`;
    if (range.r2 > range.r1)
      return app.run(() =>
        wb.transact("Sum", () => {
          for (let c = range.c1; c <= range.c2; c++)
            wb.setInput(sheet, range.r2 + 1, c, sum({ ...range, c1: c, c2: c }));
        }),
      );
    if (range.c2 > range.c1)
      return app.run(() => wb.setInput(sheet, range.r1, range.c2 + 1, sum(range)));
    let r = active.row;
    while (r > 0 && numeric(r - 1, active.col)) r--;
    if (r < active.row)
      return app.run(() =>
        wb.setInput(
          sheet,
          active.row,
          active.col,
          sum({ r1: r, c1: active.col, r2: active.row - 1, c2: active.col }),
        ),
      );
    let c = active.col;
    while (c > 0 && numeric(active.row, c - 1)) c--;
    if (c < active.col)
      return app.run(() =>
        wb.setInput(
          sheet,
          active.row,
          active.col,
          sum({ r1: active.row, c1: c, r2: active.row, c2: active.col - 1 }),
        ),
      );
    app.editor.start("enter", "=SUM(");
  }

  function insertChart(): void {
    const { sheet, range } = here();
    const data = range.r1 !== range.r2 || range.c1 !== range.c2 ? range : wb.usedRange(sheet);
    if (!data) return app.toast("Select the data to chart first.");
    const { headerRow, labelColumn } = detectLayout(wb, sheet, data);
    const spec = {
      type: "column" as const,
      title: "",
      range: data,
      anchor: { row: data.r1, col: Math.min(data.c2 + 2, sheet.cols - 1) },
      width: 480,
      height: 300,
      headerRow,
      labelColumn,
    };
    const names = chartData(wb, sheet, spec).series.map((s) => s.name);
    const by = labelColumn && headerRow ? wb.display(sheet, data.r1, data.c1) : "";
    const title = names.length
      ? `${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}${by ? ` by ${by}` : ""}`
      : "";
    app.run(() => {
      const chart = wb.addChart(sheet, { ...spec, title });
      app.charts.render();
      app.charts.focus(chart.id);
    });
  }

  function fill(direction: "down" | "right"): void {
    const { sheet, range } = here();
    app.run(() =>
      wb.transact(direction === "down" ? "Fill down" : "Fill right", () => {
        if (direction === "down") {
          const source = range.r1 === range.r2 ? range.r1 - 1 : range.r1;
          for (let r = source + 1; source >= 0 && r <= range.r2; r++)
            wb.copy(sheet, { ...range, r1: source, r2: source }, sheet, r, range.c1, "all");
        } else {
          const source = range.c1 === range.c2 ? range.c1 - 1 : range.c1;
          for (let c = source + 1; source >= 0 && c <= range.c2; c++)
            wb.copy(sheet, { ...range, c1: source, c2: source }, sheet, range.r1, c, "all");
        }
      }),
    );
  }

  const rows = () => here().range.r2 - here().range.r1 + 1;
  const cols = () => here().range.c2 - here().range.c1 + 1;

  return {
    undo: () => app.undo(),
    redo: () => app.redo(),
    bold: () => toggle("bold"),
    italic: () => toggle("italic"),
    underline: () => toggle("underline"),
    strike: () => toggle("strike"),
    "decimals-up": () => decimals(1),
    "decimals-down": () => decimals(-1),
    numfmt: (value) =>
      format(
        value === "general"
          ? { numFmt: null, decimals: null, currency: null }
          : { numFmt: value as NumberFormat },
      ),
    "align-left": () => align("left"),
    "align-center": () => align("center"),
    "align-right": () => align("right"),
    "text-color": (color) => format({ color: color || null }),
    "fill-color": (color) => format({ fill: color || null }),
    "clear-format": () => app.run(() => wb.clear(here().sheet, here().range, "formats")),
    "freeze-rows": (value) => {
      const { sheet, active } = here();
      app.run(() =>
        wb.setFrozen(sheet, value === "current" ? active.row + 1 : Number(value), sheet.frozenCols),
      );
    },
    "freeze-cols": (value) => {
      const { sheet, active } = here();
      app.run(() =>
        wb.setFrozen(sheet, sheet.frozenRows, value === "current" ? active.col + 1 : Number(value)),
      );
    },
    "sort-asc": () => sort(false),
    "sort-desc": () => sort(true),
    autosum: autoSum,
    "insert-chart": insertChart,
    cut: () => void app.clipboard.copyFromMenu(true),
    copy: () => void app.clipboard.copyFromMenu(false),
    paste: () => void app.clipboard.pasteFromMenu("all"),
    "paste-values": () => void app.clipboard.pasteFromMenu("values"),
    "insert-row-above": () => app.run(() => wb.insertRows(here().sheet, here().range.r1, rows())),
    "insert-row-below": () =>
      app.run(() => wb.insertRows(here().sheet, here().range.r2 + 1, rows())),
    "insert-col-left": () => app.run(() => wb.insertColumns(here().sheet, here().range.c1, cols())),
    "insert-col-right": () =>
      app.run(() => wb.insertColumns(here().sheet, here().range.c2 + 1, cols())),
    "delete-rows": () => app.run(() => wb.deleteRows(here().sheet, here().range.r1, rows())),
    "delete-cols": () => app.run(() => wb.deleteColumns(here().sheet, here().range.c1, cols())),
    clear: () => app.run(() => wb.clear(here().sheet, here().range, "contents")),
    "fill-down": () => fill("down"),
    "fill-right": () => fill("right"),
    "import-csv": () => app.importCsv(),
    "export-csv": () => app.exportCsv(),
  };
}
