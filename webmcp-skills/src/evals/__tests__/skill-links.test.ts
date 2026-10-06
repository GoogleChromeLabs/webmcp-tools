/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const skillDir = path.resolve("skills/build-webmcp-tools");

/**
 * Computes a GitHub-style heading anchor: lowercase, drop punctuation except hyphens and
 * underscores, and turn each space into a hyphen.
 */
function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function headingSlugs(file: string): Set<string> {
  const content = fs.readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  const slugs = new Set<string>();
  for (const match of content.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    slugs.add(slugify(match[1]));
  }
  return slugs;
}

function markdownFiles(): string[] {
  const refsDir = path.join(skillDir, "references");
  return [
    path.join(skillDir, "SKILL.md"),
    ...fs.readdirSync(refsDir).map((f) => path.join(refsDir, f)),
  ].filter((f) => f.endsWith(".md"));
}

describe("Skill Authoring - Internal Links", () => {
  it("computes GitHub heading slugs", () => {
    expect(slugify("1. Threat Model")).toBe("1-threat-model");
    expect(slugify('3. Goal Isolation & "One Goal Per Iteration"')).toBe(
      "3-goal-isolation--one-goal-per-iteration",
    );
    expect(slugify("2. `readOnlyHint` and `consequentialHint`")).toBe(
      "2-readonlyhint-and-consequentialhint",
    );
  });

  for (const file of markdownFiles()) {
    it(`resolves every relative link and anchor in ${path.relative(skillDir, file)}`, () => {
      const content = fs.readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
      const broken: string[] = [];

      for (const match of content.matchAll(/\]\((\.\/[^)\s]+)\)/g)) {
        const [target, anchor] = match[1].split("#");
        const targetPath = path.resolve(path.dirname(file), target);
        if (!fs.existsSync(targetPath)) {
          broken.push(`${match[1]} (missing file)`);
          continue;
        }
        if (anchor && !headingSlugs(targetPath).has(anchor)) {
          broken.push(`${match[1]} (missing anchor)`);
        }
      }

      expect(broken).toEqual([]);
    });
  }
});
