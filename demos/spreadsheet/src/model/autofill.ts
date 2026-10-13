/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Autofill: continues the pattern of a source row or column, like dragging the fill handle. */
import { MONTHS, WEEKDAYS } from "../engine/dates.ts";
import type { Cell } from "./workbook.ts";

const mod = (n: number, m: number): number => ((n % m) + m) % m;

const NAME_LISTS = [
  MONTHS,
  MONTHS.map((m) => m.slice(0, 3)),
  WEEKDAYS,
  WEEKDAYS.map((d) => d.slice(0, 3)),
];

type Pattern = (offset: number) => Cell | undefined;

/** A step from the first to the last source value (1 when there is only one). */
const stepOf = (values: number[]): number =>
  values.length > 1 ? (values[values.length - 1] - values[0]) / (values.length - 1) : 1;

function numberPattern(source: Cell[]): Pattern | null {
  const values = source.map((cell) => cell.v);
  if (!values.every((v) => typeof v === "number")) return null;
  const numbers = values as number[];
  const isDate = source[0].fmt?.numFmt === "date" || source[0].fmt?.numFmt === "datetime";
  // One plain number is copied; one date counts up by a day.
  if (numbers.length === 1 && !isDate) return null;
  const step = stepOf(numbers);
  return (offset) => ({
    ...source[mod(offset, source.length)],
    v: Number((numbers[0] + step * offset).toPrecision(15)),
  });
}

function suffixPattern(source: Cell[]): Pattern | null {
  const parts = source.map((cell) =>
    typeof cell.v === "string" ? /^(.*?)(\d+)$/.exec(cell.v) : null,
  );
  if (parts.some((m) => !m || m[1] !== parts[0]![1])) return null;
  const numbers = parts.map((m) => Number(m![2]));
  const width = parts[0]![2].length;
  const step = stepOf(numbers);
  return (offset) => {
    const n = Math.max(0, Math.round(numbers[0] + step * offset));
    return {
      ...source[mod(offset, source.length)],
      v: parts[0]![1] + String(n).padStart(width, "0"),
    };
  };
}

function namePattern(source: Cell[]): Pattern | null {
  for (const list of NAME_LISTS) {
    const lower = list.map((name) => name.toLowerCase());
    const indexes = source.map((cell) =>
      typeof cell.v === "string" ? lower.indexOf(cell.v.toLowerCase()) : -1,
    );
    if (indexes.some((i) => i < 0)) continue;
    const step = indexes.length > 1 ? mod(indexes[1] - indexes[0], list.length) || 1 : 1;
    const sample = source[0].v as string;
    const style = (name: string) =>
      sample === sample.toUpperCase()
        ? name.toUpperCase()
        : sample === sample.toLowerCase()
          ? name.toLowerCase()
          : name;
    return (offset) => ({
      ...source[mod(offset, source.length)],
      v: style(list[mod(indexes[0] + step * offset, list.length)]),
    });
  }
  return null;
}

/**
 * Cells for the given offsets from the first source cell (negative offsets fill up or left).
 * Numbers, dates, "Item 7"-style text and month or weekday names continue as a series;
 * formulas repeat with their relative references moved; anything else repeats.
 */
export function extendSeries(
  source: (Cell | undefined)[],
  offsets: number[],
  shiftFormula: (formula: string, by: number) => string,
): (Cell | undefined)[] {
  const filled = source.every((cell) => cell?.v !== undefined && !cell.f);
  const cells = source as Cell[];
  const pattern =
    (filled && (numberPattern(cells) ?? suffixPattern(cells) ?? namePattern(cells))) || null;
  return offsets.map((offset) => {
    if (pattern) return pattern(offset);
    const index = mod(offset, source.length);
    const cell = source[index];
    return cell?.f ? { ...cell, f: shiftFormula(cell.f, offset - index) } : cell;
  });
}
