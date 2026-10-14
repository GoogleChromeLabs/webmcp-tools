/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The grid: one element per cell (rows off screen skip rendering with content-visibility),
 * selection, pointer interactions, column resizing, the fill handle, and overlay boxes.
 */
import { inRange, normalize, columnName, type Range } from "../engine/address.ts";
import { formatValue } from "../engine/format.ts";
import { isError } from "../engine/values.ts";
import { ruleStyles } from "../model/conditional.ts";
import type { Sheet, Workbook } from "../model/workbook.ts";
import { $, h } from "./dom.ts";

export const ROW_HEIGHT = 24;
export const HEADER_HEIGHT = 24;
export const ROW_HEADER_WIDTH = 48;

export interface Point {
  row: number;
  col: number;
}

/** The anchor is the active cell; the selected range spans anchor to focus. */
export interface Selection {
  anchor: Point;
  focus: Point;
}

export const selectionRange = ({ anchor, focus }: Selection): Range =>
  normalize(anchor.row, anchor.col, focus.row, focus.col);

const sameRange = (a: Range, b: Range): boolean =>
  a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

/** A box drawn over cells: the agent's last edit, copied cells, fill preview, formula references. */
export interface Box {
  range: Range;
  label?: string;
  color?: string;
}

export interface GridHooks {
  /** While a formula is being typed, a pressed cell can become a reference instead of a selection. */
  pointRef(range: Range, phase: "start" | "move"): boolean;
  /** The grid was pressed outside the editor. */
  commitEdit(): void;
  edit(): void;
  selectionChanged(): void;
  contextMenu(x: number, y: number): void;
  fill(source: Range, target: Range): void;
  resize(c1: number, c2: number, width: number | "fit"): void;
  rebuilt(): void;
}

type Hit = Point & { kind: "cell" | "col" | "row" | "corner" };
type Drag =
  | { kind: "cells" | "rows" | "cols" }
  | { kind: "ref"; start: Point }
  | { kind: "fill"; source: Range; target: Range }
  | { kind: "resize"; col: number; startX: number; startWidth: number; width: number };

export class GridView {
  readonly scroller = $("#grid-scroll");
  readonly root = $("#grid");
  private readonly overlays = $("#overlays");
  private readonly fillHandle = h("div", { className: "fill-handle" });
  private readonly wb: Workbook;
  private readonly hooks: GridHooks;
  sheet: Sheet;
  /** The cell that hosts the in-cell editor; painting leaves it alone. */
  editing: HTMLElement | null = null;
  private built = "";
  private frozenKey = "";
  private rows: HTMLElement[] = [];
  private cells: HTMLElement[][] = [];
  private colHeads: HTMLElement[] = [];
  private rowHeads: HTMLElement[] = [];
  private where = new WeakMap<Element, Hit>();
  private painted = new WeakMap<Element, string>();
  private decorated = new Map<string, Set<Element>>();
  private selections = new Map<string, Selection>();
  private boxes = new Map<string, { specs: Box[]; elements: HTMLElement[] }>();
  private tabStop: HTMLElement | null = null;
  private drag: Drag | null = null;

  constructor(wb: Workbook, hooks: GridHooks) {
    this.wb = wb;
    this.hooks = hooks;
    this.sheet = wb.active;
    this.root.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.root.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.root.addEventListener("pointerup", () => this.pointerUp());
    this.root.addEventListener("pointercancel", () => this.endDrag());
    this.root.addEventListener("dblclick", (e) => this.doubleClick(e));
    this.root.addEventListener("contextmenu", (e) => this.contextMenu(e));
    // Charts and boxes scroll with the cells; the stylesheet clips them under the sticky headers.
    const layers = [$("#charts"), this.overlays];
    this.scroller.addEventListener(
      "scroll",
      () => {
        for (const layer of layers) {
          layer.style.setProperty("--scroll-x", `${this.scroller.scrollLeft}px`);
          layer.style.setProperty("--scroll-y", `${this.scroller.scrollTop}px`);
        }
      },
      { passive: true },
    );
  }

  // ---------- selection ----------

