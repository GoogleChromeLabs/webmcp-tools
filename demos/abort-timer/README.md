# WebMCP AbortSignal Timer Demo (Chrome 153+)

Reference implementation demonstrating the **Chrome 153** enhancements to the [Web Model Context Protocol (WebMCP)](https://github.com/webmachinelearning/webmcp/tree/main) API, specifically focusing on **`AbortSignal`**.

---

## 1. Overview & Key Capabilities

In earlier versions of the WebMCP API, once an agent or developer dispatched a long-running asynchronous tool via `document.modelContext.executeTool()`, the host had no mechanism to interrupt or pause that in-flight execution. If the user navigated away, changed intent, or clicked "Pause", the underlying JavaScript execution loop continued running in the background, consuming CPU resources and battery until it hit a hard timeout.

**Chrome 153 introduces two distinct dimensions of `AbortSignal` support:**

1. **Tool Registration Lifecycle:**
   ```javascript
   const regController = new AbortController();
   document.modelContext.registerTool(toolDefinition, { signal: regController.signal });
   ```
   Calling `regController.abort()` unregisters the tool from the page's tool catalog, **without terminating or breaking in-flight tool executions**.

2. **Tool Execution Cancellation:**
   ```javascript
   const execController = new AbortController();
   const promise = document.modelContext.executeTool(tool, args, { signal: execController.signal });
   ```
   Passing `{ signal }` in `executeTool` provides that signal directly to the tool's `execute(params, clientContext)` callback. Calling `execController.abort()` immediately signals the running loop, freeing the event loop and settling the promise cleanly.

---

## 2. WebMCP Registered Tools

This demo registers **two complementary WebMCP tools** on `document.modelContext`:

### Tool 1: `start_timer`
Starts an active execution thread that ticks continuously at 60 FPS until safety timeout (60s) or cooperative cancellation.
* **Schema Parameters:**
  * `targetEngine`: `"A"` (Chrome 153 cooperative engine) or `"B"` (Legacy un-abortable engine).
  * `maxDurationSeconds`: Maximum duration before auto-stopping (default: 60).
* **Return Payload on Pause:**
  ```json
  {
    "status": "paused",
    "elapsedSeconds": "8.45",
    "reason": "AbortSignal triggered"
  }
  ```

### Tool 2: `pause_timer` (New!)
Allows an AI agent or host script to cooperatively pause an active stopwatch timer execution.
* **Schema Parameters:**
  * `targetEngine`: `"A"` or `"B"` (default: `"A"`).
  * `reason`: Optional human or agent explanation for pausing (e.g., `"User requested break"`).
* **Return Payload (Engine A - Chrome 153):**
  ```json
  {
    "success": true,
    "engine": "A",
    "status": "paused",
    "elapsedSeconds": "8.45",
    "message": "Core A execution thread successfully halted via AbortSignal."
  }
  ```
* **Return Payload (Engine B - Legacy Baseline):**
  ```json
  {
    "success": false,
    "engine": "B",
    "status": "running",
    "elapsedSeconds": "14.20",
    "message": "Notice: Core B was registered without AbortSignal. Abort was requested but ignored by execution loop."
  }
  ```

---

## 3. Interactive Dual-Engine Benchmark

Built in the **Cyberpunk Neon Circuit** visual style:

* **CORE A (Chrome 153 with `AbortSignal`):**
  * Invoked with `{ signal: execController.signal }`.
  * The tool's `execute()` callback listens for `signal.addEventListener('abort', ...)`.
  * When either a human clicks **Pause Core A** or an AI agent calls **`pause_timer({ targetEngine: 'A' })`**, `execController.abort()` triggers the event.
  * The tool cancels `requestAnimationFrame`, halts the loop at that exact millisecond, releases the browser thread, and resolves the promise cleanly.
* **CORE B (Legacy Baseline without Signal):**
  * Invoked with empty options `{}` (omitting signal).
  * The tool execution loop has no signal attached.
  * When either a human clicks **Pause Core B** or an AI agent calls **`pause_timer({ targetEngine: 'B' })`**, the host controller aborts, but the tool **cannot hear the signal**.
  * The execution loop continues spinning unchecked at 60 FPS, demonstrating runaway thread lock until the 60-second safety cap.

---

## 4. Query Parameter Toggling

You can control and test individual behaviors directly via URL query parameters:

* `?abortSignal=true`: Connects `AbortSignal` to the execution context. Pausing halts execution cleanly.
* `?abortSignal=false`: Omit signal passing to reproduce the legacy un-abortable baseline.

---

## 5. WebMCP Tool Implementation Contract

```javascript
// 1. Resolve modelContext with hybrid fallback
const modelContext = document.modelContext || navigator.modelContext || document.modelContextTesting;

// 2. Register start_timer
modelContext.registerTool({
  name: 'start_timer',
  description: 'Starts an active stopwatch timer execution thread.',
  inputSchema: {
    type: 'object',
    properties: {
      targetEngine: { type: 'string', enum: ['A', 'B'] },
      maxDurationSeconds: { type: 'number', default: 60 }
    }
  },
  execute: async (params, clientContext = {}) => {
    const signal = clientContext.signal;
    return new Promise((resolve) => {
      let elapsed = 0;
      let startTime = performance.now();
      let rafId = null;

      function cleanup(status, reason) {
        cancelAnimationFrame(rafId);
        resolve({ status, elapsedSeconds: (elapsed / 1000).toFixed(2), reason });
      }

      signal?.addEventListener('abort', () => cleanup('paused', 'AbortSignal triggered'), { once: true });

      function tick() {
        elapsed = performance.now() - startTime;
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    });
  }
});

// 3. Register pause_timer
modelContext.registerTool({
  name: 'pause_timer',
  description: 'Pauses an active stopwatch timer execution.',
  inputSchema: {
    type: 'object',
    properties: {
      targetEngine: { type: 'string', enum: ['A', 'B'], default: 'A' },
      reason: { type: 'string' }
    }
  },
  execute: async (params = {}, clientContext = {}) => {
    const engine = (params.targetEngine || 'A').toUpperCase();
    if (engine === 'A') {
      ctrlA.abort(); // Triggers signal event in start_timer
      return { success: true, engine: 'A', status: 'paused', elapsedSeconds: ... };
    } else {
      ctrlB.abort(); // Ignored because Core B start_timer has no signal
      return { success: false, engine: 'B', status: 'running', message: 'Legacy engine cannot hear AbortSignal.' };
    }
  }
});
```

---

## 6. Accessibility (a11y) Architecture (WCAG 2.2 AAA)

High-frequency stopwatches ticking at 60 FPS typically flood screen reader speech buffers if marked with `aria-live`. This demo solves this via **High-Frequency Speech Isolation**:

1. **Visual Digits (`role="timer"`, `aria-live="off"`):**
   * The rapid tick counter explicitly disables live region queuing so VoiceOver, NVDA, and JAWS stay silent during normal operation.
2. **Dedicated Announcer Region (`#a11y-announcer`):**
   * Visually hidden element with `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`.
   * Only significant state boundaries (Started, Paused at X seconds, Reset, Mode switched) trigger polite verbal announcements.
3. **Tabular Typography:**
   * All digits use `[font-variant-numeric:tabular-nums_lining-nums]` with fixed character widths (`w-[1.1ch]`) to prevent horizontal layout shift during ticks.
4. **Keyboard Ergonomics:**
   * `Space`: Engage Dual / Abort Dual
   * `R`: Reset both engines
   * Shortcuts are automatically disabled when typing inside input fields or text areas.

---

## 7. Running Locally

Serve the demo using any local HTTP static server:

```bash
cd demos/abort-timer
python3 -m http.server 8080
```

Open in your browser:
* Dual Bench: `http://localhost:8080/index.html`
* AbortSignal Enabled: `http://localhost:8080/index.html?abortSignal=true`
* Legacy Mode: `http://localhost:8080/index.html?abortSignal=false`
