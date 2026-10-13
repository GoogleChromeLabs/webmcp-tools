/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Computes a formula's syntax tree. Errors are values: they propagate, they never throw. */
import { FUNCTIONS, type FunctionDef } from "./functions.ts";
import type { BinaryOp, Node } from "./parser.ts";
import { locate, type Arg, type Scope } from "./scope.ts";
import {
  compareScalars,
  errors,
  FormulaError,
  isError,
  literalError,
  toNumber,
  toScalar,
  toText,
  type Matrix,
  type Result,
  type Value,
} from "./values.ts";

export function evaluate(node: Node, scope: Scope): Result {
  switch (node.kind) {
    case "num":
    case "str":
    case "bool":
      return node.value;
    case "blank":
      return null;
    case "err":
      return literalError(node.code);
    case "ref":
      return resolve(node, scope);
    case "name":
      return new FormulaError(
        "#NAME?",
        `Unknown name "${node.name}". Put text in double quotes, like "${node.name}".`,
      );
    case "unary":
    case "percent": {
      const n = toNumber(toScalar(evaluate(node.arg, scope)));
      if (isError(n)) return n;
      return node.kind === "percent" ? n / 100 : node.op === "-" ? -n : n;
    }
    case "binary":
      return binary(
        node.op,
        toScalar(evaluate(node.left, scope)),
        toScalar(evaluate(node.right, scope)),
      );
    case "call":
      return call(node.name, node.args, scope);
  }
}

function resolve(node: Extract<Node, { kind: "ref" }>, scope: Scope): Result {
  const target = locate(node.ref, scope);
  if (isError(target)) return target;
  const { sheet, range } = target;
  if (!node.ref.b) return scope.value(sheet, range.r1, range.c1);
  const rows: Matrix = [];
  for (let r = range.r1; r <= range.r2; r++) {
    const row: Value[] = [];
    for (let c = range.c1; c <= range.c2; c++) row.push(scope.value(sheet, r, c));
    rows.push(row);
  }
  return rows;
}

function binary(op: BinaryOp, left: Value, right: Value): Value {
  if (isError(left)) return left;
  if (isError(right)) return right;
  switch (op) {
    case "&":
      return `${toText(left)}${toText(right)}`;
    case "=":
      return compareScalars(left, right) === 0;
    case "<>":
      return compareScalars(left, right) !== 0;
    case "<":
      return compareScalars(left, right) < 0;
    case ">":
      return compareScalars(left, right) > 0;
    case "<=":
      return compareScalars(left, right) <= 0;
    case ">=":
      return compareScalars(left, right) >= 0;
  }
  const a = toNumber(left);
  const b = toNumber(right);
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (op === "/" && b === 0) return errors.div0();
  if (op === "^" && a === 0 && b === 0) return errors.num("0^0 is not defined.");
  const result =
    op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : op === "/" ? a / b : a ** b;
  return Number.isFinite(result) ? result : errors.num();
}

const arity = ({ min, max }: FunctionDef): string =>
  min === max
    ? `${min} argument${min === 1 ? "" : "s"}`
    : max === Infinity
      ? `at least ${min} argument${min === 1 ? "" : "s"}`
      : `${min} to ${max} arguments`;

function call(name: string, nodes: Node[], scope: Scope): Result {
  const fn = FUNCTIONS[name];
  if (!fn) return new FormulaError("#NAME?", `Unknown function ${name}().`);
  if (nodes.length < fn.min || nodes.length > fn.max)
    return errors.na(`${name}() takes ${arity(fn)}, not ${nodes.length}.`);
  const args = nodes.map((node): Arg => {
    let done = false;
    let result: Result = null;
    return {
      node,
      get: () => {
        if (!done) [result, done] = [evaluate(node, scope), true];
        return result;
      },
    };
  });
  try {
    return fn.call(args, scope);
  } catch (error) {
    // Function helpers throw the first error they meet; it becomes the formula's value.
    if (error instanceof FormulaError) return error;
    throw error;
  }
}
