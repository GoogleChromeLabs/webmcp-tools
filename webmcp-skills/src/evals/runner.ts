/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FileAccessPolicy, normalizeRelativePath, runAgentLoop } from "./agent-loop.js";
import { gradeAssertions, parseReadAssertion } from "./grader.js";
import type { EvalCase, SingleRunResult, Skill } from "./types.js";

export interface RunOptions {
  mode?: "with-only" | "comparison";
  filter?: string;
  model?: string;
  concurrency?: number;
  mock?: boolean;
  runs?: number;
  maxTurns?: number;
}

/**
 * Builds the read_file access policy for a configuration. with_skill may read the skill
 * directory (except evals/, which holds expected outputs and assertions) plus the eval's
 * files; without_skill may read only the eval's files.
 */
export function buildAccessPolicy(
  skill: Skill,
  item: EvalCase,
  config: "with_skill" | "without_skill",
): FileAccessPolicy {
  return {
    baseDir: skill.dir,
    allowTree: config === "with_skill",
    excludeDirs: ["evals"],
    allowedFiles: item.files ?? [],
  };
}

/**
 * Returns the assertions to grade for a configuration. without_skill cannot read skill
 * files, so read-assertions about them would be automatic failures ("read") or automatic
 * passes ("did NOT read"); they are dropped. Read-assertions about the eval's own files
 * stay, since both configurations can read those.
 */
export function gradableAssertions(
  item: EvalCase,
  config: "with_skill" | "without_skill",
): string[] {
  if (config === "with_skill") {
    return item.assertions;
  }
  const evalFiles = new Set((item.files ?? []).map(normalizeRelativePath));
  return item.assertions.filter((assertion) => {
    const parsed = parseReadAssertion(assertion);
    return !parsed || evalFiles.has(parsed.target);
  });
}

/**
 * Appends the list of workspace files available to the model, if the eval declares any.
 */
export function buildPrompt(item: EvalCase): string {
  if (!item.files || item.files.length === 0) {
    return item.prompt;
  }
  const listing = item.files.map(normalizeRelativePath).join(", ");
  return `${item.prompt}\n\nWorkspace files available via read_file: ${listing}`;
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

      const withGen = await runAgentLoop(buildPrompt(item), {
        model: options.model,
        systemInstruction: skill.systemInstruction,
        mock: options.mock,
        access: buildAccessPolicy(skill, item, "with_skill"),
        maxTurns: options.maxTurns,
      });

      const withGrading = await gradeAssertions(
        withGen.text,
        item.expected_output,
        gradableAssertions(item, "with_skill"),
        {
          model: options.model,
          mock: options.mock,
          filesRead: withGen.filesRead,
        },
      );

      results.push({
        eval_id: item.id,
        config: "with_skill",
        run_number: r,
        output: withGen.text,
        timing: withGen.timing,
        grading: withGrading,
        turns: withGen.turns,
        files_read: withGen.filesRead,
      });
    }

    // 2. Run without_skill if in comparison mode
    if (mode === "comparison") {
      for (let r = 1; r <= runsPerConfig; r++) {
        const runLabel = runsPerConfig > 1 ? ` run ${r}/${runsPerConfig}` : "";
        console.log(`  ▶ Running [${item.id}] (without_skill${runLabel})...`);

        const withoutGen = await runAgentLoop(buildPrompt(item), {
          model: options.model,
          systemInstruction: undefined,
          mock: options.mock,
          access: buildAccessPolicy(skill, item, "without_skill"),
          maxTurns: options.maxTurns,
        });

        const withoutGrading = await gradeAssertions(
          withoutGen.text,
          item.expected_output,
          gradableAssertions(item, "without_skill"),
          {
            model: options.model,
            mock: options.mock,
            filesRead: withoutGen.filesRead,
          },
        );

        results.push({
          eval_id: item.id,
          config: "without_skill",
          run_number: r,
          output: withoutGen.text,
          timing: withoutGen.timing,
          grading: withoutGrading,
          turns: withoutGen.turns,
          files_read: withoutGen.filesRead,
        });
      }
    }
  }

  return results;
}
