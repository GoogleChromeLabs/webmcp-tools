/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from "vite";

// A relative base lets the production build run from the GitHub Pages
// sub-path (/webmcp-tools/demos/spreadsheet/).
// https://vite.dev/config/
export default defineConfig({
  base: "",
});
