/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import type { EvalCase, EvalSuite, Skill } from "./types.js";

/**
 * Validates a single evaluation test case according to the agentskills.io schema.
 */
export function validateEvalItem(
  evalItem: unknown,
  sourceFile: string,
  skillDir: string,
): asserts evalItem is EvalCase {
  if (!evalItem || typeof evalItem !== "object") {
    throw new Error(`[${sourceFile}] Eval item must be an object`);
  }

  const item = evalItem as Partial<EvalCase>;

  if (!item.id || typeof item.id !== "string") {
    throw new Error(`[${sourceFile}] Missing or invalid 'id' in eval: ${JSON.stringify(evalItem)}`);
  }
  if (!item.prompt || typeof item.prompt !== "string") {
    throw new Error(`[${sourceFile}] Eval '${item.id}' missing required string 'prompt'`);
  }
  if (!item.expected_output || typeof item.expected_output !== "string") {
    throw new Error(`[${sourceFile}] Eval '${item.id}' missing required string 'expected_output'`);
  }
  if (!Array.isArray(item.assertions) || item.assertions.length === 0) {
    throw new Error(
      `[${sourceFile}] Eval '${item.id}' must have a non-empty array of 'assertions'`,
    );
  }

  for (const assertion of item.assertions) {
    if (typeof assertion !== "string" || !assertion.trim()) {
      throw new Error(`[${sourceFile}] Eval '${item.id}' has invalid empty assertion`);
    }
  }

  if (Array.isArray(item.files)) {
    for (const relFile of item.files) {
      const fullPath = path.resolve(skillDir, relFile);
      if (!fs.existsSync(fullPath)) {
        throw new Error(
          `[${sourceFile}] Eval '${item.id}' references non-existent file: ${relFile}`,
        );
      }
    }
  }
}

/**
 * Discovers skills in the given skills directory.
 */
export function discoverSkills(skillsDir: string): Skill[] {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillDir = path.join(skillsDir, entry.name);
      const skillPath = path.join(skillDir, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        skills.push(loadSkillEvals(skillDir));
      }
    }
  }

  return skills;
}

/**
 * Loads modular evaluation suites for a specific skill directory.
 */
export function loadSkillEvals(skillDir: string): Skill {
  const skillName = path.basename(skillDir);
  const skillPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill file not found at ${skillPath}`);
  }

  const systemInstruction = fs.readFileSync(skillPath, "utf8");
  const evalsDir = path.join(skillDir, "evals");
  const suitesDir = path.join(evalsDir, "suites");
  const evalsJsonPath = path.join(evalsDir, "evals.json");

  const evals: EvalCase[] = [];
  const suitesLoaded: string[] = [];

  if (fs.existsSync(suitesDir)) {
    const suiteFiles = fs
      .readdirSync(suitesDir)
      .filter((file) => file.endsWith(".json"))
      .sort();

    for (const file of suiteFiles) {
      const filePath = path.join(suitesDir, file);
      const content: EvalSuite = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const suiteName = content.suite || path.basename(file, ".json");
      suitesLoaded.push(suiteName);

      if (Array.isArray(content.evals)) {
        for (const item of content.evals) {
          validateEvalItem(item, file, skillDir);
          evals.push({
            ...item,
            suite: suiteName,
          });
        }
      }
    }
  } else if (fs.existsSync(evalsJsonPath)) {
    const content: EvalSuite = JSON.parse(fs.readFileSync(evalsJsonPath, "utf8"));
    suitesLoaded.push("default");
    if (Array.isArray(content.evals)) {
      for (const item of content.evals) {
        validateEvalItem(item, "evals.json", skillDir);
        evals.push({
          ...item,
          suite: "default",
        });
      }
    }
  }

  // Check for duplicate eval IDs
  const seenIds = new Set<string>();
  for (const item of evals) {
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate eval ID '${item.id}' detected in skill '${skillName}'`);
    }
    seenIds.add(item.id);
  }

  return {
    name: skillName,
    dir: skillDir,
    skillPath,
    systemInstruction,
    evals,
    suites: suitesLoaded,
  };
}

/**
 * Bundles modular suites into a consolidated evals/evals.json per agentskills.io standard.
 */
export function bundleSkillEvals(skillDir: string): string {
  const loaded = loadSkillEvals(skillDir);
  const evalsDir = path.join(skillDir, "evals");
  if (!fs.existsSync(evalsDir)) {
    fs.mkdirSync(evalsDir, { recursive: true });
  }

  const outputObject = {
    skill_name: loaded.name,
    evals: loaded.evals.map(({ suite: _suite, ...rest }) => rest),
  };

  const outputPath = path.join(evalsDir, "evals.json");
  fs.writeFileSync(outputPath, JSON.stringify(outputObject, null, 2) + "\n", "utf8");
  return outputPath;
}
