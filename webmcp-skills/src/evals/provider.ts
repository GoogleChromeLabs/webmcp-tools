/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Timing } from "./types.js";

export interface GenerateOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  responseMimeType?: string;
  mock?: boolean;
}

export interface GenerationResult {
  text: string;
  timing: Timing;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

/**
 * Sleeps for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates content using Google Gemini API with native fetch and exponential backoff retry.
 */
export async function generateContent(
  prompt: string,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const isMock = options.mock || !apiKey;

  if (isMock) {
    // Deterministic mock generation for offline / dry-run / testing
    return {
      text: `[MOCK OUTPUT] Response to: ${prompt.slice(0, 80)}...`,
      timing: {
        duration_ms: 50,
        total_tokens: 150,
        prompt_tokens: 50,
        candidate_tokens: 100,
      },
    };
  }

  const model = options.model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
    },
  };

  if (options.systemInstruction) {
    requestBody.system_instruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  const maxRetries = 5;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = performance.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (response.status === 429 || response.status === 503) {
        const errorText = await response.text().catch(() => "");
        lastError = new Error(
          `Gemini API rate limit or service unavailable (${response.status}): ${errorText}`,
        );
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 0;
        const delay = Math.max(retryAfterMs, Math.pow(2, attempt) * 2000 + Math.random() * 1000);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const usage = data?.usageMetadata || {};

      return {
        text,
        timing: {
          duration_ms: durationMs,
          total_tokens: usage.totalTokenCount || 0,
          prompt_tokens: usage.promptTokenCount || 0,
          candidate_tokens: usage.candidatesTokenCount || 0,
        },
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  throw lastError || new Error("Failed to generate content after retries");
}
