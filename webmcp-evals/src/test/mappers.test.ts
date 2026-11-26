/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  collectSchemaProjectionSummaries,
  collectSchemaProjectionsFromResults,
  formatSchemaProjectionReport,
  mapJsonSchemaToVercelTools,
  mapMessages,
  mapRawBrowserToolsToConfig,
  mapToolSchemaEntriesToTools,
  sanitizeSchema,
  sanitizeSchemaWithDiagnostics,
} from "../evaluator/mappers.js";
import { Tool } from "../types/tools.js";
import { WebMCPTool } from "puppeteer-core";

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

    it("reports stripped oneOf/anyOf paths without mutating the source", () => {
      const input = {
        type: "object",
        properties: {
          guests: { type: "string", oneOf: [{ const: "1" }] },
          nested: { anyOf: [{ type: "string" }] },
        },
      };
      const before = JSON.stringify(input);
      const { sanitized, diagnostic } = sanitizeSchemaWithDiagnostics(input);
      assert.strictEqual(JSON.stringify(input), before);
      assert.ok(diagnostic.strippedOneOfPaths.some((p) => p.includes("guests")));
      assert.ok(diagnostic.strippedAnyOfPaths.some((p) => p.includes("nested")));
      assert.deepStrictEqual(sanitized.properties.nested, {});
    });
  });

  describe("mapToolSchemaEntriesToTools", () => {
    it("preserves outputSchema objects and nulls", () => {
      const mapped = mapToolSchemaEntriesToTools([
        {
          name: "search_flights",
          description: "Search",
          inputSchema: { type: "object" },
          outputSchema: {
            type: "object",
            properties: { flight_id: { type: "string" } },
          },
        },
        {
          name: "initiate_booking",
          description: "Book",
          inputSchema: { type: "object" },
          outputSchema: null,
        },
      ]);
      assert.deepStrictEqual(mapped[0].outputSchema, {
        type: "object",
        properties: { flight_id: { type: "string" } },
      });
      assert.strictEqual(mapped[1].outputSchema, null);
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
    it("should map raw browser tools", () => {
      const rawTools = [
        {
          name: "search_gear",
          description: "Search for gear",
          inputSchema: { type: "object", properties: { item: { type: "string" } } },
        },
        {
          name: "get_cart",
          description: "Get current cart",
          inputSchema: { type: "object" },
        },
        {
          name: "add_to_cart",
          description: "Add to cart",
          inputSchema: undefined,
        },
      ] as WebMCPTool[];

      const result = mapRawBrowserToolsToConfig(rawTools);

      assert.deepStrictEqual(result, [
        {
          functionName: "search_gear",
          description: "Search for gear",
          parameters: { type: "object", properties: { item: { type: "string" } } },
          outputSchema: null,
        },
        {
          functionName: "get_cart",
          description: "Get current cart",
          parameters: { type: "object" },
          outputSchema: null,
        },
        {
          functionName: "add_to_cart",
          description: "Add to cart",
          parameters: {},
          outputSchema: null,
        },
      ]);
    });

    it("preserves outputSchema when the browser tool supplies it", () => {
      // Simulates a future Puppeteer field — not evidence that #15579 shipped.
      const rawTools = [
        {
          name: "search_flights",
          description: "Search flights",
          inputSchema: { type: "object" },
          outputSchema: {
            type: "object",
            properties: { flight_id: { type: "string" } },
          },
        },
      ] as unknown as WebMCPTool[];
      const result = mapRawBrowserToolsToConfig(rawTools);
      assert.deepStrictEqual(result[0].outputSchema, {
        type: "object",
        properties: { flight_id: { type: "string" } },
      });
    });
  });

  describe("schema projection reporting", () => {
    it("surfaces stripped paths from tools after mapJsonSchemaToVercelTools", () => {
      const tools: Tool[] = [
        {
          functionName: "book",
          description: "Book",
          parameters: {
            type: "object",
            properties: {
              guests: { type: "string", oneOf: [{ const: "1" }] },
              seat: { anyOf: [{ type: "string" }] },
            },
          },
        },
        {
          functionName: "plain",
          description: "Plain",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      ];
      mapJsonSchemaToVercelTools(tools);
      const summaries = collectSchemaProjectionSummaries(tools);
      assert.strictEqual(summaries.length, 1);
      assert.strictEqual(summaries[0]!.functionName, "book");
      assert.ok(summaries[0]!.strippedOneOfPaths.some((p) => p.includes("guests")));
      assert.ok(summaries[0]!.strippedAnyOfPaths.some((p) => p.includes("seat")));

      const lines = formatSchemaProjectionReport(summaries);
      assert.strictEqual(lines.length, 1);
      assert.match(lines[0]!, /book: stripped/);
      assert.match(lines[0]!, /oneOf@/);
      assert.match(lines[0]!, /anyOf@/);
    });

    it("collects unique projections from trajectory availableTools", () => {
      const tool: Tool = {
        functionName: "book",
        description: "Book",
        parameters: {},
        schemaProjection: {
          strippedOneOfPaths: ["properties.guests"],
          strippedAnyOfPaths: [],
        },
      };
      const fromResults = collectSchemaProjectionsFromResults({
        results: [
          { trajectory: [{ availableTools: [tool] }, { availableTools: [tool] }] },
          { trajectory: [{ availableTools: [{ ...tool, functionName: "alpha" }] }] },
        ],
      });
      assert.deepStrictEqual(
        fromResults.map((s) => s.functionName),
        ["alpha", "book"],
      );
    });
  });
});
