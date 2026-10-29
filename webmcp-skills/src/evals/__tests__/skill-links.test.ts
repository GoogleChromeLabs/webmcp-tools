/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const skillsRoot = path.resolve("skills");

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
  const files: string[] = [];
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(skillsRoot, entry.name);
    const skillMd = path.join(dir, "SKILL.md");
    if (fs.existsSync(skillMd)) files.push(skillMd);
    const refsDir = path.join(dir, "references");
    if (fs.existsSync(refsDir)) {
      for (const f of fs.readdirSync(refsDir)) {
        if (f.endsWith(".md")) files.push(path.join(refsDir, f));
      }
    }
  }
  return files;
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
    it(`resolves every relative link and anchor in ${path.relative(skillsRoot, file)}`, () => {
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
