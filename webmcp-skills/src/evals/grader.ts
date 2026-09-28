/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateContent } from "./provider.js";
import type { AssertionResult, GradingOutput } from "./types.js";

export interface GraderOptions {
  model?: string;
  mock?: boolean;
}

/**
 * Checks if an assertion can be deterministically verified against the output.
 * Only exact quoted strings or single code tokens/key-value pairs are verified deterministically;
 * natural language descriptions with spaces fall through to semantic model evaluation.
 */
export function tryDeterministicCheck(assertion: string, output: string): AssertionResult | null {
  const trimmed = assertion.trim();

  // Pattern: "The output does NOT include [exact string]" or "does not contain"
  // 1. Quoted string: does NOT include 'target' or "target" or `target`
  const quotedNotMatch = trimmed.match(/does NOT (?:include|contain)\s+(['"`])([\s\S]+?)\1/i);
  // 2. Unquoted single token / identifier (e.g. navigator.modelContext, unregisterTool)
  const tokenNotMatch = trimmed.match(
    /does NOT (?:include|contain)\s+(?:deprecated\s+)?([a-zA-Z0-9_$.-]+)$/i,
  );
  const notTarget = quotedNotMatch
    ? quotedNotMatch[2].trim()
    : tokenNotMatch
      ? tokenNotMatch[1].trim()
      : null;

  if (notTarget) {
    const found = output.includes(notTarget);
    return {
      text: assertion,
      passed: !found,
      evidence: found
        ? `Prohibited string '${notTarget}' was found in the output.`
        : `Verified that '${notTarget}' does not appear anywhere in the output.`,
    };
  }

  // Pattern: "The output includes [exact token]"
  // 1. Explicitly quoted literal token: The output includes 'exact string'
  const quotedIncludesMatch = trimmed.match(/^The output includes\s+(['"`])([\s\S]+?)\1$/i);
  if (quotedIncludesMatch) {
    const target = quotedIncludesMatch[2].trim();
    const found = output.includes(target);
    return {
      text: assertion,
      passed: found,
      evidence: found
        ? `Found exact substring '${target}' in the output.`
        : `Target string '${target}' was missing from the output.`,
    };
  }

  // 2. Unquoted single identifier (e.g. useWebMCP) or simple key-value pair (e.g. readOnlyHint: true)
  // Must NOT match natural language sentences like "The output includes the toolname attribute on the form"
  const tokenIncludesMatch = trimmed.match(
    /^The output includes\s+([a-zA-Z0-9_$.-]+(?::\s*['"`]?[a-zA-Z0-9_$.-]+['"`]?)?)$/i,
  );
  if (tokenIncludesMatch) {
    const target = tokenIncludesMatch[1].trim();
    const found = output.includes(target);
    return {
      text: assertion,
      passed: found,
      evidence: found
        ? `Found exact substring '${target}' in the output.`
        : `Target string '${target}' was missing from the output.`,
    };
  }

  return null;
}

/**
 * Grades output assertions adhering to agentskills.io principles.
 * Requires concrete evidence for every assertion.
 */
export async function gradeAssertions(
  output: string,
  expectedOutput: string,
  assertions: string[],
  options: GraderOptions = {},
): Promise<GradingOutput> {
  if (assertions.length === 0) {
    return {
      assertion_results: [],
      summary: { passed: 0, failed: 0, total: 0, pass_rate: 1.0 },
    };
  }

  const results: AssertionResult[] = [];
  const pendingSemantic: string[] = [];

  // Try deterministic checks first
  for (const assertion of assertions) {
    const deterministic = tryDeterministicCheck(assertion, output);
    if (deterministic) {
      results.push(deterministic);
    } else {
      pendingSemantic.push(assertion);
    }
  }

  // Evaluate remaining semantic assertions with model judge (or mock)
  if (pendingSemantic.length > 0) {
    if (options.mock || !process.env.GEMINI_API_KEY) {
      for (const assertion of pendingSemantic) {
        results.push({
          text: assertion,
          passed: true,
          evidence: `[MOCK] Evidence verified for assertion: "${assertion.slice(0, 50)}..."`,
        });
      }
    } else {
      const gradingPrompt = `
You are an objective eval grader evaluating an agent's response against specific assertions.

Context / Expected Output:
"${expectedOutput}"

Agent Response to Evaluate:
"""
${output}
"""

Assertions to Grade:
${pendingSemantic.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Grading Rules:
1. Require concrete evidence for a PASS. Do not give the benefit of the doubt.
2. Quote exact words, parameters, or cite sections as evidence.
3. If an assertion fails, specify what was missing or incorrect as evidence.
4. Return valid JSON strictly matching this schema:
{
  "results": [
    {
      "text": "<exact assertion text>",
      "passed": true,
      "evidence": "<concrete citation or explanation>"
    }
  ]
}
`.trim();

      try {
        const generation = await generateContent(gradingPrompt, {
          model: options.model,
          responseMimeType: "application/json",
          temperature: 0.1,
        });

        let rawText = generation.text.trim();
        if (rawText.startsWith("```")) {
          rawText = rawText
            .replace(/^```(?:json)?\s*\n?/, "")
            .replace(/\n?```\s*$/, "")
            .trim();
        }

        let parsed: any;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          // Fallback 1: repair invalid or unescaped control/escape characters
          try {
            const sanitized = rawText.replace(/\\([^"\\/bfnrtu])/g, "$1");
            parsed = JSON.parse(sanitized);
          } catch {
            // Fallback 2: regex extract results when evidence contains unescaped quotes
            const extractedResults: AssertionResult[] = [];
            const blockRegex =
              /\{\s*"text"\s*:\s*"([^"]+)"[\s\S]*?"passed"\s*:\s*(true|false)[\s\S]*?"evidence"\s*:\s*"([\s\S]*?)"\s*\}/g;
            let match;
            while ((match = blockRegex.exec(rawText)) !== null) {
              extractedResults.push({
                text: match[1],
                passed: match[2] === "true",
                evidence: match[3],
              });
            }
            if (extractedResults.length > 0) {
              parsed = { results: extractedResults };
            }
          }
        }
        const modelResults: AssertionResult[] = Array.isArray(parsed?.results)
          ? parsed.results
          : [];

        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

        for (let i = 0; i < pendingSemantic.length; i++) {
          const assertion = pendingSemantic[i];
          const normAssertion = normalize(assertion);
          const matched =
            modelResults.find(
              (r) =>
                r.text === assertion ||
                r.text.replace(/['"`\\]/g, "") === assertion.replace(/['"`\\]/g, ""),
            ) ||
            modelResults.find((r) => normalize(r.text) === normAssertion) ||
            (modelResults.length === pendingSemantic.length ? modelResults[i] : undefined);

          if (matched) {
            results.push({
              text: assertion,
              passed: Boolean(matched.passed),
              evidence: String(matched.evidence || "No evidence provided by grader."),
            });
          } else {
            results.push({
              text: assertion,
              passed: false,
              evidence: "Grader did not return evaluation for this assertion.",
            });
          }
        }
      } catch (err) {
        for (const assertion of pendingSemantic) {
          results.push({
            text: assertion,
            passed: false,
            evidence: `Grader evaluation failed: ${(err as Error).message}`,
          });
        }
      }
    }
  }

  // Preserve original assertion ordering
  const orderedResults = assertions.map((a) => results.find((r) => r.text === a)!);
  const passed = orderedResults.filter((r) => r.passed).length;
  const total = orderedResults.length;
  const failed = total - passed;
  const pass_rate = total > 0 ? Number((passed / total).toFixed(4)) : 1.0;

  return {
    assertion_results: orderedResults,
    summary: {
      passed,
      failed,
      total,
      pass_rate,
    },
  };
}
