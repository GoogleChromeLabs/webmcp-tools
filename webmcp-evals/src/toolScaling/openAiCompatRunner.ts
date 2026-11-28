/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SYSTEM_PROMPT } from "../evaluator/prompts.js";
import {
  buildFailedTrialRecord,
  loadCompletedTrialIds,
  scoreTrialExecution,
  type ParsedToolCall,
} from "./geminiRunner.js";
import type {
  BenchmarkTool,
  GeminiUsageRecord,
  ScalingTrialSpec,
  TrialExecutionRecord,
} from "./types.js";

export type OpenAiCompatProvider = "openrouter" | "groq";

export interface OpenAiCompatRunnerOptions {
  provider: OpenAiCompatProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  delayMs?: number;
  maxRetries?: number;
  checkpointPath: string;
  resume?: boolean;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  onTrialComplete?: (record: TrialExecutionRecord, index: number, total: number) => void;
}

const PROVIDER_URLS: Record<OpenAiCompatProvider, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function resolveApiKey(provider: OpenAiCompatProvider, explicit?: string): string {
  if (explicit) return explicit;
  const key = provider === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error(
      `Missing ${provider === "openrouter" ? "OPENROUTER_API_KEY" : "GROQ_API_KEY"} in environment.`,
    );
  }
  return key;
}

export function toOpenAiTools(tools: readonly BenchmarkTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters:
        t.inputSchema && Object.keys(t.inputSchema).length > 0
          ? t.inputSchema
          : { type: "object", properties: {} },
    },
  }));
}

function extractOpenAiUsage(usage: any): GeminiUsageRecord {
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    promptTokenCount: numOrNull(usage?.prompt_tokens),
    toolUsePromptTokenCount: null,
    candidatesTokenCount: numOrNull(usage?.completion_tokens),
    thoughtsTokenCount: numOrNull(usage?.completion_tokens_details?.reasoning_tokens),
    cachedContentTokenCount: numOrNull(usage?.prompt_tokens_details?.cached_tokens),
    totalTokenCount: numOrNull(usage?.total_tokens),
  };
}

function parseOpenAiToolCalls(rawCalls: unknown): ParsedToolCall[] {
  if (!Array.isArray(rawCalls)) return [];
  const parsed: ParsedToolCall[] = [];
  for (const tc of rawCalls) {
    const fnName = (tc as any)?.function?.name;
    if (typeof fnName !== "string" || fnName.length === 0) continue;
    const rawArgs = (tc as any)?.function?.arguments;
    if (rawArgs === undefined || rawArgs === null || rawArgs === "") {
      parsed.push({ functionName: fnName, args: {}, argsParseValid: true });
    } else if (typeof rawArgs === "string") {
      try {
        const obj = JSON.parse(rawArgs);
        parsed.push({
          functionName: fnName,
          args: obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {},
          argsParseValid: obj !== null && typeof obj === "object" && !Array.isArray(obj),
        });
      } catch {
        parsed.push({ functionName: fnName, args: {}, argsParseValid: false });
      }
    } else if (typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
      parsed.push({ functionName: fnName, args: rawArgs as Record<string, unknown> });
    } else {
      parsed.push({ functionName: fnName, args: {}, argsParseValid: false });
    }
  }
  return parsed;
}

function classifyHttpFailure(
  status: number,
  bodyText: string,
  retryAfterHeader: string | null,
): { kind: "daily_quota" | "transient" | "fatal"; retryDelayMs: number | null; message: string } {
  const lower = bodyText.toLowerCase();
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 413) {
    return { kind: "fatal", retryDelayMs: null, message: `HTTP ${status}: ${bodyText}` };
  }
  if (
    status === 402 ||
    lower.includes("perday") ||
    lower.includes("per_day") ||
    lower.includes("daily") ||
    lower.includes("insufficient_quota")
  ) {
    return { kind: "daily_quota", retryDelayMs: null, message: `HTTP ${status}: ${bodyText}` };
  }
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    const retrySec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const retryDelayMs = Number.isFinite(retrySec) && retrySec > 0 ? retrySec * 1000 : null;
    return { kind: "transient", retryDelayMs, message: `HTTP ${status}: ${bodyText}` };
  }
  return { kind: "fatal", retryDelayMs: null, message: `HTTP ${status}: ${bodyText}` };
}

