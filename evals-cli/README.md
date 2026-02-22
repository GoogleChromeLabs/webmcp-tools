# WebMCP Evals

A TypeScript framework for evaluating the tool-calling capabilities of Large Language Models (LLMs). This project allows you to define test cases (evals) and schemas to verify if an interactive agent correctly calls tools based on user inputs.

## Features

- **Backends**: Supports Google GenAI (Gemini) and has experimental support for Ollama.
- **Evaluation Loop**: Automatically runs defined test cases against the model and compares actual tool calls with expected ones.
- **Extensible**: Easy to add new backends or evaluation sets.

## Architecture

The project is structured as follows:

- `src/`: Source code.
  - `bin/runevals.ts`: Entry point that loads tool schemas from a JSON file and runs the evaluation loop.
  - `bin/webmcpevals.ts`: Entry point that loads tool schemas live from a browser page via the WebMCP API.
  - `backend/`: Implementation of LLM backends (e.g., `googleai.ts`, `ollama.ts`).
  - `browser/`: Browser automation for WebMCP tool discovery (`webmcp.ts`).
  - `types/`: TypeScript definitions for tools, messages, and evaluations.
- `examples/`: Detailed examples and test data.
    - `travel/`: A travel agent example containing `schema.json` and `evals.json`.

## Prerequisites

- Node.js (v18+ recommended)
- A Google AI Studio API Key (for Gemini models)
- Chrome Canary 146+ with the `#enable-webmcp-testing` flag enabled (for `webmcpevals` only)

## Setup

1.  **Install Dependencies**

    ```bash
    npm install
    ```

2.  **Configure Environment**

    Create a `.env` file in the root directory and add your Google AI API key:

    ```bash
    GOOGLE_AI=your_api_key_here
    # OLLAMA_HOST=http://localhost:11434 (if using Ollama)
    ```

3.  **Build the Project**

    Compile the TypeScript code to JavaScript:

    ```bash
    npx tsc
    ```

## Usage

### `runevals` — file-based tool schemas

Loads tool schemas from a local JSON file.

```bash
node dist/bin/runevals.js --model=gemini-2.5-flash --tools=examples/travel/schema.json --evals=examples/travel/evals.json
```

With Ollama:

```bash
node dist/bin/runevals.js --model=qwen3:8b --backend=ollama --tools=examples/travel/schema.json --evals=examples/travel/evals.json
```

| Argument    | Required | Default            | Description                           |
| ----------- | -------- | ------------------ | ------------------------------------- |
| `--tools`   | Yes      | —                  | Path to the tool schema JSON file     |
| `--evals`   | Yes      | —                  | Path to the evals JSON file           |
| `--backend` | No       | `gemini`           | Backend to use (`gemini` or `ollama`) |
| `--model`   | No       | `gemini-2.5-flash` | Model name                            |

### `webmcpevals` — live tool schemas via WebMCP

Launches Chrome Canary, navigates to the given URL, and retrieves tool schemas live from the page via `navigator.modelContextTesting.listTools()`. Requires Chrome Canary 146+ with the `chrome://flags/#enable-webmcp-testing` flag enabled.

```bash
node dist/bin/webmcpevals.js --url=https://example.com/my-webmcp-app --evals=examples/travel/evals.json
```

| Argument    | Required | Default            | Description                           |
| ----------- | -------- | ------------------ | ------------------------------------- |
| `--url`     | Yes      | —                  | URL of the page exposing WebMCP tools |
| `--evals`   | Yes      | —                  | Path to the evals JSON file           |
| `--backend` | No       | `gemini`           | Backend to use (`gemini` or `ollama`) |
| `--model`   | No       | `gemini-2.5-flash` | Model name                            |

## Argument Constraints

You can use constraint operators to match argument values flexibly. A constraint object is identified when **all** its keys start with `$`.

### Supported Operators

| Operator              | Description             | Example                         |
| --------------------- | ----------------------- | ------------------------------- |
| **`$pattern`**        | Regex match             | `{"$pattern": "^2026-\\d{2}$"}` |
| **`$contains`**       | Substring match         | `{"$contains": "York"}`         |
| **`$gt`**, **`$gte`** | Greater than (or equal) | `{"$gte": 1}`                   |
| **`$lt`**, **`$lte`** | Less than (or equal)    | `{"$lt": 100}`                  |
| **`$type`**           | Type check              | `{"$type": "string"}`           |
| **`$any`**            | Presence check          | `{"$any": true}`                |

### Example

```json
{
  "expectedCall": {
    "functionName": "searchFlights",
    "arguments": {
      "destination": "NYC",
      "outboundDate": { "$pattern": "^2026-01-\\d{2}$" },
      "passengers": { "$gte": 1 },
      "preferences": { "$any": true }
    }
  }
}
```

## License

Apache-2.0
