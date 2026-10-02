/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Set of MCP tool names that `eval_code` is permitted to invoke. */
const ALLOWED_TOOLS = new Set(["look", "move", "pickup", "drop", "use"]);

/**
 * Inline script for the sandboxed Web Worker that executes LLM-submitted code.
 *
 * Security properties of the nested iframe + worker sandbox:
 * - The Web Worker is spawned inside a sandboxed `<iframe sandbox="allow-scripts">`
 *   (without `allow-same-origin`), giving both the iframe and the worker an
 *   opaque origin (`self.location.origin === "null"`).
 * - No DOM access (`document` is unavailable in workers by default).
 * - No access to the main origin's cookies, `localStorage`, `indexedDB`, Cache API,
 *   or Origin Private File System (OPFS). Ambient storage and network APIs are also
 *   explicitly stripped from the worker global scope as defense-in-depth.
 * - An inline Content Security Policy (`connect-src 'none'`) inside the sandboxed
 *   iframe blocks all outbound network requests (`fetch`, `XMLHttpRequest`,
 *   `WebSocket`, etc.) from both the iframe and the worker.
 * - `gameTools.executeTool` is a controlled bridge restricted to {@link ALLOWED_TOOLS}.
 * - Both the worker and the sandboxed iframe are terminated and removed on
 *   completion, error, abort, or after {@link EVAL_TIMEOUT_MS}.
 *
 * Message protocol (main ↔ iframe ↔ worker):
 * - Iframe → Main: `{ type: 'ready' }`
 * - Main → Iframe: `{ type: 'init', workerScript: string, code: string }`
 * - Iframe → Worker: `{ type: 'run', code: string }`
 * - Worker → Iframe → Main: `{ type: 'toolCall', id: number, name: string, args: object }`
 * - Main → Iframe → Worker: `{ type: 'toolResult', id: number, result?: unknown, error?: string }`
 * - Worker → Iframe → Main: `{ type: 'done', result: unknown }` | `{ type: 'error', error: string }`
 * - Main → Iframe: `{ type: 'terminate' }`
 */
const EVAL_WORKER_SCRIPT = /* js */ `
"use strict";

for (const target of [self, Object.getPrototypeOf(self), Object.getPrototypeOf(Object.getPrototypeOf(self))]) {
  if (!target) continue;
  for (const api of [
    'indexedDB',
    'caches',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'importScripts',
    'Worker',
    'SharedWorker',
    'BroadcastChannel',
  ]) {
    try {
      delete target[api];
      Object.defineProperty(target, api, { value: undefined, configurable: false, writable: false });
    } catch {}
  }
}

const ALLOWED_TOOLS = new Set(['look', 'move', 'pickup', 'drop', 'use']);
const pendingToolCalls = new Map();
let callIdCounter = 0;

const gameTools = {
  executeTool: (name, args) => {
    if (!ALLOWED_TOOLS.has(name)) {
      return Promise.reject(new Error('Tool "' + name + '" is not permitted inside eval_code.'));
    }
    const id = ++callIdCounter;
    return new Promise((resolve, reject) => {
      pendingToolCalls.set(id, { resolve, reject });
      self.postMessage({ type: 'toolCall', id, name, args });
    }).then((json) => {
      try { return JSON.parse(json); } catch { return json; }
    });
  },
};

// Expose as window.gameTools so submitted code can use the documented API.
// In workers, self is the global object; self.window = self makes window a
// valid alias, matching the interface described in the tool description.
self.gameTools = gameTools;
self.window = self;

self.onmessage = async (e) => {
  const { type, id, code, result, error } = e.data;

  if (type === 'run') {
    try {
      const fn = new Function('gameTools', 'return (async () => { ' + code + ' })();');
      const runResult = await fn(gameTools);
      self.postMessage({ type: 'done', result: runResult ?? null });
    } catch (err) {
      self.postMessage({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (type === 'toolResult') {
    const pending = pendingToolCalls.get(id);
    if (pending) {
      pendingToolCalls.delete(id);
      if (error !== undefined) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    }
  }
};
`;

