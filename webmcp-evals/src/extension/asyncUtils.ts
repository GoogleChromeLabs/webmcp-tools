/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Aborted");
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

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
    await delay(options.intervalMs, options.signal);
  }
  const label = typeof options.label === "function" ? options.label() : options.label;
  throw new Error(`Timed out after ${options.timeoutMs} ms waiting for ${label}.`);
}
