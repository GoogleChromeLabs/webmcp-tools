/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Tools for how cells look: formatting, and conditional formats that style cells by their values. */
import { intersects, rangeName } from "../../engine/address.ts";
import { NUMBER_FORMATS } from "../../engine/input.ts";
import { DEFAULT_SCALE } from "../../model/conditional.ts";
import {
  RULE_CONDITIONS,
  SpreadsheetError,
  type FormatPatch,
  type RuleCondition,
} from "../../model/workbook.ts";
import { readColor, readRange, RETURNS_CONTENT, ruleInfo, where } from "../refs.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { bool, int, num, object, oneOf, str } from "../schema.ts";

/** The value parameters each condition takes. */
const USES: Record<RuleCondition, readonly string[]> = {
  greater_than: ["value"],
  less_than: ["value"],
  between: ["value", "value2"],
  equal_to: ["value"],
  not_equal_to: ["value"],
  text_contains: ["value"],
  is_empty: [],
  not_empty: [],
  formula: ["formula"],
  color_scale: [],
};

function readCurrency(text: string): string {
  const code = text.trim().toUpperCase();
  if (!Intl.supportedValuesOf("currency").includes(code))
    throw new SpreadsheetError(
      `"${text}" isn't a currency code. Use an ISO 4217 code, like USD, EUR or JPY.`,
    );
  return code;
}

