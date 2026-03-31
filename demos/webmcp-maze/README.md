# webmcp-maze

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/webmcp-maze/

A maze escape game where the player navigates entirely by prompting an AI agent in the browser — no keyboard or mouse input. The game registers tools via the [WebMCP](https://webmachinelearning.github.io/webmcp/) browser API so the agent can interact with the game world.

## How It Works

The game exposes tools to the browser's built-in AI agent through `navigator.modelContext`. The agent can:

- **start_game** — begin a new maze
- **look** — inspect the player's surroundings (walls, open paths, exit location)
- **move** — move the player in a cardinal direction
- **pickup** — pick up a collectible item (key or dynamite) from the current cell
- **drop** — drop the currently held item
- **use** — use the held item on a blocker in a specific direction (e.g., use a key on a door)

(An **eval_code** tool is also available when the `?eval_tool` URL parameter is present for debugging purposes.)

The player starts in a randomly generated maze and must reach the exit by instructing the AI agent through natural language prompts.

## Tech Stack

- [Vite](https://vitejs.dev/) 7 + TypeScript (strict mode)
- [PixiJS](https://pixijs.com/) for rendering
- [Node.js](https://nodejs.org/) and npm for tooling

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) installed
- A WebMCP-capable browser (one that exposes `navigator.modelContext`)

### Install and Run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite in a WebMCP-capable browser and start prompting the AI agent to navigate the maze.

### Other Commands

```bash
npm run build          # typecheck + production build
npm test               # run all tests
npx prettier --write . # format all files
```

## Project Structure

```
src/
  main.ts                # entry point
  game/                  # game orchestrator, state machine, player, maze data
  generation/            # maze generation algorithms (recursive backtracker)
  rendering/             # PixiJS rendering (maze view, player view, camera)
  webmcp/                # WebMCP tool registry and individual tool definitions
  types/                 # shared types, enums, constants
```

## License

[Apache-2.0](LICENSE)