/** Runs `ScalingTrialSpec[]` against an OpenAI-compatible Chat Completions endpoint (OpenRouter / Groq). */
export async function runOpenAiCompatTrials(
  trials: readonly ScalingTrialSpec[],
  options: OpenAiCompatRunnerOptions,
): Promise<{ records: TrialExecutionRecord[]; stoppedOnDailyQuota: boolean }> {
  const apiKey = resolveApiKey(options.provider, options.apiKey);
  const endpoint = options.baseUrl ?? PROVIDER_URLS[options.provider];
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleepFn ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 3;
  const delayMs = options.delayMs ?? 1500;
  mkdirSync(dirname(options.checkpointPath), { recursive: true });

  const completedMap = options.resume ? loadCompletedTrialIds(options.checkpointPath) : new Map();
  const results: TrialExecutionRecord[] = [];
  let stoppedOnDailyQuota = false;

  for (let idx = 0; idx < trials.length; idx++) {
    const trial = trials[idx];
    const existing = completedMap.get(trial.trialId);
    if (existing) {
      results.push(existing);
      continue;
    }

    const payload = {
      model: options.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: trial.intent.prompt },
      ],
      tools: toOpenAiTools(trial.tools),
      tool_choice: "auto",
      temperature: 0,
    };

    let attempt = 0;
    let record: TrialExecutionRecord | null = null;

    while (attempt <= maxRetries) {
      const startMs = performance.now();
      try {
        const resp = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const latencyMs = Math.round(performance.now() - startMs);

        if (!resp.ok) {
          const errBody = await resp.text();
          const classified = classifyHttpFailure(
            resp.status,
            errBody.slice(0, 500),
            resp.headers.get("retry-after"),
          );
          if (classified.kind === "transient" && attempt < maxRetries) {
            attempt++;
            const jitter = Math.floor(Math.random() * 500);
            const backoffMs =
              classified.retryDelayMs ?? Math.min(30_000, 1500 * 2 ** attempt) + jitter;
            await sleep(backoffMs);
            continue;
          }
          const status = classified.kind === "daily_quota" ? "quota_exhausted" : "api_error";
          record = buildFailedTrialRecord({
            trial,
            modelRequested: options.model,
            thinkingBudget: null,
            status,
            errorMessage: classified.message,
            latencyMs,
            schemaOverheadTokens: null,
          });
          if (classified.kind === "daily_quota") stoppedOnDailyQuota = true;
          break;
        }

        const data = (await resp.json()) as any;
        const calls = parseOpenAiToolCalls(data?.choices?.[0]?.message?.tool_calls);
        record = scoreTrialExecution({
          trial,
          calls,
          modelRequested: options.model,
          modelVersion: typeof data?.model === "string" ? data.model : options.model,
          thinkingBudget: null,
          latencyMs,
          usage: extractOpenAiUsage(data?.usage),
          schemaOverheadTokens: null,
        });
        break;
      } catch (err) {
        const latencyMs = Math.round(performance.now() - startMs);
        if (attempt < maxRetries) {
          attempt++;
          await sleep(Math.min(30_000, 1500 * 2 ** attempt));
          continue;
        }
        record = buildFailedTrialRecord({
          trial,
          modelRequested: options.model,
          thinkingBudget: null,
          status: "api_error",
          errorMessage: err instanceof Error ? err.message : String(err),
          latencyMs,
          schemaOverheadTokens: null,
        });
        break;
      }
    }

    if (record) {
      appendFileSync(options.checkpointPath, JSON.stringify(record) + "\n", "utf-8");
      results.push(record);
      options.onTrialComplete?.(record, idx + 1, trials.length);
    }

    if (stoppedOnDailyQuota) break;
    if (delayMs > 0 && idx < trials.length - 1) {
      await sleep(delayMs);
    }
  }

  return { records: results, stoppedOnDailyQuota };
}
