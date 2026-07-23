/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function resolveReferences(val, results) {
  if (typeof val === 'string') {
    if (val.startsWith('$ref:')) {
      const refPath = val.slice(5); // e.g. "step1.property"
      return getNestedProperty(results, refPath);
    }
    return val;
  }
  
  if (Array.isArray(val)) {
    return val.map(item => resolveReferences(item, results));
  }
  
  if (val !== null && typeof val === 'object') {
    const resolved = {};
    for (const [k, v] of Object.entries(val)) {
      resolved[k] = resolveReferences(v, results);
    }
    return resolved;
  }
  
  return val;
}

export function getNestedProperty(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

export async function executeDeclarativeBatch(steps, executeToolFn) {
  const results = {};
  const outputs = [];

  for (const step of steps) {
    const { id, tool, args } = step;
    const resolvedArgs = resolveReferences(args, results);

    try {
      const result = await executeToolFn(tool, resolvedArgs);
      let parsedResult = result;
      if (typeof result === 'string') {
        try {
          parsedResult = JSON.parse(result);
        } catch {
          // Keep original string if not valid JSON
        }
      }
      if (id) {
        results[id] = parsedResult;
      }
      outputs.push({
        id,
        tool,
        args: resolvedArgs,
        success: true,
        result: result
      });
    } catch (err) {
      outputs.push({
        id,
        tool,
        args: resolvedArgs,
        success: false,
        error: err.message || String(err)
      });
      break;
    }
  }
  
  return outputs;
}

export function registerExecuteBatchTool(options) {
  return document.modelContext.registerTool({
    name: 'execute_batch',
    description: 'Execute a sequential list of WebMCP tool calls, resolving data dependencies between steps (e.g. referencing previous steps output via "$ref:stepId.property").',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'A list of tool call steps to run sequentially.',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'A unique ID for this step, to reference its output in later steps.'
              },
              tool: {
                type: 'string',
                description: 'The name of the tool to execute.'
              },
              args: {
                type: 'object',
                description: 'Arguments to pass to the tool. Can contain string values like "$ref:stepId.someProperty" to resolve data from earlier steps.'
              }
            },
            required: ['tool']
          }
        }
      },
      required: ['steps']
    },
    execute: async ({ steps }) => {
      const executeToolFn = async (toolName, args) => {
        const tools = await document.modelContext.getTools();
        const targetTool = tools.find(t => t.name === toolName);
        if (!targetTool) {
          throw new Error(`Tool ${toolName} not found`);
        }
        return await document.modelContext.executeTool(targetTool, JSON.stringify(args || {}));
      };
      
      const outputs = await executeDeclarativeBatch(steps, executeToolFn);
      
      const success = outputs.every(o => o.success);
      return {
        success,
        outputs
      };
    }
  }, options);
}

export function getSystemInstructions(tools) {
  const formattedTools = tools
    .filter((tool) => tool.name !== 'execute_batch')
    .map((tool) => {
      let inputSchema = tool.inputSchema;
      if (typeof inputSchema === 'string') {
        try {
          inputSchema = JSON.parse(inputSchema);
        } catch {
          inputSchema = { type: 'object', properties: {} };
        }
      }
      return {
        name: tool.name,
        description: tool.description || '',
        inputSchema: inputSchema || { type: 'object', properties: {} },
      };
    });

  return [
    'You are an assistant embedded in a web page.',
    'You interact with the page by generating a batch of tool calls using the `execute_batch` tool.',
    'You MUST use `execute_batch` to perform any action on the page. Do NOT attempt to use other tools directly.',
    'Inside the batch, you specify a sequence of steps. Each step calls one of the available WebMCP tools.',
    'You can reference the results of previous steps in subsequent steps using the format "$ref:stepId" or "$ref:stepId.property".',
    'For example, if step 1 returns `{ id: "123" }`, you can pass `"$ref:step1.id"` as an argument in step 2.',
    'Below are the available WebMCP tools that can be executed in a batch:',
    '```json',
    JSON.stringify(formattedTools, null, 2),
    '```',
    'Write the steps carefully and return them as the array input for `execute_batch`.',
  ];
}

export const getSystemInstruction = getSystemInstructions;
