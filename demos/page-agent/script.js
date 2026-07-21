/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from 'https://esm.sh/@google/genai';

const setupContainer = document.getElementById('setup-container');
const chatContainer = document.getElementById('chat-container');
const apiKeyInput = document.getElementById('api-key-input');
const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const saveKeyBtn = document.getElementById('save-key-btn');
const logoutBtn = document.getElementById('logout-btn');
const urlInput = document.getElementById('url-input');
const iframe = document.getElementById('iframe');
const codeModeCheckbox = document.getElementById('code-mode-checkbox');

let ai, chat;

codeModeCheckbox.addEventListener('change', () => {
  chat = null;
  appendMessage('System', `🔄 Switched to ${codeModeCheckbox.checked ? 'Code Mode' : 'Normal Mode'}. Chat restarted.`, 'tool-indicator');
});

async function getTools() {
  const iframeOrigin = new URL(iframe.src).origin;
  const tools = await document.modelContext.getTools({ fromOrigins: [iframeOrigin] });
  return tools;
}

function generateTSDeclaration(tools) {
  let decl = `declare const mcp: {\n`;
  for (const tool of tools) {
    if (tool.name === 'execute_batch') continue;
    
    if (tool.description) {
      decl += `  /**\n   * ${tool.description.split('\n').join('\n   * ')}\n   */\n`;
    }
    
    let paramsType = 'Record<string, unknown>';
    if (tool.inputSchema) {
      try {
        const schema = JSON.parse(tool.inputSchema);
        if (schema && schema.properties) {
          const props = [];
          for (const [key, value] of Object.entries(schema.properties)) {
            const isRequired = Array.isArray(schema.required) && schema.required.includes(key);
            const propType = getTSType(value);
            const desc = value.description ? ` // ${value.description}` : '';
            props.push(`${key}${isRequired ? '' : '?'}: ${propType};${desc}`);
          }
          paramsType = `{\n    ${props.join('\n    ')}\n  }`;
        }
      } catch (e) {}
    }
    
    decl += `  ${tool.name}: (args: ${paramsType}) => Promise<any>;\n\n`;
    
    const normalized = tool.name
      .replace(/[.-]([a-zA-Z0-9])/g, (_, g) => g.toUpperCase())
      .replace(/[^a-zA-Z0-9_]/g, '');
    if (normalized !== tool.name) {
      if (tool.description) {
        decl += `  /**\n   * Alias for ${tool.name}\n   * ${tool.description.split('\n').join('\n   * ')}\n   */\n`;
      }
      decl += `  ${normalized}: (args: ${paramsType}) => Promise<any>;\n\n`;
    }
  }
  decl += `};`;
  return decl;
}

function getTSType(schema) {
  if (schema.enum) {
    return schema.enum.map(v => typeof v === 'string' ? `'${v}'` : String(v)).join(' | ');
  }
  switch (schema.type) {
    case 'string': return 'string';
    case 'number':
    case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'array':
      if (schema.items) {
        return `${getTSType(schema.items)}[]`;
      }
      return 'any[]';
    case 'object': return 'any';
    default: return 'any';
  }
}

async function executeBatchLocally(steps) {
  const { executeDeclarativeBatch } = await import('../shared/webmcp-batch.js');
  const executeToolFn = async (toolName, args) => {
    const tools = await getTools();
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

async function getConfig() {
  const tools = await getTools();
  
  if (codeModeCheckbox.checked) {
    const systemInstruction = [
      'You are an assistant embedded in a web page.',
      'You interact with the page by generating a batch of tool calls using the `execute_batch` tool.',
      'You MUST use `execute_batch` to perform any action on the page. Do NOT attempt to use other tools directly.',
      'Inside the batch, you specify a sequence of steps. Each step calls one of the functions on the `mcp` object.',
      'You can reference the results of previous steps in subsequent steps using the format "$ref:stepId" or "$ref:stepId.property".',
      'For example, if step 1 returns `{ id: "123" }`, you can pass `"$ref:step1.id"` as an argument in step 2.',
      'Below is the TypeScript declaration of the available functions under the `mcp` object:',
      '```typescript',
      generateTSDeclaration(tools),
      '```',
      'Write the steps carefully and return them as the array input for `execute_batch`.',
    ];

    const executeBatchDecl = {
      name: 'execute_batch',
      description: 'Execute a sequential list of WebMCP tool calls, resolving data dependencies between steps (e.g. referencing previous steps output via "$ref:stepId.property").',
      parametersJsonSchema: {
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
      }
    };

    return {
      systemInstruction,
      tools: [{ functionDeclarations: [executeBatchDecl] }]
    };
  }

  // Normal Mode
  const systemInstruction = [
    'You are an assistant embedded in a web page.',
    'CRITICAL RULE: Do not try to use other tools than the available ones.',
  ];

  const functionDeclarations = tools.map((tool) => {
    return {
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema
        ? JSON.parse(tool.inputSchema)
        : { type: 'object', properties: {} },
    };
  });

  return { systemInstruction, tools: [{ functionDeclarations }] };
}

const storedKey = localStorage.getItem('gemini_api_key');
if (storedKey) {
  initChat(storedKey);
} else {
  setupContainer.classList.remove('hidden');
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem('gemini_api_key', key);
    initChat(key);
  }
});

