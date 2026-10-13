/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** The formula functions. Helpers throw the first FormulaError they meet; the evaluator returns it. */
import { dateParts, dateSerial, nowSerial, todaySerial } from "./dates.ts";
import { formatPattern } from "./format.ts";
import { locate, type Arg, type Scope } from "./scope.ts";
import {
  compareScalars,
  errors,
  FormulaError,
  isError,
  isMatrix,
  toBoolean,
  toNumber,
  toScalar,
  toText,
  type Matrix,
  type Result,
  type Scalar,
  type Value,
} from "./values.ts";

export interface FunctionDef {
  readonly min: number;
  readonly max: number;
  /** Shown by formula autocomplete, e.g. "SUM(value1, [value2, …])". */
  readonly syntax: string;
  readonly description: string;
  call(args: Arg[], scope: Scope): Result;
}

export const FUNCTIONS: Record<string, FunctionDef> = {};

function define(
  syntax: string,
  description: string,
  min: number,
  max: number,
  call: FunctionDef["call"],
): void {
  FUNCTIONS[syntax.slice(0, syntax.indexOf("("))] = { syntax, description, min, max, call };
}

// ---------- argument helpers ----------

const fail = (error: FormulaError): never => {
  throw error;
};
const missing = () => errors.value("A required value is missing.");

/** The argument as one value; errors are returned, not thrown. */
const value = (arg: Arg): Value => toScalar(arg.get());

function num(arg: Arg | undefined, fallback?: number): number {
  if (!arg) return fallback ?? fail(missing());
  const n = toNumber(value(arg));
  return isError(n) ? fail(n) : n;
}
const int = (arg: Arg | undefined, fallback?: number): number => Math.trunc(num(arg, fallback));

function text(arg: Arg | undefined, fallback?: string): string {
  if (!arg) return fallback ?? fail(missing());
  const t = toText(value(arg));
  return isError(t) ? fail(t) : t;
}

function bool(arg: Arg | undefined, fallback?: boolean): boolean {
  if (!arg) return fallback ?? fail(missing());
  const b = toBoolean(value(arg));
  return isError(b) ? fail(b) : b;
}

function scalar(arg: Arg): Scalar {
  const v = value(arg);
  return isError(v) ? fail(v) : v;
}

function matrix(arg: Arg): Matrix {
  const result = arg.get();
  if (isMatrix(result)) return result;
  return isError(result) ? fail(result) : [[result]];
}

const flat = (result: Result): Value[] => (isMatrix(result) ? result.flat() : [result]);

/** SUM-style: in ranges and cell references only numbers count; direct values must read as numbers. */
function numbers(args: Arg[]): number[] {
  const out: number[] = [];
  for (const arg of args) {
    if (arg.node.kind === "blank") continue;
    const result = arg.get();
    if (isMatrix(result) || arg.node.kind === "ref") {
      for (const v of flat(result)) {
        if (isError(v)) throw v;
        if (typeof v === "number") out.push(v);
      }
    } else out.push(num(arg));
  }
  return out;
}

const total = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0);
const mean = (xs: number[]): number => (xs.length ? total(xs) / xs.length : fail(errors.div0()));
const extreme = (xs: number[], pick: (a: number, b: number) => number): number =>
  xs.length ? xs.reduce((a, b) => pick(a, b)) : 0;
const finite = (n: number): number => (Number.isFinite(n) ? n : fail(errors.num()));
/** Trims floating-point noise such as 0.30000000000000004. */
const clean = (n: number): number => Number(n.toPrecision(15));

function variance(xs: number[]): number {
  if (xs.length < 2) throw errors.div0();
  const m = mean(xs);
  return total(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
}

function round(x: number, places: number, mode: "half" | "up" | "down"): number {
  const p = Math.trunc(places);
  const factor = 10 ** Math.abs(p);
  const scaled = clean(p >= 0 ? Math.abs(x) * factor : Math.abs(x) / factor);
  const r =
    mode === "half" ? Math.round(scaled) : mode === "up" ? Math.ceil(scaled) : Math.floor(scaled);
  const out = p >= 0 ? r / factor : r * factor;
  return x < 0 ? -out : out;
}

// ---------- criteria (SUMIF, COUNTIFS, …) and lookups ----------

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "*" matches any text, "?" one character, "~" escapes; matching ignores case. */
function wildcard(pattern: string): RegExp {
  let src = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "~" && i + 1 < pattern.length) src += escapeRegExp(pattern[++i]);
    else src += ch === "*" ? "[\\s\\S]*" : ch === "?" ? "[\\s\\S]" : escapeRegExp(ch);
  }
  return new RegExp(`^${src}$`, "i");
}

