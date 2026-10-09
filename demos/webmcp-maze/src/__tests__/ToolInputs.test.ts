/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Game } from "../game/Game.ts";
import { createMoveTool } from "../webmcp/tools/MoveTool.ts";
import { createUseTool } from "../webmcp/tools/UseTool.ts";
import { createEvalTool } from "../webmcp/tools/EvalTool.ts";

describe("schema-inferred tool inputs", () => {
  it("infers required direction and code fields", () => {
    type DirectionInput = { direction: "north" | "south" | "east" | "west" };
    expectTypeOf<
      Parameters<ReturnType<typeof createMoveTool>["execute"]>[0]
    >().toEqualTypeOf<DirectionInput>();
    expectTypeOf<
      Parameters<ReturnType<typeof createUseTool>["execute"]>[0]
    >().toEqualTypeOf<DirectionInput>();
    expectTypeOf<
      Parameters<ReturnType<typeof createEvalTool>["execute"]>[0]
    >().toEqualTypeOf<{ code: string }>();
  });

  for (const factory of [createMoveTool, createUseTool]) {
    for (const direction of ["up", "", 42, undefined]) {
      it(`${factory.name} rejects invalid direction ${String(direction)} through dynamic dispatch`, async () => {
        // Match window.gameTools: untyped callers bypass schema validation.
        const tool = factory({} as Game) as unknown as WebMCP.ModelContextTool;
        await expect(
          tool.execute({ direction }, { signal: new AbortController().signal }),
        ).resolves.toEqual({
          success: false,
          reason: `Invalid direction: "${direction}". Use north, south, east, or west.`,
        });
      });
    }
  }

  it("preserves successful movement and renderer updates", async () => {
    const game = {
      player: {
        move: vi.fn(() => true),
        position: { row: 0, col: 1 },
        moveCount: 1,
      },
      board: { revealFrom: vi.fn(), isExit: vi.fn(() => false) },
      renderer: { animatePlayerMove: vi.fn(), updateFog: vi.fn() },
      gameplayState: { updateMoveCount: vi.fn(), updateExploredCount: vi.fn() },
    };
    await expect(
      createMoveTool(game as unknown as Game).execute({ direction: "east" }),
    ).resolves.toEqual({
      success: true,
      position: { row: 0, col: 1 },
      atExit: false,
      moveCount: 1,
    });
    expect(game.player.move).toHaveBeenCalledWith("east", game.board);
    expect(game.renderer.animatePlayerMove).toHaveBeenCalledWith(
      game.player.position,
    );
    expect(game.renderer.updateFog).toHaveBeenCalledWith(game.board);
  });

  it("preserves the empty-inventory response for a valid use direction", async () => {
    const game = { player: { inventory: null } } as unknown as Game;
    await expect(
      createUseTool(game).execute({ direction: "north" }),
    ).resolves.toEqual({
      success: false,
      reason: "You are not holding any item to use.",
    });
  });

  it("preserves cancellation before creating a worker", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Stopped"));
    const result = await createEvalTool().execute(
      { code: "return 1" },
      { signal: controller.signal },
    );
    expect(result).toMatchObject({ success: false });
    expect(result).toHaveProperty("error");
  });
});
