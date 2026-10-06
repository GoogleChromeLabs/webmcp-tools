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

  it("parses a direct user message without a simulated-user turn budget", () => {
    const direct = validCase({ userMessage: "  Add the black jacket to my cart.  " });
    delete direct.userScenario;
    delete direct.maxTurns;

    const [parsed] = parseSimulations([direct], FILE);

    assert.strictEqual(parsed.userMessage, "Add the black jacket to my cart.");
    assert.strictEqual(parsed.maxTurns, 1);
    assert.ok(!("userScenario" in parsed));
  });

  it("parses supported DOM assertions", () => {
    const parsed = parseSimulations(
      [
        validCase({
          assertions: [
            {
              type: "dom",
              selector: "[data-product-id='p3']",
              expect: { exists: false },
            },
            {
              type: "dom",
              selector: "[data-testid='cart-item']",
              expect: { count: { $gte: 1 } },
            },
            {
              type: "dom",
              selector: "[data-testid='status']",
              expect: { text: { $contains: "Completed" } },
            },
            {
              type: "dom",
              selector: "[data-testid='checkout']",
              expect: { attribute: { name: "data-state", value: "completed" } },
            },
          ],
        }),
      ],
      FILE,
    );

    assert.deepStrictEqual(parsed[0].assertions, [
      {
        type: "dom",
        selector: "[data-product-id='p3']",
        expect: { exists: false },
      },
      {
        type: "dom",
        selector: "[data-testid='cart-item']",
        expect: { count: { $gte: 1 } },
      },
      {
        type: "dom",
        selector: "[data-testid='status']",
        expect: { text: { $contains: "Completed" } },
      },
      {
        type: "dom",
        selector: "[data-testid='checkout']",
        expect: { attribute: { name: "data-state", value: "completed" } },
      },
    ]);
  });

  it("allows deterministic assertions without an LLM judge", () => {
    const deterministic = validCase({
      assertions: [
        {
          type: "dom",
          selector: "[data-testid='cart']",
          expect: { exists: true },
        },
      ],
    });
    delete deterministic.successCriteria;
    delete deterministic.maxTurns;

    const [parsed] = parseSimulations([deterministic], FILE);

    assert.strictEqual(parsed.successCriteria, undefined);
    assert.strictEqual(parsed.maxTurns, 1);
  });

  it("requires assertions, successCriteria, or both", () => {
    const ungradable = validCase();
    delete ungradable.successCriteria;

    assert.throws(
      () => parseSimulations([ungradable], FILE),
      /must define at least one of "assertions" or "successCriteria"/,
    );
  });

  it("rejects malformed DOM assertions", () => {
    const cases = [
      {
        assertions: [],
        message: /"assertions" must be a non-empty array/,
      },
      {
        assertions: [{ type: "visual", selector: "body", expect: { exists: true } }],
        message: /assertion #1: "type" must be "dom"/,
      },
      {
        assertions: [{ type: "dom", selector: "   ", expect: { exists: true } }],
        message: /assertion #1 must have a non-empty "selector"/,
      },
      {
        assertions: [
          {
            type: "dom",
            selector: "body",
            expect: { exists: true, count: 1 },
          },
        ],
        message: /assertion #1: "expect" must define exactly one of/,
      },
      {
        assertions: [
          {
            type: "dom",
            selector: "body",
            expect: { attribute: { name: "", value: "ready" } },
          },
        ],
        message: /attribute expectation must have a non-empty "name"/,
      },
      {
        assertions: [
          {
            type: "dom",
            selector: "body",
            expect: { count: { $gte: "1" } },
          },
        ],
        message: /"count" must be a non-negative integer or matcher object/,
      },
      {
        assertions: [
          {
            type: "dom",
            selector: "body",
            expect: { text: { $unknown: "ready" } },
          },
        ],
        message: /"text" must be a string or matcher object/,
      },
      {
        assertions: [
          {
            type: "dom",
            selector: "body",
            expect: { text: { $any: false } },
          },
        ],
        message: /"text" must be a string or matcher object/,
      },
    ];

    for (const testCase of cases) {
      assert.throws(
        () => parseSimulations([validCase({ assertions: testCase.assertions })], FILE),
        testCase.message,
      );
    }
  });

  it("rejects duplicate resolved simulation names", () => {
    assert.throws(
      () =>
        parseSimulations(
          [validCase({ name: "Same case" }), validCase({ name: " Same case " })],
          FILE,
        ),
      /simulations #1 and #2 use the duplicate name "Same case"/,
    );
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
      /simulations\.json: simulation #2 \("Remove one item"\): "userScenario" must be a non-empty string when present\./,
    );
  });

  it("requires exactly one non-empty userScenario or userMessage", () => {
    const missing = validCase();
    delete missing.userScenario;

    assert.throws(
      () => parseSimulations([missing], FILE),
      /exactly one of "userScenario" or "userMessage"/,
    );
    assert.throws(
      () => parseSimulations([validCase({ userScenario: "" })], FILE),
      /"userScenario" must be a non-empty string when present/,
    );
    assert.throws(
      () => parseSimulations([validCase({ userScenario: undefined, userMessage: "  " })], FILE),
      /"userMessage" must be a non-empty string when present/,
    );
    assert.throws(
      () => parseSimulations([validCase({ userMessage: "Add the jacket." })], FILE),
      /exactly one of "userScenario" or "userMessage"/,
    );
  });

  it("rejects maxTurns for a direct user message", () => {
    assert.throws(
      () =>
        parseSimulations(
          [validCase({ userScenario: undefined, userMessage: "Add the jacket.", maxTurns: 2 })],
          FILE,
        ),
      /"maxTurns" cannot be used with "userMessage"/,
    );
  });

  it("rejects a blank successCriteria when present", () => {
    assert.throws(
      () => parseSimulations([validCase({ successCriteria: "  " })], FILE),
      /"successCriteria" must be a non-empty string when present/,
    );
  });

  it("rejects a maxTurns that is not a positive integer, but defaults its absence", () => {
    for (const maxTurns of [0, -1, 2.5, "8"]) {
      assert.throws(
        () => parseSimulations([validCase({ maxTurns })], FILE),
        /"maxTurns" must be a positive integer when present\./,
        `maxTurns=${String(maxTurns)} should be rejected`,
      );
    }

    const withoutMaxTurns = validCase();
    delete withoutMaxTurns.maxTurns;
    assert.strictEqual(parseSimulations([withoutMaxTurns], FILE)[0].maxTurns, 1);
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
    assert.strictEqual(parsed[0].name, "Find and add a leather jacket to the cart");
    assert.strictEqual(parsed[1].name, "Add a leather jacket and matching gloves to the cart");
    assert.strictEqual(parsed[0].successCriteria, undefined);
    assert.strictEqual(
      parsed[0].userMessage,
      "Find a leather jacket and add one to my shopping bag.",
    );
    assert.strictEqual(
      parsed[1].userMessage,
      "Add one leather jacket and one pair of leather gloves to my shopping bag. Nothing else.",
    );
  });

  it("loads the shipped Pizza Maker suite", async () => {
    const path = fileURLToPath(
      new URL("../../examples/pizza-maker/simulations.json", import.meta.url),
    );

    const parsed = await loadSimulations(path);

    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].name, "Build and share a family pesto pizza");
    assert.strictEqual(parsed[0].assertions?.length, 6);
    assert.deepStrictEqual(parsed[0].assertions?.[0], {
      type: "dom",
      selector: "#size-text",
      expect: { text: "Large" },
    });
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
