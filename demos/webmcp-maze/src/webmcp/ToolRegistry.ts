/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Game } from "../game/Game.ts";
import { createMoveTool } from "./tools/MoveTool.ts";
import { createLookTool } from "./tools/LookTool.ts";
import { createPickupTool } from "./tools/PickupTool.ts";
import { createDropTool } from "./tools/DropTool.ts";
import { createUseTool } from "./tools/UseTool.ts";
import { createStartGameTool } from "./tools/StartGameTool.ts";
import { createEvalTool } from "./tools/EvalTool.ts";

function unregisterTool(modelContext: ModelContext, tool: ModelContextTool) {
  try {
    modelContext.unregisterTool(tool);
  } catch (error) {
    // Legacy fallback: some Chrome versions still expect the tool name string.
    // TODO: Remove this once the API transition is complete.
    modelContext.unregisterTool(tool.name as any);
  }
}

/**
 * Manages the lifecycle of WebMCP tools registered with `navigator.modelContext`.
 *
 * Different sets of tools are registered depending on the current game state:
 * - **Intro / GameOver**: only `start_game`
 * - **Gameplay**: `move`, `look`, `pickup`, `drop`, `use`
 *   and optionally `eval_code` when the `?eval_tool` URL parameter is present.
 *
 * A `window.gameTools.executeTool(name, args)` helper is always kept in sync
 * with the current tool set so that eval'd code can invoke tools by name.
 */
export class ToolRegistry {
  /** Reference to the game orchestrator. */
  private game: Game;

  /** Whether the WebMCP API is available in this browser. */
  private supported: boolean;

  /**
   * Live map of currently registered tools, keyed by tool name.
   * Referenced by `window.gameTools.executeTool` at call time.
   */
  private toolMap: Map<string, ModelContextTool> = new Map();

  /**
   * @param game - The game orchestrator instance.
   */
  constructor(game: Game) {
    this.game = game;
    this.supported =
      typeof navigator !== "undefined" && !!navigator.modelContext;

    if (!this.supported) {
      console.warn(
        "WebMCP (navigator.modelContext) is not available in this browser.",
      );
      return;
    }

    this.installGameTools();
  }

  /**
   * Registers tools available during the intro state.
   * Only the `start_game` tool is exposed.
   */
  registerIntroTools(): void {
    this.provideTools([createStartGameTool(this.game)]);
  }

  /**
   * Registers tools available during gameplay.
   * Exposes movement, inspection, and item interaction tools.
   * Also registers `eval_code` when the `?eval_tool` URL parameter is present.
   */
  registerGameplayTools(): void {
    const tools = [
      createMoveTool(this.game),
      createLookTool(this.game),
      createPickupTool(this.game),
      createDropTool(this.game),
      createUseTool(this.game),
    ];

    if (new URLSearchParams(window.location.search).has("eval_tool")) {
      tools.push(createEvalTool());
    }

    this.provideTools(tools);
  }

  /**
   * Registers tools available during the game-over state.
   * Only the `start_game` tool is exposed (to replay).
   */
  registerGameOverTools(): void {
    this.provideTools([createStartGameTool(this.game)]);
  }


  /**
   * Unregisters all current tools then registers the new batch.
   * Keeps `toolMap` in sync so `window.gameTools.executeTool` stays current.
   * @param tools - The tools to register.
   */
  private provideTools(tools: ModelContextTool[]): void {
    if (this.supported) {
      const ctx = navigator.modelContext!;
      for (const tool of this.toolMap.values()) {
        unregisterTool(ctx, tool);
      }
      for (const tool of tools) {
        ctx.registerTool(tool);
      }
    }
    this.toolMap.clear();
    for (const tool of tools) {
      this.toolMap.set(tool.name, tool);
    }
  }

  /**
   * Installs `window.gameTools` once. The `executeTool` method reads from
   * `toolMap` at call time so it always reflects the current tool set.
   */
  private installGameTools(): void {
    const toolMap = this.toolMap;
    window.gameTools = {
      async executeTool(
        name: string,
        args: Record<string, unknown>,
      ): Promise<unknown> {
        const tool = toolMap.get(name);
        if (!tool) {
          throw new Error(
            `No tool named "${name}" is currently registered. ` +
              `Available: ${[...toolMap.keys()].join(", ")}`,
          );
        }
        return tool.execute(args, {} as ModelContextClient);
      },
    };
  }
}
