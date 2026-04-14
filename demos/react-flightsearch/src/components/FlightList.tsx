/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Flight } from "../data/flights";
import FlightCard from "./FlightCard";

interface FlightListProps {
  flights: Flight[];
  tripType: string;
  origin: string;
  destination: string;
}

export default function FlightList({ flights, tripType, origin, destination }: FlightListProps) {
  if (flights.length === 0) {
    return (
      <div className="flight-list">
        <h2>Flight Results</h2>
        <p className="no-results-message">
          No flights found for {origin} → {destination}. Try adjusting your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="flight-list">
      <h2>Flight Results</h2>
      {flights.map((flight) => (
        <FlightCard key={flight.id} flight={flight} tripType={tripType} />
      ))}
    </div>
  );
}
