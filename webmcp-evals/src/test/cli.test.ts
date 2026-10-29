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

  it("offers extension flags on browser and simulate commands only", () => {
    assert.doesNotMatch(help("--help"), /--extension/);
    assert.doesNotMatch(help("local", "--help"), /--extension/);
    assert.doesNotMatch(help("smoke", "--help"), /--extension/);

    for (const subcommand of ["browser", "simulate"]) {
      const subHelp = help(subcommand, "--help");
      assert.match(subHelp, /--extension <id-or-name-or-path>/);
      assert.match(subHelp, /--browser-url <url>/);
      assert.match(subHelp, /--user-data-dir <path>/);
      assert.match(subHelp, /--confirm-policy <policy>/);
    }
  });

  it("rejects invalid --confirm-policy values", () => {
    const result = spawnSync(
      process.execPath,
      [
        CLI,
        "browser",
        "-u",
        "https://example.test",
        "-e",
        "x.json",
        "--extension",
        "WebMCP Agent",
        "--confirm-policy",
        "yolo",
      ],
      { encoding: "utf-8" },
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Expected one of: "allow-once", "always-allow", "deny", "none"/);
  });
});
