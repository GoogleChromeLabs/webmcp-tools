/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import Header from "./Header";
import Toast from "./Toast";
import FilterPanel from "./FilterPanel";
import type { SearchParams } from "../App";
import FlightList from "./FlightList";
import AppliedFilters from "./AppliedFilters";
import { flights, type Flight } from "../data/flights";
import {
  registerFlightResultsTools,
  unregisterFlightResultsTools,
} from "../webmcp";
import "../App.css";

interface Filters {
  stops: number[];
  airlines: string[];
  origins: string[];
  destinations: string[];
  minPrice: number;
  maxPrice: number;
  departureTime: number[];
  arrivalTime: number[];
  flightIds: number[];
}

interface FlightResultsProps {
  searchParams: SearchParams;
  setSearchParams: (params: Partial<SearchParams>) => void;
}

export default function FlightResults({
  searchParams,
  setSearchParams,
}: FlightResultsProps) {
  const [filteredFlights, setFilteredFlights] = useState<Flight[]>(flights);
  const [toastMessage, setToastMessage] = useState("");
  const [filters, setFilters] = useState<Filters>({
    stops: [],
    airlines: [],
    origins: [],
    destinations: [],
    minPrice: 0,
    maxPrice: 1000,
    departureTime: [0, 1439],
    arrivalTime: [0, 1439],
    flightIds: [],
  });
  const [completedRequestId, setCompletedRequestId] = useState<string | null>(
    null,
  );

  const handleFilterChange = useCallback((newFilters: Partial<Filters>) => {
    setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
  }, []);

  useEffect(() => {
    let updatedFlights = [...flights];

    if (filters.stops.length > 0) {
      updatedFlights = updatedFlights.filter((flight) =>
        filters.stops.includes(flight.stops),
      );
    }

    if (filters.airlines.length > 0) {
      updatedFlights = updatedFlights.filter((flight) =>
        filters.airlines.includes(flight.airlineCode),
      );
    }

    if (filters.origins.length > 0) {
      updatedFlights = updatedFlights.filter((flight) =>
        filters.origins.includes(flight.origin),
      );
    }

    if (filters.destinations.length > 0) {
      updatedFlights = updatedFlights.filter((flight) =>
        filters.destinations.includes(flight.destination),
      );
    }

    if (filters.flightIds.length > 0) {
      updatedFlights = updatedFlights.filter((flight) =>
        filters.flightIds.includes(flight.id),
      );
    }

    updatedFlights = updatedFlights.filter(
      (flight) =>
        flight.price >= filters.minPrice && flight.price <= filters.maxPrice,
    );

    const departureTimeInMinutes = (time: string) => {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes;
    };

    updatedFlights = updatedFlights.filter(
      (flight) =>
        departureTimeInMinutes(flight.departureTime) >=
          filters.departureTime[0] &&
        departureTimeInMinutes(flight.departureTime) <=
          filters.departureTime[1],
    );

    updatedFlights = updatedFlights.filter(
      (flight) =>
        departureTimeInMinutes(flight.arrivalTime) >= filters.arrivalTime[0] &&
        departureTimeInMinutes(flight.arrivalTime) <= filters.arrivalTime[1],
    );

    setFilteredFlights(updatedFlights);
  }, [searchParams, filters]);

  useEffect(() => {
    if (completedRequestId) {
      window.dispatchEvent(
        new CustomEvent(`tool-completion-${completedRequestId}`),
      );
      setCompletedRequestId(null);
    }
  }, [completedRequestId]);

  useEffect(() => {
    registerFlightResultsTools();

    const handleSetFilters = (event: CustomEvent) => {
      const defaultFilters = {
        stops: [],
        airlines: [],
        origins: [],
        destinations: [],
        minPrice: 0,
        maxPrice: 1000,
        departureTime: [0, 1439],
        arrivalTime: [0, 1439],
        flightIds: [],
      };

      const { requestId, ...filterData } = event.detail;
      handleFilterChange({ ...defaultFilters, ...filterData });

      if (requestId) {
        setCompletedRequestId(requestId);
      }
      setToastMessage("The filter settings were updated by an AI agent");
    };

    const handleResetFilters = (event: CustomEvent) => {
      const defaultFilters = {
        stops: [],
        airlines: [],
        origins: [],
        destinations: [],
        minPrice: 0,
        maxPrice: 1000,
        departureTime: [0, 1439],
        arrivalTime: [0, 1439],
        flightIds: [],
      };

      const { requestId } = event.detail || {};
      handleFilterChange(defaultFilters);

      if (requestId) {
        setCompletedRequestId(requestId);
      }
      setToastMessage("The filter settings were updated by an AI agent");
    };

    const handleSearchFlights = (event: CustomEvent<SearchParams>) => {
      setSearchParams(event.detail);
    };

    window.addEventListener("setFilters", handleSetFilters as EventListener);
    window.addEventListener("resetFilters", handleResetFilters as EventListener);
    window.addEventListener(
      "searchFlights",
      handleSearchFlights as EventListener,
    );

    return () => {
      unregisterFlightResultsTools();
      window.removeEventListener(
        "setFilters",
        handleSetFilters as EventListener,
      );
      window.removeEventListener(
        "resetFilters",
        handleResetFilters as EventListener,
      );
      window.removeEventListener(
        "searchFlights",
        handleSearchFlights as EventListener,
      );
    };
  }, [handleFilterChange, setSearchParams]);

  const isDemoQuery =
    searchParams.origin === "LON" &&
    searchParams.destination === "NYC" &&
    searchParams.tripType === "round-trip";

  return (
    <div className="app">
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage("")} />
      )}
      <Header searchParams={searchParams} />
      <main className="app-main">
        {isDemoQuery ? (
          <>
            <FilterPanel
              filters={filters}
              onFilterChange={handleFilterChange}
            />
            <div className="results-container">
              <AppliedFilters
                filters={filters}
                onFilterChange={handleFilterChange}
              />
              <FlightList flights={filteredFlights} />
            </div>
          </>
        ) : (
          <div className="no-results">
            <h2>No results found</h2>
            <p>
              The demo currently only supports the following query:
              <br />
              Origin: London, UK
              <br />
              Destination: New York, US
              <br />
              Trip Type: round-trip
              <br />
              Passengers: 2
            </p>
            <p>
              Your query:
              <br />
              Origin: {searchParams.origin}
              <br />
              Destination: {searchParams.destination}
              <br />
              Trip Type: {searchParams.tripType}
              <br />
              Outbound Date: {searchParams.outboundDate}
              <br />
              Inbound Date: {searchParams.inboundDate}
              <br />
              Passengers: {searchParams.passengers}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
