/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What the agent does, made visible: an activity feed of tool calls, a labeled box on the
 * cells the agent changed (like a collaborator's cursor), and screen reader announcements.
 */
import { qualifiedName, type Range } from "../engine/address.ts";
import type { Sheet } from "../model/workbook.ts";
import type { App } from "./app.ts";
import { $, h, reducedMotion } from "./dom.ts";

export interface Target {
  sheet: Sheet;
  range: Range;
}

/** One tool call in the feed, finished with `done` or `fail`. */
export interface ActivityEntry {
  done(summary: string, target?: Target): void;
  fail(message: string): void;
}

const FEED_LIMIT = 100;
const PRESENCE_MS = 4000;

function preview(input: unknown): string {
  const text = JSON.stringify(input) ?? "";
  return text === "{}" ? "" : text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

export class Activity {
  private readonly feed = $("#feed");
  private readonly empty = $("#feed-empty");
  private readonly followBox = $<HTMLInputElement>("#follow");
  private readonly announcer = $("#announcer");
  private readonly app: App;
  private presenceTimer = 0;
  private announceTimer = 0;
  private pending: string[] = [];

  constructor(app: App) {
    this.app = app;
  }

  /** Follow mode: show the sheet and cells the agent works on. */
  get follow(): boolean {
    return this.followBox.checked;
  }

  start(tool: string, input: unknown): ActivityEntry {
    const args = preview(input);
    const summary = h("p", { className: "summary" }, "Running…");
    const time = h("time", {}, "…");
    const element = h(
      "li",
      { className: "entry running" },
      h("div", { className: "entry-head" }, h("code", { className: "tool" }, tool), time),
      summary,
      ...(args ? [h("code", { className: "args" }, args)] : []),
    );
    this.empty.hidden = true;
    this.feed.prepend(element);
    while (this.feed.children.length > FEED_LIMIT) this.feed.lastElementChild!.remove();
    const started = performance.now();
    const finish = (state: "done" | "failed", text: string) => {
      element.classList.replace("running", state);
      time.textContent = `${Math.round(performance.now() - started)} ms`;
      summary.textContent = text;
    };
    return {
      done: (text, target) => {
        finish("done", text);
        if (target) {
          const reveal = h(
            "button",
            { type: "button", className: "reveal" },
            qualifiedName(target.sheet.name, target.range),
          );
          reveal.addEventListener("click", () => this.app.reveal(target));
          summary.append(" · ", reveal);
          this.presence(tool, target);
        }
        this.announce(`Agent: ${text}`);
      },
      fail: (message) => {
        finish("failed", message);
        this.announce(`Agent tool ${tool} failed: ${message}`);
      },
    };
  }

  /** A labeled box on the agent's last change; it fades like a collaborator's cursor. */
  private presence(tool: string, target: Target): void {
    const { grid } = this.app;
    if (this.follow && target.sheet !== grid.sheet) this.app.showSheet(target.sheet);
    if (target.sheet !== grid.sheet) return;
    grid.setBoxes("agent", [{ range: target.range, label: `Agent · ${tool}` }]);
    for (const animation of grid.boxElement("agent", 0)?.getAnimations() ?? []) {
      animation.cancel();
      animation.play();
    }
    if (this.follow) grid.reveal({ row: target.range.r1, col: target.range.c1 });
    clearTimeout(this.presenceTimer);
    this.presenceTimer = window.setTimeout(
      () => grid.setBoxes("agent", []),
      reducedMotion() ? PRESENCE_MS / 2 : PRESENCE_MS,
    );
  }

  /** One polite live region; bursts of tool calls are read as one message. */
  private announce(text: string): void {
    this.pending.push(text);
    clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => {
      this.announcer.textContent = this.pending.slice(-3).join(". ");
      this.pending = [];
    }, 500);
  }
}
