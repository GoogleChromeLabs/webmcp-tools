/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { GeminiBackend } from "../backends/gemini.js";
import { Eval } from "../types/evals.js";
import { Tool } from "../types/tools.js";
import { LocalToolRegistry } from "../evaluator/toolRegistry.js";
import { MockResolver } from "../evaluator/mockResolver.js";

describe("GeminiBackend", () => {
  const sampleTools: Tool[] = [
    {
      functionName: "search_product",
      description: "Search for a product",
      parameters: { type: "object", properties: { query: { type: "string" } } },
    },
  ];

  it("should return correct description", () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt");
    assert.strictEqual(backend.describe(), "Gemini Backend using model: gemini-3.5-flash");
  });

  it("should throw not implemented for executeInBrowserEval", () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt");
    assert.rejects(
      async () => {
        await backend.executeInBrowserEval({} as any, {} as any);
      },
      { message: "Method not implemented." },
    );
  });

  it("should execute local evals and return tool calls when functionCalls response exists", async () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt");

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
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: "search_product",
                        args: { query: "running shoes" },
                      },
                    },
                  ],
                },
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

    const resolver = new MockResolver(testEval.expectedCall);
    const registry = new LocalToolRegistry(sampleTools, resolver);
    const result = await backend.executeLocalEvals(testEval, registry);
    assert.deepStrictEqual(result, {
      toolCalls: [
        {
          functionName: "search_product",
          args: { query: "running shoes" },
        },
      ],
      text: undefined,
    });
  });

  it("should execute local evals and return text fallback when no function calls returned", async () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt");

    (backend as any).googleGenAI = {
      models: {
        generateContent: async (_request: any) => {
          return {
            functionCalls: null,
            candidates: [
              {
                content: {
                  parts: [{ text: "No tool calls generated." }],
                },
              },
            ],
          };
        },
      },
    };

    const testEval: Eval = {
      name: "Search test",
      messages: [{ role: "user", type: "message", content: "Hello" }],
      expectedCall: null,
    };

    const resolver = new MockResolver(testEval.expectedCall);
    const registry = new LocalToolRegistry(sampleTools, resolver);
    const result = await backend.executeLocalEvals(testEval, registry);
    assert.deepStrictEqual(result, { toolCalls: [], text: "No tool calls generated." });
  });

  it("maps outputSchema to responseJsonSchema and omits it when null (keyless stub)", async () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt");
    let passedRequest: any = null;
    (backend as any).googleGenAI = {
      models: {
        generateContent: async (request: any) => {
          passedRequest = request;
          return { functionCalls: null, candidates: [{ content: { parts: [{ text: "ok" }] } }] };
        },
      },
    };

    const toolsWithOutput: Tool[] = [
      {
        functionName: "search_flights",
        description: "Search flights",
        parameters: { type: "object", properties: { from: { type: "string" } } },
        outputSchema: {
          type: "object",
          properties: { flight_id: { type: "string" } },
          required: ["flight_id"],
        },
      },
      {
        functionName: "initiate_booking",
        description: "Start booking",
        parameters: { type: "object", properties: {} },
        outputSchema: null,
      },
    ];

    const testEval: Eval = {
      name: "outputSchema capture",
      messages: [{ role: "user", type: "message", content: "Find flights" }],
      expectedCall: null,
    };
    const resolver = new MockResolver(testEval.expectedCall);
    const registry = new LocalToolRegistry(toolsWithOutput, resolver);
    await backend.executeLocalEvals(testEval, registry);

    const decls = passedRequest.config.tools[0].functionDeclarations;
    assert.deepStrictEqual(decls[0].responseJsonSchema, {
      type: "object",
      properties: { flight_id: { type: "string" } },
      required: ["flight_id"],
    });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(decls[1], "responseJsonSchema"), false);
  });

  it("should map multi-turn messages correctly during API execution", async () => {
    const backend = new GeminiBackend("dummy-api-key", "gemini-3.5-flash", "System prompt");

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
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: "search_product",
                        args: {},
                      },
                    },
                  ],
                },
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
        {
          role: "model",
          type: "functioncall",
          name: "search_product",
          arguments: { query: "soccer" },
        },
        { role: "user", type: "functionresponse", name: "search_product", response: { count: 3 } },
      ],
      expectedCall: null,
    };

    const resolver = new MockResolver(testEval.expectedCall);
    const registry = new LocalToolRegistry(sampleTools, resolver);
    await backend.executeLocalEvals(testEval, registry);

    assert.strictEqual(passedRequest.model, "gemini-3.5-flash");
    assert.strictEqual(passedRequest.config.systemInstruction, "System prompt");
    assert.deepStrictEqual(passedRequest.contents, [
      { role: "user", parts: [{ text: "Search soccer ball" }] },
      {
        role: "model",
        parts: [{ functionCall: { name: "search_product", args: { query: "soccer" } } }],
      },
      {
        role: "user",
        parts: [{ functionResponse: { name: "search_product", response: { count: 3 } } }],
      },
    ]);
  });
});
