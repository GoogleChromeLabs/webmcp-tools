/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getTickets,
  deleteTicket,
  clearTickets,
  saveTicket,
  type SupportTicket,
} from "../data/ticketService";
import "../App.css";

export default function SupportTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);

  const loadTickets = useCallback(() => {
    const list = getTickets();
    setTickets(list);
  }, []);

  useEffect(() => {
    loadTickets();

    const handleStorageUpdate = () => {
      loadTickets();
    };

    window.addEventListener("supportTicketsChanged", handleStorageUpdate);
    return () => {
      window.removeEventListener("supportTicketsChanged", handleStorageUpdate);
    };
  }, [loadTickets]);

  const handleRefresh = () => {
    loadTickets();
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 1200);
  };

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete ticket "${title}"?`)) {
      deleteTicket(id);
      loadTickets();
    }
  };

  const handleClearAll = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all support tickets? This action cannot be undone.",
      )
    ) {
      clearTickets();
      loadTickets();
    }
  };

  const handleCreateSampleTicket = () => {
    saveTicket({
      title: "Missing tool: filterByBaggageAllowance",
      agentName: "FlightSearchAgent-v1",
      body: "User asked: 'Show me flights with at least 1 free checked bag included'. The available WebMCP tools only support stops, airlines, origins, destinations, price, and departure/arrival times. Baggage policies are not exposed to the agent via any tool. Recommending adding a baggage allowance filter or tool to support baggage-specific queries.",
      currentData: {
        suggestedTool: "filterByBaggage",
      },
    });
    loadTickets();
  };

  const formatDate = (isoDate: string) => {
    try {
      const dateObj = new Date(isoDate);
      return dateObj.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return isoDate;
    }
  };

  const toggleContext = (id: string) => {
    setExpandedContextId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="app tickets-page">
      <header className="tickets-header">
        <div className="tickets-header-left">
          <Link to="/" className="back-link">
            ← Back to Flights
          </Link>
          <div className="tickets-title-wrap">
            <h1>Agent Support Tickets</h1>
            <span className="tickets-badge">
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </span>
          </div>
          <p className="tickets-subtitle">
            Issues and capability gaps filed autonomously by AI agents via the{" "}
            <code>fileSupportTicket</code> WebMCP tool.
          </p>
        </div>

        <div className="tickets-actions">
          <button
            type="button"
            className={`btn-action btn-refresh ${justRefreshed ? "refreshed" : ""}`}
            onClick={handleRefresh}
            title="Refresh ticket list"
          >
            🔄 {justRefreshed ? "Refreshed!" : "Refresh"}
          </button>

          {tickets.length > 0 && (
            <button
              type="button"
              className="btn-action btn-clear-all"
              onClick={handleClearAll}
              title="Clear all tickets"
            >
              🗑️ Clear All
            </button>
          )}
        </div>
      </header>

      <main className="tickets-main">
        {tickets.length === 0 ? (
          <div className="tickets-empty-state">
            <div className="empty-icon">📋</div>
            <h2>No Support Tickets Found</h2>
            <p>
              When an AI agent is unable to find the tools it needs to complete a
              task, or when existing tools exhibit unexpected behavior, it files
              a support ticket in the background using WebMCP.
            </p>
            <p className="empty-hint">
              All tickets are saved with title, reproduction body, agent name,
              timestamp, and current site context with sensitive information
              redacted.
            </p>
            <button
              type="button"
              className="btn-action btn-sample"
              onClick={handleCreateSampleTicket}
            >
              + Create Sample Agent Ticket
            </button>
          </div>
        ) : (
          <div className="tickets-list">
            {tickets.map((ticket) => {
              const isContextExpanded = expandedContextId === ticket.id;
              const hasContext =
                ticket.currentData && Object.keys(ticket.currentData).length > 0;

              return (
                <article key={ticket.id} className="ticket-card">
                  <div className="ticket-card-header">
                    <div className="ticket-card-meta">
                      <div className="ticket-title-row">
                        <h2 className="ticket-title">{ticket.title}</h2>
                        <span className="ticket-id-tag">#{ticket.id}</span>
                      </div>
                      <div className="ticket-info-row">
                        <span className="ticket-agent-badge">
                          🤖 {ticket.agentName}
                        </span>
                        <span className="ticket-date">
                          🕒 {formatDate(ticket.date)}
                        </span>
                        <span className="ticket-privacy-pill" title="Prioritizes privacy over completeness">
                          🔒 Sanitized (No PII)
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-delete-ticket"
                      onClick={() => handleDelete(ticket.id, ticket.title)}
                      title="Delete this ticket"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="ticket-body">
                    <h3>Reproduction & Details:</h3>
                    <p className="ticket-body-text">{ticket.body}</p>
                  </div>

                  {hasContext && (
                    <div className="ticket-context-section">
                      <button
                        type="button"
                        className="btn-toggle-context"
                        onClick={() => toggleContext(ticket.id)}
                      >
                        {isContextExpanded
                          ? "▼ Hide Environment & Current Data"
                          : "▶ Show Environment & Current Data"}
                      </button>

                      {isContextExpanded && (
                        <div className="ticket-context-details">
                          <div className="context-grid">
                            <div className="context-item">
                              <span className="context-label">Route / Hash:</span>
                              <code className="context-value">
                                {ticket.currentData.route || "N/A"}
                              </code>
                            </div>
                            <div className="context-item">
                              <span className="context-label">Full URL:</span>
                              <code className="context-value">
                                {ticket.currentData.url || "N/A"}
                              </code>
                            </div>
                            <div className="context-item">
                              <span className="context-label">Timestamp:</span>
                              <span className="context-value">
                                {ticket.date}
                              </span>
                            </div>
                            {ticket.currentData.visibleFlightsCount !== undefined && (
                              <div className="context-item">
                                <span className="context-label">
                                  Visible Flights:
                                </span>
                                <span className="context-value">
                                  {ticket.currentData.visibleFlightsCount}
                                </span>
                              </div>
                            )}
                            {ticket.currentData.searchParams &&
                              Object.keys(ticket.currentData.searchParams).length > 0 && (
                                <div className="context-item full-width">
                                  <span className="context-label">
                                    Search Parameters:
                                  </span>
                                  <pre className="context-json">
                                    {JSON.stringify(
                                      ticket.currentData.searchParams,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                            {ticket.currentData.userAgent && (
                              <div className="context-item full-width">
                                <span className="context-label">User Agent:</span>
                                <span className="context-value context-ua">
                                  {ticket.currentData.userAgent}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
