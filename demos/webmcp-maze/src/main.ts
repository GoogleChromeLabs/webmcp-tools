/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import "./style.css";
import { Game } from "./game/Game.ts";
import { Renderer } from "./rendering/Renderer.ts";
import { ToolRegistry } from "./webmcp/ToolRegistry.ts";
import { IntroState } from "./game/states/IntroState.ts";

/**
 * Application entry point.
 * Initializes all subsystems and starts the game in the intro state.
 */
async function main(): Promise<void> {
  const appContainer = document.getElementById("app")!;

  const game = new Game();

  // Initialize renderer
  const renderer = new Renderer();
  await renderer.init(appContainer);
  game.renderer = renderer;

  // Initialize MCP tool registry
  const toolRegistry = new ToolRegistry(game);
  game.toolRegistry = toolRegistry;

  // Start the game loop
  renderer.onTick((dt) => game.update(dt));

  // Enter intro state
  game.setState(new IntroState(game));
}

const ready = main();
// Tools are registered after async init: tell agents to wait for them.
// waitForToolsUntil() is not yet available in all WebMCP implementations.
if (document.modelContext && "waitForToolsUntil" in document.modelContext) {
  (document.modelContext as any).waitForToolsUntil(ready);
}
ready.catch(console.error);
