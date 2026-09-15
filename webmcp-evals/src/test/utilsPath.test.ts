/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { cleanOldReports, resolveProjectPath } from "../utils.js";

describe("utils path & fs helpers", () => {
  describe("cleanOldReports", () => {
    it("should remove report-*.html files in current directory", async () => {
      const dummyReportPath = path.join(process.cwd(), `report-test-${Date.now()}.html`);
      await fs.writeFile(dummyReportPath, "<html>Test Report</html>", "utf-8");

      // Verify file created
      let existsBefore = false;
      try {
        await fs.access(dummyReportPath);
        existsBefore = true;
      } catch {
        existsBefore = false;
      }
      assert.strictEqual(existsBefore, true);

      // Clean old reports
      await cleanOldReports();

      // Verify file removed
      let existsAfter = true;
      try {
        await fs.access(dummyReportPath);
      } catch {
        existsAfter = false;
      }
      assert.strictEqual(existsAfter, false);
    });
  });

  describe("resolveProjectPath", () => {
    it("resolves valid relative paths inside the project root", () => {
      const root = "/workspace/project";
      const result = resolveProjectPath("examples/doors/evals.json", root);
      assert.strictEqual(result, path.resolve(root, "examples/doors/evals.json"));
    });

    it("resolves paths that traverse down and back within the root", () => {
      const root = "/workspace/project";
      const result = resolveProjectPath("examples/../schema.json", root);
      assert.strictEqual(result, path.resolve(root, "schema.json"));
    });

    it("rejects relative paths that escape the project root using ..", () => {
      const root = "/workspace/project";
      assert.throws(
        () => resolveProjectPath("../../etc/passwd", root),
        /resolves outside the project root/,
      );
    });

    it("rejects sibling directory paths that share the root string prefix", () => {
      const root = "/workspace/project";
      assert.throws(
        () => resolveProjectPath("../project-other/evals.json", root),
        /resolves outside the project root/,
      );
    });

    it("rejects absolute paths outside the project root", () => {
      const root = "/workspace/project";
      assert.throws(
        () => resolveProjectPath("/etc/passwd", root),
        /resolves outside the project root/,
      );
    });
  });
});
