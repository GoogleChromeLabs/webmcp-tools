/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { delay } from "../utils/async.js";

export { delay };

export async function pollUntil<T>(
  check: () => Promise<T | undefined>,
  options: {
    timeoutMs: number;
    intervalMs: number;
    signal?: AbortSignal;
    label: string | (() => string);
  },
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    options.signal?.throwIfAborted();
    const value = await check();
    if (value !== undefined) {
      return value;
    }
    await delay(Math.max(1, options.intervalMs), options.signal);
  }
  const label = typeof options.label === "function" ? options.label() : options.label;
  throw new Error(`Timed out after ${options.timeoutMs} ms waiting for ${label}.`);
}
