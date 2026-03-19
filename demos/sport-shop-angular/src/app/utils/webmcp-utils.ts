/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unregisters a tool from the model context.
 * Falls back to unregistering by name if the object-based unregistration fails.
 */
export function unregisterTool(modelContext: any, tool: any) {
  try {
    modelContext.unregisterTool(tool);
  } catch (error) {
    // Legacy fallback: some Chrome versions still expect the tool name string.
    // TODO: Remove this once the API transition is complete.
    modelContext.unregisterTool(tool.name as any);
  }
}
