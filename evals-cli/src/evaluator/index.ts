/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, FunctionCall, Message, TestResult, TestResults } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";
import { countExpectedCalls, evaluateExecutionTrajectory } from "../utils.js";

import { GeminiBackend } from "../backends/gemini.js";
import { Backend, RunEvent } from "../backends/index.js";
import { OllamaBackend } from "../backends/ollama.js";
import { VercelBackend } from "../backends/vercel.js";
import { listToolsFromPage } from "./browser.js";
import { SYSTEM_PROMPT } from "./prompts.js";

import type { ResolvedSkill, SkillReadArgs } from "agent-skills-ts-sdk";
import { handleSkillRead } from "agent-skills-ts-sdk";

export { listToolsFromPage };

const DISCLOSURE_TOOL_NAME = "read_site_context";
const MAX_AGENT_STEPS = 10;

type ParsedToolCall = {
  functionName: string;
  args: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toToolCall(value: unknown): ParsedToolCall | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.functionName !== "string") {
    return null;
  }

  if (!isRecord(value.args)) {
    return null;
  }

  return {
    functionName: value.functionName,
    args: value.args,
  };
}

function toDisclosureArgs(
  value: unknown,
  defaultSkillName?: string,
): SkillReadArgs | null {
  const call = toToolCall(value);
  if (!call || call.functionName !== DISCLOSURE_TOOL_NAME) {
    return null;
  }

  const args = call.args;
  // Normalize common argument variations: models sometimes send
  // {skill: "..."} or {skill_name: "..."} instead of {name: "..."}
  const name = args.name ?? args.skill ?? args.skill_name ?? defaultSkillName;
  if (typeof name !== "string" || name.length === 0) {
    return null;
  }

  return {
    name,
    resource: typeof args.resource === "string" ? args.resource : undefined,
  };
}

function toDisclosureMessageArgs(args: SkillReadArgs): Record<string, unknown> {
  if (args.resource !== undefined) {
    return { name: args.name, resource: args.resource };
  }
  return { name: args.name };
}

function isFunctionCall(value: unknown): value is FunctionCall {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.functionName === "string" && isRecord(value.arguments);
}

