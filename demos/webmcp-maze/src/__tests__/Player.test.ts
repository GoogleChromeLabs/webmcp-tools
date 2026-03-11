/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { Player } from "../game/Player.ts";
import { MazeBoard } from "../game/MazeBoard.ts";
import { Direction } from "../types/index.ts";

describe("Player", () => {
  /** Creates a small board with a specific wall removed for testing. */
  function boardWithOpening(dir: Direction): MazeBoard {
    const board = new MazeBoard(3, 3);
    board.removeWall({ row: 1, col: 1 }, dir);
    return board;
  }

  it("starts at the given position with zero moves", () => {
    const player = new Player({ row: 2, col: 3 });
    expect(player.position).toEqual({ row: 2, col: 3 });
    expect(player.moveCount).toBe(0);
  });

  it("defaults to (0, 0) when no start is provided", () => {
    const player = new Player();
    expect(player.position).toEqual({ row: 0, col: 0 });
  });

  it("moves successfully when no wall blocks the way", () => {
    const board = boardWithOpening(Direction.East);
    const player = new Player({ row: 1, col: 1 });

    const result = player.move(Direction.East, board);
    expect(result).toBe(true);
    expect(player.position).toEqual({ row: 1, col: 2 });
    expect(player.moveCount).toBe(1);
  });

  it("rejects movement when a wall blocks the way", () => {
    const board = new MazeBoard(3, 3); // all walls intact
    const player = new Player({ row: 1, col: 1 });

    const result = player.move(Direction.North, board);
    expect(result).toBe(false);
    expect(player.position).toEqual({ row: 1, col: 1 });
    expect(player.moveCount).toBe(0);
  });

  it("increments move count on each successful move", () => {
    const board = new MazeBoard(3, 3);
    // Open a path: (1,0) -> (1,1) -> (1,2)
    board.removeWall({ row: 1, col: 0 }, Direction.East);
    board.removeWall({ row: 1, col: 1 }, Direction.East);
    const player = new Player({ row: 1, col: 0 });

    player.move(Direction.East, board);
    player.move(Direction.East, board);
    expect(player.moveCount).toBe(2);
    expect(player.position).toEqual({ row: 1, col: 2 });
  });

  it("does not increment move count on failed moves", () => {
    const board = new MazeBoard(3, 3);
    const player = new Player({ row: 1, col: 1 });

    player.move(Direction.North, board);
    player.move(Direction.South, board);
    expect(player.moveCount).toBe(0);
  });

  it("resets position and move count", () => {
    const board = boardWithOpening(Direction.South);
    const player = new Player({ row: 1, col: 1 });
    player.move(Direction.South, board);

    player.reset({ row: 0, col: 0 });
    expect(player.position).toEqual({ row: 0, col: 0 });
    expect(player.moveCount).toBe(0);
  });

  it("reset defaults to (0, 0)", () => {
    const player = new Player({ row: 5, col: 5 });
    player.reset();
    expect(player.position).toEqual({ row: 0, col: 0 });
  });

  it("cannot move out of bounds even if no wall", () => {
    const board = new MazeBoard(3, 3);
    // Remove the north wall of (0,0) — there's no cell above, so move should fail
    const cell = board.getCell({ row: 0, col: 0 })!;
    cell.walls[Direction.North] = false;

    const player = new Player({ row: 0, col: 0 });
    const result = player.move(Direction.North, board);
    expect(result).toBe(false);
    expect(player.position).toEqual({ row: 0, col: 0 });
  });
});
