/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { pollUntil } from "../extension/asyncUtils.js";
import {
  deriveAgentStatus,
  type AgentPanelSnapshot,
  type AgentPanelStatus,
  type ConfirmationDecision,
  type PendingConfirmation,
} from "../extension/contract.js";
import {
  confirmationDecisionFor,
  extensionTurnOutcome,
  waitForTurnToFinish,
  type TurnClock,
  type TurnDriver,
} from "../extension/turn.js";
import { TimeoutError } from "../simulate/toolSequence.js";
import { sampleConfirmation } from "./extensionFixtures.js";

describe("extension turn helpers", () => {
  describe("extensionTurnOutcome", () => {
    it("treats an extension error as fatal only when no tools ran during the turn", () => {
      assert.deepStrictEqual(extensionTurnOutcome("Done.", null, 1), { text: "Done." });
      assert.deepStrictEqual(extensionTurnOutcome(null, "Quota exceeded", 0), {
        text: "",
        error: "Quota exceeded",
      });
      assert.deepStrictEqual(extensionTurnOutcome("Added item.", "Follow-up failed", 1), {
        text: "Added item.\n\n[Extension error] Follow-up failed",
      });
    });
  });

  describe("confirmationDecisionFor", () => {
    it("maps CLI policies to decisions and leaves prompts alone for none", () => {
      assert.strictEqual(confirmationDecisionFor(undefined), "allow-once");
      assert.strictEqual(confirmationDecisionFor("allow-once"), "allow-once");
      assert.strictEqual(confirmationDecisionFor("always-allow"), "always-allow");
      assert.strictEqual(confirmationDecisionFor("deny"), "deny");
      assert.strictEqual(confirmationDecisionFor("none"), null);
    });
  });
});

describe("pollUntil", () => {
  it("evaluates dynamic label callbacks at timeout time rather than before polling starts", async () => {
    let reason = "initial";
    await assert.rejects(
      () =>
        pollUntil(
          async () => {
            reason = "attached to none, expected localhost";
            return undefined;
          },
          {
            timeoutMs: 25,
            intervalMs: 5,
            label: () => `panel ready (${reason})`,
          },
        ),
      /panel ready \(attached to none, expected localhost\)/,
    );
  });
});

/** A clock whose `sleep` only advances virtual time, so these tests run instantly. */
function fakeClock(): TurnClock {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms, signal) => {
      signal?.throwIfAborted();
      now += ms;
    },
  };
}

function turnStatus(overrides: Partial<AgentPanelSnapshot> = {}): AgentPanelStatus {
  return deriveAgentStatus({
    composerVisible: true,
    actionVariant: "send",
    attachedDomain: "localhost",
    detectedToolCount: 2,
    items: [
      { kind: "user", text: "Order a pizza" },
      { kind: "ai", text: "Done." },
    ],
    ...overrides,
  });
}

const card: PendingConfirmation = { ...sampleConfirmation, canAlwaysAllow: false };

function driver(overrides: Partial<TurnDriver> & Pick<TurnDriver, "readStatus">): TurnDriver {
  return {
    answerConfirmation: async () => true,
    stop: async () => true,
    ...overrides,
  };
}

describe("waitForTurnToFinish", () => {
  it("waits the minimum run time and then a full idle window when the agent never looks busy", async () => {
    const clock = fakeClock();
    const result = await waitForTurnToFinish(
      driver({ readStatus: async () => turnStatus() }),
      {},
      clock,
    );
    assert.strictEqual(clock.now(), 4_000);
    assert.strictEqual(result.responseText, "Done.");
    assert.strictEqual(result.error, null);
  });

  it("starts the idle window at the first idle poll after the agent was seen busy", async () => {
    const clock = fakeClock();
    const result = await waitForTurnToFinish(
      driver({
        readStatus: async () =>
          clock.now() < 1_000 ? turnStatus({ actionVariant: "stop" }) : turnStatus(),
      }),
      {},
      clock,
    );
    assert.strictEqual(result.responseText, "Done.");
    assert.strictEqual(clock.now(), 3_500);
  });

  it("answers prompts with the policy and uses allow-once when always-allow is not offered", async () => {
    const clock = fakeClock();
    const answers: Array<[string, ConfirmationDecision]> = [];
    const handled: ConfirmationDecision[] = [];
    await waitForTurnToFinish(
      driver({
        readStatus: async () =>
          answers.length === 0
            ? turnStatus({ actionVariant: "live", confirmations: [card] })
            : turnStatus(),
        answerConfirmation: async (c, decision) => {
          answers.push([c.id, decision]);
          return true;
        },
      }),
      { onConfirmation: "always-allow", onConfirmationHandled: (r) => handled.push(r.decision) },
      clock,
    );
    assert.deepStrictEqual(answers, [["perm-1", "allow-once"]]);
    assert.deepStrictEqual(handled, ["allow-once"]);
  });

  it("does not answer a prompt once the budget has been aborted, and stops the extension", async () => {
    const clock = fakeClock();
    const budget = new AbortController();
    let stops = 0;
    await assert.rejects(
      waitForTurnToFinish(
        driver({
          readStatus: async () => {
            budget.abort(new Error("budget expired"));
            return turnStatus({ actionVariant: "live", confirmations: [card] });
          },
          answerConfirmation: async () => {
            throw new Error("must not click after the budget expired");
          },
          stop: async () => {
            stops++;
            return true;
          },
        }),
        { signal: budget.signal },
        clock,
      ),
      /budget expired/,
    );
    assert.strictEqual(stops, 1);
  });

  it("stops the extension and throws TimeoutError when the turn runs too long", async () => {
    const clock = fakeClock();
    let stops = 0;
    await assert.rejects(
      waitForTurnToFinish(
        driver({
          readStatus: async () => turnStatus({ actionVariant: "stop" }),
          stop: async () => {
            stops++;
            return true;
          },
        }),
        { timeoutMs: 1_000 },
        clock,
      ),
      (error: unknown) => error instanceof TimeoutError,
    );
    assert.strictEqual(stops, 1);
  });

  it("fails when a prompt is still on screen after answering it", async () => {
    await assert.rejects(
      waitForTurnToFinish(
        driver({
          readStatus: async () => turnStatus({ confirmations: [card] }),
          answerConfirmation: async () => false,
        }),
        {},
        fakeClock(),
      ),
      /Failed to resolve extension confirmation card "perm-1"/,
    );
  });

  it("leaves prompts for a human with the none policy until the turn times out", async () => {
    await assert.rejects(
      waitForTurnToFinish(
        driver({
          readStatus: async () => turnStatus({ actionVariant: "live", confirmations: [card] }),
          answerConfirmation: async () => {
            throw new Error("must not answer with the none policy");
          },
        }),
        { onConfirmation: "none", timeoutMs: 2_000 },
        fakeClock(),
      ),
      (error: unknown) => error instanceof TimeoutError,
    );
  });

  it("returns the turn's error item", async () => {
    const result = await waitForTurnToFinish(
      driver({
        readStatus: async () =>
          turnStatus({
            items: [
              { kind: "user", text: "Order a pizza" },
              { kind: "error", text: "I couldn't generate a response." },
            ],
          }),
      }),
      {},
      fakeClock(),
    );
    assert.strictEqual(result.error, "I couldn't generate a response.");
    assert.strictEqual(result.responseText, null);
  });
});
