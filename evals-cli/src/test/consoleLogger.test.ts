/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { ConsoleLogger } from "../utils/logger.js";

describe("ConsoleLogger", () => {
  it("should output standard logs, warnings, and errors directly to console", () => {
    let logCalls: any[] = [];
    let warnCalls: any[] = [];
    let errorCalls: any[] = [];

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => logCalls.push(args);
    console.warn = (...args) => warnCalls.push(args);
    console.error = (...args) => errorCalls.push(args);

    try {
      const logger = new ConsoleLogger();
      logger.log("log message", 123);
      logger.warn("warn message");
      logger.error("error message");

      assert.deepStrictEqual(logCalls, [["log message", 123]]);
      assert.deepStrictEqual(warnCalls, [["warn message"]]);
      assert.deepStrictEqual(errorCalls, [["error message"]]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });

  it("should ignore debug/dir calls when debug is disabled", () => {
    let logCalls: any[] = [];
    let dirCalls: any[] = [];

    const originalLog = console.log;
    const originalDir = console.dir;

    console.log = (...args) => logCalls.push(args);
    console.dir = (...args) => dirCalls.push(args);

    try {
      const logger = new ConsoleLogger();
      logger.setDebugEnabled(false);

      logger.debug("debug message");
      logger.dir({ key: "val" });

      assert.strictEqual(logCalls.length, 0);
      assert.strictEqual(dirCalls.length, 0);
    } finally {
      console.log = originalLog;
      console.dir = originalDir;
    }
  });

  it("should output debug/dir calls when debug is enabled", () => {
    let logCalls: any[] = [];
    let dirCalls: any[] = [];

    const originalLog = console.log;
    const originalDir = console.dir;

    console.log = (...args) => logCalls.push(args);
    console.dir = (...args) => dirCalls.push(args);

    try {
      const logger = new ConsoleLogger();
      logger.setDebugEnabled(true);

      logger.debug("debug message");
      logger.dir({ key: "val" }, { colors: true });

      assert.deepStrictEqual(logCalls, [["debug message"]]);
      assert.deepStrictEqual(dirCalls, [[{ key: "val" }, { colors: true }]]);
    } finally {
      console.log = originalLog;
      console.dir = originalDir;
    }
  });
});