const compareTest = (op: string, diff: number): boolean =>
  op === "<>"
    ? diff !== 0
    : op === "<"
      ? diff < 0
      : op === ">"
        ? diff > 0
        : op === "<="
          ? diff <= 0
          : op === ">="
            ? diff >= 0
            : diff === 0;

/** A criterion such as 10, ">=100", "<>Paid", "App*" or ">=2026-01-01". */
function criterion(c: Value): (v: Value) => boolean {
  if (isError(c)) throw c;
  if (typeof c === "number") return (v) => typeof v === "number" && v === c;
  if (typeof c === "boolean") return (v) => v === c;
  if (c === null) return (v) => v === null || v === "";
  const [, op = "=", operand] = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(c) ?? [];
  const asNumber = operand.trim() === "" ? null : toNumber(operand);
  if (typeof asNumber === "number")
    return (v) => (typeof v === "number" ? compareTest(op, v - asNumber) : op === "<>");
  if (op === "=" || op === "<>") {
    const pattern = operand === "" ? null : wildcard(operand);
    return (v) =>
      (op === "=") ===
      (pattern ? typeof v === "string" && pattern.test(v) : v === null || v === "");
  }
  return (v) => typeof v === "string" && compareTest(op, compareScalars(v, operand));
}

/** Pairs of (range, criterion) arguments; returns which cells of the first range pass all of them. */
function passing(args: Arg[], shape?: Matrix): boolean[] {
  if (args.length % 2)
    throw errors.value("Criteria must come in pairs: a range, then a criterion.");
  let passes: boolean[] | null = null;
  for (let i = 0; i < args.length; i += 2) {
    const range = matrix(args[i]);
    if (shape && (range.length !== shape.length || range[0].length !== shape[0].length))
      throw errors.value("All ranges must have the same size.");
    shape ??= range;
    const test = criterion(value(args[i + 1]));
    const cells = range.flat();
    passes = cells.map((v, k) => (passes ? passes[k] : true) && test(v));
  }
  return passes ?? [];
}

function conditional(args: Arg[], target: Arg | null): number[] {
  const values = target ? matrix(target) : undefined;
  const passes = passing(args, values);
  const cells = (values ?? matrix(args[0])).flat();
  const out: number[] = [];
  passes.forEach((pass, k) => {
    const v = cells[k];
    if (!pass) return;
    if (isError(v)) throw v;
    if (typeof v === "number") out.push(v);
  });
  return out;
}

/** Lookup equality: numbers by value, text ignoring case, optional wildcards. */
function matches(cell: Value, key: Scalar, wild: boolean): boolean {
  if (typeof key === "string" && typeof cell === "string")
    return wild ? wildcard(key).test(cell) : cell.toLowerCase() === key.toLowerCase();
  return cell === key || (key === null && cell === "");
}

const sameKind = (a: Value, b: Scalar): boolean =>
  !isError(a) && a !== null && b !== null && typeof a === typeof b;

/** Index of key in a list. mode 0 = exact, -1 = exact or next smaller, 1 = exact or next larger. */
function find(list: Value[], key: Scalar, mode: number, wild: boolean, reverse = false): number {
  const order = list.map((_, i) => i);
  if (reverse) order.reverse();
  for (const i of order) if (matches(list[i], key, wild && mode === 0)) return i;
  if (mode === 0) return -1;
  // Nearest on the requested side: the largest value below key (-1) or the smallest above it (1).
  let best = -1;
  for (const i of order) {
    const v = list[i] as Scalar;
    if (!sameKind(v, key) || Math.sign(compareScalars(v, key)) !== Math.sign(mode)) continue;
    if (best < 0 || Math.sign(compareScalars(v, list[best] as Scalar)) === -Math.sign(mode))
      best = i;
  }
  return best;
}

const notFound = (fn: string, key: Scalar) =>
  errors.na(`${fn} did not find ${typeof key === "string" ? `"${key}"` : String(key)}.`);

function line(m: Matrix): { values: Value[]; vertical: boolean } {
  if (m[0].length === 1) return { values: m.map((row) => row[0]), vertical: true };
  if (m.length === 1) return { values: m[0], vertical: false };
  throw errors.value("Expected a single row or column.");
}

