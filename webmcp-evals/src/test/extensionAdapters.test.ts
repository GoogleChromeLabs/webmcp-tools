/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import type { Page } from "puppeteer-core";
import {
  confirmationButtonSelectors,
  createAutoDetectingExtensionAdapter,
  MISSING_RESOLVE_CONFIRMATION_MESSAGE,
  normalizeDomSnapshot,
  parseToolCount,
  WEBMCP_EXTENSION_SELECTORS,
} from "../extension/adapters.js";
import type { ConfirmationDecision } from "../extension/contract.js";
import { baseRawDomSnapshot, sampleConfirmation } from "./extensionFixtures.js";

describe("extension adapters", () => {
  describe("parseToolCount & normalizeDomSnapshot", () => {
    it("parses singular and plural tool badge strings", () => {
      assert.strictEqual(parseToolCount("5 tools"), 5);
      assert.strictEqual(parseToolCount("1 tool available"), 1);
      assert.strictEqual(parseToolCount("0 tools"), 0);
      assert.strictEqual(parseToolCount("no tools"), null);
      assert.strictEqual(parseToolCount(""), null);
      assert.strictEqual(parseToolCount(null), null);
    });

    it("reads a missing webmcp-extension tools label as 0 tools so readiness keeps waiting", () => {
      assert.strictEqual(
        normalizeDomSnapshot(baseRawDomSnapshot({ toolsChipText: null })).detectedToolCount,
        0,
      );
      assert.strictEqual(
        normalizeDomSnapshot(baseRawDomSnapshot({ toolsChipText: "Discovering..." }))
          .detectedToolCount,
        0,
      );
      assert.strictEqual(
        normalizeDomSnapshot(baseRawDomSnapshot({ toolsChipText: "4" })).detectedToolCount,
        4,
      );
    });
  });

  describe("confirmationButtonSelectors", () => {
    it("tries the always-allow button before the one-time allow button", () => {
      const sel = WEBMCP_EXTENSION_SELECTORS;
      assert.deepStrictEqual(confirmationButtonSelectors("always-allow"), [
        sel.permissionAlways,
        sel.permissionAllow,
      ]);
      assert.deepStrictEqual(confirmationButtonSelectors("allow-once"), [sel.permissionAllow]);
      assert.deepStrictEqual(confirmationButtonSelectors("deny"), [sel.permissionDeny]);
    });
  });

  describe("createAutoDetectingExtensionAdapter", () => {
    it("executes in-page bridge functions and caches bridge mode per panel page", async () => {
      const adapter = createAutoDetectingExtensionAdapter();
      const bridgeCalls: Array<[string, ...unknown[]]> = [];
      let evaluateCalls = 0;

      // The adapter's in-page functions read `window`, so give them a fake panel window.
      const globals = globalThis as Record<string, unknown>;
      const hadWindow = "window" in globals;
      const prevWindow = globals.window;
      globals.window = {
        __AGENT_AUTOMATION__: {
          getSnapshot: () => {
            bridgeCalls.push(["getSnapshot"]);
            return {
              composerVisible: true,
              actionVariant: "send",
              attachedDomain: "localhost",
              detectedToolCount: 2,
              items: [],
            };
          },
          sendPrompt: async (prompt: string) => {
            bridgeCalls.push(["sendPrompt", prompt]);
          },
          stopGeneration: async () => {
            bridgeCalls.push(["stopGeneration"]);
            return true;
          },
          startNewChat: async () => {
            bridgeCalls.push(["startNewChat"]);
            return true;
          },
          resolveConfirmation: async (id: string, decision: ConfirmationDecision) => {
            bridgeCalls.push(["resolveConfirmation", id, decision]);
            return true;
          },
        },
      };

      try {
        const bridgePage = {
          evaluate: async (fn: (...a: unknown[]) => unknown, ...args: unknown[]) => {
            evaluateCalls++;
            return await fn(...args);
          },
        } as unknown as Page;

        const snap = await adapter.readSnapshot(bridgePage);
        assert.strictEqual(snap.detectedToolCount, 2);
        assert.strictEqual(evaluateCalls, 1);

        // The bridge cannot accept a consent screen, so onboarding fails without
        // another round trip to the page.
        await assert.rejects(adapter.completeOnboarding(bridgePage), /has no way to accept it/);
        assert.strictEqual(evaluateCalls, 1);

        await adapter.submitPrompt(bridgePage, "Order pizza");
        assert.strictEqual(await adapter.stopGeneration(bridgePage), true);
        assert.strictEqual(await adapter.startNewChat(bridgePage), true);
        assert.strictEqual(
          await adapter.resolveConfirmation(bridgePage, sampleConfirmation.id, "allow-once"),
          true,
        );

        assert.deepStrictEqual(bridgeCalls, [
          ["getSnapshot"],
          ["sendPrompt", "Order pizza"],
          ["stopGeneration"],
          ["startNewChat"],
          ["resolveConfirmation", "perm-1", "allow-once"],
        ]);
      } finally {
        if (hadWindow) {
          globals.window = prevWindow;
        } else {
          delete globals.window;
        }
      }
    });

    it("explains what to implement when a bridge cannot answer a permission prompt", async () => {
      const adapter = createAutoDetectingExtensionAdapter();
      const globals = globalThis as Record<string, unknown>;
      const hadWindow = "window" in globals;
      const prevWindow = globals.window;
      // Lists a confirmation in getSnapshot() but has no resolveConfirmation().
      globals.window = {
        __AGENT_AUTOMATION__: {
          getSnapshot: () => ({
            composerVisible: true,
            actionVariant: "stop",
            attachedDomain: "localhost",
            detectedToolCount: 2,
            items: [],
            confirmations: [sampleConfirmation],
          }),
          sendPrompt: async () => undefined,
          startNewChat: async () => true,
        },
      };

      try {
        const bridgePage = {
          evaluate: async (fn: (...a: unknown[]) => unknown, ...args: unknown[]) =>
            await fn(...args),
        } as unknown as Page;

        await assert.rejects(
          adapter.resolveConfirmation(bridgePage, sampleConfirmation.id, "allow-once"),
          { message: MISSING_RESOLVE_CONFIRMATION_MESSAGE },
        );
      } finally {
        if (hadWindow) {
          globals.window = prevWindow;
        } else {
          delete globals.window;
        }
      }
    });
  });
});
