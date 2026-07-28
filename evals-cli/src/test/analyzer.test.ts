/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the report analyzer.
 * These tests run only locally and offline without requiring a live LLM connection or API keys.
 * They verify the eval source report data validation, title formatting, and payload optimization.
 * They do NOT check the LLM's reasoning outputs.
 */

import * as assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import * as ai from "ai";
import {
  formatShortTitle,
  readEvalReportJson,
  analyzeEvalReport,
  ANALYZER_MODEL_DEFAULT,
} from "../analyzer/index.js";

describe("Analyzer Core Functions", () => {
  describe("formatShortTitle", () => {
    it("should truncate long timestamps inside the title string", () => {
      const input = "report-1785141576397-run";
      const expected = "report-17...576397-run";
      assert.strictEqual(formatShortTitle(input), expected);
    });
  });

  describe("readEvalReportJson validation", () => {
    // Temporary test folder used to generate temporary test fixtures.
    // Files are written dynamically and cleaned up later
    const tempDir = path.resolve(process.cwd(), ".evals-test-temp");

    it("should throw error on unsupported file extension", async () => {
      await assert.rejects(
        () => readEvalReportJson("test-report.txt"),
        /Unsupported report file extension: "\.txt"/,
      );
    });

    it("should throw error if JSON report file is missing", async () => {
      await assert.rejects(
        () => readEvalReportJson(".evals-test-temp/non-existent.json"),
        /Failed to read JSON report/,
      );
    });

    it("should throw error on malformed JSON file", async () => {
      const malformedPath = path.join(tempDir, "malformed.json");
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(malformedPath, "{ invalid json", "utf-8");

      try {
        await assert.rejects(
          () => readEvalReportJson(malformedPath),
          /Failed to parse JSON report/,
        );
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should throw error if report structure is missing config or results", async () => {
      const invalidPath = path.join(tempDir, "invalid-structure.json");
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(invalidPath, JSON.stringify({ config: {} }), "utf-8"); // missing results

      try {
        await assert.rejects(() => readEvalReportJson(invalidPath), /Invalid report structure/);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should successfully fall back to JSON file when HTML path is passed", async () => {
      const jsonPath = path.join(tempDir, "report-12345.json");
      const htmlPath = path.join(tempDir, "report-12345.html");
      await fs.mkdir(tempDir, { recursive: true });

      const reportData = {
        config: { url: "http://test" },
        results: { results: [] },
      };

      await fs.writeFile(jsonPath, JSON.stringify(reportData), "utf-8");
      // Write a dummy HTML file just to make sure it exists or passes setup
      await fs.writeFile(htmlPath, "<html></html>", "utf-8");

      try {
        const parsed = await readEvalReportJson(htmlPath);
        assert.deepStrictEqual(parsed, reportData);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("analyzeEvalReport availableTools deduplication", () => {
    // Temporary test folder used to generate temporary test fixtures.
    // Files are written dynamically and cleaned up later
    const tempDir = path.resolve(process.cwd(), ".evals-test-temp");

    it("should deduplicate availableTools and place them once at results level", async (t) => {
      await fs.mkdir(tempDir, { recursive: true });
      const jsonPath = path.join(tempDir, "report-dedup.json");

      const dummyTool1 = { functionName: "tool1", description: "First Tool" };
      const dummyTool2 = { functionName: "tool2", description: "Second Tool" };

      const reportData = {
        config: { url: "http://test" },
        results: {
          results: [
            {
              trajectory: [
                {
                  text: "step 1",
                  availableTools: [dummyTool1, dummyTool2],
                },
                {
                  text: "step 2",
                  availableTools: [dummyTool1], // duplicate
                },
              ],
            },
          ],
        },
      };

      await fs.writeFile(jsonPath, JSON.stringify(reportData), "utf-8");

      let capturedPromptPayload: any = null;
      const mockModel = {
        modelId: "mock-model",
        specificationVersion: "v2" as const,
        provider: "mock-provider",
        doGenerate: async (options: any) => {
          capturedPromptPayload = options;
          return {
            text: "Mocked analysis output text.",
            content: [{ type: "text" as const, text: "Mocked analysis output text." }],
            finishReason: "stop" as const,
            usage: { promptTokens: 10, completionTokens: 10 },
            rawCall: { rawPrompt: null, rawSettings: {} },
            responseMessages: [],
          };
        },
      };

      try {
        const result = await analyzeEvalReport(jsonPath, { model: ANALYZER_MODEL_DEFAULT } as any, {
          _testModel: mockModel,
          // Injects a dummy/mock model object during unit tests to avoid making real LLM API calls
        });

        assert.strictEqual(result, "Mocked analysis output text.");
        assert.ok(capturedPromptPayload, "model.doGenerate was not called");
        assert.ok(capturedPromptPayload.prompt, "prompt inputs were missing");

        const userMsg = capturedPromptPayload.prompt.find((msg: any) => msg.role === "user");
        assert.ok(userMsg, "User message not found in model input");
        const promptText = userMsg.content[0].text;

        // Extract the JSON report stringified in the prompt
        const jsonMatch = promptText.match(/```json\n([\s\S]+?)\n```/);
        assert.ok(jsonMatch, "Prompt should contain the JSON payload block");

        const parsedPayload = JSON.parse(jsonMatch[1]);

        // Verify availableTools was deleted from individual steps
        const step1 = parsedPayload.results.results[0].trajectory[0];
        const step2 = parsedPayload.results.results[0].trajectory[1];
        assert.strictEqual(step1.availableTools, undefined);
        assert.strictEqual(step2.availableTools, undefined);

        // Verify unique list is at results level
        assert.deepStrictEqual(parsedPayload.results.availableTools, [dummyTool1, dummyTool2]);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