/**
 * Bootstrap script executed inside the sandboxed `<iframe>`.
 *
 * Spawns the Web Worker from a Blob URL inside the iframe's opaque origin
 * (`null`) and relays messages between the main window and the worker.
 *
 * NOTE: If you modify this string, update the corresponding `sha256-...` hash
 * in `vite.config.ts`'s `script-src` Content Security Policy directive.
 */
export const EVAL_IFRAME_SCRIPT = /* js */ `
"use strict";
let worker = null;
let workerUrl = null;

window.addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const msg = e.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "init") {
    const blob = new Blob([msg.workerScript], { type: "application/javascript" });
    workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl, { type: "classic" });
    worker.onmessage = (we) => parent.postMessage(we.data, "*");
    worker.onerror = (err) => {
      parent.postMessage({ type: "error", error: err.message || "Worker error" }, "*");
    };
    worker.postMessage({ type: "run", code: msg.code });
  } else if (msg.type === "terminate") {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = null;
    }
  } else if (worker) {
    worker.postMessage(msg);
  }
});

parent.postMessage({ type: "ready" }, "*");
`;

/**
 * HTML document loaded via `srcdoc` into the sandboxed `<iframe sandbox="allow-scripts">`.
 * Enforces an inner CSP with `connect-src 'none'` to block all outbound network requests.
 */
const EVAL_IFRAME_SRCDOC =
  "<!DOCTYPE html><html><head>" +
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none';\">" +
  "</head><body><script>" +
  EVAL_IFRAME_SCRIPT +
  "</script></body></html>";

/** Maximum time (ms) the worker is allowed to run before being force-terminated. */
const EVAL_TIMEOUT_MS = 300_000;

/**
 * Extracts a descriptive error message from an AbortSignal, falling back to a default.
 */
function getAbortErrorMessage(signal: AbortSignal): string {
  return (
    signal.reason?.message ??
    (typeof signal.reason === "string" ? signal.reason : "Execution aborted")
  );
}

/**
 * Creates the `eval_code` MCP tool.
 *
 * Allows the AI agent to submit JavaScript code that is executed in a
 * Web Worker nested inside a sandboxed `<iframe>`. The submitted code runs as
 * an `async` function body, so `await` is supported. Inside the code,
 * registered MCP tools can be invoked through the `window.gameTools` bridge:
 *
 * ```js
 * const result = await window.gameTools.executeTool("move", { direction: "north" });
 * ```
 *
 * The return value of the last expression (or an explicit `return`) is
 * serialised as JSON and sent back to the agent.
 *
 * The worker and sandboxed iframe are terminated automatically on completion,
 * error, timeout, or abort.
 */
