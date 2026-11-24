/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool as defineTool, jsonSchema, Tool as VercelTool } from "ai";
import { Tool, ToolSchema, SchemaProjectionDiagnostic } from "../types/tools.js";
import type { WebMCPTool } from "puppeteer-core";

export function mapMessages(messages: any[]): any[] {
  return messages.map((m) => {
    if (m.type === "functioncall") {
      return {
        role: "assistant",
        content: [
          { type: "tool-call", toolName: m.name, toolCallId: "call-" + m.name, input: m.arguments },
        ],
      };
    } else if (m.type === "functionresponse") {
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolName: m.name,
            toolCallId: "call-" + m.name,
            output: { type: "json", value: m.response?.result ?? m.response },
          },
        ],
      };
    } else {
      return { role: (m.role === "model" ? "assistant" : m.role) as any, content: m.content || "" };
    }
  });
}

/**
 * Sanitizes WebMCP JSON schema by removing oneOf and anyOf keywords.
 *
 * Prevents "only allowed for STRING type" errors when passing the
 * jsonSchema()-converted schema to the AI SDK.
 *
 * Compatibility behavior is intentional — do not remove globally without
 * proving provider support. Use {@link sanitizeSchemaWithDiagnostics} when
 * callers need to report what was stripped. The source input is not mutated.
 */
export function sanitizeSchema(obj: any): any {
  return sanitizeSchemaWithDiagnostics(obj).sanitized;
}

export function sanitizeSchemaWithDiagnostics(obj: any): {
  sanitized: any;
  diagnostic: SchemaProjectionDiagnostic;
} {
  const diagnostic: SchemaProjectionDiagnostic = {
    strippedOneOfPaths: [],
    strippedAnyOfPaths: [],
  };
  if (!obj || typeof obj !== "object") {
    return { sanitized: obj, diagnostic };
  }
  const clone = JSON.parse(JSON.stringify(obj));
  function sanitize(node: any, pathPrefix: string) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => sanitize(item, `${pathPrefix}[${i}]`));
      return;
    }
    if (node.oneOf) {
      diagnostic.strippedOneOfPaths.push(pathPrefix || "$");
      delete node.oneOf;
    }
    if (node.anyOf) {
      diagnostic.strippedAnyOfPaths.push(pathPrefix || "$");
      delete node.anyOf;
    }
    for (const key of Object.keys(node)) {
      sanitize(node[key], pathPrefix ? `${pathPrefix}.${key}` : key);
    }
  }
  sanitize(clone, "");
  return { sanitized: clone, diagnostic };
}

/**
 * Load static schema.json tool entries into the normalized Tool shape,
 * preserving optional `outputSchema` (absent → null).
 */
export function mapToolSchemaEntriesToTools(entries: ToolSchema[]): Tool[] {
  return entries.map((t) => ({
    description: t.description,
    functionName: t.name,
    parameters: t.inputSchema || {},
    outputSchema: "outputSchema" in t ? (t.outputSchema ?? null) : null,
  }));
}

/**
 * Convert WebMCP tool definitions into the Vercel AI SDK tool shape.
 *
 * When `execute` is provided, each generated tool gains an `execute`
 * function that delegates to it, keyed by tool name. This turns tools
 * from pure schemas into callables and, combined with a
 * `stopWhen: stepCountIs(N > 1)` on `generateText`, lets the model loop
 * across multiple tool-calling turns — which is what `executeLocalEvals`
 * uses to drive multi-step trajectories via `MockResolver`.
 *
 * When `execute` is omitted, tools are returned as pure schemas and the
 * SDK terminates after the first assistant turn — the legacy behavior.
 */
export function mapJsonSchemaToVercelTools(
  inputTools: Tool[],
  execute?: (functionName: string, args: Record<string, unknown>) => unknown | Promise<unknown>,
): Record<string, any> {
  const tools: Record<string, any> = {};
  inputTools.forEach((toolDef: any) => {
    const hasParams = toolDef.parameters && Object.keys(toolDef.parameters).length > 0;
    const rawParams = hasParams ? toolDef.parameters : { type: "object", properties: {} };
    const { sanitized: parameters, diagnostic } =
      sanitizeSchemaWithDiagnostics(rawParams);
    // Attach projection diagnostics on the source Tool for reporters (optional).
    if (toolDef && typeof toolDef === "object") {
      toolDef.schemaProjection = diagnostic;
    }

    tools[toolDef.functionName] = defineTool({
      description: toolDef.description,
      inputSchema: jsonSchema(parameters),
      execute: execute ? async (args: any) => execute(toolDef.functionName, args) : undefined,
    } as VercelTool);
  });

  return tools;
}

/**
 * Normalizes raw tool configurations dynamically fetched from the browser loop.
 *
 * Preserves `outputSchema` when Puppeteer exposes it. Until puppeteer#15579
 * ships, `WebMCPTool` may lack the field — treat missing as `null`.
 * Do not use casts of absent fields as evidence of native support.
 */
export function mapRawBrowserToolsToConfig(rawTools: WebMCPTool[]): Tool[] {
  return rawTools.map((t) => {
    const withOutput = t as WebMCPTool & { outputSchema?: object | null };
    return {
      description: t.description,
      functionName: t.name,
      parameters: t.inputSchema || {},
      outputSchema:
        "outputSchema" in withOutput ? (withOutput.outputSchema ?? null) : null,
    };
  });
}
