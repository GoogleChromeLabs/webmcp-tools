/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from "fs/promises";
import { resolve, dirname, join, basename, extname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { generateText } from "ai";
import { getModel } from "../evaluator/models.js";
import { Config } from "../types/config.js";

const execAsync = promisify(exec);

export const ANALYZER_MODEL_DEFAULT = "gemini-3.5-flash";

/**
 * Loads the WebMCP best practices and API guides from the installed modern-web-guidance package.
 */
async function loadWebMcpContext(): Promise<string> {
  try {
    const packageJsonUrl = import.meta.resolve("modern-web-guidance/package.json");
    const packageDir = dirname(fileURLToPath(packageJsonUrl));
    const scriptPath = join(packageDir, "skills/modern-web-guidance/modern-web.mjs");

    const { stdout } = await execAsync(
      `node "${scriptPath}" retrieve webmcp,agentic-forms,agentic-javascript-tools`,
    );
    return stdout;
  } catch (error: any) {
    throw new Error(`Failed to retrieve modern-web-guidance WebMCP context: ${error.message}`);
  }
}

/**
 * Reads the report JSON from path, with a fallback for HTML report paths.
 */
export async function readEvalReportJson(reportPath: string): Promise<any> {
  const fullPath = resolve(process.cwd(), reportPath);
  const ext = extname(fullPath).toLowerCase();

  if (ext !== ".json" && ext !== ".html") {
    throw new Error(
      `Unsupported report file extension: "${ext}". The analyzer only supports JSON (.json) or HTML (.html) evaluation reports.`,
    );
  }

  let targetJsonPath = fullPath;

  if (ext === ".html") {
    // Fallback: look for a file with the same timestamp prefix but .json extension
    const base = basename(fullPath, ".html");
    const dir = dirname(fullPath);
    targetJsonPath = join(dir, `${base}.json`);
  }

  let reportRaw: string;
  try {
    reportRaw = await readFile(targetJsonPath, "utf-8");
  } catch (readError: any) {
    if (ext === ".html") {
      throw new Error(
        `No corresponding JSON report found at "${targetJsonPath}". ` +
          `Please rerun evaluations with JSON reporter enabled (e.g. '--reporter json' or '--reporter console html json').`,
      );
    }
    throw new Error(`Failed to read JSON report from "${targetJsonPath}": ${readError.message}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(reportRaw);
  } catch (parseError: any) {
    throw new Error(
      `Failed to parse JSON report from "${targetJsonPath}": The file content is not a valid JSON document.`,
    );
  }

  if (!parsed || typeof parsed !== "object" || !parsed.config || !parsed.results) {
    throw new Error(
      `Invalid report structure at "${targetJsonPath}": The JSON file does not appear to be a valid WebMCP evaluation report.`,
    );
  }

  return parsed;
}

/**
 * Extracts the title from the corresponding HTML report file if available.
 */
async function extractEvalReportTitle(reportPath: string): Promise<string> {
  const ext = extname(reportPath).toLowerCase();
  let htmlPath = reportPath;

  if (ext === ".json") {
    const base = basename(reportPath, ".json");
    const dir = dirname(reportPath);
    htmlPath = join(dir, `${base}.html`);
  }

  try {
    const htmlContent = await readFile(htmlPath, "utf-8");
    const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
  } catch {
    // Fallback if HTML file not readable
  }

  return basename(reportPath, ext);
}

/**
 * Formats a report title to shorten any long timestamps (e.g. report-1784620981145 to report-17...981145)
 */
export function formatShortTitle(title: string): string {
  const match = title.match(/\d{10,}/);
  if (match) {
    const fullNum = match[0];
    const shortNum = fullNum.slice(0, 2) + "..." + fullNum.slice(-6);
    return title.replace(fullNum, shortNum);
  }
  return title;
}

/**
 * Main function to execute the report analysis using the configured LLM.
 */
export async function analyzeEvalReport(
  reportPath: string,
  config: Config,
  options?: {
    // Internal test-only parameter.
    // We pass a mock/dummy model object during unit tests to avoid making real LLM API calls.
    _testModel?: any;
  },
): Promise<string> {
  // Load from the JSON report evals config, assertions (passed/failed), and trajectories.
  // - reportData.config: evaluation configuration context
  // - reportData.results.results[].outcome: passed and failed assertions
  // - reportData.results.results[].trajectory: step-by-step state (available tools), agent action (tool calls inputs), and response (tool outputs)
  const reportData = await readEvalReportJson(reportPath);

  // Deduplicate `availableTools` across all trajectory steps to optimize prompt tokens
  const uniqueTools = new Map<string, any>();
  if (reportData.results && Array.isArray(reportData.results.results)) {
    reportData.results.results.forEach((res: any) => {
      if (Array.isArray(res.trajectory)) {
        res.trajectory.forEach((step: any) => {
          if (Array.isArray(step.availableTools)) {
            step.availableTools.forEach((tool: any) => {
              if (tool && tool.functionName) {
                uniqueTools.set(tool.functionName, tool);
              }
            });
          }
          delete step.availableTools;
        });
      }
    });
  }
  if (reportData.results) {
    reportData.results.availableTools = Array.from(uniqueTools.values());
  }

  const webMcpDomainKnowledge = await loadWebMcpContext();
  const reportTitle = formatShortTitle(await extractEvalReportTitle(reportPath));

  // Default to a reasoning model for analysis if not explicitly specified
  const analyzerConfig = {
    ...config,
    model: config.model || ANALYZER_MODEL_DEFAULT,
  };

  // Use the mock test model if provided, otherwise resolve the real model instance.
  const modelInstance = options?._testModel || getModel(analyzerConfig);

  const systemPrompt = `You are a WebMCP Evals Analyzer, a specialized developer tool built to analyze agentic browser evaluation reports.
Your role is to inspect the evaluation outcomes, identify failed steps, and deduce high-quality hypotheses explaining why the model deviated or failed.

Here is the WebMCP Specification and best practices reference for your context:
=========================================
${webMcpDomainKnowledge}
=========================================

Analyze the provided evaluation report JSON. For any failures, assess the trajectory using these three hypotheses:
1. Model Logic Failure: Did the LLM fail to follow instructions or send invalid parameters?
2. App/Tool API Failure: Is the application's tool description confusing, or did the tool return broken results?
3. Test/Assertion Over-Rigidity: Did the model behave correctly/smartly (e.g., self-correcting), but the test assertion was too strict?

CRITICAL BEHAVIOR RULES:
- **Tone & Terminology**: You MUST maintain a strictly neutral, objective, and professional engineering tone. Avoid conversational adjectives, colloquialisms, or hyperbole. Describe actions and logic using precise technical observations.
- **Minimal Output on Clean Success**: If the evaluation run was 100% successful (0 failures, 0 errors) and you do NOT suspect any false positives, you MUST keep the report extremely minimal. Briefly state that the run was successful, and do NOT write any detailed trajectory deep-dives or root cause analysis.
- **Selective Deep Dives**: Only include deep-dives, trajectories, hypotheses, or recommendations if there are actual failures, OR if you believe a passing run is a FALSE POSITIVE (e.g., tests passed because assertions were too lenient/lax).

Format your response in Markdown using the following structure:
# WebMCP Evals Analysis — Eval report ${reportTitle}
**Analysis Model / Backend:** ${analyzerConfig.model} (via ${analyzerConfig.backend} backend)
**Evals Execution Context:** [Describe Target App URL, and Evals execution Model/Backend parsed from the report JSON]

## 1. Summary
Provide a natural-language paragraph summarizing the evaluation run outcomes.

## 2. Failed Trajectories & Deep Dives
[Describe failed cases and what went wrong. If the run succeeded with no false positives, state "No failures or false positives detected." and omit details.]

## 3. Root Cause Hypotheses
[Hypotheses explaining failures or false-positive assertions. Omit if no failures/false positives.]

## 4. Actionable Fixes
[Concrete checkbox items for fixes. Omit if no failures/false positives.]`;

  // The LLM processes the JSON report to extract eval config, identify failed step assertions,
  // and analyze trajectories to deduce root causes.
  const prompt = `Please analyze the following WebMCP evaluation report JSON and provide a detailed markdown report:

\`\`\`json
${JSON.stringify(reportData, null, 2)}
\`\`\`
`;

  const { text } = await generateText({
    model: modelInstance,
    system: systemPrompt,
    prompt: prompt,
  });

  return text;
}
