/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { cleanOldReports, findChromePath } from "../utils.js";

describe("utils path & fs helpers", () => {
  describe("findChromePath", () => {
    it("should successfully find an accessible Chrome Canary binary path", async () => {
      const pathResult = await findChromePath();
      assert.strictEqual(typeof pathResult, "string");
      assert.ok(pathResult.length > 0);
    });
  });

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
});
