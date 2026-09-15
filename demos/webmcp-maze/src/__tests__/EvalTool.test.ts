/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  createEvalTool,
  EVAL_IFRAME_SCRIPT,
} from "../webmcp/tools/EvalTool.ts";
import { CSP } from "../../vite.config.ts";

describe("EvalTool", () => {
  it("defines eval_code with expected schema", () => {
    const tool = createEvalTool();
    expect(tool.name).toBe("eval_code");
    const schema = tool.inputSchema as { required?: string[] };
    expect(schema.required).toContain("code");
  });

  it("keeps EVAL_IFRAME_SCRIPT sha256 hash in sync with vite.config.ts CSP", () => {
    const sha256 = createHash("sha256")
      .update(EVAL_IFRAME_SCRIPT, "utf8")
      .digest("base64");
    expect(CSP).toContain(`'sha256-${sha256}'`);
  });

  it("returns abort error immediately if signal is already aborted", async () => {
    const tool = createEvalTool();
    const controller = new AbortController();
    controller.abort("Custom abort reason");

    const result = await tool.execute(
      { code: "return 42;" },
      { signal: controller.signal },
    );
    expect(result).toEqual({
      success: false,
      error: "Custom abort reason",
    });
  });
});
