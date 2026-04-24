/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type declarations for the WebMCP browser API.
 * Extends the Navigator interface with `modelContext`.
 * @see https://webmachinelearning.github.io/webmcp/
 */

export {};

declare global {
  /** Client object passed to tool execute callbacks. */
  interface ModelContextClient {
    /**
     * Requests permission to perform a user-visible side effect.
     * @param callback - The side-effect function to execute once approved.
     */
    requestUserInteraction(callback: () => void): void;
  }

  /** A single tool registered with the model context. */
  interface ModelContextTool {
    /** Unique identifier for the tool. */
    name: string;

    /** Natural-language description of what the tool does. */
    description: string;

    /** JSON Schema describing the tool's expected input. */
    inputSchema?: object;

    /**
     * Called by the AI agent to execute this tool.
     * @param input - The parsed input matching `inputSchema`.
     * @param client - Client for requesting user interactions.
     * @returns A result value sent back to the agent.
     */
    execute: (
      input: Record<string, unknown>,
      client: ModelContextClient,
    ) => unknown | Promise<unknown>;

    /** Optional hints about the tool's behavior. */
    annotations?: {
      /**
       * If `true`, the tool does not modify any state and only reads data.
       * @default false
       */
      readOnlyHint?: boolean;

      /**
       * If `true`, indicates the tool may return content from untrusted sources.
       * @default false
       */
      untrustedContentHint?: boolean;
    };
  }

  /** The model context API exposed on `navigator.modelContext`. */
  interface ModelContext {
    /** Adds a single tool to the current context. */
    registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): void;

    /** Removes a tool by name. (Deprecated) */
    unregisterTool?(name: string): void;
  }

  interface Navigator {
    /** WebMCP model context API. May be undefined if the browser doesn't support it. */
    modelContext?: ModelContext;
  }
}
