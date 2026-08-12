/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Game } from "../../game/Game.ts";
import { collectibleDisplayName } from "../../types/index.ts";

/**
 * Creates the `pickup` MCP tool.
 * Picks up a collectible from the player's current cell if inventory is empty.
 *
 * @param game - The game orchestrator instance.
 * @returns A {@link WebMCP.ModelContextTool} for picking up items.
 */
export function createPickupTool(game: Game): WebMCP.ModelContextTool {
  return {
    name: "pickup",
    description:
      "Pick up a collectible item (key or dynamite) from your current cell. " +
      "You can only carry one item at a time. Drop your current item first if needed.",
    async execute() {
      const pos = game.player.position;
      const collectible = game.board.getCollectible(pos);

      if (!collectible) {
        return {
          success: false,
          reason: "There is no item to pick up at your current location.",
        };
      }

      if (game.player.inventory !== null) {
        return {
          success: false,
          reason: `Your hands are full. You are already carrying: ${collectibleDisplayName(game.player.inventory)}. Drop it first.`,
          currentItem: game.player.inventory,
        };
      }

      game.player.pickup(collectible.type);
      game.board.removeCollectible(pos);
      game.renderer.updateCollectibles(game.board);
      game.gameplayState?.updateInventory();

      return {
        success: true,
        item: collectible.type,
        message: `Picked up: ${collectibleDisplayName(collectible.type)}`,
      };
    },
  };
}
