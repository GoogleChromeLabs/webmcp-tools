# WebMCP Evals (`webmcp-evals`)

> [!WARNING]
> `webmcp-evals` is experimental tooling for evaluating WebMCP schema definitions, tool calling, and agentic workflows.

A TypeScript evaluation framework and CLI for testing a website's WebMCP tools (`document.modelContext` and declarative `<form toolname>`) with LLM agents: a built-in agent or a Chrome extension agent.

## Features

- **CLI Interface**: Built with `commander` providing `local`, `browser`, `smoke`, `simulate`, and `analyze` commands.
- **Execution Modes**:
  - **`local`**: Runs evaluations against static JSON tool schema definition files.
  - **`browser`**: Runs live evaluations against WebMCP tools exposed on web pages via Puppeteer, with the built-in agent or a Chrome extension agent (`--extension`).
  - **`smoke`**: Executes concrete expected tool calls against a live page without an LLM or API key.
  - **`simulate`**: Lets a simulated user converse with an agent (built-in or `--extension`) on a live page, then checks the final DOM, an optional LLM judge, or both.
- **Model Backends**: Supports `@google/genai` (`gemini`), Ollama (`ollama`), and Vercel AI SDK (`vercel`).
- **Reporters**: Supports `console`, `json`, and `html` output to the `.evals` directory.
- **Constraint-Based Matching**: Matches expected tool calls using regex patterns, numerical ranges, type checks, and orderings (`ordered` and `unordered`).

## Architecture

```
src/
├── bin/
│   └── webmcp-evals.ts      # Main CLI entrypoint
├── commands/
│   └── index.ts             # Command handlers (local and browser)
├── backends/                # LLM execution backends (Gemini, Vercel AI SDK, Ollama)
├── evaluator/               # Core evaluation orchestration and browser automation
├── extension/               # Chrome extension agent support (--extension)
├── matcher.ts               # Argument matching and trajectory evaluation engine
├── report/                  # HTML report templates and rendering
└── types/                   # TypeScript definitions
```

## Setup

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Configure Environment**

   Create a `.env` file in your project directory with required API keys:

   ```bash
   GOOGLE_AI=your_gemini_api_key
   OPENAI_API_KEY=your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   # OLLAMA_HOST=http://localhost:11434

   # Optional: override the provider endpoint (useful for corporate LLM
   # gateways or self-hosted, OpenAI-compatible services).
   # OPENAI_BASE_URL=https://your-proxy.example.com/v1
   # ANTHROPIC_BASE_URL=https://your-proxy.example.com/anthropic
   # GOOGLE_GENERATIVE_AI_BASE_URL=https://your-proxy.example.com/google
   ```

3. **Build the Package**

   ```bash
   npm run build
   ```

## Usage

> [!NOTE]
> When running the published package, use `npx webmcp-evals <command>`. When developing locally prior to publishing, build first (`npm run build`) and run `node dist/bin/webmcp-evals.js <command>`.

### Global Options

Shared across commands:

| Option             | Shorthand | Default            | Description                                                             |
| ------------------ | --------- | ------------------ | ----------------------------------------------------------------------- |
| `--model`          | `-m`      | `gemini-3.5-flash` | Model identifier                                                        |
| `--runs`           | `-r`      | `1`                | Number of runs per test case                                            |
| `--max-steps`      | —         | —                  | Maximum agent step count                                                |
| `--reporter`       | —         | `console html`     | Reporters to use (`console`, `json`, `html`)                            |
| `--output-dir`     | `-o`      | `.evals`           | Output directory for reports                                            |
| `--analyzer-model` | —         | `gemini-3.5-flash` | Model identifier for report analysis                                    |
| `--open-analysis`  | —         | `false`            | Automatically open the analysis report                                  |
| `--chrome-channel` | —         | `chrome-canary`    | Chrome channel (`chrome`, `chrome-beta`, `chrome-canary`, `chrome-dev`) |

---

### Command: `local`

Evaluates static tool schema JSON files.

```bash
npx webmcp-evals local -t examples/pizza-maker/schema.json -e examples/pizza-maker/evals.json
```

With Gemini backend and specified model:

```bash
npx webmcp-evals local -b gemini -m gemini-3.5-flash -t examples/pizza-maker/schema.json -e examples/pizza-maker/evals.json
```