  get sel(): Selection {
    let selection = this.selections.get(this.sheet.id);
    if (!selection)
      this.selections.set(
        this.sheet.id,
        (selection = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }),
      );
    return selection;
  }

  get range(): Range {
    return this.clamp(selectionRange(this.sel));
  }

  get active(): Point {
    return this.sel.anchor;
  }

  cellAt({ row, col }: Point): HTMLElement | undefined {
    return this.cells[row]?.[col];
  }

  private clampPoint({ row, col }: Point): Point {
    return {
      row: Math.max(0, Math.min(row, this.sheet.rows - 1)),
      col: Math.max(0, Math.min(col, this.sheet.cols - 1)),
    };
  }

  clamp(range: Range): Range {
    const a = this.clampPoint({ row: range.r1, col: range.c1 });
    const b = this.clampPoint({ row: range.r2, col: range.c2 });
    return { r1: a.row, c1: a.col, r2: b.row, c2: b.col };
  }

  select(anchor: Point, focus: Point = anchor, reveal = true): void {
    const selection = this.sel;
    selection.anchor = this.clampPoint(anchor);
    selection.focus = this.clampPoint(focus);
    this.renderSelection();
    if (reveal) this.reveal(selection.focus);
    this.hooks.selectionChanged();
  }

  selectRange(range: Range): void {
    this.select({ row: range.r1, col: range.c1 }, { row: range.r2, col: range.c2 });
    this.reveal({ row: range.r1, col: range.c1 });
  }

  /** Arrow keys: move (or extend) by one cell, or with `edge` to the end of the data. */
  move(dr: number, dc: number, extend: boolean, edge = false): void {
    const { anchor, focus } = this.sel;
    const from = extend ? focus : anchor;
    const to = edge
      ? this.edge(from, dr, dc)
      : this.clampPoint({ row: from.row + dr, col: from.col + dc });
    if (extend) this.select(anchor, to);
    else this.select(to);
  }

  /** Where Ctrl+arrow lands: the end of a run of filled cells, or the next filled cell. */
  private edge(from: Point, dr: number, dc: number): Point {
    const filled = (p: Point) => {
      const cell = this.wb.cell(this.sheet, p.row, p.col);
      return !!cell && (cell.v !== undefined || cell.f !== undefined);
    };
    const step = (p: Point): Point => ({ row: p.row + dr, col: p.col + dc });
    const inside = (p: Point) =>
      p.row >= 0 && p.col >= 0 && p.row < this.sheet.rows && p.col < this.sheet.cols;
    let next = step(from);
    if (!inside(next)) return from;
    if (filled(from) && filled(next)) {
      while (inside(step(next)) && filled(step(next))) next = step(next);
      return next;
    }
    while (!filled(next) && inside(step(next))) next = step(next);
    return next;
  }

  focusActive(): void {
    this.cellAt(this.active)?.focus({ preventScroll: true });
  }

  /** Scrolls so the cell is visible, keeping clear of the headers and frozen panes. */
  reveal({ row, col }: Point): void {
    const { scroller, sheet } = this;
    if (col >= sheet.frozenCols) {
      const frozen = this.colLeft(sheet.frozenCols) - ROW_HEADER_WIDTH;
      const [left, right] = [this.colLeft(col), this.colLeft(col + 1)];
      const viewLeft = scroller.scrollLeft + ROW_HEADER_WIDTH + frozen;
      if (left < viewLeft) scroller.scrollLeft = left - ROW_HEADER_WIDTH - frozen;
      else if (right > scroller.scrollLeft + scroller.clientWidth)
        scroller.scrollLeft = right - scroller.clientWidth;
    }
    if (row >= sheet.frozenRows) {
      const frozen = sheet.frozenRows * ROW_HEIGHT;
      const [top, bottom] = [this.rowTop(row), this.rowTop(row + 1)];
      const viewTop = scroller.scrollTop + HEADER_HEIGHT + frozen;
      if (top < viewTop) scroller.scrollTop = top - HEADER_HEIGHT - frozen;
      else if (bottom > scroller.scrollTop + scroller.clientHeight)
        scroller.scrollTop = bottom - scroller.clientHeight;
    }
  }

  // ---------- geometry ----------

  colLeft(col: number): number {
    let left = ROW_HEADER_WIDTH;
    for (let c = 0; c < col; c++) left += this.sheet.widths[c] ?? 0;
    return left;
  }

  rowTop(row: number): number {
    return HEADER_HEIGHT + row * ROW_HEIGHT;
  }

  /** Position of a range in the scrolled content, for overlays and charts. */
  rect(range: Range): { left: number; top: number; width: number; height: number } {
    const left = this.colLeft(range.c1);
    return {
      left,
      top: this.rowTop(range.r1),
      width: this.colLeft(range.c2 + 1) - left,
      height: (range.r2 - range.r1 + 1) * ROW_HEIGHT,
    };
  }

  /** The cell nearest to a point in the scrolled content (for dropping charts). */
  pointAt(x: number, y: number): Point {
    let col = 0;
    while (col < this.sheet.cols - 1 && this.colLeft(col + 1) <= x) col++;
    return this.clampPoint({ row: Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT), col });
  }

  // ---------- rendering ----------

  /** Shows a sheet; the DOM is rebuilt only when the sheet or its size changed. */
  show(sheet: Sheet): void {
    this.sheet = sheet;
    const key = `${sheet.id}:${sheet.rows}:${sheet.cols}`;
    if (key !== this.built) this.build(key);
    this.render();
  }

  private build(key: string): void {
    const hadFocus = this.root.contains(document.activeElement);
    const { rows, cols } = this.sheet;
    this.built = key;
    this.frozenKey = "";
    this.painted = new WeakMap();
    this.decorated.clear();
    this.where = new WeakMap();
    this.tabStop = null;
    const corner = h("div", { className: "corner", role: "columnheader", ariaLabel: "Select all" });
    this.where.set(corner, { kind: "corner", row: 0, col: 0 });
    this.colHeads = Array.from({ length: cols }, (_, col) => {
      const head = h(
        "div",
        { className: "ch", role: "columnheader" },
        columnName(col),
        h("span", { className: "resizer" }),
      );
      this.where.set(head, { kind: "col", row: 0, col });
      return head;
    });
    this.rowHeads = [];
    this.cells = [];
    this.rows = Array.from({ length: rows }, (_, row) => {
      const head = h("div", { className: "rh", role: "rowheader" }, String(row + 1));
      this.where.set(head, { kind: "row", row, col: 0 });
      const cells = Array.from({ length: cols }, (_, col) => {
        const cell = h("div", { className: "cell", role: "gridcell" });
        this.where.set(cell, { kind: "cell", row, col });
        return cell;
      });
      this.rowHeads.push(head);
      this.cells.push(cells);
      return h("div", { className: "row", role: "row" }, head, ...cells);
    });
    this.root.replaceChildren(
      h("div", { className: "hrow", role: "row" }, corner, ...this.colHeads),
      ...this.rows,
    );
    this.root.ariaRowCount = String(rows + 1);
    this.root.ariaColCount = String(cols + 1);
    this.hooks.rebuilt();
    if (hadFocus) this.focusActive();
  }

  render(): void {
    const { sheet, wb } = this;
    this.root.ariaLabel = sheet.name;
    const widths = sheet.widths.slice(0, sheet.cols);
    this.root.style.setProperty("--cols", widths.map((w) => `${w}px`).join(" "));
    this.applyFrozen(widths);
    const styleAt = ruleStyles(wb, sheet);
    for (let r = 0; r < sheet.rows; r++)
      for (let c = 0; c < sheet.cols; c++) this.paint(r, c, styleAt);
    this.renderSelection();
    this.layoutBoxes();
  }

  private applyFrozen(widths: number[]): void {
    const { frozenRows, frozenCols } = this.sheet;
    const key = `${frozenRows}:${frozenCols}:${widths.slice(0, frozenCols).join()}`;
    if (key === this.frozenKey) return;
    this.frozenKey = key;
    this.rows.forEach((row, r) => {
      row.classList.toggle("frozen", r < frozenRows);
      row.classList.toggle("frozen-edge", r === frozenRows - 1);
      row.style.top = r < frozenRows ? `${HEADER_HEIGHT + r * ROW_HEIGHT}px` : "";
    });
    let left = ROW_HEADER_WIDTH;
    for (let c = 0; c < this.sheet.cols; c++) {
      for (const element of [this.colHeads[c], ...this.cells.map((row) => row[c])]) {
        element.classList.toggle("fz", c < frozenCols);
        element.classList.toggle("fz-edge", c === frozenCols - 1);
        element.style.left = c < frozenCols ? `${left}px` : "";
      }
      left += widths[c];
    }
  }

  private paint(row: number, col: number, styleAt: ReturnType<typeof ruleStyles>): void {
    const element = this.cells[row][col];
    if (element === this.editing) return;
    const value = this.wb.value(this.sheet, row, col);
    const fmt = this.wb.cell(this.sheet, row, col)?.fmt;
    const rule = styleAt(row, col);
    const text = formatValue(value, fmt);
    const kind =
      value === null
        ? ""
        : isError(value)
          ? "e"
          : typeof value === "number"
            ? "n"
            : typeof value === "boolean"
              ? "b"
              : "t";
    const align =
      fmt?.align ?? (kind === "n" ? "right" : kind === "e" || kind === "b" ? "center" : "left");
    const flags = [
      (rule?.bold ?? fmt?.bold) && "b",
      (rule?.italic ?? fmt?.italic) && "i",
      fmt?.underline && "u",
      (rule?.strike ?? fmt?.strike) && "s",
    ]
      .filter(Boolean)
      .join(" ");
    const color = rule?.color ?? fmt?.color ?? "";
    const fill = rule?.fill ?? fmt?.fill ?? "";
    const tip = isError(value) ? value.message : "";
    const signature = [text, kind, align, flags, color, fill, tip].join("\u0001");
    if (this.painted.get(element) === signature) return;
    this.painted.set(element, signature);
    const handle = element.contains(this.fillHandle);
    element.textContent = text;
    if (handle) element.append(this.fillHandle);
    element.dataset.a = align[0];
    if (kind) element.dataset.k = kind;
    else delete element.dataset.k;
    if (flags) element.dataset.s = flags;
    else delete element.dataset.s;
    element.style.color = color;
    // The stylesheet paints the fill and picks a readable text color for it with contrast-color().
    if (fill) {
      element.style.setProperty("--fill", fill);
      element.dataset.f = "";
    } else {
      element.style.removeProperty("--fill");
      delete element.dataset.f;
    }
    element.title = tip;
  }

  /** Repaints one cell from scratch (after the editor leaves it). */
  repaint(point: Point): void {
    const element = this.cellAt(point);
    if (!element) return;
    this.painted.delete(element);
    this.paint(point.row, point.col, ruleStyles(this.wb, this.sheet));
  }

  /** Adds `name` to exactly these elements (a class, or an aria-* attribute set to "true"). */
  private decorate(name: string, next: Set<Element>): void {
    const previous = this.decorated.get(name) ?? new Set<Element>();
    const on = (e: Element) =>
      name.startsWith("aria-") ? e.setAttribute(name, "true") : e.classList.add(name);
    const off = (e: Element) =>
      name.startsWith("aria-") ? e.removeAttribute(name) : e.classList.remove(name);
    for (const element of previous) if (!next.has(element)) off(element);
    for (const element of next) if (!previous.has(element)) on(element);
    this.decorated.set(name, next);
  }

  renderSelection(): void {
    if (!this.cells.length) return;
    const range = this.range;
    const single = range.r1 === range.r2 && range.c1 === range.c2;
    const sets: Record<string, Set<Element>> = {
      sel: new Set(),
      "sel-t": new Set(),
      "sel-b": new Set(),
      "sel-l": new Set(),
      "sel-r": new Set(),
      hl: new Set(),
      "aria-selected": new Set(),
    };
    for (let r = range.r1; r <= range.r2; r++) {
      sets.hl.add(this.rowHeads[r]);
      for (let c = range.c1; c <= range.c2; c++) {
        const element = this.cells[r][c];
        sets["aria-selected"].add(element);
        if (!single) sets.sel.add(element);
        if (r === range.r1) sets["sel-t"].add(element);
        if (r === range.r2) sets["sel-b"].add(element);
        if (c === range.c1) sets["sel-l"].add(element);
        if (c === range.c2) sets["sel-r"].add(element);
      }
    }
    for (let c = range.c1; c <= range.c2; c++) sets.hl.add(this.colHeads[c]);
    for (const [name, set] of Object.entries(sets)) this.decorate(name, set);
    const active = this.cellAt(this.active)!;
    this.decorate("active", new Set([active]));
    if (this.tabStop !== active) {
      this.tabStop?.removeAttribute("tabindex");
      active.tabIndex = 0;
      const hadFocus = this.root.contains(document.activeElement) && !this.editing;
      this.tabStop = active;
      if (hadFocus) active.focus({ preventScroll: true });
    }
    const corner = this.cells[range.r2][range.c2];
    if (corner === this.editing) this.fillHandle.remove();
    else corner.append(this.fillHandle);
  }

  // ---------- overlay boxes ----------

  setBoxes(kind: string, specs: Box[]): void {
    const entry = this.boxes.get(kind) ?? { specs: [], elements: [] };
    entry.specs = specs;
    this.boxes.set(kind, entry);
    this.layoutBoxes();
  }

  private layoutBoxes(): void {
    for (const [kind, entry] of this.boxes) {
      while (entry.elements.length < entry.specs.length) {
        const element = h("div", { className: `box ${kind}` });
        this.overlays.append(element);
        entry.elements.push(element);
      }
      entry.elements.forEach((element, i) => {
        const spec = entry.specs[i];
        element.hidden = !spec;
        if (!spec) return;
        const { left, top, width, height } = this.rect(this.clamp(spec.range));
        Object.assign(element.style, {
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        });
        if (spec.color) element.style.setProperty("--box", spec.color);
        if (spec.label) element.dataset.label = spec.label;
        else delete element.dataset.label;
      });
    }
  }

  /** The overlay element for a box, so callers can restart its animation. */
  boxElement(kind: string, index: number): HTMLElement | undefined {
    return this.boxes.get(kind)?.elements[index];
  }

  // ---------- pointer ----------

  private hit(target: Element | null): Hit | undefined {
    const element = target?.closest(".cell, .ch, .rh, .corner");
    return element ? this.where.get(element) : undefined;
  }

  private pointerDown(e: PointerEvent): void {
    const target = e.target as Element;
    if (e.button !== 0 || target.closest(".cell-editor")) return;
    if (target === this.fillHandle) {
      this.startDrag(e, { kind: "fill", source: this.range, target: this.range });
      return;
    }
    if (target.classList.contains("resizer")) {
      const col = this.where.get(target.parentElement!)!.col;
      const width = this.sheet.widths[col];
      this.startDrag(e, { kind: "resize", col, startX: e.clientX, startWidth: width, width });
      return;
    }
    const hit = this.hit(target);
    if (!hit) return;
    if (
      hit.kind === "cell" &&
      this.hooks.pointRef(normalize(hit.row, hit.col, hit.row, hit.col), "start")
    ) {
      this.startDrag(e, { kind: "ref", start: hit });
      return;
    }
    this.hooks.commitEdit();
    const { rows, cols } = this.sheet;
    const anchor = this.sel.anchor;
    if (hit.kind === "corner")
      this.select({ row: 0, col: 0 }, { row: rows - 1, col: cols - 1 }, false);
    else if (hit.kind === "col")
      this.select(
        e.shiftKey ? { row: 0, col: anchor.col } : { row: 0, col: hit.col },
        { row: rows - 1, col: hit.col },
        false,
      );
    else if (hit.kind === "row")
      this.select(
        e.shiftKey ? { row: anchor.row, col: 0 } : { row: hit.row, col: 0 },
        { row: hit.row, col: cols - 1 },
        false,
      );
    else if (e.shiftKey) this.select(anchor, hit);
    else this.select(hit);
    this.startDrag(e, {
      kind: hit.kind === "col" ? "cols" : hit.kind === "row" ? "rows" : "cells",
    });
    this.focusActive();
  }

  private startDrag(e: PointerEvent, drag: Drag): void {
    e.preventDefault();
    this.drag = drag;
    this.root.setPointerCapture(e.pointerId);
  }

  private pointerMove(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    if (drag.kind === "resize") {
      drag.width = Math.max(24, Math.round(drag.startWidth + e.clientX - drag.startX));
      const widths = this.sheet.widths.slice(0, this.sheet.cols);
      widths[drag.col] = drag.width;
      this.root.style.setProperty("--cols", widths.map((w) => `${w}px`).join(" "));
      return;
    }
    const hit = this.hit(document.elementFromPoint(e.clientX, e.clientY));
    if (!hit || hit.kind === "corner") return;
    const { anchor } = this.sel;
    switch (drag.kind) {
      case "cells":
        this.select(anchor, hit);
        break;
      case "cols":
        this.select(anchor, { row: this.sheet.rows - 1, col: hit.col });
        break;
      case "rows":
        this.select(anchor, { row: hit.row, col: this.sheet.cols - 1 });
        break;
      case "ref":
        this.hooks.pointRef(normalize(drag.start.row, drag.start.col, hit.row, hit.col), "move");
        break;
      case "fill":
        drag.target = this.fillTarget(drag.source, hit);
        this.setBoxes("fill", sameRange(drag.target, drag.source) ? [] : [{ range: drag.target }]);
        break;
    }
  }

  private pointerUp(): void {
    const drag = this.drag;
    this.endDrag();
    if (drag?.kind === "resize" && drag.width !== drag.startWidth) {
      const range = this.range;
      const whole =
        range.r1 === 0 &&
        range.r2 === this.sheet.rows - 1 &&
        drag.col >= range.c1 &&
        drag.col <= range.c2;
      this.hooks.resize(whole ? range.c1 : drag.col, whole ? range.c2 : drag.col, drag.width);
    }
    if (drag?.kind === "fill") {
      this.setBoxes("fill", []);
      if (!sameRange(drag.target, drag.source)) this.hooks.fill(drag.source, drag.target);
    }
  }

  private endDrag(): void {
    this.drag = null;
  }

  /** The fill handle extends the selection along the axis the pointer moved furthest. */
  private fillTarget(source: Range, hit: Point): Range {
    const dr =
      hit.row < source.r1 ? hit.row - source.r1 : hit.row > source.r2 ? hit.row - source.r2 : 0;
    const dc =
      hit.col < source.c1 ? hit.col - source.c1 : hit.col > source.c2 ? hit.col - source.c2 : 0;
    if (!dr && !dc) return source;
    return Math.abs(dr) >= Math.abs(dc)
      ? { ...source, r1: Math.min(source.r1, hit.row), r2: Math.max(source.r2, hit.row) }
      : { ...source, c1: Math.min(source.c1, hit.col), c2: Math.max(source.c2, hit.col) };
  }

  private doubleClick(e: MouseEvent): void {
    const target = e.target as Element;
    if (target.classList.contains("resizer")) {
      const col = this.where.get(target.parentElement!)!.col;
      this.hooks.resize(col, col, "fit");
    } else if (this.hit(target)?.kind === "cell" && !target.closest(".cell-editor"))
      this.hooks.edit();
  }

  private contextMenu(e: MouseEvent): void {
    const hit = this.hit(e.target as Element);
    if (!hit || (e.target as Element).closest(".cell-editor")) return;
    e.preventDefault();
    this.hooks.commitEdit();
    const range = this.range;
    const { rows, cols } = this.sheet;
    if (
      hit.kind === "col" &&
      !(range.r1 === 0 && range.r2 === rows - 1 && hit.col >= range.c1 && hit.col <= range.c2)
    )
      this.select({ row: 0, col: hit.col }, { row: rows - 1, col: hit.col }, false);
    else if (
      hit.kind === "row" &&
      !(range.c1 === 0 && range.c2 === cols - 1 && hit.row >= range.r1 && hit.row <= range.r2)
    )
      this.select({ row: hit.row, col: 0 }, { row: hit.row, col: cols - 1 }, false);
    else if (hit.kind === "cell" && !inRange(range, hit.row, hit.col)) this.select(hit);
    this.focusActive();
    this.hooks.contextMenu(e.clientX, e.clientY);
  }
}
