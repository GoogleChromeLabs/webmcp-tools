/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type BrowserPage } from "../evaluator/browser.js";
import { matchesArgument } from "../matcher.js";
import { DomAssertion } from "../types/simulations.js";

export type DomAssertionResult = {
  assertion: DomAssertion;
  outcome: "pass" | "fail" | "error";
  expected: unknown;
  actual?: unknown;
  error?: string;
};

type DomObservation = { actual?: unknown; error?: string };

function expectedValue(assertion: DomAssertion): unknown {
  if ("exists" in assertion.expect) return assertion.expect.exists;
  if ("count" in assertion.expect) return assertion.expect.count;
  if ("text" in assertion.expect) return assertion.expect.text;
  return assertion.expect.attribute.value;
}

export async function evaluateDomAssertions(
  page: BrowserPage,
  assertions: DomAssertion[],
): Promise<DomAssertionResult[]> {
  const observations = await page.evaluate((authoredAssertions): DomObservation[] => {
    return authoredAssertions.map((assertion) => {
      try {
        const elements = Array.from(document.querySelectorAll(assertion.selector));

        if ("exists" in assertion.expect) {
          return { actual: elements.length > 0 };
        }
        if ("count" in assertion.expect) {
          return { actual: elements.length };
        }

        const first = elements[0];
        if ("text" in assertion.expect) {
          return { actual: first?.textContent?.trim() ?? null };
        }

        return {
          actual: first?.getAttribute(assertion.expect.attribute.name) ?? null,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });
  }, assertions);

  return assertions.map((assertion, index) => {
    const expected = expectedValue(assertion);
    const observation = observations[index];
    if (!observation || observation.error) {
      return {
        assertion,
        outcome: "error",
        expected,
        error: observation?.error || "the page returned no DOM observation",
      };
    }

    try {
      return {
        assertion,
        outcome: matchesArgument(expected, observation.actual) ? "pass" : "fail",
        expected,
        actual: observation.actual,
      };
    } catch (error) {
      return {
        assertion,
        outcome: "error",
        expected,
        actual: observation.actual,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
