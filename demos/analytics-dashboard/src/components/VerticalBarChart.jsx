/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Renders a vertical bar chart.
 * @param {Object} props - The component props.
 * @param {Array<{label: string, value: number}>} props.data - The data to visualize.
 * @param {number} props.maxValue - The maximum value for the y-axis scale.
 * @param {string} props.color - The color of the bars.
 * @param {string} props.title - The title of the chart.
 * @param {function(number): string} props.fmtValue - Formatter function for the bar values.
 * @returns {JSX.Element} The rendered VerticalBarChart component.
 */
export default function VerticalBarChart({
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "4px",
        }}
      >
        {data.length === 0 && <p>No data available</p>}
        {data.map(({ label, value }) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minWidth: "52px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                marginBottom: "5px",
                fontWeight: "bold",
              }}
            >
              {fmtValue(value)}
            </span>
            <div
              style={{
                height: `${Math.max(4, (value / maxValue) * 260)}px`,
                width: "100%",
                background: color,
                borderRadius: "4px 4px 0 0",
              }}
            />
            <span
              style={{
                fontSize: "10px",
                marginTop: "5px",
                color: "var(--text)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
