/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Wraps tool specs with user-visible feedback and registers them with WebMCP. */
import type { ChangeThumbs, ToolContext, ToolInput, ToolOutcome, ToolSpec } from "./types";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Accept the input object (Chrome 155+) or a JSON string (older builds). */
function normalizeInput(raw: unknown): ToolInput {
  if (raw && typeof raw === "object") return raw as ToolInput;
  if (typeof raw === "string" && raw.trim()) {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as ToolInput;
  }
  return {};
}

/**
 * Turn a spec into a WebMCP tool. Every call is logged in the activity feed, painted changes
 * materialize on the canvas with an agent cursor, and the call resolves only after the UI
 * reflects the new state. Errors are returned as `{ ok: false, error }` so agents can retry.
 */
function wrap(spec: ToolSpec, ctx: ToolContext): WebMCP.ModelContextTool {
  const { studio, view, feed } = ctx;
  const present = (outcome: ToolOutcome, before: Uint32Array): ChangeThumbs | undefined => {
    if (!outcome.changes?.length) {
      const [fx, fy] = outcome.focus ?? [studio.w / 2, studio.h / 2];
      view.pointAgent(fx, fy, spec.name);
      return undefined;
    }
    view.materialize(outcome.changes, before, outcome.order);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -1,
      y1 = -1;
    for (const { i } of outcome.changes) {
      const x = i % studio.w,
        y = (i / studio.w) | 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    const thumbs = {
      before: studio.toCanvas(1, before, x0, y0, w, h),
      after: studio.toCanvas(1, studio.composite, x0, y0, w, h),
      x: x0,
      y: y0,
    };
    view.pointAgent((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, spec.name);
    if (outcome.ghost) view.ghost(thumbs.before, x0, y0);
    return thumbs;
  };

  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    async execute(rawInput, options) {
      // Builds that pass a JSON string (see normalizeInput) do not pass options either.
      const signal = options?.signal ?? new AbortController().signal;
      let input: ToolInput = {};
      let entry: unknown;
      try {
        input = normalizeInput(rawInput);
        entry = feed.start(spec.name, input);
        signal.throwIfAborted();
        const before = studio.composite.slice();
        const outcome = await spec.execute(input, { signal });
        feed.done(entry, outcome.summary ?? "ok", present(outcome, before));
        return outcome.result;
      } catch (error) {
        // The agent drops the result of a cancelled call, but the feed still shows it.
        const message = signal.aborted ? "Cancelled" : errorMessage(error);
        feed.fail(entry ?? feed.start(spec.name, input), message);
        return { ok: false, error: message };
      } finally {
        ctx.refresh();
      }
    },
    // Always an object (even with no hints set), so getTools() reports every hint as false
    // instead of leaving `annotations` undefined.
    annotations: spec.annotations ?? {},
  };
}

export const wrapTools = (specs: ToolSpec[], ctx: ToolContext): WebMCP.ModelContextTool[] =>
  specs.map((spec) => wrap(spec, ctx));

export interface Registration {
  supported: boolean;
  count: number;
  /** Abort to unregister every tool (e.g. on HMR dispose). */
  controller: AbortController;
}

/** Feature-detect `document.modelContext` and register each tool with a shared AbortSignal. */
export async function registerTools(tools: WebMCP.ModelContextTool[]): Promise<Registration> {
  const controller = new AbortController();
  const modelContext = document.modelContext;
  if (!modelContext) return { supported: false, count: 0, controller };
  const results = await Promise.allSettled(
    tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected")
      console.warn("[pixel-art-studio] registerTool failed:", tools[index].name, result.reason);
  });
  return {
    supported: true,
    count: results.filter((result) => result.status === "fulfilled").length,
    controller,
  };
}
