/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** What a formula can see while it is computed: its cell, other cells, and its arguments. */
import { MAX_COLS, MAX_ROWS, refRange, type Range, type Ref, type RefEnd } from "./address.ts";
import type { Node } from "./parser.ts";
import { errors, type FormulaError, type Result, type Value } from "./values.ts";

export interface EngineSheet {
  readonly name: string;
  readonly rows: number;
  readonly cols: number;
}

export interface Scope {
  readonly sheet: EngineSheet;
  readonly row: number;
  readonly col: number;
  /** Shift for relative references (conditional formats are written for their top-left cell). */
  readonly dr: number;
  readonly dc: number;
  findSheet(name: string): EngineSheet | undefined;
  value(sheet: EngineSheet, row: number, col: number): Value;
}

/** A function argument, computed only if the function asks for it, so IF skips the other branch. */
export interface Arg {
  readonly node: Node;
  get(): Result;
}

function shift(end: RefEnd, scope: Scope): RefEnd {
  if (!scope.dr && !scope.dc) return end;
  return {
    ...end,
    row: end.row === null || end.absRow ? end.row : end.row + scope.dr,
    col: end.col === null || end.absCol ? end.col : end.col + scope.dc,
  };
}

/** The sheet and rectangle a reference points to, or a #REF! error. */
export function locate(
  ref: Ref,
  scope: Scope,
): { sheet: EngineSheet; range: Range } | FormulaError {
  const sheet = ref.sheet === null ? scope.sheet : scope.findSheet(ref.sheet);
  if (!sheet) return errors.ref(`There is no sheet named "${ref.sheet}".`);
  const shifted = { ...ref, a: shift(ref.a, scope), b: ref.b && shift(ref.b, scope) };
  const range = refRange(shifted, sheet.rows, sheet.cols);
  if (range.r1 < 0 || range.c1 < 0 || range.r2 >= MAX_ROWS || range.c2 >= MAX_COLS)
    return errors.ref("The reference is outside the sheet.");
  return { sheet, range };
}
