/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type FileAccessPolicy,
  FINAL_TURN_NOTICE,
  READ_FILE_TOOL,
  resolveReadablePath,
  runAgentLoop,
} from "../agent-loop.js";
import { buildBenchmarkReport } from "../aggregate-benchmark.js";
import { gradeAssertions, tryReadAssertionCheck } from "../grader.js";
import { buildAccessPolicy, buildPrompt, gradableAssertions, runSkillEvals } from "../runner.js";
import type { EvalCase, SingleRunResult, Skill } from "../types.js";

const fixtureDir = path.resolve("node_modules/.cache/agent-loop-fixture");

function writeFixture(rel: string, content: string): void {
  const full = path.join(fixtureDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

beforeAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  writeFixture("SKILL.md", "---\nname: fixture\ndescription: test\n---\n# Fixture");
  writeFixture("references/guide.md", "GUIDE CONTENT");
  writeFixture("evals/suites/secret.json", '{"assertions": ["hidden"]}');
  writeFixture("evals/fixtures/app/package.json", '{"name": "recipe-app"}');
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

const withSkillPolicy: FileAccessPolicy = {
  baseDir: fixtureDir,
  allowTree: true,
  excludeDirs: ["evals"],
  allowedFiles: ["evals/fixtures/app/package.json"],
};

const withoutSkillPolicy: FileAccessPolicy = { ...withSkillPolicy, allowTree: false };

describe("Agent Loop - read_file access policy", () => {
  it("allows skill files and normalizes ./ prefixes and backslashes", () => {
    const res = resolveReadablePath(withSkillPolicy, "./references\\guide.md");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.relativePath).toBe("references/guide.md");
  });

  it("blocks the evals/ directory for with_skill except explicitly listed files", () => {
    expect(resolveReadablePath(withSkillPolicy, "evals/suites/secret.json").ok).toBe(false);
    expect(resolveReadablePath(withSkillPolicy, "evals/fixtures/app/package.json").ok).toBe(true);
  });

  it("limits without_skill to the eval's listed files", () => {
    expect(resolveReadablePath(withoutSkillPolicy, "references/guide.md").ok).toBe(false);
    expect(resolveReadablePath(withoutSkillPolicy, "SKILL.md").ok).toBe(false);
    expect(resolveReadablePath(withoutSkillPolicy, "evals/fixtures/app/package.json").ok).toBe(
      true,
    );
  });

  it("rejects traversal, absolute paths, and invalid input", () => {
    expect(resolveReadablePath(withSkillPolicy, "../../package.json").ok).toBe(false);
    expect(resolveReadablePath(withSkillPolicy, "references/../../../.env").ok).toBe(false);
    expect(resolveReadablePath(withSkillPolicy, path.resolve("package.json")).ok).toBe(false);
    expect(resolveReadablePath(withSkillPolicy, "/etc/passwd").ok).toBe(false);
    expect(resolveReadablePath(withSkillPolicy, "C:/Windows/win.ini").ok).toBe(false);
    expect(resolveReadablePath(withSkillPolicy, "").ok).toBe(false);
    expect(resolveReadablePath(withSkillPolicy, 42).ok).toBe(false);
  });

  it("reports missing files and directories as not found", () => {
    const missing = resolveReadablePath(withSkillPolicy, "references/missing.md");
    expect(missing).toEqual({ ok: false, error: "File not found: references/missing.md" });
    expect(resolveReadablePath(withSkillPolicy, "references").ok).toBe(false);
  });
});

describe("Agent Loop - tool-calling loop", () => {
  const originalFetch = globalThis.fetch;
  const prevKey = process.env.GEMINI_API_KEY;
  let requests: any[];

  const reply = (parts: unknown[]) =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { role: "model", parts } }],
        usageMetadata: { totalTokenCount: 10, promptTokenCount: 6, candidatesTokenCount: 4 },
      }),
      { status: 200 },
    );

  const mockFetch = (responses: Array<() => Response>) => {
    let i = 0;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      const next = responses[Math.min(i, responses.length - 1)];
      i++;
      return next();
    }) as typeof fetch;
  };

  beforeEach(() => {
    requests = [];
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = prevKey;
  });

  it("executes read_file calls, feeds results back, and returns the final text", async () => {
    mockFetch([
      () =>
        reply([
          {
            functionCall: {
              id: "call-1",
              name: "read_file",
              args: { path: "references/guide.md" },
            },
            thoughtSignature: "sig-abc",
          },
        ]),
      () => reply([{ text: "Final answer" }]),
    ]);

    const result = await runAgentLoop("Audit my tools", {
      systemInstruction: "SKILL",
      access: withSkillPolicy,
    });

    expect(result.text).toBe("Final answer");
    expect(result.turns).toBe(2);
    expect(result.filesRead).toEqual(["references/guide.md"]);
    expect(result.timing.total_tokens).toBe(20);

    expect(requests[0].tools[0].functionDeclarations[0].name).toBe(READ_FILE_TOOL.name);
    expect(requests[0].toolConfig.functionCallingConfig.mode).toBe("AUTO");
    expect(requests[0].system_instruction.parts[0].text).toBe("SKILL");

    const [, modelTurn, toolTurn] = requests[1].contents;
    expect(modelTurn.role).toBe("model");
    expect(modelTurn.parts[0].thoughtSignature).toBe("sig-abc");
    expect(toolTurn.role).toBe("user");
    expect(toolTurn.parts[0].functionResponse).toEqual({
      id: "call-1",
      name: "read_file",
      response: { content: "GUIDE CONTENT" },
    });
  });

  it("returns errors for blocked paths without recording them as read", async () => {
    mockFetch([
      () => reply([{ functionCall: { name: "read_file", args: { path: "../../.env" } } }]),
      () => reply([{ text: "done" }]),
    ]);

    const result = await runAgentLoop("prompt", { access: withSkillPolicy });

    expect(result.filesRead).toEqual([]);
    const response = requests[1].contents[2].parts[0].functionResponse.response;
    expect(response.error).toMatch(/outside the workspace|Access denied/);
    expect(response.content).toBeUndefined();
  });

  it("answers unknown functions with an error", async () => {
    mockFetch([
      () => reply([{ functionCall: { name: "delete_file", args: { path: "SKILL.md" } } }]),
      () => reply([{ text: "done" }]),
    ]);

    await runAgentLoop("prompt", { access: withSkillPolicy });

    expect(requests[1].contents[2].parts[0].functionResponse.response.error).toBe(
      "Unknown function: delete_file",
    );
  });

  it("stops at maxTurns, warns on the last tool results, and forces a text-only final turn", async () => {
    mockFetch([
      () => reply([{ functionCall: { name: "read_file", args: { path: "SKILL.md" } } }]),
      () => reply([{ functionCall: { name: "read_file", args: { path: "SKILL.md" } } }]),
      () => reply([{ text: "forced answer" }]),
    ]);

    const result = await runAgentLoop("prompt", { access: withSkillPolicy, maxTurns: 3 });

    expect(requests).toHaveLength(3);
    expect(requests[2].toolConfig.functionCallingConfig.mode).toBe("NONE");
    // The notice rides along only with the last tool results before the final turn
    expect(requests[1].contents[2].parts.some((p: any) => p.text)).toBe(false);
    expect(requests[2].contents[4].parts.at(-1)).toEqual({ text: FINAL_TURN_NOTICE });
    expect(result.turns).toBe(3);
    expect(result.text).toBe("forced answer");
    expect(result.filesRead).toEqual(["SKILL.md"]);
  });

  it("declines calls and retries once when the model ignores mode NONE on the final turn", async () => {
    mockFetch([
      () => reply([{ functionCall: { name: "read_file", args: { path: "SKILL.md" } } }]),
      () => reply([{ functionCall: { name: "read_file", args: { path: "references/guide.md" } } }]),
      () => reply([{ text: "answer after retry" }]),
    ]);

    const result = await runAgentLoop("prompt", { access: withSkillPolicy, maxTurns: 2 });

    expect(requests).toHaveLength(3);
    expect(requests[2].toolConfig.functionCallingConfig.mode).toBe("NONE");
    const declined = requests[2].contents[4].parts;
    expect(declined[0].functionResponse.response.error).toMatch(/limit reached/);
    expect(declined.at(-1)).toEqual({ text: FINAL_TURN_NOTICE });
    expect(result.text).toBe("answer after retry");
    expect(result.turns).toBe(3);
    // The declined call was never executed
    expect(result.filesRead).toEqual(["SKILL.md"]);
  });

  it("skips thought parts when extracting the final text", async () => {
    mockFetch([() => reply([{ text: "thinking...", thought: true }, { text: "visible" }])]);

    const result = await runAgentLoop("prompt", { access: withSkillPolicy });

    expect(result.text).toBe("visible");
  });

  it("runs in mock mode without calling fetch", async () => {
    mockFetch([
      () => {
        throw new Error("fetch must not be called in mock mode");
      },
    ]);

    const result = await runAgentLoop("prompt", { access: withSkillPolicy, mock: true });

    expect(requests).toHaveLength(0);
    expect(result.turns).toBe(1);
    expect(result.filesRead).toEqual([]);
    expect(result.text).toContain("[MOCK OUTPUT]");
  });
});

