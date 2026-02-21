/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const api = {
  fetchTools: () => `${API_BASE}/api/tools`,
  runEvals: () => `${API_BASE}/api/run`,
};
