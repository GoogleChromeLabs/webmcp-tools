/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { GeminiBackend } from "../backends/gemini.js";
import { Eval } from "../types/evals.js";
import { Tool } from "../types/tools.js";

describe("GeminiBackend", () => {
  const sampleTools: Tool[] = [
    {
      functionName: "search_product",
      description: "Search for a product",
      parameters: { type: "object", properties: { query: { type: "string" } } },
    },
  ];

  it("should return correct description", () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt", sampleTools);
    assert.strictEqual(backend.describe(), "Gemini Backend using model: gemini-3.5-flash");
  });

  it("should throw not implemented for executeInBrowserEvals", () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt", sampleTools);
    assert.rejects(
      async () => {
        await backend.executeInBrowserEvals([], sampleTools, {} as any);
      },
      { message: "Method not implemented." },
    );
  });

  it("should execute local evals and return tool calls when functionCalls response exists", async () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt", sampleTools);

    (backend as any).googleGenAI = {
      models: {
        generateContent: async (_request: any) => {
          return {
            functionCalls: [
              {
                name: "search_product",
                args: { query: "running shoes" },
              },
            ],
          };
        },
      },
    };

    const testEval: Eval = {
      name: "Search test",
      messages: [{ role: "user", type: "message", content: "Find running shoes" }],
      expectedCall: null,
    };

    const result = await backend.executeLocalEvals(testEval);
    assert.deepStrictEqual(result, {
      functionName: "search_product",
      args: { query: "running shoes" },
    });
  });

  it("should execute local evals and return text fallback when no function calls returned", async () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt", sampleTools);

    (backend as any).googleGenAI = {
      models: {
        generateContent: async (_request: any) => {
          return {
            functionCalls: null,
          };
        },
      },
    };

    const testEval: Eval = {
      name: "Search test",
      messages: [{ role: "user", type: "message", content: "Hello" }],
      expectedCall: null,
    };

    const result = await backend.executeLocalEvals(testEval);
    assert.deepStrictEqual(result, { text: "No tool calls generated." });
  });

  it("should map multi-turn messages correctly during API execution", async () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt", sampleTools);

    let passedRequest: any = null;
    (backend as any).googleGenAI = {
      models: {
        generateContent: async (request: any) => {
          passedRequest = request;
          return {
            functionCalls: [
              {
                name: "search_product",
                args: {},
              },
            ],
          };
        },
      },
    };

    const testEval: Eval = {
      name: "Multi-turn test",
      messages: [
        { role: "user", type: "message", content: "Search soccer ball" },
        { role: "model", type: "functioncall", name: "search_product", arguments: { query: "soccer" } },
        { role: "user", type: "functionresponse", name: "search_product", response: { count: 3 } },
      ],
      expectedCall: null,
    };

    await backend.executeLocalEvals(testEval);

    assert.strictEqual(passedRequest.model, "gemini-3.5-flash");
    assert.strictEqual(passedRequest.config.systemInstruction, "System prompt");
    assert.deepStrictEqual(passedRequest.contents, [
      { role: "user", parts: [{ text: "Search soccer ball" }] },
      { role: "model", parts: [{ functionCall: { name: "search_product", args: { query: "soccer" } } }] },
      { role: "user", parts: [{ functionResponse: { name: "search_product", response: { count: 3 } } }] },
    ]);
  });
});
