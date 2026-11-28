/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolSchema } from "../types/tools.js";

export type DistractorType = "none" | "orthogonal" | "domain-adjacent";
export type SchemaStyle = "concise" | "verbose";
export type RunMode = "micro-pilot" | "mvp";

export interface BenchmarkTool extends ToolSchema {
  provenance: {
    sourceType: "real-example" | "synthetic";
    sourcePath: string;
    commitSha?: string;
  };
}

export interface BenchmarkIntent {
  id: string;
  name: string;
  prompt: string;
  /** `null` represents an abstention case where no tool should be invoked. */
  expectedCall: {
    functionName: string;
    arguments?: Record<string, unknown> | null;
  } | null;
  category: "positive-direct" | "positive-nuanced" | "abstention";
}

export interface ScalingTrialSpec {
  trialId: string;
  arm: "micro-pilot" | "natural-scaling" | "verbosity-n20";
  n: number;
  distractorType: DistractorType;
  schemaStyle: SchemaStyle;
  drawIndex: number;
  shuffleSeed: number;
  intent: BenchmarkIntent;
  /** Target tool's 0-based index in `tools`, or -1 for abstention cases. */
  targetPosition: number;
  tools: BenchmarkTool[];
}

export interface GeminiUsageRecord {
  promptTokenCount: number | null;
  toolUsePromptTokenCount: number | null;
  candidatesTokenCount: number | null;
  thoughtsTokenCount: number | null;
  cachedContentTokenCount: number | null;
  totalTokenCount: number | null;
}

export interface CountTokensOverhead {
  baselineTokens: number;
  withToolsTokens: number;
  estimatedSchemaOverheadTokens: number;
}

export interface TrialExecutionRecord {
  trialId: string;
  timestamp: string;
  arm: ScalingTrialSpec["arm"];
  n: number;
  distractorType: DistractorType;
  schemaStyle: SchemaStyle;
  drawIndex: number;
  shuffleSeed: number;
  intentId: string;
  intentCategory: BenchmarkIntent["category"];
  targetPosition: number;
  expectedFunctionName: string | null;
  actualFunctionName: string | null;
  actualArgs: Record<string, unknown> | null;
  allCalledFunctions: string[];
  modelRequested: string;
  modelVersion: string | null;
  thinkingBudget: number | null;
  status: "ok" | "api_error" | "quota_exhausted";
  errorMessage?: string;
  top1Correct: boolean;
  abstentionCorrect: boolean | null;
  falsePositiveCall: boolean;
  schemaValid: boolean;
  semanticArgsCorrect: boolean;
  latencyMs: number;
  usage: GeminiUsageRecord;
  schemaOverheadTokens: number | null;
  realToolsCount: number;
  syntheticToolsCount: number;
}

export interface CellSummary {
  arm: string;
  n: number;
  distractorType: DistractorType;
  schemaStyle: SchemaStyle;
  totalTrials: number;
  completedTrials: number;
  apiErrors: number;
  top1Accuracy: number;
  top1CiLow: number;
  top1CiHigh: number;
  abstentionAccuracy: number | null;
  falsePositiveRate: number | null;
  macroF1: number;
  schemaValidityRate: number;
  semanticArgsRate: number;
  meanPromptTokens: number | null;
  meanToolUsePromptTokens: number | null;
  meanCandidatesTokens: number | null;
  meanThoughtsTokens: number | null;
  meanTotalTokens: number | null;
  meanSchemaOverheadTokens: number | null;
  contextSaturationPct: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
}
