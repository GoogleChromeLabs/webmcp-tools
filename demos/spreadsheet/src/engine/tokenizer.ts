/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Splits formula text (without the leading "=") into tokens that keep their source text. */
import { REF_AT, refFromMatch, type Ref } from "./address.ts";
import { ERROR_CODES, type ErrorCode } from "./values.ts";

interface TokenBase {
  text: string;
  start: number;
}
export type Token =
  | (TokenBase & { type: "num"; value: number })
  | (TokenBase & { type: "str"; value: string })
  | (TokenBase & { type: "bool"; value: boolean })
  | (TokenBase & { type: "err"; code: ErrorCode })
  | (TokenBase & { type: "ref"; ref: Ref })
  | (TokenBase & { type: "func"; name: string })
  | (TokenBase & { type: "name" | "op" | "lparen" | "rparen" | "comma" | "ws" | "invalid" });

const WS = /\s+/y;
const STRING = /"(?:[^"]|"")*"/y;
const NUMBER = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const FUNCTION = /[A-Za-z_][A-Za-z0-9_.]*(?=\s*\()/y;
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_.]*/y;
const OPERATORS = ["<>", "<=", ">=", "+", "-", "*", "/", "^", "&", "=", "<", ">", "%"];

function matchAt(pattern: RegExp, src: string, index: number): string | null {
  pattern.lastIndex = index;
  return pattern.exec(src)?.[0] ?? null;
}

/** A reference at `index`, unless it runs straight into more name characters (as in "A1B"). */
function refAt(src: string, index: number): { text: string; ref: Ref } | null {
  REF_AT.lastIndex = index;
  const match = REF_AT.exec(src);
  if (!match) return null;
  const next = src[index + match[0].length] ?? "";
  const ref = /[A-Za-z0-9_.(!]/.test(next) ? null : refFromMatch(match);
  return ref && { text: match[0], ref };
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const start = i;
    const ch = src[i];
    let text: string | null;
    let ref: { text: string; ref: Ref } | null;
    if ((text = matchAt(WS, src, i))) tokens.push({ type: "ws", text, start });
    else if (ch === '"') {
      text = matchAt(STRING, src, i) ?? src.slice(i);
      tokens.push(
        text.length > 1 && text.endsWith('"')
          ? { type: "str", text, start, value: text.slice(1, -1).replaceAll('""', '"') }
          : { type: "invalid", text, start },
      );
    } else if (ch === "#") {
      const code = ERROR_CODES.find((c) => src.slice(i, i + c.length).toUpperCase() === c);
      text = code ? src.slice(i, i + code.length) : ch;
      tokens.push(code ? { type: "err", text, start, code } : { type: "invalid", text, start });
    } else if (/[0-9.]/.test(ch)) {
      // Row ranges like 2:5 start with digits too.
      if ((ref = refAt(src, i))) tokens.push({ type: "ref", start, ...ref });
      else if ((text = matchAt(NUMBER, src, i)))
        tokens.push({ type: "num", text, start, value: Number(text) });
      else tokens.push({ type: "invalid", text: ch, start });
    } else if (/[A-Za-z_$']/.test(ch)) {
      if ((text = matchAt(FUNCTION, src, i)))
        tokens.push({ type: "func", text, start, name: text.toUpperCase() });
      else if ((ref = refAt(src, i))) tokens.push({ type: "ref", start, ...ref });
      else if ((text = matchAt(IDENTIFIER, src, i))) {
        const upper = text.toUpperCase();
        tokens.push(
          upper === "TRUE" || upper === "FALSE"
            ? { type: "bool", text, start, value: upper === "TRUE" }
            : { type: "name", text, start },
        );
      } else tokens.push({ type: "invalid", text: ch, start });
    } else {
      const op = OPERATORS.find((o) => src.startsWith(o, i));
      text = op ?? ch;
      tokens.push({
        type: op
          ? "op"
          : ch === "("
            ? "lparen"
            : ch === ")"
              ? "rparen"
              : ch === ","
                ? "comma"
                : "invalid",
        text,
        start,
      });
    }
    i += tokens[tokens.length - 1].text.length;
  }
  return tokens;
}
