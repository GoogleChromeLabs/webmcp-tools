/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Header from "./Header";
import Toast from "./Toast";
import FilterPanel from "./FilterPanel";
import type { SearchParams } from "../App";
import FlightList from "./FlightList";
import AppliedFilters from "./AppliedFilters";
import type { Flight } from "../data/flights";
import { getFlights } from "../data/flightService";
import {
  registerFlightResultsTools,
  setCurrentFlights,
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
  const routeFlights = useMemo(
    () => getFlights(searchParams.origin, searchParams.destination),
    [searchParams.origin, searchParams.destination],
  );

  const maxPriceBound = useMemo(
    () => Math.max(...routeFlights.map((f) => f.price), 1000),
    [routeFlights],
  );

  // Keep a ref so the tool event handlers (registered once) always see the
  // current max price without needing to re-register on every route change.
  const maxPriceBoundRef = useRef(maxPriceBound);
  useEffect(() => {
    maxPriceBoundRef.current = maxPriceBound;
  }, [maxPriceBound]);

  const [filteredFlights, setFilteredFlights] = useState<Flight[]>(routeFlights);
  const [toastMessage, setToastMessage] = useState("");
  const [filters, setFilters] = useState<Filters>({
    stops: [],
    airlines: [],
    origins: [],
    destinations: [],
    minPrice: 0,
    maxPrice: maxPriceBound,
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

  // Reset filters when the searched route changes
  useEffect(() => {
    setFilters({
      stops: [],
      airlines: [],
      origins: [],
      destinations: [],
      minPrice: 0,
      maxPrice: maxPriceBound,
      departureTime: [0, 1439],
      arrivalTime: [0, 1439],
      flightIds: [],
    });
  }, [maxPriceBound]);

  useEffect(() => {
    let updatedFlights = [...routeFlights];

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
    setCurrentFlights(updatedFlights);
  }, [routeFlights, filters]);

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
        maxPrice: maxPriceBoundRef.current,
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
        maxPrice: maxPriceBoundRef.current,
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

  return (
    <div className="app">
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage("")} />
      )}
      <Header searchParams={searchParams} />
      <main className="app-main">
        <FilterPanel
          flights={routeFlights}
          maxPriceBound={maxPriceBound}
          filters={filters}
          onFilterChange={handleFilterChange}
        />
        <div className="results-container">
          <AppliedFilters
            filters={filters}
            maxPriceBound={maxPriceBound}
            onFilterChange={handleFilterChange}
          />
          <FlightList
            flights={filteredFlights}
            tripType={searchParams.tripType}
            origin={searchParams.origin}
            destination={searchParams.destination}
          />
        </div>
      </main>
    </div>
  );
}
