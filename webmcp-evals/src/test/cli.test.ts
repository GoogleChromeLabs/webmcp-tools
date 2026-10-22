/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/webmcp-evals.js", import.meta.url));

function help(...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf-8" });
}

describe("CLI backend option scope", () => {
  it("offers request options only on local and browser eval commands", () => {
    for (const command of ["local", "browser"]) {
      assert.match(help(command, "--help"), /--openai-reasoning-effort/);
      assert.match(help(command, "--help"), /--max-output-tokens/);
    }
    for (const command of ["smoke", "simulate", "analyze"]) {
      assert.doesNotMatch(help(command, "--help"), /--openai-reasoning-effort/);
      assert.doesNotMatch(help(command, "--help"), /--max-output-tokens/);
    }
  });

  it("rejects malformed request options before reading fixtures or contacting a provider", () => {
    const base = [CLI, "local", "-t", "missing-tools.json", "-e", "missing-evals.json"];
    for (const value of ["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992"]) {
      const result = spawnSync(process.execPath, [...base, "--max-output-tokens", value], {
        encoding: "utf-8",
      });
      assert.notStrictEqual(result.status, 0);
      assert.match(result.stderr, /positive safe integer/);
      assert.doesNotMatch(result.stderr, /ENOENT/);
    }
    const effort = spawnSync(process.execPath, [...base, "--openai-reasoning-effort", "invalid"], {
      encoding: "utf-8",
    });
    assert.notStrictEqual(effort.status, 0);
    assert.match(effort.stderr, /Allowed choices/);
    const backend = spawnSync(
      process.execPath,
      [...base, "--backend", "gemini", "--max-output-tokens", "256"],
      { encoding: "utf-8" },
    );
    assert.notStrictEqual(backend.status, 0);
    assert.match(backend.stderr, /require the vercel backend/);
    assert.doesNotMatch(backend.stderr, /ENOENT/);
  });

  it("offers --backend on local and browser eval commands", () => {
    assert.doesNotMatch(help("--help"), /--backend/);
    assert.match(help("local", "--help"), /--backend/);
    assert.match(help("browser", "--help"), /--backend/);
    assert.doesNotMatch(help("smoke", "--help"), /--backend/);
    assert.doesNotMatch(help("simulate", "--help"), /--backend/);
    assert.match(help("simulate", "--help"), /--open/);
  });

  it("rejects --backend instead of accepting it for simulate", () => {
    const result = spawnSync(
      process.execPath,
      [CLI, "--backend", "gemini", "simulate", "-u", "https://example.test", "-s", "x.json"],
      { encoding: "utf-8" },
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /unknown option '--backend'/);
  });
});
