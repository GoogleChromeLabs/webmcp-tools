/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** A1 notation: column letters, cell and range names, references, and sheet-name quoting. */

export const MAX_ROWS = 1000;
export const MAX_COLS = 52;
/** Cells are stored under `row * KEY_STRIDE + col`, so ascending keys are in row-major order. */
const KEY_STRIDE = 1024;

/** An inclusive rectangle of 0-based rows and columns, with r1 <= r2 and c1 <= c2. */
export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export const cellKey = (row: number, col: number): number => row * KEY_STRIDE + col;
export const keyRow = (key: number): number => Math.floor(key / KEY_STRIDE);
export const keyCol = (key: number): number => key % KEY_STRIDE;

export function columnName(col: number): string {
  let name = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

export const cellName = (row: number, col: number): string => columnName(col) + (row + 1);

export function rangeName({ r1, c1, r2, c2 }: Range): string {
  const start = cellName(r1, c1);
  return r1 === r2 && c1 === c2 ? start : `${start}:${cellName(r2, c2)}`;
}

export const normalize = (r1: number, c1: number, r2: number, c2: number): Range => ({
  r1: Math.min(r1, r2),
  c1: Math.min(c1, c2),
  r2: Math.max(r1, r2),
  c2: Math.max(c1, c2),
});
export const rangeRows = (r: Range): number => r.r2 - r.r1 + 1;
export const rangeCols = (r: Range): number => r.c2 - r.c1 + 1;
export const inRange = (r: Range, row: number, col: number): boolean =>
  row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
export const intersects = (a: Range, b: Range): boolean =>
  a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
export const contains = (outer: Range, inner: Range): boolean =>
  inner.r1 >= outer.r1 && inner.r2 <= outer.r2 && inner.c1 >= outer.c1 && inner.c2 <= outer.c2;

/** One end of a reference. `row` is null in whole-column refs (A:C), `col` in whole-row refs (2:5). */
export interface RefEnd {
  row: number | null;
  col: number | null;
  absRow: boolean;
  absCol: boolean;
}

/** A parsed reference such as `B2`, `$A$1:C9`, `A:A`, `3:5` or `'Q1 Sales'!B2:D9`. */
export interface Ref {
  sheet: string | null;
  a: RefEnd;
  b: RefEnd | null;
}

const SHEET = String.raw`'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*`;
const CELL = String.raw`\$?[A-Za-z]{1,3}\$?[0-9]+`;
const COL = String.raw`\$?[A-Za-z]{1,3}`;
const ROW = String.raw`\$?[0-9]+`;
const REF = `(?:(${SHEET})!)?(?:(${CELL})(?::(${CELL}))?|(${COL}):(${COL})|(${ROW}):(${ROW}))`;

/** Sticky matcher the formula tokenizer runs at a given position. */
export const REF_AT = new RegExp(REF, "y");
const REF_EXACT = new RegExp(`^${REF}$`);
const END = /^(\$?)([A-Za-z]*)(\$?)([0-9]*)$/;

function parseEnd(text: string): RefEnd {
  const [, d1, letters, d2, digits] = END.exec(text) ?? [];
  if (!letters) return { row: Number(digits) - 1, col: null, absRow: !!(d1 || d2), absCol: false };
  return {
    row: digits ? Number(digits) - 1 : null,
    col: columnIndex(letters),
    absRow: d2 === "$",
    absCol: d1 === "$",
  };
}

const endValid = (end: RefEnd): boolean =>
  (end.row === null || end.row >= 0) && (end.col === null || end.col >= 0);

export const unquoteSheet = (text: string): string =>
  text.startsWith("'") ? text.slice(1, -1).replaceAll("''", "'") : text;

/** Turns a REF_AT/REF_EXACT match into a reference, or null for rows like `A0`. */
export function refFromMatch(match: RegExpExecArray): Ref | null {
  const [a, b] = match[2]
    ? [match[2], match[3]]
    : match[4]
      ? [match[4], match[5]]
      : [match[6], match[7]];
  const ref: Ref = {
    sheet: match[1] ? unquoteSheet(match[1]) : null,
    a: parseEnd(a),
    b: b ? parseEnd(b) : null,
  };
  return endValid(ref.a) && (!ref.b || endValid(ref.b)) ? ref : null;
}

/** Parses a whole string such as `"Sales!B2:D9"`; returns null when it is not a reference. */
export function parseRef(text: string): Ref | null {
  const match = REF_EXACT.exec(text.trim());
  return match ? refFromMatch(match) : null;
}

/** Quotes a sheet name when a formula could not read it bare (spaces, or a name like `Q1`). */
export function quoteSheet(name: string): string {
  const bare =
    /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) &&
    !/^[A-Za-z]{1,3}[0-9]+$/.test(name) &&
    !/^(true|false)$/i.test(name);
  return bare ? name : `'${name.replaceAll("'", "''")}'`;
}

const formatEnd = (end: RefEnd): string =>
  (end.col === null ? "" : (end.absCol ? "$" : "") + columnName(end.col)) +
  (end.row === null ? "" : (end.absRow ? "$" : "") + (end.row + 1));

export const formatRef = (ref: Ref): string =>
  (ref.sheet === null ? "" : quoteSheet(ref.sheet) + "!") +
  formatEnd(ref.a) +
  (ref.b ? ":" + formatEnd(ref.b) : "");

/** The rectangle a reference covers; whole rows and columns stop at the sheet's size. */
export function refRange(ref: Ref, rows: number, cols: number): Range {
  const b = ref.b ?? ref.a;
  return normalize(ref.a.row ?? 0, ref.a.col ?? 0, b.row ?? rows - 1, b.col ?? cols - 1);
}

/** `Sheet1!A1:B2` for people and agents; the sheet name is quoted when needed. */
export const qualifiedName = (sheet: string, range: Range): string =>
  `${quoteSheet(sheet)}!${rangeName(range)}`;
