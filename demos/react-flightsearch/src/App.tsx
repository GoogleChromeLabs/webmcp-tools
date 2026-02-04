/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useSearchParams,
} from "react-router-dom";
import FlightSearch from "./components/FlightSearch";
import FlightResults from "./components/FlightResults";
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
    </Routes>
  );
}

const getBasename = () => {
  const path = window.location.pathname;
  // Check if the path ends with a known deep route.
  if (path.endsWith("/results")) {
    // If so, the basename is the part of the path before that route.
    const basename = path.slice(0, -"/results".length);
    // If the basename is empty, it means we are at the root.
    return basename || "/";
  }
  // Otherwise, the path itself is the basename. We need to remove any trailing slash
  // unless it's the root path itself.
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
};

export default function App() {
  return (
    <Router basename={getBasename()}>
      <AppContent />
    </Router>
  );
}
