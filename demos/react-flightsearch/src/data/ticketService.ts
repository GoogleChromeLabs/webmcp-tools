/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TicketSiteData {
  url: string;
  route: string;
  searchParams?: Record<string, string>;
  activeFilters?: Record<string, unknown>;
  visibleFlightsCount?: number;
  timestamp: number;
  userAgent: string;
  [key: string]: unknown;
}

export interface SupportTicket {
  id: string;
  date: string; // ISO 8601 string
  title: string;
  body: string;
  agentName: string;
  currentData: TicketSiteData;
}

export interface CreateTicketInput {
  title: string;
  body: string;
  agentName: string;
  currentData?: Partial<TicketSiteData>;
}

const STORAGE_KEY = "support_tickets";

// Context providers registered by the application UI
let contextualStateProvider: (() => Partial<TicketSiteData>) | null = null;

export function setContextualStateProvider(
  provider: (() => Partial<TicketSiteData>) | null,
): void {
  contextualStateProvider = provider;
}

export function getCurrentSiteData(): TicketSiteData {
  let route = "";
  let url = "";
  let searchParams: Record<string, string> = {};
  let userAgent = "";

  if (typeof window !== "undefined") {
    url = window.location.href;
    route = window.location.hash || window.location.pathname;

    const hashQuery = window.location.hash.includes("?")
      ? window.location.hash.split("?")[1]
      : "";
    const queryString = hashQuery || window.location.search.replace(/^\?/, "");
    if (queryString) {
      const urlParams = new URLSearchParams(queryString);
      searchParams = Object.fromEntries(urlParams.entries());
    }
  }

  if (typeof navigator !== "undefined") {
    userAgent = navigator.userAgent;
  }

  const extra = contextualStateProvider ? contextualStateProvider() : {};

  return {
    url,
    route,
    searchParams,
    timestamp: Date.now(),
    userAgent,
    ...extra,
  };
}

function getSafeLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch (err) {
    console.warn(
      "localStorage is inaccessible (e.g. sandboxed iframe or third-party storage blocked):",
      err,
    );
    return null;
  }
}

export function getTickets(): SupportTicket[] {
  try {
    const storage = getSafeLocalStorage();
    if (!storage) {
      return [];
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const tickets = JSON.parse(raw) as SupportTicket[];
    if (!Array.isArray(tickets)) {
      return [];
    }

    // Always sort by most recent first, with NaN-safe timestamp comparison
    return tickets.sort(
      (a, b) =>
        (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0),
    );
  } catch (err) {
    console.error("Failed to read support tickets from localStorage:", err);
    return [];
  }
}

export function getTicketCount(): number {
  return getTickets().length;
}

export function saveTicket(input: CreateTicketInput): SupportTicket {
  const currentSiteData = {
    ...getCurrentSiteData(),
    ...(input.currentData || {}),
  };

  const id = `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const date = new Date().toISOString();

  const ticket: SupportTicket = {
    id,
    date,
    title: input.title,
    body: input.body,
    agentName: input.agentName,
    currentData: currentSiteData,
  };

  const storage = getSafeLocalStorage();
  if (!storage) {
    throw new Error(
      "Cannot save support ticket: localStorage is inaccessible in this environment.",
    );
  }

  const existing = getTickets();
  const updated = [ticket, ...existing];

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save support ticket to localStorage:", err);
    throw new Error(
      `Failed to persist support ticket to local storage: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("supportTicketsChanged", {
        detail: { tickets: updated, newTicket: ticket },
      }),
    );
  }

  return ticket;
}

export function deleteTicket(id: string): void {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return;
  }

  const existing = getTickets();
  const updated = existing.filter((t) => t.id !== id);

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to delete support ticket from localStorage:", err);
    return;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("supportTicketsChanged", {
        detail: { tickets: updated, deletedTicketId: id },
      }),
    );
  }
}

export function clearTickets(): void {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear support tickets from localStorage:", err);
    return;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("supportTicketsChanged", {
        detail: { tickets: [] },
      }),
    );
  }
}

