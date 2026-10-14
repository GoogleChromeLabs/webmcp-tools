/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The workbook: sheets of immutable cells, recalculation, and every edit people and agents make.
 * Each edit runs in a transaction that becomes one undo step, or is rolled back if it fails.
 */
import {
  cellKey,
  cellName,
  columnName,
  contains,
  inRange,
  keyCol,
  keyRow,
  MAX_COLS,
  MAX_ROWS,
  type Range,
} from "../engine/address.ts";
import { evaluate } from "../engine/evaluator.ts";
import { formatValue, type CellFormat } from "../engine/format.ts";
import { parseInput } from "../engine/input.ts";
import { FormulaSyntaxError, parseFormula, type Node } from "../engine/parser.ts";
import {
  dropSheetRefs,
  moveRefs,
  normalizeFormula,
  renameSheetRefs,
  rewriteFormula,
  shiftRelative,
  shiftStructure,
  type RefMapper,
} from "../engine/rewrite.ts";
import type { Scope } from "../engine/scope.ts";
import {
  compareScalars,
  FormulaError,
  isError,
  toScalar,
  type Scalar,
  type Value,
} from "../engine/values.ts";
import { extendSeries } from "./autofill.ts";

export const DEFAULT_ROWS = 100;
export const DEFAULT_COLS = 26;
export const DEFAULT_WIDTH = 100;
const HISTORY_LIMIT = 100;

export interface Cell {
  /** A literal value; formulas and format-only cells have none. */
  readonly v?: string | number | boolean;
  /** Formula text, including the leading "=". */
  readonly f?: string;
  readonly fmt?: CellFormat;
}

export const RULE_CONDITIONS = [
  "greater_than",
  "less_than",
  "between",
  "equal_to",
  "not_equal_to",
  "text_contains",
  "is_empty",
  "not_empty",
  "formula",
  "color_scale",
] as const;
export type RuleCondition = (typeof RULE_CONDITIONS)[number];
/** Conditions that compare each cell with a value. */
export const VALUE_CONDITIONS: readonly RuleCondition[] = [
  "greater_than",
  "less_than",
  "between",
  "equal_to",
  "not_equal_to",
  "text_contains",
];

export interface RuleStyle {
  readonly color?: string;
  readonly fill?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly strike?: boolean;
}

export interface ConditionalRule {
  readonly id: string;
  readonly range: Range;
  readonly condition: RuleCondition;
  readonly value?: number | string;
  readonly value2?: number;
  /** Written for the top-left cell of `range`; relative references shift for the other cells. */
  readonly formula?: string;
  readonly style?: RuleStyle;
  readonly scale?: { readonly min: string; readonly max: string };
}

export const CHART_TYPES = ["column", "bar", "line", "area", "pie", "scatter"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface Chart {
  readonly id: string;
  readonly type: ChartType;
  readonly title: string;
  /** Data on the chart's own sheet. */
  readonly range: Range;
  readonly anchor: { readonly row: number; readonly col: number };
  readonly width: number;
  readonly height: number;
  readonly headerRow: boolean;
  readonly labelColumn: boolean;
}

export interface Sheet {
  readonly id: string;
  name: string;
  rows: number;
  cols: number;
  cells: Map<number, Cell>;
  widths: number[];
  frozenRows: number;
  frozenCols: number;
  rules: ConditionalRule[];
  charts: Chart[];
}

/** An edit that can't be done, with a reason people and agents can act on. */
export class SpreadsheetError extends Error {
  readonly details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.details = details;
  }
}

export type ChangeSource = "user" | "agent";
export type PasteMode = "all" | "values" | "formats" | "formulas";
export type FormatPatch = { [K in keyof CellFormat]?: CellFormat[K] | null };
export interface Focus {
  sheetId: string;
  range: Range;
}
export interface WorkbookEvent {
  type: "edit" | "undo" | "redo" | "activate";
  label: string;
  source: ChangeSource;
  focus?: Focus;
}

interface Snapshot {
  sheets: Sheet[];
  activeId: string;
}
interface HistoryEntry {
  label: string;
  source: ChangeSource;
  before: Snapshot;
  after: Snapshot;
  focus?: Focus;
}
interface Transaction {
  label: string;
  source: ChangeSource;
  before: Snapshot;
  dirty: boolean;
  focus?: Focus;
}

const copySheet = (sheet: Sheet): Sheet => ({
  ...sheet,
  cells: new Map(sheet.cells),
  widths: [...sheet.widths],
  rules: [...sheet.rules],
  charts: [...sheet.charts],
});

