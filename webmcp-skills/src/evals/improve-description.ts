/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateContent } from "./provider.js";
import type { TriggerEvalReport } from "./trigger-eval.js";

export interface ImproveOptions {
  model?: string;
  mock?: boolean;
}

/**
 * Optimizes a skill description based on trigger evaluation errors.
 */
export async function improveDescription(
  skillName: string,
  skillContent: string,
  currentDescription: string,
  evalReport: TriggerEvalReport,
  options: ImproveOptions = {},
): Promise<string> {
  const falsePositives = evalReport.results.filter((r) => r.triggered && !r.should_trigger);
  const falseNegatives = evalReport.results.filter((r) => !r.triggered && r.should_trigger);

  if (falsePositives.length === 0 && falseNegatives.length === 0) {
    return currentDescription;
  }

  if (options.mock || !process.env.GEMINI_API_KEY) {
    return `${currentDescription} (Optimized for trigger accuracy)`;
  }

  const prompt = `
You are an expert prompt engineer optimizing an Agent Skill description for accurate trigger routing.

Skill Name: ${skillName}
Current Description:
"${currentDescription}"

Skill Body Summary:
${skillContent.slice(0, 1500)}

Trigger Errors Observed:
${falseNegatives.length > 0 ? `Failed to Trigger (False Negatives - SHOULD have triggered):\n${falseNegatives.map((fn) => `- "${fn.query}"`).join("\n")}\n` : ""}
${falsePositives.length > 0 ? `Incorrectly Triggered (False Positives - SHOULD NOT have triggered):\n${falsePositives.map((fp) => `- "${fp.query}"`).join("\n")}` : ""}

Instructions for New Description:
1. Must be written in the third person (e.g. "Designs and implements WebMCP tools...").
2. Clearly state WHAT the skill does and WHEN to use it.
3. Include explicit trigger keywords covering the false negatives.
4. Establish clear negative boundaries to avoid the false positives.
5. Must be strictly <= 1024 characters.
6. Must NOT contain angle brackets (< or >).
7. Return valid JSON: { "improved_description": "..." }
`.trim();

  try {
    const res = await generateContent(prompt, {
      model: options.model,
      responseMimeType: "application/json",
      temperature: 0.2,
    });

    const parsed = JSON.parse(res.text);
    let desc = String(parsed.improved_description || currentDescription).trim();

    // Clean up angle brackets if model included any
    desc = desc.replace(/[<>]/g, "");

    // Truncate to 1024 chars if necessary
    if (desc.length > 1024) {
      desc = desc.slice(0, 1021) + "...";
    }

    return desc;
  } catch (err) {
    console.error("Failed to improve description:", err);
    return currentDescription;
  }
}
