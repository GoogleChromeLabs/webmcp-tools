/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from "react";

const EXAMPLE_PROMPTS = [
  "Show me a table of all 401 failed authentication attempts.",
  "Plot a line chart of daily request volume over time.",
  "Which paths generate the most 500 server errors? Show a horizontal bar chart.",
  "Show me bandwidth consumption by country as a horizontal bar chart.",
  "Chart unique visitors per day as a line.",
  "Show GET vs POST request counts as a vertical bar chart.",
  "Show me a bar chart of request counts by status code.",
];

/**
 * Renders a helper component displaying example prompts for the AI agent.
 * @returns {JSX.Element} The rendered PromptsHelper component.
 */
export default function PromptsHelper() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);

  const copy = (text, i) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: "var(--text)",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          ▶
        </span>
        Example agent prompts
      </button>
      {open && (
        <ul
          style={{
            margin: "8px 0 0 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {EXAMPLE_PROMPTS.map((prompt, i) => (
            <li
              key={i}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <button
                onClick={() => copy(prompt, i)}
                title="Copy prompt"
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: "3px",
                  cursor: "pointer",
                  padding: "1px 6px",
                  fontSize: "11px",
                  color: "var(--text)",
                  flexShrink: 0,
                }}
              >
                {copied === i ? "✓" : "Copy"}
              </button>
              <span style={{ fontSize: "13px", color: "var(--text)" }}>
                {prompt}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
