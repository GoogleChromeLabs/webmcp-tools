# Report Exporter | WebMCP Cancellation Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/abort-report/

A single-page demo showing how an agent cancels a long-running WebMCP tool.

Exporting the report takes 10 seconds. An agent can stop it halfway.

## What it shows

From **Chrome 153**, `document.modelContext.executeTool()` accepts an `AbortSignal`, and the tool
receives it as `options.signal`:

```js
document.modelContext.registerTool({
  name: 'export_report',
  description: 'Exports the sales report. Takes about 10 seconds.',
  // The second argument carries the signal.
  execute: async ({ seconds = 10 } = {}, { signal } = {}) => {
    return await runWithProgress(seconds * 1000, signal, onProgress);
  }
});
```

The caller passes a signal and can cancel at any time:

```js
const controller = new AbortController();
const result = await document.modelContext.executeTool(
  tool, { seconds: 10 }, { signal: controller.signal });

controller.abort(new DOMException('Cancelled by the user', 'AbortError'));
```

## Handling the signal inside a tool

Three things to get right, all in `runWithProgress`:

1. **Check first.** `signal?.throwIfAborted()` — the caller may have cancelled before you started.
2. **Stop the work.** Listen for `abort`, then clear the timer or interval.
3. **Reject, do not resolve.** Reject with `signal.reason`. A tool that resolves with a
   `{ status: 'cancelled' }` result is wasting its time: the caller's promise is already rejected and
   will never see that value.

The page prints what the caller sees, so you can watch the rejection arrive:

```
executeTool("export_report", { seconds: 10 }, { signal })
controller.abort(...)
  rejected: AbortError — Cancelled by the user
```

## Running locally

Static files, no build step. Serve the repo root and open `demos/abort-report/`, for example:

```bash
npx http-server . -p 8080
```

The page loads `../shared/webmcp-polyfill.js`, so it works without the WebMCP flag enabled. If the
browser does not pass a signal to the tool, the page says so and the Cancel button will not stop the
export.
