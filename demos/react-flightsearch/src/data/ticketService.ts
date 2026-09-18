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

export function getTickets(): SupportTicket[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const tickets = JSON.parse(raw) as SupportTicket[];
    if (!Array.isArray(tickets)) {
      return [];
    }

    // Always sort by most recent first
    return tickets.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
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

  const existing = getTickets();
  const updated = [ticket, ...existing];

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to save support ticket to localStorage:", err);
    }

    window.dispatchEvent(
      new CustomEvent("supportTicketsChanged", {
        detail: { tickets: updated, newTicket: ticket },
      }),
    );
  }

  return ticket;
}

export function deleteTicket(id: string): void {
  const existing = getTickets();
  const updated = existing.filter((t) => t.id !== id);

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to delete support ticket from localStorage:", err);
    }

    window.dispatchEvent(
      new CustomEvent("supportTicketsChanged", {
        detail: { tickets: updated, deletedTicketId: id },
      }),
    );
  }
}

export function clearTickets(): void {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Failed to clear support tickets from localStorage:", err);
    }

    window.dispatchEvent(
      new CustomEvent("supportTicketsChanged", {
        detail: { tickets: [] },
      }),
    );
  }
}
