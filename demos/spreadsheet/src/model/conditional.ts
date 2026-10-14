/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Conditional formatting: which rule style, if any, applies to each cell. */
import { inRange } from "../engine/address.ts";
import { formatValue } from "../engine/format.ts";
import { compareScalars, isError, toBoolean, type Value } from "../engine/values.ts";
import type { ConditionalRule, RuleStyle, Sheet, Workbook } from "./workbook.ts";

/** Used when a rule names no style: a light amber fill. */
export const DEFAULT_RULE_STYLE: RuleStyle = { fill: "#ffe7a3" };
export const DEFAULT_SCALE = { min: "#ffffff", max: "#8c88f2" };

function matches(
  wb: Workbook,
  sheet: Sheet,
  rule: ConditionalRule,
  row: number,
  col: number,
  value: Value,
): boolean {
  switch (rule.condition) {
    case "is_empty":
      return value === null || value === "";
    case "not_empty":
      return value !== null && value !== "";
    case "text_contains":
      return formatValue(value, wb.cell(sheet, row, col)?.fmt)
        .toLowerCase()
        .includes(String(rule.value ?? "").toLowerCase());
    case "formula":
      return (
        toBoolean(
          wb.evaluateAt(sheet, rule.formula ?? "", row, col, {
            row: rule.range.r1,
            col: rule.range.c1,
          }),
        ) === true
      );
    case "color_scale":
      return false;
  }
  const target = rule.value;
  if (value === null || isError(value) || target === undefined) return false;
  if (typeof target === "number" && typeof value !== "number") return false;
  const diff = compareScalars(value, target);
  switch (rule.condition) {
    case "greater_than":
      return diff > 0;
    case "less_than":
      return diff < 0;
    case "equal_to":
      return diff === 0;
    case "not_equal_to":
      return diff !== 0;
    case "between": {
      const upper = rule.value2 ?? target;
      return diff >= 0 && compareScalars(value, upper) <= 0;
    }
  }
}

/**
 * Returns a lookup for one render of the sheet. The first matching rule styles a cell; a color
 * scale fills numbers from its min color (lowest value) to its max color (highest value).
 */
export function ruleStyles(
  wb: Workbook,
  sheet: Sheet,
): (row: number, col: number) => RuleStyle | undefined {
  if (!sheet.rules.length) return () => undefined;
  const bounds = new Map<string, { min: number; max: number }>();
  for (const rule of sheet.rules) {
    if (rule.condition !== "color_scale") continue;
    let [min, max] = [Infinity, -Infinity];
    for (let r = rule.range.r1; r <= Math.min(rule.range.r2, sheet.rows - 1); r++)
      for (let c = rule.range.c1; c <= Math.min(rule.range.c2, sheet.cols - 1); c++) {
        const v = wb.value(sheet, r, c);
        if (typeof v === "number") [min, max] = [Math.min(min, v), Math.max(max, v)];
      }
    bounds.set(rule.id, { min, max });
  }
  return (row, col) => {
    let style: RuleStyle | undefined;
    let fill: string | undefined;
    for (const rule of sheet.rules) {
      if (!inRange(rule.range, row, col)) continue;
      const value = wb.value(sheet, row, col);
      if (rule.condition === "color_scale") {
        const span = bounds.get(rule.id);
        if (fill || typeof value !== "number" || !span) continue;
        const share =
          span.max > span.min
            ? Math.round(((value - span.min) / (span.max - span.min)) * 100)
            : 100;
        const { min, max } = rule.scale ?? DEFAULT_SCALE;
        fill = `color-mix(in oklab, ${max} ${share}%, ${min})`;
      } else if (!style && matches(wb, sheet, rule, row, col, value))
        style = rule.style ?? DEFAULT_RULE_STYLE;
    }
    return fill && !style?.fill ? { ...style, fill } : style;
  };
}
