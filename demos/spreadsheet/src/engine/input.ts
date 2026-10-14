/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Reads what a person (or an agent) types into a cell, like "12%", "$1,200" or "2026-10-13". */
import { dateSerial, isValidDate, timeFraction } from "./dates.ts";

export const NUMBER_FORMATS = [
  "general",
  "number",
  "currency",
  "percent",
  "date",
  "time",
  "datetime",
  "text",
] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

/** The number format a typed value implies, applied when the cell has none yet. */
export interface ImpliedFormat {
  numFmt: NumberFormat;
  decimals?: number;
  currency?: string;
}

export interface ParsedInput {
  value: string | number | boolean | null;
  /** Formula text including the leading "=". */
  formula?: string;
  format?: ImpliedFormat;
}

const CURRENCIES: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
};
const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?|\.(\d+)`;
const PLAIN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const GROUPED = new RegExp(`^([+-]?)(?:${NUM})$`);
const PERCENT = new RegExp(`^([+-]?)(?:${NUM})\\s?%$`);
const CURRENCY_BEFORE = new RegExp(`^([+-]?)([$€£¥₹])\\s?([+-]?)(?:${NUM})$`);
const CURRENCY_AFTER = new RegExp(`^([+-]?)(?:${NUM})\\s?([$€£¥₹])$`);
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i;

/** Digits matched by NUM: [integer part with commas, fraction] or [undefined, undefined, fraction]. */
function numberFrom(
  integer: string | undefined,
  fraction: string | undefined,
  bare: string | undefined,
) {
  const frac = fraction ?? bare ?? "";
  return {
    value: Number(`${(integer ?? "0").replaceAll(",", "")}.${frac || "0"}`),
    decimals: frac.length,
  };
}

function parseNumberLike(text: string): ParsedInput | null {
  if (PLAIN.test(text)) return { value: Number(text) };
  let m = GROUPED.exec(text);
  if (m) {
    const { value, decimals } = numberFrom(m[2], m[3], m[4]);
    return { value: m[1] === "-" ? -value : value, format: { numFmt: "number", decimals } };
  }
  if ((m = PERCENT.exec(text))) {
    const { value, decimals } = numberFrom(m[2], m[3], m[4]);
    return {
      value: (m[1] === "-" ? -value : value) / 100,
      format: { numFmt: "percent", decimals },
    };
  }
  if ((m = CURRENCY_BEFORE.exec(text))) {
    const { value, decimals } = numberFrom(m[4], m[5], m[6]);
    const negative = (m[1] === "-") !== (m[3] === "-");
    return { value: negative ? -value : value, format: currencyFormat(m[2], decimals) };
  }
  if ((m = CURRENCY_AFTER.exec(text))) {
    const { value, decimals } = numberFrom(m[2], m[3], m[4]);
    return { value: m[1] === "-" ? -value : value, format: currencyFormat(m[5], decimals) };
  }
  return parseDateLike(text);
}

/** Without typed decimals, the currency's own default applies (2 for USD, 0 for JPY). */
const currencyFormat = (symbol: string, decimals: number): ImpliedFormat => ({
  numFmt: "currency",
  currency: CURRENCIES[symbol],
  ...(decimals > 0 && { decimals }),
});

function parseDateLike(text: string): ParsedInput | null {
  let m = ISO_DATE.exec(text);
  if (m) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!isValidDate(year, month, day)) return null;
    if (m[4] === undefined)
      return { value: dateSerial(year, month, day), format: { numFmt: "date" } };
    const [hours, minutes, seconds] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return {
      value: dateSerial(year, month, day) + timeFraction(hours, minutes, seconds),
      format: { numFmt: "datetime" },
    };
  }
  if ((m = US_DATE.exec(text))) {
    const [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(year, month, day)
      ? { value: dateSerial(year, month, day), format: { numFmt: "date" } }
      : null;
  }
  if ((m = TIME.exec(text))) {
    let hours = Number(m[1]);
    const [minutes, seconds, meridiem] = [Number(m[2]), Number(m[3] ?? 0), m[4]?.toLowerCase()];
    if (meridiem && (hours < 1 || hours > 12)) return null;
    if (meridiem) hours = (hours % 12) + (meridiem === "pm" ? 12 : 0);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return { value: timeFraction(hours, minutes, seconds), format: { numFmt: "time" } };
  }
  return null;
}

/**
 * "=…" is a formula, a leading apostrophe keeps the rest as text, TRUE/FALSE are booleans, and
 * numbers, percentages, currency amounts, dates and times become numbers with an implied format.
 */
export function parseInput(raw: string): ParsedInput {
  const text = raw.trim();
  if (!text) return { value: null };
  if (text.startsWith("=") && text.length > 1) return { value: null, formula: text };
  if (raw.startsWith("'")) return { value: raw.slice(1) };
  if (/^(true|false)$/i.test(text)) return { value: text.toUpperCase() === "TRUE" };
  return parseNumberLike(text) ?? { value: raw };
}
