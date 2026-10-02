/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { type BrowserPage } from "../evaluator/browser.js";
import { evaluateDomAssertions } from "../simulate/domAssertions.js";
import { DomAssertion } from "../types/simulations.js";

type ElementFixture = {
  textContent?: string | null;
  attributes?: Record<string, string>;
};

function fakePage(fixtures: Record<string, ElementFixture[]>): BrowserPage {
  return {
    evaluate: async (
      callback: (assertions: DomAssertion[]) => unknown,
      assertions: DomAssertion[],
    ) => {
      const previousDocument = globalThis.document;
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
          querySelectorAll(selector: string) {
            if (selector === "[") throw new DOMException("Invalid selector", "SyntaxError");
            return (fixtures[selector] || []).map((fixture) => ({
              textContent: fixture.textContent ?? null,
              getAttribute: (name: string) => fixture.attributes?.[name] ?? null,
            }));
          },
        },
      });
      try {
        return callback(assertions);
      } finally {
        if (previousDocument === undefined) {
          delete (globalThis as { document?: Document }).document;
        } else {
          Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: previousDocument,
          });
        }
      }
    },
  } as unknown as BrowserPage;
}

describe("evaluateDomAssertions", () => {
  it("evaluates existence, count, text, and attribute checks against the final DOM", async () => {
    const assertions: DomAssertion[] = [
      { type: "dom", selector: ".removed", expect: { exists: false } },
      { type: "dom", selector: ".item", expect: { count: { $gte: 2 } } },
      { type: "dom", selector: "#status", expect: { text: { $contains: "Completed" } } },
      {
        type: "dom",
        selector: "#checkout",
        expect: { attribute: { name: "data-state", value: "completed" } },
      },
    ];

    const results = await evaluateDomAssertions(
      fakePage({
        ".item": [{}, {}],
        "#status": [{ textContent: "  Checkout Completed  " }],
        "#checkout": [{ attributes: { "data-state": "completed" } }],
      }),
      assertions,
    );

    assert.deepStrictEqual(
      results.map(({ outcome, expected, actual }) => ({ outcome, expected, actual })),
      [
        { outcome: "pass", expected: false, actual: false },
        { outcome: "pass", expected: { $gte: 2 }, actual: 2 },
        { outcome: "pass", expected: { $contains: "Completed" }, actual: "Checkout Completed" },
        { outcome: "pass", expected: "completed", actual: "completed" },
      ],
    );
  });

  it("returns a failed result with the observed value when the DOM does not match", async () => {
    const assertion: DomAssertion = {
      type: "dom",
      selector: "#status",
      expect: { text: "Completed" },
    };

    const [result] = await evaluateDomAssertions(
      fakePage({ "#status": [{ textContent: "Pending" }] }),
      [assertion],
    );

    assert.deepStrictEqual(result, {
      assertion,
      outcome: "fail",
      expected: "Completed",
      actual: "Pending",
    });
  });

  it("returns an error result for an invalid selector instead of crashing the run", async () => {
    const assertion: DomAssertion = {
      type: "dom",
      selector: "[",
      expect: { exists: true },
    };

    const [result] = await evaluateDomAssertions(fakePage({}), [assertion]);

    assert.strictEqual(result.outcome, "error");
    assert.strictEqual(result.expected, true);
    assert.match(result.error || "", /Invalid selector/);
  });
});
