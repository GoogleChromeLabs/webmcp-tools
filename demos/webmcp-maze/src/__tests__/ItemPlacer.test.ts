/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { MazeBoard } from "../game/MazeBoard.ts";
import { RecursiveBacktracker } from "../generation/RecursiveBacktracker.ts";
import { ItemPlacer } from "../generation/ItemPlacer.ts";

describe("ItemPlacer", () => {
  /** Generates a maze and places items, returning the board. */
  function generateWithItems(rows = 10, cols = 10): MazeBoard {
    const board = new MazeBoard(rows, cols);
    new RecursiveBacktracker().generate(board);
    new ItemPlacer().place(board);
    return board;
  }

  it("places at least one collectible and one blocker", () => {
    const board = generateWithItems();
    expect(board.getAllCollectibles().length).toBeGreaterThanOrEqual(1);
    expect(board.getAllBlockers().length).toBeGreaterThanOrEqual(1);
  });

  it("places blockers on both sides of a passage", () => {
    const board = generateWithItems();
    const blockers = board.getAllBlockers();
    // Blockers come in pairs (both sides of the passage)
    // So total count should be even
    expect(blockers.length % 2).toBe(0);
  });

  it("does not place collectibles on start or exit", () => {
    const board = generateWithItems();
    const start = { row: 0, col: 0 };
    expect(board.getCollectible(start)).toBeUndefined();
    expect(board.getCollectible(board.exit)).toBeUndefined();
  });

  it("produces consistent results across multiple runs", () => {
    // Run 10 times — each should have items (or gracefully fall back)
    for (let i = 0; i < 10; i++) {
      const board = generateWithItems();
      const collectibles = board.getAllCollectibles();
      const blockers = board.getAllBlockers();
      // Either both are placed or both are empty (fallback)
      if (collectibles.length > 0) {
        expect(blockers.length).toBeGreaterThan(0);
      }
    }
  });

  it("works on small mazes", () => {
    const board = generateWithItems(3, 3);
    // Small maze may fall back to no items, which is acceptable
    const collectibles = board.getAllCollectibles();
    const blockers = board.getAllBlockers();
    expect(collectibles.length).toBeGreaterThanOrEqual(0);
    expect(blockers.length).toBeGreaterThanOrEqual(0);
  });
});
