/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The cell editor and the formula bar: one edit session shown in both, with function
 * autocomplete, colored boxes on the cells a formula refers to, and click-to-insert references.
 */
import { cellName, rangeName, refRange, type Range } from "../engine/address.ts";
import { editText } from "../engine/format.ts";
import { FUNCTION_NAMES, FUNCTIONS } from "../engine/functions.ts";
import { tokenize } from "../engine/tokenizer.ts";
import type { Sheet, Workbook } from "../model/workbook.ts";
import { $, h } from "./dom.ts";
import type { Box, GridView, Point } from "./grid.ts";

export type Move = "up" | "down" | "left" | "right";

export interface EditorHost {
  readonly wb: Workbook;
  readonly grid: GridView;
  /** Stores what was typed (one undo step). */
  write(sheet: Sheet, at: Point, text: string): void;
  /** After a commit or cancel: move the selection and give focus back to the grid. */
  after(move: Move | null): void;
}

interface Session {
  sheet: Sheet;
  at: Point;
  /** "enter": typing replaced the cell, so arrow keys commit. "edit": arrows move the caret. */
  mode: "enter" | "edit";
  original: string;
  /** The reference inserted by clicking cells, replaced while the pointer drags. */
  inserted?: { start: number; end: number };
}

const OPERAND_EXPECTED = /[=(,+\-*/^&<>:]$/;
const FUNCTION_PREFIX = /(?:^=|[\s(,+\-*/^&=<>:])([A-Za-z][A-Za-z0-9.]*)$/;

/** The function whose argument list the caret is in, if any. */
function enclosingCall(formulaBeforeCaret: string): string | null {
  const stack: (string | null)[] = [];
  let pending: string | null = null;
  for (const token of tokenize(formulaBeforeCaret.slice(1))) {
    if (token.type === "func") pending = token.name;
    else if (token.type === "lparen") {
      stack.push(pending);
      pending = null;
    } else if (token.type === "rparen") stack.pop();
  }
  return stack.findLast((name) => name !== null) ?? null;
}

export class Editor {
  readonly bar = $<HTMLInputElement>("#formula");
  private readonly list = $("#autocomplete");
  private readonly host: EditorHost;
  private input: HTMLInputElement | null = null;
  private session: Session | null = null;
  private suggestions: string[] = [];
  private highlighted = 0;

  constructor(host: EditorHost) {
    this.host = host;
    this.bar.setAttribute("role", "combobox");
    this.bar.setAttribute("aria-autocomplete", "list");
    this.bar.setAttribute("aria-controls", "autocomplete");
    this.bar.ariaExpanded = "false";
    this.bar.addEventListener("focus", () => {
      if (!this.session) this.start("edit", undefined, true);
    });
    this.wire(this.bar);
    // Keep focus in the input while a suggestion is clicked.
    this.list.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const option = (e.target as Element).closest<HTMLElement>("[role=option]");
      if (option) this.accept(Number(option.dataset.index));
    });
  }

  get active(): boolean {
    return this.session !== null;
  }

  /** Shows the active cell's contents in the formula bar while nothing is being edited. */
  sync(): void {
    if (this.session) return;
    const { wb, grid } = this.host;
    const { row, col } = grid.active;
    const cell = wb.cell(grid.sheet, row, col);
    this.bar.value = editText(cell?.v, cell?.f, cell?.fmt);
  }

  private wire(input: HTMLInputElement): void {
    input.addEventListener("input", () => {
      if (this.session) this.session.inserted = undefined;
      this.update(input);
    });
    input.addEventListener("keydown", (e) => this.key(e, input));
    input.addEventListener("click", () => this.update(input));
    input.addEventListener("focusout", (e) => {
      const next = e.relatedTarget as Node | null;
      if (next && (next === this.input || next === this.bar || this.list.contains(next))) return;
      this.commit(null, false);
    });
  }

  /** Opens the editor on the active cell, optionally replacing its contents with `initial`. */
  start(mode: Session["mode"], initial?: string, focusBar = false): void {
    if (this.session) return;
    const { wb, grid } = this.host;
    const at = { ...grid.active };
    const cell = wb.cell(grid.sheet, at.row, at.col);
    const original = editText(cell?.v, cell?.f, cell?.fmt);
    this.session = { sheet: grid.sheet, at, mode, original };
    const input = h("input", {
      className: "cell-editor",
      value: initial ?? original,
      autocomplete: "off",
      spellcheck: false,
      ariaLabel: `Edit ${cellName(at.row, at.col)}`,
    });
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", "autocomplete");
    this.wire(input);
    this.input = input;
    this.mount();
    this.bar.value = input.value;
    const target = focusBar ? this.bar : input;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
    this.update(target);
  }

  /** Puts the in-cell input into the active cell (again, after the grid rebuilt its DOM). */
  private mount(): void {
    const { grid } = this.host;
    if (!this.session || !this.input || this.session.sheet !== grid.sheet) return;
    const element = grid.cellAt(this.session.at);
    if (!element) return;
    grid.editing = element;
    element.classList.add("editing");
    element.replaceChildren(this.input);
  }

  rehost(): void {
    const hadFocus = document.activeElement === this.input;
    this.mount();
    if (hadFocus) this.input?.focus();
  }

  private get value(): string {
    return this.input?.value ?? this.bar.value;
  }

  commit(move: Move | null = null, refocus = true): void {
    const session = this.session;
    if (!session) return;
    const text = this.value;
    this.close();
    if (text !== session.original) this.host.write(session.sheet, session.at, text);
    if (refocus) this.host.after(move);
  }

  cancel(): void {
    if (!this.session) return;
    this.close();
    this.host.after(null);
  }

  private close(): void {
    const { grid } = this.host;
    const session = this.session!;
    this.session = null;
    const element = grid.editing;
    grid.editing = null;
    element?.classList.remove("editing");
    this.input?.remove();
    this.input = null;
    this.closeList();
    grid.setBoxes("refs", []);
    if (session.sheet === grid.sheet) {
      grid.repaint(session.at);
      grid.renderSelection();
    }
    this.sync();
  }

  private key(e: KeyboardEvent, input: HTMLInputElement): void {
    const session = this.session;
    if (!session || e.isComposing) return;
    if (this.list.matches(":popover-open") && this.suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        this.highlighted =
          (this.highlighted + step + this.suggestions.length) % this.suggestions.length;
        this.renderList(input);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        this.accept(this.highlighted);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.suggestions = [];
        this.closeList();
        return;
      }
    }
    const arrows: Record<string, Move> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    if (e.key === "Enter") {
      e.preventDefault();
      this.commit(e.shiftKey ? "up" : "down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.commit(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
    } else if (e.key === "F2") {
      e.preventDefault();
      session.mode = session.mode === "enter" ? "edit" : "enter";
    } else if (
      arrows[e.key] &&
      session.mode === "enter" &&
      input === this.input &&
      !input.value.startsWith("=")
    ) {
      e.preventDefault();
      this.commit(arrows[e.key]);
    }
  }

  /** Mirrors the text into the other input, then refreshes suggestions and reference boxes. */
  private update(input: HTMLInputElement): void {
    if (!this.session) return;
    const text = input.value;
    if (input === this.bar && this.input) this.input.value = text;
    else if (input === this.input) this.bar.value = text;
    if (!text.startsWith("=")) {
      this.suggestions = [];
      this.closeList();
      this.host.grid.setBoxes("refs", []);
      return;
    }
    this.highlightRefs(text);
    const before = text.slice(0, input.selectionStart ?? text.length);
    const prefix = FUNCTION_PREFIX.exec(before)?.[1].toUpperCase();
    const previous = this.suggestions[this.highlighted];
    this.suggestions = prefix
      ? FUNCTION_NAMES.filter((name) => name.startsWith(prefix)).slice(0, 8)
      : [];
    this.highlighted = Math.max(0, this.suggestions.indexOf(previous));
    this.renderList(input, enclosingCall(before));
  }

  private highlightRefs(text: string): void {
    const { grid } = this.host;
    const sheet = this.session!.sheet;
    if (sheet !== grid.sheet) return;
    const colors = new Map<string, number>();
    const boxes: Box[] = [];
    for (const token of tokenize(text.slice(1))) {
      if (token.type !== "ref") continue;
      if (token.ref.sheet && token.ref.sheet.toLowerCase() !== sheet.name.toLowerCase()) continue;
      const range = refRange(token.ref, sheet.rows, sheet.cols);
      const key = rangeName(range);
      if (!colors.has(key)) colors.set(key, colors.size);
      boxes.push({ range, color: `var(--ref-${colors.get(key)! % 6})` });
    }
    grid.setBoxes("refs", boxes);
  }

  private renderList(input: HTMLInputElement, call: string | null = null): void {
    const name = this.suggestions[this.highlighted] ?? call;
    const fn = name ? FUNCTIONS[name] : undefined;
    if (!this.suggestions.length && !fn) {
      this.closeList();
      return;
    }
    const options = this.suggestions.map((suggestion, index) =>
      h(
        "div",
        {
          id: `ac-${index}`,
          role: "option",
          ariaSelected: String(index === this.highlighted),
          dataset: { index: String(index) },
        },
        h("b", {}, suggestion),
        h("span", {}, FUNCTIONS[suggestion].description),
      ),
    );
    this.list.replaceChildren(
      ...options,
      ...(fn ? [h("p", { className: "syntax" }, fn.syntax)] : []),
    );
    for (const field of [this.bar, this.input]) field?.style.removeProperty("anchor-name");
    input.style.setProperty("anchor-name", "--editor");
    if (!this.list.matches(":popover-open")) this.list.showPopover();
    input.ariaExpanded = String(this.suggestions.length > 0);
    if (this.suggestions.length)
      input.setAttribute("aria-activedescendant", `ac-${this.highlighted}`);
    else input.removeAttribute("aria-activedescendant");
  }

  private closeList(): void {
    if (this.list.matches(":popover-open")) this.list.hidePopover();
    for (const field of [this.bar, this.input]) {
      if (!field) continue;
      field.ariaExpanded = "false";
      field.removeAttribute("aria-activedescendant");
    }
  }

  private accept(index: number): void {
    const name = this.suggestions[index];
    const input = document.activeElement === this.bar ? this.bar : this.input;
    if (!name || !input) return;
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret).replace(/[A-Za-z][A-Za-z0-9.]*$/, `${name}(`);
    input.value = before + input.value.slice(caret);
    input.setSelectionRange(before.length, before.length);
    this.suggestions = [];
    this.update(input);
  }

  /** Clicking cells while a formula expects a value inserts their reference. */
  pointRef(range: Range, phase: "start" | "move"): boolean {
    const session = this.session;
    const input = document.activeElement === this.bar ? this.bar : this.input;
    if (!session || !input || session.sheet !== this.host.grid.sheet) return false;
    const text = input.value;
    if (phase === "start") {
      const caret = input.selectionStart ?? text.length;
      if (!text.startsWith("=") || !OPERAND_EXPECTED.test(text.slice(0, caret).trimEnd()))
        return false;
      session.inserted = { start: caret, end: caret };
    }
    if (!session.inserted) return false;
    const ref = rangeName(range);
    input.value = text.slice(0, session.inserted.start) + ref + text.slice(session.inserted.end);
    session.inserted.end = session.inserted.start + ref.length;
    input.setSelectionRange(session.inserted.end, session.inserted.end);
    this.update(input);
    return true;
  }
}
