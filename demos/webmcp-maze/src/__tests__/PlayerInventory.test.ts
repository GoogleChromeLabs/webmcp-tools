/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { Player } from "../game/Player.ts";
import { MazeBoard } from "../game/MazeBoard.ts";
import { Direction, CollectibleType, BlockerType } from "../types/index.ts";

describe("Player inventory", () => {
  it("starts with null inventory", () => {
    const player = new Player();
    expect(player.inventory).toBeNull();
  });

  it("pickup succeeds when inventory is empty", () => {
    const player = new Player();
    expect(player.pickup(CollectibleType.KeyRed)).toBe(true);
    expect(player.inventory).toBe(CollectibleType.KeyRed);
  });

  it("pickup fails when inventory is full", () => {
    const player = new Player();
    player.pickup(CollectibleType.KeyRed);
    expect(player.pickup(CollectibleType.Dynamite)).toBe(false);
    expect(player.inventory).toBe(CollectibleType.KeyRed);
  });

  it("drop returns held item and clears inventory", () => {
    const player = new Player();
    player.pickup(CollectibleType.KeyBlue);
    const dropped = player.drop();
    expect(dropped).toBe(CollectibleType.KeyBlue);
    expect(player.inventory).toBeNull();
  });

  it("drop returns null when inventory is empty", () => {
    const player = new Player();
    expect(player.drop()).toBeNull();
  });

  it("useItem succeeds with matching key/door", () => {
    const player = new Player();
    player.pickup(CollectibleType.KeyRed);
    expect(player.useItem(BlockerType.DoorRed)).toBe(true);
    expect(player.inventory).toBeNull();
  });

  it("useItem succeeds with dynamite on rock", () => {
    const player = new Player();
    player.pickup(CollectibleType.Dynamite);
    expect(player.useItem(BlockerType.Rock)).toBe(true);
    expect(player.inventory).toBeNull();
  });

  it("useItem fails with wrong key color", () => {
    const player = new Player();
    player.pickup(CollectibleType.KeyRed);
    expect(player.useItem(BlockerType.DoorBlue)).toBe(false);
    expect(player.inventory).toBe(CollectibleType.KeyRed);
  });

  it("useItem fails when inventory is empty", () => {
    const player = new Player();
    expect(player.useItem(BlockerType.Rock)).toBe(false);
  });

  it("reset clears inventory", () => {
    const player = new Player();
    player.pickup(CollectibleType.Dynamite);
    player.reset();
    expect(player.inventory).toBeNull();
  });
});

describe("Player movement with blockers", () => {
  it("cannot move through a blocker", () => {
    const board = new MazeBoard(3, 3);
    board.removeWall({ row: 1, col: 1 }, Direction.East);
    board.addBlocker({
      type: BlockerType.DoorRed,
      position: { row: 1, col: 1 },
      direction: Direction.East,
    });

    const player = new Player({ row: 1, col: 1 });
    expect(player.move(Direction.East, board)).toBe(false);
    expect(player.position).toEqual({ row: 1, col: 1 });
  });

  it("can move through passage after blocker is removed", () => {
    const board = new MazeBoard(3, 3);
    board.removeWall({ row: 1, col: 1 }, Direction.East);
    board.addBlocker({
      type: BlockerType.Rock,
      position: { row: 1, col: 1 },
      direction: Direction.East,
    });

    // Remove the blocker
    board.removeBlocker({ row: 1, col: 1 }, Direction.East);

    const player = new Player({ row: 1, col: 1 });
    expect(player.move(Direction.East, board)).toBe(true);
    expect(player.position).toEqual({ row: 1, col: 2 });
  });
});
