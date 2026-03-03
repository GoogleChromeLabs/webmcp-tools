## IATA Code Conventions

- Use **city codes** when the user names a city (e.g., "LON" for London, "NYC" for New York)
- Use **airport codes** when the user names a specific airport (e.g., "JFK", "LHR")
- All codes must be exactly 3 uppercase letters
- `searchFlights` uses codes for `origin` and `destination`
- `filterFlights` uses codes for `origins` and `destinations` arrays
- The airport list below is representative, not exhaustive.

## Available Airports

| Code | Airport               | City       |
|------|-----------------------|------------|
| LHR  | London Heathrow       | London     |
| STN  | London Stansted       | London     |
| LGW  | London Gatwick        | London     |
| LTN  | London Luton          | London     |
| JFK  | New York JFK          | New York   |
| LGA  | New York LaGuardia    | New York   |
| EWR  | Newark Liberty        | New York   |

## Available Airlines

| Code | Airline              |
|------|----------------------|
| UA   | United Airlines      |
| DL   | Delta Air Lines      |
| AA   | American Airlines    |
| WN   | Southwest Airlines   |
| B6   | JetBlue Airways      |
| NK   | Spirit Airlines      |
| AS   | Alaska Airlines      |
| F9   | Frontier Airlines    |
