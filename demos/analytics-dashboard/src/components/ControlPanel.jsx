/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  GROUP_BY_OPTIONS,
  MEASURE_OPTIONS,
  CHART_TYPE_OPTIONS,
} from "../constants.js";

/**
 * Renders the control panel for filtering and visualization options.
 * @param {Object} props - The component props.
 * @param {Object} props.query - The current query state containing filters and chart options.
 * @param {function(function|Object): void} props.setQuery - State setter function for the query.
 * @param {number} props.dataLength - The current number of filtered log entries.
 * @param {number} props.totalDataLength - The total number of log entries available.
 * @returns {JSX.Element} The rendered ControlPanel component.
 */
export default function ControlPanel({
  query,
  setQuery,
  dataLength,
  totalDataLength,
}) {
  const {
    statusFilter,
    methodFilter,
    pathSearch,
    dateFrom,
    dateTo,
    groupBy,
    measure,
    chartType,
  } = query;

  const setFilter = (key, value) => setQuery((q) => ({ ...q, [key]: value }));
  const activeFilterCount =
    (statusFilter !== "All" ? 1 : 0) +
    (methodFilter !== "All" ? 1 : 0) +
    (pathSearch !== "" ? 1 : 0) +
    (dateFrom !== "" || dateTo !== "" ? 1 : 0);

  const inputStyle = {
    padding: "6px",
    marginLeft: "5px",
    borderRadius: "4px",
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text-h)",
  };

  const controlPanelStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "1rem 1.25rem",
    marginBottom: "1rem",
  };

  const sectionLabelStyle = {
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text)",
    marginBottom: "8px",
  };

  return (
    <div style={controlPanelStyle}>
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={sectionLabelStyle}>Filters</div>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label>
            Status:{" "}
            <select
              value={statusFilter}
              onChange={(e) => setFilter("statusFilter", e.target.value)}
              style={inputStyle}
            >
              <option value="All">All Statuses</option>
              <option value="200">200 (OK)</option>
              <option value="201">201 (Created)</option>
              <option value="301">301 (Moved)</option>
              <option value="304">304 (Not Modified)</option>
              <option value="401">401 (Unauthorized)</option>
              <option value="403">403 (Forbidden)</option>
              <option value="404">404 (Not Found)</option>
              <option value="500">500 (Server Error)</option>
            </select>
          </label>

          <label>
            Method:{" "}
            <select
              value={methodFilter}
              onChange={(e) => setFilter("methodFilter", e.target.value)}
              style={inputStyle}
            >
              <option value="All">All Methods</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
              <option value="HEAD">HEAD</option>
              <option value="OPTIONS">OPTIONS</option>
            </select>
          </label>

          <label>
            Path:{" "}
            <input
              type="text"
              value={pathSearch}
              onChange={(e) => setFilter("pathSearch", e.target.value)}
              placeholder="e.g. /api"
              style={{ ...inputStyle, width: "120px" }}
            />
          </label>

          <label>
            From:{" "}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
              style={inputStyle}
            />
          </label>

          <label>
            To:{" "}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setFilter("dateTo", e.target.value)}
              style={inputStyle}
            />
          </label>

          {activeFilterCount > 0 && (
            <button
              onClick={() =>
                setQuery((q) => ({
                  ...q,
                  statusFilter: "All",
                  methodFilter: "All",
                  pathSearch: "",
                  dateFrom: "",
                  dateTo: "",
                }))
              }
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "transparent",
                color: "var(--text-h)",
                fontSize: "12px",
              }}
            >
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          margin: "0 -1.25rem",
          padding: "0 1.25rem",
        }}
      />

      <div
        style={{
          marginTop: "0.75rem",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ ...sectionLabelStyle, marginBottom: 0 }}>
            Visualization
          </div>
          <label>
            Group by:{" "}
            <select
              value={groupBy}
              onChange={(e) => setFilter("groupBy", e.target.value)}
              disabled={chartType === "table"}
              style={inputStyle}
            >
              {Object.entries(GROUP_BY_OPTIONS).map(([k, { label }]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Measure:{" "}
            <select
              value={measure}
              onChange={(e) => setFilter("measure", e.target.value)}
              disabled={chartType === "table"}
              style={inputStyle}
            >
              {Object.entries(MEASURE_OPTIONS).map(([k, { label }]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Chart:{" "}
            <select
              value={chartType}
              onChange={(e) => setFilter("chartType", e.target.value)}
              style={inputStyle}
            >
              {Object.entries(CHART_TYPE_OPTIONS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span
          style={{
            fontSize: "13px",
            color: "var(--text)",
            whiteSpace: "nowrap",
          }}
        >
          {dataLength.toLocaleString()} / {totalDataLength.toLocaleString()}{" "}
          entries
        </span>
      </div>
    </div>
  );
}
