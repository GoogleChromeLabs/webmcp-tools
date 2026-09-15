/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockLanguageModelV3 } from "ai/test";

/**
 * A model that always answers with the same text, for tests that care about
 * what was sent to it or what was made of its reply.
 *
 * The nested `usage` and `finishReason` shapes below are what the v3 provider
 * spec requires; they carry no meaning for any test and exist only to satisfy
 * it. Not a `.test.ts` file, so the runner does not pick it up.
 */
export function mockModelReplying(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
}
