/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Eval fixture: WebMCP tools for a customer support & issue tracking app, with deliberate issues to audit.
import { store } from "../store";

const controller = new AbortController();

export async function registerProjectTools(): Promise<void> {
  await document.modelContext.registerTool(
    {
      name: "switch_tab",
      description:
        "Switches the active dashboard tab. Use when the user wants to view Tickets, Bugs, or Settings.",
      inputSchema: {
        type: "object",
        properties: { tab: { type: "string", enum: ["tickets", "bugs", "settings"] } },
        required: ["tab"],
      },
      annotations: { readOnlyHint: true },
      async execute({ tab }) {
        store.setActiveTab(tab); // unmounts the current view, including unsaved reply drafts
        return `Switched to ${tab}.`;
      },
    },
    { signal: controller.signal },
  );

  await document.modelContext.registerTool(
    {
      name: "get_ticket",
      description:
        "Returns the body of a customer support ticket. Use when the user asks to read or summarize a ticket.",
      inputSchema: {
        type: "object",
        properties: { ticket_id: { type: "string" } },
        required: ["ticket_id"],
      },
      annotations: { readOnlyHint: true },
      async execute({ ticket_id }) {
        const ticket = await store.fetchTicket(ticket_id); // body is submitted by external customers
        return ticket.body;
      },
    },
    { signal: controller.signal },
  );

  await document.modelContext.registerTool(
    {
      name: "update_ticket_status_via_redux_controller",
      description:
        "Redux-backed mutation handler that dispatches to the internal Express REST controller to update ticket state (ticket_id string, status enum open|in_progress|resolved) and invalidate React Query cache.",
      inputSchema: {
        type: "object",
        properties: {
          ticket_id: { type: "string" },
          status: { type: "string", enum: ["open", "in_progress", "resolved"] },
        },
        required: ["ticket_id", "status"],
      },
      async execute({ ticket_id, status }) {
        const res = await fetch(`/api/tickets/${ticket_id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return "OK";
      },
    },
    { signal: controller.signal },
  );
}

export function unregisterProjectTools(): void {
  controller.abort();
}
