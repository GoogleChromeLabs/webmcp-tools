/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Link } from "react-router-dom";
import type { SearchParams } from "../App";
import { useTicketCount } from "../hooks/useTicketCount";

interface HeaderProps {
  searchParams: SearchParams;
}

export default function Header({ searchParams }: HeaderProps) {
  const ticketCount = useTicketCount();


  return (
    <div className="header">
      <div className="search-inputs">
        <Link to="/" className="header-edit-search" title="Back to Search">
          ← Edit Search
        </Link>
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

      <div className="header-right-actions">
        <Link to="/tickets" className="header-tickets-btn">
          📋 Support Tickets {ticketCount > 0 && <span className="nav-badge">{ticketCount}</span>}
        </Link>
      </div>
    </div>
  );
}

