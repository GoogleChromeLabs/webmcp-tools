# WebMCP Page Agent | WebMCP Imperative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/page-agent

🪞 Mirror: https://chrome.dev/web-ai-demos/webmcp/page-agent/

The **WebMCP Page Agent** is a "meta-demo" that demonstrates how to get tools from an iframe (cross-origin or not) and execute them in a chat session powered by Gemini. It allows users to control any WebMCP-enabled website by typing natural language commands.

It imports the [WebMCP Polyfill](../shared/webmcp-polyfill.js) so that WebMCP is fully simulated in browsers that do not support it yet natively.

## 🛠️ How It Works

This demo uses the `document.modelContext` API to discover and execute tools provided by the site loaded in the iframe.

### 1. Discovering Tools

The agent uses `getTools` to find all tools registered by the guest page within the iframe.

```javascript
async function getTools() {
  const iframeOrigin = new URL(iframe.src).origin;
  const tools = await document.modelContext.getTools({ fromOrigins: [iframeOrigin] });
  return tools;
}
```

For cross-origin iframes, tools must be registered with the `exposedTo` property correctly configured. For details, check out https://developer.chrome.com/docs/ai/webmcp/imperative-api#origin-exposure.

### 2. Executing Tools

When the Gemini model decides to call a tool, the agent uses `executeTool` to perform the action within the guest page.

```javascript
const result = await document.modelContext.executeTool(tool, inputArgs);
```

### 3. Code Mode (Batch Tool Execution) (Experimental)

Code Mode is an experimental feature that introduces an optimized way for AI agents to interact with WebMCP tools. Instead of calling multiple individual tools in separate conversational turns (which consumes more context tokens and increases latency), the agent generates a single declarative steps array that calls multiple tools sequentially, resolving data dependencies between them.

The agent uses a single tool called `execute_batch` with the following parameters:

```json
{
  "steps": [
    {
      "id": "step1",
      "tool": "set_pizza_size",
      "args": { "size": "Large" }
    },
    {
      "id": "step2",
      "tool": "set_pizza_style",
      "args": { "style": "BBQ" }
    },
    {
      "id": "step3",
      "tool": "add_topping",
      "args": {
        "topping": "🍄",
        "count": 5,
        "size": "$ref:step1"
      }
    }
  ]
}
```

#### How it works:
1. **TypeScript Definitions**: The agent harness generates a TypeScript declaration (`mcp` interface) containing type signatures and descriptions for all available tools on the page.
2. **System Instruction**: The declaration is injected into the agent's system instructions, alongside instructions on how to use declarative steps.
3. **Single Tool Exposure**: Only the `execute_batch` tool is exposed to the model.
4. **Execution**: The agent generates a sequence of steps. Step parameters can reference outputs of previous steps using the string format `"$ref:stepId"` or `"$ref:stepId.nestedProperty"`.
5. **Output**: The batch execution parses and executes the steps sequentially, resolving any dependencies, and returns a list of step execution outputs (inputs, outputs/results, errors).

## ✨ Features

- **Dynamic Tool Discovery**: Automatically detects tools from any WebMCP-compatible URL entered in the address bar.
- **Normal & Code Mode**: Toggle between standard tool-calling and experimental "Code Mode" to see the difference in context efficiency and speed.
- **Gemini Integration**: Uses the Gemini 3.5 Flash model to interpret user intent and map it to available tools.
- **Cross-Origin Support**: Safely interacts with tools across different origins via the WebMCP protocol.
- **Real-time Feedback**: Shows system messages and live console logs when tools or scripts are being executed.
## 🚀 Getting Started

1. Open the [Live Demo](https://googlechromelabs.github.io/webmcp-tools/demos/page-agent).
2. Enter your **Gemini API Key**.
3. Load a WebMCP-enabled demo (e.g., the default [Pizza Maker](https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/)).
4. Start chatting! Try commands like "Add a large BBQ pizza with mushrooms and onions".