function pick(m: Matrix, row: number, col: number): Result {
  const rows = row === 0 ? m : [m[row - 1]];
  const out = rows.map((r) => (col === 0 ? r : [r[col - 1]]));
  return out.length === 1 && out[0].length === 1 ? out[0][0] : out;
}

// ---------- math & statistics ----------

define("SUM(value1, [value2, …])", "Adds numbers.", 1, Infinity, (a) => clean(total(numbers(a))));
define("AVERAGE(value1, [value2, …])", "Mean of the numbers.", 1, Infinity, (a) =>
  mean(numbers(a)),
);
define("MIN(value1, [value2, …])", "Smallest number.", 1, Infinity, (a) =>
  extreme(numbers(a), Math.min),
);
define("MAX(value1, [value2, …])", "Largest number.", 1, Infinity, (a) =>
  extreme(numbers(a), Math.max),
);
define("COUNT(value1, [value2, …])", "Counts numbers.", 1, Infinity, (args) =>
  args.reduce((count, arg) => {
    if (arg.node.kind === "blank") return count;
    const result = arg.get();
    if (isMatrix(result) || arg.node.kind === "ref")
      return count + flat(result).filter((v) => typeof v === "number").length;
    return count + (typeof toNumber(toScalar(result)) === "number" ? 1 : 0);
  }, 0),
);
define("COUNTA(value1, [value2, …])", "Counts values that are not empty.", 1, Infinity, (args) =>
  args.reduce(
    (count, arg) =>
      count + (arg.node.kind === "blank" ? 0 : flat(arg.get()).filter((v) => v !== null).length),
    0,
  ),
);
define(
  "COUNTBLANK(range)",
  "Counts empty cells.",
  1,
  1,
  ([range]) => flat(range.get()).filter((v) => v === null || v === "").length,
);
define("PRODUCT(value1, [value2, …])", "Multiplies numbers.", 1, Infinity, (a) =>
  finite(numbers(a).reduce((p, x) => p * x, 1)),
);
define("MEDIAN(value1, [value2, …])", "Middle number.", 1, Infinity, (args) => {
  const xs = numbers(args).sort((x, y) => x - y);
  if (!xs.length) throw errors.num("MEDIAN needs at least one number.");
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
});
define("STDEV(value1, [value2, …])", "Sample standard deviation.", 1, Infinity, (a) =>
  Math.sqrt(variance(numbers(a))),
);
define("VAR(value1, [value2, …])", "Sample variance.", 1, Infinity, (a) => variance(numbers(a)));
define("LARGE(range, n)", "The nth largest number.", 2, 2, ([range, n]) => {
  const xs = numbers([range]).sort((x, y) => y - x);
  const k = int(n);
  return k >= 1 && k <= xs.length
    ? xs[k - 1]
    : fail(errors.num(`LARGE needs n between 1 and ${xs.length}.`));
});
define("SMALL(range, n)", "The nth smallest number.", 2, 2, ([range, n]) => {
  const xs = numbers([range]).sort((x, y) => x - y);
  const k = int(n);
  return k >= 1 && k <= xs.length
    ? xs[k - 1]
    : fail(errors.num(`SMALL needs n between 1 and ${xs.length}.`));
});
define(
  "SUMPRODUCT(range1, [range2, …])",
  "Sum of the products of matching cells.",
  1,
  Infinity,
  (args) => {
    const ranges = args.map(matrix);
    const [rows, cols] = [ranges[0].length, ranges[0][0].length];
    if (ranges.some((m) => m.length !== rows || m[0].length !== cols))
      throw errors.value("All ranges must have the same size.");
    let sum = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        sum += ranges.reduce((p, m) => {
          const v = m[r][c];
          if (isError(v)) throw v;
          return p * (typeof v === "number" ? v : 0);
        }, 1);
    return clean(sum);
  },
);
define("ROUND(value, [places])", "Rounds half away from zero.", 1, 2, ([x, p]) =>
  round(num(x), num(p, 0), "half"),
);
define("ROUNDUP(value, [places])", "Rounds away from zero.", 1, 2, ([x, p]) =>
  round(num(x), num(p, 0), "up"),
);
define("ROUNDDOWN(value, [places])", "Rounds toward zero.", 1, 2, ([x, p]) =>
  round(num(x), num(p, 0), "down"),
);
define("INT(value)", "Rounds down to an integer.", 1, 1, ([x]) => Math.floor(num(x)));
define("TRUNC(value, [places])", "Cuts off decimals.", 1, 2, ([x, p]) =>
  round(num(x), num(p, 0), "down"),
);
define("ABS(value)", "Absolute value.", 1, 1, ([x]) => Math.abs(num(x)));
define("SQRT(value)", "Square root.", 1, 1, ([x]) => {
  const n = num(x);
  return n < 0 ? fail(errors.num("SQRT of a negative number.")) : Math.sqrt(n);
});
define("POWER(base, exponent)", "Raises a number to a power.", 2, 2, ([b, e]) =>
  finite(num(b) ** num(e)),
);
define("MOD(dividend, divisor)", "Remainder with the divisor's sign.", 2, 2, ([a, b]) => {
  const [x, y] = [num(a), num(b)];
  return y === 0 ? fail(errors.div0()) : clean(x - y * Math.floor(x / y));
});
define("EXP(value)", "e raised to a power.", 1, 1, ([x]) => finite(Math.exp(num(x))));
define("LN(value)", "Natural logarithm.", 1, 1, ([x]) => {
  const n = num(x);
  return n <= 0 ? fail(errors.num("LN needs a positive number.")) : Math.log(n);
});
define("LOG10(value)", "Base-10 logarithm.", 1, 1, ([x]) => {
  const n = num(x);
  return n <= 0 ? fail(errors.num("LOG10 needs a positive number.")) : Math.log10(n);
});
define("LOG(value, [base])", "Logarithm, base 10 by default.", 1, 2, ([x, b]) => {
  const [n, base] = [num(x), num(b, 10)];
  if (n <= 0 || base <= 0 || base === 1)
    throw errors.num("LOG needs positive numbers and a base other than 1.");
  return Math.log(n) / Math.log(base);
});
define("PI()", "The number π.", 0, 0, () => Math.PI);
define("CEILING(value, [factor])", "Rounds up to a multiple of factor.", 1, 2, ([x, f]) => {
  const factor = num(f, 1);
  return factor === 0 ? 0 : clean(Math.ceil(num(x) / factor) * factor);
});
define("FLOOR(value, [factor])", "Rounds down to a multiple of factor.", 1, 2, ([x, f]) => {
  const factor = num(f, 1);
  return factor === 0 ? 0 : clean(Math.floor(num(x) / factor) * factor);
});

