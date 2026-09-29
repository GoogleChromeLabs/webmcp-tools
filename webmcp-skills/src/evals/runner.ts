/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { gradeAssertions } from "./grader.js";
import { generateContent } from "./provider.js";
import type { SingleRunResult, Skill } from "./types.js";

export interface RunOptions {
  mode?: "with-only" | "comparison";
  filter?: string;
  model?: string;
  concurrency?: number;
  mock?: boolean;
  runs?: number;
}

/**
 * Runs evaluations for a specific skill.
 */
export async function runSkillEvals(
  skill: Skill,
  options: RunOptions = {},
): Promise<SingleRunResult[]> {
  const mode = options.mode || "comparison";
  const runsPerConfig =
    typeof options.runs === "number" && Number.isInteger(options.runs) && options.runs > 0
      ? options.runs
      : 1;
  const filterRegex = options.filter ? new RegExp(options.filter, "i") : null;

  const targetEvals = skill.evals.filter((item) => {
    if (!filterRegex) return true;
    return filterRegex.test(item.id) || filterRegex.test(item.prompt);
  });

  if (targetEvals.length === 0) {
    console.log(`[${skill.name}] No evals matched filter: "${options.filter}"`);
    return [];
  }

  const results: SingleRunResult[] = [];

  for (const item of targetEvals) {
    // 1. Run with_skill
    for (let r = 1; r <= runsPerConfig; r++) {
      const runLabel = runsPerConfig > 1 ? ` run ${r}/${runsPerConfig}` : "";
      console.log(`  ▶ Running [${item.id}] (with_skill${runLabel})...`);

      const withGen = await generateContent(item.prompt, {
        model: options.model,
        systemInstruction: skill.systemInstruction,
        mock: options.mock,
      });

      const withGrading = await gradeAssertions(
        withGen.text,
        item.expected_output,
        item.assertions,
        {
          model: options.model,
          mock: options.mock,
        },
      );

      results.push({
        eval_id: item.id,
        config: "with_skill",
        run_number: r,
        output: withGen.text,
        timing: withGen.timing,
        grading: withGrading,
      });
    }

    // 2. Run without_skill if in comparison mode
    if (mode === "comparison") {
      for (let r = 1; r <= runsPerConfig; r++) {
        const runLabel = runsPerConfig > 1 ? ` run ${r}/${runsPerConfig}` : "";
        console.log(`  ▶ Running [${item.id}] (without_skill${runLabel})...`);

        const withoutGen = await generateContent(item.prompt, {
          model: options.model,
          systemInstruction: undefined,
          mock: options.mock,
        });

        const withoutGrading = await gradeAssertions(
          withoutGen.text,
          item.expected_output,
          item.assertions,
          {
            model: options.model,
            mock: options.mock,
          },
        );

        results.push({
          eval_id: item.id,
          config: "without_skill",
          run_number: r,
          output: withoutGen.text,
          timing: withoutGen.timing,
          grading: withoutGrading,
        });
      }
    }
  }

  return results;
}
