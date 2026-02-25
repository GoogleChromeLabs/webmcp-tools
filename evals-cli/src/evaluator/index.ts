import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, TestResult, TestResults } from "../types/evals.js";
import { Tool } from "../types/tools.js";
import { functionCallOutcome } from "../utils.js";

import { GeminiBackend } from "../backends/gemini.js";
import { Backend, RunEvent } from "../backends/index.js";
import { OllamaBackend } from "../backends/ollama.js";
import { VercelBackend } from "../backends/vercel.js";
import { listToolsFromPage } from "./browser.js";
import { getModel } from "./models.js";
import { SYSTEM_PROMPT } from "./prompts.js";

export { listToolsFromPage };

export async function executeLocalEvals(
  tests: Array<Eval>,
  tools: Array<Tool>,
  config: Config | WebmcpConfig,
  onEvent?: (event: RunEvent) => void
): Promise<TestResults> {
  const model = getModel(config);

  const totalSteps = tests.reduce((sum, test) => {
    return sum + (Array.isArray(test.expectedCall) ? test.expectedCall.length : 1);
  }, 0);

  let testCount = 0;
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  const testResults: Array<TestResult> = [];

  let backendImpl: Backend;
  if (config.backend === 'gemini') {
    const apiKey = process.env.GOOGLE_AI || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("Missing Google API key");
    backendImpl = new GeminiBackend(apiKey, config.model || "gemini-2.5-flash", SYSTEM_PROMPT, tools);
  } else if (config.backend === 'ollama') {
    const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    backendImpl = new OllamaBackend(host, config.model || "qwen2.5:14b", SYSTEM_PROMPT, tools);
  } else {
    // Vercel
    backendImpl = new VercelBackend(config, tools);
  }

  if (onEvent) {
    onEvent({ type: 'start', total: totalSteps, message: `Running evals using ${backendImpl.describe()}` });
  }
  for (const test of tests) {
    testCount++;
    try {
      const response = await backendImpl.executeLocalEvals(test);

      const outcome = functionCallOutcome(Array.isArray(test.expectedCall) ? test.expectedCall[0] : test.expectedCall, response);
      const result: TestResult = { test, response, outcome };
      testResults.push(result);
      outcome === "pass" ? passCount++ : failCount++;

      if (onEvent) {
        onEvent({ type: 'progress', testNumber: testCount, result });
      }
    } catch (e: any) {
      errorCount++;
      const result: TestResult = {
        test,
        response: null as any,
        outcome: "error"
      };
      testResults.push(result);
      if (onEvent) {
        onEvent({ type: 'progress', testNumber: testCount, result });
      }
    }
  }

  return {
    results: testResults,
    testCount,
    passCount,
    failCount,
    errorCount
  };
}

// FIXME: This needs to be adapted in similar way to executeLocalEvals when we add support for backends other than Vercel
export async function executeInBrowserEvals(
  tests: Array<Eval>,
  tools: Array<Tool>,
  config: WebmcpConfig,
  onEvent?: (event: RunEvent) => void
): Promise<TestResults> {
  if (config.backend !== 'vercel') {
    throw new Error(`executeInBrowserEvals only supports the 'vercel' backend because it relies on the Vercel AI SDK ToolLoopAgent framework. You provided '${config.backend}'.`);
  }

  let backendImpl = new VercelBackend(config, tools);
  return await backendImpl.executeInBrowserEvals(tests, tools, config, onEvent);
}
