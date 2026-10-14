/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Cell formats and how values are displayed and edited. */
import { dateParts, isoDate, isoTime, MONTHS, WEEKDAYS } from "./dates.ts";
import { parseInput, type NumberFormat } from "./input.ts";
import { isError, type Value } from "./values.ts";

export type { NumberFormat };
export type Align = "left" | "center" | "right";

export interface CellFormat {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  /** CSS colors, checked before they are stored. */
  readonly color?: string;
  readonly fill?: string;
  readonly align?: Align;
  readonly numFmt?: NumberFormat;
  readonly decimals?: number;
  /** ISO 4217 code for the currency format. */
  readonly currency?: string;
}

const formatters = new Map<string, Intl.NumberFormat>();
function intl(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) formatters.set(key, (formatter = new Intl.NumberFormat("en-US", options)));
  return formatter;
}

const digits = (decimals: number | undefined, fallback: number | undefined) => {
  const d = decimals ?? fallback;
  return d === undefined ? {} : { minimumFractionDigits: d, maximumFractionDigits: d };
};

/** Integers as is; other numbers to 10 significant digits; very large or small in E notation. */
export function generalNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9))
    return n
      .toExponential(4)
      .replace(/\.?0+e/, "e")
      .replace("e", "E");
  if (Number.isInteger(n)) return String(n + 0);
  return String(Number(n.toPrecision(10)));
}

export function formatNumber(n: number, fmt?: CellFormat): string {
  switch (fmt?.numFmt) {
    case "number":
      return intl(digits(fmt.decimals, 2)).format(n);
    case "currency":
      return intl({
        style: "currency",
        currency: fmt.currency ?? "USD",
        ...digits(fmt.decimals, undefined),
      }).format(n);
    case "percent":
      return intl({ style: "percent", ...digits(fmt.decimals, 2) }).format(n);
    case "date":
      return isoDate(n);
    case "time":
      return isoTime(n);
    case "datetime":
      return `${isoDate(n)} ${isoTime(n)}`;
    default:
      return fmt?.decimals === undefined
        ? generalNumber(n)
        : intl({ useGrouping: false, ...digits(fmt.decimals, 0) }).format(n);
  }
}

/** The text a cell shows. */
export function formatValue(value: Value, fmt?: CellFormat): string {
  if (value === null) return "";
  if (isError(value)) return value.code;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return formatNumber(value, fmt);
  return value;
}

/** The text the cell editor starts with: the formula, or a value that reads back the same. */
export function editText(
  value: string | number | boolean | undefined,
  formula: string | undefined,
  fmt?: CellFormat,
): string {
  if (formula) return formula;
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    switch (fmt?.numFmt) {
      case "percent":
        return generalNumber(value * 100) + "%";
      case "date":
      case "time":
      case "datetime":
        return formatNumber(value, fmt);
      default:
        return generalNumber(value);
    }
  }
  if (fmt?.numFmt === "text") return value;
  const parsed = parseInput(value);
  return parsed.formula || parsed.value !== value ? "'" + value : value;
}

/** TEXT(value, pattern): number patterns like "$#,##0.00" or "0.0%", date patterns like "mmm d, yyyy". */
export function formatPattern(value: number, pattern: string): string {
  const unquoted = pattern.replace(/"[^"]*"/g, "");
  if (/[dmyhs]/i.test(unquoted) && !/[0#]/.test(unquoted)) return formatDatePattern(value, pattern);
  const match = /[0#][0#,]*(?:\.[0#]*)?|\.[0#]+/.exec(pattern);
  if (!match) return pattern.replace(/"([^"]*)"/g, "$1");
  const numeric = match[0];
  const [intPart, fracPart = ""] = numeric.split(".");
  const percent = pattern.includes("%");
  const n = percent ? value * 100 : value;
  const body = intl({
    useGrouping: intPart.includes(","),
    minimumIntegerDigits: Math.max(1, (intPart.match(/0/g) ?? []).length),
    minimumFractionDigits: (fracPart.match(/0/g) ?? []).length,
    maximumFractionDigits: fracPart.length,
  }).format(Math.abs(n));
  const literal = (text: string) => text.replace(/"([^"]*)"/g, "$1");
  const prefix = literal(pattern.slice(0, match.index));
  const suffix = literal(pattern.slice(match.index + numeric.length));
  return `${n < 0 && body !== "0" ? "-" : ""}${prefix}${body}${suffix}`;
}

const DATE_TOKEN = /yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|"[^"]*"|./gi;

function formatDatePattern(serial: number, pattern: string): string {
  const parts = dateParts(serial);
  const tokens = pattern.match(DATE_TOKEN) ?? [];
  const twelveHour = tokens.some((t) => t.toLowerCase() === "am/pm");
  const pad = (n: number) => String(n).padStart(2, "0");
  let afterHour = false;
  return tokens
    .map((token, index) => {
      const lower = token.toLowerCase();
      const nextIsSeconds = /^s+$/i.test(
        tokens.slice(index + 1).find((t) => /[a-z]/i.test(t)) ?? "",
      );
      if ((lower === "m" || lower === "mm") && (afterHour || nextIsSeconds)) {
        afterHour = false;
        return lower === "mm" ? pad(parts.minutes) : String(parts.minutes);
      }
      if (lower === "h" || lower === "hh") afterHour = true;
      const hour12 = parts.hours % 12 || 12;
      switch (lower) {
        case "yyyy":
          return String(parts.year);
        case "yy":
          return pad(parts.year % 100);
        case "mmmm":
          return MONTHS[parts.month - 1];
        case "mmm":
          return MONTHS[parts.month - 1].slice(0, 3);
        case "mm":
          return pad(parts.month);
        case "m":
          return String(parts.month);
        case "dddd":
          return WEEKDAYS[parts.weekday];
        case "ddd":
          return WEEKDAYS[parts.weekday].slice(0, 3);
        case "dd":
          return pad(parts.day);
        case "d":
          return String(parts.day);
        case "hh":
          return pad(twelveHour ? hour12 : parts.hours);
        case "h":
          return String(twelveHour ? hour12 : parts.hours);
        case "ss":
          return pad(parts.seconds);
        case "s":
          return String(parts.seconds);
        case "am/pm":
          return parts.hours < 12 ? "AM" : "PM";
        default:
          return token.startsWith('"') ? token.slice(1, -1) : token;
      }
    })
    .join("");
}
