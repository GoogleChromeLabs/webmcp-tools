/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { SearchParams } from "../App";
import {
  registerFlightSearchTools,
  unregisterFlightSearchTools,
} from "../webmcp";
import "../App.css";

interface FlightSearchProps {
  searchParams: SearchParams;
  setSearchParams: (params: Partial<SearchParams>) => void;
}

export default function FlightSearch({
  searchParams,
  setSearchParams,
}: FlightSearchProps) {
  const navigate = useNavigate();
  const [completedRequestId, setCompletedRequestId] = React.useState<string | null>(null);

  useEffect(() => {
    if (completedRequestId) {
      window.dispatchEvent(
        new CustomEvent(`tool-completion-${completedRequestId}`),
      );
      setCompletedRequestId(null);
    }
  }, [completedRequestId]);

  useEffect(() => {
    const handleSearchFlights = (event: CustomEvent) => {
      const { requestId, ...params } = event.detail;
      const newSearchParams = new URLSearchParams();
      newSearchParams.append("origin", params.origin);
      newSearchParams.append("destination", params.destination);
      newSearchParams.append("tripType", params.tripType);
      newSearchParams.append("outboundDate", params.outboundDate);
      newSearchParams.append("inboundDate", params.inboundDate);
      newSearchParams.append("passengers", String(params.passengers));
      navigate(`/results?${newSearchParams.toString()}`);

      if (requestId) {
        setCompletedRequestId(requestId);
      }
    };

    window.addEventListener(
      "searchFlights",
      handleSearchFlights as EventListener,
    );
    registerFlightSearchTools();

    return () => {
      window.removeEventListener(
        "searchFlights",
        handleSearchFlights as EventListener,
      );
      unregisterFlightSearchTools();
    };
  }, [navigate]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const newSearchParams = new URLSearchParams();
    newSearchParams.append("origin", searchParams.origin);
    newSearchParams.append("destination", searchParams.destination);
    newSearchParams.append("tripType", searchParams.tripType);
    newSearchParams.append("outboundDate", searchParams.outboundDate);
    newSearchParams.append("inboundDate", searchParams.inboundDate);
    newSearchParams.append("passengers", String(searchParams.passengers));
    navigate(`/results?${newSearchParams.toString()}`);
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setSearchParams({
      [name]: name === "passengers" ? parseInt(value, 10) : value,
    });
  };

  return (
    <div className="app">
      <main className="app-main">
        <div className="search-form-container">
          <h1>Flight Search</h1>
          <form onSubmit={handleSubmit} className="flight-search-form">
            <div className="form-group">
              <label htmlFor="origin">Origin</label>
              <input
                type="text"
                id="origin"
                name="origin"
                placeholder="Origin city"
                value={searchParams.origin}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="destination">Destination</label>
              <input
                type="text"
                id="destination"
                name="destination"
                placeholder="Destination city"
                value={searchParams.destination}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="outboundDate">Outbound Date</label>
              <input
                type="date"
                id="outboundDate"
                name="outboundDate"
                value={searchParams.outboundDate}
                onChange={handleChange}
              />
            </div>
            {searchParams.tripType === "round-trip" && (
              <div className="form-group">
                <label htmlFor="inboundDate">Inbound Date</label>
                <input
                  type="date"
                  id="inboundDate"
                  name="inboundDate"
                  value={searchParams.inboundDate}
                  onChange={handleChange}
                />
              </div>
            )}
            <div className="form-group">
              <label>Trip Type</label>
              <div className="radio-group">
                <div>
                  <input
                    type="radio"
                    id="one-way"
                    name="tripType"
                    value="one-way"
                    checked={searchParams.tripType === "one-way"}
                    onChange={handleChange}
                  />
                  <label htmlFor="one-way">One-way</label>
                </div>
                <div>
                  <input
                    type="radio"
                    id="round-trip"
                    name="tripType"
                    value="round-trip"
                    checked={searchParams.tripType === "round-trip"}
                    onChange={handleChange}
                  />
                  <label htmlFor="round-trip">Round-trip</label>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="passengers">Number of Passengers</label>
              <input
                type="number"
                id="passengers"
                name="passengers"
                min="1"
                value={searchParams.passengers}
                onChange={handleChange}
              />
            </div>
            <button type="submit" className="search-flights-button">
              Search Flights
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