// ---------- conditional aggregates ----------

define(
  "SUMIF(range, criterion, [sum_range])",
  "Adds cells that meet a criterion.",
  2,
  3,
  ([range, c, target]) => clean(total(conditional([range, c], target ?? null))),
);
define(
  "SUMIFS(sum_range, criteria_range1, criterion1, …)",
  "Adds cells that meet all criteria.",
  3,
  Infinity,
  ([target, ...pairs]) => clean(total(conditional(pairs, target))),
);
define(
  "COUNTIF(range, criterion)",
  "Counts cells that meet a criterion.",
  2,
  2,
  (args) => passing(args).filter(Boolean).length,
);
define(
  "COUNTIFS(criteria_range1, criterion1, …)",
  "Counts cells that meet all criteria.",
  2,
  Infinity,
  (args) => passing(args).filter(Boolean).length,
);
define(
  "AVERAGEIF(range, criterion, [average_range])",
  "Mean of cells that meet a criterion.",
  2,
  3,
  ([range, c, target]) => mean(conditional([range, c], target ?? null)),
);
define(
  "AVERAGEIFS(average_range, criteria_range1, criterion1, …)",
  "Mean of cells that meet all criteria.",
  3,
  Infinity,
  ([target, ...pairs]) => mean(conditional(pairs, target)),
);
define(
  "MAXIFS(max_range, criteria_range1, criterion1, …)",
  "Largest number that meets all criteria.",
  3,
  Infinity,
  ([target, ...pairs]) => extreme(conditional(pairs, target), Math.max),
);
define(
  "MINIFS(min_range, criteria_range1, criterion1, …)",
  "Smallest number that meets all criteria.",
  3,
  Infinity,
  ([target, ...pairs]) => extreme(conditional(pairs, target), Math.min),
);

// ---------- logical ----------

