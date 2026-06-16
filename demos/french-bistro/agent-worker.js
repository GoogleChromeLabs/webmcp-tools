/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from 'https://esm.sh/@google/genai';

let ai, chat;
let apiKey = null;
let ports = [];
let messages = []; // Persistent message history

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.push(port);

  port.onmessage = async (event) => {
    const { type, payload, id } = event.data;

    switch (type) {
      case 'CLOSE_CONNECTION':
        ports = ports.filter(p => p !== port);
        port.close();
        break;

      case 'GET_STATUS':
        port.postMessage({ type: 'STATUS_RESPONSE', payload: { initialized: !!ai, messages } });
        break;

      case 'INIT':
        apiKey = payload.apiKey;
        ai = new GoogleGenAI({ apiKey });
        broadcast({ type: 'INITIALIZED' });
        break;

      case 'SEND_MESSAGE':
        await handleUserSubmit(payload.text, port, id);
        break;

      case 'LOGOUT':
        ai = null;
        chat = null;
        apiKey = null;
        messages = [];
        broadcast({ type: 'LOGGED_OUT' });
        break;
      
      case 'TOOL_RESPONSE':
        // This will be handled inside the handleUserSubmit loop via a promise resolver
        if (toolRequestResolvers.has(id)) {
          toolRequestResolvers.get(id)(payload);
          toolRequestResolvers.delete(id);
        }
        break;
    }
  };

  port.start();
};

function broadcast(msg) {
  ports.forEach(p => p.postMessage(msg));
}

function appendMessage(sender, text, className) {
  const message = { sender, text, className };
  messages.push(message);
  broadcast({ type: 'APPEND_MESSAGE', payload: message });
}

const toolRequestResolvers = new Map();

async function requestToolExecution(port, tool, args) {
  const id = Math.random().toString(36).substring(7);
  return new Promise((resolve) => {
    toolRequestResolvers.set(id, resolve);
    port.postMessage({ type: 'EXECUTE_TOOL', payload: { tool, args }, id });
  });
}

async function requestTools(port) {
  const id = Math.random().toString(36).substring(7);
  return new Promise((resolve) => {
    toolRequestResolvers.set(id, resolve);
    port.postMessage({ type: 'GET_TOOLS', id });
  });
}

async function handleUserSubmit(text, port, requestId) {
  try {
    if (!ai) return;

    appendMessage('You', text, 'user');

    chat ??= ai.chats.create({ model: 'gemini-3.5-flash' });

    let finalResponseGiven = false;

    // Helper to get config (including tools) from the page
    const getConfig = async () => {
      const systemInstruction = [
        'You are an assistant for "Le Petit Bistro" restaurant.',
        'Help the user make a reservation using the available tools.',
        'CRITICAL RULE: Do not try to use other tools than the available ones.',
      ];
      const tools = await requestTools(port);
      const functionDeclarations = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.inputSchema
          ? JSON.parse(tool.inputSchema)
          : { type: 'object', properties: {} },
      }));
      return { systemInstruction, tools: [{ functionDeclarations }] };
    };

    let config = await getConfig();
    let currentResult = await chat.sendMessage({ message: text, config });

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
            const tools = await requestTools(port);
            const tool = tools.find((t) => t.name == name);
            if (!tool) throw new Error(`Tool ${name} not found`);
            
            const result = await requestToolExecution(port, tool, JSON.stringify(args));
            toolResponses.push({ functionResponse: { name, response: { result } } });
          } catch (error) {
            appendMessage('System', `Error: ${error.message}`, 'system');
            toolResponses.push({
              functionResponse: { name, response: { error: error.message } },
            });
          }
        }
        config = await getConfig();
        currentResult = await chat.sendMessage({ message: toolResponses, config });
      }
    }
  } catch (error) {
    appendMessage('System', `Error: ${error.message}`, 'system');
  } finally {
    port.postMessage({ type: 'SUBMIT_FINISHED', id: requestId });
  }
}
