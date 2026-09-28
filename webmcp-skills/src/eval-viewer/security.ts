/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type http from "node:http";
import path from "node:path";

/**
 * Validates whether the incoming HTTP request originates from an authorized local origin.
 * Blocks cross-site requests and requests with unexpected Host or Origin headers.
 */
export function isAllowedOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers["origin"];
  const host = req.headers["host"];
  const secFetchSite = req.headers["sec-fetch-site"];

  // Block cross-site requests initiated by external web pages
  if (secFetchSite && secFetchSite === "cross-site") {
    return false;
  }

  // Verify host is localhost or 127.0.0.1 (prevents DNS rebinding)
  if (host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    return false;
  }

  // Verify origin matches local dev server if present
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return false;
  }

  return true;
}

/**
 * Validates a skill name to prevent path traversal.
 */
export function isValidSkillName(skill: unknown): skill is string {
  return typeof skill === "string" && /^[a-zA-Z0-9_-]+$/.test(skill);
}

/**
 * Validates an iteration number.
 */
export function isValidIteration(iteration: unknown): iteration is number {
  const num = Number(iteration);
  return Number.isInteger(num) && num > 0 && num <= 100000;
}

/**
 * Validates an evaluation ID.
 */
export function isValidEvalId(evalId: unknown): evalId is string {
  return typeof evalId === "string" && /^[a-zA-Z0-9_.-]+$/.test(evalId);
}

/**
 * Safely resolves a file path within a designated root directory.
 * Returns null if the resolved path escapes the directory boundary.
 */
export function resolveSafePath(rootDir: string, ...segments: string[]): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, ...segments);

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    return null;
  }

  return resolvedTarget;
}
