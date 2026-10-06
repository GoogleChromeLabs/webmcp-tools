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

/**
 * Gemini function declaration (subset of the OpenAPI schema supported by the API).
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Gemini content part. Unknown fields (e.g. thoughtSignature) are preserved so model turns
 * can be echoed back verbatim in multi-turn function calling.
 */
export interface Part {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [key: string]: unknown;
}

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface TurnOptions extends GenerateOptions {
  tools?: FunctionDeclaration[];
  /** Function calling mode; "NONE" forces a text-only answer even when tools are declared. */
  functionCallingMode?: "AUTO" | "NONE";
}

export interface TurnResult extends GenerationResult {
  parts: Part[];
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

/**
 * Error indicating a client-side or non-transient API failure that cannot succeed on retry
 * (e.g. 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found).
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/**
 * Sleeps for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Concatenates the visible text parts of a model response, skipping thought summaries.
 */
export function extractText(parts: Part[]): string {
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
}

/**
 * Generates content using Google Gemini API with native fetch and exponential backoff retry.
 */
export async function generateContent(
  prompt: string,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const { text, timing } = await generateTurn(
    [{ role: "user", parts: [{ text: prompt }] }],
    options,
  );
  return { text, timing };
}

/**
 * Sends one request for a multi-turn conversation, optionally declaring function tools.
 * Returns all response parts so callers can detect and answer function calls.
 */
export async function generateTurn(
  contents: Content[],
  options: TurnOptions = {},
): Promise<TurnResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const isMock = options.mock || !apiKey;

  if (isMock) {
    // Deterministic mock generation for offline / dry-run / testing (never calls tools)
    const firstUserText = contents.find((c) => c.role === "user")?.parts[0]?.text ?? "";
    const text = `[MOCK OUTPUT] Response to: ${firstUserText.slice(0, 80)}...`;
    return {
      text,
      parts: [{ text }],
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
    contents,
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

  if (options.tools && options.tools.length > 0) {
    requestBody.tools = [{ functionDeclarations: options.tools }];
    requestBody.toolConfig = {
      functionCallingConfig: { mode: options.functionCallingMode ?? "AUTO" },
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

      // Only retry transient rate limits (429) or transient server errors (500, 502, 503, 504)
      if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
        const errorText = await response.text().catch(() => "");
        lastError = new Error(`Gemini API transient error (${response.status}): ${errorText}`);
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 0;
        const delay = Math.max(retryAfterMs, Math.pow(2, attempt) * 2000 + Math.random() * 1000);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        // Non-transient client errors (e.g. 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found)
        // will never succeed upon retry. Fail immediately without retrying.
        throw new NonRetryableError(`Gemini API client error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const parts: Part[] = data?.candidates?.[0]?.content?.parts || [];
      const usage = data?.usageMetadata || {};

      return {
        text: extractText(parts),
        parts,
        timing: {
          duration_ms: durationMs,
          total_tokens: usage.totalTokenCount || 0,
          prompt_tokens: usage.promptTokenCount || 0,
          candidate_tokens: usage.candidatesTokenCount || 0,
        },
      };
    } catch (err) {
      if (err instanceof NonRetryableError) {
        throw err;
      }
      lastError = err as Error;
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  throw lastError || new Error("Failed to generate content after retries");
}
