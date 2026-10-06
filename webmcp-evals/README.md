# WebMCP Evals (`webmcp-evals`)

> [!WARNING]
> `webmcp-evals` is experimental tooling for evaluating WebMCP schema definitions, tool calling, and agentic workflows.

A TypeScript evaluation framework and CLI for testing the tool-calling capabilities of Large Language Models (LLMs) against WebMCP tools and browser sessions.

## Features

- **CLI Interface**: Built with `commander` providing `local`, `browser`, `smoke`, `simulate`, and `analyze` commands.
- **Execution Modes**:
  - **`local`**: Runs evaluations against static JSON tool schema definition files.
  - **`browser`**: Runs live evaluations against WebMCP tools exposed on web pages via Puppeteer.
  - **`smoke`**: Executes concrete expected tool calls against a live page without an LLM or API key.
  - **`simulate`**: Lets a simulated user converse with an agent on a live page, then checks the final DOM, an optional LLM judge, or both.
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
the same CLI contract but do not yet implement browser execution.

```bash
npx webmcp-evals browser -u https://example.com/demo -e examples/pizza-maker/evals.json --open
```

| Option                    | Required | Default  | Description                                         |
| ------------------------- | -------- | -------- | --------------------------------------------------- |
| `-b, --backend <backend>` | No       | `vercel` | Model backend (`vercel`, `gemini`, or `ollama`)     |
| `-u, --url <url>`         | Yes      | —        | Target web page URL                                 |
| `-e, --evals <path>`      | Yes      | —        | Path to evals test suite JSON file                  |
| `--open`                  | No       | `false`  | Opens the HTML report in browser upon completion    |
| `--analyze`               | No       | `false`  | Automatically run LLM report analysis on completion |

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
message or lets a simulated user converse with the agent under test until the user finishes or a
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

| Option                          | Required | Default        | Description                                                  |
| ------------------------------- | -------- | -------------- | ------------------------------------------------------------ |
| `-u, --url <url>`               | Yes      | —              | Target WebMCP page URL                                       |
| `-s, --simulations <path>`      | Yes      | —              | Path to a `simulations.json` file                            |
| `--user-model <model>`          | No       | Agent model    | Model used by cases that define `userScenario`               |
| `--judge-model <model>`         | No       | Analyzer model | Model used for cases that define prose success criteria      |
| `--max-duration <milliseconds>` | No       | `300000`       | Fallback wall-clock budget when a case omits `maxDurationMs` |
| `--timeout <milliseconds>`      | No       | `30000`        | Timeout per navigation, setup tool call, or judge request    |
| `--open`                        | No       | `false`        | Automatically open the HTML report in the browser            |
| `-v, --verbose`                 | No       | `false`        | Print live page and conversation logs                        |

The global `--runs`, `--max-steps`, `--reporter`, `--output-dir`, and `--chrome-channel`
options also apply. There is no `--max-turns` option: `maxTurns` is an optional, case-specific limit
for `userScenario` cases and defaults to `1` when omitted. Cases with `userMessage` always run one
turn and cannot set `maxTurns`.

A simulation always uses the agent under test. Cases with `userScenario` also use a simulated user;
cases with `userMessage` send that exact message directly to the agent and use no user model. A
third model is used only for cases with `successCriteria`; assertion-only cases stop after
deterministic final-DOM checks. Conversations driven by `userScenario` remain non-deterministic, so
keep `smoke` as the fully deterministic, API-key-free CI signal. `simulate` complements it rather
than replacing it.

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
non-determinism are intended.

## License

Apache-2.0
