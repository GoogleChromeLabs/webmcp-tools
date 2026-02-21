#!/usr/bin/env node

/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import minimist from "minimist";
import { createServer } from "../server/app.js";

const args = minimist(process.argv.slice(2));

if (args.help || args.h) {
  console.log(`
Usage: node dist/bin/serve.js [options]

Options:
  --port <number>    Port to run the server on (default: 8080)
  --help, -h         Show help
  `);
  process.exit(0);
}

const port = args.port || 8080;

const app = createServer();

app.listen(port, () => {
  console.log(`WebMCP Evals Web sidecar running at http://localhost:${port}`);
});