describe("Agent Loop - read assertions", () => {
  it("passes and fails positive and negated read assertions", () => {
    const filesRead = ["references/agent-security.md"];

    expect(
      tryReadAssertionCheck("The agent read references/agent-security.md", filesRead)?.passed,
    ).toBe(true);
    expect(
      tryReadAssertionCheck("The agent read ./references/agent-security.md.", filesRead)?.passed,
    ).toBe(true);
    expect(
      tryReadAssertionCheck("The agent read references/react-patterns.md", filesRead)?.passed,
    ).toBe(false);
    expect(
      tryReadAssertionCheck("The agent did NOT read references/angular-patterns.md", filesRead)
        ?.passed,
    ).toBe(true);
    expect(
      tryReadAssertionCheck("The agent did NOT read references/agent-security.md", filesRead)
        ?.passed,
    ).toBe(false);
  });

  it("fails read assertions when tracking is unavailable", () => {
    const res = tryReadAssertionCheck("The agent read references/x.md", undefined);
    expect(res?.passed).toBe(false);
    expect(res?.evidence).toContain("unavailable");
  });

  it("ignores non-read assertions", () => {
    expect(tryReadAssertionCheck("The agent reads the file carefully first", [])).toBeNull();
    expect(tryReadAssertionCheck("The output includes useWebMCP", [])).toBeNull();
  });

  it("grades read assertions deterministically in gradeAssertions", async () => {
    const result = await gradeAssertions(
      "output text",
      "expected",
      ["The agent read references/guide.md", "The agent did NOT read SKILL.md"],
      { filesRead: ["references/guide.md"], mock: true },
    );
    expect(result.summary.passed).toBe(2);
    expect(result.assertion_results[0].evidence).toContain("was read");
  });
});

