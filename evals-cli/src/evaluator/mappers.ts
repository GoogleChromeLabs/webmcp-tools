import { jsonSchema } from "ai";
import { Tool } from "../types/tools.js";

export function mapMessages(messages: any[]): any[] {
  return messages.map(m => {
    if (m.type === 'functioncall') {
      return {
        role: 'assistant',
        content: [{ type: 'tool-call', toolName: m.name, toolCallId: 'call-' + m.name, input: m.arguments }]
      };
    } else if (m.type === 'functionresponse') {
      return {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolName: m.name,
          toolCallId: 'call-' + m.name,
          output: { type: 'json', value: m.response?.result ?? m.response }
        }]
      };
    } else {
      return { role: (m.role === 'model' ? 'assistant' : m.role) as any, content: m.content || '' };
    }
  });
}

export function mapJsonSchemaToVercelTools(inputTools: Tool[]): Record<string, any> {
  const tools: Record<string, any> = {};
  inputTools.forEach((toolDef: any) => {
    const hasParams = toolDef.parameters && Object.keys(toolDef.parameters).length > 0;
    const parameters = hasParams ? toolDef.parameters : { type: 'object', properties: {} };

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
      const parameters = typeof schema === "string" ? JSON.parse(schema) : (schema ?? {});
      return {
        description: t.description,
        functionName: t.name,
        parameters,
      };
    });
  }
  return fallbackTools;
}
