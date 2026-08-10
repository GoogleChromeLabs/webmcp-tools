# WebMCP Window Agent | WebMCP Imperative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/window-agent/

🪞 Mirror: https://chrome.dev/web-ai-demos/webmcp/window-agent/

The **WebMCP Window Agent** is a demo that demonstrates how to get tools from a separate window—either a standard popup window (`window.open`) or a Document Picture-in-Picture window (`window.documentPictureInPicture.requestWindow`) with an adopted iframe (`window.document.adoptNode(iframe)`)—and execute them in a chat session powered by Gemini. It allows users to control any WebMCP-enabled website by typing natural language commands.

It imports the [WebMCP Polyfill](../shared/webmcp-polyfill.js) so that WebMCP is fully simulated in browsers that do not support it yet natively.

## 🛠️ How It Works

This demo uses the `document.modelContext` API to discover and execute tools provided by the guest page opened in a popup or Document Picture-in-Picture window.

### 1. Discovering Tools

The agent uses `getTools` to find all tools registered by the guest page within the popup or PiP window.

```javascript
async function getTools() {
  const popupOrigin = new URL(urlInput.value).origin;
  const tools = await document.modelContext.getTools({
    fromOrigins: [popupOrigin],
  });
  return tools;
}
```

For cross-origin windows, tools must be registered with the `exposedTo` property correctly configured. For details, check out https://developer.chrome.com/docs/ai/webmcp/imperative-api#origin-exposure.

### 2. Executing Tools

When the Gemini model decides to call a tool, the agent uses `executeTool` to perform the action within the guest page in the target window.

```javascript
const result = await document.modelContext.executeTool(tool, inputArgs);
```

## ✨ Features

- **Popup & Document Picture-in-Picture**: Choose between opening the WebMCP target site in a standard browser popup (`window.open`) or an always-on-top Document Picture-in-Picture window (`window.documentPictureInPicture.requestWindow`) using `window.document.adoptNode(iframe)`.
- **Dynamic Tool Discovery**: Automatically detects tools from any WebMCP-compatible URL opened in either window type.
- **Window Controls**: Open, focus, or change the target URL in dedicated separate windows.
- **Gemini Integration**: Uses the Gemini 3.5 Flash model to interpret user intent and map it to available tools.
- **Cross-Origin Support**: Safely interacts with tools across different origins via the WebMCP protocol.
- **Real-time Feedback**: Shows system messages when tools are being executed.

## 🚀 Getting Started

1. Open the [Live Demo](https://googlechromelabs.github.io/webmcp-tools/demos/window-agent/).
2. Enter your **Gemini API Key**.
3. Load a WebMCP-enabled demo (e.g., click **Open Popup** or **Open PiP window** for the default [Pizza Maker](https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/)).
4. Start chatting! Try commands like "Add a large BBQ pizza with mushrooms and onions".
