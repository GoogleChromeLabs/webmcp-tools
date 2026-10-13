/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** A Pratt parser that turns formula text (without the leading "=") into a syntax tree. */
import type { Ref } from "./address.ts";
import { tokenize, type Token } from "./tokenizer.ts";
import type { ErrorCode } from "./values.ts";

export type BinaryOp = "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | ">" | "<=" | ">=";

export type Node =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "err"; code: ErrorCode }
  | { kind: "blank" }
  | { kind: "ref"; ref: Ref }
  | { kind: "name"; name: string }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "unary"; op: "+" | "-"; arg: Node }
  | { kind: "percent"; arg: Node }
  | { kind: "binary"; op: BinaryOp; left: Node; right: Node };

export class FormulaSyntaxError extends Error {}

// Binding powers, loosest first. Negation binds tighter than ^, so -2^2 is 4 as in other spreadsheets.
const BINARY: Record<string, number> = {
  "=": 1,
  "<>": 1,
  "<": 1,
  ">": 1,
  "<=": 1,
  ">=": 1,
  "&": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "^": 5,
};
const PERCENT = 6;
const UNARY = 7;

class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(src: string) {
    this.tokens = tokenize(src).filter((token) => token.type !== "ws");
  }

  parse(): Node {
    if (!this.tokens.length) throw new FormulaSyntaxError("The formula is empty.");
    const node = this.expression(0);
    const rest = this.tokens[this.pos];
    if (rest) throw this.unexpected(rest);
    return node;
  }

  private expression(minPower: number): Node {
    let left = this.prefix();
    for (let token = this.tokens[this.pos]; token?.type === "op"; token = this.tokens[this.pos]) {
      if (token.text === "%") {
        if (PERCENT <= minPower) break;
        this.pos++;
        left = { kind: "percent", arg: left };
        continue;
      }
      const power = BINARY[token.text];
      if (power === undefined || power <= minPower) break;
      this.pos++;
      left = { kind: "binary", op: token.text as BinaryOp, left, right: this.expression(power) };
    }
    return left;
  }

  private prefix(): Node {
    const token = this.tokens[this.pos++];
    if (!token) throw new FormulaSyntaxError("The formula ends too early.");
    switch (token.type) {
      case "num":
      case "str":
      case "bool":
        return { kind: token.type, value: token.value } as Node;
      case "err":
        return { kind: "err", code: token.code };
      case "ref":
        return { kind: "ref", ref: token.ref };
      case "name":
        return { kind: "name", name: token.text };
      case "func":
        return this.call(token.name);
      case "lparen": {
        const inner = this.expression(0);
        if (this.tokens[this.pos]?.type !== "rparen")
          throw new FormulaSyntaxError("A closing parenthesis is missing.");
        this.pos++;
        return inner;
      }
      case "op":
        if (token.text === "-" || token.text === "+")
          return { kind: "unary", op: token.text, arg: this.expression(UNARY) };
    }
    throw this.unexpected(token);
  }

  private call(name: string): Node {
    this.pos++; // "(" — the tokenizer only emits "func" right before one.
    const args: Node[] = [];
    if (this.tokens[this.pos]?.type === "rparen") {
      this.pos++;
      return { kind: "call", name, args };
    }
    for (;;) {
      const next = this.tokens[this.pos];
      args.push(
        next?.type === "comma" || next?.type === "rparen" ? { kind: "blank" } : this.expression(0),
      );
      const separator = this.tokens[this.pos++];
      if (separator?.type === "rparen") return { kind: "call", name, args };
      if (separator?.type !== "comma")
        throw separator
          ? this.unexpected(separator)
          : new FormulaSyntaxError(`${name}( is missing its closing parenthesis.`);
    }
  }

  private unexpected(token: Token): FormulaSyntaxError {
    return new FormulaSyntaxError(
      token.type === "invalid" && token.text.startsWith('"')
        ? "A text value is missing its closing quote."
        : `Unexpected "${token.text}" at position ${token.start + 2}.`,
    );
  }
}

/** Parses formula text without its leading "="; throws FormulaSyntaxError with a readable reason. */
export const parseFormula = (src: string): Node => new Parser(src).parse();
