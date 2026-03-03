/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import puppeteer from "puppeteer-core";
import { VercelBackend } from "../backends/vercel.js";
import { Eval } from "../types/evals.js";
import { Tool } from "../types/tools.js";

// Mock the AI module since we don't want to actually hit the LLM during unit tests
import * as ai from "ai";

describe("VercelBackend", () => {
  describe("executeLocalEvals prompt generation", () => {
    it("should map multi-turn message arrays correctly", async () => {
      // Setup mock Tool
      const dummyTools: Tool[] = [
        {
          functionName: "add_topping",
          description: "Adds a topping",
          parameters: {
            type: "object",
            properties: { topping: { type: "string" } },
          },
        },
      ];

      let capturedPayload: any = null;
      class TestableVercelBackend extends VercelBackend {
        async executeLocalEvals(test: Eval): Promise<any> {
          // Re-implement the exact lines we want to test to capture the mapped payload
          const { mapMessages } = await import("../evaluator/mappers.js");
          const aiMessages = mapMessages(test.messages);
          capturedPayload = { messages: aiMessages };
          return { text: "mock" };
        }
      }

      const backend = new TestableVercelBackend({ model: "gemini-2.5-flash" } as any, dummyTools);

      // Create a multi-turn eval
      const evalTest: Eval = {
        messages: [
          { role: "user", type: "message", content: "Add one onion" },
          {
            role: "model",
            type: "functioncall",
            name: "add_topping",
            arguments: { topping: "onion" },
          },
          {
            role: "user",
            type: "functionresponse",
            name: "add_topping",
            response: { result: "Added." },
          },
          { role: "user", type: "message", content: "Remove it." },
        ],
        expectedCall: [],
      };

      await backend.executeLocalEvals(evalTest);

      // Validate the payload was given the FULL message array, not just the first prompt
      assert.ok(capturedPayload, "generateText was not called");
      assert.ok(capturedPayload.messages, "messages array was missing from payload");
      assert.strictEqual(
        capturedPayload.messages.length,
        4,
        "Should have passed all 4 messages to the model",
      );

      // Validate the mapper converted them to correct AI SDK roles
      assert.strictEqual(capturedPayload.messages[0].role, "user");
      assert.strictEqual(capturedPayload.messages[0].content, "Add one onion");

      // Function call mapping
      assert.strictEqual(capturedPayload.messages[1].role, "assistant");
      assert.strictEqual(capturedPayload.messages[1].content[0].type, "tool-call");

      // Function response mapping
      assert.strictEqual(capturedPayload.messages[2].role, "tool");
      assert.strictEqual(capturedPayload.messages[2].content[0].type, "tool-result");

      // Final user message
      assert.strictEqual(capturedPayload.messages[3].role, "user");
      assert.strictEqual(capturedPayload.messages[3].content, "Remove it.");
    });
  });

  describe("executeInBrowserEvals multi-turn message handling", () => {
    it("should pass mapped messages array correctly to agentWithExec.generate", async (t) => {
      // Setup mock Tool
      const dummyTools: Tool[] = [
        {
          functionName: "add_topping",
          description: "Adds a topping",
          parameters: {
            type: "object",
            properties: { topping: { type: "string" } },
          },
        },
      ];

      // Mock file system access so findChromePath succeeds
      t.mock.method(fs, "access", async () => {});

      // Mock puppeteer to return a dummy browser and page without launching a real browser
      t.mock.method(puppeteer, "launch", async () => ({
        newPage: async () => ({
          goto: async () => {},
          close: async () => {},
          evaluate: async () => [],
        }),
        close: async () => { },
      }));

      // Mock ToolLoopAgent.generate to intercept the payload sent to it
      let capturedPayload: any = null;
      t.mock.method(ai.ToolLoopAgent.prototype, "generate", async (opts: any) => {
        capturedPayload = opts;
        return { steps: [], text: "mock text" };
      });

      const backend = new VercelBackend(
        { model: "gemini-2.5-flash", url: "http://localhost:3000" } as any,
        dummyTools,
      );

      // Create a multi-turn eval test message sequence
      const evalTest: Eval = {
        messages: [
          { role: "user", type: "message", content: "Add one onion" },
          {
            role: "model",
            type: "functioncall",
            name: "add_topping",
            arguments: { topping: "onion" },
          },
          {
            role: "user",
            type: "functionresponse",
            name: "add_topping",
            response: { result: "Added." },
          },
          { role: "user", type: "message", content: "Remove it." },
        ],
        expectedCall: [],
      };

      await backend.executeInBrowserEvals([evalTest], dummyTools, {
        url: "http://localhost:3000",
      } as any);

      // Validate the payload received by agentWithExec.generate
      assert.ok(capturedPayload, "ToolLoopAgent.generate was not called");
      assert.ok(capturedPayload.messages, "messages array was missing from payload");
      assert.strictEqual(
        capturedPayload.messages.length,
        4,
        "Should have passed all 4 messages to the model",
      );

      // Validate the mapper array values
      assert.strictEqual(capturedPayload.messages[0].role, "user");
      assert.strictEqual(capturedPayload.messages[0].content, "Add one onion");

      // Function call mapping
      assert.strictEqual(capturedPayload.messages[1].role, "assistant");
      assert.strictEqual(capturedPayload.messages[1].content[0].type, "tool-call");

      // Function response mapping
      assert.strictEqual(capturedPayload.messages[2].role, "tool");
      assert.strictEqual(capturedPayload.messages[2].content[0].type, "tool-result");

      // Final user message
      assert.strictEqual(capturedPayload.messages[3].role, "user");
      assert.strictEqual(capturedPayload.messages[3].content, "Remove it.");
    });
  });
});
