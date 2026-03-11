/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Game } from "../../game/Game.ts";
import { GameplayState } from "../../game/states/GameplayState.ts";

/**
 * Creates the `start_game` MCP tool.
 * Transitions from the intro or game-over state into gameplay,
 * generating a fresh maze.
 *
 * @param game - The game orchestrator instance.
 * @returns A {@link ModelContextTool} for starting a new game.
 */
export function createStartGameTool(game: Game): ModelContextTool {
  return {
    name: "start_game",
    description:
      "Start a new maze game. Generates a fresh maze and places the player " +
      "at the top-left corner. The goal is to reach the bottom-right exit.",

    async execute() {
      game.newGame();
      game.setState(new GameplayState(game));

      return {
        message:
          "A new maze has been generated! Use 'look' to see your surroundings, then 'move' to navigate.",
        mazeSize: { rows: game.board.rows, cols: game.board.cols },
        startPosition: { row: 0, col: 0 },
        exitPosition: { row: game.board.exit.row, col: game.board.exit.col },
      };
    },
  };
}
