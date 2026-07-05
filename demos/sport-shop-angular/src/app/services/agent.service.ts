/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GoogleGenAI } from '@google/genai';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: Date;
  isExecuting?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AgentService {
  private isOpenSubject = new BehaviorSubject<boolean>(false);
  isOpen$ = this.isOpenSubject.asObservable();

  private apiKeySubject = new BehaviorSubject<string>(localStorage.getItem('gemini_api_key') || '');
  apiKey$ = this.apiKeySubject.asObservable();

  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  messages$ = this.messagesSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  isLoading$ = this.isLoadingSubject.asObservable();

  private aiSession: GoogleGenAI | null = null;
  private chatSession: any = null;

  constructor() {
    if (this.apiKeySubject.value) {
      this.initWelcomeMessage();
    }
  }

  toggleOpen() {
    this.isOpenSubject.next(!this.isOpenSubject.value);
  }

  open() {
    this.isOpenSubject.next(true);
  }

  close() {
    this.isOpenSubject.next(false);
  }

  setApiKey(key: string) {
    const trimmed = key.trim();
    if (!trimmed) return;
    localStorage.setItem('gemini_api_key', trimmed);
    this.apiKeySubject.next(trimmed);
    this.resetChat();
  }

  logout() {
    localStorage.removeItem('gemini_api_key');
    this.apiKeySubject.next('');
    this.resetChat();
  }

  clearChat() {
    this.resetChat();
  }

  private resetChat() {
    this.aiSession = null;
    this.chatSession = null;
    this.messagesSubject.next([]);
    if (this.apiKeySubject.value) {
      this.initWelcomeMessage();
    }
  }

  private initWelcomeMessage() {
    const welcomeMsg: ChatMessage = {
      id: this.generateId(),
      sender: 'agent',
      text: '👋 Welcome to WebMCP Sports! I am your AI assistant powered by Gemini 3.1 Flash Lite and WebMCP tools. How can I help you find gear, refine searches, check promos, or manage your cart today?',
      timestamp: new Date()
    };
    this.messagesSubject.next([welcomeMsg]);
  }

  private async getTools(): Promise<any[]> {
    if (!document.modelContext) {
      return [];
    }
    try {
      return await document.modelContext.getTools();
    } catch (e) {
      console.error('Error fetching WebMCP tools:', e);
      return [];
    }
  }

  private async getConfig() {
    const systemInstruction = [
      'You are an intelligent AI assistant for "WebMCP Sports", a sports equipment e-commerce store.',
      'Help users find products, search items, apply price filters, inspect product details, view store promotions, add/remove items from cart, and check out.',
      'CRITICAL RULE: Use available WebMCP tools whenever appropriate to perform actions or fetch live page data. Do not make up product catalog information or fake tool calls.',
    ].join(' ');

    const tools = await this.getTools();
    const functionDeclarations = tools.map((tool) => {
      let parametersJsonSchema: any = { type: 'object', properties: {} };
      if (tool.inputSchema) {
        if (typeof tool.inputSchema === 'string') {
          try {
            parametersJsonSchema = JSON.parse(tool.inputSchema);
          } catch (e) {
            console.error('Error parsing tool inputSchema:', e);
          }
        } else {
          parametersJsonSchema = tool.inputSchema;
        }
      }
      return {
        name: tool.name,
        description: tool.description || '',
        parametersJsonSchema
      };
    });

    return { systemInstruction, tools: [{ functionDeclarations }] };
  }

  async sendMessage(text: string) {
    const apiKey = this.apiKeySubject.value;
    if (!apiKey) {
      this.addMessage('system', '⚠️ Gemini API key is missing. Please enter your API key to proceed.');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed || this.isLoadingSubject.value) return;

    this.addMessage('user', trimmed);
    this.isLoadingSubject.next(true);

    try {
      if (!this.aiSession) {
        this.aiSession = new GoogleGenAI({ apiKey });
      }
      if (!this.chatSession) {
        this.chatSession = this.aiSession.chats.create({ model: 'gemini-3.1-flash-lite' });
      }

      let config = await this.getConfig();
      let currentResult = await this.chatSession.sendMessage({
        message: trimmed,
        config
      });

      let finalResponseGiven = false;

      while (!finalResponseGiven) {
        const response = currentResult;
        const functionCalls = response.functionCalls || [];

        if (functionCalls.length === 0) {
          if (response.text) {
            this.addMessage('agent', response.text);
          }
          finalResponseGiven = true;
        } else {
          const toolResponses = [];
          for (const call of functionCalls) {
            const { name, args } = call;
            const sysMsgId = this.addMessage('system', `⚙️ Executing tool: ${name}...`, true);

            try {
              const tools = await this.getTools();
              const tool = tools.find((t) => t.name === name);
              if (!tool) throw new Error(`Tool ${name} not found`);

              const modelContext = document.modelContext;
              if (!modelContext) throw new Error('WebMCP is not supported in this browser environment');

              const rawResult = await modelContext.executeTool(
                tool,
                JSON.stringify(args)
              );
              toolResponses.push({
                functionResponse: { name, response: { result: rawResult } }
              });
              this.updateMessage(sysMsgId, `✅ Executed tool: ${name}`, false);
            } catch (toolErr: any) {
              const errMsg = toolErr?.message || String(toolErr);
              this.updateMessage(sysMsgId, `❌ Tool ${name} error: ${errMsg}`, false);
              toolResponses.push({
                functionResponse: { name, response: { error: errMsg } }
              });
            }
          }

          config = await this.getConfig();
          currentResult = await this.chatSession.sendMessage({
            message: toolResponses,
            config
          });
        }
      }
    } catch (err: any) {
      console.error('Agent error:', err);
      const errMsg = err?.message || String(err);
      this.addMessage('system', `❌ Error: ${errMsg}`);
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  private addMessage(sender: 'user' | 'agent' | 'system', text: string, isExecuting = false): string {
    const id = this.generateId();
    const newMsg: ChatMessage = {
      id,
      sender,
      text,
      timestamp: new Date(),
      isExecuting
    };
    const current = this.messagesSubject.value;
    this.messagesSubject.next([...current, newMsg]);
    return id;
  }

  private updateMessage(id: string, text: string, isExecuting = false) {
    const current = this.messagesSubject.value;
    const updated = current.map((m) =>
      m.id === id ? { ...m, text, isExecuting } : m
    );
    this.messagesSubject.next(updated);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
