/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Sheet tabs: click to switch, double-click or F2 to rename, right-click for more. */
import type { Sheet } from "../model/workbook.ts";
import type { App } from "./app.ts";
import { $, h } from "./dom.ts";

export class Tabs {
  private readonly root = $("#tabs");
  private readonly menu = $("#tab-menu");
  private readonly app: App;
  private menuSheet: Sheet | null = null;
  private renaming: Sheet | null = null;

  constructor(app: App) {
    this.app = app;
    $("#add-sheet").addEventListener("click", () =>
      app.run(() => {
        const sheet = app.wb.addSheet();
        app.showSheet(sheet);
      }),
    );
    this.root.addEventListener("click", (e) => {
      const sheet = this.sheetOf(e.target);
      if (sheet && sheet !== app.wb.active) app.showSheet(sheet);
    });
    this.root.addEventListener("dblclick", (e) => {
      const sheet = this.sheetOf(e.target);
      if (sheet) this.rename(sheet);
    });
    this.root.addEventListener("contextmenu", (e) => {
      const sheet = this.sheetOf(e.target);
      if (!sheet) return;
      e.preventDefault();
      this.openMenu(sheet, e.target as HTMLElement);
    });
    this.root.addEventListener("keydown", (e) => this.key(e));
    this.menu.addEventListener("click", (e) => {
      const command = (e.target as HTMLElement).closest<HTMLElement>("[data-tab-cmd]")?.dataset
        .tabCmd;
      const sheet = this.menuSheet;
      this.menu.hidePopover();
      if (!command || !sheet) return;
      const { wb } = app;
      if (command === "rename") this.rename(sheet);
      else if (command === "delete") app.run(() => wb.deleteSheet(sheet));
      else
        app.run(() =>
          wb.moveSheet(sheet, wb.sheets.indexOf(sheet) + (command === "left" ? -1 : 1)),
        );
    });
  }

  private sheetOf(target: EventTarget | null): Sheet | undefined {
    const id = (target as HTMLElement | null)?.closest<HTMLElement>("[role=tab]")?.dataset.id;
    return id ? this.app.wb.sheetById(id) : undefined;
  }

  render(): void {
    if (this.renaming) return;
    const { wb } = this.app;
    const hadFocus = this.root.contains(document.activeElement);
    this.root.replaceChildren(
      ...wb.sheets.map((sheet) => {
        const active = sheet === wb.active;
        const tab = h(
          "button",
          {
            type: "button",
            role: "tab",
            className: "tab",
            ariaSelected: String(active),
            tabIndex: active ? 0 : -1,
            dataset: { id: sheet.id },
          },
          sheet.name,
        );
        tab.setAttribute("aria-controls", "grid");
        return tab;
      }),
    );
    if (hadFocus) this.root.querySelector<HTMLElement>("[aria-selected=true]")?.focus();
  }

  private openMenu(sheet: Sheet, tab: HTMLElement): void {
    this.menuSheet = sheet;
    const rect = tab.getBoundingClientRect();
    this.app.placePointerAnchor(rect.left, rect.top);
    this.menu.showPopover();
  }

  private key(e: KeyboardEvent): void {
    const sheet = this.sheetOf(e.target);
    if (!sheet || this.renaming) return;
    const { wb } = this.app;
    const index = wb.sheets.indexOf(sheet);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? wb.sheets.length - 1
            : (index + step + wb.sheets.length) % wb.sheets.length;
      this.app.showSheet(wb.sheets[next]);
      this.root.querySelector<HTMLElement>(`[data-id="${wb.sheets[next].id}"]`)?.focus();
    } else if (e.key === "F2") {
      e.preventDefault();
      this.rename(sheet);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      this.openMenu(sheet, e.target as HTMLElement);
    }
  }

  /** Swaps the tab for a text field; Enter or leaving the field renames, Escape cancels. */
  private rename(sheet: Sheet): void {
    const tab = this.root.querySelector<HTMLElement>(`[data-id="${sheet.id}"]`);
    if (!tab) return;
    this.renaming = sheet;
    const input = h("input", {
      className: "tab-input",
      value: sheet.name,
      ariaLabel: "Sheet name",
      spellcheck: false,
    });
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      this.renaming = null;
      if (save && input.value.trim() !== sheet.name)
        this.app.run(() => this.app.wb.renameSheet(sheet, input.value));
      this.render();
      this.root.querySelector<HTMLElement>(`[data-id="${sheet.id}"]`)?.focus();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    tab.replaceWith(input);
    input.focus();
    input.select();
  }
}
