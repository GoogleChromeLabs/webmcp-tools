/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// A relative base lets the production build run from the GitHub Pages
// sub-path (/webmcp-tools/demos/proxx-lite/).
export default defineConfig({
  base: '',
  plugins: [vue()],
})
