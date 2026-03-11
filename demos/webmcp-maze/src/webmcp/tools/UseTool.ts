/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Game } from "../../game/Game.ts";
import {
  Direction,
  OPPOSITE_DIRECTION,
  collectibleDisplayName,
  blockerDisplayName,
} from "../../types/index.ts";

/** Valid direction strings accepted by the use tool input. */
const VALID_DIRECTIONS = new Set(Object.values(Direction));

/**
 * Creates the `use` MCP tool.
 * Uses the held item on a blocker in the specified direction.
 *
 * @param game - The game orchestrator instance.
 * @returns A {@link ModelContextTool} for using items on blockers.
 */
export function createUseTool(game: Game): ModelContextTool {
  return {
    name: "use",
    description:
      "Use your held item on a blocker in the specified direction. " +
      "Keys open matching colored doors. Dynamite destroys rocks. " +
      "The item is consumed on success.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["north", "south", "east", "west"],
          description: "The direction where the blocker is located.",
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

      if (game.player.inventory === null) {
        return {
          success: false,
          reason: "You are not holding any item to use.",
        };
      }

      const pos = game.player.position;
      const blocker = game.board.getBlocker(pos, dir as Direction);

      if (!blocker) {
        return {
          success: false,
          reason: `No blocker found in the ${dir} direction.`,
        };
      }

      const itemName = collectibleDisplayName(game.player.inventory);
      const blockerName = blockerDisplayName(blocker.type);

      const used = game.player.useItem(blocker.type);

      if (!used) {
        return {
          success: false,
          reason: `Your ${itemName} cannot clear the ${blockerName}.`,
          holding: game.player.inventory,
          blocker: blocker.type,
        };
      }

      // Remove blocker from both sides of the passage
      game.board.removeBlocker(pos, dir as Direction);
      const neighborPos = game.board.neighbor(pos, dir as Direction);
      if (neighborPos) {
        game.board.removeBlocker(
          neighborPos,
          OPPOSITE_DIRECTION[dir as Direction],
        );
      }

      game.renderer.updateBlockers(game.board);
      game.board.revealFrom(pos);
      game.renderer.updateFog(game.board);
      game.gameplayState?.updateInventory();
      game.gameplayState?.updateExploredCount();

      return {
        success: true,
        message: `Used ${itemName} to clear the ${blockerName}!`,
        direction: dir,
      };
    },
  };
}
