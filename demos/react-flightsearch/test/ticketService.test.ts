/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";

class MockLocalStorage {
  private store: Record<string, string> = {};
  public shouldFail: boolean = false;

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldFail) {
      throw new Error("QuotaExceededError: DOM Exception 22");
    }
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

const mockStorage = new MockLocalStorage();
const dispatchedEvents: any[] = [];

(globalThis as any).window = {
  localStorage: mockStorage,
  location: {
    href: "http://localhost:5173/#/results?origin=LON&destination=RIO",
    hash: "#/results?origin=LON&destination=RIO",
    pathname: "/",
    search: "",
  },
  dispatchEvent: (event: any) => {
    dispatchedEvents.push(event);
    return true;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, init: any = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "MockBrowser/1.0 WebMCP" },
  configurable: true,
});

// Import modules under test
const {
  getTickets,
  saveTicket,
  deleteTicket,
  clearTickets,
  getTicketCount,
  setContextualStateProvider,
} = await import("../src/data/ticketService.ts");

const {
  fileSupportTicket,
  fileSupportTicketTool,
  setCurrentFlights,
} = await import("../src/webmcp.ts");

test("fileSupportTicketTool schema and metadata", () => {
  assert.equal(fileSupportTicketTool.name, "fileSupportTicket");
  assert.ok(fileSupportTicketTool.description.includes("support ticket"));
  assert.ok(fileSupportTicketTool.description.includes("sensitive"));
  assert.ok(fileSupportTicketTool.description.includes("PII"));
  assert.deepEqual(fileSupportTicketTool.inputSchema.required, [
    "title",
    "body",
    "agentName",
  ]);
  assert.ok(fileSupportTicketTool.inputSchema.properties.title);
  assert.ok(fileSupportTicketTool.inputSchema.properties.body);
  assert.ok(fileSupportTicketTool.inputSchema.properties.agentName);
  assert.equal(fileSupportTicketTool.annotations.readOnlyHint, false);
});

test("fileSupportTicket validates required fields", async () => {
  await assert.rejects(
    () => fileSupportTicket({} as any),
    /title.*required/i,
  );

  await assert.rejects(
    () => fileSupportTicket({ title: "Valid Title" } as any),
    /body.*required/i,
  );

  await assert.rejects(
    () =>
      fileSupportTicket({ title: "Valid Title", body: "Valid Body" } as any),
    /agentName.*required/i,
  );
});

test("fileSupportTicket creates and persists ticket with ID, date, and current site context", async () => {
  clearTickets();
  dispatchedEvents.length = 0;
  mockStorage.shouldFail = false;

  setContextualStateProvider(() => ({
    searchParams: { origin: "LON", destination: "RIO" },
    activeFilters: { stops: [1] },
    suggestedTool: "filterByBaggage",
  }));

  setCurrentFlights([
    {
      id: 1,
      airline: "BA",
      airlineCode: "BA",
      origin: "LON",
      destination: "RIO",
      departureTime: "10:00",
      arrivalTime: "18:00",
      duration: "8h",
      stops: 0,
      price: 500,
    },
  ]);

  const result = await fileSupportTicket({
    title: "Filter by in-flight meal option missing",
    body: "User requested kosher meal options. The flight search tool does not provide meal preference filters.",
    agentName: "TravelAssistantBot",
  });

  assert.equal(result.success, true);
  assert.ok(result.ticketId.startsWith("ticket_"));
  assert.ok(result.message.includes(result.ticketId));

  const tickets = getTickets();
  assert.equal(tickets.length, 1);
  const ticket = tickets[0];
  assert.equal(ticket.id, result.ticketId);
  assert.equal(ticket.title, "Filter by in-flight meal option missing");
  assert.equal(ticket.agentName, "TravelAssistantBot");
  assert.ok(ticket.date);
  assert.ok(!isNaN(Date.parse(ticket.date)));

  // Verify current context was captured
  assert.ok(ticket.currentData);
  assert.equal(
    ticket.currentData.url,
    "http://localhost:5173/#/results?origin=LON&destination=RIO",
  );
  assert.equal(
    ticket.currentData.route,
    "#/results?origin=LON&destination=RIO",
  );
  assert.deepEqual(ticket.currentData.searchParams, {
    origin: "LON",
    destination: "RIO",
  });
  assert.equal(ticket.currentData.visibleFlightsCount, 1);
  assert.equal(ticket.currentData.suggestedTool, "filterByBaggage");
  assert.equal(ticket.currentData.userAgent, "MockBrowser/1.0 WebMCP");

  // Verify events dispatched
  const createdEvent = dispatchedEvents.find(
    (e) => e.type === "supportTicketCreated",
  );
  assert.ok(createdEvent);
  assert.equal(createdEvent.detail.ticket.id, ticket.id);

  const changedEvent = dispatchedEvents.find(
    (e) => e.type === "supportTicketsChanged",
  );
  assert.ok(changedEvent);
});

test("propagates error when local storage write fails", async () => {
  mockStorage.shouldFail = true;

  await assert.rejects(
    () =>
      fileSupportTicket({
        title: "Test quota failure",
        body: "Should fail to write",
        agentName: "AgentQuotaTest",
      }),
    /Failed to persist support ticket/i,
  );

  mockStorage.shouldFail = false;
});

test("tickets are sorted by most recent date", () => {
  clearTickets();

  const ticket1 = saveTicket({
    title: "Older ticket",
    body: "Issue from 1 hour ago",
    agentName: "Agent1",
  });
  // Artificially modify date to be older
  const raw = JSON.parse(mockStorage.getItem("support_tickets")!);
  raw[0].date = new Date(Date.now() - 3600000).toISOString();
  mockStorage.setItem("support_tickets", JSON.stringify(raw));

  const ticket2 = saveTicket({
    title: "Newer ticket",
    body: "Issue from just now",
    agentName: "Agent2",
  });

  const tickets = getTickets();
  assert.equal(tickets.length, 2);
  assert.equal(tickets[0].id, ticket2.id); // Most recent first
  assert.equal(tickets[1].id, ticket1.id);
});

test("delete individual ticket", () => {
  clearTickets();

  const t1 = saveTicket({ title: "T1", body: "B1", agentName: "A1" });
  const t2 = saveTicket({ title: "T2", body: "B2", agentName: "A2" });

  assert.equal(getTicketCount(), 2);
  deleteTicket(t1.id);

  const remaining = getTickets();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, t2.id);
  assert.equal(getTicketCount(), 1);
});

test("clear all tickets", () => {
  clearTickets();

  saveTicket({ title: "T1", body: "B1", agentName: "A1" });
  saveTicket({ title: "T2", body: "B2", agentName: "A2" });
  assert.equal(getTicketCount(), 2);

  clearTickets();
  assert.equal(getTicketCount(), 0);
  assert.deepEqual(getTickets(), []);
});

test("supports agent_name alias if provided by LLM", async () => {
  clearTickets();

  const result = await fileSupportTicket({
    title: "Seat selection not supported",
    body: "User wanted window seat. No seat map tool found.",
    agent_name: "SeatBot",
  } as any);

  assert.equal(result.success, true);
  const tickets = getTickets();
  assert.equal(tickets[0].agentName, "SeatBot");
});
