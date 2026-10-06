/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const ALLOWED_PROPERTIES = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
]);

/**
 * Validates a skill directory against agentskills.io specifications.
 */
export function validateSkill(skillDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const resolvedDir = path.resolve(skillDir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    return { valid: false, errors: [`Directory does not exist: ${resolvedDir}`], warnings };
  }

  const skillMdPath = path.join(resolvedDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    return { valid: false, errors: [`SKILL.md not found in ${resolvedDir}`], warnings };
  }

  const content = fs.readFileSync(skillMdPath, "utf8");
  if (!content.startsWith("---")) {
    return {
      valid: false,
      errors: ["SKILL.md must start with YAML frontmatter delimiter (---)"],
      warnings,
    };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { valid: false, errors: ["Invalid YAML frontmatter format in SKILL.md"], warnings };
  }

  const frontmatterText = match[1];
  const bodyText = match[2];

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = YAML.parse(frontmatterText);
    if (!frontmatter || typeof frontmatter !== "object") {
      return { valid: false, errors: ["Frontmatter must be a valid YAML dictionary"], warnings };
    }
  } catch (err) {
    return {
      valid: false,
      errors: [`YAML parsing error in frontmatter: ${(err as Error).message}`],
      warnings,
    };
  }

  // Check unexpected properties
  for (const key of Object.keys(frontmatter)) {
    if (!ALLOWED_PROPERTIES.has(key)) {
      errors.push(
        `Unexpected key '${key}' in frontmatter. Allowed keys are: ${Array.from(ALLOWED_PROPERTIES).sort().join(", ")}`,
      );
    }
  }

  // Check required fields
  if (!frontmatter.name) {
    errors.push("Missing required field 'name' in frontmatter");
  } else if (typeof frontmatter.name !== "string") {
    errors.push("'name' must be a string");
  } else {
    const name = frontmatter.name.trim();
    const dirName = path.basename(resolvedDir);

    if (name.length < 1 || name.length > 64) {
      errors.push(`'name' length must be between 1 and 64 characters (got ${name.length})`);
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      errors.push(
        `'name' must contain only lowercase alphanumeric characters and hyphens ('${name}')`,
      );
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      errors.push(`'name' must not start or end with a hyphen ('${name}')`);
    }
    if (name.includes("--")) {
      errors.push(`'name' must not contain consecutive hyphens ('${name}')`);
    }
    if (name !== dirName) {
      errors.push(`'name' ('${name}') must match the parent directory name ('${dirName}')`);
    }
  }

  // Check description
  if (!frontmatter.description) {
    errors.push("Missing required field 'description' in frontmatter");
  } else if (typeof frontmatter.description !== "string") {
    errors.push("'description' must be a string");
  } else {
    const desc = frontmatter.description.trim();
    if (desc.length < 1 || desc.length > 1024) {
      errors.push(
        `'description' length must be between 1 and 1024 characters (got ${desc.length})`,
      );
    }
    if (desc.includes("<") || desc.includes(">")) {
      errors.push("'description' must not contain angle brackets (< or >)");
    }
  }

  // Check compatibility (optional)
  if (frontmatter.compatibility !== undefined) {
    if (typeof frontmatter.compatibility !== "string") {
      errors.push("'compatibility' must be a string");
    } else if (frontmatter.compatibility.length > 500) {
      errors.push(
        `'compatibility' length must be <= 500 characters (got ${frontmatter.compatibility.length})`,
      );
    }
  }

  // Check body budget
  const lineCount = bodyText.split("\n").length;
  if (lineCount > 500) {
    warnings.push(
      `SKILL.md body is ${lineCount} lines (recommended: < 500 lines). Consider moving detailed technical documentation into references/*.md.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