| Option                    | Required | Default  | Description                                         |
| ------------------------- | -------- | -------- | --------------------------------------------------- |
| `-b, --backend <backend>` | No       | `vercel` | Model backend (`vercel`, `gemini`, or `ollama`)     |
| `-t, --tools <path>`      | Yes      | —        | Path to tool schema JSON file                       |
| `-e, --evals <path>`      | Yes      | —        | Path to evals test suite JSON file                  |
| `--analyze`               | No       | `false`  | Automatically run LLM report analysis on completion |

---

### Command: `browser`

Evaluates live WebMCP tools on a web page using Puppeteer.
The `vercel` backend supports browser evals and lets the model prefix select a provider, for example
`--model google:gemini-3.5-flash` or `--model openai:gpt-5`. The `gemini` and `ollama` adapters keep
the same CLI contract but do not yet implement browser execution. To evaluate the tools against a
Chrome extension agent instead of the built-in agent, pass `--extension` (see
[Evaluating Tools Against a Browser Extension Agent](#evaluating-tools-against-a-browser-extension-agent---extension)).

```bash
npx webmcp-evals browser -u https://example.com/demo -e examples/pizza-maker/evals.json --open
```

| Option                             | Required | Default  | Description                                                                                              |
| ---------------------------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `-b, --backend <backend>`          | No       | `vercel` | Model backend (`vercel`, `gemini`, or `ollama`)                                                          |
| `-u, --url <url>`                  | Yes      | —        | Target web page URL                                                                                      |
| `-e, --evals <path>`               | Yes      | —        | Path to evals test suite JSON file                                                                       |
| `--extension <id-or-name-or-path>` | No       | —        | Evaluate against a Chrome extension agent ([extension options](#extension-options-browser-and-simulate)) |
| `--timeout <milliseconds>`         | No       | `30000`  | Timeout for page navigation, extension panel readiness, and setup tool calls                             |
| `-v, --verbose`                    | No       | `false`  | Print live page and turn logs                                                                            |
| `--open`                           | No       | `false`  | Opens the HTML report in browser upon completion                                                         |
| `--analyze`                        | No       | `false`  | Automatically run LLM report analysis on completion                                                      |

Like `simulate`, `browser` exits with code 1 when any case fails or errors, so CI jobs and scripts can check the exit code.

---

### Command: `smoke`

Executes the required calls from `expectedCall` directly against a live WebMCP page. This mode
does not use an LLM or require an API key, making it suitable for deterministic CI smoke tests.

```bash
npx webmcp-evals smoke -u http://localhost:3000 -e examples/pizza-maker/evals.json -v
```

The target server must already be running. Each eval case starts with a fresh page, and calls in
that case execute in their authored order. Optional calls are skipped. Matcher constraints
(such as `$pattern`, `$contains`, `$type`, `$lte`) in `expectedCall` definitions are automatically
resolved to concrete sample arguments so standard evaluation suites can be reused directly.

| Option                     | Required | Default | Description                                           |
| -------------------------- | -------- | ------- | ----------------------------------------------------- |
| `-u, --url <url>`          | Yes      | —       | Target web page URL                                   |
| `-e, --evals <path>`       | Yes      | —       | Path to evals test suite JSON file                    |
| `--timeout <milliseconds>` | No       | `30000` | Timeout per navigation or tool step                   |
| `-v, --verbose`            | No       | `false` | Print live step-by-step navigation and tool call logs |

---

### Command: `simulate`

Runs goal-oriented evaluations against a live WebMCP page. A case either sends one exact user
message or lets a simulated user converse with the agent until the user finishes or a
budget is exhausted. The outcome is then checked using deterministic DOM assertions against the
final page state, a judge model that evaluates the complete transcript against prose success
criteria, or both (with DOM assertions acting as a hard gate before the judge is called).

```bash
npx webmcp-evals simulate \
  -u https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/ \
  -s examples/pizza-maker/simulations.json \
  --model google:gemini-3.5-flash \
  --judge-model google:gemini-3.5-flash
```

The bundled Pizza Maker suite targets the public demo and its live `set_pizza_size`,
`set_pizza_style`, `toggle_layer`, `add_topping`, `remove_topping`, `manage_pizza`, and
`share_pizza` tools. Set `GEMINI_API_KEY` (or the key required by your selected provider) before
running it. Simulations always use tools registered by a live page, not a static `schema.json`.

For a more demanding suite that covers multi-step search, constraint changes, safe refusal, and
handoff to a user-confirmed declarative booking form, run:

```bash
npx webmcp-evals simulate \
  -u https://googlechromelabs.github.io/webmcp-tools/demos/hotel-chain/ \
  -s examples/hotel-chain/simulations.json \
  --model google:gemini-3.5-flash \
  --judge-model google:gemini-3.5-flash
```

| Option                             | Required | Default        | Description                                                                                              |
| ---------------------------------- | -------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `-u, --url <url>`                  | Yes      | —              | Target WebMCP page URL                                                                                   |
| `-s, --simulations <path>`         | Yes      | —              | Path to a `simulations.json` file                                                                        |
| `--user-model <model>`             | No       | `--model`      | Model used by cases that define `userScenario`                                                           |
| `--judge-model <model>`            | No       | Analyzer model | Model used for cases that define prose success criteria                                                  |
| `--extension <id-or-name-or-path>` | No       | —              | Evaluate against a Chrome extension agent ([extension options](#extension-options-browser-and-simulate)) |
| `--max-duration <milliseconds>`    | No       | `300000`       | Wall-clock budget for the conversation when a case omits `maxDurationMs` (including extension turns)     |
| `--timeout <milliseconds>`         | No       | `30000`        | Timeout per navigation, extension panel readiness, setup tool call, or judge request                     |
| `--open`                           | No       | `false`        | Automatically open the HTML report in the browser                                                        |
| `-v, --verbose`                    | No       | `false`        | Print live page and conversation logs                                                                    |

The global `--runs`, `--max-steps`, `--reporter`, `--output-dir`, and `--chrome-channel`
options also apply. There is no `--max-turns` option: `maxTurns` is an optional, case-specific limit
for `userScenario` cases and defaults to `1` when omitted. Cases with `userMessage` always run one
turn and cannot set `maxTurns`.

A simulation always uses the agent: the built-in agent or, with `--extension`, the extension. Cases
with `userScenario` also use a simulated user; cases with `userMessage` send that exact message
directly to the agent and use no user model. A third model is used only for cases with
`successCriteria`; assertion-only cases stop after deterministic final-DOM checks. Conversations
driven by `userScenario` remain non-deterministic, so keep `smoke` as the fully deterministic,
API-key-free CI signal. `simulate` complements it rather than replacing it.

---

### Command: `analyze`

Analyzes an evaluation JSON report using an LLM to identify root causes and hypotheses for evaluation failures.

```bash
npx webmcp-evals analyze .evals/report-1784621327799.json --open
```

| Argument/Option       | Required | Default            | Description                                                        |
| --------------------- | -------- | ------------------ | ------------------------------------------------------------------ |
| `<report-path>`       | Yes      | —                  | Path to the JSON or HTML report file (e.g. `.evals/report-*.json`) |
| `-m, --model <model>` | No       | `gemini-3.5-flash` | Model identifier to run the report analysis                        |
| `--open`              | No       | `false`            | Automatically open the analysis markdown report in the browser     |

---

### Evaluating Tools Against a Browser Extension Agent (`--extension`)

By default, `browser` and `simulate` call the page's WebMCP tools with a built-in agent. With `--extension`, they evaluate the same tools **against a Chrome extension agent** instead, such as [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension) or a custom extension that implements the [WebMCP Extension Automation Contract](docs/extension-contract.md). `webmcp-evals` sends each prompt through the extension's side panel and records every tool call on the page. Extension authors can also use this mode to test their agent on WebMCP pages.

With `--extension`, `webmcp-evals` does **not** need an agent API key, because the extension uses its own model and credentials. In `simulate`, you need an API key only if your suite uses `userScenario` or `successCriteria`.

#### Option A: Launch Chrome with a Persistent Profile (`--user-data-dir`)

1. Launch Chrome Canary once with a dedicated profile directory (Chrome 136+ requires a non-default `--user-data-dir` for automation). Install and set up your extension, open its side panel, and accept any first-run consent screen. Then close Chrome.
2. Run `browser` or `simulate` with the extension name (or 32-character ID) and the profile directory:

```bash
npx webmcp-evals browser \
  -u http://localhost:5173 \
  -e examples/pizza-maker/evals.json \
  --extension "WebMCP Extension" \
  --user-data-dir ~/.chrome-webmcp-evals

npx webmcp-evals simulate \
  -u https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/ \
  -s examples/pizza-maker/simulations.json \
  --extension "WebMCP Extension" \
  --user-data-dir ~/.chrome-webmcp-evals \
  --judge-model google:gemini-3.5-flash
```

#### Option B: Attach to an Already-Running Chrome (`--browser-url`)

Start Chrome yourself with `--remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-webmcp-evals" --enable-features=WebMCP` and set up your extension in it. Then pass `--browser-url http://127.0.0.1:9222` instead of `--user-data-dir`. `webmcp-evals` leaves Chrome open and does not clear site data, so logins survive but state can carry over from one case to the next.

#### Option C: Install an Unpacked Extension (`--extension ./dir`)

Pass the directory that contains the extension's `manifest.json`, for example `--extension ./dist --headless`. `webmcp-evals` launches Chrome with a temporary profile and installs the extension. Use this in CI when the extension needs no manual setup, such as an API key. It accepts the first-run consent screen only for [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension); for other extensions, use Option A. A failed or errored case makes the command exit with code 1, so the CI job fails too.

#### Extension Options (`browser` and `simulate`)

| Option                             | Default           | Description                                                                                                                                 |
| ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--extension <id-or-name-or-path>` | —                 | 32-character extension ID, `manifest.json` name, or unpacked extension directory                                                            |
| `--user-data-dir <path>`           | Temporary profile | Chrome profile where the extension is installed and set up (not with `--browser-url`)                                                       |
| `--browser-url <url>`              | —                 | Remote debugging URL (`http://` or `ws://`) of a running Chrome                                                                             |
| `--headless`                       | Auto              | Launch Chrome headless (by default, only on Linux without a display); not with `--browser-url`                                              |
| `--extension-panel-path <path>`    | From manifest     | Side-panel HTML path inside `chrome-extension://<id>/` (default: the manifest's `side_panel.default_path`, then `sidepanel/index.html`)     |
| `--confirm-policy <policy>`        | `allow-once`      | `allow-once`, `always-allow`, `deny`, or `none` ([permission prompts](docs/extension-contract.md#tool-permission-prompts---confirm-policy)) |
| `--turn-timeout <milliseconds>`    | `120000`          | `browser` only: maximum time for one extension turn (`simulate` uses `--max-duration`)                                                      |

When `webmcp-evals` launches Chrome (Options A and C), it uses the `--chrome-channel` browser (Chrome Canary by default) and does not fall back to another installed Chrome. See [docs/extension-contract.md](docs/extension-contract.md) for what happens in each case: site data, consent screens, timeouts, permission prompts, conversation history in `evals.json`, extension error messages, and the `window.__AGENT_AUTOMATION__` bridge for custom extensions.

---

## Test Suite Schema (`evals.json`)

```json
[
  {
    "name": "Search shoes under $120",
    "messages": [
      {
        "role": "user",
        "type": "message",
        "content": "I'm looking for running shoes under $120."
      }
    ],
    "expectedCall": [
      {
        "functionName": "searchProducts",
        "arguments": {
          "query": "running shoes",
          "maxPrice": { "$lte": 120 }
        }
      }
    ]
  }
]
```

## Simulation Suite Schema (`simulations.json`)

Each simulation supplies exactly one kind of user input:

- `userScenario` describes a user for a model-driven, potentially multi-turn conversation.
- `userMessage` is one exact message sent directly to the agent without invoking a user model.

A case must also define `assertions`, `successCriteria`, or both:

- `assertions` check the final live DOM deterministically.
- `successCriteria` is one prose statement judged as a whole by an LLM.
- When both are present, all DOM assertions must pass before the LLM judge is called.

Optional `setup` calls establish initial world state before the conversation and are labelled
separately in reports so they are never credited to the agent.

Keep `userScenario` focused on the person's situation, preferences, and desired outcome. The
simulated-user prompt already controls how the person speaks and prevents references to tools,
internal IDs, and implementation steps, so scenarios should not repeat those instructions.

For a simple one-turn goal, use `userMessage` instead. It cannot be combined with `userScenario` or
`maxTurns`:

```json
{
  "name": "Add one jacket",
  "userMessage": "Add the black jacket to my cart.",
  "assertions": [
    {
      "type": "dom",
      "selector": "[data-testid='cart-item']",
      "expect": { "count": 1 }
    }
  ]
}
```

```json
[
  {
    "name": "Remove one item from a two-item cart",
    "setup": [
      {
        "functionName": "addToCart",
        "arguments": { "productId": "p3", "quantity": 1 }
      },
      {
        "functionName": "addToCart",
        "arguments": { "productId": "p4", "quantity": 1 }
      }
    ],
    "userScenario": "You changed your mind about the hat and only want the jacket now.",
    "maxTurns": 6,
    "maxDurationMs": 180000,
    "assertions": [
      {
        "type": "dom",
        "selector": "[data-product-id='p3']",
        "expect": { "exists": false }
      },
      {
        "type": "dom",
        "selector": "[data-testid='cart-item']",
        "expect": { "count": 1 }
      }
    ]
  }
]
```

Field reference:

| Field             | Required | Description                                                     |
| ----------------- | -------- | --------------------------------------------------------------- |
| `name`            | No       | Report label; defaults to `Simulation N`                        |
| `setup`           | No       | Ordered concrete tool calls run before the conversation         |
| `userScenario`    | No\*     | Brief for a model-driven simulated user                         |
| `userMessage`     | No\*     | Exact message for a single turn with no simulated-user model    |
| `maxTurns`        | No       | Exchange limit for `userScenario`; defaults to `1`              |
| `maxDurationMs`   | No       | Positive wall-clock budget; falls back to the CLI value         |
| `assertions`      | No\*     | Non-empty list of deterministic checks against the final DOM    |
| `successCriteria` | No\*     | Non-empty prose outcome supplied only to the optional LLM judge |

\* Exactly one of `userScenario` or `userMessage` is required. At least one of `assertions` or
`successCriteria` is also required.

Each DOM assertion has `"type": "dom"`, a CSS `selector`, and exactly one expectation:

| Expectation | Observed value                                                 |
| ----------- | -------------------------------------------------------------- |
| `exists`    | Whether the selector matches at least one element              |
| `count`     | Number of matching elements                                    |
| `text`      | Trimmed `textContent` of the first matching element, or `null` |
| `attribute` | Named attribute of the first matching element, or `null`       |

`count`, `text`, and attribute `value` accept the matching operators listed below. Assertions are
evaluated in a single DOM read pass immediately after the conversation ends; they do not poll,
retry, or wait for later rendering. `exists` and `count` inspect the full selector result, while
`text` and `attribute` inspect only the first matching element in DOM order (or return `null` when
nothing matches). Assertions do not run user-provided JavaScript or inspect computed styles. Prefer
stable, application-owned IDs or `data-*` attributes over selectors tied to visual layout.

See the complete [Pizza Maker simulation suite](examples/pizza-maker/simulations.json), the
advanced [Hotel Chain simulation suite](examples/hotel-chain/simulations.json), and the additional
[shopping format example](examples/commerce/shopping/simulations.json).

### Argument Matching Operators

| Operator      | Description             | Example                         |
| ------------- | ----------------------- | ------------------------------- |
| `$pattern`    | Regex match             | `{"$pattern": "^2026-\\d{2}$"}` |
| `$contains`   | Substring match         | `{"$contains": "York"}`         |
| `$gt`, `$gte` | Greater than (or equal) | `{"$gte": 1}`                   |
| `$lt`, `$lte` | Less than (or equal)    | `{"$lte": 120}`                 |
| `$type`       | Type check              | `{"$type": "string"}`           |
| `$any`        | Field presence check    | `{"$any": true}`                |

## Development & Testing

To compile the TypeScript source files:

```bash
npm run build
```

To run the complete test suite:

```bash
npm test
```

To run only the report analyzer unit tests:

```bash
node --test dist/test/analyzer.test.js
```

### Batch Script Execution

You can run evaluations or deterministic smoke tests across all deployed WebMCP demo targets:

```bash
# Run smoke tests for a single target or all demo sites
./run_smoke.sh hotel-chain -v
./run_smoke.sh all -v

# Run LLM-based evaluations
./run_evals.sh hotel-chain
./run_evals.sh all
```

`run_evals.sh` intentionally remains limited to trajectory-based `browser` evaluations. It does
not run simulations implicitly because simulations use two or three model roles and case-specific
budgets. Run `simulate` explicitly with the command shown above when that additional cost and
non-determinism are intended. `./run_evals.sh all` runs every target even when one has failed or
errored cases, then lists those targets and exits with code 1.

## License

Apache-2.0
