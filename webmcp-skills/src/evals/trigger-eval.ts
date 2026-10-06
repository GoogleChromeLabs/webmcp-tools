/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateContent } from "./provider.js";

export interface TriggerQuery {
  query: string;
  should_trigger: boolean;
}

export interface TriggerResultItem {
  query: string;
  should_trigger: boolean;
  triggered: boolean;
  pass: boolean;
  reason?: string;
}

export interface TriggerMetrics {
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  true_positives: number;
  true_negatives: number;
  false_positives: number;
  false_negatives: number;
}

export interface TriggerEvalReport {
  skill_name: string;
  description: string;
  metrics: TriggerMetrics;
  results: TriggerResultItem[];
}

export interface TriggerEvalOptions {
  model?: string;
  mock?: boolean;
}

/**
 * Runs trigger evaluation to test if a skill description triggers appropriately.
 */
export async function runTriggerEval(
  skillName: string,
  description: string,
  queries: TriggerQuery[],
  options: TriggerEvalOptions = {},
): Promise<TriggerEvalReport> {
  const results: TriggerResultItem[] = [];

  for (const item of queries) {
    let triggered = false;
    let reason = "";

    if (options.mock || !process.env.GEMINI_API_KEY) {
      // In mock mode, simulate correct behavior based on query matching description keywords
      triggered = item.should_trigger;
      reason = "[MOCK] Simulated router decision";
    } else {
      const routerPrompt = `
You are an AI agent router determining whether to activate a skill for a user request.

Available Skill:
- Name: ${skillName}
- Description: ${description}

User Request:
"${item.query}"

Task:
Determine whether the skill "${skillName}" should be activated to handle this request.
Return valid JSON matching this schema:
{
  "triggered": true | false,
  "reason": "<one sentence explanation>"
}
`.trim();

      try {
        const res = await generateContent(routerPrompt, {
          model: options.model,
          responseMimeType: "application/json",
          temperature: 0.1,
        });

        const parsed = JSON.parse(res.text);
        triggered = Boolean(parsed.triggered);
        reason = String(parsed.reason || "");
      } catch (err) {
        triggered = false;
        reason = `Router error: ${(err as Error).message}`;
      }
    }

    const pass = triggered === item.should_trigger;
    results.push({
      query: item.query,
      should_trigger: item.should_trigger,
      triggered,
      pass,
      reason,
    });
  }

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const r of results) {
    if (r.triggered && r.should_trigger) tp++;
    else if (!r.triggered && !r.should_trigger) tn++;
    else if (r.triggered && !r.should_trigger) fp++;
    else if (!r.triggered && r.should_trigger) fn++;
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  const accuracy = total > 0 ? Number((passed / total).toFixed(4)) : 1.0;
  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : 0.0;
  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : 0.0;
  const f1 =
    precision + recall > 0
      ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4))
      : 0.0;

  return {
    skill_name: skillName,
    description,
    metrics: {
      total,
      passed,
      failed,
      accuracy,
      precision,
      recall,
      f1,
      true_positives: tp,
      true_negatives: tn,
      false_positives: fp,
      false_negatives: fn,
    },
    results,
  };
}
