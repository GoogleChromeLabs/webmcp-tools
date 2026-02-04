/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ToolCall = {
  args: object;
  functionName: string;
};

export type Tool = {
  description: string;
  functionName: string;
  parameters: object;
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
