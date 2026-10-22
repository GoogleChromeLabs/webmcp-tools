/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { VercelBackend } from "../backends/vercel.js";
import type { Config } from "../types/config.js";
import type { Eval } from "../types/evals.js";
import { LocalToolRegistry } from "../evaluator/toolRegistry.js";
import { MockResolver } from "../evaluator/mockResolver.js";

const testCase: Eval = {
  name: "Native request option forwarding",
  messages: [{ role: "user", type: "message", content: "Say ready." }],
  expectedCall: [],
};

// Exercise the real SDK serialization; no provider traffic or copied backend logic.
async function captureRequest(options: Record<string, unknown>, browser: boolean, cli = false) {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousUrl = process.env.OPENAI_BASE_URL;
  const requests: Record<string, unknown>[] = [];
  let fixtureDir: string | undefined;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const part of request) body += part;
    requests.push(JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "chatcmpl-local-test",
        object: "chat.completion",
        created: 1,
        model: "gpt-6-luna",
        choices: [
          { index: 0, message: { role: "assistant", content: "ready" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.env.OPENAI_API_KEY = "local-test-not-a-credential";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    if (cli) {
      fixtureDir = await mkdtemp(join(tmpdir(), "webmcp-request-options-"));
      const toolsPath = join(fixtureDir, "tools.json");
      const evalsPath = join(fixtureDir, "evals.json");
      const outputDir = join(fixtureDir, "reports");
      await writeFile(
        toolsPath,
        JSON.stringify({
          tools: [
            {
              name: "ready",
              description: "Return readiness",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        }),
      );
      await writeFile(evalsPath, JSON.stringify([testCase]));
      await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(new URL("../bin/webmcp-evals.js", import.meta.url)),
          "local",
          "-t",
          toolsPath,
          "-e",
          evalsPath,
          "--model",
          "openai:gpt-6-luna",
          "--openai-reasoning-effort",
          "none",
          "--max-output-tokens",
          "256",
          "--runs",
          "1",
          "--reporter",
          "json",
          "--output-dir",
          outputDir,
        ],
        { env: process.env, timeout: 10000 },
      );
      const files = await readdir(outputDir);
      assert.equal(files.length, 1);
      const report = JSON.parse(await readFile(join(outputDir, files[0]), "utf8"));
      assert.equal(report.config.openaiReasoningEffort, "none");
      assert.equal(report.config.maxOutputTokens, 256);
      assert.equal(report.results.passCount, 1);
      assert.equal(report.results.failCount, 0);
      assert.equal(report.results.errorCount, 0);
      assert.equal(requests.length, 1);
      return requests[0];
    }
    const backend = new VercelBackend({ model: "openai:gpt-6-luna", ...options } as Config);
    const registry = new LocalToolRegistry(
      [
        {
          functionName: "ready",
          description: "Return readiness",
          parameters: { type: "object", properties: {} },
        },
      ],
      new MockResolver([]),
    );
    const result = browser
      ? await backend.executeInBrowserEval(testCase, registry)
      : await backend.executeLocalEvals(testCase, registry);
    assert.equal("error" in result ? result.error : undefined, undefined);
    assert.equal(result.text, "ready");
    assert.equal(requests.length, 1);
    return requests[0];
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousUrl;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
  }
}

describe("Explicit eval request options", () => {
  it("forwards CLI options through commands and retains them in the ordinary scored report", async () => {
    const body = await captureRequest({}, false, true);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_completion_tokens, 256);
  });
  for (const browser of [false, true]) {
    const lane = browser ? "browser" : "local";
    it(`${lane} forwards explicit OpenAI effort and output cap without changing tools`, async () => {
      const body = await captureRequest(
        { openaiReasoningEffort: "none", maxOutputTokens: 256 },
        browser,
      );
      assert.equal(body.reasoning_effort, "none");
      assert.equal(body.max_completion_tokens, 256);
      assert.equal(body.max_tokens, undefined);
      assert.equal((body.tools as unknown[]).length, 1);
    });
    it(`${lane} preserves unset defaults`, async () => {
      const body = await captureRequest({}, browser);
      assert.equal(body.reasoning_effort, undefined);
      assert.equal(body.max_completion_tokens, undefined);
      assert.equal(body.max_tokens, undefined);
    });
  }

  it("rejects invalid programmatic caps and effort before calling a provider", () => {
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () =>
          new VercelBackend({
            model: "openai:gpt-6-luna",
            maxOutputTokens: value,
          } as unknown as Config),
        /positive safe integer/,
      );
    }
    assert.throws(
      () =>
        new VercelBackend({
          model: "openai:gpt-6-luna",
          openaiReasoningEffort: "invalid",
        } as unknown as Config),
      /reasoning effort/,
    );
    assert.throws(
      () =>
        new VercelBackend({
          model: "google:gemini-3.5-flash",
          openaiReasoningEffort: "none",
        } as unknown as Config),
      /OpenAI model/,
    );
  });
});
