/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Connects the workbook to the page: grid, editor, toolbar, tabs, charts, dialogs, keyboard and status. */
import {
  cellName,
  columnName,
  keyCol,
  keyRow,
  MAX_COLS,
  MAX_ROWS,
  parseRef,
  rangeName,
  refRange,
} from "../engine/address.ts";
import { formatValue } from "../engine/format.ts";
import { isError } from "../engine/values.ts";
import { rangeStats } from "../model/stats.ts";
import {
  DEFAULT_WIDTH,
  SpreadsheetError,
  type Sheet,
  type Workbook,
  type WorkbookEvent,
} from "../model/workbook.ts";
import { loadSample } from "../sample.ts";
import { Activity, type Target } from "./activity.ts";
import { ChartsView } from "./charts.ts";
import { Clipboard } from "./clipboard.ts";
import { createCommands, type Commands } from "./commands.ts";
import { parseDelimited, safeCsvText, sniffDelimiter, toDelimited } from "./csv.ts";
import { setupConditionalFormats, setupFindReplace } from "./dialogs.ts";
import { $, h } from "./dom.ts";
import { Editor, type Move } from "./editor.ts";
import { GridView, ROW_HEIGHT, type Point } from "./grid.ts";
import { Tabs } from "./tabs.ts";
import { setupToolbar } from "./toolbar.ts";

