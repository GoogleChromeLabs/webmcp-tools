/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import type { Page } from "puppeteer-core";
import { collectBrowserConsoleErrors } from "../evaluator/browserEvaluator.js";

describe("collectBrowserConsoleErrors", () => {
  it("collects console errors and uncaught exceptions while ignoring other console levels", () => {
    const page = new EventEmitter();
    const errors = collectBrowserConsoleErrors(page as unknown as Page);

    page.emit("console", {
      type: () => "warning",
      text: () => "Deprecated API",
      location: () => ({ url: "https://example.test/app.js", lineNumber: 4, columnNumber: 2 }),
    });
    page.emit("console", {
      type: () => "error",
      text: () => "Request failed",
      location: () => ({ url: "https://example.test/app.js", lineNumber: 8, columnNumber: 12 }),
    });
    page.emit("pageerror", new Error("Unhandled failure"));

    assert.deepStrictEqual(errors, [
      {
        kind: "console",
        message: "Request failed",
        url: "https://example.test/app.js",
        lineNumber: 8,
        columnNumber: 12,
      },
      {
        kind: "pageerror",
        message: "Unhandled failure",
      },
    ]);
  });
});
