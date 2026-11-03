/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Fixtures shared by the extension contract, adapter, and turn tests.

import type { RawDomPanelSnapshot } from "../extension/adapters.js";
import type { PendingConfirmation } from "../extension/contract.js";

export function baseRawDomSnapshot(
  overrides: Partial<RawDomPanelSnapshot> = {},
): RawDomPanelSnapshot {
  return {
    consentVisible: false,
    settingsVisible: false,
    composerVisible: true,
    actionVariant: "send",
    attachedDomain: "localhost",
    toolsChipText: "3 tools",
    items: [],
    confirmations: [],
    ...overrides,
  };
}

export const sampleConfirmation: PendingConfirmation = {
  id: "perm-1",
  title: "Allow tool action",
  toolName: "submitOrder",
  canAlwaysAllow: true,
};
