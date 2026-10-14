/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Rewrites the references inside formula text, keeping everything else as typed. Used when
 * cells are copied or filled, rows and columns are inserted or deleted, cells are moved, and
 * sheets are renamed or deleted.
 */
import {
  contains,
  formatRef,
  MAX_COLS,
  MAX_ROWS,
  refRange,
  type Range,
  type Ref,
  type RefEnd,
} from "./address.ts";
import { tokenize } from "./tokenizer.ts";

/** Returns the new reference, the same object when unchanged, or null for #REF!. */
export type RefMapper = (ref: Ref) => Ref | null;

/** `formula` starts with "=". */
export function rewriteFormula(formula: string, map: RefMapper): string {
  let changed = false;
  const body = tokenize(formula.slice(1))
    .map((token) => {
      if (token.type !== "ref") return token.text;
      const next = map(token.ref);
      if (next === token.ref) return token.text;
      changed = true;
      return next ? formatRef(next) : "#REF!";
    })
    .join("");
  return changed ? "=" + body : formula;
}

const sameSheet = (name: string | null, own: string, target: string): boolean =>
  (name ?? own).toLowerCase() === target.toLowerCase();

function mapEnds(ref: Ref, fn: (end: RefEnd) => RefEnd | null): Ref | null {
  const a = fn(ref.a);
  const b = ref.b && fn(ref.b);
  if (!a || (ref.b && !b)) return null;
  return a === ref.a && b === ref.b ? ref : { ...ref, a, b };
}

/** Copy, fill and sort: relative parts move by (dr, dc); references pushed off the sheet become #REF!. */
export function shiftRelative(dr: number, dc: number): RefMapper {
  return (ref) =>
    mapEnds(ref, (end) => {
      const row = end.row === null || end.absRow ? end.row : end.row + dr;
      const col = end.col === null || end.absCol ? end.col : end.col + dc;
      if (row !== null && (row < 0 || row >= MAX_ROWS)) return null;
      if (col !== null && (col < 0 || col >= MAX_COLS)) return null;
      return row === end.row && col === end.col ? end : { ...end, row, col };
    });
}

/**
 * Rows or columns inserted (count > 0) or deleted (count < 0) at `index` on sheet `target`.
 * `own` is the sheet of the formula being rewritten, which unqualified references point to.
 */
export function shiftStructure(
  own: string,
  target: string,
  axis: "row" | "col",
  index: number,
  count: number,
): RefMapper {
  return (ref) => {
    if (!sameSheet(ref.sheet, own, target) || ref.a[axis] === null) return ref;
    const set = (end: RefEnd, at: number): RefEnd =>
      end[axis] === at ? end : { ...end, [axis]: at };
    if (count > 0) {
      const grow = (end: RefEnd) => (end[axis]! >= index ? set(end, end[axis]! + count) : end);
      return mapEnds(ref, grow);
    }
    const end = index - count; // deleted: [index, end)
    if (!ref.b) {
      const at = ref.a[axis]!;
      if (at >= index && at < end) return null;
      return at >= end ? { ...ref, a: set(ref.a, at + count) } : ref;
    }
    // A range shrinks around the deleted span and disappears only when all of it is deleted.
    const [lo, hi] = [Math.min(ref.a[axis]!, ref.b[axis]!), Math.max(ref.a[axis]!, ref.b[axis]!)];
    const newLo = lo < index ? lo : lo < end ? index : lo + count;
    const newHi = hi < index ? hi : hi < end ? index - 1 : hi + count;
    if (newHi < newLo) return null;
    const [a, b] = ref.a[axis]! <= ref.b[axis]! ? [newLo, newHi] : [newHi, newLo];
    return mapEnds(ref, (e) => set(e, e === ref.a ? a : b));
  };
}

export const renameSheetRefs =
  (from: string, to: string): RefMapper =>
  (ref) =>
    ref.sheet !== null && ref.sheet.toLowerCase() === from.toLowerCase()
      ? { ...ref, sheet: to }
      : ref;

export const dropSheetRefs =
  (name: string): RefMapper =>
  (ref) =>
    ref.sheet !== null && ref.sheet.toLowerCase() === name.toLowerCase() ? null : ref;

/**
 * Cut and paste: references that lie wholly inside `src` on sheet `from` follow the cells,
 * shifted by (dr, dc) and qualified with `to` when the cells moved to another sheet.
 */
export function moveRefs(
  own: string,
  from: string,
  src: Range,
  to: string,
  dr: number,
  dc: number,
): RefMapper {
  return (ref) => {
    if (!sameSheet(ref.sheet, own, from) || ref.a.row === null || ref.a.col === null) return ref;
    if (!contains(src, refRange(ref, MAX_ROWS, MAX_COLS))) return ref;
    const moved = mapEnds(ref, (end) => ({ ...end, row: end.row! + dr, col: end.col! + dc }));
    if (!moved) return null;
    const crossSheet = to.toLowerCase() !== own.toLowerCase();
    return { ...moved, sheet: crossSheet ? to : ref.sheet };
  };
}

/**
 * Tidies a typed formula: upper-case function names and references, and close parentheses
 * left open ("=sum(a1:a3" becomes "=SUM(A1:A3)").
 */
export function normalizeFormula(formula: string): string {
  let open = 0;
  const body = tokenize(formula.slice(1))
    .map((token) => {
      if (token.type === "lparen") open++;
      if (token.type === "rparen") open = Math.max(0, open - 1);
      if (token.type === "func") return token.text.toUpperCase();
      if (token.type === "ref") return formatRef(token.ref);
      if (token.type === "bool" || token.type === "err") return token.text.toUpperCase();
      return token.text;
    })
    .join("");
  return "=" + body + ")".repeat(open);
}
