/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { OllamaBackend } from "../backends/ollama.js";
import { Eval } from "../types/evals.js";
import { Tool } from "../types/tools.js";
import { LocalToolRegistry } from "../evaluator/toolRegistry.js";
import { MockResolver } from "../evaluator/mockResolver.js";

describe("OllamaBackend", () => {
  const sampleTools: Tool[] = [
    {
      functionName: "search_product",
      description: "Search for a product",
      parameters: { type: "object", properties: { query: { type: "string" } } },
    },
  ];

  it("should return correct description", () => {
    const backend = new OllamaBackend("http://127.0.0.1:11434", "qwen2.5:14b", "System prompt");
    assert.strictEqual(backend.describe(), "Ollama Backend using model: qwen2.5:14b");
  });

  it("should throw not implemented for executeInBrowserEval", () => {
    const backend = new OllamaBackend("http://127.0.0.1:11434", "qwen2.5:14b", "System prompt");
    assert.rejects(
      async () => {
        await backend.executeInBrowserEval({} as any, {} as any, {} as any);
      },
      { message: "Method not implemented." },
    );
  });

  it("should execute local evals and return tool calls when Ollama returns tool_calls", async () => {
    const backend = new OllamaBackend("http://127.0.0.1:11434", "qwen2.5:14b", "System prompt");

    let passedRequest: any = null;
    (backend as any).ollama = {
      chat: async (request: any) => {
        passedRequest = request;
        return {
          message: {
            tool_calls: [
              {
                function: {
                  name: "search_product",
                  arguments: { query: "helmet" },
                },
              },
            ],
          },
        };
      },
    };

    const testEval: Eval = {
      name: "Ollama search test",
      messages: [{ role: "user", type: "message", content: "Find helmet" }],
      expectedCall: null,
    };

    const resolver = new MockResolver(testEval.expectedCall);
    const registry = new LocalToolRegistry(sampleTools, resolver);
    const result = await backend.executeLocalEvals(testEval, registry);

    assert.strictEqual(passedRequest.model, "qwen2.5:14b");
    assert.strictEqual(passedRequest.messages[0].role, "system");
    assert.strictEqual(passedRequest.messages[0].content, "System prompt");
    assert.deepStrictEqual(result, {
      toolCalls: [
        {
          functionName: "search_product",
          args: { query: "helmet" },
        },
      ],
      text: undefined,
    });
  });

  it("should execute local evals and return text fallback when tool_calls is missing", async () => {
    const backend = new OllamaBackend("http://127.0.0.1:11434", "qwen2.5:14b", "System prompt");

    (backend as any).ollama = {
      chat: async () => {
        return {
          message: {
            content: "Hello",
          },
        };
      },
    };

    const testEval: Eval = {
      name: "Ollama text test",
      messages: [{ role: "user", type: "message", content: "Hi" }],
      expectedCall: null,
    };

    const resolver = new MockResolver(testEval.expectedCall);
    const registry = new LocalToolRegistry(sampleTools, resolver);
    const result = await backend.executeLocalEvals(testEval, registry);
    assert.deepStrictEqual(result, { toolCalls: [], text: "Hello" });
  });
});