define(
  "IF(condition, value_if_true, [value_if_false])",
  "Chooses a value by a condition.",
  2,
  3,
  ([c, yes, no]) => (bool(c) ? yes.get() : no ? no.get() : false),
);
define("IFS(condition1, value1, …)", "Value of the first true condition.", 2, Infinity, (args) => {
  if (args.length % 2) throw errors.value("IFS needs condition/value pairs.");
  for (let i = 0; i < args.length; i += 2) if (bool(args[i])) return args[i + 1].get();
  throw errors.na("No condition in IFS was true.");
});
const logicals = (args: Arg[]): boolean[] => {
  const out: boolean[] = [];
  for (const arg of args) {
    const result = arg.get();
    if (isMatrix(result) || arg.node.kind === "ref") {
      for (const v of flat(result)) {
        if (isError(v)) throw v;
        if (typeof v === "boolean" || typeof v === "number")
          out.push(v === true || (typeof v === "number" && v !== 0));
      }
    } else out.push(bool(arg));
  }
  if (!out.length) throw errors.value("No TRUE/FALSE values to check.");
  return out;
};
define("AND(logical1, [logical2, …])", "TRUE if all are true.", 1, Infinity, (a) =>
  logicals(a).every(Boolean),
);
define("OR(logical1, [logical2, …])", "TRUE if any is true.", 1, Infinity, (a) =>
  logicals(a).some(Boolean),
);
define(
  "XOR(logical1, [logical2, …])",
  "TRUE if an odd number are true.",
  1,
  Infinity,
  (a) => logicals(a).filter(Boolean).length % 2 === 1,
);
define("NOT(logical)", "Reverses TRUE and FALSE.", 1, 1, ([x]) => !bool(x));
define(
  "IFERROR(value, [value_if_error])",
  "A fallback when value is an error.",
  1,
  2,
  ([x, alt]) => {
    const v = value(x);
    return isError(v) ? (alt ? alt.get() : null) : v;
  },
);
define("IFNA(value, value_if_na)", "A fallback when value is #N/A.", 2, 2, ([x, alt]) => {
  const v = value(x);
  return isError(v) && v.code === "#N/A" ? alt.get() : v;
});
define(
  "SWITCH(expression, case1, value1, …, [default])",
  "Value of the first matching case.",
  3,
  Infinity,
  ([x, ...rest]) => {
    const target = scalar(x);
    for (let i = 0; i + 1 < rest.length; i += 2)
      if (compareScalars(target, scalar(rest[i])) === 0) return rest[i + 1].get();
    return rest.length % 2
      ? rest[rest.length - 1].get()
      : fail(errors.na("No case in SWITCH matched."));
  },
);
define("TRUE()", "The value TRUE.", 0, 0, () => true);
define("FALSE()", "The value FALSE.", 0, 0, () => false);

// ---------- lookup & reference ----------