function initChat(apiKey) {
  ai = new GoogleGenAI({ apiKey: apiKey });
  setupContainer.classList.add('hidden');
  chatContainer.classList.remove('hidden');
  userInput.focus();
}

urlInput.addEventListener('keypress', (e) => {
  if (e.key !== 'Enter') return;
  loadUrl();
});

function loadUrl() {
  const url = urlInput.value.trim();
  urlInput.value = url;
  chatWindow.innerHTML = '';
  chat = null;
  iframe.allow = `tools ${new URL(url).origin}`;
  iframe.src = url;
  urlInput.blur();
}

loadUrl();

iframe.addEventListener('load', async () => {
  const tools = await getTools();
  appendMessage(
    'System',
    `🌐 ${tools.length} tools are exposed by ${iframe.src}`,
    'tool-indicator',
  );
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('gemini_api_key');
  ai = null;
  chatWindow.innerHTML = '';
  document.body.style.backgroundColor = '';
  setupContainer.classList.remove('hidden');
  chatContainer.classList.add('hidden');
});

sendBtn.addEventListener('click', handleUserSubmit);
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !userInput.disabled) handleUserSubmit();
});

async function handleUserSubmit() {
  try {
    const text = userInput.value.trim();
    if (!text || !ai) return;

    userInput.value = '';
    userInput.disabled = true;
    sendBtn.disabled = true;

    appendMessage('You', text, 'user');

    chat ??= ai.chats.create({ model: 'gemini-3.5-flash' });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let networkCallsCount = 0;
    const startTime = performance.now();

    const addUsage = (result) => {
      networkCallsCount++;
      if (result && result.usageMetadata) {
        totalInputTokens += result.usageMetadata.promptTokenCount || 0;
        totalOutputTokens += result.usageMetadata.candidatesTokenCount || 0;
      }
    };

    const sendMessageParams = { message: text, config: await getConfig() };
    let currentResult = await chat.sendMessage(sendMessageParams);
    addUsage(currentResult);
    let finalResponseGiven = false;

    while (!finalResponseGiven) {
      const response = currentResult;
      const functionCalls = response.functionCalls || [];

      if (functionCalls.length === 0) {
        appendMessage('Agent', response.text, 'agent');
        finalResponseGiven = true;
      } else {
        const toolResponses = [];
        for (const { name, args } of functionCalls) {
          const inputArgs = JSON.stringify(args);
          try {
            appendMessage('System', `⚙️ Executing tool: ${name}...`, 'tool-indicator');
            const tools = await getTools();
            const tool = tools.find((t) => t.name == name);
            
            let result;
            if (codeModeCheckbox.checked && name === 'execute_batch' && !tool) {
              result = await executeBatchLocally(args.steps);
            } else {
              result = await document.modelContext.executeTool(tool, inputArgs);
            }

            if (name === 'execute_batch' && result && Array.isArray(result.outputs)) {
              for (const out of result.outputs) {
                if (out.success) {
                  appendMessage(
                    'Console',
                    `⚙️ Step [${out.id || 'anonymous'}]: called <strong>${out.tool}</strong> with args: <code>${JSON.stringify(out.args)}</code><br>↳ Result: <code>${typeof out.result === 'object' ? JSON.stringify(out.result) : String(out.result)}</code>`,
                    'console-log'
                  );
                } else {
                  appendMessage(
                    'Console',
                    `❌ Step [${out.id || 'anonymous'}]: call to <strong>${out.tool}</strong> failed.<br>↳ Error: <span style="color:red">${out.error}</span>`,
                    'console-log'
                  );
                }
              }
            }

            toolResponses.push({ functionResponse: { name, response: { result } } });
          } catch (error) {
            appendMessage('System', `Error: ${error.message}`, 'error');
            toolResponses.push({
              functionResponse: { name, response: { error: error.message } },
            });
          }
        }
        const sendMessageParams = { message: toolResponses, config: await getConfig() };
        currentResult = await chat.sendMessage(sendMessageParams);
        addUsage(currentResult);
      }
    }

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    appendMessage(
      'System',
      `📊 Turn metrics:<br>↳ Input (Billed): <strong>${totalInputTokens.toLocaleString()}</strong> tokens<br>↳ Output (Billed): <strong>${totalOutputTokens.toLocaleString()}</strong> tokens<br>↳ Total: <strong>${(totalInputTokens + totalOutputTokens).toLocaleString()}</strong> tokens<br>↳ Roundtrips: <strong>${networkCallsCount}</strong><br>↳ Time elapsed: <strong>${duration}s</strong>`,
      'token-indicator'
    );

    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  } catch (error) {
    appendMessage('System', `Error: ${error.message}`, 'error');
  }
}

function appendMessage(sender, text, className) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${className}`;
  msgDiv.innerHTML = text.replace(/\n/g, '<br>');
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
