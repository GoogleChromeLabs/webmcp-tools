/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from "vite";

/**
 * Content Security Policy applied to both the dev server and preview server.
 *
 * Key directives:
 * - `script-src 'unsafe-eval'`  — required because the eval_code worker uses
 *   `new Function` internally. Blob workers inherit the page CSP, so this
 *   cannot be moved to a worker-only policy via a meta tag.
 * - `worker-src blob:`           — allows creating workers from Blob URLs,
 *   which is how EvalTool sandboxes untrusted LLM-submitted code.
 * - `connect-src 'self'`         — prevents worker code from making arbitrary
 *   outbound HTTP/WebSocket requests.
 * - `style-src … fonts.googleapis.com` — needed for the Orbitron / Share Tech
 *   Mono Google Fonts stylesheet loaded in style.css.
 * - `font-src … fonts.gstatic.com`    — the actual font binary files.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "worker-src blob:",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

export default defineConfig({
  base: "",
  server: {
    headers: {
      "Content-Security-Policy": CSP,
    },
  },
  preview: {
    headers: {
      "Content-Security-Policy": CSP,
    },
  },
});
