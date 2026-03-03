/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, FunctionDeclaration, GoogleGenAI } from "@google/genai";
import { WebmcpConfig } from "../types/config.js";
import { Eval, Message, TestResults } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";
import { Backend, RunEvent } from "./index.js";

export class GeminiBackend implements Backend {
  private googleGenAI: GoogleGenAI;

  constructor(
    apiKey: string,
    private model: string,
    private systemPrompt: string,
    private tools: Array<Tool>,
  ) {
    this.googleGenAI = new GoogleGenAI({ apiKey });
  }

  async executeLocalEvals(test: Eval): Promise<any> {
    const toolCall = await this.execute(test.messages);
    if (toolCall) {
      return {
        functionName: toolCall.functionName,
        args: toolCall.args || {},
      };
    } else {
      return { text: "No tool calls generated." };
    }
  }

  executeInBrowserEvals(
    _tests: Array<Eval>,
    _tools: Array<Tool>,
    _config: WebmcpConfig,
    _onEvent?: (event: RunEvent) => void,
  ): Promise<TestResults> {
    throw new Error("Method not implemented.");
  }

  describe(): string {
    return `Gemini Backend using model: ${this.model}`;
  }

  async execute(messages: Message[]): Promise<ToolCall | null> {
    const functionDeclarations: Array<FunctionDeclaration> = this.tools.map((t) => {
      return {
        name: t.functionName,
        description: t.description,
        parametersJsonSchema: t.parameters,
      };
    });

    const contents: Array<Content> = messages.map((m) => {
      switch (m.type) {
        case "message":
          return {
            role: m.role,
            parts: [{ text: m.content }],
          };

        case "functioncall":
          return {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: m.name,
                  args: m.arguments as Record<string, unknown>,
                },
              },
            ],
          };

        case "functionresponse":
          return {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: m.name,
                  response: m.response as Record<string, unknown>,
                },
              },
            ],
          };
      }
    });

    const request = {
      model: this.model,
      contents: contents,
      config: {
        systemInstruction: this.systemPrompt,
        tools: [{ functionDeclarations: functionDeclarations }],
      },
    };

    const response = await this.googleGenAI.models.generateContent(request);

    if (!response.functionCalls) {
      return null;
    }

    const functionCalls: Array<ToolCall> = response.functionCalls
      .filter((f) => f.name && f.args)
      .map((f) => {
        return {
          args: f.args!,
          functionName: f.name!,
        };
      });

    return functionCalls[0];
  }
}