export function createEvalTool() {
  const inputSchema = {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "JavaScript code to execute. Runs as an async function body; may use await. " +
          "Call tools via window.gameTools.executeTool(name, args). " +
          "The result is a plain JS object — no JSON.parse needed.",
      },
    },
    required: ["code"],
  } as const;

  return {
    name: "eval_code",
    description:
      "Use this tool to SOLVE THE MAZE automatically by writing a JavaScript algorithm. " +
      "This is the BEST tool when asked to 'solve', 'escape', 'find the exit', or 'play the game'. " +
      "Write an algorithm that calls game tools in a loop until atExit is true — do NOT make moves one by one. " +
      "\n\nThe code runs as an async function body (await is supported). " +
      "Call tools via window.gameTools.executeTool(name, args) — returns a parsed JS object directly (no JSON.parse needed).\n" +
      "\nTool signatures:\n" +
      "  look({})                   -> { position:{row,col}, openDirections:string[], blockedDirections?:{[dir]:blockerType}, collectibleHere:string|null, inventory:string|null, atExit:bool, exitPosition:{row,col}|string, mazeSize:{rows,cols}, moveCount:number }\n" +
      "  move({direction})          -> { success:bool, position?:{row,col}, atExit?:bool, moveCount?:number, reason?:string, blocker?:string }\n" +
      "  pickup({})                 -> { success:bool, item?:string, reason?:string }\n" +
      "  drop({})                   -> { success:bool, reason?:string }\n" +
      "  use({direction})           -> { success:bool, reason?:string }\n" +
      "  direction values: 'north' | 'south' | 'east' | 'west'\n" +
      "  blockerType values: 'door_red' | 'door_blue' | 'door_green' | 'rock'\n" +
      "  collectibleType values: 'key_red' | 'key_blue' | 'key_green' | 'dynamite'\n" +
      "  Keys open matching doors; dynamite clears rocks. Call use({direction}) BEFORE move({direction}) to clear a blocker.\n" +
      "\nIMPORTANT: The code runs inside a function body — values are NOT returned automatically. " +
      "Always end with an explicit `return` statement. For async functions, use `return await myFn()`.",
    inputSchema,
    execute(input, options): Promise<object> {
      const code = input.code;
      const signal = options?.signal;

      console.group("[eval_code] LLM submitted code");
      console.log(code);
      console.groupEnd();

      if (signal?.aborted) {
        return Promise.resolve({
          success: false,
          error: getAbortErrorMessage(signal),
        });
      }

      return new Promise<object>((resolve) => {
        const iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-scripts");
        iframe.style.display = "none";
        iframe.srcdoc = EVAL_IFRAME_SRCDOC;

        let settled = false;

        /** Settles the promise and cleans up the worker and sandboxed iframe. */
        const finish = (response: object): void => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          window.removeEventListener("message", onMessage);
          clearTimeout(timeoutId);
          try {
            iframe.contentWindow?.postMessage({ type: "terminate" }, "*");
          } catch {
            // Ignore errors if the iframe browsing context is already detached.
          }
          iframe.remove();
          resolve(response);
        };

        const onAbort = (): void => {
          console.error("[eval_code] execution aborted");
          finish({
            success: false,
            error: getAbortErrorMessage(signal!),
          });
        };

        signal?.addEventListener("abort", onAbort, { once: true });

        const timeoutId = setTimeout(() => {
          console.error(`[eval_code] timed out after ${EVAL_TIMEOUT_MS}ms`);
          finish({
            success: false,
            error: `Execution timed out after ${EVAL_TIMEOUT_MS}ms`,
          });
        }, EVAL_TIMEOUT_MS);

        const onMessage = async (e: MessageEvent): Promise<void> => {
          if (e.source !== iframe.contentWindow) return;
          const msg = e.data as {
            type: string;
            id?: number;
            name?: string;
            args?: Record<string, unknown>;
            result?: unknown;
            error?: string;
          } | null;

          if (!msg || typeof msg !== "object") return;

          if (msg.type === "ready") {
            iframe.contentWindow?.postMessage(
              {
                type: "init",
                workerScript: EVAL_WORKER_SCRIPT,
                code,
              },
              "*",
            );
          } else if (msg.type === "done") {
            console.log("[eval_code] result:", msg.result);
            finish({ success: true, result: msg.result ?? null });
          } else if (msg.type === "error") {
            console.error("[eval_code] error:", msg.error);
            finish({ success: false, error: msg.error });
          } else if (msg.type === "toolCall") {
            // Bridge the worker's tool call to the main thread's gameTools.
            const { id, name, args } = msg as Required<
              Pick<typeof msg, "id" | "name" | "args">
            >;
            if (!ALLOWED_TOOLS.has(name)) {
              iframe.contentWindow?.postMessage(
                {
                  type: "toolResult",
                  id,
                  error: `Tool "${name}" is not permitted inside eval_code.`,
                },
                "*",
              );
              return;
            }
            try {
              const toolResult = await window.gameTools.executeTool(
                name,
                args ?? {},
              );
              if (settled) return;
              iframe.contentWindow?.postMessage(
                {
                  type: "toolResult",
                  id,
                  result: toolResult,
                },
                "*",
              );
            } catch (err) {
              if (settled) return;
              const errMsg = err instanceof Error ? err.message : String(err);
              iframe.contentWindow?.postMessage(
                { type: "toolResult", id, error: errMsg },
                "*",
              );
            }
          }
        };

        window.addEventListener("message", onMessage);
        document.body.appendChild(iframe);
      });
    },
  } satisfies WebMCP.ModelContextToolFromSchema<typeof inputSchema>;
}
