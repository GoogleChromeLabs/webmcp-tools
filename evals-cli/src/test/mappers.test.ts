/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  mapJsonSchemaToVercelTools,
  mapMessages,
  mapRawBrowserToolsToConfig,
  sanitizeSchema,
} from "../evaluator/mappers.js";
import { Tool } from "../types/tools.js";

describe("mappers", () => {
  describe("sanitizeSchema", () => {
    it("should strip oneOf and anyOf from schemas", () => {
      const input = {
        type: "object",
        properties: {
          guests: {
            type: "string",
            oneOf: [{ const: "1", title: "1 Person" }],
            enum: ["1", "2"],
          },
          nested: {
            anyOf: [{ type: "string" }],
          },
        },
      };

      const output = sanitizeSchema(input);

      assert.deepStrictEqual(output, {
        type: "object",
        properties: {
          guests: {
            type: "string",
            enum: ["1", "2"],
          },
          nested: {},
        },
      });
    });

    it("should safely handle null or raw schemas", () => {
      assert.deepStrictEqual(sanitizeSchema(null), null);
      assert.deepStrictEqual(sanitizeSchema("string"), "string");
      assert.deepStrictEqual(sanitizeSchema({}), {});
    });
  });

  describe("mapMessages", () => {
    it("should map user and model text messages", () => {
      const input = [
        { role: "user", type: "message", content: "Hello" },
        { role: "model", type: "message", content: "Hi there!" },
      ];

      const output = mapMessages(input);

      assert.deepStrictEqual(output, [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ]);
    });

    it("should map functioncall messages into tool-call assistant role", () => {
      const input = [
        {
          role: "model",
          type: "functioncall",
          name: "search_product",
          arguments: { query: "shoes" },
        },
      ];

      const output = mapMessages(input);

      assert.deepStrictEqual(output, [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolName: "search_product",
              toolCallId: "call-search_product",
              input: { query: "shoes" },
            },
          ],
        },
      ]);
    });

    it("should map functionresponse messages into tool-result tool role", () => {
      const input = [
        {
          role: "user",
          type: "functionresponse",
          name: "search_product",
          response: { result: [{ id: "1", name: "Shoe" }] },
        },
      ];

      const output = mapMessages(input);

      assert.deepStrictEqual(output, [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolName: "search_product",
              toolCallId: "call-search_product",
              output: { type: "json", value: [{ id: "1", name: "Shoe" }] },
            },
          ],
        },
      ]);
    });
  });

  describe("mapJsonSchemaToVercelTools", () => {
    it("should map tools into AI SDK tool shapes", () => {
      const tools: Tool[] = [
        {
          functionName: "search",
          description: "Search items",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      ];

      const mapped = mapJsonSchemaToVercelTools(tools);

      assert.strictEqual(typeof mapped.search, "object");
      assert.strictEqual(mapped.search.description, "Search items");
      assert.strictEqual(mapped.search.execute, undefined);
    });

    it("should attach execute function when execute callback is provided", async () => {
      let executedName = "";
      let executedArgs: any = null;
      const executeFn = (name: string, args: unknown) => {
        executedName = name;
        executedArgs = args;
        return { success: true };
      };

      const tools: Tool[] = [
        {
          functionName: "add_item",
          description: "Add an item",
          parameters: {},
        },
      ];

      const mapped = mapJsonSchemaToVercelTools(tools, executeFn);
      assert.strictEqual(typeof mapped.add_item.execute, "function");

      const res = await mapped.add_item.execute({ id: 123 });
      assert.strictEqual(executedName, "add_item");
      assert.deepStrictEqual(executedArgs, { id: 123 });
      assert.deepStrictEqual(res, { success: true });
    });
  });

  describe("mapRawBrowserToolsToConfig", () => {
    it("should map raw browser tools with parsed JSON schemas", () => {
      const rawTools = [
        {
          name: "search_gear",
          description: "Search for gear",
          inputSchema: JSON.stringify({ type: "object", properties: { item: { type: "string" } } }),
        },
        {
          name: "get_cart",
          description: "Get current cart",
          inputSchema: { type: "object" },
        },
      ];
      const fallbackTools: Tool[] = [];

      const result = mapRawBrowserToolsToConfig(rawTools, fallbackTools);

      assert.deepStrictEqual(result, [
        {
          functionName: "search_gear",
          description: "Search for gear",
          parameters: { type: "object", properties: { item: { type: "string" } } },
        },
        {
          functionName: "get_cart",
          description: "Get current cart",
          parameters: { type: "object" },
        },
      ]);
    });

    it("should fallback when rawTools is empty or missing", () => {
      const fallbackTools: Tool[] = [
        { functionName: "default_tool", description: "Default", parameters: {} },
      ];

      assert.deepStrictEqual(mapRawBrowserToolsToConfig([], fallbackTools), fallbackTools);
      assert.deepStrictEqual(mapRawBrowserToolsToConfig(null as any, fallbackTools), fallbackTools);
    });

    it("should handle invalid JSON inputSchema gracefully", () => {
      const rawTools = [
        {
          name: "faulty_tool",
          description: "Faulty schema",
          inputSchema: "invalid-json{",
        },
      ];
      const result = mapRawBrowserToolsToConfig(rawTools, []);

      assert.deepStrictEqual(result, [
        {
          functionName: "faulty_tool",
          description: "Faulty schema",
          parameters: {},
        },
      ]);
    });
  });
});
