/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type Config = {
  toolSchemaFile: string;
  evalsFile: string;
  backend: string;
  provider?: string;
  model: string;
  debug?: boolean;
  runs?: number;
  // Upper bound on the local agent loop's step count. Fed to
  // `stopWhen: stepCountIs(maxSteps)` in `executeLocalEvals`. Larger values
  // let longer trajectories complete; smaller values cap runaway loops.
  // Ignored by `executeInBrowserEvals`.
  maxSteps?: number;
};

export type WebmcpConfig = {
  url: string;
  evalsFile: string;
  backend: string;
  provider?: string;
  model: string;
  debug?: boolean;
  runs?: number;
  maxSteps?: number;
};
