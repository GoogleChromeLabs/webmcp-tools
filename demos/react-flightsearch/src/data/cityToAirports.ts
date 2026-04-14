/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maps IATA city codes to their constituent airport codes.
 * If a user types a city code (e.g. "RIO"), it resolves to all airports
 * serving that city (e.g. ["GIG", "SDU"]). Bare airport codes (e.g. "GIG")
 * fall through via resolveAirports() and are used as-is.
 */
export const cityToAirports: Record<string, string[]> = {
  // North America
  NYC: ["JFK", "LGA", "EWR"],
  LAX: ["LAX"],
  CHI: ["ORD", "MDW"],
  SFO: ["SFO", "OAK", "SJC"],
  MIA: ["MIA", "FLL"],
  DFW: ["DFW", "DAL"],
  BOS: ["BOS"],
  SEA: ["SEA"],
  ATL: ["ATL"],
  DEN: ["DEN"],
  LAS: ["LAS"],
  PHX: ["PHX"],
  WAS: ["IAD", "DCA", "BWI"],
  YTO: ["YYZ", "YTZ"],
  YMQ: ["YUL"],
  YVR: ["YVR"],
  // Europe
  LON: ["LHR", "LGW", "STN", "LTN", "LCY"],
  PAR: ["CDG", "ORY"],
  AMS: ["AMS"],
  FRA: ["FRA"],
  MAD: ["MAD"],
  BCN: ["BCN"],
  ROM: ["FCO", "CIA"],
  MIL: ["MXP", "LIN", "BGY"],
  ZRH: ["ZRH"],
  VIE: ["VIE"],
  BRU: ["BRU"],
  LIS: ["LIS"],
  CPH: ["CPH"],
  OSL: ["OSL"],
  ARN: ["ARN"],
  HEL: ["HEL"],
  DUB: ["DUB"],
  ATH: ["ATH"],
  IST: ["IST", "SAW"],
  // Asia-Pacific
  TYO: ["NRT", "HND"],
  PEK: ["PEK"],
  SHA: ["PVG", "SHA"],
  HKG: ["HKG"],
  SIN: ["SIN"],
  BKK: ["BKK", "DMK"],
  KUL: ["KUL"],
  SYD: ["SYD"],
  MEL: ["MEL"],
  DEL: ["DEL"],
  BOM: ["BOM"],
  DXB: ["DXB"],
  // Latin America
  RIO: ["GIG", "SDU"],
  SAO: ["GRU", "CGH"],
  BOG: ["BOG"],
  LIM: ["LIM"],
  SCL: ["SCL"],
  MEX: ["MEX"],
  BUE: ["EZE", "AEP"],
  // Africa
  JNB: ["JNB"],
  CAI: ["CAI"],
  NBO: ["NBO"],
  CPT: ["CPT"],
};

export const cityNames: Record<string, string> = {
  NYC: "New York",
  LAX: "Los Angeles",
  CHI: "Chicago",
  SFO: "San Francisco",
  MIA: "Miami",
  DFW: "Dallas",
  BOS: "Boston",
  SEA: "Seattle",
  ATL: "Atlanta",
  DEN: "Denver",
  LAS: "Las Vegas",
  PHX: "Phoenix",
  WAS: "Washington DC",
  YTO: "Toronto",
  YMQ: "Montreal",
  YVR: "Vancouver",
  LON: "London",
  PAR: "Paris",
  AMS: "Amsterdam",
  FRA: "Frankfurt",
  MAD: "Madrid",
  BCN: "Barcelona",
  ROM: "Rome",
  MIL: "Milan",
  ZRH: "Zurich",
  VIE: "Vienna",
  BRU: "Brussels",
  LIS: "Lisbon",
  CPH: "Copenhagen",
  OSL: "Oslo",
  ARN: "Stockholm",
  HEL: "Helsinki",
  DUB: "Dublin",
  ATH: "Athens",
  IST: "Istanbul",
  TYO: "Tokyo",
  PEK: "Beijing",
  SHA: "Shanghai",
  HKG: "Hong Kong",
  SIN: "Singapore",
  BKK: "Bangkok",
  KUL: "Kuala Lumpur",
  SYD: "Sydney",
  MEL: "Melbourne",
  DEL: "Delhi",
  BOM: "Mumbai",
  DXB: "Dubai",
  RIO: "Rio de Janeiro",
  SAO: "São Paulo",
  BOG: "Bogotá",
  LIM: "Lima",
  SCL: "Santiago",
  MEX: "Mexico City",
  BUE: "Buenos Aires",
  JNB: "Johannesburg",
  CAI: "Cairo",
  NBO: "Nairobi",
  CPT: "Cape Town",
};

/**
 * Resolves a city or airport IATA code to its constituent airport codes.
 * City codes (e.g. "LON") expand to multiple airports; airport codes (e.g. "LHR")
 * are returned as-is.
 */
export function resolveAirports(code: string): string[] {
  const upper = code.toUpperCase();
  return cityToAirports[upper] ?? [upper];
}
