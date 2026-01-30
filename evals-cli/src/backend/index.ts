/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "../types/evals.js";
import { ToolCall } from "../types/tools.js";

export interface Backend {
  execute(messages: [Message]): Promise<ToolCall | null>;
}
