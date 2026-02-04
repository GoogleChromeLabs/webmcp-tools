/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SearchParams } from "../App";

interface HeaderProps {
  searchParams: SearchParams;
}

export default function Header({ searchParams }: HeaderProps) {
  return (
    <div className="header">
      <div className="search-inputs">
        <div className="search-field">
          <span className="icon">📍</span>
          <span>{searchParams.origin}</span>
        </div>
        <div className="search-field">
          <span className="icon">✈️</span>
          <span>{searchParams.destination}</span>
        </div>
        <div className="search-field">
          <span className="icon">📅</span>
          <span>{searchParams.outboundDate}</span>
        </div>
        {searchParams.tripType === "round-trip" && (
          <div className="search-field">
            <span className="icon">📅</span>
            <span>{searchParams.inboundDate}</span>
          </div>
        )}
        <div className="search-field">
          <span className="icon">👤</span>
          <span>{searchParams.passengers} passengers</span>
        </div>
        <div className="search-field">
          <span>{searchParams.tripType}</span>
        </div>
      </div>
    </div>
  );
}
