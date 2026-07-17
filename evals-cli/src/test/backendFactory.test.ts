/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it, before, after } from "node:test";
import { createBackend } from "../backends/factory.js";
import { GeminiBackend } from "../backends/gemini.js";
import { OllamaBackend } from "../backends/ollama.js";
import { VercelBackend } from "../backends/vercel.js";
import { Tool } from "../types/tools.js";

describe("Backend Factory", () => {
  const sampleTools: Tool[] = [];
  let originalEnv: NodeJS.ProcessEnv;

  before(() => {
    // Preserve process.env
    originalEnv = { ...process.env };
  });

  after(() => {
    // Restore process.env
    process.env = originalEnv;
  });

  it("should create VercelBackend as a default case", () => {
    const config = {
      backend: "vercel",
      model: "openai:gpt-4o",
      toolSchemaFile: "dummy.json",
      evalsFile: "dummy.json",
    };
    const backend = createBackend(config, sampleTools);
    assert.ok(backend instanceof VercelBackend);
    assert.strictEqual(backend.describe().includes("Vercel Backend"), true);
  });

  it("should create OllamaBackend when backend is ollama", () => {
    const config = {
      backend: "ollama",
      model: "qwen2.5",
      toolSchemaFile: "dummy.json",
      evalsFile: "dummy.json",
    };
    const backend = createBackend(config, sampleTools);
    assert.ok(backend instanceof OllamaBackend);
    assert.strictEqual(backend.describe().includes("Ollama Backend"), true);
  });

  it("should throw error if Gemini backend is selected but no api key is in env", () => {
    delete process.env.GOOGLE_AI;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    const config = {
      backend: "gemini",
      model: "gemini-2.5-pro",
      toolSchemaFile: "dummy.json",
      evalsFile: "dummy.json",
    };
    assert.throws(
      () => {
        createBackend(config, sampleTools);
      },
      { message: "Missing Google API key" },
    );
  });

  it("should create GeminiBackend when gemini backend is selected and API key is present", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const config = {
      backend: "gemini",
      model: "gemini-2.5-pro",
      toolSchemaFile: "dummy.json",
      evalsFile: "dummy.json",
    };
    const backend = createBackend(config, sampleTools);
    assert.ok(backend instanceof GeminiBackend);
    assert.strictEqual(backend.describe().includes("Gemini Backend"), true);
  });
});