/** Drops undefined keys so empty cells can be recognized and removed. */
function compact(cell: { v?: Cell["v"]; f?: string; fmt?: CellFormat }): Cell | undefined {
  const out: { -readonly [K in keyof Cell]: Cell[K] } = {};
  if (cell.v !== undefined) out.v = cell.v;
  if (cell.f !== undefined) out.f = cell.f;
  if (cell.fmt !== undefined && Object.keys(cell.fmt).length) out.fmt = cell.fmt;
  return Object.keys(out).length ? out : undefined;
}

function mergeFormat(base: CellFormat | undefined, patch: FormatPatch): CellFormat | undefined {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return Object.keys(next).length ? (next as CellFormat) : undefined;
}

/** Moves a span along one axis when rows or columns are inserted (count > 0) or deleted (count < 0). */
function shiftSpan(lo: number, hi: number, at: number, count: number): [number, number] | null {
  if (count > 0) return [lo >= at ? lo + count : lo, hi >= at ? hi + count : hi];
  const end = at - count;
  const newLo = lo < at ? lo : lo < end ? at : lo + count;
  const newHi = hi < at ? hi : hi < end ? at - 1 : hi + count;
  return newHi < newLo ? null : [newLo, newHi];
}

function shiftRange(range: Range, axis: "row" | "col", at: number, count: number): Range | null {
  const span =
    axis === "row"
      ? shiftSpan(range.r1, range.r2, at, count)
      : shiftSpan(range.c1, range.c2, at, count);
  if (!span) return null;
  return axis === "row"
    ? { ...range, r1: span[0], r2: span[1] }
    : { ...range, c1: span[0], c2: span[1] };
}

/** Sort order: blanks always last, then errors, then values in the requested direction. */
function sortCompare(a: Value, b: Value, descending: boolean): number {
  const rank = (v: Value) => (v === null || v === "" ? 2 : isError(v) ? 1 : 0);
  if (rank(a) || rank(b)) return rank(a) - rank(b);
  const diff = compareScalars(a as Scalar, b as Scalar);
  return descending ? -diff : diff;
}

export class Workbook {
  sheets: Sheet[];
  activeId: string;
  private readonly listeners = new Set<(event: WorkbookEvent) => void>();
  private readonly asts = new Map<string, Node | FormulaSyntaxError>();
  private computed = new Map<string, Map<number, Value>>();
  private evaluating = new Set<string>();
  private stale = true;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private tx: Transaction | null = null;
  private readonly ids = { sheet: 1, chart: 1, rule: 1 };

  constructor() {
    this.sheets = [this.blankSheet("Sheet1")];
    this.activeId = this.sheets[0].id;
  }

  // ---------- events ----------

