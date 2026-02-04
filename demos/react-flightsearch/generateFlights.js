/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const airlines = [
  { name: "Spirit Airlines", code: "NK" },
  { name: "Southwest Airlines", code: "WN" },
  { name: "American Airlines", code: "AA" },
  { name: "JetBlue Airways", code: "B6" },
  { name: "United Airlines", code: "UA" },
  { name: "Delta Air Lines", code: "DL" },
  { name: "Alaska Airlines", code: "AS" },
  { name: "Frontier Airlines", code: "F9" },
];
const originAirports = ["LHR", "LGW", "STN", "LTN"];
const destinationAirports = ["JFK", "LGA", "EWR"];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomTime() {
  const hour = String(Math.floor(Math.random() * 24)).padStart(2, "0");
  const minute = String(Math.floor(Math.random() * 60)).padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatDuration(departure, arrival) {
  const dep = new Date(`1970-01-01T${departure}:00`);
  const arr = new Date(`1970-01-01T${arrival}:00`);
  let diff = arr.getTime() - dep.getTime();
  if (diff < 0) {
    diff += 24 * 60 * 60 * 1000;
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

const flights = [];
for (let i = 7; i <= 106; i++) {
  const departureTime = getRandomTime();
  const arrivalTime = getRandomTime();
  const airline = getRandomElement(airlines);
  flights.push({
    id: i,
    airline: airline.name,
    airlineCode: airline.code,
    origin: getRandomElement(originAirports),
    destination: getRandomElement(destinationAirports),
    departureTime,
    arrivalTime,
    duration: formatDuration(departureTime, arrivalTime),
    stops: Math.floor(Math.random() * 3),
    price: Math.floor(Math.random() * 800) + 200,
  });
}

console.log(JSON.stringify(flights, null, 2));
