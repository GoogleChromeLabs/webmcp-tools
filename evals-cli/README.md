# WebMCP Evals

A TypeScript framework for evaluating the tool-calling capabilities of Large Language Models (LLMs). This project allows you to define test cases (evals) and schemas to verify if an interactive agent correctly calls tools based on user inputs.

## Features

- **Backends**: Supports Google GenAI (Gemini) and has experimental support for Ollama.
- **Evaluation Loop**: Automatically runs defined test cases against the model and compares actual tool calls with expected ones.
- **Extensible**: Easy to add new backends or evaluation sets.

## Architecture

The project is structured as follows:

- `src/`: Source code.
    - `bin/runevals.ts`: Main entry point that sets up the backend and runs the evaluation loop.
    - `backend/`: Implementation of LLM backends (e.g., `googleai.ts`, `ollama.ts`).
    - `types/`: TypeScript definitions for tools, messages, and evaluations.
- `examples/`: Detailed examples and test data.
    - `travel/`: A travel agent example containing `tools_schema.json` and `evals.json`.

## Prerequisites

- Node.js (v18+ recommended)
- A Google AI Studio API Key (for Gemini models)

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

### Running the Travel Example

```bash
node dist/bin/runevals.js --model=gemini-2.5-flash --tools=examples/travel/tools_schema.json --evals=examples/travel/evals.json
```

### Running evals with Ollama

```bash
node dist/bin/runevals.js --model=qwen3:8b --backend=ollama --tools=examples/travel/tools_schema.json --evals=examples/travel/evals.json
```

## Argument Constraints

You can use constraint operators to match argument values flexibly. A constraint object is identified when **all** its keys start with `$`.

### Supported Operators

| Operator | Description | Example |
|---|---|---|
| **`$pattern`** | Regex match | `{"$pattern": "^2026-\\d{2}$"}` |
| **`$contains`** | Substring match | `{"$contains": "York"}` |
| **`$gt`**, **`$gte`** | Greater than (or equal) | `{"$gte": 1}` |
| **`$lt`**, **`$lte`** | Less than (or equal) | `{"$lt": 100}` |
| **`$type`** | Type check | `{"$type": "string"}` |
| **`$any`** | Presence check | `{"$any": true}` |

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