  on(listener: (event: WorkbookEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: WorkbookEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  // ---------- reading ----------

  get active(): Sheet {
    return this.sheetById(this.activeId) ?? this.sheets[0];
  }

  sheetById(id: string): Sheet | undefined {
    return this.sheets.find((sheet) => sheet.id === id);
  }

  sheetByName(name: string): Sheet | undefined {
    const lower = name.toLowerCase();
    return this.sheets.find((sheet) => sheet.name.toLowerCase() === lower);
  }

  /** The named sheet (the active one when no name is given), or a readable error. */
  sheet(name?: string | null): Sheet {
    if (!name) return this.active;
    const sheet = this.sheetByName(name);
    if (!sheet)
      throw new SpreadsheetError(`There is no sheet named "${name}".`, {
        sheets: this.sheets.map((s) => s.name),
      });
    return sheet;
  }

  cell(sheet: Sheet, row: number, col: number): Cell | undefined {
    return sheet.cells.get(cellKey(row, col));
  }

  /** A cell's value; formulas are computed. */
  value(sheet: Sheet, row: number, col: number): Value {
    if (this.stale) this.recalculate();
    const key = cellKey(row, col);
    const cell = sheet.cells.get(key);
    if (!cell) return null;
    return cell.f !== undefined ? this.compute(sheet, key) : (cell.v ?? null);
  }

  /** The text a cell shows. */
  display(sheet: Sheet, row: number, col: number): string {
    return formatValue(this.value(sheet, row, col), this.cell(sheet, row, col)?.fmt);
  }

  /** The smallest range holding every value and formula (format-only cells don't count). */
  usedRange(sheet: Sheet): Range | null {
    let range: Range | null = null;
    for (const [key, cell] of sheet.cells) {
      if (cell.v === undefined && cell.f === undefined) continue;
      const [r, c] = [keyRow(key), keyCol(key)];
      range = range
        ? {
            r1: Math.min(range.r1, r),
            c1: Math.min(range.c1, c),
            r2: Math.max(range.r2, r),
            c2: Math.max(range.c2, c),
          }
        : { r1: r, c1: c, r2: r, c2: c };
    }
    return range;
  }

  isEmpty(): boolean {
    return this.sheets.every((sheet) => this.usedRange(sheet) === null && !sheet.charts.length);
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  /** Cells whose text (or formula) matches; text matching ignores case unless asked. */
  search(
    sheet: Sheet,
    query: string,
    options: { matchCase?: boolean; entireCell?: boolean; formulas?: boolean } = {},
  ): { row: number; col: number }[] {
    const needle = options.matchCase ? query : query.toLowerCase();
    const test = (text: string) => {
      const hay = options.matchCase ? text : text.toLowerCase();
      return options.entireCell ? hay === needle : hay.includes(needle);
    };
    const hits: { row: number; col: number }[] = [];
    for (const key of [...sheet.cells.keys()].sort((a, b) => a - b)) {
      const [row, col] = [keyRow(key), keyCol(key)];
      const cell = sheet.cells.get(key)!;
      if (test(this.display(sheet, row, col)) || (options.formulas && cell.f && test(cell.f)))
        hits.push({ row, col });
    }
    return hits;
  }

  /** A conditional-format formula, written for `origin`, computed at (row, col). */
  evaluateAt(
    sheet: Sheet,
    formula: string,
    row: number,
    col: number,
    origin: { row: number; col: number },
  ): Value {
    if (this.stale) this.recalculate();
    const node = this.ast(formula);
    if (node instanceof FormulaSyntaxError) return new FormulaError("#ERROR!", node.message);
    return toScalar(
      evaluate(node, this.scope(sheet, row, col, row - origin.row, col - origin.col)),
    );
  }

  // ---------- recalculation ----------

  private ast(formula: string): Node | FormulaSyntaxError {
    let node = this.asts.get(formula);
    if (!node) {
      try {
        node = parseFormula(formula.slice(1));
      } catch (error) {
        if (!(error instanceof FormulaSyntaxError)) throw error;
        node = error;
      }
      if (this.asts.size > 5000) this.asts.clear();
      this.asts.set(formula, node);
    }
    return node;
  }

  private scope(sheet: Sheet, row: number, col: number, dr = 0, dc = 0): Scope {
    return {
      sheet,
      row,
      col,
      dr,
      dc,
      findSheet: (name) => this.sheetByName(name),
      // The engine only ever hands back sheets it got from this workbook.
      value: (s, r, c) => this.value(s as Sheet, r, c),
    };
  }

  private compute(sheet: Sheet, key: number): Value {
    let cache = this.computed.get(sheet.id);
    if (!cache) this.computed.set(sheet.id, (cache = new Map()));
    if (cache.has(key)) return cache.get(key)!;
    const id = `${sheet.id}:${key}`;
    const [row, col] = [keyRow(key), keyCol(key)];
    if (this.evaluating.has(id))
      return new FormulaError(
        "#REF!",
        `Circular reference: ${cellName(row, col)} depends on its own value.`,
      );
    this.evaluating.add(id);
    const node = this.ast(sheet.cells.get(key)!.f!);
    const value =
      node instanceof FormulaSyntaxError
        ? new FormulaError("#ERROR!", node.message)
        : toScalar(evaluate(node, this.scope(sheet, row, col)));
    this.evaluating.delete(id);
    cache.set(key, value);
    return value;
  }

  /**
   * Recomputes every formula. Cells are visited in row-major order, so the usual top-to-bottom
   * dependencies are already known and recursion stays shallow.
   */
  private recalculate(): void {
    this.stale = false;
    this.computed = new Map();
    this.evaluating = new Set();
    for (const sheet of this.sheets) {
      const formulas = [...sheet.cells]
        .filter(([, cell]) => cell.f !== undefined)
        .map(([key]) => key);
      for (const key of formulas.sort((a, b) => a - b)) this.compute(sheet, key);
    }
  }

  // ---------- transactions & history ----------

  /** Runs `fn` as one undo step. If it throws, everything it changed is rolled back. */
  transact<T>(label: string, fn: () => T, source: ChangeSource = "user"): T {
    if (this.tx) return fn();
    const tx: Transaction = { label, source, before: this.snapshot(), dirty: false };
    this.tx = tx;
    let result: T;
    try {
      result = fn();
    } catch (error) {
      this.tx = null;
      if (tx.dirty) this.restore(tx.before);
      throw error;
    }
    this.tx = null;
    if (tx.dirty) {
      this.undoStack.push({
        label,
        source,
        before: tx.before,
        after: this.snapshot(),
        focus: tx.focus,
      });
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.emit({ type: "edit", label, source, focus: tx.focus });
    }
    return result;
  }

  private edit<T>(label: string, fn: () => T): T {
    return this.tx ? fn() : this.transact(label, fn);
  }

  /** Marks the open transaction as changed; the first range touched is where undo returns to. */
  private touch(sheet: Sheet, range?: Range): void {
    if (!this.tx) throw new Error("Workbook edits must run inside transact().");
    this.tx.dirty = true;
    this.stale = true;
    if (range && !this.tx.focus) this.tx.focus = { sheetId: sheet.id, range };
  }

  private snapshot(): Snapshot {
    return { sheets: this.sheets.map(copySheet), activeId: this.activeId };
  }

  /** Restores in place, so code holding a sheet keeps seeing its current state. */
  private restore(snapshot: Snapshot): void {
    const live = new Map(this.sheets.map((sheet) => [sheet.id, sheet]));
    this.sheets = snapshot.sheets.map((saved) => {
      const copy = copySheet(saved);
      const sheet = live.get(saved.id);
      return sheet ? Object.assign(sheet, copy) : copy;
    });
    this.activeId = snapshot.activeId;
    this.stale = true;
  }

  undo(): string | null {
    return this.step(this.undoStack, this.redoStack, "undo");
  }

  redo(): string | null {
    return this.step(this.redoStack, this.undoStack, "redo");
  }

  /** Restores the other side of the last entry and shows the sheet where that change happened. */
  private step(from: HistoryEntry[], to: HistoryEntry[], type: "undo" | "redo"): string | null {
    const entry = from.pop();
    if (!entry) return null;
    this.restore(type === "undo" ? entry.before : entry.after);
    to.push(entry);
    if (entry.focus && this.sheetById(entry.focus.sheetId)) this.activeId = entry.focus.sheetId;
    this.emit({ type, label: entry.label, source: entry.source, focus: entry.focus });
    return entry.label;
  }

  // ---------- cells ----------

  private blankSheet(name: string): Sheet {
    return {
      id: `s${this.ids.sheet++}`,
      name,
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      cells: new Map(),
      widths: Array.from({ length: DEFAULT_COLS }, () => DEFAULT_WIDTH),
      frozenRows: 0,
      frozenCols: 0,
      rules: [],
      charts: [],
    };
  }

  /** Grows the sheet to fit (row, col), leaving a few empty rows below new data. */
  private grow(sheet: Sheet, row: number, col: number): void {
    if (row >= MAX_ROWS || col >= MAX_COLS)
      throw new SpreadsheetError(
        `${cellName(Math.min(row, MAX_ROWS - 1), Math.min(col, MAX_COLS - 1))} is the furthest a sheet goes: at most ${MAX_ROWS} rows and columns A to ${columnName(MAX_COLS - 1)}.`,
      );
    if (row >= sheet.rows) sheet.rows = Math.min(MAX_ROWS, row + 11);
    if (col >= sheet.cols) {
      sheet.cols = Math.min(MAX_COLS, col + 2);
      while (sheet.widths.length < sheet.cols) sheet.widths.push(DEFAULT_WIDTH);
    }
  }

  private put(sheet: Sheet, row: number, col: number, cell: Cell | undefined): void {
    this.grow(sheet, row, col);
    const next = cell && compact(cell);
    if (next) sheet.cells.set(cellKey(row, col), next);
    else sheet.cells.delete(cellKey(row, col));
    this.touch(sheet);
  }

  /** The cell that typing `input` produces; typed numbers bring a format when there is none. */
  private typed(prev: Cell | undefined, input: string): Cell | undefined {
    const fmt = prev?.fmt;
    if (fmt?.numFmt === "text") return { v: input === "" ? undefined : input, fmt };
    const parsed = parseInput(input);
    return {
      v: parsed.value ?? undefined,
      f: parsed.formula && normalizeFormula(parsed.formula),
      fmt: parsed.format && !fmt?.numFmt ? { ...fmt, ...parsed.format } : fmt,
    };
  }

  /** Writes text as if typed into the cell. */
  setInput(sheet: Sheet, row: number, col: number, input: string): void {
    this.edit(`Edit ${cellName(row, col)}`, () => {
      this.touch(sheet, { r1: row, c1: col, r2: row, c2: col });
      this.put(sheet, row, col, this.typed(this.cell(sheet, row, col), input));
    });
  }

  /** Writes rows of typed text from (row, col); undefined entries stay as they are. */
  setBlock(
    sheet: Sheet,
    row: number,
    col: number,
    rows: readonly (readonly (string | undefined)[])[],
  ): Range {
    const width = Math.max(1, ...rows.map((cells) => cells.length));
    const range = { r1: row, c1: col, r2: row + rows.length - 1, c2: col + width - 1 };
    this.edit("Edit cells", () => {
      this.touch(sheet, range);
      rows.forEach((cells, dr) =>
        cells.forEach((input, dc) => {
          if (input !== undefined)
            this.put(
              sheet,
              row + dr,
              col + dc,
              this.typed(this.cell(sheet, row + dr, col + dc), input),
            );
        }),
      );
    });
    return range;
  }

  /** Writes one typed input into every cell of the range; formulas shift for each cell like a fill. */
  fillInput(sheet: Sheet, range: Range, input: string): void {
    const formula = parseInput(input).formula;
    const base = formula && normalizeFormula(formula);
    this.edit("Fill cells", () => {
      this.touch(sheet, range);
      for (let r = range.r1; r <= range.r2; r++)
        for (let c = range.c1; c <= range.c2; c++) {
          const text = base
            ? rewriteFormula(base, shiftRelative(r - range.r1, c - range.c1))
            : input;
          this.put(sheet, r, c, this.typed(this.cell(sheet, r, c), text));
        }
    });
  }

  clear(sheet: Sheet, range: Range, what: "contents" | "formats" | "all"): void {
    this.edit(what === "formats" ? "Clear formatting" : "Clear cells", () => {
      this.touch(sheet, range);
      for (const [key, cell] of sheet.cells) {
        if (!inRange(range, keyRow(key), keyCol(key))) continue;
        const next =
          what === "all"
            ? undefined
            : what === "contents"
              ? { fmt: cell.fmt }
              : { v: cell.v, f: cell.f };
        this.put(sheet, keyRow(key), keyCol(key), next);
      }
    });
  }

  format(sheet: Sheet, range: Range, patch: FormatPatch): void {
    this.edit("Format cells", () => {
      this.touch(sheet, range);
      for (let r = range.r1; r <= range.r2; r++)
        for (let c = range.c1; c <= range.c2; c++) {
          const cell = this.cell(sheet, r, c);
          this.put(sheet, r, c, { v: cell?.v, f: cell?.f, fmt: mergeFormat(cell?.fmt, patch) });
        }
    });
  }

  /** Copies (or with `cut`, moves) a range; formulas shift like a paste. Returns the destination. */
  copy(
    from: Sheet,
    src: Range,
    to: Sheet,
    row: number,
    col: number,
    mode: PasteMode,
    cut = false,
  ): Range {
    const [dr, dc] = [row - src.r1, col - src.c1];
    const dst = { r1: row, c1: col, r2: src.r2 + dr, c2: src.c2 + dc };
    return this.edit(cut ? "Move cells" : "Paste", () => {
      this.touch(to, dst);
      // Read everything first: the source and the destination may overlap.
      const items: { r: number; c: number; cell?: Cell; value: Value }[] = [];
      for (let r = src.r1; r <= src.r2; r++)
        for (let c = src.c1; c <= src.c2; c++)
          items.push({
            r,
            c,
            cell: this.cell(from, r, c),
            value: mode === "values" ? this.value(from, r, c) : null,
          });
      const followMove = moveRefs(from.name, from.name, src, to.name, dr, dc);
      const shifted = (f: string): string =>
        cut
          ? rewriteFormula(f, (ref) => {
              const moved = followMove(ref);
              return moved === ref && from !== to && ref.sheet === null
                ? { ...ref, sheet: from.name }
                : moved;
            })
          : rewriteFormula(f, shiftRelative(dr, dc));
      if (cut) {
        for (const item of items) this.put(from, item.r, item.c, undefined);
        this.rewriteAll((own) => moveRefs(own, from.name, src, to.name, dr, dc));
      }
      for (const { r, c, cell, value } of items) {
        const existing = this.cell(to, r + dr, c + dc);
        const formula = cell?.f && shifted(cell.f);
        const pasted: Cell | undefined =
          mode === "all"
            ? cell && { ...cell, f: formula || undefined }
            : mode === "values"
              ? {
                  v: value === null ? undefined : isError(value) ? value.code : value,
                  fmt: existing?.fmt,
                }
              : mode === "formats"
                ? { v: existing?.v, f: existing?.f, fmt: cell?.fmt }
                : { v: cell?.v, f: formula || undefined, fmt: existing?.fmt };
        this.put(to, r + dr, c + dc, pasted);
      }
      return dst;
    });
  }

  /** Continues the pattern of `src` into the rest of `dst`, which extends it in one direction. */
  autofill(sheet: Sheet, src: Range, dst: Range): void {
    const vertical = dst.c1 === src.c1 && dst.c2 === src.c2;
    const horizontal = dst.r1 === src.r1 && dst.r2 === src.r2;
    if (!contains(dst, src) || vertical === horizontal)
      throw new SpreadsheetError(
        "The fill range must contain the source range and extend it up, down, left or right.",
      );
    this.edit("Autofill", () => {
      this.touch(sheet, dst);
      const [lines, from, to, start] = vertical
        ? [[src.c1, src.c2], [src.r1, src.r2], [dst.r1, dst.r2], src.r1]
        : [[src.r1, src.r2], [src.c1, src.c2], [dst.c1, dst.c2], src.c1];
      for (let line = lines[0]; line <= lines[1]; line++) {
        const at = (p: number): [number, number] => (vertical ? [p, line] : [line, p]);
        const source: (Cell | undefined)[] = [];
        for (let p = from[0]; p <= from[1]; p++) source.push(this.cell(sheet, ...at(p)));
        const offsets: number[] = [];
        for (let p = to[0]; p <= to[1]; p++)
          if (p < from[0] || p > from[1]) offsets.push(p - start);
        const cells = extendSeries(source, offsets, (f, by) =>
          rewriteFormula(f, vertical ? shiftRelative(by, 0) : shiftRelative(0, by)),
        );
        offsets.forEach((offset, i) => this.put(sheet, ...at(start + offset), cells[i]));
      }
    });
  }

  /** Sorts the rows of a range by one or more columns; blanks go last either way. */
  sort(
    sheet: Sheet,
    range: Range,
    keys: { col: number; descending: boolean }[],
    hasHeader: boolean,
  ): void {
    this.edit("Sort range", () => {
      const start = hasHeader ? range.r1 + 1 : range.r1;
      this.touch(sheet, range);
      const rows: { r: number; keys: Value[]; cells: (Cell | undefined)[] }[] = [];
      for (let r = start; r <= range.r2; r++) {
        const cells: (Cell | undefined)[] = [];
        for (let c = range.c1; c <= range.c2; c++) cells.push(this.cell(sheet, r, c));
        rows.push({ r, keys: keys.map((key) => this.value(sheet, r, key.col)), cells });
      }
      rows.sort((a, b) => {
        for (let i = 0; i < keys.length; i++) {
          const diff = sortCompare(a.keys[i], b.keys[i], keys[i].descending);
          if (diff) return diff;
        }
        return a.r - b.r;
      });
      rows.forEach((row, i) => {
        const dr = start + i - row.r;
        row.cells.forEach((cell, j) =>
          this.put(
            sheet,
            start + i,
            range.c1 + j,
            cell?.f && dr ? { ...cell, f: rewriteFormula(cell.f, shiftRelative(dr, 0)) } : cell,
          ),
        );
      });
    });
  }

  /** Replaces text in values (and optionally formulas). Returns the cells that changed. */
  replaceText(
    sheet: Sheet,
    range: Range,
    find: string,
    replacement: string,
    options: { matchCase?: boolean; entireCell?: boolean; formulas?: boolean } = {},
  ): { row: number; col: number }[] {
    const source = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      options.entireCell ? `^${source}$` : source,
      options.matchCase ? "g" : "gi",
    );
    const changed: { row: number; col: number }[] = [];
    this.edit("Replace", () => {
      for (const [key, cell] of sheet.cells) {
        const [row, col] = [keyRow(key), keyCol(key)];
        if (!inRange(range, row, col)) continue;
        const text =
          cell.f !== undefined
            ? options.formulas
              ? cell.f
              : null
            : typeof cell.v === "string"
              ? cell.v
              : null;
        if (text === null) continue;
        const next = text.replace(pattern, () => replacement);
        if (next === text) continue;
        if (!changed.length) this.touch(sheet, range);
        this.put(sheet, row, col, this.typed(cell, next));
        changed.push({ row, col });
      }
    });
    return changed;
  }

  // ---------- rows & columns ----------

  insertRows(sheet: Sheet, at: number, count: number): void {
    this.edit(count === 1 ? "Insert row" : "Insert rows", () =>
      this.restructure(sheet, "row", at, count),
    );
  }

  deleteRows(sheet: Sheet, at: number, count: number): void {
    this.edit(count === 1 ? "Delete row" : "Delete rows", () =>
      this.restructure(sheet, "row", at, -count),
    );
  }

  insertColumns(sheet: Sheet, at: number, count: number): void {
    this.edit(count === 1 ? "Insert column" : "Insert columns", () =>
      this.restructure(sheet, "col", at, count),
    );
  }

  deleteColumns(sheet: Sheet, at: number, count: number): void {
    this.edit(count === 1 ? "Delete column" : "Delete columns", () =>
      this.restructure(sheet, "col", at, -count),
    );
  }

  /** Inserts (count > 0) or deletes (count < 0) rows or columns, and keeps every reference pointing at the same cells. */
  private restructure(sheet: Sheet, axis: "row" | "col", at: number, count: number): void {
    const [size, limit, word] =
      axis === "row" ? [sheet.rows, MAX_ROWS, "row"] : [sheet.cols, MAX_COLS, "column"];
    if (count > 0 && size + count > limit)
      throw new SpreadsheetError(`A sheet can have at most ${limit} ${word}s; it has ${size}.`);
    if (count < 0 && -count >= size)
      throw new SpreadsheetError(`A sheet needs at least one ${word}.`);
    this.touch(
      sheet,
      axis === "row"
        ? { r1: at, c1: 0, r2: at + Math.abs(count) - 1, c2: sheet.cols - 1 }
        : { r1: 0, c1: at, r2: sheet.rows - 1, c2: at + Math.abs(count) - 1 },
    );
    const moved = new Map<number, Cell>();
    for (const [key, cell] of sheet.cells) {
      const [r, c] = [keyRow(key), keyCol(key)];
      const span = shiftSpan(axis === "row" ? r : c, axis === "row" ? r : c, at, count);
      if (span) moved.set(axis === "row" ? cellKey(span[0], c) : cellKey(r, span[0]), cell);
    }
    sheet.cells = moved;
    const keepFrozen = (frozen: number) =>
      frozen ? (shiftSpan(0, frozen - 1, at, count)?.[1] ?? -1) + 1 : 0;
    if (axis === "row") {
      sheet.rows += count;
      sheet.frozenRows = keepFrozen(sheet.frozenRows);
    } else {
      sheet.cols += count;
      if (count > 0)
        sheet.widths.splice(at, 0, ...Array.from({ length: count }, () => DEFAULT_WIDTH));
      else sheet.widths.splice(at, -count);
      sheet.frozenCols = keepFrozen(sheet.frozenCols);
    }
    this.rewriteAll((own) => shiftStructure(own, sheet.name, axis, at, count));
    sheet.rules = sheet.rules.flatMap((rule) => {
      const range = shiftRange(rule.range, axis, at, count);
      return range ? [{ ...rule, range }] : [];
    });
    sheet.charts = sheet.charts.flatMap((chart) => {
      const range = shiftRange(chart.range, axis, at, count);
      if (!range) return [];
      const position = axis === "row" ? chart.anchor.row : chart.anchor.col;
      const anchorAt = shiftSpan(position, position, at, count)?.[0] ?? at;
      const anchor =
        axis === "row" ? { ...chart.anchor, row: anchorAt } : { ...chart.anchor, col: anchorAt };
      return [{ ...chart, range, anchor }];
    });
  }

  /** Rewrites the references in every formula, including conditional-format formulas. */
  private rewriteAll(mapperFor: (ownSheet: string) => RefMapper): void {
    for (const sheet of this.sheets) {
      const map = mapperFor(sheet.name);
      for (const [key, cell] of sheet.cells) {
        if (cell.f === undefined) continue;
        const f = rewriteFormula(cell.f, map);
        if (f === cell.f) continue;
        sheet.cells.set(key, { ...cell, f });
        this.touch(sheet);
      }
      sheet.rules = sheet.rules.map((rule) => {
        const formula = rule.formula && rewriteFormula(rule.formula, map);
        return formula === rule.formula ? rule : { ...rule, formula };
      });
    }
  }

  setWidths(sheet: Sheet, c1: number, c2: number, width: number | ((col: number) => number)): void {
    this.edit(c1 === c2 ? "Resize column" : "Resize columns", () => {
      this.touch(sheet, { r1: 0, c1, r2: sheet.rows - 1, c2 });
      for (let c = c1; c <= c2; c++) {
        const px = typeof width === "number" ? width : width(c);
        sheet.widths[c] = Math.round(Math.min(600, Math.max(24, px)));
      }
    });
  }

  // ---------- sheets ----------

  private checkName(name: string, except?: Sheet): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50)
      throw new SpreadsheetError("Sheet names need 1 to 50 characters.");
    if (/[\\/?*[\]:]/.test(trimmed))
      throw new SpreadsheetError("Sheet names can't contain \\ / ? * [ ] or :.");
    if (trimmed.startsWith("'") || trimmed.endsWith("'"))
      throw new SpreadsheetError("Sheet names can't start or end with an apostrophe.");
    const clash = this.sheetByName(trimmed);
    if (clash && clash !== except)
      throw new SpreadsheetError(`A sheet named "${clash.name}" already exists.`);
    return trimmed;
  }

