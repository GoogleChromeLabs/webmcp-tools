/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, WebmcpConfig } from "../types/config.js";
import { Backend } from "./index.js";
import { GeminiBackend } from "./gemini.js";
import { OllamaBackend } from "./ollama.js";
import { VercelBackend } from "./vercel.js";
import { SYSTEM_PROMPT } from "../evaluator/prompts.js";

export function createBackend(config: Config | WebmcpConfig): Backend {
  if (config.backend === "gemini") {
    const apiKey =
      process.env.GOOGLE_AI ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("Missing Google API key");
    return new GeminiBackend(apiKey, config.model || "gemini-3-flash-preview", SYSTEM_PROMPT);
  }

  if (config.backend === "ollama") {
    const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    return new OllamaBackend(host, config.model || "qwen2.5:14b", SYSTEM_PROMPT);
  }

  // Default to Vercel
  return new VercelBackend(config);
}
