/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Copy, cut and paste. Other apps get tab-separated text, so cells move between this sheet and
 * other spreadsheets; within the workbook the full cells (formulas, formats) are pasted.
 */
import type { Range } from "../engine/address.ts";
import type { PasteMode, Sheet } from "../model/workbook.ts";
import type { App } from "./app.ts";
import { parseDelimited, toDelimited } from "./csv.ts";

export class Clipboard {
  private readonly app: App;
  private copied: { sheet: Sheet; range: Range; cut: boolean; text: string } | null = null;
  private valuesOnly = false;

  constructor(app: App) {
    this.app = app;
    document.addEventListener("copy", (e) => this.onCopy(e, false));
    document.addEventListener("cut", (e) => this.onCopy(e, true));
    document.addEventListener("paste", (e) => this.onPaste(e));
  }

  /** Ctrl+Shift+V: the paste that follows keeps only values. */
  pasteValuesNext(): void {
    this.valuesOnly = true;
  }

  private inGrid(): boolean {
    return this.app.grid.root.contains(document.activeElement) && !this.app.editor.active;
  }

  /** Remembers the selected cells and returns them as text for the system clipboard. */
  private copy(cut: boolean): string {
    const { wb, grid } = this.app;
    const { sheet, range } = grid;
    const rows: string[][] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) row.push(wb.display(sheet, r, c));
      rows.push(row);
    }
    const text = toDelimited(rows, "\t");
    this.copied = { sheet, range, cut, text };
    grid.setBoxes("copy", [{ range }]);
    return text;
  }

  private onCopy(e: ClipboardEvent, cut: boolean): void {
    if (!this.inGrid() || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", this.copy(cut));
  }

  private onPaste(e: ClipboardEvent): void {
    if (!this.inGrid() || !e.clipboardData) return;
    e.preventDefault();
    this.paste(e.clipboardData.getData("text/plain"), this.valuesOnly ? "values" : "all");
    this.valuesOnly = false;
  }

  /** Menu items can't use the keyboard events, so they use the async Clipboard API. */
  async copyFromMenu(cut: boolean): Promise<void> {
    const text = this.copy(cut);
    await navigator.clipboard.writeText(text).catch(() => {
      // Pasting inside the workbook still works without system clipboard access.
    });
  }

  async pasteFromMenu(mode: PasteMode): Promise<void> {
    const text = await navigator.clipboard.readText().catch(() => this.copied?.text);
    if (text === undefined)
      this.app.toast("Press Ctrl+V to paste: the browser blocked reading the clipboard.");
    else this.paste(text, mode);
  }

  paste(text: string, mode: PasteMode): void {
    const { wb, grid } = this.app;
    const { sheet, active } = grid;
    const copied = this.copied;
    if (copied && text === copied.text && wb.sheets.includes(copied.sheet)) {
      this.app.run(() =>
        grid.selectRange(
          wb.copy(copied.sheet, copied.range, sheet, active.row, active.col, mode, copied.cut),
        ),
      );
      if (copied.cut) this.clear();
      return;
    }
    if (!text) return;
    const rows = parseDelimited(text.replace(/\r?\n$/, ""), "\t");
    this.app.run(() => grid.selectRange(wb.setBlock(sheet, active.row, active.col, rows)));
  }

  clear(): void {
    this.copied = null;
    this.app.grid.setBoxes("copy", []);
  }
}
