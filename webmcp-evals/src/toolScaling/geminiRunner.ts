/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { FunctionCallingConfigMode, GoogleGenAI, type FunctionDeclaration } from "@google/genai";
import { SYSTEM_PROMPT } from "../evaluator/prompts.js";
import { matchesArgument } from "../matcher.js";
import type {
  BenchmarkTool,
  CountTokensOverhead,
  GeminiUsageRecord,
  ScalingTrialSpec,
  TrialExecutionRecord,
} from "./types.js";

export interface GeminiClientLike {
  models: {
    generateContent(params: any): Promise<any>;
    countTokens(params: any): Promise<{ totalTokens?: number }>;
  };
}

export interface RunnerOptions {
  apiKey?: string;
  model: string;
  thinkingBudget?: number | null;
  delayMs?: number;
  maxRetries?: number;
  checkpointPath: string;
  resume?: boolean;
  measureSchemaTokens?: boolean;
  client?: GeminiClientLike;
  sleepFn?: (ms: number) => Promise<void>;
  onTrialComplete?: (record: TrialExecutionRecord, index: number, total: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function toFunctionDeclarations(tools: readonly BenchmarkTool[]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema:
      t.inputSchema && Object.keys(t.inputSchema).length > 0
        ? t.inputSchema
        : { type: "object", properties: {} },
  }));
}

export function extractUsage(usageMetadata: any): GeminiUsageRecord {
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    promptTokenCount: numOrNull(usageMetadata?.promptTokenCount),
    toolUsePromptTokenCount: numOrNull(usageMetadata?.toolUsePromptTokenCount),
    candidatesTokenCount: numOrNull(usageMetadata?.candidatesTokenCount),
    thoughtsTokenCount: numOrNull(usageMetadata?.thoughtsTokenCount),
    cachedContentTokenCount: numOrNull(usageMetadata?.cachedContentTokenCount),
    totalTokenCount: numOrNull(usageMetadata?.totalTokenCount),
  };
}

/**
 * Validates whether `args` satisfies basic `required` and primitive property
 * constraints of the target tool's `inputSchema`.
 */
export function validateArgsAgainstSchema(
  schemaObj: object | null,
  args: Record<string, unknown> | null,
): boolean {
  if (!args || typeof args !== "object" || Array.isArray(args)) return false;
  if (!schemaObj || typeof schemaObj !== "object") return true;
  const schema = schemaObj as {
    required?: string[];
    properties?: Record<string, { type?: string; enum?: unknown[] }>;
  };
  if (Array.isArray(schema.required)) {
    for (const req of schema.required) {
      if (!(req in args) || args[req] === undefined || args[req] === null) {
        return false;
      }
    }
  }
  if (schema.properties) {
    for (const [k, prop] of Object.entries(schema.properties)) {
      if (!(k in args) || args[k] === undefined) continue;
      const val = args[k];
      if (prop.type === "string" && typeof val !== "string") return false;
      if ((prop.type === "number" || prop.type === "integer") && typeof val !== "number")
        return false;
      if (prop.type === "boolean" && typeof val !== "boolean") return false;
      if (Array.isArray(prop.enum) && !prop.enum.includes(val)) return false;
    }
  }
  return true;
}

export function classifyGeminiError(err: unknown): {
  kind: "daily_quota" | "transient" | "fatal";
  retryDelayMs: number | null;
  message: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // Never retry auth, malformed schema, or invalid request errors.
  if (
    lower.includes("400") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("invalid_argument") ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied")
  ) {
    return { kind: "fatal", retryDelayMs: null, message: msg };
  }

  // Daily quota exhaustion: stop immediately rather than burning retries.
  if (
    lower.includes("perday") ||
    lower.includes("per_day") ||
    lower.includes("daily") ||
    lower.includes("rpd")
  ) {
    return { kind: "daily_quota", retryDelayMs: null, message: msg };
  }

  if (
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("resource_exhausted") ||
    lower.includes("unavailable") ||
    lower.includes("rate limit")
  ) {
    const match = msg.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s/i);
    const retryDelayMs = match ? Math.ceil(Number(match[1]) * 1000) : null;
    return { kind: "transient", retryDelayMs, message: msg };
  }

  return { kind: "fatal", retryDelayMs: null, message: msg };
}

