/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
  },
  server: {
    port: 3333,
    open: true,
  },
});
