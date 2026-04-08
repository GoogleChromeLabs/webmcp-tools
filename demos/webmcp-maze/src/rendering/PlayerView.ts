/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Graphics, Container } from "pixi.js";
import {
  type Position,
  CELL_SIZE,
  MOVE_ANIM_DURATION,
} from "../types/index.ts";

/** Bright neon magenta for the player core. */
const PLAYER_COLOR = 0xff00cc;

/** Glow color for the player halo. */
const PLAYER_GLOW_COLOR = 0xff00cc;

/** Radius of the player circle in pixels. */
const PLAYER_RADIUS = CELL_SIZE * 0.25;

/** Radius of the outer glow halo. */
const GLOW_RADIUS = CELL_SIZE * 0.4;

/** Maximum number of trail segments to keep. */
const TRAIL_MAX_LENGTH = 60;

/** Color for trail segments. */
const TRAIL_COLOR = 0xff00cc;

/**
 * Draws the player as a neon circle with a soft glow halo and a fading
 * movement trail. Supports both instant positioning ({@link updatePosition})
 * and smooth animated transitions ({@link animateTo}).
 */
export class PlayerView {
  /** The PixiJS container holding the player graphic. */
  readonly container: Container;

  /** The glow halo behind the player. */
  private glow: Graphics;

  /** The core circle graphic representing the player. */
  private circle: Graphics;

  /** Container for the trail segments (rendered behind the player). */
  private trailContainer: Container;

  /** Stored trail positions (pixel coordinates). */
  private trail: { x: number; y: number }[] = [];

  /** Whether an animation is currently in progress. */
  private animating = false;

  /** Animation start x/y in pixels. */
  private fromX = 0;
  private fromY = 0;

  /** Animation target x/y in pixels. */
  private toX = 0;
  private toY = 0;

  /** Milliseconds elapsed since the animation started. */
  private elapsed = 0;

  /** Total animation duration in milliseconds. */
  private duration = MOVE_ANIM_DURATION;

  /** Resolve function for the current animation promise. */
  private resolveAnim: (() => void) | null = null;

  constructor() {
    this.container = new Container();

    this.trailContainer = new Container();
    this.container.addChild(this.trailContainer);

    // Glow halo (rendered behind the core)
    this.glow = new Graphics();
    this.glow
      .circle(0, 0, GLOW_RADIUS)
      .fill({ color: PLAYER_GLOW_COLOR, alpha: 0.15 });
    this.container.addChild(this.glow);

    // Bright core
    this.circle = new Graphics();
    this.circle.circle(0, 0, PLAYER_RADIUS).fill(PLAYER_COLOR);
    // Inner bright highlight
    this.circle
      .circle(0, 0, PLAYER_RADIUS * 0.5)
      .fill({ color: 0xffffff, alpha: 0.6 });
    this.container.addChild(this.circle);
  }

  /**
   * Instantly snaps the player graphic to the center of the given cell.
   * Clears the trail. Use this for initial placement, not for in-game movement.
   * @param pos - The row/col grid position to move to.
   */
  updatePosition(pos: Position): void {
    this.glow.x = 0;
    this.glow.y = 0;
    this.circle.x = 0;
    this.circle.y = 0;
    this.container.x = pos.col * CELL_SIZE + CELL_SIZE / 2;
    this.container.y = pos.row * CELL_SIZE + CELL_SIZE / 2;
    this.trail = [];
    this.redrawTrail();
  }

  /**
   * Smoothly animates the player from its current position to the target cell.
   * Adds the starting position to the trail before moving.
   * Resolves the returned promise once the animation completes.
   * @param pos - The target row/col grid position.
   * @returns A promise that resolves when the animation finishes.
   */
  animateTo(pos: Position): Promise<void> {
    // Record current position in the trail
    this.trail.push({ x: this.container.x, y: this.container.y });
    if (this.trail.length > TRAIL_MAX_LENGTH) {
      this.trail.shift();
    }

    this.fromX = this.container.x;
    this.fromY = this.container.y;
    this.toX = pos.col * CELL_SIZE + CELL_SIZE / 2;
    this.toY = pos.row * CELL_SIZE + CELL_SIZE / 2;
    this.elapsed = 0;
    this.duration = MOVE_ANIM_DURATION;
    this.animating = true;

    return new Promise<void>((resolve) => {
      this.resolveAnim = resolve;
    });
  }

  /**
   * Advances the animation by the given delta time.
   * Call this every frame from the renderer's tick loop.
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    if (!this.animating) return;

    this.elapsed += dt * 1000;
    const t = Math.min(this.elapsed / this.duration, 1);

    // Ease-in-out cubic: smooth acceleration and deceleration
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.container.x = this.fromX + (this.toX - this.fromX) * eased;
    this.container.y = this.fromY + (this.toY - this.fromY) * eased;

    if (t >= 1) {
      this.container.x = this.toX;
      this.container.y = this.toY;
      this.animating = false;
      this.resolveAnim?.();
      this.resolveAnim = null;
    }

    this.redrawTrail();
  }

  /**
   * Redraws all trail segments with fading opacity.
   * Older segments are more transparent.
   */
  private redrawTrail(): void {
    this.trailContainer.removeChildren();

    if (this.trail.length === 0) return;

    const gfx = new Graphics();
    const len = this.trail.length;

    for (let i = 0; i < len; i++) {
      const segment = this.trail[i];
      // Alpha fades from near-zero (oldest) to moderate (newest)
      const alpha = ((i + 1) / len) * 0.3;
      const radius = PLAYER_RADIUS * 0.4;

      // Trail positions are in stage-space; offset by container position
      const lx = segment.x - this.container.x;
      const ly = segment.y - this.container.y;

      gfx.circle(lx, ly, radius).fill({ color: TRAIL_COLOR, alpha });
    }

    this.trailContainer.addChild(gfx);
  }
}
