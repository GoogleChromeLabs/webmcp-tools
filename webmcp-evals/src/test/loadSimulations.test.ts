/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSimulations, parseSimulations } from "../simulate/loadSimulations.js";

const FILE = "simulations.json";

function validCase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Find and buy a leather jacket",
    userScenario: "You need a jacket for a concert this weekend.",
    maxTurns: 8,
    successCriteria: "Exactly one leather jacket was bought and checkout completed.",
    ...overrides,
  };
}

async function writeTempFile(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "webmcp-simulations-"));
  const path = join(dir, FILE);
  await writeFile(path, contents, "utf-8");
  return path;
}

describe("parseSimulations", () => {
  it("parses a well-formed file and trims prose fields", () => {
    const parsed = parseSimulations(
      [
        validCase({
          userScenario: "  You need a jacket.  ",
          successCriteria: "  One jacket was bought.  ",
          maxDurationMs: 180000,
        }),
      ],
      FILE,
    );

    assert.deepStrictEqual(parsed, [
      {
        name: "Find and buy a leather jacket",
        userScenario: "You need a jacket.",
        successCriteria: "One jacket was bought.",
        maxTurns: 8,
        maxDurationMs: 180000,
      },
    ]);
  });

  it("keeps setup calls in authored order", () => {
    const parsed = parseSimulations(
      [
        validCase({
          setup: [
            { functionName: "addToCart", arguments: { productId: "p3", quantity: 1 } },
            { functionName: "addToCart", arguments: { productId: "p4", quantity: 1 } },
          ],
        }),
      ],
      FILE,
    );

    assert.deepStrictEqual(parsed[0].setup, [
      { functionName: "addToCart", arguments: { productId: "p3", quantity: 1 } },
      { functionName: "addToCart", arguments: { productId: "p4", quantity: 1 } },
    ]);
  });

  it("omits optional fields that were not authored", () => {
    const parsed = parseSimulations([validCase()], FILE);

    assert.ok(!("maxDurationMs" in parsed[0]));
    assert.ok(!("setup" in parsed[0]));
  });

  it("names an unnamed case by position rather than by its scenario", () => {
    const unnamed = validCase();
    delete unnamed.name;

    const parsed = parseSimulations([validCase(), unnamed], FILE);

    assert.strictEqual(parsed[1].name, "Simulation 2");
  });

  it("rejects a file that is not an array of simulations", () => {
    assert.throws(() => parseSimulations({ simulations: [] }, FILE), {
      message: `${FILE}: expected an array of simulations.`,
    });
  });

  it("rejects an empty file", () => {
    assert.throws(() => parseSimulations([], FILE), {
      message: `${FILE}: contains no simulations.`,
    });
  });

  it("points a list of criteria at the prose form", () => {
    assert.throws(
      () =>
        parseSimulations(
          [validCase({ successCriteria: ["A jacket was added.", "Checkout completed."] })],
          FILE,
        ),
      /"successCriteria" must be a single prose string, not a list/,
    );
  });

  it("locates the offending case by index and name", () => {
    assert.throws(
      () =>
        parseSimulations(
          [validCase(), validCase({ name: "Remove one item", userScenario: "   " })],
          FILE,
        ),
      /simulations\.json: simulation #2 \("Remove one item"\): "userScenario" must be a non-empty string\./,
    );
  });

  it("rejects a missing or blank userScenario", () => {
    const missing = validCase();
    delete missing.userScenario;

    assert.throws(() => parseSimulations([missing], FILE), /"userScenario"/);
    assert.throws(
      () => parseSimulations([validCase({ userScenario: "" })], FILE),
      /"userScenario"/,
    );
  });

  it("rejects a missing or blank successCriteria", () => {
    const missing = validCase();
    delete missing.successCriteria;

    assert.throws(() => parseSimulations([missing], FILE), /"successCriteria"/);
    assert.throws(
      () => parseSimulations([validCase({ successCriteria: "  " })], FILE),
      /"successCriteria"/,
    );
  });

  it("rejects a maxTurns that is not a positive integer", () => {
    for (const maxTurns of [0, -1, 2.5, "8", undefined]) {
      assert.throws(
        () => parseSimulations([validCase({ maxTurns })], FILE),
        /"maxTurns" must be a positive integer\./,
        `maxTurns=${String(maxTurns)} should be rejected`,
      );
    }
  });

  it("rejects a maxDurationMs that is not a positive integer, but allows its absence", () => {
    for (const maxDurationMs of [0, -1000, 1.5, "180000"]) {
      assert.throws(
        () => parseSimulations([validCase({ maxDurationMs })], FILE),
        /"maxDurationMs" must be a positive integer when present\./,
        `maxDurationMs=${String(maxDurationMs)} should be rejected`,
      );
    }

    assert.doesNotThrow(() => parseSimulations([validCase({ maxDurationMs: undefined })], FILE));
  });

  it("rejects a setup call without concrete arguments", () => {
    assert.throws(
      () => parseSimulations([validCase({ setup: [{ functionName: "addToCart" }] })], FILE),
      /setup call #1 must have an "arguments" object with concrete values\./,
    );
  });

  it("rejects a setup call without a function name", () => {
    assert.throws(
      () =>
        parseSimulations(
          [
            validCase({
              setup: [
                { functionName: "addToCart", arguments: {} },
                { arguments: { productId: "p4" } },
              ],
            }),
          ],
          FILE,
        ),
      /setup call #2 must have a non-empty "functionName"\./,
    );
  });

  it("rejects FunctionCall keys that setup would silently ignore", () => {
    assert.throws(
      () =>
        parseSimulations(
          [
            validCase({
              setup: [
                { functionName: "addToCart", arguments: { productId: "p3" }, optional: true },
              ],
            }),
          ],
          FILE,
        ),
      /setup call #1 has keys it does not use: "optional" \(every setup call runs, unconditionally, before the agent joins\)/,
    );
  });

  it("rejects a near-miss of a real field rather than falling back to its default", () => {
    assert.throws(
      () => parseSimulations([validCase({ maxDuration: 180000 })], FILE),
      /has keys it does not use: "maxDuration"\. Recognised keys are/,
    );
  });

  it("rejects trajectory-style keys borrowed from evals.json", () => {
    assert.throws(
      () => parseSimulations([validCase({ expectedCall: [{ functionName: "addToCart" }] })], FILE),
      /"expectedCall" \(a simulation is judged on its outcome, not on a trajectory\)/,
    );
  });

  it("rejects a setup that is not an array", () => {
    assert.throws(
      () => parseSimulations([validCase({ setup: { functionName: "addToCart" } })], FILE),
      /"setup" must be an array of tool calls\./,
    );
  });
});

