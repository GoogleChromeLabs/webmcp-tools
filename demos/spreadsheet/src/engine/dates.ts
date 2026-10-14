/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dates are serial numbers, as in other spreadsheets: whole days since 1899-12-30, with the
 * time of day as the fraction. All math runs in UTC so daylight saving never shifts a day.
 */

const DAY_MS = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Month and day overflow roll over, like DATE(2026, 13, 1) = 2027-01-01. */
export const dateSerial = (year: number, month: number, day: number): number =>
  Math.round((Date.UTC(year, month - 1, day) - EPOCH) / DAY_MS);

export const timeFraction = (hours: number, minutes: number, seconds = 0): number =>
  (hours * 3600 + minutes * 60 + seconds) / 86_400;

export interface DateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function dateParts(serial: number): DateParts {
  const date = new Date(EPOCH + Math.round((serial * DAY_MS) / 1000) * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
  };
}

/** True when year/month/day name a real calendar day (no rollover). */
export function isValidDate(year: number, month: number, day: number): boolean {
  const parts = dateParts(dateSerial(year, month, day));
  return parts.year === year && parts.month === month && parts.day === day;
}

export function todaySerial(now = new Date()): number {
  return dateSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function nowSerial(now = new Date()): number {
  return todaySerial(now) + timeFraction(now.getHours(), now.getMinutes(), now.getSeconds());
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function isoDate(serial: number): string {
  const { year, month, day } = dateParts(serial);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isoTime(serial: number): string {
  const { hours, minutes, seconds } = dateParts(serial);
  return `${pad(hours)}:${pad(minutes)}${seconds ? ":" + pad(seconds) : ""}`;
}
