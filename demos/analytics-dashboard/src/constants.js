/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { formatBytes } from "./utils.js";

/**
 * Set of valid HTTP status codes to filter by.
 * @type {Set<string>}
 */
export const VALID_STATUSES = new Set([
  "All",
  "200",
  "201",
  "301",
  "304",
  "401",
  "403",
  "404",
  "500",
]);

/**
 * Set of valid HTTP methods to filter by.
 * @type {Set<string>}
 */
export const VALID_METHODS = new Set([
  "All",
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]);

/**
 * Configuration options for grouping data.
 * @type {Object.<string, {label: string, key: function(Object): string}>}
 */
export const GROUP_BY_OPTIONS = {
  date: { label: "Date", key: (log) => log.timestamp.split(":")[0] },
  status: { label: "Status Code", key: (log) => log.status.toString() },
  method: { label: "Method", key: (log) => log.method },
  path: { label: "Path", key: (log) => log.path },
  country: { label: "Country", key: (log) => log.country },
  user_agent: { label: "User Agent", key: (log) => log.user_agent },
};

/**
 * Configuration options for the metrics to measure in the data.
 * @type {Object.<string, {label: string, fn: function|null, fmt: function}>}
 */
export const MEASURE_OPTIONS = {
  count: {
    label: "Requests",
    fn: (acc) => (acc || 0) + 1,
    fmt: (v) => v.toLocaleString(),
  },
  bytes: {
    label: "Bytes Transferred",
    fn: (acc, log) => (acc || 0) + log.bytes,
    fmt: formatBytes,
  },
  unique_ips: { label: "Unique IPs", fn: null, fmt: (v) => v.toLocaleString() }, // handled separately
};

/**
 * Available chart types mappings.
 * @type {Object.<string, string>}
 */
export const CHART_TYPE_OPTIONS = {
  bar_vertical: "Vertical Bars",
  bar_horizontal: "Horizontal Bars",
  line: "Line Chart",
  table: "Table",
};

/**
 * Colors used for rendering metrics in charts.
 * @type {Object.<string, string>}
 */
export const CHART_COLORS = {
  count: "#8b5cf6",
  bytes: "#f97316",
  unique_ips: "#3b82f6",
};

/**
 * Default state query parameters for the dashboard.
 * @type {Object}
 */
export const DEFAULT_QUERY = {
  statusFilter: "All",
  methodFilter: "All",
  pathSearch: "",
  dateFrom: "",
  dateTo: "",
  groupBy: "date",
  measure: "count",
  chartType: "bar_vertical",
};
