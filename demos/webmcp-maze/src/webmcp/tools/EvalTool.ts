/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Inline script for the sandboxed Web Worker that executes LLM-submitted code.
 *
 * Security properties of the worker sandbox:
 * - No DOM access (`document` is unavailable in workers by default).
 * - No access to the main thread's cookies, localStorage, or IndexedDB.
 * - `connect-src 'self'` in the page CSP prevents arbitrary outbound requests.
 * - `gameTools.executeTool` is a controlled bridge — the worker can only invoke
 *   tools currently registered in the main thread's `toolMap`.
 * - The worker is terminated on completion or after {@link EVAL_TIMEOUT_MS}.
 *
 * Message protocol (main ↔ worker):
 * - Main → Worker: `{ type: 'run', code: string }`
 * - Worker → Main: `{ type: 'toolCall', id: number, name: string, args: object }`
 * - Main → Worker: `{ type: 'toolResult', id: number, result?: unknown, error?: string }`
 * - Worker → Main: `{ type: 'done', result: unknown }` | `{ type: 'error', error: string }`
 */
const EVAL_WORKER_SCRIPT = /* js */ `
"use strict";

const pendingToolCalls = new Map();
let callIdCounter = 0;

const gameTools = {
  executeTool: (name, args) => {
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

/** Maximum time (ms) the worker is allowed to run before being force-terminated. */
const EVAL_TIMEOUT_MS = 300_000;

/**
 * Creates the `eval_code` MCP tool.
 *
 * Allows the AI agent to submit JavaScript code that is executed in a
 * sandboxed Web Worker. The submitted code runs as an `async` function body,
 * so `await` is supported. Inside the code, registered MCP tools can be
 * invoked through the `window.gameTools` bridge:
 *
 * ```js
 * const result = await window.gameTools.executeTool("move", { direction: "north" });
 * ```
 *
 * The return value of the last expression (or an explicit `return`) is
 * serialised as JSON and sent back to the agent.
 *
 * The worker is terminated automatically on completion, error, or timeout.
 */
export function createEvalTool(): WebMCP.ModelContextTool {
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
    inputSchema: {
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
    },
    execute(input: Record<string, unknown>): Promise<object> {
      const code = input.code as string;

      console.group("[eval_code] LLM submitted code");
      console.log(code);
      console.groupEnd();

      return new Promise<object>((resolve) => {
        const blob = new Blob([EVAL_WORKER_SCRIPT], {
          type: "application/javascript",
        });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl, { type: "classic" });

        let settled = false;

        /** Settles the promise and cleans up the worker and object URL. */
        const finish = (response: object): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
          resolve(response);
        };

        const timeoutId = setTimeout(() => {
          console.error(`[eval_code] timed out after ${EVAL_TIMEOUT_MS}ms`);
          finish(
            {
              success: false,
              error: `Execution timed out after ${EVAL_TIMEOUT_MS}ms`,
            },
          );
        }, EVAL_TIMEOUT_MS);

        worker.onmessage = async (e: MessageEvent): Promise<void> => {
          const msg = e.data as {
            type: string;
            id?: number;
            name?: string;
            args?: Record<string, unknown>;
            result?: unknown;
            error?: string;
          };

          if (msg.type === "done") {
            console.log("[eval_code] result:", msg.result);
            finish(
              { success: true, result: msg.result ?? null },
            );
          } else if (msg.type === "error") {
            console.error("[eval_code] error:", msg.error);
            finish({ success: false, error: msg.error });
          } else if (msg.type === "toolCall") {
            // Bridge the worker's tool call to the main thread's gameTools.
            const { id, name, args } = msg as Required<
              Pick<typeof msg, "id" | "name" | "args">
            >;
            try {
              const toolResult = await window.gameTools.executeTool(
                name,
                args ?? {},
              );
              worker.postMessage({
                type: "toolResult",
                id,
                result: toolResult,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              worker.postMessage({ type: "toolResult", id, error: errMsg });
            }
          }
        };

        worker.onerror = (e: ErrorEvent): void => {
          console.error("[eval_code] worker error:", e.message);
          finish(
            {
              success: false,
              error: e.message ?? "Worker error",
            },
          );
        };

        worker.postMessage({ type: "run", code });
      });
    },
  };
}
