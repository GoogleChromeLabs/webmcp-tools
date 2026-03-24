/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const SVG_W = 800,
  SVG_H = 260;
const PAD = { top: 20, right: 20, bottom: 52, left: 64 };
const CW = SVG_W - PAD.left - PAD.right;
const CH = SVG_H - PAD.top - PAD.bottom;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const MAX_X_LABELS = 14;

/**
 * Renders a line chart for the given data.
 * @param {Object} props - The component props.
 * @param {Array<{label: string, value: number}>} props.data - The data to visualize.
 * @param {number} props.maxValue - The maximum value for the y-axis scale.
 * @param {string} props.color - The color of the line and area fill.
 * @param {string} props.title - The title of the chart.
 * @param {function(number): string} props.fmtValue - Formatter function for the y-axis ticks.
 * @returns {JSX.Element} The rendered LineChart component.
 */
export default function LineChart({ data, maxValue, color, title, fmtValue }) {
  if (data.length === 0) return <p>No data available</p>;

  const n = data.length;
  const xOf = (i) => PAD.left + (n === 1 ? CW / 2 : (i / (n - 1)) * CW);
  const yOf = (v) => PAD.top + CH - (v / maxValue) * CH;

  const linePts = data.map((d, i) => `${xOf(i)},${yOf(d.value)}`).join(" ");
  const areaPts = `${xOf(0)},${PAD.top + CH} ${linePts} ${xOf(n - 1)},${PAD.top + CH}`;

  const labelStep = Math.ceil(n / MAX_X_LABELS);
  const showDots = n <= 90;

  return (
    <div>
      <p
        style={{
          margin: "0 0 12px",
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        {title}
      </p>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: "100%", display: "block" }}
      >
        {/* Y gridlines + labels */}
        {Y_TICKS.map((t) => {
          const v = maxValue * t;
          const y = yOf(v);
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                y1={y}
                x2={SVG_W - PAD.right}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text)"
              >
                {fmtValue(Math.round(v))}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <polygon points={areaPts} fill={color} fillOpacity="0.12" />

        {/* Line */}
        <polyline
          points={linePts}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Dots (only when few points) */}
        {showDots &&
          data.map((d, i) => (
            <circle
              key={d.label}
              cx={xOf(i)}
              cy={yOf(d.value)}
              r="3"
              fill={color}
            />
          ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null;
          const x = xOf(i);
          return (
            <text
              key={d.label}
              x={x}
              y={SVG_H - PAD.bottom + 14}
              textAnchor="end"
              fontSize="10"
              fill="var(--text)"
              transform={`rotate(-35 ${x} ${SVG_H - PAD.bottom + 14})`}
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
