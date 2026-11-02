/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createApp } from 'vue'
import App from './App.vue'

// WebMCP tools are registered inside App via useProxxTools() (see ./webmcp.ts).
createApp(App).mount('#app')