export function formatTools(host: ToolHost): ToolSpec[] {
  const { wb } = host;
  const allRules = () =>
    wb.sheets.flatMap((sheet) =>
      sheet.rules.map((rule) => ({ sheet: sheet.name, id: rule.id, range: rangeName(rule.range) })),
    );
  return [
    defineTool({
      name: "format_cells",
      description:
        "Changes how cells look: bold, italic, colors, alignment and number format. Only the formats you pass change.",
      inputSchema: object(
        {
          range: str("Cells to format, like B2:E9 or Sales!A1:G1."),
          bold: bool("Bold text."),
          italic: bool("Italic text."),
          underline: bool("Underlined text."),
          strikethrough: bool("Struck-through text."),
          text_color: str("Text color: a CSS color like #4d48d8 or red, or none to remove it."),
          fill_color: str("Background color: a CSS color like #ffefc2, or none to remove it."),
          align: oneOf(
            ["general", "left", "center", "right"],
            "Horizontal alignment. general puts numbers on the right and text on the left.",
          ),
          number_format: oneOf(
            NUMBER_FORMATS,
            "How numbers show. general resets to automatic; text keeps what is typed as text.",
          ),
          decimals: int("Decimal places to show.", { minimum: 0, maximum: 10 }),
          currency: str(
            "Currency code for the currency format, like USD, EUR or JPY. Setting it also applies the currency format.",
          ),
        },
        ["range"],
      ),
      execute: ({ range, ...formats }) => {
        const changed = Object.entries(formats).flatMap(([key, value]) =>
          value === undefined ? [] : [key],
        );
        if (!changed.length)
          throw new SpreadsheetError(
            "Pass at least one format to change, like bold or number_format.",
          );
        const target = readRange(wb, range);
        const patch: { -readonly [K in keyof FormatPatch]: FormatPatch[K] } = {};
        if (formats.bold !== undefined) patch.bold = formats.bold || null;
        if (formats.italic !== undefined) patch.italic = formats.italic || null;
        if (formats.underline !== undefined) patch.underline = formats.underline || null;
        if (formats.strikethrough !== undefined) patch.strike = formats.strikethrough || null;
        if (formats.text_color !== undefined) patch.color = readColor(formats.text_color);
        if (formats.fill_color !== undefined) patch.fill = readColor(formats.fill_color);
        if (formats.align !== undefined)
          patch.align = formats.align === "general" ? null : formats.align;
        if (formats.number_format === "general")
          Object.assign(patch, { numFmt: null, decimals: null, currency: null });
        else if (formats.number_format !== undefined) patch.numFmt = formats.number_format;
        if (formats.decimals !== undefined) patch.decimals = formats.decimals;
        if (formats.currency !== undefined) {
          patch.currency = readCurrency(formats.currency);
          if (formats.number_format === undefined) patch.numFmt = "currency";
        }
        wb.format(target.sheet, target.range, patch);
        return {
          result: { formatted: where(target), changed },
          summary: `Formatted ${rangeName(target.range)}: ${changed.join(", ")}`,
          target,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "add_conditional_format",
      description:
        "Adds a rule that styles cells by their values, like red text for negative numbers, and keeps applying as values change. It can also shade numbers across a color range instead of styling the cells that match.",
      inputSchema: object(
        {
          range: str("Cells the rule applies to, like G2:G20 or Sales!B2:E6."),
          condition: oneOf(RULE_CONDITIONS, "When a cell gets the style."),
          value: str(
            "What to compare with; for between, the lower bound. Numbers compare as numbers.",
          ),
          value2: num("The upper bound for between."),
          formula: str(
            "For the formula condition: a formula that is TRUE for cells to style, written for the range's top-left cell, like =$C2>100.",
          ),
          text_color: str("Text color of matching cells, a CSS color like #b42318."),
          fill_color: str(
            "Background of matching cells, a CSS color like #fde3df. With no style at all, matching cells get a light amber fill.",
          ),
          bold: bool("Bold text in matching cells."),
          italic: bool("Italic text in matching cells."),
          strikethrough: bool("Struck-through text in matching cells."),
          min_color: str("For color_scale, the color of the lowest number.", {
            default: DEFAULT_SCALE.min,
          }),
          max_color: str("For color_scale, the color of the highest number.", {
            default: DEFAULT_SCALE.max,
          }),
        },
        ["range", "condition"],
      ),
      execute: (input) => {
        const { condition } = input;
        const target = readRange(wb, input.range);
        for (const key of ["value", "value2", "formula"] as const)
          if (input[key] !== undefined && !USES[condition].includes(key))
            throw new SpreadsheetError(`The ${condition} condition doesn't use ${key}.`);
        const styleColor = (text: string | undefined) =>
          text === undefined ? undefined : (readColor(text) ?? undefined);
        const style = {
          color: styleColor(input.text_color),
          fill: styleColor(input.fill_color),
          bold: input.bold,
          italic: input.italic,
          strike: input.strikethrough,
        };
        const styled = Object.values(style).some((value) => value !== undefined);
        if (condition === "color_scale" && styled)
          throw new SpreadsheetError(
            "color_scale shades cells with min_color and max_color; it doesn't take text or fill styles.",
          );
        const [min, max] = [readColor(input.min_color), readColor(input.max_color)];
        if (condition === "color_scale" && (!min || !max))
          throw new SpreadsheetError("color_scale needs two colors: min_color and max_color.");
        const value = input.value?.trim();
        const formula = input.formula?.trim();
        const rule = wb.addRule(target.sheet, {
          range: target.range,
          condition,
          // Like the dialog: text that reads as a number compares as a number.
          value:
            value === undefined
              ? undefined
              : value !== "" && Number.isFinite(Number(value))
                ? Number(value)
                : value,
          value2: input.value2,
          formula: formula === undefined || formula.startsWith("=") ? formula : `=${formula}`,
          style: condition !== "color_scale" && styled ? style : undefined,
          scale: condition === "color_scale" && min && max ? { min, max } : undefined,
        });
        return {
          result: { ...ruleInfo(rule), sheet: target.sheet.name },
          summary: `Added a ${condition.replaceAll("_", " ")} rule to ${rangeName(rule.range)}`,
          target,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "delete_conditional_format",
      description:
        "Removes conditional format rules: one by id, or every rule that overlaps a range.",
      inputSchema: object({
        id: str("Id of the rule to remove, like rule2. get_workbook_info lists the rules."),
        range: str("Remove every rule that overlaps this range instead, like G2:G20 or Sales!A:Z."),
      }),
      execute: ({ id, range }) => {
        if (id !== undefined && range !== undefined)
          throw new SpreadsheetError("Pass id or range, not both.");
        if (id !== undefined) {
          const sheet = wb.sheets.find((s) => s.rules.some((rule) => rule.id === id));
          if (!sheet)
            throw new SpreadsheetError(`There is no conditional format "${id}".`, {
              rules: allRules(),
            });
          const removed = wb.deleteRules(sheet, (rule) => rule.id === id);
          return { result: { removed, sheet: sheet.name }, summary: `Removed rule ${id}` };
        }
        if (range === undefined)
          throw new SpreadsheetError(
            "Pass the id of a rule, or a range to remove the rules on it.",
          );
        const target = readRange(wb, range);
        const removed = wb.deleteRules(target.sheet, (rule) =>
          intersects(rule.range, target.range),
        );
        if (!removed.length)
          throw new SpreadsheetError(`No conditional formats overlap ${where(target)}.`, {
            rules: allRules(),
          });
        return {
          result: { removed, sheet: target.sheet.name },
          summary: `Removed ${removed.length === 1 ? "1 rule" : `${removed.length} rules`} from ${rangeName(target.range)}`,
          target,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
  ];
}
