## filterFlights Parameters

`filterFlights` accepts any combination of these filters:

- **stops** — Array of stop counts (e.g., `[0]` for non-stop, `[0, 1]` for non-stop or one stop)
- **airlines** — Array of 2-letter IATA airline codes (e.g., `["B6", "DL"]`)
- **origins** — Array of 3-letter IATA origin airport codes (e.g., `["LHR", "STN"]`)
- **destinations** — Array of 3-letter IATA destination airport codes (e.g., `["JFK", "EWR"]`)
- **minPrice** / **maxPrice** — Price range in USD
- **departureTime** — Object with `min` and/or `max` in HH:MM format
- **arrivalTime** — Object with `min` and/or `max` in HH:MM format
- **flightIds** — Array of specific flight IDs

## Time Format

Times use HH:MM strings in 24-hour format. At least one of `min` or `max` must be provided.

## Argument Discipline

- Only include filter properties requested by the user.
- For time filters:
  - If the user gives only a lower bound, set only `min`.
  - If the user gives only an upper bound, set only `max`.
  - Set both only when the user gives a range.
- Do not invent extra bounds (for example, do not auto-add `max: "23:59"`).

| Time        | HH:MM |
|-------------|-------|
| 6:00 AM     | 06:00 |
| 9:00 AM     | 09:00 |
| 12:00 PM    | 12:00 |
| 3:00 PM     | 15:00 |
| 6:00 PM     | 18:00 |
| 11:59 PM    | 23:59 |

Examples:
- Morning flights: `{ "departureTime": { "min": "06:00", "max": "12:00" } }`
- After 3 PM: `{ "departureTime": { "min": "15:00" } }`
- Evening only: `{ "departureTime": { "min": "18:00" } }`
