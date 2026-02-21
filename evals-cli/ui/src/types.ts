/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type Tab = 'local' | 'website';

export interface ToolDef {
  functionName: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LogEntry {
  msg: string;
  type: string;
  isLink?: boolean;
  linkUrl?: string;
}

export interface AppConfig {
  evalsFile: string;
  model: string;
  backend: string;
  toolSchemaFile?: string;
  url?: string;
}
