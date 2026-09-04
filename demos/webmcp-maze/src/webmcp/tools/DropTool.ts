/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Game } from "../../game/Game.ts";
import { collectibleDisplayName } from "../../types/index.ts";

/**
 * Creates the `drop` MCP tool.
 * Drops the currently held item at the player's current cell.
 *
 * @param game - The game orchestrator instance.
 * @returns A {@link WebMCP.ModelContextTool} for dropping items.
 */
export function createDropTool(game: Game): WebMCP.ModelContextTool {
  return {
    name: "drop",
    description:
      "Drop your currently held item at your current location. " +
      "The item will remain on this cell and can be picked up again later.",
    async execute() {
      if (game.player.inventory === null) {
        return {
          success: false,
          reason: "You are not carrying any item.",
        };
      }

      const pos = game.player.position;
      if (game.board.getCollectible(pos)) {
        return {
          success: false,
          reason:
            "There is already an item on this cell. Move to an empty cell first.",
        };
      }

      const item = game.player.drop()!;
      game.board.addCollectible({
        type: item,
        position: { ...pos },
      });
      game.renderer.updateCollectibles(game.board);
      game.gameplayState?.updateInventory();

      return {
        success: true,
        item,
        message: `Dropped: ${collectibleDisplayName(item)}`,
        position: { row: pos.row, col: pos.col },
      };
    },
  };
}
