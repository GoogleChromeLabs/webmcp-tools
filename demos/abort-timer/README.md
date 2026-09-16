# WebMCP AbortSignal Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/abort-timer/

Reference implementation demonstrating the **Chrome 153** enhancements to the [Web Model Context Protocol (WebMCP)](https://github.com/webmachinelearning/webmcp) API, regarding **`AbortSignal` execution cancellation**.

This demo simulates a long-running tasks by starting an async timer. In this demo you can cancel the long-running task by aborting the signal passed during execution of the tool.

---

## 1. Overview & Key Capabilities

In earlier versions of the WebMCP API, once an agent or developer dispatched a long-running asynchronous tool via `document.modelContext.executeTool()`, the host had no mechanism to interrupt or pause that in-flight execution.

**Chrome 153: gracefully handle execution cancellation initiated by the user or an agent:**

```javascript
document.modelContext.registerTool({
  name: 'start_timer',
  description: 'Starts or resumes a stopwatch timer that halts cooperatively via AbortSignal.',
  inputSchema: {
    type: 'object',
    properties: {
      duration: {
        type: 'number',
        default: 60,
        description: 'Maximum timer duration in seconds before completing.'
      }
    }
  },
  // 👉 The second argument `options` receives the AbortSignal!
  execute: async ({ duration = 60 } = {}, options = {}) => {
    const outcome = await stopwatch.run(duration, options.signal);
    return {
      status: outcome.status,
      output: `Timer ${outcome.status} at ${(outcome.elapsed / 1000).toFixed(2)}s`,
      elapsed: outcome.elapsed
    };
  }
});
```

Tool invocations can be cancelled mid-execution by passing an `AbortSignal`. Calling `controller.abort()` immediately notifies the running tool, freeing the browser thread and settling the promise cleanly.

```javascript
const controller = new AbortController();
const options = { signal: controller.signal };
const toolResult = await document.modelContext.executeTool(tool, args, options);
```

---

## 2. WebMCP Registered Tool

This demo registers a stopwatch execution tool on `document.modelContext`:

### `start_timer`
Starts an active execution thread that ticks continuously at 60 FPS. Receives `options.signal` from the host context.
* **Schema Parameters:**
  * `duration`: Maximum runtime in seconds (default: 60).
* **Return**: Promise resolving with `{ status: "completed" | "paused", elapsed: number }`.

---

## 3. Project Structure

* **`index.html`**: Semantic HTML structure for the stopwatch hero card, toolbar, and telemetry HUD.
* **`style.css`**: Modern stylesheet using CSS cascade layers (`@layer`) and design tokens.
* **`app.js`**: WebMCP tool registration, execution loop with `AbortSignal`, and host actuation.

## 4. Resource

* [Announcement](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview/c/9291sjhIRz0?e=48417069)
* [WebMCP standard](https://github.com/webmachinelearning/webmcp)

