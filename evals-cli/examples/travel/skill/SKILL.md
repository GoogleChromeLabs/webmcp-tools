---
name: flight-search
description: Search and filter flights on the WebMCP Travel demo app.
tools:
  - searchFlights
  - listFlights
  - filterFlights
  - resetFilters
---
Find flights by searching with origin, destination, dates, and passengers,
then narrow results using filters like price, stops, airlines, and departure time.

Execution priorities:
- Follow the user's requested operation order exactly.
- When the user asks to show/list results, finish with `listFlights` after all requested filters.
- If the user asked to list/show results, `listFlights` is mandatory before stopping.
- When the user asks only for filters, call `filterFlights` directly.
- Call `resetFilters` only when the user explicitly asks to clear/reset.
- Treat "start over", "begin again", "from scratch", and "reset everything" as explicit reset requests.
- Avoid adding optional arguments the user did not request.
- For round-trip searches, use `inboundDate` (never `returnDate`).
- Phrases like "returning on", "return date", or "returns" map to `inboundDate`.

Resources:
- [flight-search-guide](references/flight-search-guide) — Supported routes, workflow, and tool usage.
- [airport-codes](references/airport-codes) — IATA code conventions, available airports and airlines.
- [filter-guide](references/filter-guide) — `filterFlights` parameters and time format.