export async function executeLocalEvals(
  tests: Array<Eval>,
  tools: Array<Tool>,
  config: Config | WebmcpConfig,
  onEvent?: (event: RunEvent) => void,
  systemPrompt?: string,
  skill?: ResolvedSkill,
): Promise<TestResults> {
  const prompt = systemPrompt || SYSTEM_PROMPT;

  const totalSteps = tests.reduce((sum, test) => {
    return sum + (test.expectedCall ? countExpectedCalls(test.expectedCall) : 1);
  }, 0);

  let testCount = 0;
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  const testResults: Array<TestResult> = [];

  let backendImpl: Backend;
  if (config.backend === "gemini") {
    const apiKey =
      process.env.GOOGLE_AI ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("Missing Google API key");
    backendImpl = new GeminiBackend(
      apiKey,
      config.model || "gemini-2.5-flash",
      prompt,
      tools,
    );
  } else if (config.backend === "ollama") {
    const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    backendImpl = new OllamaBackend(host, config.model || "qwen2.5:14b", prompt, tools);
  } else {
    backendImpl = new VercelBackend(config, tools, prompt);
  }

  if (onEvent) {
    onEvent({
      type: "start",
      total: totalSteps,
      message: `Running evals using ${backendImpl.describe()}`,
    });
  }
  for (const test of tests) {
    testCount++;
    try {
      if (skill) {
        // Multi-step agent loop for skill-augmented evals
        let messages: Array<Message> = [...test.messages];
        let matchedResponse: ToolCall | null = null;
        let lastResponse: ToolCall | null = null;

        const firstExpected = Array.isArray(test.expectedCall)
          ? test.expectedCall[0]
          : null;
        if (!isFunctionCall(firstExpected)) {
          throw new Error(
            "Local evals require expectedCall[0] to be a function-call expectation.",
          );
        }
        const expected = firstExpected;

        for (let step = 0; step < MAX_AGENT_STEPS; step++) {
          const backendResponse = await backendImpl.executeLocalEvals({ ...test, messages });

          // 1. Handle disclosure (read_site_context)
          const disclosureArgs = toDisclosureArgs(backendResponse, skill.name);
          if (disclosureArgs) {
            const readResult = handleSkillRead([skill], disclosureArgs);
            const content = readResult.ok ? readResult.content : readResult.error;

            if (process.env.DEBUG_DISCLOSURE) {
              console.log(`  [step ${step}] disclosure: read_site_context(${JSON.stringify(disclosureArgs)})`);
              console.log(`  [response] ${content.slice(0, 200)}...`);
            }

            messages = [
              ...messages,
              {
                role: "model",
                type: "functioncall",
                name: DISCLOSURE_TOOL_NAME,
                arguments: toDisclosureMessageArgs(disclosureArgs),
              },
              {
                role: "user",
                type: "functionresponse",
                name: DISCLOSURE_TOOL_NAME,
                response: { result: content },
              },
            ];
            continue;
          }

          // 2. No tool call (text response) → stop
          const call = toToolCall(backendResponse);
          if (!call) {
            if (process.env.DEBUG_DISCLOSURE) {
              console.log(`  [step ${step}] no tool call (text response) → stopping`);
            }
            break;
          }

          lastResponse = call;

          // 3. Check if this matches the expected call
          const executedCalls: ToolCall[] = [call as ToolCall];
          const trajectories = evaluateExecutionTrajectory([expected], executedCalls);
          const stepOutcome =
            trajectories.length > 0 && trajectories[0].outcome === "pass" ? "pass" : "fail";
          if (stepOutcome === "pass") {
            matchedResponse = call;
            if (process.env.DEBUG_DISCLOSURE) {
              console.log(`  [step ${step}] MATCH: ${call.functionName}(${JSON.stringify(call.args)})`);
            }
            break;
          }

          // 4. Non-matching tool call
          if (process.env.DEBUG_DISCLOSURE) {
            console.log(`  [step ${step}] intermediate: ${call.functionName}(${JSON.stringify(call.args)})`);
          }

          // Provide synthetic response and continue (agent loop)
          messages = [
            ...messages,
            {
              role: "model",
              type: "functioncall",
              name: call.functionName,
              arguments: call.args,
            },
            {
              role: "user",
              type: "functionresponse",
              name: call.functionName,
              response: { result: "ok" },
            },
          ];
        }

        const response = matchedResponse || lastResponse;
        const executedCalls: ToolCall[] = response ? [response as ToolCall] : [];
        const trajectories = evaluateExecutionTrajectory(
          test.expectedCall ?? [],
          executedCalls,
        );

        if (trajectories.length === 0) {
          const result: TestResult = { test, response: null, outcome: "pass" };
          testResults.push(result);
          passCount++;
          if (onEvent) {
            onEvent({ type: "progress", testNumber: testCount, result });
          }
        } else {
          for (const traj of trajectories) {
            const stepResult: TestResult = {
              test: {
                messages: test.messages,
                expectedCall: traj.expected ? [traj.expected] : null,
              },
              response: traj.actual,
              outcome: traj.outcome,
            };
            testResults.push(stepResult);
            if (traj.outcome === "pass") {
              passCount++;
            } else {
              failCount++;
            }

            if (onEvent) {
              onEvent({ type: "progress", testNumber: testCount, result: stepResult });
            }
          }
        }
      } else {
        // Standard single-call evaluation
        const response = await backendImpl.executeLocalEvals(test);

        let executedCalls: ToolCall[] = [];
        if (response && response.functionName) {
          executedCalls = [response as ToolCall];
        }

        const trajectories = test.expectedCall
          ? evaluateExecutionTrajectory(test.expectedCall, executedCalls)
          : evaluateExecutionTrajectory([], executedCalls);

        if (trajectories.length === 0) {
          const result: TestResult = { test, response: null, outcome: "pass" };
          testResults.push(result);
          passCount++;
          if (onEvent) {
            onEvent({ type: "progress", testNumber: testCount, result });
          }
        } else {
          for (const traj of trajectories) {
            const stepResult: TestResult = {
              test: {
                messages: test.messages,
                expectedCall: traj.expected ? [traj.expected] : null,
              },
              response: traj.actual,
              outcome: traj.outcome,
            };
            testResults.push(stepResult);
            if (traj.outcome === "pass") {
              passCount++;
            } else {
              failCount++;
            }

            if (onEvent) {
              onEvent({ type: "progress", testNumber: testCount, result: stepResult });
            }
          }
        }
      }
    } catch {
      errorCount++;
      const result: TestResult = {
        test,
        response: null as any,
        outcome: "error",
      };
      testResults.push(result);
      if (onEvent) {
        onEvent({ type: "progress", testNumber: testCount, result });
      }
    }
  }

  return {
    results: testResults,
    testCount,
    passCount,
    failCount,
    errorCount,
  };
}

// FIXME: This needs to be adapted in similar way to executeLocalEvals when we add support for backends other than Vercel
export async function executeInBrowserEvals(
  tests: Array<Eval>,
  tools: Array<Tool>,
  config: WebmcpConfig,
  onEvent?: (event: RunEvent) => void,
): Promise<TestResults> {
  if (config.backend !== "vercel") {
    throw new Error(
      `executeInBrowserEvals only supports the 'vercel' backend because it relies on the Vercel AI SDK ToolLoopAgent framework. You provided '${config.backend}'.`,
    );
  }

  let backendImpl = new VercelBackend(config, tools);
  return await backendImpl.executeInBrowserEvals(tests, tools, config, onEvent);
}
