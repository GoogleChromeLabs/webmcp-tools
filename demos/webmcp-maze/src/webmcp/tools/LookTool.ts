/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Game } from "../../game/Game.ts";
import { Direction } from "../../types/index.ts";

/**
 * Creates the `look` MCP tool.
 * Inspects the player's surroundings — reports which directions are open,
 * the player's current position, and whether they are at the exit.
 *
 * @param game - The game orchestrator instance.
 * @returns A {@link WebMCP.ModelContextTool} for inspecting surroundings.
 */
export function createLookTool(game: Game): WebMCP.ModelContextTool {
  return {
    name: "look",
    description:
      "Look around the current cell. Returns the player's position, " +
      "which directions are open, any blockers or collectibles nearby, " +
      "your current inventory, and whether the exit is here.",
    annotations: { readOnlyHint: true },
    async execute() {
      const pos = game.player.position;
      const openDirections = game.board.openDirections(pos);
      const atExit = game.board.isExit(pos);
      const exitRevealed = game.board.isRevealed(game.board.exit);

      // Check for collectible at current position
      const collectible = game.board.getCollectible(pos);

      // Check each direction for blockers (on passages without walls)
      const blockedDirections: Record<string, string> = {};
      for (const dir of Object.values(Direction)) {
        if (game.board.hasWall(pos, dir)) continue;
        const blocker = game.board.getBlocker(pos, dir);
        if (blocker) {
          blockedDirections[dir] = blocker.type;
        }
      }

      return {
        position: { row: pos.row, col: pos.col },
        openDirections,
        blockedDirections:
          Object.keys(blockedDirections).length > 0
            ? blockedDirections
            : undefined,
        collectibleHere: collectible?.type ?? null,
        inventory: game.player.inventory,
        atExit,
        exitPosition: exitRevealed
          ? { row: game.board.exit.row, col: game.board.exit.col }
          : "unknown — not yet visible through fog of war",
        mazeSize: { rows: game.board.rows, cols: game.board.cols },
        moveCount: game.player.moveCount,
      };
    },
  };
}
