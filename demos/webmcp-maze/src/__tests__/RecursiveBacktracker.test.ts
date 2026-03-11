/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { MazeBoard } from "../game/MazeBoard.ts";
import { RecursiveBacktracker } from "../generation/RecursiveBacktracker.ts";

describe("RecursiveBacktracker", () => {
  /**
   * BFS from (0,0) to verify every cell is reachable.
   * Returns the set of visited "row,col" strings.
   */
  function reachableCells(board: MazeBoard): Set<string> {
    const visited = new Set<string>();
    const queue: { row: number; col: number }[] = [{ row: 0, col: 0 }];
    visited.add("0,0");

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dir of board.openDirections(current)) {
        const next = board.neighbor(current, dir);
        if (next) {
          const key = `${next.row},${next.col}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push(next);
          }
        }
      }
    }
    return visited;
  }

  it("generates a maze where all cells are reachable from the start", () => {
    const board = new MazeBoard(10, 10);
    const gen = new RecursiveBacktracker();
    gen.generate(board);

    const visited = reachableCells(board);
    expect(visited.size).toBe(100);
  });

  it("works on a 1x1 maze", () => {
    const board = new MazeBoard(1, 1);
    const gen = new RecursiveBacktracker();
    gen.generate(board);

    // Single cell — all walls should remain (no neighbors to carve to)
    const cell = board.getCell({ row: 0, col: 0 })!;
    expect(cell).toBeDefined();
  });

  it("works on a non-square maze", () => {
    const board = new MazeBoard(3, 7);
    const gen = new RecursiveBacktracker();
    gen.generate(board);

    const visited = reachableCells(board);
    expect(visited.size).toBe(21);
  });

  it("produces a perfect maze (no loops) — edges = cells - 1", () => {
    const board = new MazeBoard(8, 8);
    const gen = new RecursiveBacktracker();
    gen.generate(board);

    // Count open passages (each passage is shared by two cells, count once)
    let openPassages = 0;
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.getCell({ row: r, col: c })!;
        // Only count south and east to avoid double-counting
        if (!cell.walls.south) openPassages++;
        if (!cell.walls.east) openPassages++;
      }
    }

    // A perfect maze (spanning tree) has exactly cells - 1 edges
    expect(openPassages).toBe(board.rows * board.cols - 1);
  });

  it("produces different mazes on successive runs (non-deterministic)", () => {
    const snapshots: string[] = [];
    for (let i = 0; i < 5; i++) {
      const board = new MazeBoard(5, 5);
      const gen = new RecursiveBacktracker();
      gen.generate(board);

      // Serialize wall state
      let snap = "";
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const cell = board.getCell({ row: r, col: c })!;
          snap += Object.values(cell.walls)
            .map((w) => (w ? "1" : "0"))
            .join("");
        }
      }
      snapshots.push(snap);
    }

    // At least 2 distinct mazes out of 5 runs (extremely likely)
    const unique = new Set(snapshots);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });
});
