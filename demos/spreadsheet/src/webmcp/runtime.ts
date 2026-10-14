/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Turns tool specs into WebMCP tools. Input is checked against the tool's schema first, each
 * call is one undo step and one entry in the activity panel, and errors come back as
 * `{ error }` so the agent can read them and try again.
 */
import { SpreadsheetError, type Sheet, type Workbook } from "../model/workbook.ts";
import type { ActivityEntry, Target } from "../ui/activity.ts";
import { validate } from "./schema.ts";

/** What the tools need from the app. */
export interface ToolHost {
  readonly wb: Workbook;
  readonly activity: { start(tool: string, input: unknown): ActivityEntry };
  /** What the person has selected, and the active cell in it. */
  selection(): Target & { active: { row: number; col: number } };
  /** Shows a sheet and selects a range on it. */
  reveal(target: Target): void;
  /** Width in pixels that fits the widest value in a column. */
  fitWidth(sheet: Sheet, col: number): number;
}

/** What a tool returns: the result for the agent, plus a summary and the cells to show people. */
export interface Outcome {
  result: Record<string, unknown>;
  summary: string;
  target?: Target;
  /** Also select `target` for the person, once the edit is done. */
  select?: boolean;
}

/** The input webmcp-types infers from a schema. It isn't exported, so it's read from `execute`. */
type SchemaInput<S extends object> = Parameters<WebMCP.ModelContextToolFromSchema<S>["execute"]>[0];
type Defaulted<S> = S extends { readonly properties: infer P }
  ? { [K in keyof P]: P[K] extends { readonly default: unknown } ? K : never }[keyof P]
  : never;
/** The input a tool gets, inferred from its schema; parameters with a default are always set. */
export type ToolInput<S extends object> = SchemaInput<S> &
  Required<Pick<SchemaInput<S>, Defaulted<S> & keyof SchemaInput<S>>>;

/**
 * A `WebMCP.ModelContextTool` whose input is typed from its `inputSchema`. The one difference:
 * `execute` returns an `Outcome`, and `toWebMCP` sends only its `result` to the agent.
 */
export interface ToolSpec<S extends object = object> extends Pick<
  WebMCP.ModelContextTool,
  "name" | "description" | "annotations"
> {
  /** Left out by tools that take no input. */
  inputSchema?: S;
  execute(input: ToolInput<S>): Outcome;
}

/** Keeps the schema's literal type, so `execute` gets typed input. */
export const defineTool = <const S extends object = Record<string, never>>(
  spec: ToolSpec<S>,
): ToolSpec<S> => spec;

const NO_INPUT = { type: "object", properties: {} } as const;

/** "sort_range" → "Sort range": the tool's title and its undo label. */
const titleOf = (name: string): string =>
  name[0].toUpperCase() + name.slice(1).replaceAll("_", " ");

export function toWebMCP(spec: ToolSpec, host: ToolHost): WebMCP.ModelContextTool {
  const title = titleOf(spec.name);
  return {
    name: spec.name,
    title,
    description: spec.description,
    ...(spec.inputSchema && { inputSchema: spec.inputSchema }),
    // Tools finish synchronously, so a call can't be cancelled partway through.
    execute(input) {
      const entry = host.activity.start(spec.name, input);
      try {
        const checked = validate(spec.inputSchema ?? NO_INPUT, input);
        if ("error" in checked) throw new SpreadsheetError(checked.error);
        const outcome = host.wb.transact(title, () => spec.execute(checked.value), "agent");
        if (outcome.select && outcome.target) host.reveal(outcome.target);
        entry.done(outcome.summary, outcome.target);
        return outcome.result;
      } catch (error) {
        if (!(error instanceof SpreadsheetError))
          console.error(`[spreadsheet] ${spec.name} failed:`, error);
        const message =
          error instanceof SpreadsheetError
            ? error.message
            : `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
        entry.fail(message);
        return { ...(error instanceof SpreadsheetError && error.details), error: message };
      }
    },
    ...(spec.annotations && { annotations: spec.annotations }),
  };
}

export interface Registration {
  supported: boolean;
  count: number;
}

/**
 * Registers the tools when the browser has WebMCP; one failed registration doesn't stop the
 * others. The tools stay registered for the life of the page.
 */
export async function registerTools(tools: WebMCP.ModelContextTool[]): Promise<Registration> {
  const modelContext = document.modelContext;
  if (!modelContext) return { supported: false, count: 0 };
  const results = await Promise.allSettled(tools.map((tool) => modelContext.registerTool(tool)));
  results.forEach((result, i) => {
    if (result.status === "rejected")
      console.warn("[spreadsheet] registerTool failed:", tools[i].name, result.reason);
  });
  return {
    supported: true,
    count: results.filter((result) => result.status === "fulfilled").length,
  };
}
