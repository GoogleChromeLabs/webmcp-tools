/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Cell values, formula errors, and the coercion rules formulas use. */
import { parseInput } from "./input.ts";

export type ErrorCode = "#DIV/0!" | "#VALUE!" | "#REF!" | "#NAME?" | "#N/A" | "#NUM!" | "#ERROR!";
export const ERROR_CODES: readonly ErrorCode[] = [
  "#DIV/0!",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#N/A",
  "#NUM!",
  "#ERROR!",
];

/** An error value. It flows through formulas like any value and carries a readable reason. */
export class FormulaError {
  readonly code: ErrorCode;
  readonly message: string;
  constructor(code: ErrorCode, message: string) {
    this.code = code;
    this.message = message;
  }
}

/** `null` is an empty cell. */
export type Scalar = number | string | boolean | null;
export type Value = Scalar | FormulaError;
/** The values of a range, row by row. */
export type Matrix = Value[][];
export type Result = Value | Matrix;

export const isError = (value: unknown): value is FormulaError => value instanceof FormulaError;
export const isMatrix = (result: Result): result is Matrix => Array.isArray(result);

export const errors = {
  div0: () => new FormulaError("#DIV/0!", "Division by zero."),
  num: (message = "The result is not a valid number.") => new FormulaError("#NUM!", message),
  value: (message: string) => new FormulaError("#VALUE!", message),
  na: (message: string) => new FormulaError("#N/A", message),
  ref: (message: string) => new FormulaError("#REF!", message),
};

const LITERAL_ERROR_MESSAGES: Record<ErrorCode, string> = {
  "#DIV/0!": "Division by zero.",
  "#VALUE!": "A value has the wrong type.",
  "#REF!": "The formula refers to cells that were deleted.",
  "#NAME?": "Unknown name.",
  "#N/A": "Value not available.",
  "#NUM!": "The result is not a valid number.",
  "#ERROR!": "The formula could not be read.",
};
export const literalError = (code: ErrorCode): FormulaError =>
  new FormulaError(code, LITERAL_ERROR_MESSAGES[code]);

/** A range where one value is expected: a 1x1 range is that value, anything larger is an error. */
export function toScalar(result: Result): Value {
  if (!isMatrix(result)) return result;
  if (result.length === 1 && result[0].length === 1) return result[0][0];
  return errors.value(
    "A range was used where one value is expected. Wrap it in a function like SUM().",
  );
}

/** Blank is 0, TRUE is 1, and text that reads as a number (or date, or percentage) counts. */
export function toNumber(value: Value): number | FormulaError {
  if (value === null) return 0;
  if (typeof value === "number" || isError(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value.trim() === "") return 0;
  const parsed = parseInput(value);
  return typeof parsed.value === "number"
    ? parsed.value
    : errors.value(`"${value}" is text, not a number.`);
}

/** Up to 15 significant digits, so 0.1 + 0.2 reads as 0.3. */
export function numberToText(n: number): string {
  return String(Number(n.toPrecision(15))).replace("e", "E");
}

export function toText(value: Value): string | FormulaError {
  if (value === null) return "";
  if (isError(value)) return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return typeof value === "number" ? numberToText(value) : value;
}

export function toBoolean(value: Value): boolean | FormulaError {
  if (value === null) return false;
  if (typeof value === "boolean" || isError(value)) return value;
  if (typeof value === "number") return value !== 0;
  const upper = value.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE" || upper === "") return false;
  return errors.value(`"${value}" is text, not TRUE or FALSE.`);
}

const rank = (value: Exclude<Scalar, null>): number =>
  typeof value === "number" ? 0 : typeof value === "string" ? 1 : 2;

/**
 * Comparison order used by formulas and sorting: numbers < text < booleans, text without
 * regard to case. A blank compares as the empty value of the other side's type.
 */
export function compareScalars(a: Scalar, b: Scalar): number {
  const left = a ?? (typeof b === "string" ? "" : typeof b === "boolean" ? false : 0);
  const right = b ?? (typeof left === "string" ? "" : typeof left === "boolean" ? false : 0);
  if (rank(left) !== rank(right)) return rank(left) - rank(right);
  if (typeof left === "string")
    return left.localeCompare(right as string, undefined, { sensitivity: "accent" });
  return Number(left) - Number(right);
}
