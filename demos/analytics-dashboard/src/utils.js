/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Map of month abbreviations to their 2-digit numerical representations.
 * @type {Object.<string, string>}
 */
export const MONTH_MAP = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/**
 * Converts a log timestamp to an ISO date string (YYYY-MM-DD).
 * @param {string} timestamp - The timestamp string from the log.
 * @returns {string} The formatted ISO date string.
 */
export function logDateToISO(timestamp) {
  const [day, mon, year] = timestamp.split(":")[0].split("/");
  return `${year}-${MONTH_MAP[mon]}-${day.padStart(2, "0")}`;
}

/**
 * Formats a number of bytes into a human-readable string (B, KB, MB).
 * @param {number} v - The number of bytes to format.
 * @returns {string} The formatted byte string.
 */
export function formatBytes(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} MB`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} KB`;
  return `${v} B`;
}

/**
 * Aggregates log data based on grouping and measure criteria.
 * @param {Array<Object>} data - The log data array to aggregate.
 * @param {string} groupBy - The dimension to group by.
 * @param {string} measure - The metric to compute.
 * @param {Object} GROUP_BY_OPTIONS - The available group by options configuration.
 * @param {Object} MEASURE_OPTIONS - The available measure options configuration.
 * @returns {Array<{label: string, value: number}>} The sorted, aggregated data.
 */
export function aggregate(
  data,
  groupBy,
  measure,
  GROUP_BY_OPTIONS,
  MEASURE_OPTIONS,
) {
  const keyFn = GROUP_BY_OPTIONS[groupBy].key;

  if (measure === "unique_ips") {
    const groups = {};
    for (const log of data) {
      const k = keyFn(log);
      if (!groups[k]) groups[k] = new Set();
      groups[k].add(log.ip);
    }
    return sortEntries(
      Object.entries(groups).map(([label, set]) => ({
        label,
        value: set.size,
      })),
      groupBy,
    );
  }

  const accFn = MEASURE_OPTIONS[measure].fn;
  const groups = {};
  for (const log of data) {
    const k = keyFn(log);
    groups[k] = accFn(groups[k], log);
  }
  return sortEntries(
    Object.entries(groups).map(([label, value]) => ({ label, value })),
    groupBy,
  );
}

/**
 * Sorts aggregated data entries based on the group by dimension.
 * Data grouped by 'date' remains chronological, others sort by value descending.
 * @param {Array<{label: string, value: number}>} entries - The aggregated data entries.
 * @param {string} groupBy - The dimension used for grouping.
 * @returns {Array<{label: string, value: number}>} The sorted entries.
 */
export function sortEntries(entries, groupBy) {
  // Date groups stay chronological; everything else sorts by value descending
  if (groupBy === "date")
    return entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries.sort((a, b) => b.value - a.value);
}
