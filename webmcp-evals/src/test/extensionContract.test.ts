/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { normalizeDomSnapshot } from "../extension/adapters.js";
import {
  checkPanelReadiness,
  deriveAgentStatus,
  extractFinalResponse,
  matchesAttachedDomain,
  normalizeSnapshot,
  ZERO_TOOL_GRACE_MS,
  type AgentPanelSnapshot,
  type PanelReadinessContext,
} from "../extension/contract.js";
import { baseRawDomSnapshot, sampleConfirmation } from "./extensionFixtures.js";

function baseSnapshot(overrides: Partial<AgentPanelSnapshot> = {}) {
  return normalizeSnapshot({
    consentVisible: false,
    settingsVisible: false,
    composerVisible: true,
    actionVariant: "send",
    attachedDomain: "localhost",
    detectedToolCount: 3,
    items: [],
    confirmations: [],
    ...overrides,
  });
}

function readinessContext(overrides: Partial<PanelReadinessContext> = {}): PanelReadinessContext {
  return {
    targetUrl: new URL("http://localhost:5173/pizza/"),
    pageToolCount: 3,
    waitedMs: 0,
    chatCleared: false,
    canAcceptConsent: false,
    ...overrides,
  };
}

describe("extension contract helpers", () => {
  describe("checkPanelReadiness", () => {
    it("waits while the extension has not found the page's tools yet", () => {
      const snap = normalizeDomSnapshot(baseRawDomSnapshot({ toolsChipText: null }));
      const readiness = checkPanelReadiness(snap, readinessContext({ waitedMs: 5_000 }));
      assert.strictEqual(readiness.status, "wait");
      assert.match(readiness.status === "wait" ? readiness.reason : "", /detected 0 tools/);
    });

    it("stops waiting for tools on a page that registers none, after a short grace period", () => {
      const snap = normalizeDomSnapshot(baseRawDomSnapshot({ toolsChipText: null }));
      assert.strictEqual(
        checkPanelReadiness(snap, readinessContext({ pageToolCount: 0, waitedMs: 0 })).status,
        "wait",
      );
      assert.strictEqual(
        checkPanelReadiness(
          snap,
          readinessContext({ pageToolCount: 0, waitedMs: ZERO_TOOL_GRACE_MS }),
        ).status,
        "ready",
      );
    });

    it("skips the tool check for extensions that only find tools during a turn", () => {
      const snap = baseSnapshot({ detectedToolCount: null });
      assert.strictEqual(checkPanelReadiness(snap, readinessContext()).status, "ready");
    });

    it("fails on a consent screen unless the harness installed the extension", () => {
      const snap = baseSnapshot({ consentVisible: true });
      const installed = checkPanelReadiness(snap, readinessContext());
      assert.strictEqual(installed.status, "fail");
      assert.match(installed.status === "fail" ? installed.reason : "", /consent screen/);

      const fresh = checkPanelReadiness(snap, readinessContext({ canAcceptConsent: true }));
      assert.deepStrictEqual(fresh, {
        status: "wait",
        reason: "consent screen visible",
        action: "accept-consent",
      });
    });

    it("refocuses the web app, clears old chat once, and waits for the composer", () => {
      const elsewhere = checkPanelReadiness(
        baseSnapshot({ attachedDomain: "example.com" }),
        readinessContext(),
      );
      assert.strictEqual(elsewhere.status === "wait" && elsewhere.action, "focus-web-app");

      const oldChat = baseSnapshot({ items: [{ kind: "user", text: "Earlier question" }] });
      const first = checkPanelReadiness(oldChat, readinessContext());
      assert.strictEqual(first.status === "wait" && first.action, "start-new-chat");
      assert.strictEqual(
        checkPanelReadiness(oldChat, readinessContext({ chatCleared: true })).status,
        "ready",
      );

      const noComposer = checkPanelReadiness(
        baseSnapshot({ composerVisible: false }),
        readinessContext(),
      );
      assert.strictEqual(noComposer.status, "wait");
    });
  });

  describe("matchesAttachedDomain", () => {
    it("matches by hostname, host with port, or full origin", () => {
      const url = new URL("http://localhost:5173/checkout");
      assert.strictEqual(matchesAttachedDomain("localhost", url), true);
      assert.strictEqual(matchesAttachedDomain("localhost:5173", url), true);
      assert.strictEqual(matchesAttachedDomain("http://localhost:5173/", url), true);
      assert.strictEqual(matchesAttachedDomain("example.com", url), false);
      assert.strictEqual(matchesAttachedDomain(null, url), false);
    });
  });

  describe("normalizeSnapshot", () => {
    it("normalizes casing, defaults, and non-finite tool counts", () => {
      const normalized = normalizeSnapshot({
        composerVisible: true,
        actionVariant: "STOP",
        attachedDomain: "example.com",
        detectedToolCount: Number.NaN,
        items: [],
      });

      assert.strictEqual(normalized.consentVisible, false);
      assert.strictEqual(normalized.settingsVisible, false);
      assert.strictEqual(normalized.actionVariant, "stop");
      assert.strictEqual(normalized.detectedToolCount, null);
      assert.deepStrictEqual(normalized.confirmations, []);
    });
  });

  describe("deriveAgentStatus", () => {
    it("stays busy while a confirmation card is shown even if the stop button is hidden", () => {
      const status = deriveAgentStatus(
        baseSnapshot({ actionVariant: "live", confirmations: [sampleConfirmation] }),
      );
      assert.strictEqual(status.busy, true);
      assert.deepStrictEqual(status.pendingConfirmations, [sampleConfirmation]);
    });

    it("is busy while the action button shows stop and idle otherwise", () => {
      assert.strictEqual(deriveAgentStatus(baseSnapshot({ actionVariant: "stop" })).busy, true);
      assert.strictEqual(deriveAgentStatus(baseSnapshot({ actionVariant: "send" })).busy, false);
      assert.strictEqual(deriveAgentStatus(baseSnapshot({ actionVariant: null })).busy, false);
    });

    it("reports only an error item that belongs to the latest user turn", () => {
      const current = deriveAgentStatus(
        baseSnapshot({
          items: [
            { kind: "user", text: "Hello" },
            { kind: "error", text: "Rate limit exceeded" },
          ],
        }),
      );
      assert.strictEqual(current.error, "Rate limit exceeded");

      const previous = deriveAgentStatus(
        baseSnapshot({
          items: [
            { kind: "error", text: "Old failure" },
            { kind: "user", text: "Try again" },
          ],
        }),
      );
      assert.strictEqual(previous.error, null);
    });
  });

  describe("extractFinalResponse", () => {
    it("extracts only the AI response belonging to the latest user turn", () => {
      const snap = baseSnapshot({
        items: [
          { kind: "user", text: "Turn 1 question" },
          { kind: "ai", text: "Turn 1 answer" },
          { kind: "user", text: "Turn 2 question" },
          { kind: "ai", text: "First paragraph." },
          { kind: "ai", text: "Second paragraph." },
        ],
      });

      assert.strictEqual(extractFinalResponse(snap.items), "First paragraph.\n\nSecond paragraph.");
    });

    it("returns null if the latest user turn has not produced an AI response yet", () => {
      const snap = baseSnapshot({
        items: [
          { kind: "user", text: "Turn 1" },
          { kind: "ai", text: "Old reply" },
          { kind: "user", text: "Turn 2" },
        ],
      });

      assert.strictEqual(extractFinalResponse(snap.items), null);
    });
  });
});
