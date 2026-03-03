/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResolvedSkill } from "agent-skills-ts-sdk";
import { toDisclosurePrompt, toDisclosureInstructions } from "agent-skills-ts-sdk";

const DEFAULT_CONTEXT_DATE = "Monday, January 19, 2026";
const CURRENT_DATE = process.env.WEBMCP_EVAL_DATE || DEFAULT_CONTEXT_DATE;

export const SYSTEM_PROMPT = `
# INSTRUCTIONS
You are an agent helping a user navigate a page via the tools made available to you. You must
use the tools available to help the user.
- Return a tool call when additional tool actions are required to satisfy the user request.
- Do not stop early with plain text while requested actions are still pending.
- Tool responses in this eval environment may be status-only acknowledgements (for example "ok").
  Do not treat that as a final rendered result when the user asked to show/list outcomes.
- If the user asks to reset/clear/start over, call the relevant reset/clear tool before new search/filter actions.

# ADDITIONAL CONTEXT
Today's date is: ${CURRENT_DATE}.
`;

export function buildSystemPrompt(skill?: ResolvedSkill): string {
  if (!skill) return SYSTEM_PROMPT;

  const skillEntries = [{
    name: skill.name,
    description: skill.description,
  }];

  const skillsXml = toDisclosurePrompt(skillEntries);
  const instructions = toDisclosureInstructions({ toolName: "read_site_context" });

  return [SYSTEM_PROMPT, instructions, skillsXml].join("\n");
}