define(
  "VLOOKUP(search_key, range, index, [is_sorted])",
  "Finds a row by its first column.",
  3,
  4,
  ([k, r, i, sorted]) => {
    const key = scalar(k);
    const m = matrix(r);
    const col = int(i);
    if (col < 1 || col > m[0].length)
      throw errors.ref(`VLOOKUP index ${col} is outside the range (1–${m[0].length}).`);
    const row = find(
      m.map((cells) => cells[0]),
      key,
      bool(sorted, true) ? -1 : 0,
      true,
    );
    return row < 0 ? fail(notFound("VLOOKUP", key)) : m[row][col - 1];
  },
);
define(
  "HLOOKUP(search_key, range, index, [is_sorted])",
  "Finds a column by its first row.",
  3,
  4,
  ([k, r, i, sorted]) => {
    const key = scalar(k);
    const m = matrix(r);
    const row = int(i);
    if (row < 1 || row > m.length)
      throw errors.ref(`HLOOKUP index ${row} is outside the range (1–${m.length}).`);
    const col = find(m[0], key, bool(sorted, true) ? -1 : 0, true);
    return col < 0 ? fail(notFound("HLOOKUP", key)) : m[row - 1][col];
  },
);
define(
  "XLOOKUP(search_key, lookup_range, result_range, [missing_value], [match_mode], [search_mode])",
  "Finds a key and returns the matching result.",
  3,
  6,
  ([k, l, r, miss, mode, search]) => {
    const key = scalar(k);
    const lookup = line(matrix(l));
    const results = matrix(r);
    const length = lookup.vertical ? results.length : results[0].length;
    if (length !== lookup.values.length)
      throw errors.value("lookup_range and result_range must have the same length.");
    const matchMode = int(mode, 0);
    const index = find(
      lookup.values,
      key,
      matchMode === 2 ? 0 : matchMode,
      matchMode === 2,
      int(search, 1) < 0,
    );
    if (index < 0)
      return miss && miss.node.kind !== "blank" ? miss.get() : fail(notFound("XLOOKUP", key));
    return lookup.vertical ? pick(results, index + 1, 0) : pick(results, 0, index + 1);
  },
);
define(
  "MATCH(search_key, range, [search_type])",
  "Position of a key in a row or column.",
  2,
  3,
  ([k, r, t]) => {
    const key = scalar(k);
    const index = find(line(matrix(r)).values, key, -int(t, 1), true);
    return index < 0 ? fail(notFound("MATCH", key)) : index + 1;
  },
);
define(
  "INDEX(range, row, [column])",
  "The value at a row and column of a range.",
  2,
  3,
  ([r, ri, ci]) => {
    const m = matrix(r);
    let [row, col] = [int(ri), int(ci, m.length === 1 ? -1 : 0)];
    if (col === -1) [row, col] = [1, row];
    if (row < 0 || row > m.length || col < 0 || col > m[0].length)
      throw errors.ref(`INDEX(${row}, ${col}) is outside the ${m.length}×${m[0].length} range.`);
    return pick(m, row, col);
  },
);
define(
  "CHOOSE(index, value1, [value2, …])",
  "The value at a position in the list.",
  2,
  Infinity,
  ([i, ...choices]) => {
    const k = int(i);
    return k >= 1 && k <= choices.length
      ? choices[k - 1].get()
      : fail(errors.value(`CHOOSE index ${k} is out of range.`));
  },
);
const position = (arg: Arg | undefined, scope: Scope, axis: "row" | "col"): number => {
  if (!arg) return (axis === "row" ? scope.row : scope.col) + 1;
  if (arg.node.kind !== "ref") throw errors.value("Expected a cell reference.");
  const target = locate(arg.node.ref, scope);
  if (isError(target)) throw target;
  return (axis === "row" ? target.range.r1 : target.range.c1) + 1;
};
define("ROW([cell])", "Row number of a cell.", 0, 1, ([x], scope) => position(x, scope, "row"));
define("COLUMN([cell])", "Column number of a cell.", 0, 1, ([x], scope) =>
  position(x, scope, "col"),
);
define("ROWS(range)", "Number of rows in a range.", 1, 1, ([r]) => matrix(r).length);
define("COLUMNS(range)", "Number of columns in a range.", 1, 1, ([r]) => matrix(r)[0].length);

// ---------- text ----------