  addSheet(name?: string, index = this.sheets.length): Sheet {
    return this.edit("Add sheet", () => {
      let n = this.sheets.length + 1;
      while (!name && this.sheetByName(`Sheet${n}`)) n++;
      const sheet = this.blankSheet(name ? this.checkName(name) : `Sheet${n}`);
      this.sheets.splice(Math.max(0, Math.min(index, this.sheets.length)), 0, sheet);
      this.touch(sheet);
      return sheet;
    });
  }

  renameSheet(sheet: Sheet, name: string): void {
    const next = this.checkName(name, sheet);
    if (next === sheet.name) return;
    this.edit("Rename sheet", () => {
      const previous = sheet.name;
      sheet.name = next;
      this.touch(sheet);
      this.rewriteAll(() => renameSheetRefs(previous, next));
    });
  }

  moveSheet(sheet: Sheet, index: number): void {
    const from = this.sheets.indexOf(sheet);
    const to = Math.max(0, Math.min(index, this.sheets.length - 1));
    if (from === to) return;
    this.edit("Move sheet", () => {
      this.sheets.splice(from, 1);
      this.sheets.splice(to, 0, sheet);
      this.touch(sheet);
    });
  }

  deleteSheet(sheet: Sheet): void {
    if (this.sheets.length === 1)
      throw new SpreadsheetError("A workbook needs at least one sheet.");
    this.edit("Delete sheet", () => {
      const index = this.sheets.indexOf(sheet);
      this.sheets.splice(index, 1);
      this.touch(sheet);
      this.rewriteAll(() => dropSheetRefs(sheet.name));
      if (this.activeId === sheet.id) this.activeId = this.sheets[Math.max(0, index - 1)].id;
    });
  }

