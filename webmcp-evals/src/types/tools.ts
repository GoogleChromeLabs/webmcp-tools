/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ToolCall = {
  args: object;
  functionName: string;
  result?: unknown;
};

export type Tool = {
  description: string;
  functionName: string;
  parameters: object;
  /**
   * Optional WebMCP tool return schema from schema.json / browser tools.
   * `null` means omitted. Preserve through loaders; do not invent.
   * Native browser exposure still depends on Puppeteer (see puppeteer#15579).
   */
  outputSchema?: object | null;
  /**
   * Diagnostics for provider projection (e.g. oneOf/anyOf stripped for Vercel).
   * Source input is already cloned by sanitizeSchema — this records what changed.
   */
  schemaProjection?: SchemaProjectionDiagnostic;
};

export type SchemaProjectionDiagnostic = {
  strippedOneOfPaths: string[];
  strippedAnyOfPaths: string[];
};

export type ToolsSchema = {
  tools: [ToolSchema];
};

export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: object | null;
  outputSchema: object | null;
};
