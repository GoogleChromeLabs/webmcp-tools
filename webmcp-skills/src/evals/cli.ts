/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { bundleSkillEvals, discoverSkills, loadSkillEvals } from "./loader.js";
import { packageSkill } from "./package-skill.js";
import { printConsoleSummary, saveBenchmarkWorkspace } from "./reporter.js";
import { runSkillEvals } from "./runner.js";
import { runTriggerEval, type TriggerQuery } from "./trigger-eval.js";
import { runTriggerOptimizationLoop } from "./trigger-loop.js";
import type { Skill } from "./types.js";
import { validateSkill } from "./validate-skill.js";
import dotenvy from "dotenvy";

if (fs.existsSync(path.resolve(".env"))) {
  dotenvy();
}

interface CliArgs {
  skill?: string;
  filter?: string;
  mode: "with-only" | "comparison";
  iteration?: number;
  runs?: number;
  model?: string;
  dryRun: boolean;
  bundleOnly: boolean;
  validate?: string;
  package?: string;
  triggerEval?: string;
  optimizeDesc?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    mode: "comparison",
    dryRun: false,
    bundleOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--skill" && args[i + 1]) {
      result.skill = args[++i];
    } else if (arg === "--filter" && args[i + 1]) {
      result.filter = args[++i];
    } else if (arg === "--mode" && args[i + 1]) {
      result.mode = args[++i] as "with-only" | "comparison";
    } else if (arg === "--iteration" && args[i + 1]) {
      result.iteration = parseInt(args[++i], 10);
    } else if ((arg === "--runs" || arg === "-r") && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        result.runs = parsed;
      } else {
        console.error(`Invalid --runs value: "${args[i]}". Must be a positive integer.`);
        process.exit(1);
      }
    } else if (arg === "--model" && args[i + 1]) {
      result.model = args[++i];
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--bundle-only") {
      result.bundleOnly = true;
    } else if (arg === "--validate" && args[i + 1]) {
      result.validate = args[++i];
    } else if (arg === "--package" && args[i + 1]) {
      result.package = args[++i];
    } else if (arg === "--trigger-eval" && args[i + 1]) {
      result.triggerEval = args[++i];
    } else if (arg === "--optimize-desc" && args[i + 1]) {
      result.optimizeDesc = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Modular Agent Skills Evaluation Runner (TypeScript & Vite)

Usage:
  npm test [options]
  vite-node src/evals/cli.ts [options]

Evaluation & Benchmarking:
  --skill <name>          Target a specific skill directory (default: all in skills/)
  --filter <regex>        Filter evals by ID or prompt substring/regex
  --mode <mode>           Run mode: 'comparison' (default, with vs without skill) or 'with-only'
  --runs <N>, -r <N>      Number of runs per configuration (default: 1)
  --iteration <N>         Explicit iteration folder number
  --model <model>         Gemini model identifier (default: gemini-3.5-flash-lite)
  --dry-run               Run validation and mock generation without calling model APIs
  --bundle-only           Bundle modular evals/suites/*.json into evals/evals.json and exit

Skill Authoring & Validation (Full Parity):
  --validate <dir>        Validate a skill's SKILL.md against agentskills.io specifications
  --package <dir>         Package a skill into a distributable .skill archive (zip)
  --trigger-eval <file>   Run trigger accuracy evaluation using a queries JSON file
  --optimize-desc <file>  Run automated description optimization loop with train/test split
  --help, -h              Show this help message
`);
      process.exit(0);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();

  // 1. Handle --validate
  if (args.validate) {
    const res = validateSkill(args.validate);
    if (res.valid) {
      console.log(`✓ Skill at '${args.validate}' is valid!`);
      if (res.warnings.length > 0) {
        console.log("\nWarnings:");
        for (const w of res.warnings) console.log(`  ⚠ ${w}`);
      }
      process.exit(0);
    } else {
      console.error(`✗ Skill validation failed at '${args.validate}':`);
      for (const e of res.errors) console.error(`  ✗ ${e}`);
      process.exit(1);
    }
  }

  // 2. Handle --package
  if (args.package) {
    const res = packageSkill(args.package);
    if (res.success) {
      console.log(`✓ Successfully packaged skill to: ${res.archivePath}`);
      process.exit(0);
    } else {
      console.error(`✗ Failed to package skill: ${res.error}`);
      process.exit(1);
    }
  }

  const skillsDir = path.resolve("skills");

  // Discover skills
  let skills: Skill[] = [];
  if (args.skill) {
    const targetDir = path.join(skillsDir, args.skill);
    skills = [loadSkillEvals(targetDir)];
  } else {
    skills = discoverSkills(skillsDir);
  }

  if (skills.length === 0) {
    console.error(`No skills found in ${skillsDir}`);
    process.exit(1);
  }

  // 3. Handle --bundle-only
  if (args.bundleOnly) {
    for (const skill of skills) {
      const outPath = bundleSkillEvals(skill.dir);
      console.log(
        `✓ Bundled ${skill.evals.length} evals into ${path.relative(process.cwd(), outPath)}`,
      );
    }
    process.exit(0);
  }

  // 4. Handle --trigger-eval
  if (args.triggerEval) {
    const queries: TriggerQuery[] = JSON.parse(
      fs.readFileSync(path.resolve(args.triggerEval), "utf8"),
    );
    const targetSkill = skills[0];
    const match = targetSkill.systemInstruction.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const descMatch = match
      ? match[1].match(/description:\s*(?:>-|>)?\s*([\s\S]*?)(?=\n[a-z0-9_-]+:|$)/)
      : null;
    const desc = descMatch ? descMatch[1].trim() : "";

    const report = await runTriggerEval(targetSkill.name, desc, queries, {
      model: args.model,
      mock: args.dryRun || !process.env.GEMINI_API_KEY,
    });

    console.log(`\nTrigger Evaluation Report: ${report.skill_name}`);
    console.log(`Accuracy:  ${Math.round(report.metrics.accuracy * 100)}%`);
    console.log(`Precision: ${report.metrics.precision}`);
    console.log(`Recall:    ${report.metrics.recall}`);
    console.log(`F1 Score:  ${report.metrics.f1}\n`);
    process.exit(report.metrics.failed > 0 ? 1 : 0);
  }

  // 5. Handle --optimize-desc
  if (args.optimizeDesc) {
    const queries: TriggerQuery[] = JSON.parse(
      fs.readFileSync(path.resolve(args.optimizeDesc), "utf8"),
    );
    const targetSkill = skills[0];
    const match = targetSkill.systemInstruction.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const descMatch = match
      ? match[1].match(/description:\s*(?:>-|>)?\s*([\s\S]*?)(?=\n[a-z0-9_-]+:|$)/)
      : null;
    const desc = descMatch ? descMatch[1].trim() : "";

    await runTriggerOptimizationLoop(
      targetSkill.name,
      targetSkill.systemInstruction,
      desc,
      queries,
      {
        model: args.model,
        mock: args.dryRun || !process.env.GEMINI_API_KEY,
      },
    );
    process.exit(0);
  }

  // Always keep evals.json bundled in sync
  for (const skill of skills) {
    bundleSkillEvals(skill.dir);
  }

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
  const isMock = args.dryRun || !hasApiKey;

  if (!hasApiKey && !args.dryRun) {
    console.log("\n⚠️  NOTICE: GEMINI_API_KEY is not set. Running in dry-run / mock mode.\n");
  }

  let totalFailedEvals = 0;

  for (const skill of skills) {
    console.log(
      `\nEvaluating skill: ${skill.name} (${skill.evals.length} total evals across ${skill.suites.length} suites)`,
    );

    const runs = await runSkillEvals(skill, {
      mode: args.mode,
      filter: args.filter,
      model: args.model,
      runs: args.runs,
      mock: isMock,
    });

    if (runs.length === 0) continue;

    const { benchmarkPath, report } = saveBenchmarkWorkspace(skill.name, runs, {
      iteration: args.iteration,
      model: args.model,
      runsPerConfiguration: args.runs,
    });

    printConsoleSummary(report);
    console.log(
      `Artifacts saved to: ${path.relative(process.cwd(), path.dirname(benchmarkPath))}\n`,
    );

    for (const r of report.eval_results) {
      if (!r.with_skill.passed) {
        totalFailedEvals++;
      }
    }
  }

  if (totalFailedEvals > 0 && !isMock) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal eval error:", err);
  process.exit(1);
});