  /** Shows a sheet. Not an undo step, except inside an edit (like adding a sheet) that undo reverts. */
  activate(sheet: Sheet): void {
    if (this.activeId === sheet.id) return;
    this.activeId = sheet.id;
    if (!this.tx) this.emit({ type: "activate", label: "Show sheet", source: "user" });
  }

  setFrozen(sheet: Sheet, rows: number, cols: number): void {
    if (rows < 0 || cols < 0 || rows >= sheet.rows || cols >= sheet.cols)
      throw new SpreadsheetError(
        "Frozen rows and columns must leave part of the sheet free to scroll.",
      );
    this.edit("Freeze", () => {
      sheet.frozenRows = rows;
      sheet.frozenCols = cols;
      this.touch(sheet);
    });
  }

  /** Replaces every sheet with empty ones (for loading a template). */
  resetSheets(names: string[]): Sheet[] {
    return this.edit("New workbook", () => {
      this.sheets = names.map((name) => this.blankSheet(name));
      this.activeId = this.sheets[0].id;
      for (const sheet of this.sheets) this.touch(sheet);
      return this.sheets;
    });
  }

  // ---------- conditional formats & charts ----------

  addRule(sheet: Sheet, rule: Omit<ConditionalRule, "id">): ConditionalRule {
    if (
      VALUE_CONDITIONS.includes(rule.condition) &&
      (rule.value === undefined || rule.value === "")
    )
      throw new SpreadsheetError(`The ${rule.condition} condition needs a value to compare with.`);
    if (rule.condition === "between") {
      if (
        typeof rule.value !== "number" ||
        typeof rule.value2 !== "number" ||
        Number.isNaN(rule.value2)
      )
        throw new SpreadsheetError("The between condition needs two numbers: value and value2.");
      if (rule.value > rule.value2)
        throw new SpreadsheetError(
          "For between, value is the lower bound and value2 the upper bound.",
        );
    }
    if (rule.condition === "formula") {
      const node = rule.formula?.startsWith("=") ? this.ast(rule.formula) : null;
      if (!node || node instanceof FormulaSyntaxError)
        throw new SpreadsheetError(
          `The rule formula can't be read${node ? `: ${node.message}` : '; it must start with "=".'}`,
        );
    }
    return this.edit("Add conditional format", () => {
      const added = { ...rule, id: `rule${this.ids.rule++}` };
      sheet.rules = [...sheet.rules, added];
      this.touch(sheet, rule.range);
      return added;
    });
  }

