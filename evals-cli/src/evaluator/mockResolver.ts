/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpectedCallNode, FunctionCall } from "../types/evals.js";
import { isFunctionCall, isOrderedGroup, isUnorderedGroup } from "../utils.js";

/**
 * Resolves stub tool-result payloads for a single test case's local
 * multi-step run.
 *
 * The resolver walks a flattened view of the test's `expectedCall`
 * trajectory and, when the model invokes a tool matching an upcoming
 * expected step, returns that step's `mockOutput` (defaulting to `{}`).
 * Off-trajectory calls also receive `{}` — the trajectory matcher
 * (`evaluateExecutionTrajectory`) is what scores whether the call was
 * expected; the resolver only needs to give the model plausible-looking
 * responses so it can decide what to do next.
 *
 * The matching is intentionally permissive:
 *
 *   1. Nodes are flattened in trajectory order across nested
 *      `ordered:` / `unordered:` groups. Group semantics (any-order
 *      inside an `unordered:`, strict order inside an `ordered:`) are
 *      NOT re-enforced here — the matcher already handles that.
 *   2. Matching is by `functionName` only. Argument constraints are for
 *      the matcher; the resolver doesn't reject a call for having
 *      "wrong" args (there's no such thing at this layer).
 *   3. Each flattened node is consumed at most once. Once consumed, it
 *      cannot resolve a later call — subsequent same-named calls fall
 *      through to `{}`.
 */
export class MockResolver {
  private readonly flat: FunctionCall[];
  private readonly consumed: boolean[];

  constructor(expected: ExpectedCallNode[] | null) {
    this.flat = expected ? flattenTrajectory(expected) : [];
    this.consumed = new Array(this.flat.length).fill(false);
  }

  resolve(functionName: string, _args: unknown): unknown {
    for (let i = 0; i < this.flat.length; i++) {
      if (this.consumed[i]) continue;
      if (this.flat[i].functionName !== functionName) continue;

      this.consumed[i] = true;
      // Only `undefined` (field omitted from evals.json) defaults to `{}`.
      // An explicit `null` is a valid mockOutput and is passed through.
      const { mockOutput } = this.flat[i];
      return mockOutput === undefined ? {} : mockOutput;
    }
    return {};
  }
}

/**
 * Recursively flattens an `ExpectedCallNode[]` trajectory into a flat
 * ordered list of `FunctionCall` leaves. Order is preserved for
 * `ordered:` groups; `unordered:` groups keep their authored order too,
 * since the resolver's permissive matching (see class docs) doesn't
 * depend on strict semantics.
 */
function flattenTrajectory(nodes: ExpectedCallNode[]): FunctionCall[] {
  const out: FunctionCall[] = [];
  for (const node of nodes) {
    if (isFunctionCall(node)) {
      out.push(node);
    } else if (isOrderedGroup(node)) {
      out.push(...flattenTrajectory(node.ordered));
    } else if (isUnorderedGroup(node)) {
      out.push(...flattenTrajectory(node.unordered));
    }
  }
  return out;
}
