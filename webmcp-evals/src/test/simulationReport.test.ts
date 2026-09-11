/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { renderSimulationReport } from "../report/simulationReport.js";
import { SimulationResult, SimulationResults } from "../evaluator/simulationEvaluator.js";
import { SimulationConfig } from "../types/config.js";

const config: SimulationConfig = {
  url: "https://shop.test",
  simulationsFile: "simulations.json",
  model: "gemini-3-flash-preview",
  judgeModel: "judge-model",
};

function result(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    simulation: {
      name: "Removes the cap",
      userScenario: "You want the hat out of your basket.",
      maxTurns: 4,
      successCriteria: "The cap is gone and the jacket remains.",
    },
    runIndex: 1,
    outcome: "pass",
    verdict: {
      passed: true,
      reasoning: "The cart came back without the cap.",
      evidence: ['removeFromCart -> {"cart":["Bomber Jacket"]}'],
      turnsUsed: 2,
      durationMs: 800,
      endedBy: "user",
    },
    conversation: {
      turns: [
        {
          index: 1,
          userMessage: "Take the hat out.",
          agentText: "Done.",
          steps: [{ reasoningText: "I should call removeFromCart." }],
          toolCalls: [
            { functionName: "removeFromCart", args: { productId: "p4" }, result: { ok: true } },
          ],
        },
      ],
      closingMessage: "Great, thanks.",
      turnsUsed: 1,
      durationMs: 800,
      endedBy: "user",
    },
    ...overrides,
  } as SimulationResult;
}

function resultsOf(results: SimulationResult[]): SimulationResults {
  return {
    results,
    simulationCount: new Set(results.map((item) => item.simulation.name)).size,
    passCount: results.filter((item) => item.outcome === "pass").length,
    failCount: results.filter((item) => item.outcome === "fail").length,
    errorCount: results.filter((item) => item.outcome === "error").length,
  };
}

describe("renderSimulationReport", () => {
  it("leads with the verdict, the turns used and how the conversation ended", () => {
    const html = renderSimulationReport(config, resultsOf([result()]));

    assert.match(html, /Simulation Results/);
    assert.match(html, /Removes the cap/);
    const cardSummary = html.split('<details class="group/case"')[1].split("</summary>")[0];
    assert.match(cardSummary, /PASS/);
    assert.match(cardSummary, /2 turns/);
    assert.match(cardSummary, /ended by user/);
  });

  it("shows the reasoning and the cited evidence without a further collapse", () => {
    const html = renderSimulationReport(config, resultsOf([result()]));

    const [, body = ""] = html.split("Judge's reasoning");
    assert.match(body, /The cart came back without the cap\./);
    // Nothing between the reasoning and the evidence may reopen a <details>:
    // this is the only audit trail a prose verdict carries (ADR D10).
    const upToEvidence = body.split("Evidence the judge cited")[0];
    assert.ok(
      !upToEvidence.includes("<details"),
      "evidence must be visible as soon as the run is expanded",
    );
    assert.match(body, /removeFromCart -&gt; \{&quot;cart&quot;/);
  });

  it("labels setup as world state and keeps it out of the agent's tool calls", () => {
    const html = renderSimulationReport(
      config,
      resultsOf([
        result({
          setupCalls: [
            {
              index: 1,
              functionName: "addToCart",
              arguments: { productId: "p4" },
              outcome: "pass",
              result: { ok: true },
            },
          ],
        }),
      ]),
    );

    assert.match(html, /World state before the conversation/);
    assert.match(html, /Not the agent's work/);

    const setupSection = html.split("World state before the conversation")[1].split("Turn 1")[0];
    assert.match(setupSection, /addToCart/);
    const conversationSection = html.split("Turn 1")[1];
    assert.ok(
      !conversationSection.includes("addToCart"),
      "a setup call must never appear among the agent's own calls",
    );
  });

  it("renders the turn-by-turn trajectory through the shared renderer", () => {
    const html = renderSimulationReport(config, resultsOf([result()]));

    assert.match(html, /Turn 1/);
    assert.match(html, /Take the hat out\./);
    assert.match(html, /Simulated user/);
    // "Trajectory" and "Thoughts:" come from report.ts's renderTrajectory.
    assert.match(html, /Trajectory/);
    assert.match(html, /I should call removeFromCart\./);
    assert.match(html, /Great, thanks\./);
  });

  it("opens failing and errored cards, leaving passing ones shut", () => {
    const passing = renderSimulationReport(config, resultsOf([result()]));
    const failing = renderSimulationReport(
      config,
      resultsOf([result({ name: "x", outcome: "fail" } as any)]),
    );
    const errored = renderSimulationReport(
      config,
      resultsOf([result({ outcome: "error", verdict: undefined, error: "setup failed" })]),
    );

    const cardOf = (html: string) => html.split('<details class="group/case"')[1].slice(0, 10);
    assert.ok(!cardOf(passing).includes("open"), "a passing card stays collapsed");
    assert.ok(cardOf(failing).includes("open"), "a failing card opens by default");
    assert.ok(cardOf(errored).includes("open"), "an errored card opens by default");
  });

  it("explains an errored run instead of implying a verdict", () => {
    const html = renderSimulationReport(
      config,
      resultsOf([
        result({
          outcome: "error",
          verdict: undefined,
          error: "setup call 1 (addToCart) failed: out of stock",
          conversation: undefined,
        }),
      ]),
    );

    assert.match(html, /Never reached a verdict/);
    assert.match(html, /out of stock/);
    // The criteria still show, so a reader can see what was being asked.
    assert.match(html, /The cap is gone and the jacket remains\./);
    assert.match(html, /Nothing was exchanged/);
  });

  it("groups runs of one simulation under a single card with a pass rate", () => {
    const html = renderSimulationReport(
      config,
      resultsOf([result({ runIndex: 1 }), result({ runIndex: 2, outcome: "fail" })]),
    );

    assert.strictEqual(html.split('<details class="group/case"').length - 1, 1);
    assert.match(html, /1\/2 Passed/);
    assert.match(html, /Run #1\/2/);
    assert.match(html, /Run #2\/2/);
  });

  it("shows every run's audit trail as soon as a multi-run card is expanded", () => {
    const html = renderSimulationReport(
      config,
      resultsOf([result({ runIndex: 1 }), result({ runIndex: 2 })]),
    );

    const runDisclosures = html.match(/<details class="group\/run"[^>]*>/g) || [];
    assert.strictEqual(runDisclosures.length, 2);
    assert.ok(
      runDisclosures.every((details) => details.includes("open")),
      "expanding the simulation card must reveal every run without another click",
    );
  });

  it("names all three model roles, since a reader cannot infer who graded", () => {
    const html = renderSimulationReport(config, resultsOf([result()]));

    assert.match(html, /Agent under test/);
    assert.match(html, /Simulated user/);
    assert.match(html, /judge-model/);
  });

  it("escapes authored text rather than letting it into the markup", () => {
    const html = renderSimulationReport(
      config,
      resultsOf([
        result({
          simulation: {
            name: "<script>alert(1)</script>",
            userScenario: "x",
            maxTurns: 1,
            successCriteria: "y",
          },
        }),
      ]),
    );

    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});
