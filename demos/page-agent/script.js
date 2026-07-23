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
let codeModeAbortController = null;

async function logExposedTools() {
  const tools = await getTools();
  appendMessage(
    'System',
    `🌐 ${tools.length} tools are exposed by ${iframe.src}`,
    'tool-indicator',
  );
}

codeModeCheckbox.addEventListener('change', async () => {
  chat = null;

  codeModeAbortController?.abort();
  if (codeModeCheckbox.checked) {
    codeModeAbortController = new AbortController();
    const { registerExecuteBatchTool } = await import('../shared/webmcp-batch.js');
    await registerExecuteBatchTool({ signal: codeModeAbortController.signal });
  }

  appendMessage(
    'System',
    `🔄 Switched to ${codeModeCheckbox.checked ? 'Code Mode' : 'Normal Mode'}. Chat restarted.`,
    'tool-indicator',
  );
  await logExposedTools();
});

async function getTools() {
  const iframeOrigin = new URL(iframe.src).origin;
  const tools = await document.modelContext.getTools({ fromOrigins: [iframeOrigin] });
  return tools;
}

async function getConfig() {
  const tools = await getTools();
  
  if (codeModeCheckbox.checked) {
    const { getSystemInstructions } = await import('../shared/webmcp-batch.js');
    const systemInstruction = getSystemInstructions(tools);

    const functionDeclarations = tools
      .filter((tool) => tool.name === 'execute_batch')
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: JSON.parse(tool.inputSchema),
      }));

    return { systemInstruction, tools: [{ functionDeclarations }] };
  }

  // Normal Mode
  const systemInstruction = [
    'You are an assistant embedded in a web page.',
    'CRITICAL RULE: Do not try to use other tools than the available ones.',
  ];

  const functionDeclarations = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema
      ? JSON.parse(tool.inputSchema)
      : { type: 'object', properties: {} },
  }));

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

iframe.addEventListener('load', logExposedTools);

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
            const result = await document.modelContext.executeTool(tool, inputArgs);

            if (codeModeCheckbox.checked && name === 'execute_batch' && result && Array.isArray(result.outputs)) {
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
