/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import http from "node:http";
import { describe, it } from "node:test";
import { BrowserToolRegistry, launchBrowser } from "../evaluator/browser.js";

describe("Browser Integration", () => {
  it("should discover and execute tools on SPA hash routes", async (t) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <script>
              if (document.modelContext) {
                document.modelContext.registerTool({
                  name: 'test_spa_tool',
                  description: 'Tool registered on SPA page',
                  execute: () => ({ success: true, msg: 'hello' })
                });
              }
              // Simulate SPA client-side router navigation after initial script load
              setTimeout(() => {
                window.location.hash = '#/hash-route';
              }, 50);
            </script>
          </head>
          <body>SPA Test Page</body>
        </html>
      `);
    });

    await new Promise((resolve) => server.listen(0, () => resolve(undefined)));
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}/#/hash-route`;

    let browser: any;
    try {
      browser = await launchBrowser();
    } catch {
      t.skip("Could not launch browser");
      server.close();
      return;
    }
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle2" });

      const registry = new BrowserToolRegistry(page as any);
      const tools = registry.syncTools();

      assert.strictEqual(tools.length, 1);
      assert.strictEqual(tools[0].functionName, "test_spa_tool");

      const result = await registry.executeTool("test_spa_tool", {});
      assert.deepStrictEqual(result, { success: true, msg: "hello" });

      await page.close();
    } finally {
      await browser.close();
      server.close();
    }
  });
});