describe("loadSimulations", () => {
  it("loads the shipped shopping example", async () => {
    const path = fileURLToPath(
      new URL("../../examples/commerce/shopping/simulations.json", import.meta.url),
    );

    const parsed = await loadSimulations(path);

    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].name, "Find and buy a leather jacket");
    assert.strictEqual(parsed[1].name, "Remove one item from a two-item cart");
  });

  it("loads the shipped Pizza Maker suite", async () => {
    const path = fileURLToPath(
      new URL("../../examples/pizza-maker/simulations.json", import.meta.url),
    );

    const parsed = await loadSimulations(path);

    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].name, "Build and share a family pesto pizza");
    assert.strictEqual(parsed[1].name, "Revise an existing pizza and share it");
    assert.strictEqual(parsed[1].setup?.length, 5);
  });

  it("loads the shipped Hotel Chain suite", async () => {
    const path = fileURLToPath(
      new URL("../../examples/hotel-chain/simulations.json", import.meta.url),
    );

    const parsed = await loadSimulations(path);

    assert.strictEqual(parsed.length, 4);
    assert.strictEqual(parsed[0].name, "Prepare the only matching Tokyo hotel for confirmation");
    assert.strictEqual(parsed[2].name, "Recover from an obsolete Cleveland search");
    assert.strictEqual(parsed[2].setup?.length, 2);
  });

  it("reads and validates a file from disk", async () => {
    const path = await writeTempFile(JSON.stringify([validCase()]));

    const parsed = await loadSimulations(path);

    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].name, "Find and buy a leather jacket");
  });

  it("names the file when it cannot be read", async () => {
    await assert.rejects(
      () => loadSimulations("does/not/exist.json"),
      /Could not read simulation file does\/not\/exist\.json/,
    );
  });

  it("names the file when it is not valid JSON", async () => {
    const path = await writeTempFile("[{ not json }]");

    await assert.rejects(
      () => loadSimulations(path),
      /Could not parse .*simulations\.json as JSON/,
    );
  });

  it("reports validation failures against the file path", async () => {
    const path = await writeTempFile(JSON.stringify([validCase({ maxTurns: 0 })]));

    await assert.rejects(() => loadSimulations(path), /simulations\.json: simulation #1/);
  });
});
