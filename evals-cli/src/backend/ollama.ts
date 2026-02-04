/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Backend } from "./index.js";
import { Ollama, Tool as OllamaTool, Message as OllamaMessage } from "ollama";
import { Message } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";

export class OllamaBackend implements Backend {
  private ollama: Ollama;

  constructor(
    host: string,
    private model: string,
    private systemPrompt: string,
    private tools: Array<Tool>,
  ) {
    this.ollama = new Ollama({ host });
  }

  async execute(messages: [Message]): Promise<ToolCall | null> {
    let ollamaTools: Array<OllamaTool> = this.tools.map((t) => {
      return {
        function: {
          description: t.description,
          name: t.functionName,
          parameters: t.parameters,
          type: "object",
        },
        type: "function",
      };
    });

    let userMessages: Array<OllamaMessage> = messages.map((m) => {
      switch (m.type) {
        case "message":
          return {
            content: m.content,
            role: m.role,
          };

        case "functioncall":
          return {
            role: "model",
            // Technically, `content` is not required by the Ollama REST API, but required
            // by the library type system.
            content: "",
            tool_calls: [
              {
                function: {
                  name: m.name,
                  arguments: m.arguments,
                },
              },
            ],
          };

        case "functionresponse":
          return {
            role: "tool",
            tool_name: m.name,
            content: String(m.response),
          };
      }
    });

    let systemMessage: OllamaMessage = {
      content: this.systemPrompt,
      role: "system",
    };

    let requestMessages = [systemMessage, ...userMessages];
    const response = await this.ollama.chat({
      model: this.model,
      tools: ollamaTools,
      messages: requestMessages,
      stream: false,
    });

    if (!response.message.tool_calls) {
      return null;
    }

    const toolCalls: Array<ToolCall> = response.message.tool_calls.map((t) => {
      return {
        args: t.function.arguments,
        functionName: t.function.name,
      };
    });

    return toolCalls[0];
  }
}
