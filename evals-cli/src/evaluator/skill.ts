/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, readFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import {
  extractResourceLinks,
  parseSkillContent,
  toReadToolSchema,
  validateSkillProperties,
} from "agent-skills-ts-sdk";
import type { ResolvedSkill } from "agent-skills-ts-sdk";

import { Tool } from "../types/tools.js";
import { buildSystemPrompt } from "./prompts.js";

export type LoadedSkill = {
  skill: ResolvedSkill;
  systemPrompt: string;
  readTool: Tool;
};

async function resolveResourceFilePath(
  skillDir: string,
  resourcePath: string,
): Promise<string> {
  const candidates = resourcePath.endsWith(".md")
    ? [join(skillDir, resourcePath)]
    : [join(skillDir, resourcePath), join(skillDir, `${resourcePath}.md`)];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue trying other candidate paths.
    }
  }

  throw new Error(
    `Could not find skill resource "${resourcePath}" relative to ${skillDir}.`,
  );
}

export async function loadSkillFromFile(skillPathArg: string): Promise<LoadedSkill> {
  const skillPath = resolve(process.cwd(), skillPathArg);
  const skillContent = await readFile(skillPath, "utf-8");
  const { properties, body } = parseSkillContent(skillContent, {
    inputMode: "embedded",
  });

  const validationErrors = validateSkillProperties(properties);
  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid skill file "${skillPath}":\n  ${validationErrors.join("\n  ")}`,
    );
  }

  const resourceLinks = extractResourceLinks(body);
  const skillDir = dirname(skillPath);
  const resources = await Promise.all(
    resourceLinks.map(async (link) => {
      const filePath = await resolveResourceFilePath(skillDir, link.path);
      const content = await readFile(filePath, "utf-8");
      return { name: link.name, path: link.path, content };
    }),
  );

  const skill: ResolvedSkill = {
    name: properties.name,
    description: properties.description,
    body,
    resources,
  };

  const readToolSchema = toReadToolSchema([skill], {
    toolName: "read_site_context",
    description:
      "Read site skill context. Without a resource parameter, returns the skill overview which lists available resources. With a resource parameter, returns the full content of that specific resource.",
  });

  return {
    skill,
    systemPrompt: buildSystemPrompt(skill),
    readTool: {
      description: readToolSchema.description,
      functionName: readToolSchema.name,
      parameters: readToolSchema.parametersJsonSchema as Record<string, unknown>,
    },
  };
}
