/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Game } from "../../game/Game.ts";
import { Direction, blockerDisplayName } from "../../types/index.ts";

/** Valid direction strings accepted by the move tool input. */
const VALID_DIRECTIONS = new Set(Object.values(Direction));

/**
 * Creates the `move` MCP tool.
 * Moves the player one cell in a cardinal direction if the path is clear.
 *
 * @param game - The game orchestrator instance.
 * @returns A {@link WebMCP.ModelContextTool} for player movement.
 */
export function createMoveTool(game: Game): WebMCP.ModelContextTool {
  return {
    name: "move",
    description:
      "Move the player one cell in a cardinal direction (north, south, east, west). " +
      "Returns success or failure with a reason.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["north", "south", "east", "west"],
          description: "The direction to move.",
        },
      },
      required: ["direction"],
    },
    async execute(input: Record<string, unknown>) {
      const dir = input.direction as string;

      if (!VALID_DIRECTIONS.has(dir as Direction)) {
        return {
          success: false,
          reason: `Invalid direction: "${dir}". Use north, south, east, or west.`,
        };
      }

      const moved = game.player.move(dir as Direction, game.board);

      if (moved) {
        await game.renderer.animatePlayerMove(game.player.position);
        game.board.revealFrom(game.player.position);
        game.renderer.updateFog(game.board);
        game.gameplayState?.updateMoveCount(game.player.moveCount);
        game.gameplayState?.updateExploredCount();

        const atExit = game.board.isExit(game.player.position);
        return {
          success: true,
          position: {
            row: game.player.position.row,
            col: game.player.position.col,
          },
          atExit,
          moveCount: game.player.moveCount,
        };
      }

      // Check if blocked by a blocker (not a wall)
      const blocker = game.board.getBlocker(
        game.player.position,
        dir as Direction,
      );
      if (blocker) {
        return {
          success: false,
          reason: `A ${blockerDisplayName(blocker.type)} blocks the ${dir} direction. Use an item to clear it.`,
          blocker: blocker.type,
        };
      }

      return {
        success: false,
        reason: `There is a wall blocking the ${dir} direction.`,
      };
    },
  };
}
