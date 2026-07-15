# WebMCP Evals (`webmcp-evals`)

> [!WARNING]
> `webmcp-evals` is experimental tooling for evaluating WebMCP schema definitions, tool calling, and agentic workflows.

A TypeScript evaluation framework and CLI for testing the tool-calling capabilities of Large Language Models (LLMs) against WebMCP tools and browser sessions.

## Features

- **CLI Interface**: Built with `commander` providing `local` and `browser` commands.
- **Execution Modes**:
  - **`local`**: Runs evaluations against static JSON tool schema definition files.
  - **`browser`**: Runs live evaluations against WebMCP tools exposed on web pages via Puppeteer.
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

| Option         | Shorthand | Default            | Description                                  |
| -------------- | --------- | ------------------ | -------------------------------------------- |
| `--backend`    | `-b`      | `vercel`           | Model backend (`vercel`, `gemini`, `ollama`) |
| `--model`      | `-m`      | `gemini-3.5-flash` | Model identifier                             |
| `--runs`       | `-r`      | `1`                | Number of runs per test case                 |
| `--max-steps`  | —         | —                  | Maximum agent step count                     |
| `--reporter`   | —         | `console html`     | Reporters to use (`console`, `json`, `html`) |
| `--output-dir` | `-o`      | `.evals`           | Output directory for reports                 |

---

### Command: `local`

Evaluates static tool schema JSON files.

```bash
npx webmcp-evals local -t examples/travel/schema.json -e examples/travel/evals.json
```

With Gemini backend and specified model:

```bash
npx webmcp-evals local -b gemini -m gemini-2.5-pro -t examples/travel/schema.json -e examples/travel/evals.json
```

| Option               | Required | Description                        |
| -------------------- | -------- | ---------------------------------- |
| `-t, --tools <path>` | Yes      | Path to tool schema JSON file      |
| `-e, --evals <path>` | Yes      | Path to evals test suite JSON file |

---

### Command: `browser`

Evaluates live WebMCP tools on a web page using Puppeteer.

```bash
npx webmcp-evals browser -u https://example.com/demo -e examples/travel/evals.json --open
```

| Option               | Required | Default | Description                                      |
| -------------------- | -------- | ------- | ------------------------------------------------ |
| `-u, --url <url>`    | Yes      | —       | Target web page URL                              |
| `-e, --evals <path>` | Yes      | —       | Path to evals test suite JSON file               |
| `--open`             | No       | `false` | Opens the HTML report in browser upon completion |

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

### Argument Matching Operators

| Operator      | Description             | Example                         |
| ------------- | ----------------------- | ------------------------------- |
| `$pattern`    | Regex match             | `{"$pattern": "^2026-\\d{2}$"}` |
| `$contains`   | Substring match         | `{"$contains": "York"}`         |
| `$gt`, `$gte` | Greater than (or equal) | `{"$gte": 1}`                   |
| `$lt`, `$lte` | Less than (or equal)    | `{"$lte": 120}`                 |
| `$type`       | Type check              | `{"$type": "string"}`           |
| `$any`        | Field presence check    | `{"$any": true}`                |

## License

Apache-2.0