describe("Agent Loop - runner integration", () => {
  const skill: Skill = {
    name: "fixture",
    dir: fixtureDir,
    skillPath: path.join(fixtureDir, "SKILL.md"),
    systemInstruction: "Fixture instruction",
    evals: [],
    suites: [],
  };

  const item: EvalCase = {
    id: "fixture-eval",
    prompt: "Add tools to my app",
    expected_output: "Expected",
    files: ["evals/fixtures/app/package.json"],
    assertions: ["The agent did NOT read references/guide.md"],
  };

  it("builds per-configuration access policies", () => {
    expect(buildAccessPolicy(skill, item, "with_skill")).toEqual({
      baseDir: fixtureDir,
      allowTree: true,
      excludeDirs: ["evals"],
      allowedFiles: ["evals/fixtures/app/package.json"],
    });
    expect(buildAccessPolicy(skill, item, "without_skill").allowTree).toBe(false);
  });

  it("lists eval files in the prompt only when present", () => {
    expect(buildPrompt(item)).toBe(
      "Add tools to my app\n\nWorkspace files available via read_file: evals/fixtures/app/package.json",
    );
    expect(buildPrompt({ ...item, files: undefined })).toBe("Add tools to my app");
  });

  it("records turns and files_read on every run", async () => {
    const results = await runSkillEvals({ ...skill, evals: [item] }, { mock: true });

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.turns).toBe(1);
      expect(r.files_read).toEqual([]);
    }
    const withRun = results.find((r) => r.config === "with_skill")!;
    const withoutRun = results.find((r) => r.config === "without_skill")!;
    expect(withRun.grading.assertion_results[0].passed).toBe(true);
    // The skill-file read-assertion is not graded for without_skill
    expect(withoutRun.grading.summary.total).toBe(0);
  });

  it("drops skill-file read-assertions for without_skill but keeps eval-file ones", () => {
    const mixed: EvalCase = {
      ...item,
      assertions: [
        "The agent read references/guide.md",
        "The agent did NOT read references/other.md",
        "The agent read ./evals/fixtures/app/package.json",
        "The output includes useWebMCP",
        "The agent reads the request carefully",
      ],
    };

    expect(gradableAssertions(mixed, "with_skill")).toEqual(mixed.assertions);
    expect(gradableAssertions(mixed, "without_skill")).toEqual([
      "The agent read ./evals/fixtures/app/package.json",
      "The output includes useWebMCP",
      "The agent reads the request carefully",
    ]);
  });
});

describe("Agent Loop - benchmark metrics", () => {
  const run = (config: SingleRunResult["config"], extra: Partial<SingleRunResult>) =>
    ({
      eval_id: "case-1",
      config,
      run_number: 1,
      output: "",
      timing: { duration_ms: 1000, total_tokens: 100 },
      grading: { assertion_results: [], summary: { passed: 1, failed: 0, total: 1, pass_rate: 1 } },
      ...extra,
    }) as SingleRunResult;

  it("aggregates turns and files read when runs record them", () => {
    const report = buildBenchmarkReport("s", 1, [
      run("with_skill", { turns: 3, files_read: ["a.md", "b.md"] }),
      run("with_skill", { run_number: 2, turns: 1, files_read: [] }),
      run("without_skill", { turns: 1, files_read: [] }),
    ]);

    expect(report.run_summary.with_skill.files_read?.mean).toBe(1);
    expect(report.run_summary.with_skill.turns?.max).toBe(3);
    expect(report.eval_results[0].with_skill.files_read).toBe(1);
    expect(report.eval_results[0].with_skill.turns).toBe(2);
    expect(report.eval_results[0].without_skill?.files_read).toBe(0);
  });

  it("omits loop metrics for legacy runs without turns", () => {
    const report = buildBenchmarkReport("s", 1, [run("with_skill", {})]);

    expect(report.run_summary.with_skill.turns).toBeUndefined();
    expect(report.run_summary.with_skill.files_read).toBeUndefined();
    expect(report.eval_results[0].with_skill.files_read).toBeUndefined();
  });
});
