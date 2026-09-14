# WebMCP AbortSignal Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/abort-timer/

Reference implementation demonstrating the **Chrome 153** enhancements to the [Web Model Context Protocol (WebMCP)](https://github.com/webmachinelearning/webmcp) API, specifically focusing on **`AbortSignal` execution cancellation**.

---

## 1. Overview & Key Capabilities

In earlier versions of the WebMCP API, once an agent or developer dispatched a long-running asynchronous tool via `document.modelContext.executeTool()`, the host had no mechanism to interrupt or pause that in-flight execution.

**Chrome 153: gracefully handle execution cancellation initiated by the user or an agent:**

```javascript
const controller = new AbortController();
const promise = document.modelContext.executeTool(tool, args, { signal: controller.signal });

// To cancel mid-execution:
controller.abort();
```

Tool invocations can be cancelled mid-execution by passing an `AbortSignal`. Calling `controller.abort()` immediately notifies the running tool, freeing the browser thread and settling the promise cleanly.

---

## 2. WebMCP Registered Tool

This demo registers a stopwatch execution tool on `document.modelContext`:

### `start_timer`
Starts an active execution thread that ticks continuously at 60 FPS. Receives `options.signal` from the host context.
* **Schema Parameters:**
  * `duration`: Maximum runtime in seconds (default: 60).
* **Return**: Promise resolving with `{ status: "completed" | "paused", elapsed: number }`.

---

## 3. WebMCP Tool Implementation Contract

```javascript
// 1. Tool Author: Register the cancellable tool
document.modelContext.registerTool({
  name: 'start_timer',
  description: 'Starts a stopwatch timer. Can be cancelled mid-execution via AbortSignal.',
  inputSchema: {
    type: 'object',
    properties: {
      duration: { type: 'number', default: 60, description: 'Duration in seconds' }
    }
  },
  // 👉 NEW IN CHROME 153: 2nd parameter `options` receives the AbortSignal!
  async execute({ duration = 60 }, options = {}) {
    return runTimer(duration, options.signal);
  }
});

// 2. Headless Timer Engine: Listen to AbortSignal (Signal is optional)
function runTimer(maxSeconds = 60, signal) {
  if (signal?.aborted) {
    return Promise.resolve({ status: 'paused', elapsed: 0 });
  }

  return new Promise((resolve) => {
    let elapsed = 0;
    let startTime = performance.now();
    let rafId = null;

    const onAbort = () => {
      cleanup();
      resolve({ status: 'paused', elapsed });
    };

    const cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      signal?.removeEventListener('abort', onAbort);
    };

    // Listen for cooperative cancellation if a signal is provided
    signal?.addEventListener('abort', onAbort, { once: true });

    function tick() {
      elapsed = performance.now() - startTime;
      if (elapsed >= maxSeconds * 1000) {
        cleanup();
        return resolve({ status: 'completed', elapsed });
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  });
}

// 3. Tool Caller: Actuate and Cancel via AbortController
const controller = new AbortController();
document.modelContext.executeTool(
  { name: 'start_timer' },
  { duration: 60 },
  { signal: controller.signal }
);

// Cancel at any time:
controller.abort();
```

---

## 4. Accessibility (a11y) Architecture (WCAG 2.2 AAA)

* **Visual Digits (`role="timer"`, `aria-live="off"`):** Ticking numbers explicitly disable live region announcements to prevent screen reader speech spam.
* **Dedicated Announcer Region (`#a11y-announcer`):** Polite verbal announcements trigger only on meaningful state boundaries (Started, Paused, Reset).
* **Tabular Typography:** Monospace font with `tabular-nums` prevents horizontal layout shifting.

---

## 5. Modern Web Architecture

This demo uses standard CSS features recommended by Google Chrome's [Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance-src):

* **[CSS Cascade Layers (`@layer`)](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer):** Predictable organization into reset, theme, layout, components, and state layers.
* **[Design Tokens and `color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme):** Standard dark theme tokens.
* **[`color-mix()` in OKLab](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix):** Reactive translucent tints and glows.
* **Declarative DOM State Mapping (`[data-state]`):** Card and badge styling driven directly by HTML `data-state` attributes.
* **[Accessible Motion (`prefers-reduced-motion`)](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion):** Automatically disables pulsing animations based on user preferences.

---

## 6. Project Structure

* **`index.html`**: Semantic HTML structure for the stopwatch hero card, toolbar, and telemetry HUD.
* **`style.css`**: Modern stylesheet using CSS cascade layers (`@layer`) and design tokens.
* **`app.js`**: WebMCP tool registration, execution loop with `AbortSignal`, and host actuation.

---

## 7. Running Locally

Serve the demo using any local HTTP static server:

```bash
cd demos/abort-timer
python3 -m http.server 8080
```

Open in your browser: `http://localhost:8080/index.html`
