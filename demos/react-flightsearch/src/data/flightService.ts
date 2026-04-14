/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Flight } from "./flights";
import { resolveAirports } from "./cityToAirports";

const AIRLINES = [
  { name: "United Airlines", code: "UA" },
  { name: "Delta Air Lines", code: "DL" },
  { name: "American Airlines", code: "AA" },
  { name: "Southwest Airlines", code: "WN" },
  { name: "JetBlue Airways", code: "B6" },
  { name: "Spirit Airlines", code: "NK" },
  { name: "Alaska Airlines", code: "AS" },
  { name: "Frontier Airlines", code: "F9" },
  { name: "British Airways", code: "BA" },
  { name: "Lufthansa", code: "LH" },
  { name: "Air France", code: "AF" },
  { name: "Emirates", code: "EK" },
  { name: "Qatar Airways", code: "QR" },
  { name: "Singapore Airlines", code: "SQ" },
  { name: "Iberia", code: "IB" },
];

/** djb2 hash — deterministic, no external dependency */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

/** Xorshift32 seeded RNG — fast, simple, reproducible */
function createRng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    s = s & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function formatTime(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/**
 * Generates a deterministic set of mock flights for a given origin/destination
 * pair. Accepts city codes (e.g. "LON", "RIO") or bare airport codes (e.g.
 * "LHR"). The same input always produces the same output.
 */
export function getFlights(origin: string, destination: string): Flight[] {
  const originAirports = resolveAirports(origin);
  const destAirports = resolveAirports(destination);
  const result: Flight[] = [];
  let id = 1;

  for (const orig of originAirports) {
    for (const dest of destAirports) {
      if (orig === dest) continue;
      const seed = hashString(`${orig}-${dest}`);
      const rng = createRng(seed);
      // 3–6 flights per airport pair
      const count = 3 + Math.floor(rng() * 4);

      for (let i = 0; i < count; i++) {
        const airlineIdx = Math.floor(rng() * AIRLINES.length);
        const airline = AIRLINES[airlineIdx];
        const stops = Math.floor(rng() * 3); // 0, 1, or 2
        const departureMinutes = Math.floor(rng() * 1440);
        // Base flight time: 1h–14h, plus ~45 min per stop for layovers
        const baseDuration = 60 + Math.floor(rng() * 780);
        const layoverTime = stops * (30 + Math.floor(rng() * 60));
        const totalDuration = baseDuration + layoverTime;
        const arrivalMinutes = departureMinutes + totalDuration;
        const price = 100 + Math.floor(rng() * 1400);

        // Return leg — different seed offset so it varies independently
        const returnStops = Math.floor(rng() * 3);
        const returnDeparture = Math.floor(rng() * 1440);
        const returnBase = 60 + Math.floor(rng() * 780);
        const returnLayover = returnStops * (30 + Math.floor(rng() * 60));
        const returnTotal = returnBase + returnLayover;

        result.push({
          id: id++,
          airline: airline.name,
          airlineCode: airline.code,
          origin: orig,
          destination: dest,
          departureTime: formatTime(departureMinutes),
          arrivalTime: formatTime(arrivalMinutes),
          duration: formatDuration(totalDuration),
          stops,
          returnDepartureTime: formatTime(returnDeparture),
          returnArrivalTime: formatTime(returnDeparture + returnTotal),
          returnDuration: formatDuration(returnTotal),
          returnStops,
          price,
        });
      }
    }
  }

  return result;
}