  /** Removes the rules `test` accepts; returns their ids. */
  deleteRules(sheet: Sheet, test: (rule: ConditionalRule) => boolean): string[] {
    const removed = sheet.rules.filter(test).map((rule) => rule.id);
    if (removed.length)
      this.edit("Remove conditional format", () => {
        sheet.rules = sheet.rules.filter((rule) => !test(rule));
        this.touch(sheet);
      });
    return removed;
  }

  addChart(sheet: Sheet, chart: Omit<Chart, "id">): Chart {
    return this.edit("Add chart", () => {
      const added = { ...chart, id: `chart${this.ids.chart++}` };
      sheet.charts = [...sheet.charts, added];
      this.touch(sheet, chart.range);
      return added;
    });
  }

  findChart(id: string): { sheet: Sheet; chart: Chart } | undefined {
    for (const sheet of this.sheets) {
      const chart = sheet.charts.find((c) => c.id === id);
      if (chart) return { sheet, chart };
    }
    return undefined;
  }

  updateChart(sheet: Sheet, id: string, patch: Partial<Omit<Chart, "id">>): Chart {
    return this.edit("Edit chart", () => {
      let updated: Chart | undefined;
      sheet.charts = sheet.charts.map((chart) =>
        chart.id === id ? (updated = { ...chart, ...patch }) : chart,
      );
      if (!updated) throw new SpreadsheetError(`There is no chart "${id}" on ${sheet.name}.`);
      this.touch(sheet, updated.range);
      return updated;
    });
  }

  deleteChart(sheet: Sheet, id: string): void {
    this.edit("Delete chart", () => {
      sheet.charts = sheet.charts.filter((chart) => chart.id !== id);
      this.touch(sheet);
    });
  }
}
