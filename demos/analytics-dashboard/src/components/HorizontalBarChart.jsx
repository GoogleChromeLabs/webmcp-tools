/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Renders a horizontal bar chart.
 * @param {Object} props - The component props.
 * @param {Array<{label: string, value: number}>} props.data - The data to visualize.
 * @param {number} props.maxValue - The maximum value for the x-axis scale.
 * @param {string} props.color - The color of the bars.
 * @param {string} props.title - The title of the chart.
 * @param {function(number): string} props.fmtValue - Formatter function for the bar values.
 * @returns {JSX.Element} The rendered HorizontalBarChart component.
 */
export default function HorizontalBarChart({
  data,
  maxValue,
  color,
  title,
  fmtValue,
}) {
  return (
    <div>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        {title}
      </p>
      {data.length === 0 && <p>No data available</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {data.slice(0, 20).map(({ label, value }) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "12px",
                width: "220px",
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={label}
            >
              {label}
            </span>
            <div
              style={{
                flex: 1,
                background: "var(--border)",
                borderRadius: "4px",
                height: "20px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(value / maxValue) * 100}%`,
                  height: "100%",
                  background: color,
                  borderRadius: "4px",
                  minWidth: "2px",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "13px",
                width: "70px",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {fmtValue(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