const joinText = (args: Arg[], separator: string, skipEmpty: boolean): string => {
  const parts: string[] = [];
  for (const arg of args)
    for (const v of flat(arg.get())) {
      const t = toText(v);
      if (isError(t)) throw t;
      if (!(skipEmpty && t === "")) parts.push(t);
    }
  return parts.join(separator);
};
define("CONCAT(value1, [value2, …])", "Joins text.", 1, Infinity, (a) => joinText(a, "", false));
define("CONCATENATE(value1, [value2, …])", "Joins text.", 1, Infinity, (a) =>
  joinText(a, "", false),
);
define(
  "TEXTJOIN(delimiter, ignore_empty, value1, [value2, …])",
  "Joins text with a delimiter.",
  3,
  Infinity,
  ([d, skip, ...rest]) => joinText(rest, text(d), bool(skip)),
);
const count = (arg: Arg | undefined, fallback: number): number => {
  const n = int(arg, fallback);
  return n < 0 ? fail(errors.value("A count can't be negative.")) : n;
};
define("LEFT(text, [count])", "First characters.", 1, 2, ([t, n]) => text(t).slice(0, count(n, 1)));
define("RIGHT(text, [count])", "Last characters.", 1, 2, ([t, n]) => {
  const k = count(n, 1);
  return k ? text(t).slice(-k) : "";
});
define("MID(text, start, count)", "Characters from the middle.", 3, 3, ([t, s, n]) => {
  const start = int(s);
  if (start < 1) throw errors.value("MID start must be 1 or more.");
  return text(t).slice(start - 1, start - 1 + count(n, 0));
});
define("LEN(text)", "Number of characters.", 1, 1, ([t]) => text(t).length);
define("UPPER(text)", "Upper case.", 1, 1, ([t]) => text(t).toUpperCase());
define("LOWER(text)", "Lower case.", 1, 1, ([t]) => text(t).toLowerCase());
define("PROPER(text)", "Capitalizes each word.", 1, 1, ([t]) =>
  text(t)
    .toLowerCase()
    .replace(/(^|[^\p{L}])(\p{L})/gu, (_, before: string, ch: string) => before + ch.toUpperCase()),
);
define("TRIM(text)", "Removes extra spaces.", 1, 1, ([t]) => text(t).trim().replace(/ +/g, " "));
define(
  "SUBSTITUTE(text, search, replacement, [occurrence])",
  "Replaces text.",
  3,
  4,
  ([t, s, r, n]) => {
    const [source, search, replacement] = [text(t), text(s), text(r)];
    if (!search) return source;
    if (!n) return source.split(search).join(replacement);
    const nth = int(n);
    let index = -1;
    for (let k = 0; k < nth; k++) {
      index = source.indexOf(search, index + 1);
      if (index < 0) return source;
    }
    return source.slice(0, index) + replacement + source.slice(index + search.length);
  },
);
define(
  "REPLACE(text, position, length, new_text)",
  "Replaces part of a text.",
  4,
  4,
  ([t, p, n, r]) => {
    const source = text(t);
    const start = int(p);
    if (start < 1) throw errors.value("REPLACE position must be 1 or more.");
    return source.slice(0, start - 1) + text(r) + source.slice(start - 1 + count(n, 0));
  },
);
define(
  "FIND(search_for, text, [start])",
  "Position of text (case-sensitive).",
  2,
  3,
  ([s, t, p]) => {
    const index = text(t).indexOf(text(s), int(p, 1) - 1);
    return index < 0 ? fail(errors.value(`FIND did not find "${text(s)}".`)) : index + 1;
  },
);
define(
  "SEARCH(search_for, text, [start])",
  "Position of text (any case, wildcards).",
  2,
  3,
  ([s, t, p]) => {
    const source = text(t);
    const pattern = new RegExp(wildcard(text(s)).source.slice(1, -1), "i");
    const start = int(p, 1) - 1;
    const index = source.slice(start).search(pattern);
    return index < 0 ? fail(errors.value(`SEARCH did not find "${text(s)}".`)) : start + index + 1;
  },
);
define("TEXT(value, format)", 'Formats a number, like TEXT(A1, "$#,##0.00").', 2, 2, ([x, f]) => {
  const v = scalar(x);
  return typeof v === "number" ? formatPattern(v, text(f)) : text(x);
});
define("VALUE(text)", "Converts text to a number.", 1, 1, ([t]) => num(t));
define("REPT(text, times)", "Repeats text.", 2, 2, ([t, n]) => {
  const result = text(t).repeat(count(n, 0));
  return result.length > 32767 ? fail(errors.value("REPT result is too long.")) : result;
});
define(
  "EXACT(text1, text2)",
  "TRUE if texts match exactly.",
  2,
  2,
  ([a, b]) => text(a) === text(b),
);

// ---------- dates ----------

