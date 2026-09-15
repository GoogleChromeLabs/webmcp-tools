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
 *   `new Function` internally (inherited by the srcdoc iframe and blob worker).
 * - `script-src 'sha256-...'`   — allows the inline bootstrap script inside
 *   EvalTool's sandboxed `<iframe sandbox="allow-scripts">` srcdoc document.
 * - `worker-src blob:`           — allows creating workers from Blob URLs
 *   inside the sandboxed iframe.
 * - `connect-src 'self'`         — restricts outbound requests from the main
 *   page (the sandboxed iframe further restricts its worker to `connect-src 'none'`).
 * - `style-src … fonts.googleapis.com` — needed for the Orbitron / Share Tech
 *   Mono Google Fonts stylesheet loaded in style.css.
 * - `font-src … fonts.gstatic.com`    — the actual font binary files.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'sha256-WFCiV7hPNR9ZCvdS5ykPkSin9WNCoEJiHQ0tHIJ2vpU='",
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
