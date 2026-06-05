/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from 'https://esm.sh/@google/genai';

const agentToggle = document.getElementById('agent-toggle');
const agentChat = document.getElementById('agent-chat');
const agentChatWindow = document.getElementById('agent-chat-window');
const agentUserInput = document.getElementById('agent-user-input');
const agentSendBtn = document.getElementById('agent-send-btn');
const agentSetup = document.getElementById('agent-setup');
const agentChatContainer = document.getElementById('agent-chat-container');
const agentApiKeyInput = document.getElementById('agent-api-key-input');
const agentSaveKeyBtn = document.getElementById('agent-save-key-btn');
const agentLogoutBtn = document.getElementById('agent-logout');

let ai, chat;

async function getTools() {
  if (!window.document.modelContext) {
    return [];
  }
  return await document.modelContext.getTools();
}

async function getConfig() {
  const systemInstruction = [
    'You are an assistant for "Le Petit Bistro" restaurant.',
    'Help the user make a reservation using the available tools.',
    'CRITICAL RULE: Do not try to use other tools than the available ones.',
  ];

  const tools = await getTools();
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
  agentSetup.classList.remove('hidden');
  agentChatContainer.classList.add('hidden');
}

agentToggle.addEventListener('click', () => {
  agentChat.classList.toggle('hidden');
  if (!agentChat.classList.contains('hidden')) {
    agentUserInput.focus();
  }
});

agentSaveKeyBtn.addEventListener('click', () => {
  const key = agentApiKeyInput.value.trim();
  if (key) {
    localStorage.setItem('gemini_api_key', key);
    initChat(key);
  }
});

function initChat(apiKey) {
  ai = new GoogleGenAI({ apiKey: apiKey });
  agentSetup.classList.add('hidden');
  agentChatContainer.classList.remove('hidden');
  appendMessage('System', 'Welcome to Le Petit Bistro! How can I help you today?', 'system');
}

agentLogoutBtn.addEventListener('click', () => {
  localStorage.removeItem('gemini_api_key');
  ai = null;
  chat = null;
  agentChatWindow.innerHTML = '';
  agentSetup.classList.remove('hidden');
  agentChatContainer.classList.add('hidden');
});

agentSendBtn.addEventListener('click', handleUserSubmit);
agentUserInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !agentUserInput.disabled) handleUserSubmit();
});

async function handleUserSubmit() {
  try {
    const text = agentUserInput.value.trim();
    if (!text || !ai) return;

    agentUserInput.value = '';
    agentUserInput.disabled = true;
    agentSendBtn.disabled = true;

    appendMessage('You', text, 'user');

    chat ??= ai.chats.create({ model: 'gemini-3.5-flash' });

    const config = await getConfig();
    const sendMessageParams = { message: text, config };
    console.log(sendMessageParams);
    let currentResult = await chat.sendMessage(sendMessageParams);
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
          try {
            appendMessage('System', `⚙️ Executing tool: ${name}...`, 'system');
            const tools = await getTools();
            const tool = tools.find((t) => t.name == name);
            if (!tool) throw new Error(`Tool ${name} not found`);
            
            const result = await document.modelContext.executeTool(tool, JSON.stringify(args));
            toolResponses.push({ functionResponse: { name, response: { result } } });
          } catch (error) {
            appendMessage('System', `Error: ${error.message}`, 'system');
            toolResponses.push({
              functionResponse: { name, response: { error: error.message } },
            });
          }
        }
        const sendMessageParams = { message: toolResponses, config: await getConfig() };
        currentResult = await chat.sendMessage(sendMessageParams);
      }
    }

    agentUserInput.disabled = false;
    agentSendBtn.disabled = false;
    agentUserInput.focus();
  } catch (error) {
    console.log(error);
    appendMessage('System', `Error: ${error.message}`, 'system');
    agentUserInput.disabled = false;
    agentSendBtn.disabled = false;
  }
}

function appendMessage(sender, text, className) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `agent-message ${className}`;
  msgDiv.innerHTML = text.replace(/\n/g, '<br>');
  agentChatWindow.appendChild(msgDiv);
  agentChatWindow.scrollTop = agentChatWindow.scrollHeight;
}

// Check if WebMCP is supported
if (!window.document.modelContext) {
  setTimeout(() => {
    appendMessage('System', '⚠️ WebMCP API not detected. Make sure you are using a compatible browser with the experiment enabled.', 'system');
  }, 1000);
}
