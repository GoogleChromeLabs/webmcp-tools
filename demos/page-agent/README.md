# WebMCP Page Agent | WebMCP Imperative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/page-agent
🪞 Mirror: https://chrome.dev/web-ai-demos/webmcp/page-agent/

The **WebMCP Page Agent** is a "meta-demo" that demonstrates how to get tools from an iframe (cross-origin or not) and execute them in a chat session powered by Gemini. It allows users to control any WebMCP-enabled website by typing natural language commands.

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

## ✨ Features

- **Dynamic Tool Discovery**: Automatically detects tools from any WebMCP-compatible URL entered in the address bar.
- **Gemini Integration**: Uses the Gemini 3.5 Flash model to interpret user intent and map it to available tools.
- **Cross-Origin Support**: Safely interacts with tools across different origins via the WebMCP protocol.
- **Real-time Feedback**: Shows system messages when tools are being executed.

## 🚀 Getting Started

1. Open the [Live Demo](https://googlechromelabs.github.io/webmcp-tools/demos/page-agent).
2. Enter your **Gemini API Key**.
3. Load a WebMCP-enabled demo (e.g., the default [Pizza Maker](https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/)).
4. Start chatting! Try commands like "Add a large BBQ pizza with mushrooms and onions".
