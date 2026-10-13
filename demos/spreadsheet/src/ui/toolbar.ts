/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** The toolbar and the popover menus: commands, color swatches, pressed states and arrow-key focus. */
import type { NumberFormat } from "../engine/format.ts";
import type { App } from "./app.ts";
import type { Commands } from "./commands.ts";
import { $, h } from "./dom.ts";

const SWATCHES: [string, string][] = [
  ["Black", "#1c1b21"],
  ["Dark gray", "#4a4952"],
  ["Gray", "#8e8b96"],
  ["Light gray", "#d9d6cf"],
  ["White", "#ffffff"],
  ["Indigo", "#4d48d8"],
  ["Blue", "#1f7fc4"],
  ["Teal", "#0f8f86"],
  ["Green", "#3f8a2a"],
  ["Amber", "#d08a0a"],
  ["Orange", "#e8740c"],
  ["Red", "#b42318"],
  ["Rose", "#d6335f"],
  ["Violet", "#8b3fd9"],
  ["Brown", "#8a5a3c"],
  ["Light indigo", "#e8e6ff"],
  ["Light teal", "#d4f2ed"],
  ["Light amber", "#ffefc2"],
  ["Light orange", "#ffe4cc"],
  ["Light rose", "#ffdfe7"],
];

/** The number format button's label for each format. */
const FORMAT_LABELS: Record<NumberFormat, string> = {
  general: "Auto",
  number: "Number",
  currency: "Currency",
  percent: "Percent",
  date: "Date",
  time: "Time",
  datetime: "Date & time",
  text: "Text",
};

/** One tab stop for a group of buttons; arrow keys move between them (ARIA toolbar and menu patterns). */
export function rovingFocus(
  container: HTMLElement,
  selector: string,
  keys: [string, string],
): void {
  const items = () =>
    [...container.querySelectorAll<HTMLElement>(selector)].filter(
      (item) => !item.hidden && item.checkVisibility(),
    );
  const current = (item: HTMLElement) =>
    items().forEach((other) => (other.tabIndex = other === item ? 0 : -1));
  const first = items()[0];
  if (first) current(first);
  container.addEventListener("focusin", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (item) current(item);
  });
  container.addEventListener("keydown", (e) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const next =
      e.key === keys[1]
        ? list[(index + 1) % list.length]
        : e.key === keys[0]
          ? list[(index - 1 + list.length) % list.length]
          : e.key === "Home"
            ? list[0]
            : e.key === "End"
              ? list[list.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    next.focus();
  });
}

function swatches(menu: HTMLElement, command: string): void {
  const reset = h(
    "button",
    { type: "button", role: "menuitem", className: "reset", dataset: { cmd: command, value: "" } },
    "Reset",
  );
  const grid = SWATCHES.map(([name, hex]) =>
    h("button", {
      type: "button",
      role: "menuitem",
      className: "swatch",
      ariaLabel: name,
      title: name,
      dataset: { cmd: command, value: hex },
      style: { background: hex },
    }),
  );
  const custom = h("input", { type: "color", ariaLabel: "Custom color", value: "#4d48d8" });
  const apply = h(
    "button",
    {
      type: "button",
      role: "menuitem",
      className: "reset",
      dataset: { cmd: command, value: custom.value },
    },
    "Custom…",
  );
  custom.addEventListener("input", () => (apply.dataset.value = custom.value));
  menu.append(
    reset,
    h("div", { className: "swatch-grid" }, ...grid),
    h("div", { className: "custom" }, custom, apply),
  );
}

export function setupToolbar(app: App, commands: Commands): { sync(): void } {
  const toolbar = $("#toolbar");
  swatches($("#text-color-menu"), "text-color");
  swatches($("#fill-color-menu"), "fill-color");

  document.addEventListener("click", (e) => {
    const button = (e.target as Element).closest<HTMLElement>("[data-cmd]");
    if (!button || !button.isConnected) return;
    button.closest<HTMLElement>("[popover]")?.hidePopover();
    commands[button.dataset.cmd!]?.(button.dataset.value);
    // Pointer clicks hand focus back to the sheet; keyboard users stay where they were.
    if (e.detail > 0 || button.closest("[popover]")) app.focusGrid();
  });

  rovingFocus(toolbar, "button", ["ArrowLeft", "ArrowRight"]);
  for (const menu of document.querySelectorAll<HTMLElement>(".menu")) {
    rovingFocus(menu, "button, input", ["ArrowUp", "ArrowDown"]);
    menu.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState === "open")
        menu.querySelector<HTMLElement>("button")?.focus();
    });
  }

  const pressed = (cmd: string, on: boolean) =>
    toolbar.querySelector(`[data-cmd="${cmd}"]`)?.setAttribute("aria-pressed", String(on));
  const undo = $<HTMLButtonElement>('[data-cmd="undo"]', toolbar);
  const redo = $<HTMLButtonElement>('[data-cmd="redo"]', toolbar);
  const numberFormat = $("#numfmt-label", toolbar);
  return {
    sync() {
      const { wb, grid } = app;
      const fmt = wb.cell(grid.sheet, grid.active.row, grid.active.col)?.fmt ?? {};
      pressed("bold", !!fmt.bold);
      pressed("italic", !!fmt.italic);
      pressed("underline", !!fmt.underline);
      pressed("strike", !!fmt.strike);
      for (const side of ["left", "center", "right"] as const)
        pressed(`align-${side}`, fmt.align === side);
      numberFormat.textContent = FORMAT_LABELS[fmt.numFmt ?? "general"];
      $("#text-color-bar").style.background = fmt.color ?? "currentColor";
      $("#fill-color-bar").style.background = fmt.fill ?? "transparent";
      undo.ariaDisabled = String(!wb.undoLabel);
      redo.ariaDisabled = String(!wb.redoLabel);
      undo.ariaLabel = wb.undoLabel ? `Undo ${wb.undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)";
      redo.ariaLabel = wb.redoLabel ? `Redo ${wb.redoLabel} (Ctrl+Y)` : "Redo (Ctrl+Y)";
    },
  };
}
