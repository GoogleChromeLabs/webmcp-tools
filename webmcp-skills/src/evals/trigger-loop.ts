/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { improveDescription } from "./improve-description.js";
import { runTriggerEval, type TriggerEvalReport, type TriggerQuery } from "./trigger-eval.js";

export interface LoopIteration {
  iteration: number;
  description: string;
  train_metrics: TriggerEvalReport["metrics"];
  test_metrics?: TriggerEvalReport["metrics"];
}

export interface LoopResult {
  best_description: string;
  iterations: LoopIteration[];
}

export interface LoopOptions {
  maxIterations?: number;
  holdout?: number; // default 0.3 (30% test set)
  model?: string;
  mock?: boolean;
}

/**
 * Splits query set into train and test sets, stratified by should_trigger.
 */
function splitQueries(
  queries: TriggerQuery[],
  holdout: number,
): { train: TriggerQuery[]; test: TriggerQuery[] } {
  if (holdout <= 0 || holdout >= 1) {
    return { train: queries, test: [] };
  }

  const positive = queries.filter((q) => q.should_trigger);
  const negative = queries.filter((q) => !q.should_trigger);

  const testPosCount = Math.max(1, Math.round(positive.length * holdout));
  const testNegCount = Math.max(1, Math.round(negative.length * holdout));

  const test = [...positive.slice(0, testPosCount), ...negative.slice(0, testNegCount)];
  const train = [...positive.slice(testPosCount), ...negative.slice(testNegCount)];

  return { train, test };
}

/**
 * Runs the description optimization loop until targets are reached or max iterations hit.
 */
export async function runTriggerOptimizationLoop(
  skillName: string,
  skillContent: string,
  initialDescription: string,
  queries: TriggerQuery[],
  options: LoopOptions = {},
): Promise<LoopResult> {
  const maxIterations = options.maxIterations || 3;
  const holdout = options.holdout ?? 0.3;

  const { train, test } = splitQueries(queries, holdout);

  console.log(`\nStarting Description Optimization Loop for: ${skillName}`);
  console.log(
    `Query split: ${train.length} train queries, ${test.length} test queries (holdout: ${holdout})\n`,
  );

  let currentDescription = initialDescription;
  let bestDescription = initialDescription;
  let bestScore = -1;

  const history: LoopIteration[] = [];

  for (let iter = 1; iter <= maxIterations; iter++) {
    console.log(`--- Iteration ${iter}/${maxIterations} ---`);
    console.log(`Current Description: "${currentDescription.slice(0, 80)}..."`);

    // 1. Evaluate on train set
    const trainEval = await runTriggerEval(skillName, currentDescription, train, {
      model: options.model,
      mock: options.mock,
    });

    console.log(
      `Train Accuracy: ${Math.round(trainEval.metrics.accuracy * 100)}% (F1: ${trainEval.metrics.f1}, Precision: ${trainEval.metrics.precision}, Recall: ${trainEval.metrics.recall})`,
    );

    // 2. Evaluate on held-out test set
    let testEval: TriggerEvalReport | undefined = undefined;
    let score = trainEval.metrics.f1;

    if (test.length > 0) {
      testEval = await runTriggerEval(skillName, currentDescription, test, {
        model: options.model,
        mock: options.mock,
      });

      console.log(
        `Test Accuracy:  ${Math.round(testEval.metrics.accuracy * 100)}% (F1: ${testEval.metrics.f1}, Precision: ${testEval.metrics.precision}, Recall: ${testEval.metrics.recall})`,
      );
      score = testEval.metrics.f1;
    }

    history.push({
      iteration: iter,
      description: currentDescription,
      train_metrics: trainEval.metrics,
      test_metrics: testEval?.metrics,
    });

    if (score > bestScore) {
      bestScore = score;
      bestDescription = currentDescription;
    }

    // Stop early if 100% accuracy achieved on both
    if (trainEval.metrics.accuracy === 1.0 && (!testEval || testEval.metrics.accuracy === 1.0)) {
      console.log("✓ Perfect 100% accuracy reached on train and test queries. Stopping early.");
      break;
    }

    // 3. Propose improved description for next iteration
    if (iter < maxIterations) {
      console.log("Synthesizing improved description with model...");
      currentDescription = await improveDescription(
        skillName,
        skillContent,
        currentDescription,
        trainEval,
        { model: options.model, mock: options.mock },
      );
    }
  }

  console.log(
    `\n✓ Optimization complete. Best description selected (F1: ${bestScore}):\n"${bestDescription}"\n`,
  );

  return {
    best_description: bestDescription,
    iterations: history,
  };
}
