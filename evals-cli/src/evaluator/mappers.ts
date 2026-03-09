/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsonSchema } from "ai";
import { Tool } from "../types/tools.js";

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
 */
export function sanitizeSchema(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  function sanitize(node: any) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(sanitize);
      return;
    }
    if (node.oneOf) delete node.oneOf;
    if (node.anyOf) delete node.anyOf;
    for (const key of Object.keys(node)) {
      sanitize(node[key]);
    }
  }
  sanitize(clone);
  return clone;
}

export function mapJsonSchemaToVercelTools(inputTools: Tool[]): Record<string, any> {
  const tools: Record<string, any> = {};
  inputTools.forEach((toolDef: any) => {
    const hasParams = toolDef.parameters && Object.keys(toolDef.parameters).length > 0;
    const rawParams = hasParams ? toolDef.parameters : { type: "object", properties: {} };
    const parameters = sanitizeSchema(rawParams);

    tools[toolDef.functionName] = {
      description: toolDef.description,
      parameters: jsonSchema(parameters),
      inputSchema: jsonSchema(parameters),
    };
  });

  return tools;
}

/**
 * Normalizes raw tool configurations dynamically fetched from the browser loop.
 */
export function mapRawBrowserToolsToConfig(rawTools: any[], fallbackTools: Tool[]): Tool[] {
  if (rawTools && Array.isArray(rawTools)) {
    return rawTools.map((t: any) => {
      const schema = t.inputSchema;
      let parameters;
      try {
        parameters = (typeof schema === "string" ? JSON.parse(schema) : schema) || {};
      } catch (e) {
        parameters = {};
      }
      return {
        description: t.description,
        functionName: t.name,
        parameters,
      };
    });
  }
  return fallbackTools;
}