const MOVES: Record<Move, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};
const stat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export class App {
  readonly wb: Workbook;
  readonly grid: GridView;
  readonly editor: Editor;
  readonly activity: Activity;
  readonly charts: ChartsView;
  readonly clipboard: Clipboard;
  private readonly tabs: Tabs;
  private readonly commands: Commands;
  private readonly toolbar: { sync(): void };
  private readonly find: { open(): void };
  private readonly nameBox = $<HTMLInputElement>("#name-box");
  private readonly welcome = $<HTMLDialogElement>("#welcome");
  private readonly toastBox = $("#toast");
  private toastTimer = 0;
  private measure: CanvasRenderingContext2D | null = null;

  constructor(wb: Workbook) {
    this.wb = wb;
    // The grid calls back into the editor, which is created right after it.
    this.grid = new GridView(wb, {
      pointRef: (range, phase) => this.editor?.pointRef(range, phase) ?? false,
      commitEdit: () => this.editor?.commit(null, false),
      edit: () => this.editor.start("edit"),
      selectionChanged: () => this.selectionChanged(),
      contextMenu: (x, y) => this.openContextMenu(x, y),
      fill: (source, target) =>
        this.run(() => {
          wb.autofill(this.grid.sheet, source, target);
          this.grid.selectRange(target);
        }),
      resize: (c1, c2, width) => this.resizeColumns(c1, c2, width),
      rebuilt: () => this.editor?.rehost(),
    });
    this.editor = new Editor(this);
    this.activity = new Activity(this);
    this.charts = new ChartsView(this);
    this.clipboard = new Clipboard(this);
    this.tabs = new Tabs(this);
    this.commands = createCommands(this);
    this.toolbar = setupToolbar(this, this.commands);
    this.find = setupFindReplace(this);
    setupConditionalFormats(this);
    this.grid.root.addEventListener("keydown", (e) => this.key(e));
    this.setupNameBox();
    this.setupPanel();
    this.setupContextMenu();
    $("#load-sample").addEventListener("click", () => {
      this.run(() => loadSample(wb));
      this.focusGrid();
    });
    // After "Start blank" or Escape, focus is left on the closed card (or the page); put it on
    // the sheet so typing works right away.
    this.welcome.addEventListener("close", () => {
      const focused = document.activeElement;
      if (focused === document.body || this.welcome.contains(focused)) this.focusGrid();
    });
    const file = $<HTMLInputElement>("#csv-file");
    file.addEventListener("change", () => {
      if (file.files?.[0]) void this.readCsv(file.files[0]);
      file.value = "";
    });
    wb.on((event) => this.changed(event));
    if (wb.isEmpty()) this.welcome.show();
    this.refresh();
  }

  // ---------- editor host ----------

  write(sheet: Sheet, at: Point, text: string): void {
    this.run(() => this.wb.setInput(sheet, at.row, at.col, text));
  }

  after(move: Move | null): void {
    if (move) this.grid.move(...MOVES[move], false);
    this.focusGrid();
  }

  // ---------- shared helpers ----------

  /** Runs a user action; edits that can't be done show their reason in a toast. */
  run(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      if (!(error instanceof SpreadsheetError)) throw error;
      this.toast(error.message);
    }
  }

  toast(message: string): void {
    this.toastBox.textContent = message;
    if (!this.toastBox.matches(":popover-open")) this.toastBox.showPopover();
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastBox.hidePopover(), 4000);
  }

  focusGrid(): void {
    if (!this.editor.active) this.grid.focusActive();
  }

  showSheet(sheet: Sheet): void {
    this.editor.commit(null, false);
    this.wb.activate(sheet);
  }

  /** Shows a sheet and selects a range on it. */
  reveal(target: Target): void {
    this.showSheet(target.sheet);
    this.grid.selectRange(target.range);
  }

  /** What the person has selected, and the active cell in it. */
  selection(): Target & { active: Point } {
    return { sheet: this.grid.sheet, range: this.grid.range, active: { ...this.grid.active } };
  }

  undo(): void {
    this.editor.commit(null, false);
    this.wb.undo();
  }

  redo(): void {
    this.editor.commit(null, false);
    this.wb.redo();
  }

  /** Width that fits the widest value in a column (used by double-click and resize_columns). */
  fitWidth(sheet: Sheet, col: number): number {
    this.measure ??= document.createElement("canvas").getContext("2d");
    const sample = this.grid.cellAt({ row: 0, col: 0 });
    if (!this.measure || !sample) return DEFAULT_WIDTH;
    const { fontSize, fontFamily } = getComputedStyle(sample);
    let widest = 0;
    for (const [key, cell] of sheet.cells) {
      if (keyCol(key) !== col || (cell.v === undefined && cell.f === undefined)) continue;
      this.measure.font = `${cell.fmt?.bold ? "700 " : ""}${fontSize} ${fontFamily}`;
      widest = Math.max(
        widest,
        this.measure.measureText(this.wb.display(sheet, keyRow(key), col)).width,
      );
    }
    return widest ? Math.ceil(widest + 18) : DEFAULT_WIDTH;
  }

  private resizeColumns(c1: number, c2: number, width: number | "fit"): void {
    const sheet = this.grid.sheet;
    this.run(() =>
      this.wb.setWidths(
        sheet,
        c1,
        c2,
        width === "fit" ? (col) => this.fitWidth(sheet, col) : width,
      ),
    );
  }

  placePointerAnchor(x: number, y: number): void {
    Object.assign($("#pointer-anchor").style, { left: `${x}px`, top: `${y}px` });
  }

  // ---------- rendering ----------

  private changed(event: WorkbookEvent): void {
    this.refresh();
    if (
      (event.type === "undo" || event.type === "redo") &&
      event.focus?.sheetId === this.grid.sheet.id
    )
      this.grid.selectRange(event.focus.range);
  }

  refresh(): void {
    if (this.editor.active && !this.wb.sheets.includes(this.grid.sheet)) this.editor.cancel();
    this.grid.show(this.wb.active);
    this.tabs.render();
    this.charts.render();
    this.selectionChanged();
    // The welcome card is only for a fresh workbook. Once there is content (typed, pasted,
    // imported or from an agent), it closes and doesn't come back, even if the sheet is cleared.
    if (this.welcome.open && !this.wb.isEmpty()) this.welcome.close();
  }

  private selectionChanged(): void {
    const { wb, grid } = this;
    const { sheet, range, active } = grid;
    this.editor.sync();
    this.toolbar.sync();
    if (document.activeElement !== this.nameBox)
      this.nameBox.value =
        range.r1 === range.r2 && range.c1 === range.c2
          ? cellName(active.row, active.col)
          : rangeName(range);
    const value = wb.value(sheet, active.row, active.col);
    $("#cell-error").textContent = isError(value) ? `${value.code} ${value.message}` : "";
    const stats =
      range.r1 === range.r2 && range.c1 === range.c2 ? null : rangeStats(wb, sheet, range);
    $("#stats").textContent = !stats?.filled
      ? ""
      : stats.numbers
        ? `Sum ${stat.format(stats.sum)} · Average ${stat.format(stats.average!)} · Count ${stats.filled}`
        : `Count ${stats.filled}`;
  }

  // ---------- keyboard ----------

  private key(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (this.editor.active || e.isComposing || !target.classList.contains("cell")) return;
    const { grid } = this;
    const { rows, cols } = grid.sheet;
    const mod = e.ctrlKey || e.metaKey;
    const command = (name: string) => {
      e.preventDefault();
      this.commands[name]();
    };
    if (ARROWS[e.key] && !e.altKey) {
      e.preventDefault();
      grid.move(...ARROWS[e.key], e.shiftKey, mod);
      return;
    }
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      const shortcuts: Record<string, string> = {
        y: "redo",
        b: "bold",
        i: "italic",
        u: "underline",
        d: "fill-down",
        r: "fill-right",
        "\\": "clear-format",
      };
      if (key === "z") command(e.shiftKey ? "redo" : "undo");
      else if (shortcuts[key]) command(shortcuts[key]);
      else if (key === "a") {
        e.preventDefault();
        grid.select({ row: 0, col: 0 }, { row: rows - 1, col: cols - 1 }, false);
      } else if (key === "f" || key === "h") {
        e.preventDefault();
        this.find.open();
      } else if (key === " ") {
        e.preventDefault();
        grid.select({ row: 0, col: grid.range.c1 }, { row: rows - 1, col: grid.range.c2 }, false);
      } else if (key === "home") {
        e.preventDefault();
        grid.select({ row: 0, col: 0 });
      } else if (key === "end") {
        e.preventDefault();
        const used = this.wb.usedRange(grid.sheet);
        grid.select({ row: used?.r2 ?? 0, col: used?.c2 ?? 0 });
      } else if (key === "v" && e.shiftKey) this.clipboard.pasteValuesNext();
      return; // Copy, cut and paste continue as clipboard events.
    }
    if (e.altKey && e.key === "=") return command("autosum");
    if (e.altKey && e.shiftKey && e.code === "Digit5") return command("strike");
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (e.shiftKey) grid.move(-1, 0, false);
        else this.editor.start("edit");
        return;
      case "F2":
        e.preventDefault();
        this.editor.start("edit");
        return;
      case "Tab":
        e.preventDefault();
        grid.move(0, e.shiftKey ? -1 : 1, false);
        return;
      case "Delete":
      case "Backspace":
        return command("clear");
      case "Escape":
        this.clipboard.clear();
        return;
      case "Home":
        e.preventDefault();
        grid.select({ row: grid.active.row, col: 0 });
        return;
      case "End": {
        e.preventDefault();
        grid.select({ row: grid.active.row, col: this.wb.usedRange(grid.sheet)?.c2 ?? 0 });
        return;
      }
      case "PageDown":
      case "PageUp": {
        e.preventDefault();
        const page = Math.max(1, Math.floor(grid.scroller.clientHeight / ROW_HEIGHT) - 2);
        grid.move(e.key === "PageDown" ? page : -page, 0, e.shiftKey);
        return;
      }
      case "ContextMenu":
      case "F10":
        if (e.key === "F10" && !e.shiftKey) return;
        e.preventDefault();
        this.openContextMenuAtActive();
        return;
    }
    if (e.key === " " && e.shiftKey) {
      e.preventDefault();
      grid.select({ row: grid.range.r1, col: 0 }, { row: grid.range.r2, col: cols - 1 }, false);
    } else if (!e.altKey && e.key.length === 1) {
      e.preventDefault();
      this.editor.start("enter", e.key);
    }
  }

  // ---------- panels, menus, name box ----------

  private setupPanel(): void {
    const button = $("#toggle-activity");
    const panel = $("#activity");
    const narrow = matchMedia("(width < 900px)");
    const set = (open: boolean) => {
      panel.hidden = !open;
      button.ariaExpanded = String(open);
    };
    set(!narrow.matches);
    narrow.addEventListener("change", () => set(!narrow.matches));
    button.addEventListener("click", () => set(Boolean(panel.hidden)));
  }

  private setupContextMenu(): void {
    const menu = $("#context-menu");
    menu.addEventListener("toggle", (e) => {
      const closed = (e as ToggleEvent).newState === "closed";
      if (
        closed &&
        (document.activeElement === document.body || menu.contains(document.activeElement))
      )
        this.focusGrid();
    });
  }

  private openContextMenu(x: number, y: number): void {
    const { range } = this.grid;
    const rows = range.r2 - range.r1 + 1;
    const cols = range.c2 - range.c1 + 1;
    const label = (cmd: string, text: string) =>
      ($(`#context-menu [data-cmd="${cmd}"]`).firstChild!.textContent = text);
    const many = (n: number, one: string, other: string) => (n === 1 ? one : `${n} ${other}`);
    label("insert-row-above", `Insert ${many(rows, "row", "rows")} above`);
    label("insert-row-below", `Insert ${many(rows, "row", "rows")} below`);
    label("insert-col-left", `Insert ${many(cols, "column", "columns")} left`);
    label("insert-col-right", `Insert ${many(cols, "column", "columns")} right`);
    label(
      "delete-rows",
      rows === 1 ? `Delete row ${range.r1 + 1}` : `Delete rows ${range.r1 + 1}–${range.r2 + 1}`,
    );
    label(
      "delete-cols",
      cols === 1
        ? `Delete column ${columnName(range.c1)}`
        : `Delete columns ${columnName(range.c1)}–${columnName(range.c2)}`,
    );
    this.placePointerAnchor(x, y);
    const menu = $("#context-menu");
    if (menu.matches(":popover-open")) menu.hidePopover();
    menu.showPopover();
  }

  private openContextMenuAtActive(): void {
    const rect = this.grid.cellAt(this.grid.active)!.getBoundingClientRect();
    this.openContextMenu(rect.left + 8, rect.bottom);
  }

  private setupNameBox(): void {
    const box = this.nameBox;
    box.addEventListener("focus", () => box.select());
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.focusGrid();
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      const ref = parseRef(box.value);
      const sheet = ref?.sheet ? this.wb.sheetByName(ref.sheet) : this.grid.sheet;
      if (!ref || !sheet)
        return this.toast(`"${box.value}" isn't a cell or range. Try B2 or A1:C10.`);
      this.reveal({ sheet, range: refRange(ref, sheet.rows, sheet.cols) });
      this.focusGrid();
    });
    box.addEventListener("blur", () => this.selectionChanged());
  }

  // ---------- CSV ----------

  importCsv(): void {
    $<HTMLInputElement>("#csv-file").click();
  }

  /** Imports into a new sheet named after the file, so nothing is overwritten. */
  private async readCsv(file: File): Promise<void> {
    const text = await file.text();
    const rows = parseDelimited(text, sniffDelimiter(text))
      .slice(0, MAX_ROWS)
      .map((row) => row.slice(0, MAX_COLS));
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[\\/?*[\]:']/g, " ")
        .trim()
        .slice(0, 40) || "Import";
    let name = base;
    for (let n = 2; this.wb.sheetByName(name); n++) name = `${base} ${n}`;
    this.run(() =>
      this.wb.transact("Import CSV", () => {
        const sheet = this.wb.addSheet(name);
        this.wb.setBlock(sheet, 0, 0, rows);
        this.wb.activate(sheet);
      }),
    );
  }

  exportCsv(): void {
    const { wb } = this;
    const sheet = this.grid.sheet;
    const used = wb.usedRange(sheet);
    if (!used) return this.toast("This sheet is empty, so there is nothing to export.");
    const rows: string[][] = [];
    for (let r = 0; r <= used.r2; r++) {
      const row: string[] = [];
      for (let c = 0; c <= used.c2; c++) {
        const value = wb.value(sheet, r, c);
        const text = formatValue(value, wb.cell(sheet, r, c)?.fmt);
        row.push(typeof value === "string" ? safeCsvText(text) : text);
      }
      rows.push(row);
    }
    const url = URL.createObjectURL(new Blob([toDelimited(rows, ",")], { type: "text/csv" }));
    h("a", { href: url, download: `${sheet.name}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
