/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** The find & replace dialog and the conditional formatting editor. */
import { parseRef, rangeName, refRange, type Range } from "../engine/address.ts";
import {
  VALUE_CONDITIONS,
  type ConditionalRule,
  type RuleCondition,
  type Sheet,
} from "../model/workbook.ts";
import type { App } from "./app.ts";
import { $, h, icon } from "./dom.ts";

const CONDITIONS: Record<RuleCondition, string> = {
  greater_than: "greater than",
  less_than: "less than",
  between: "between",
  equal_to: "equal to",
  not_equal_to: "not equal to",
  text_contains: "text contains",
  is_empty: "is empty",
  not_empty: "is not empty",
  formula: "formula",
  color_scale: "color scale",
};

export function describeRule(rule: ConditionalRule): string {
  const detail =
    rule.condition === "between"
      ? `${rule.value} and ${rule.value2}`
      : rule.condition === "formula"
        ? rule.formula
        : rule.value;
  return `${rangeName(rule.range)} · ${CONDITIONS[rule.condition]}${detail === undefined ? "" : ` ${detail}`}`;
}

const wholeSheet = (sheet: Sheet): Range => ({
  r1: 0,
  c1: 0,
  r2: sheet.rows - 1,
  c2: sheet.cols - 1,
});

export function setupFindReplace(app: App): { open(): void } {
  const dialog = $<HTMLDialogElement>("#find-dialog");
  const form = $<HTMLFormElement>("#find-form");
  const status = $("#find-status");
  let cursor = -1;

  const read = () => {
    const data = new FormData(form);
    return {
      find: String(data.get("find") ?? ""),
      replace: String(data.get("replace") ?? ""),
      sheets: data.get("scope") === "all" ? app.wb.sheets : [app.grid.sheet],
      options: {
        matchCase: data.has("matchCase"),
        entireCell: data.has("entireCell"),
        formulas: data.has("formulas"),
      },
    };
  };

  const next = () => {
    const { find, sheets, options } = read();
    const hits = find
      ? sheets.flatMap((sheet) => app.wb.search(sheet, find, options).map((p) => ({ sheet, ...p })))
      : [];
    if (!hits.length) {
      status.textContent = find ? "No matches." : "Type something to find.";
      return;
    }
    cursor = (cursor + 1) % hits.length;
    const { sheet, row, col } = hits[cursor];
    app.reveal({ sheet, range: { r1: row, c1: col, r2: row, c2: col } });
    status.textContent = `Match ${cursor + 1} of ${hits.length}.`;
  };

  const reset = () => {
    cursor = -1;
    status.textContent = "";
  };
  dialog.addEventListener("command", reset);
  form.addEventListener("input", () => (cursor = -1));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    next();
  });
  form.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>("[data-find]")?.dataset.find;
    if (!action) return;
    const { find, replace, sheets, options } = read();
    if (action === "next" || !find) return next();
    if (action === "replace") {
      const { sheet, active } = app.grid;
      app.run(() =>
        app.wb.replaceText(
          sheet,
          { r1: active.row, c1: active.col, r2: active.row, c2: active.col },
          find,
          replace,
          options,
        ),
      );
      cursor = -1;
      return next();
    }
    let count = 0;
    app.run(() =>
      app.wb.transact("Replace all", () => {
        for (const sheet of sheets)
          count += app.wb.replaceText(sheet, wholeSheet(sheet), find, replace, options).length;
      }),
    );
    status.textContent = count ? `Replaced ${count} cell${count === 1 ? "" : "s"}.` : "No matches.";
  });

  return {
    open() {
      reset();
      if (!dialog.open) dialog.showModal();
    },
  };
}

export function setupConditionalFormats(app: App): { open(): void } {
  const dialog = $<HTMLDialogElement>("#cf-dialog");
  const form = $<HTMLFormElement>("#cf-form");
  const list = $("#cf-rules");
  const status = $("#cf-status");
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

  const showFields = () => {
    const condition = field("condition").value as RuleCondition;
    const visible: Record<string, boolean> = {
      value: VALUE_CONDITIONS.includes(condition),
      value2: condition === "between",
      formula: condition === "formula",
      style: condition !== "color_scale",
      scale: condition === "color_scale",
    };
    for (const element of form.querySelectorAll<HTMLElement>("[data-for]"))
      element.hidden = !visible[element.dataset.for!];
  };

  const renderRules = () => {
    const sheet = app.grid.sheet;
    if (!sheet.rules.length) {
      list.replaceChildren(h("li", { className: "none" }, "No rules on this sheet yet."));
      return;
    }
    list.replaceChildren(
      ...sheet.rules.map((rule) => {
        const remove = h(
          "button",
          { type: "button", className: "icon-btn", ariaLabel: `Delete rule ${describeRule(rule)}` },
          icon("trash"),
        );
        remove.addEventListener("click", () => {
          app.run(() => app.wb.deleteRules(sheet, (r) => r.id === rule.id));
          renderRules();
        });
        const preview = h("span", { className: "rule-preview", ariaHidden: "true" }, "Aa");
        preview.style.background = rule.scale
          ? `linear-gradient(90deg, ${rule.scale.min}, ${rule.scale.max})`
          : (rule.style?.fill ?? "");
        preview.style.color = rule.style?.color ?? "";
        preview.style.fontWeight = rule.style?.bold ? "700" : "";
        return h("li", {}, preview, h("span", {}, describeRule(rule)), remove);
      }),
    );
  };

  const prepare = () => {
    field("range").value = rangeName(app.grid.range);
    status.textContent = "";
    showFields();
    renderRules();
  };

  dialog.addEventListener("command", prepare);
  field("condition").addEventListener("change", showFields);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const sheet = app.grid.sheet;
    const ref = parseRef(field("range").value);
    if (!ref || (ref.sheet && ref.sheet.toLowerCase() !== sheet.name.toLowerCase())) {
      status.textContent = "Enter a range on this sheet, like B2:B20.";
      return;
    }
    const condition = field("condition").value as RuleCondition;
    const text = field("value").value.trim();
    const value = text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
    const formula = field("formula").value.trim();
    let added = false;
    app.run(() => {
      app.wb.addRule(sheet, {
        range: refRange(ref, sheet.rows, sheet.cols),
        condition,
        ...(VALUE_CONDITIONS.includes(condition) && { value }),
        ...(condition === "between" && { value2: Number(field("value2").value) }),
        ...(condition === "formula" && {
          formula: formula.startsWith("=") ? formula : `=${formula}`,
        }),
        ...(condition === "color_scale"
          ? { scale: { min: field("min").value, max: field("max").value } }
          : {
              style: {
                color: field("color").value,
                fill: field("fill").value,
                ...(field("bold").checked && { bold: true }),
              },
            }),
      });
      added = true;
    });
    if (added) {
      renderRules();
      status.textContent = "Rule added.";
    }
  });

  return {
    open() {
      prepare();
      if (!dialog.open) dialog.showModal();
    },
  };
}
