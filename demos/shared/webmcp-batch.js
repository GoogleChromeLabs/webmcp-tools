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

export function registerExecuteBatchTool(modelContext = typeof window !== 'undefined' ? window.document?.modelContext : undefined) {
  if (!modelContext) return;

  modelContext.registerTool({
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
        const tools = await modelContext.getTools();
        const targetTool = tools.find(t => t.name === toolName);
        if (!targetTool) {
          throw new Error(`Tool ${toolName} not found`);
        }
        return await modelContext.executeTool(targetTool, JSON.stringify(args || {}));
      };
      
      const outputs = await executeDeclarativeBatch(steps, executeToolFn);
      
      const success = outputs.every(o => o.success);
      return {
        success,
        outputs
      };
    }
  }, { exposedTo: ['*'] }).catch(() => {});
}

// Auto-register in browser environment if modelContext is available
if (typeof window !== 'undefined' && window.document && window.document.modelContext) {
  registerExecuteBatchTool(window.document.modelContext);
}
