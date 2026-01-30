/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Backend } from "./index.js";
import { Tool, ToolCall } from "../types/tools.js";
import { Content, FunctionDeclaration, GoogleGenAI } from "@google/genai";
import { Message } from "../types/evals.js";

export class GoogleAiBackend implements Backend {
  private googleGenAI: GoogleGenAI;

  constructor(
    apiKey: string,
    private model: string,
    private systemPrompt: string,
    private tools: Array<Tool>,
  ) {
    this.googleGenAI = new GoogleGenAI({ apiKey });
  }

  async execute(messages: [Message]): Promise<ToolCall | null> {
    const functionDeclarations: Array<FunctionDeclaration> = this.tools.map(
      (t) => {
        return {
          name: t.functionName,
          description: t.description,
          parametersJsonSchema: t.parameters,
        };
      },
    );

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
                  arguments: m.arguments,
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
