/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { resolveSafePath } from "../eval-viewer/security.js";
import { type Content, type FunctionDeclaration, type Part, generateTurn } from "./provider.js";
import type { Timing } from "./types.js";

export const DEFAULT_MAX_TURNS = 8;

/** Sent with the last tool results so the model answers on the final turn. */
export const FINAL_TURN_NOTICE =
  "File-read limit reached. Do not call any more tools; write your final answer now using the information you already have.";

/** Files larger than this are truncated before being returned to the model. */
const MAX_FILE_CHARS = 100_000;

export const READ_FILE_TOOL: FunctionDeclaration = {
  name: "read_file",
  description:
    "Reads a UTF-8 text file from the workspace by its relative path. Use to load referenced documentation or project files before answering. Call it several times in one turn to read multiple files at once.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative file path, e.g. docs/guide.md or src/app.ts",
      },
    },
    required: ["path"],
  },
};

/**
 * Defines which files the model may read. All paths are resolved relative to `baseDir`.
 */
export interface FileAccessPolicy {
  baseDir: string;
  /** Allow any file under baseDir, except those under `excludeDirs`. */
  allowTree: boolean;
  /** Relative directories blocked when `allowTree` is true (e.g. "evals" to hide assertions). */
  excludeDirs?: string[];
  /** Relative files that are always readable, even when `allowTree` is false or excluded. */
  allowedFiles?: string[];
}

export type ReadResolution =
  | { ok: true; absolutePath: string; relativePath: string }
  | { ok: false; error: string };

/**
 * Normalizes a relative path to forward slashes without a leading "./".
 */
export function normalizeRelativePath(p: string): string {
  return p
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "");
}

/**
 * Resolves a model-requested path against the access policy, blocking absolute paths,
 * directory traversal, symlink escapes, and files outside the allowed set.
 */
export function resolveReadablePath(policy: FileAccessPolicy, requested: unknown): ReadResolution {
  if (typeof requested !== "string" || !requested.trim()) {
    return { ok: false, error: "A non-empty relative 'path' string is required." };
  }

  const normalized = normalizeRelativePath(requested);
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith("/")) {
    return { ok: false, error: `Absolute paths are not allowed: ${requested}` };
  }

  const baseDir = path.resolve(policy.baseDir);
  const absolutePath = resolveSafePath(baseDir, normalized);
  if (!absolutePath) {
    return { ok: false, error: `Access denied: ${requested} is outside the workspace.` };
  }

  const relativePath = path.relative(baseDir, absolutePath).split(path.sep).join("/");
  const allowedFiles = (policy.allowedFiles ?? []).map(normalizeRelativePath);
  const excluded = (policy.excludeDirs ?? [])
    .map(normalizeRelativePath)
    .some((dir) => relativePath === dir || relativePath.startsWith(`${dir}/`));

  const permitted = allowedFiles.includes(relativePath) || (policy.allowTree && !excluded);
  if (!permitted) {
    return { ok: false, error: `Access denied: ${requested} is not available.` };
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return { ok: false, error: `File not found: ${requested}` };
  }

  return { ok: true, absolutePath, relativePath };
}

export interface AgentLoopOptions {
  systemInstruction?: string;
  model?: string;
  mock?: boolean;
  access: FileAccessPolicy;
  maxTurns?: number;
}

export interface AgentLoopResult {
  text: string;
  timing: Timing;
  turns: number;
  filesRead: string[];
}

/**
 * Runs a short tool-calling loop in which the model may read files via `read_file`
 * before producing its final text answer. The last allowed turn requests a text-only reply;
 * if the model still calls tools, the calls are declined and it is asked once more.
 */
export async function runAgentLoop(
  prompt: string,
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const maxTurns =
    Number.isInteger(options.maxTurns) && (options.maxTurns as number) > 0
      ? (options.maxTurns as number)
      : DEFAULT_MAX_TURNS;

  const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
  const filesRead: string[] = [];
  const timing: Timing = { duration_ms: 0, total_tokens: 0, prompt_tokens: 0, candidate_tokens: 0 };

  const generate = async (mode: "AUTO" | "NONE") => {
    const result = await generateTurn(contents, {
      model: options.model,
      systemInstruction: options.systemInstruction,
      mock: options.mock,
      tools: [READ_FILE_TOOL],
      functionCallingMode: mode,
    });
    timing.duration_ms += result.timing.duration_ms;
    timing.total_tokens += result.timing.total_tokens;
    timing.prompt_tokens = (timing.prompt_tokens ?? 0) + (result.timing.prompt_tokens ?? 0);
    timing.candidate_tokens =
      (timing.candidate_tokens ?? 0) + (result.timing.candidate_tokens ?? 0);
    return result;
  };

  for (let turn = 1; turn <= maxTurns; turn++) {
    const isFinalTurn = turn === maxTurns;
    const result = await generate(isFinalTurn ? "NONE" : "AUTO");

    const calls = result.parts.filter((p) => p.functionCall);
    if (calls.length === 0) {
      return { text: result.text, timing, turns: turn, filesRead };
    }

    // Echo the model turn verbatim (preserves thought signatures), then answer each call
    contents.push({ role: "model", parts: result.parts });

    if (isFinalTurn) {
      // Gemini can ignore mode NONE; decline the calls and ask once more for a text answer
      contents.push({
        role: "user",
        parts: [...calls.map((call) => declineFunctionCall(call)), { text: FINAL_TURN_NOTICE }],
      });
      const retry = await generate("NONE");
      return { text: retry.text, timing, turns: turn + 1, filesRead };
    }

    const parts = calls.map((call) => answerFunctionCall(call, options.access, filesRead));
    if (turn === maxTurns - 1) {
      parts.push({ text: FINAL_TURN_NOTICE });
    }
    contents.push({ role: "user", parts });
  }

  // Unreachable: the final turn always returns
  return { text: "", timing, turns: maxTurns, filesRead };
}

function declineFunctionCall(call: Part): Part {
  const { id, name } = call.functionCall!;
  return {
    functionResponse: {
      ...(id ? { id } : {}),
      name,
      response: { error: "File-read limit reached; no more files can be read." },
    },
  };
}

function answerFunctionCall(call: Part, access: FileAccessPolicy, filesRead: string[]): Part {
  const { id, name, args } = call.functionCall!;
  const respond = (response: Record<string, unknown>): Part => ({
    functionResponse: { ...(id ? { id } : {}), name, response },
  });

  if (name !== READ_FILE_TOOL.name) {
    return respond({ error: `Unknown function: ${name}` });
  }

  const resolution = resolveReadablePath(access, args?.path);
  if (!resolution.ok) {
    return respond({ error: resolution.error });
  }

  let content = fs.readFileSync(resolution.absolutePath, "utf8");
  if (content.length > MAX_FILE_CHARS) {
    content = `${content.slice(0, MAX_FILE_CHARS)}\n[truncated]`;
  }
  if (!filesRead.includes(resolution.relativePath)) {
    filesRead.push(resolution.relativePath);
  }
  return respond({ content });
}
