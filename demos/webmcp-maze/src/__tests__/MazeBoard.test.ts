/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { MazeBoard } from "../game/MazeBoard.ts";
import { Direction } from "../types/index.ts";

describe("MazeBoard", () => {
  it("creates a grid of the correct dimensions", () => {
    const board = new MazeBoard(5, 7);
    expect(board.rows).toBe(5);
    expect(board.cols).toBe(7);
  });

  it("initializes all walls as intact", () => {
    const board = new MazeBoard(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = board.getCell({ row: r, col: c });
        expect(cell).toBeDefined();
        for (const dir of Object.values(Direction)) {
          expect(cell!.walls[dir]).toBe(true);
        }
      }
    }
  });

  it("returns undefined for out-of-bounds cells", () => {
    const board = new MazeBoard(3, 3);
    expect(board.getCell({ row: -1, col: 0 })).toBeUndefined();
    expect(board.getCell({ row: 3, col: 0 })).toBeUndefined();
    expect(board.getCell({ row: 0, col: -1 })).toBeUndefined();
    expect(board.getCell({ row: 0, col: 3 })).toBeUndefined();
  });

  it("correctly reports bounds", () => {
    const board = new MazeBoard(4, 6);
    expect(board.inBounds({ row: 0, col: 0 })).toBe(true);
    expect(board.inBounds({ row: 3, col: 5 })).toBe(true);
    expect(board.inBounds({ row: 4, col: 0 })).toBe(false);
    expect(board.inBounds({ row: 0, col: 6 })).toBe(false);
    expect(board.inBounds({ row: -1, col: 0 })).toBe(false);
  });

  it("returns correct neighbor positions", () => {
    const board = new MazeBoard(3, 3);
    expect(board.neighbor({ row: 1, col: 1 }, Direction.North)).toEqual({
      row: 0,
      col: 1,
    });
    expect(board.neighbor({ row: 1, col: 1 }, Direction.South)).toEqual({
      row: 2,
      col: 1,
    });
    expect(board.neighbor({ row: 1, col: 1 }, Direction.East)).toEqual({
      row: 1,
      col: 2,
    });
    expect(board.neighbor({ row: 1, col: 1 }, Direction.West)).toEqual({
      row: 1,
      col: 0,
    });
  });

  it("returns undefined for out-of-bounds neighbors", () => {
    const board = new MazeBoard(3, 3);
    expect(board.neighbor({ row: 0, col: 0 }, Direction.North)).toBeUndefined();
    expect(board.neighbor({ row: 0, col: 0 }, Direction.West)).toBeUndefined();
    expect(board.neighbor({ row: 2, col: 2 }, Direction.South)).toBeUndefined();
    expect(board.neighbor({ row: 2, col: 2 }, Direction.East)).toBeUndefined();
  });

  it("removes walls between adjacent cells symmetrically", () => {
    const board = new MazeBoard(3, 3);
    board.removeWall({ row: 0, col: 0 }, Direction.East);

    expect(board.hasWall({ row: 0, col: 0 }, Direction.East)).toBe(false);
    expect(board.hasWall({ row: 0, col: 1 }, Direction.West)).toBe(false);

    // Other walls remain intact
    expect(board.hasWall({ row: 0, col: 0 }, Direction.South)).toBe(true);
    expect(board.hasWall({ row: 0, col: 1 }, Direction.East)).toBe(true);
  });

  it("reports open directions correctly", () => {
    const board = new MazeBoard(3, 3);
    expect(board.openDirections({ row: 1, col: 1 })).toEqual([]);

    board.removeWall({ row: 1, col: 1 }, Direction.North);
    board.removeWall({ row: 1, col: 1 }, Direction.East);

    const open = board.openDirections({ row: 1, col: 1 });
    expect(open).toContain(Direction.North);
    expect(open).toContain(Direction.East);
    expect(open).not.toContain(Direction.South);
    expect(open).not.toContain(Direction.West);
  });

  it("identifies the exit cell", () => {
    const board = new MazeBoard(5, 5);
    expect(board.isExit({ row: 4, col: 4 })).toBe(true);
    expect(board.isExit({ row: 0, col: 0 })).toBe(false);
    expect(board.isExit({ row: 4, col: 3 })).toBe(false);
  });

  it("sets the exit to the bottom-right corner", () => {
    const board = new MazeBoard(8, 12);
    expect(board.exit).toEqual({ row: 7, col: 11 });
  });

  describe("fog of war visibility", () => {
    it("cells are not revealed by default", () => {
      const board = new MazeBoard(3, 3);
      expect(board.isRevealed({ row: 0, col: 0 })).toBe(false);
      expect(board.isRevealed({ row: 1, col: 1 })).toBe(false);
      expect(board.revealedCount).toBe(0);
    });

    it("revealCell marks a single cell", () => {
      const board = new MazeBoard(3, 3);
      board.revealCell({ row: 1, col: 2 });
      expect(board.isRevealed({ row: 1, col: 2 })).toBe(true);
      expect(board.isRevealed({ row: 0, col: 0 })).toBe(false);
      expect(board.revealedCount).toBe(1);
    });

    it("revealCell is idempotent", () => {
      const board = new MazeBoard(3, 3);
      board.revealCell({ row: 0, col: 0 });
      board.revealCell({ row: 0, col: 0 });
      expect(board.revealedCount).toBe(1);
    });

    it("revealCell ignores out-of-bounds positions", () => {
      const board = new MazeBoard(3, 3);
      board.revealCell({ row: -1, col: 0 });
      board.revealCell({ row: 3, col: 0 });
      expect(board.revealedCount).toBe(0);
    });

    it("revealFrom reveals cell and neighbors through open walls", () => {
      const board = new MazeBoard(3, 3);
      board.removeWall({ row: 1, col: 1 }, Direction.North);
      board.removeWall({ row: 1, col: 1 }, Direction.East);

      board.revealFrom({ row: 1, col: 1 });

      expect(board.isRevealed({ row: 1, col: 1 })).toBe(true);
      expect(board.isRevealed({ row: 0, col: 1 })).toBe(true); // north
      expect(board.isRevealed({ row: 1, col: 2 })).toBe(true); // east
      expect(board.isRevealed({ row: 2, col: 1 })).toBe(false); // south wall
      expect(board.isRevealed({ row: 1, col: 0 })).toBe(false); // west wall
    });

    it("revealFrom does not reveal through walls", () => {
      const board = new MazeBoard(3, 3);
      // All walls intact
      board.revealFrom({ row: 1, col: 1 });

      expect(board.isRevealed({ row: 1, col: 1 })).toBe(true);
      expect(board.revealedCount).toBe(1);
    });
  });
});
