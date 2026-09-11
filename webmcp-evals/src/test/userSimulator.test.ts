/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { mockModelReplying } from "./mockModel.js";
import {
  buildUserSimulatorMessages,
  parseSimulatedUserReply,
  simulateUserTurn,
  UserVisibleMessage,
} from "../simulate/userSimulator.js";
import { END_CONVERSATION_MARKER } from "../simulate/prompts.js";
import { LoadedSimulation } from "../types/simulations.js";

const SCENARIO = "You need a jacket for a concert this weekend and you like leather.";

describe("buildUserSimulatorMessages", () => {
  it("never lets the success criteria reach the simulated user", () => {
    // The request type has no field for criteria, so the most a caller can do
    // is pass the scenario off a full case. This proves the rest stays behind.
    const simulation: LoadedSimulation = {
      name: "Find and buy a leather jacket",
      userScenario: SCENARIO,
      maxTurns: 8,
      successCriteria: "A jacket with SKU ZEBRAFISH-9 was bought and checkout completed.",
    };

    const { system, messages } = buildUserSimulatorMessages({
      userScenario: simulation.userScenario,
      transcript: [],
    });

    const everythingSent = system + JSON.stringify(messages);
    assert.ok(!everythingSent.includes("ZEBRAFISH-9"), "criteria leaked into the user's prompt");
    assert.ok(!everythingSent.includes("checkout completed"));
    assert.ok(system.includes(SCENARIO), "the scenario itself should be in the prompt");
  });

  it("tells the user to state a need rather than dictate steps", () => {
    const { system } = buildUserSimulatorMessages({ userScenario: SCENARIO, transcript: [] });

    assert.match(system, /never how to get it/i);
    assert.match(system, /never mention a tool/i);
    assert.match(system, new RegExp(escapeRegExp(END_CONVERSATION_MARKER)));
  });

  it("inverts roles, because the model is playing the user", () => {
    const transcript: UserVisibleMessage[] = [
      { speaker: "user", text: "I need a jacket." },
      { speaker: "assistant", text: "What kind were you thinking?" },
    ];

    const { messages } = buildUserSimulatorMessages({ userScenario: SCENARIO, transcript });

    assert.deepStrictEqual(messages, [
      { role: "assistant", content: "I need a jacket." },
      { role: "user", content: "What kind were you thinking?" },
    ]);
  });

  it("cues the user to open the conversation when nothing has been said", () => {
    const { messages } = buildUserSimulatorMessages({ userScenario: SCENARIO, transcript: [] });

    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].role, "user");
    assert.match(String(messages[0].content), /say what you came for/i);
  });

  it("cues the user again when its own message was the last thing said", () => {
    const transcript: UserVisibleMessage[] = [{ speaker: "user", text: "I need a jacket." }];

    const { messages } = buildUserSimulatorMessages({ userScenario: SCENARIO, transcript });

    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[1].role, "user");
  });

  it("says so when the agent finished a turn without speaking", () => {
    const transcript: UserVisibleMessage[] = [
      { speaker: "user", text: "I need a jacket." },
      { speaker: "assistant", text: "   " },
    ];

    const { messages } = buildUserSimulatorMessages({ userScenario: SCENARIO, transcript });

    assert.match(String(messages[1].content), /did not say anything/i);
  });
});

describe("parseSimulatedUserReply", () => {
  it("ends the conversation on the marker and strips it from the message", () => {
    const result = parseSimulatedUserReply(
      `Perfect, thanks for your help!\n${END_CONVERSATION_MARKER}`,
    );

    assert.strictEqual(result.done, true);
    assert.strictEqual(result.message, "Perfect, thanks for your help!");
  });

  it("does not end on a message that merely sounds final", () => {
    for (const text of [
      "Thanks, I think we're done here.",
      "That's it, conversation over as far as I'm concerned.",
      "END_CONVERSATION",
    ]) {
      assert.strictEqual(parseSimulatedUserReply(text).done, false, text);
    }
  });

  it("still ends when the marker is all the user wrote", () => {
    const result = parseSimulatedUserReply(END_CONVERSATION_MARKER);

    assert.strictEqual(result.done, true);
    assert.strictEqual(result.message, "");
  });

  it("trims the reply so the agent is not handed stray whitespace", () => {
    assert.strictEqual(
      parseSimulatedUserReply("  I need a jacket.\n\n").message,
      "I need a jacket.",
    );
  });
});

describe("simulateUserTurn", () => {
  it("sends the scenario as the system prompt and returns the parsed reply", async () => {
    const model = mockModelReplying("Something in leather, for a concert.");

    const result = await simulateUserTurn({ userScenario: SCENARIO, transcript: [] }, model);

    assert.deepStrictEqual(result, {
      message: "Something in leather, for a concert.",
      done: false,
    });
    const sent = model.doGenerateCalls[0];
    assert.ok(
      JSON.stringify(sent.prompt).includes(SCENARIO),
      "the scenario should reach the model",
    );
  });

  it("reports a finished conversation to the caller", async () => {
    const model = mockModelReplying(`Got it, thanks.\n${END_CONVERSATION_MARKER}`);

    const result = await simulateUserTurn({ userScenario: SCENARIO, transcript: [] }, model);

    assert.strictEqual(result.done, true);
    assert.strictEqual(result.message, "Got it, thanks.");
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