define("TODAY()", "Today's date.", 0, 0, () => todaySerial());
define("NOW()", "The current date and time.", 0, 0, () => nowSerial());
define("DATE(year, month, day)", "A date from its parts.", 3, 3, ([y, m, d]) => {
  const year = int(y);
  return dateSerial(year < 1900 ? year + 1900 : year, int(m), int(d));
});
define("YEAR(date)", "Year of a date.", 1, 1, ([d]) => dateParts(num(d)).year);
define("MONTH(date)", "Month of a date (1–12).", 1, 1, ([d]) => dateParts(num(d)).month);
define("DAY(date)", "Day of the month.", 1, 1, ([d]) => dateParts(num(d)).day);
define("HOUR(time)", "Hour (0–23).", 1, 1, ([t]) => dateParts(num(t)).hours);
define("MINUTE(time)", "Minute (0–59).", 1, 1, ([t]) => dateParts(num(t)).minutes);
define("WEEKDAY(date, [type])", "Day of the week, Sunday = 1 by default.", 1, 2, ([d, t]) => {
  const day = dateParts(num(d)).weekday;
  const type = int(t, 1);
  if (type === 1) return day + 1;
  if (type === 2) return ((day + 6) % 7) + 1;
  if (type === 3) return (day + 6) % 7;
  throw errors.num("WEEKDAY type must be 1, 2 or 3.");
});
const shiftMonths = (serial: number, months: number, endOfMonth: boolean): number => {
  const { year, month, day } = dateParts(serial);
  const last = dateParts(dateSerial(year, month + months + 1, 0)).day;
  return dateSerial(year, month + months, endOfMonth ? last : Math.min(day, last));
};
define("EDATE(start_date, months)", "A date some months away.", 2, 2, ([d, m]) =>
  shiftMonths(num(d), int(m), false),
);
define("EOMONTH(start_date, months)", "Last day of a month some months away.", 2, 2, ([d, m]) =>
  shiftMonths(num(d), int(m), true),
);
define(
  "DAYS(end_date, start_date)",
  "Days between two dates.",
  2,
  2,
  ([e, s]) => Math.trunc(num(e)) - Math.trunc(num(s)),
);
define(
  "DATEDIF(start_date, end_date, unit)",
  'Whole "Y", "M" or "D" between dates (also "YM", "MD", "YD").',
  3,
  3,
  ([s, e, u]) => {
    const [start, end] = [Math.trunc(num(s)), Math.trunc(num(e))];
    if (start > end) throw errors.num("DATEDIF needs the start date first.");
    const [a, b] = [dateParts(start), dateParts(end)];
    const months = (b.year - a.year) * 12 + b.month - a.month - (b.day < a.day ? 1 : 0);
    switch (text(u).toUpperCase()) {
      case "D":
        return end - start;
      case "M":
        return months;
      case "Y":
        return Math.floor(months / 12);
      case "YM":
        return months % 12;
      case "MD":
        return b.day >= a.day ? b.day - a.day : end - shiftMonths(start, months, false);
      case "YD":
        return end - shiftMonths(start, Math.floor(months / 12) * 12, false);
      default:
        throw errors.num('DATEDIF unit must be "Y", "M", "D", "YM", "MD" or "YD".');
    }
  },
);
define(
  "NETWORKDAYS(start_date, end_date, [holidays])",
  "Weekdays between two dates.",
  2,
  3,
  ([s, e, h]) => {
    const [start, end] = [Math.trunc(num(s)), Math.trunc(num(e))];
    const holidays = new Set(h ? numbers([h]).map(Math.trunc) : []);
    const [from, to, sign] = start <= end ? [start, end, 1] : [end, start, -1];
    if (to - from > 100_000) throw errors.num("The date range is too long.");
    let days = 0;
    for (let d = from; d <= to; d++) {
      const weekday = dateParts(d).weekday;
      if (weekday !== 0 && weekday !== 6 && !holidays.has(d)) days++;
    }
    return sign * days;
  },
);

// ---------- information ----------

define("ISBLANK(value)", "TRUE if the cell is empty.", 1, 1, ([x]) => value(x) === null);
define("ISNUMBER(value)", "TRUE for numbers.", 1, 1, ([x]) => typeof value(x) === "number");
define("ISTEXT(value)", "TRUE for text.", 1, 1, ([x]) => typeof value(x) === "string");
define("ISLOGICAL(value)", "TRUE for TRUE or FALSE.", 1, 1, ([x]) => typeof value(x) === "boolean");
define("ISERROR(value)", "TRUE for any error.", 1, 1, ([x]) => isError(value(x)));
define("ISNA(value)", "TRUE for #N/A.", 1, 1, ([x]) => {
  const v = value(x);
  return isError(v) && v.code === "#N/A";
});
define("NA()", "The #N/A error.", 0, 0, () => errors.na("Value not available."));

// ---------- financial ----------

define(
  "PMT(rate, periods, present_value, [future_value], [end_or_beginning])",
  "Payment per period of a loan.",
  3,
  5,
  ([r, n, p, f, t]) => {
    const [rate, periods, pv, fv, type] = [num(r), num(n), num(p), num(f, 0), num(t, 0)];
    if (periods === 0) throw errors.num("PMT needs at least one period.");
    if (rate === 0) return -(pv + fv) / periods;
    const growth = (1 + rate) ** periods;
    return finite(-(rate * (pv * growth + fv)) / ((1 + rate * type) * (growth - 1)));
  },
);
define(
  "FV(rate, periods, payment, [present_value], [end_or_beginning])",
  "Future value of an investment.",
  3,
  5,
  ([r, n, m, p, t]) => {
    const [rate, periods, pmt, pv, type] = [num(r), num(n), num(m), num(p, 0), num(t, 0)];
    if (rate === 0) return -(pv + pmt * periods);
    const growth = (1 + rate) ** periods;
    return finite(-(pv * growth + (pmt * (1 + rate * type) * (growth - 1)) / rate));
  },
);
define(
  "NPV(rate, value1, [value2, …])",
  "Net present value of cash flows.",
  2,
  Infinity,
  ([r, ...flows]) => {
    const rate = num(r);
    return finite(numbers(flows).reduce((sum, x, i) => sum + x / (1 + rate) ** (i + 1), 0));
  },
);

/** Function names for agents and autocomplete, alphabetical. */
export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort();
