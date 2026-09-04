/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { makeSignaturePreservingFetch } from "../evaluator/googleThoughtSignatures.js";

/**
 * A tiny mock of the global `fetch` that captures the request body it was
 * called with and returns a canned Response. Used to prove the middleware
 * injects/extracts fields at the boundary without hitting a real API.
 */
function makeMockFetch(responseBody: unknown): {
  fetch: typeof fetch;
  capturedRequests: Array<{ url: string; body: string | undefined }>;
} {
  const capturedRequests: Array<{ url: string; body: string | undefined }> = [];
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    capturedRequests.push({
      url: typeof input === "string" ? input : input.toString(),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: mockFetch as any, capturedRequests };
}

describe("makeSignaturePreservingFetch", () => {
  it("passes through when neither request nor response carry signatures", async () => {
    const { fetch: mock, capturedRequests } = makeMockFetch({
      choices: [{ message: { content: "hi", role: "assistant" } }],
    });
    const original = globalThis.fetch;
    globalThis.fetch = mock;
    try {
      const wrapped = makeSignaturePreservingFetch();
      const res = await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
      const parsed = await res.json();
      assert.strictEqual(parsed.choices[0].message.content, "hi");
      assert.strictEqual(capturedRequests.length, 1);
      // Body forwarded unchanged when the wrapper has nothing to inject.
      assert.deepStrictEqual(JSON.parse(capturedRequests[0].body!), {
        messages: [{ role: "user", content: "hi" }],
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("stashes a thought_signature from a tool_call response", async () => {
    // First response includes a signature; second request's assistant
    // message should carry the same signature back.
    const original = globalThis.fetch;
    const { fetch: mock, capturedRequests } = makeMockFetch({
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: "{}" },
                extra_content: { google: { thought_signature: "SIG-1" } },
              },
            ],
          },
        },
      ],
    });
    globalThis.fetch = mock;
    try {
      const wrapped = makeSignaturePreservingFetch();

      // Turn 1: user prompt, no assistant messages yet.
      await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "search" }] }),
      });

      // Turn 2: caller replays the assistant tool_call in message history
      // *without* the signature (as the AI SDK's OpenAI provider does today).
      // The middleware should splice the stashed SIG-1 back in.
      await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            { role: "user", content: "search" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "search_catalog", arguments: "{}" },
                },
              ],
            },
            { role: "tool", tool_call_id: "call-1", content: "{}" },
          ],
        }),
      });

      const turn2Body = JSON.parse(capturedRequests[1].body!);
      const signature =
        turn2Body.messages[1].tool_calls[0].extra_content?.google?.thought_signature;
      assert.strictEqual(signature, "SIG-1");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not overwrite a signature that's already present on the request", async () => {
    const original = globalThis.fetch;
    const { fetch: mock, capturedRequests } = makeMockFetch({
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "f", arguments: "{}" },
                extra_content: { google: { thought_signature: "OLD-SIG" } },
              },
            ],
          },
        },
      ],
    });
    globalThis.fetch = mock;
    try {
      const wrapped = makeSignaturePreservingFetch();

      // Turn 1: stash OLD-SIG.
      await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }),
      });

      // Turn 2: caller already provided their own signature. Wrapper must
      // respect it rather than overwrite from the stash.
      await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "f", arguments: "{}" },
                  extra_content: { google: { thought_signature: "CALLER-PROVIDED" } },
                },
              ],
            },
          ],
        }),
      });

      const turn2Body = JSON.parse(capturedRequests[1].body!);
      const signature =
        turn2Body.messages[0].tool_calls[0].extra_content?.google?.thought_signature;
      assert.strictEqual(signature, "CALLER-PROVIDED");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("stashes signatures per tool_call id independently", async () => {
    const original = globalThis.fetch;
    const { fetch: mock, capturedRequests } = makeMockFetch({
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              {
                id: "call-A",
                type: "function",
                function: { name: "f", arguments: "{}" },
                extra_content: { google: { thought_signature: "SIG-A" } },
              },
              {
                id: "call-B",
                type: "function",
                function: { name: "g", arguments: "{}" },
                extra_content: { google: { thought_signature: "SIG-B" } },
              },
            ],
          },
        },
      ],
    });
    globalThis.fetch = mock;
    try {
      const wrapped = makeSignaturePreservingFetch();
      await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      });
      // Turn 2 replays both tool_calls without signatures.
      await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "assistant",
              tool_calls: [
                { id: "call-A", type: "function", function: { name: "f", arguments: "{}" } },
                { id: "call-B", type: "function", function: { name: "g", arguments: "{}" } },
              ],
            },
          ],
        }),
      });
      const body = JSON.parse(capturedRequests[1].body!);
      assert.strictEqual(
        body.messages[0].tool_calls[0].extra_content.google.thought_signature,
        "SIG-A",
      );
      assert.strictEqual(
        body.messages[0].tool_calls[1].extra_content.google.thought_signature,
        "SIG-B",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("ignores non-JSON responses without erroring", async () => {
    // Streaming (SSE) or other non-JSON content types should pass through
    // without the middleware attempting to parse them.
    const capturedRequests: Array<{ url: string; body: string | undefined }> = [];
    const mock: typeof fetch = async (input, init) => {
      capturedRequests.push({
        url: typeof input === "string" ? input : input.toString(),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return new Response("data: chunk\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    };
    const original = globalThis.fetch;
    globalThis.fetch = mock;
    try {
      const wrapped = makeSignaturePreservingFetch();
      const res = await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      });
      const text = await res.text();
      assert.strictEqual(text, "data: chunk\n\n");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("survives a malformed request body (invalid JSON)", async () => {
    const original = globalThis.fetch;
    const { fetch: mock, capturedRequests } = makeMockFetch({ choices: [] });
    globalThis.fetch = mock;
    try {
      const wrapped = makeSignaturePreservingFetch();
      // First stash a signature so the wrapper has something to try to inject.
      // (Populates the internal Map so the injection path runs.)
      await wrapped("https://example/api", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "f", arguments: "{}" },
                  extra_content: { google: { thought_signature: "SIG" } },
                },
              ],
            },
          ],
        }),
      });
      // Now send an unparseable body. Should not throw, request should still
      // fire with the body forwarded unchanged.
      await wrapped("https://example/api", {
        method: "POST",
        body: "not-json{",
      });
      assert.strictEqual(capturedRequests[1].body, "not-json{");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("keeps per-instance state isolated (fresh Map per factory call)", async () => {
    const original = globalThis.fetch;
    const { fetch: mock, capturedRequests } = makeMockFetch({
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "f", arguments: "{}" },
                extra_content: { google: { thought_signature: "SIG-FIRST" } },
              },
            ],
          },
        },
      ],
    });
    globalThis.fetch = mock;
    try {
      // First wrapper stashes SIG-FIRST for call-1.
      const first = makeSignaturePreservingFetch();
      await first("https://example/api", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      });
      // A second, independent wrapper should not see SIG-FIRST.
      const second = makeSignaturePreservingFetch();
      await second("https://example/api", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "assistant",
              tool_calls: [
                { id: "call-1", type: "function", function: { name: "f", arguments: "{}" } },
              ],
            },
          ],
        }),
      });
      const body = JSON.parse(capturedRequests[1].body!);
      assert.strictEqual(body.messages[0].tool_calls[0].extra_content, undefined);
    } finally {
      globalThis.fetch = original;
    }
  });
});
