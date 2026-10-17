/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { getTicketCount } from "../data/ticketService";

/**
 * Hook that keeps track of the number of support tickets,
 * synchronized across intra-window custom events and cross-tab storage events.
 */
export function useTicketCount(): number {
  const [ticketCount, setTicketCount] = useState(() => getTicketCount());

  useEffect(() => {
    const updateCount = () => setTicketCount(getTicketCount());

    window.addEventListener("supportTicketsChanged", updateCount);
    window.addEventListener("storage", updateCount);

    return () => {
      window.removeEventListener("supportTicketsChanged", updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, []);

  return ticketCount;
}
