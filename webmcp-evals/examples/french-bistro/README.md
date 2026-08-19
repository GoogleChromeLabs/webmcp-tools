This directory contains evaluation test cases for the [WebMCP french-bistro!](../../../demos/french-bistro/) demo.

Note that `schema.json` is not included here because these evaluations are designed to be run against the [live demo](https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/) directly in `webmcp-evals`, which discovers the tool schemas dynamically from the page.

### Test files

The demo supports multiple execution and submission variations (declarative vs. imperative, manual review vs. autosubmit, same-document modal vs. cross-document navigation). Dedicated evaluation files are provided for each mode:

#### 1. Default (manual review)

Tests the default mode where the tool fills the form and waits for manual user review (`"pending form submission"`).

```bash
npm run build && node dist/bin/webmcp-evals.js browser--url="https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/" --evals=examples/french-bistro/evals.json --debug
```

#### 2. In-page modal with autosubmit (`?toolautosubmit`)

Tests automatic submission where the confirmation modal is displayed on the same page.

```bash
npm run build && node dist/bin/webmcp-evals.js browser--url="https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/?toolautosubmit" --evals=examples/french-bistro/evals-toolautosubmit.json --debug
```

#### 3. Declarative cross-document with autosubmit (`?crossdocument&toolautosubmit`)

Tests cross-document submission where navigating to `result.html` produces structured Schema.org JSON-LD output.

```bash
npm run build && node dist/bin/webmcp-evals.js browser--url="https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/?crossdocument&toolautosubmit" --evals=examples/french-bistro/evals-toolautosubmit-crossdocument.json --debug
```

#### 4. Imperative cross-document with autosubmit (`?crossdocument&toolautosubmit&imperative`)

Tests imperative tool execution (`document.modelContext.registerTool`) with cross-document navigation.

```bash
npm run build && node dist/bin/webmcp-evals.js browser--url="https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/?crossdocument&toolautosubmit&imperative" --evals=examples/french-bistro/evals-toolautosubmit-crossdocument-imperative.json --debug
```