export function loadCompletedTrialIds(checkpointPath: string): Map<string, TrialExecutionRecord> {
  const map = new Map<string, TrialExecutionRecord>();
  if (!existsSync(checkpointPath)) return map;
  const lines = readFileSync(checkpointPath, "utf-8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const rec = JSON.parse(line) as TrialExecutionRecord;
    if (rec.status === "ok") {
      map.set(rec.trialId, rec);
    }
  }
  return map;
}

export function loadAllJsonlRecords(checkpointPath: string): TrialExecutionRecord[] {
  if (!existsSync(checkpointPath)) return [];
  const raw = readFileSync(checkpointPath, "utf-8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as TrialExecutionRecord);
  // Deduplicate by trialId keeping the latest record (e.g., if retried after resume).
  const byId = new Map<string, TrialExecutionRecord>();
  for (const rec of raw) byId.set(rec.trialId, rec);
  return Array.from(byId.values());
}

export async function measureSchemaOverhead(
  client: GeminiClientLike,
  model: string,
  prompt: string,
  tools: readonly BenchmarkTool[],
): Promise<CountTokensOverhead> {
  // Gemini Developer API `countTokens` only accepts `contents` (not `config.tools`
  // or `config.systemInstruction`), so measure serialized tool declarations in `contents`.
  const baseText = `${SYSTEM_PROMPT}\n${prompt}`;
  const serializedTools = JSON.stringify(toFunctionDeclarations(tools));
  const baseResp = await client.models.countTokens({
    model,
    contents: [{ role: "user", parts: [{ text: baseText }] }],
  });
  const withToolsResp = await client.models.countTokens({
    model,
    contents: [{ role: "user", parts: [{ text: `${baseText}\n${serializedTools}` }] }],
  });
  const baselineTokens = baseResp.totalTokens ?? 0;
  const withToolsTokens = withToolsResp.totalTokens ?? 0;
  return {
    baselineTokens,
    withToolsTokens,
    estimatedSchemaOverheadTokens: Math.max(0, withToolsTokens - baselineTokens),
  };
}

export async function runQuotaProbe(
  client: GeminiClientLike,
  model: string,
  tools: readonly BenchmarkTool[],
  calls = 20,
  delayMs = 250,
  sleepFn = defaultSleep,
): Promise<{
  succeeded: number;
  failed: number;
  sampleTotalTokens: number | null;
  errors: string[];
}> {
  let succeeded = 0;
  let failed = 0;
  let sampleTotalTokens: number | null = null;
  const errors: string[] = [];
  const serializedTools = JSON.stringify(toFunctionDeclarations(tools));

  for (let i = 0; i < calls; i++) {
    try {
      const resp = await client.models.countTokens({
        model,
        contents: [
          { role: "user", parts: [{ text: `Quota probe #${i + 1}\n${serializedTools}` }] },
        ],
      });
      succeeded++;
      if (sampleTotalTokens === null && typeof resp.totalTokens === "number") {
        sampleTotalTokens = resp.totalTokens;
      }
    } catch (err) {
      failed++;
      errors.push(err instanceof Error ? err.message : String(err));
    }
    if (delayMs > 0 && i < calls - 1) await sleepFn(delayMs);
  }
  return { succeeded, failed, sampleTotalTokens, errors };
}

export interface ParsedToolCall {
  functionName: string;
  args: Record<string, unknown>;
  /** Set false if the provider returned unparseable JSON arguments. */
  argsParseValid?: boolean;
}

/** Scores parsed tool calls against a `ScalingTrialSpec` and builds a `TrialExecutionRecord`. */
export function scoreTrialExecution(params: {
  trial: ScalingTrialSpec;
  calls: ParsedToolCall[];
  modelRequested: string;
  modelVersion: string | null;
  thinkingBudget: number | null;
  latencyMs: number;
  usage: GeminiUsageRecord;
  schemaOverheadTokens: number | null;
}): TrialExecutionRecord {
  const { trial, calls } = params;
  const firstCall = calls[0] ?? null;
  const expectedName = trial.intent.expectedCall?.functionName ?? null;
  const actualName = firstCall?.functionName ?? null;
  const actualArgs = firstCall?.args ?? null;

  const top1Correct = expectedName === null ? actualName === null : actualName === expectedName;
  const abstentionCorrect = expectedName === null ? actualName === null : null;
  const falsePositiveCall = expectedName === null && actualName !== null;

  const targetToolObj = expectedName ? trial.tools.find((t) => t.name === expectedName) : undefined;
  const schemaValid =
    expectedName !== null && actualName === expectedName && firstCall?.argsParseValid !== false
      ? validateArgsAgainstSchema(targetToolObj?.inputSchema ?? null, actualArgs)
      : false;

  const semanticArgsCorrect =
    expectedName !== null && actualName === expectedName && firstCall?.argsParseValid !== false
      ? trial.intent.expectedCall?.arguments != null
        ? matchesArgument(trial.intent.expectedCall.arguments, actualArgs ?? {})
        : true
      : false;

  return {
    trialId: trial.trialId,
    timestamp: new Date().toISOString(),
    arm: trial.arm,
    n: trial.n,
    distractorType: trial.distractorType,
    schemaStyle: trial.schemaStyle,
    drawIndex: trial.drawIndex,
    shuffleSeed: trial.shuffleSeed,
    intentId: trial.intent.id,
    intentCategory: trial.intent.category,
    targetPosition: trial.targetPosition,
    expectedFunctionName: expectedName,
    actualFunctionName: actualName,
    actualArgs,
    allCalledFunctions: calls.map((c) => c.functionName),
    modelRequested: params.modelRequested,
    modelVersion: params.modelVersion,
    thinkingBudget: params.thinkingBudget,
    status: "ok",
    top1Correct,
    abstentionCorrect,
    falsePositiveCall,
    schemaValid,
    semanticArgsCorrect,
    latencyMs: params.latencyMs,
    usage: params.usage,
    schemaOverheadTokens: params.schemaOverheadTokens,
    realToolsCount: trial.tools.filter((t) => t.provenance.sourceType === "real-example").length,
    syntheticToolsCount: trial.tools.filter((t) => t.provenance.sourceType === "synthetic").length,
  };
}

/** Builds an error/quota checkpoint record for a failed `ScalingTrialSpec`. */
export function buildFailedTrialRecord(params: {
  trial: ScalingTrialSpec;
  modelRequested: string;
  thinkingBudget: number | null;
  status: "api_error" | "quota_exhausted";
  errorMessage: string;
  latencyMs: number;
  schemaOverheadTokens: number | null;
}): TrialExecutionRecord {
  const { trial } = params;
  return {
    trialId: trial.trialId,
    timestamp: new Date().toISOString(),
    arm: trial.arm,
    n: trial.n,
    distractorType: trial.distractorType,
    schemaStyle: trial.schemaStyle,
    drawIndex: trial.drawIndex,
    shuffleSeed: trial.shuffleSeed,
    intentId: trial.intent.id,
    intentCategory: trial.intent.category,
    targetPosition: trial.targetPosition,
    expectedFunctionName: trial.intent.expectedCall?.functionName ?? null,
    actualFunctionName: null,
    actualArgs: null,
    allCalledFunctions: [],
    modelRequested: params.modelRequested,
    modelVersion: null,
    thinkingBudget: params.thinkingBudget,
    status: params.status,
    errorMessage: params.errorMessage,
    top1Correct: false,
    abstentionCorrect: null,
    falsePositiveCall: false,
    schemaValid: false,
    semanticArgsCorrect: false,
    latencyMs: params.latencyMs,
    usage: extractUsage(null),
    schemaOverheadTokens: params.schemaOverheadTokens,
    realToolsCount: trial.tools.filter((t) => t.provenance.sourceType === "real-example").length,
    syntheticToolsCount: trial.tools.filter((t) => t.provenance.sourceType === "synthetic").length,
  };
}

export async function runScalingTrials(
  trials: readonly ScalingTrialSpec[],
  options: RunnerOptions,
): Promise<{ records: TrialExecutionRecord[]; stoppedOnDailyQuota: boolean }> {
  const client: GeminiClientLike =
    options.client ??
    new GoogleGenAI({
      apiKey:
        options.apiKey ||
        process.env.GOOGLE_AI ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        (() => {
          throw new Error("Missing GOOGLE_AI / GEMINI_API_KEY.");
        })(),
    });

  const sleep = options.sleepFn ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 3;
  const delayMs = options.delayMs ?? 1500;
  mkdirSync(dirname(options.checkpointPath), { recursive: true });

  const completedMap = options.resume ? loadCompletedTrialIds(options.checkpointPath) : new Map();
  const schemaOverheadCache = new Map<string, number>();
  const results: TrialExecutionRecord[] = [];
  let stoppedOnDailyQuota = false;

  for (let idx = 0; idx < trials.length; idx++) {
    const trial = trials[idx];
    const existing = completedMap.get(trial.trialId);
    if (existing) {
      results.push(existing);
      continue;
    }

    const catalogKey = `${trial.arm}|${trial.n}|${trial.distractorType}|${trial.schemaStyle}|${trial.drawIndex}`;
    let schemaOverheadTokens: number | null = schemaOverheadCache.get(catalogKey) ?? null;

    if (options.measureSchemaTokens !== false && schemaOverheadTokens === null) {
      try {
        const overhead = await measureSchemaOverhead(
          client,
          options.model,
          trial.intent.prompt,
          trial.tools,
        );
        schemaOverheadTokens = overhead.estimatedSchemaOverheadTokens;
        schemaOverheadCache.set(catalogKey, schemaOverheadTokens);
      } catch {
        schemaOverheadTokens = null;
      }
    }

    const request: Record<string, unknown> = {
      model: options.model,
      contents: [{ role: "user", parts: [{ text: trial.intent.prompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0,
        tools: [{ functionDeclarations: toFunctionDeclarations(trial.tools) }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
        ...(typeof options.thinkingBudget === "number"
          ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
          : {}),
      },
    };

    let attempt = 0;
    let record: TrialExecutionRecord | null = null;

    while (attempt <= maxRetries) {
      const startMs = performance.now();
      try {
        const resp = await client.models.generateContent(request);
        const latencyMs = Math.round(performance.now() - startMs);

        // Retain named function calls even when args is undefined (`args ?? {}`).
        const rawCalls = Array.isArray(resp.functionCalls) ? resp.functionCalls : [];
        const calls: ParsedToolCall[] = rawCalls
          .filter((f: any) => typeof f?.name === "string" && f.name.length > 0)
          .map((f: any) => ({
            functionName: f.name as string,
            args: (f.args ?? {}) as Record<string, unknown>,
          }));

        record = scoreTrialExecution({
          trial,
          calls,
          modelRequested: options.model,
          modelVersion: typeof resp.modelVersion === "string" ? resp.modelVersion : null,
          thinkingBudget: options.thinkingBudget ?? null,
          latencyMs,
          usage: extractUsage(resp.usageMetadata),
          schemaOverheadTokens,
        });
        break;
      } catch (err) {
        const latencyMs = Math.round(performance.now() - startMs);
        const classified = classifyGeminiError(err);

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
          thinkingBudget: options.thinkingBudget ?? null,
          status,
          errorMessage: classified.message,
          latencyMs,
          schemaOverheadTokens,
        });
        if (classified.kind === "daily_quota") {
          stoppedOnDailyQuota = true;
        }
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
