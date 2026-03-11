/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { MazeBoard } from "../game/MazeBoard.ts";
import { Direction, CollectibleType, BlockerType } from "../types/index.ts";

describe("MazeBoard collectibles", () => {
  it("adds and retrieves a collectible", () => {
    const board = new MazeBoard(3, 3);
    const pos = { row: 1, col: 2 };
    board.addCollectible({ type: CollectibleType.KeyRed, position: pos });

    const item = board.getCollectible(pos);
    expect(item).toBeDefined();
    expect(item!.type).toBe(CollectibleType.KeyRed);
  });

  it("returns undefined for empty cell", () => {
    const board = new MazeBoard(3, 3);
    expect(board.getCollectible({ row: 0, col: 0 })).toBeUndefined();
  });

  it("removes a collectible", () => {
    const board = new MazeBoard(3, 3);
    const pos = { row: 0, col: 1 };
    board.addCollectible({ type: CollectibleType.Dynamite, position: pos });

    const removed = board.removeCollectible(pos);
    expect(removed).toBeDefined();
    expect(removed!.type).toBe(CollectibleType.Dynamite);
    expect(board.getCollectible(pos)).toBeUndefined();
  });

  it("getAllCollectibles returns all placed items", () => {
    const board = new MazeBoard(3, 3);
    board.addCollectible({
      type: CollectibleType.KeyRed,
      position: { row: 0, col: 0 },
    });
    board.addCollectible({
      type: CollectibleType.KeyBlue,
      position: { row: 1, col: 1 },
    });
    expect(board.getAllCollectibles()).toHaveLength(2);
  });
});

describe("MazeBoard blockers", () => {
  it("adds and retrieves a blocker", () => {
    const board = new MazeBoard(3, 3);
    const pos = { row: 1, col: 1 };
    board.addBlocker({
      type: BlockerType.DoorRed,
      position: pos,
      direction: Direction.East,
    });

    const blocker = board.getBlocker(pos, Direction.East);
    expect(blocker).toBeDefined();
    expect(blocker!.type).toBe(BlockerType.DoorRed);
  });

  it("returns undefined when no blocker exists", () => {
    const board = new MazeBoard(3, 3);
    expect(
      board.getBlocker({ row: 0, col: 0 }, Direction.North),
    ).toBeUndefined();
  });

  it("removes a blocker", () => {
    const board = new MazeBoard(3, 3);
    const pos = { row: 0, col: 0 };
    board.addBlocker({
      type: BlockerType.Rock,
      position: pos,
      direction: Direction.South,
    });

    const removed = board.removeBlocker(pos, Direction.South);
    expect(removed).toBeDefined();
    expect(removed!.type).toBe(BlockerType.Rock);
    expect(board.getBlocker(pos, Direction.South)).toBeUndefined();
  });

  it("getAllBlockers returns all placed blockers", () => {
    const board = new MazeBoard(3, 3);
    board.addBlocker({
      type: BlockerType.Rock,
      position: { row: 0, col: 0 },
      direction: Direction.East,
    });
    board.addBlocker({
      type: BlockerType.DoorBlue,
      position: { row: 1, col: 1 },
      direction: Direction.South,
    });
    expect(board.getAllBlockers()).toHaveLength(2);
  });
});

describe("MazeBoard isBlocked", () => {
  it("returns true when wall is present", () => {
    const board = new MazeBoard(3, 3);
    expect(board.isBlocked({ row: 0, col: 0 }, Direction.East)).toBe(true);
  });

  it("returns true when blocker is present on open passage", () => {
    const board = new MazeBoard(3, 3);
    board.removeWall({ row: 1, col: 1 }, Direction.East);
    board.addBlocker({
      type: BlockerType.DoorGreen,
      position: { row: 1, col: 1 },
      direction: Direction.East,
    });
    expect(board.isBlocked({ row: 1, col: 1 }, Direction.East)).toBe(true);
  });

  it("returns false when passage is open and no blocker", () => {
    const board = new MazeBoard(3, 3);
    board.removeWall({ row: 1, col: 1 }, Direction.North);
    expect(board.isBlocked({ row: 1, col: 1 }, Direction.North)).toBe(false);
  });
});

describe("MazeBoard openDirections with blockers", () => {
  it("excludes directions blocked by blockers", () => {
    const board = new MazeBoard(3, 3);
    board.removeWall({ row: 1, col: 1 }, Direction.North);
    board.removeWall({ row: 1, col: 1 }, Direction.East);

    // Block the east passage
    board.addBlocker({
      type: BlockerType.Rock,
      position: { row: 1, col: 1 },
      direction: Direction.East,
    });

    const open = board.openDirections({ row: 1, col: 1 });
    expect(open).toContain(Direction.North);
    expect(open).not.toContain(Direction.East);
  });
});
