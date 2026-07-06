/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vertex-backed Gemini (via any OpenAI-compat proxy that fronts Vertex)
 * emits a `thought_signature` field per tool_call and rejects follow-up
 * requests that don't echo it back:
 *
 *     Unable to submit request because function call `X` in the 2. content
 *     block is missing a `thought_signature`.
 *
 * The signature lives in a provider-extension field
 * (`tool_calls[N].extra_content.google.thought_signature`) that
 * `@ai-sdk/openai` doesn't preserve when it builds the next turn's
 * message history from the previous assistant response. So without any
 * intervention, multi-turn tool-calling against Gemini through an
 * OpenAI-compat proxy 400s on the second turn.
 *
 * This is a client-side workaround: a `fetch` wrapper that
 *   1. Intercepts responses and stashes `thought_signature` values,
 *      keyed by their tool_call `id`.
 *   2. Intercepts subsequent requests and re-injects the stashed
 *      signatures into the outgoing `tool_calls[]` inside assistant
 *      messages.
 *
 * The wrapper is scoped per model instance (a fresh Map per
 * `makeSignaturePreservingFetch()` call), so it doesn't leak signatures
 * across independent eval runs. Non-JSON responses (e.g. SSE from
 * streaming APIs) pass through untouched — this only helps
 * `generateText`-style, non-streaming flows, which is what
 * `executeLocalEvals` uses.
 *
 * Zero-cost for providers that don't emit `extra_content` (OpenAI,
 * Anthropic-via-compat, Ollama, ...) — the stash simply stays empty and
 * outgoing requests are unchanged.
 */
export function makeSignaturePreservingFetch(): typeof fetch {
  const signaturesByCallId = new Map<string, string>();

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // ---- outgoing: re-inject stashed signatures --------------------------
    if (init?.body && typeof init.body === "string" && signaturesByCallId.size > 0) {
      const patched = injectStashedSignatures(init.body, signaturesByCallId);
      if (patched !== init.body) {
        init = { ...init, body: patched };
      }
    }

    const res = await fetch(input, init);

    // ---- incoming: stash any newly-emitted signatures --------------------
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return res;

    // Buffer the body once, then hand back a fresh Response so downstream
    // consumers can still call .json()/.text() as normal.
    const raw = await res.clone().text();
    try {
      const parsed = JSON.parse(raw) as ChatCompletionResponse;
      for (const choice of parsed.choices ?? []) {
        for (const tc of choice.message?.tool_calls ?? []) {
          const sig = tc.extra_content?.google?.thought_signature;
          if (sig && typeof tc.id === "string") {
            signaturesByCallId.set(tc.id, sig);
          }
        }
      }
    } catch {
      // Non-JSON body despite the header — leave untouched.
    }

    return res;
  };
}

/**
 * Walk the outgoing request body's `messages[]`, find each assistant
 * message's `tool_calls[]`, and inject a stashed `thought_signature` for
 * any call whose `id` we've seen a signature for and that doesn't already
 * carry one.
 *
 * Returns the (possibly-modified) body as a string, or the original
 * string if nothing changed / it wasn't parseable JSON.
 */
function injectStashedSignatures(body: string, stash: Map<string, string>): string {
  let parsed: ChatCompletionRequest;
  try {
    parsed = JSON.parse(body) as ChatCompletionRequest;
  } catch {
    return body;
  }
  if (!Array.isArray(parsed.messages)) return body;

  let mutated = false;
  for (const msg of parsed.messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.tool_calls)) continue;
    for (const tc of msg.tool_calls) {
      if (!tc.id || tc.extra_content?.google?.thought_signature) continue;
      const sig = stash.get(tc.id);
      if (!sig) continue;
      tc.extra_content = { ...tc.extra_content, google: { thought_signature: sig } };
      mutated = true;
    }
  }
  return mutated ? JSON.stringify(parsed) : body;
}

/** Minimal shapes we care about. Everything else is untouched. */
interface ChatCompletionRequest {
  messages?: Array<{
    role: string;
    tool_calls?: Array<{
      id?: string;
      extra_content?: { google?: { thought_signature?: string } };
    }>;
  }>;
}
interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        id?: string;
        extra_content?: { google?: { thought_signature?: string } };
      }>;
    };
  }>;
}
