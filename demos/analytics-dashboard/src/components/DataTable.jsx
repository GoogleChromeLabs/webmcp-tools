/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Renders a data table for displaying raw log entries.
 * @param {Object} props - The component props.
 * @param {Array<Object>} props.pagedData - The slice of log entries for the current page.
 * @param {number} props.tablePage - The current page index (0-based).
 * @param {number} props.totalPages - The total number of pages.
 * @param {function(number|function): void} props.setTablePage - The state setter for the page index.
 * @returns {JSX.Element} The rendered DataTable component.
 */
export default function DataTable({
  pagedData,
  tablePage,
  totalPages,
  setTablePage,
}) {
  return (
    <>
      <table
        width="100%"
        style={{
          textAlign: "left",
          borderCollapse: "collapse",
          fontSize: "14px",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)" }}>
            {[
              "Timestamp",
              "IP",
              "Geo",
              "Method",
              "Path",
              "Status",
              "Bytes",
              "Referrer",
              "User-Agent",
            ].map((h) => (
              <th key={h} style={{ padding: "8px" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pagedData.map((d) => (
            <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                {d.timestamp}
              </td>
              <td style={{ padding: "8px", fontFamily: "monospace" }}>
                {d.ip}
              </td>
              <td style={{ padding: "8px" }} title="Resolved via GeoIP">
                {d.country}
              </td>
              <td style={{ padding: "8px" }}>{d.method}</td>
              <td
                style={{
                  padding: "8px",
                  fontFamily: "monospace",
                  maxWidth: "150px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={d.path}
              >
                {d.path}
              </td>
              <td
                style={{
                  padding: "8px",
                  color: d.status >= 400 ? "#ef4444" : "#10b981",
                  fontWeight: "bold",
                }}
              >
                {d.status}
              </td>
              <td style={{ padding: "8px" }}>{d.bytes}</td>
              <td
                style={{
                  padding: "8px",
                  maxWidth: "120px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={d.referer}
              >
                {d.referer}
              </td>
              <td
                style={{
                  padding: "8px",
                  maxWidth: "120px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={d.user_agent}
              >
                {d.user_agent}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginTop: "1rem",
            fontSize: "13px",
          }}
        >
          <button
            onClick={() => setTablePage(0)}
            disabled={tablePage === 0}
            style={{
              padding: "4px 8px",
              cursor: tablePage === 0 ? "default" : "pointer",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--text-h)",
              opacity: tablePage === 0 ? 0.4 : 1,
            }}
          >
            «
          </button>
          <button
            onClick={() => setTablePage((p) => p - 1)}
            disabled={tablePage === 0}
            style={{
              padding: "4px 8px",
              cursor: tablePage === 0 ? "default" : "pointer",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--text-h)",
              opacity: tablePage === 0 ? 0.4 : 1,
            }}
          >
            ‹
          </button>
          <span style={{ color: "var(--text)" }}>
            Page {tablePage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setTablePage((p) => p + 1)}
            disabled={tablePage === totalPages - 1}
            style={{
              padding: "4px 8px",
              cursor: tablePage === totalPages - 1 ? "default" : "pointer",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--text-h)",
              opacity: tablePage === totalPages - 1 ? 0.4 : 1,
            }}
          >
            ›
          </button>
          <button
            onClick={() => setTablePage(totalPages - 1)}
            disabled={tablePage === totalPages - 1}
            style={{
              padding: "4px 8px",
              cursor: tablePage === totalPages - 1 ? "default" : "pointer",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--text-h)",
              opacity: tablePage === totalPages - 1 ? 0.4 : 1,
            }}
          >
            »
          </button>
        </div>
      )}
    </>
  );
}
