/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useEffect } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  useSearchParams,
} from "react-router-dom";
import { useWebMCP } from "use-webmcp-tool";
import FlightSearch from "./components/FlightSearch";
import FlightResults from "./components/FlightResults";
import SupportTickets from "./components/SupportTickets";
import Toast from "./components/Toast";
import { fileSupportTicketTool } from "./webmcp";
import { setContextualStateProvider } from "./data/ticketService";
import "./App.css";

export interface SearchParams {
  origin: string;
  destination: string;
  tripType: string;
  outboundDate: string;
  inboundDate: string;
  passengers: number;
}

function AppContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ticketToast, setTicketToast] = useState("");

  // Register the fileSupportTicket WebMCP tool across the entire application
  useWebMCP(fileSupportTicketTool);

  const params = useMemo(
    () => ({
      origin: searchParams.get("origin") || "",
      destination: searchParams.get("destination") || "",
      tripType: searchParams.get("tripType") || "one-way",
      outboundDate:
        searchParams.get("outboundDate") ||
        new Date().toISOString().split("T")[0],
      inboundDate:
        searchParams.get("inboundDate") ||
        new Date(new Date().setDate(new Date().getDate() + 7))
          .toISOString()
          .split("T")[0],
      passengers: Number(searchParams.get("passengers")) || 1,
    }),
    [searchParams],
  );

  // Synchronize current search state for contextual ticket bug reports
  useEffect(() => {
    setContextualStateProvider(() => ({
      searchParams: {
        origin: params.origin,
        destination: params.destination,
        tripType: params.tripType,
        outboundDate: params.outboundDate,
        inboundDate: params.inboundDate,
        passengers: String(params.passengers),
      },
    }));
  }, [params]);

  // Listen for tickets created by agent to notify the user
  useEffect(() => {
    const handleTicketCreated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const ticket = customEvent.detail?.ticket;
      if (ticket) {
        setTicketToast(
          `AI Agent (${ticket.agentName}) filed a support ticket: "${ticket.title}"`,
        );
      }
    };

    window.addEventListener(
      "supportTicketCreated",
      handleTicketCreated as EventListener,
    );
    return () => {
      window.removeEventListener(
        "supportTicketCreated",
        handleTicketCreated as EventListener,
      );
    };
  }, []);

  const handleSetSearchParams = (newParams: Partial<SearchParams>) => {
    const updatedParams = { ...params, ...newParams };
    setSearchParams(
      {
        origin: updatedParams.origin,
        destination: updatedParams.destination,
        tripType: updatedParams.tripType,
        outboundDate: updatedParams.outboundDate,
        inboundDate: updatedParams.inboundDate,
        passengers: String(updatedParams.passengers),
      },
      { replace: true },
    );
  };

  return (
    <>
      {ticketToast && (
        <Toast message={ticketToast} onClose={() => setTicketToast("")} />
      )}
      <Routes>
        <Route
          path="/"
          element={
            <FlightSearch
              searchParams={params}
              setSearchParams={handleSetSearchParams}
            />
          }
        />
        <Route
          path="/results"
          element={
            <FlightResults
              searchParams={params}
              setSearchParams={handleSetSearchParams}
            />
          }
        />
        <Route path="/tickets" element={<SupportTickets />} />
      </Routes>
    </>
  );
}




export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
