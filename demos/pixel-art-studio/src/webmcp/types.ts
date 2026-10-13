/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Change, Studio } from "../model";
import type { View } from "../view";

/** Before/after thumbnails of the region a tool call changed. */
export interface ChangeThumbs {
  before: HTMLCanvasElement;
  after: HTMLCanvasElement;
  x: number;
  y: number;
}

/** Activity feed rendered in the sidebar; one entry per tool call. */
export interface FeedApi<E = unknown> {
  start(name: string, input: ToolInput): E;
  done(entry: E, summary: string, thumbs?: ChangeThumbs): void;
  fail(entry: E, message: string): void;
}

/** App services the tools act on (injected via the factory pattern). */
export interface ToolContext {
  studio: Studio;
  view: View;
  feed: FeedApi<any>;
  refresh(): void;
}

/** The arguments an agent sends to a tool, shaped by the tool's `inputSchema`. */
export type ToolInput = Record<string, any>;
export type MaterializeOrder = "scan" | "random" | "radial";

/** What a tool's `execute` returns: the agent-facing `result` plus UI feedback hints. */
export interface ToolOutcome {
  result: unknown;
  /** Changed pixels to animate on the canvas. */
  changes?: Change[];
  order?: MaterializeOrder;
  /** Flash a "before" onion ghost over the changed area. */
  ghost?: boolean;
  /** Where the agent cursor points when nothing was painted. */
  focus?: [number, number];
  /** Short human-readable line for the activity feed. */
  summary?: string;
}

export interface JsonSchema {
  [key: string]: unknown;
}

/**
 * A tool in the shape of `WebMCP.ModelContextTool` (webmcp-types). The one difference:
 * `execute` returns a `ToolOutcome`, and `wrapTools()` in runtime.ts sends only its `result`
 * to the agent while it animates the changes and logs the call in the activity feed.
 */
export interface ToolSpec {
  name: string;
  description: string;
  /** Omitted by tools that take no input. */
  inputSchema?: JsonSchema;
  /**
   * Called with the agent's `input` and `{ signal }`, like WebMCP's `execute`. `signal`
   * aborts when the agent cancels the call: check it after every await, before painting.
   */
  execute(
    input: ToolInput,
    options: WebMCP.ToolExecuteCallbackOptions,
  ): ToolOutcome | Promise<ToolOutcome>;
  /** Every hint defaults to false and is opt-in: set one only when it is true. */
  annotations?: WebMCP.ToolAnnotations;
}
