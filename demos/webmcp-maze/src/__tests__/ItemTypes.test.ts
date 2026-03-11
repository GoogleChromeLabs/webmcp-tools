/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
  CollectibleType,
  BlockerType,
  ItemColor,
  collectibleColor,
  blockerColor,
  canUnlock,
  collectibleDisplayName,
  blockerDisplayName,
} from "../types/index.ts";

describe("collectibleColor", () => {
  it("returns Red for KeyRed", () => {
    expect(collectibleColor(CollectibleType.KeyRed)).toBe(ItemColor.Red);
  });

  it("returns Blue for KeyBlue", () => {
    expect(collectibleColor(CollectibleType.KeyBlue)).toBe(ItemColor.Blue);
  });

  it("returns Green for KeyGreen", () => {
    expect(collectibleColor(CollectibleType.KeyGreen)).toBe(ItemColor.Green);
  });

  it("returns null for Dynamite", () => {
    expect(collectibleColor(CollectibleType.Dynamite)).toBeNull();
  });
});

describe("blockerColor", () => {
  it("returns Red for DoorRed", () => {
    expect(blockerColor(BlockerType.DoorRed)).toBe(ItemColor.Red);
  });

  it("returns Blue for DoorBlue", () => {
    expect(blockerColor(BlockerType.DoorBlue)).toBe(ItemColor.Blue);
  });

  it("returns Green for DoorGreen", () => {
    expect(blockerColor(BlockerType.DoorGreen)).toBe(ItemColor.Green);
  });

  it("returns null for Rock", () => {
    expect(blockerColor(BlockerType.Rock)).toBeNull();
  });
});

describe("canUnlock", () => {
  it("red key opens red door", () => {
    expect(canUnlock(CollectibleType.KeyRed, BlockerType.DoorRed)).toBe(true);
  });

  it("blue key opens blue door", () => {
    expect(canUnlock(CollectibleType.KeyBlue, BlockerType.DoorBlue)).toBe(true);
  });

  it("green key opens green door", () => {
    expect(canUnlock(CollectibleType.KeyGreen, BlockerType.DoorGreen)).toBe(
      true,
    );
  });

  it("dynamite destroys rock", () => {
    expect(canUnlock(CollectibleType.Dynamite, BlockerType.Rock)).toBe(true);
  });

  it("red key does not open blue door", () => {
    expect(canUnlock(CollectibleType.KeyRed, BlockerType.DoorBlue)).toBe(false);
  });

  it("dynamite does not open doors", () => {
    expect(canUnlock(CollectibleType.Dynamite, BlockerType.DoorRed)).toBe(
      false,
    );
  });

  it("keys do not destroy rocks", () => {
    expect(canUnlock(CollectibleType.KeyRed, BlockerType.Rock)).toBe(false);
    expect(canUnlock(CollectibleType.KeyBlue, BlockerType.Rock)).toBe(false);
    expect(canUnlock(CollectibleType.KeyGreen, BlockerType.Rock)).toBe(false);
  });
});

describe("collectibleDisplayName", () => {
  it("returns human-readable names", () => {
    expect(collectibleDisplayName(CollectibleType.KeyRed)).toBe("RED KEY");
    expect(collectibleDisplayName(CollectibleType.Dynamite)).toBe("DYNAMITE");
  });
});

describe("blockerDisplayName", () => {
  it("returns human-readable names", () => {
    expect(blockerDisplayName(BlockerType.DoorRed)).toBe("red door");
    expect(blockerDisplayName(BlockerType.Rock)).toBe("rock");
  });
});
