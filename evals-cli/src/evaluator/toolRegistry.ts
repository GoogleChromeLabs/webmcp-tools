/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool } from "../types/tools.js";
import { MockResolver } from "./mockResolver.js";

export interface ToolRegistry {
  getCurrentTools(): Tool[];
  executeTool(name: string, args: any): Promise<any>;
}

export class LocalToolRegistry implements ToolRegistry {
  constructor(
    private tools: Tool[],
    private resolver: MockResolver,
  ) {}

  getCurrentTools(): Tool[] {
    return this.tools;
  }

  async executeTool(name: string, args: any): Promise<any> {
    return this.resolver.resolve(name, args);
  }
}
