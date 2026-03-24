/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from "react";

/**
 * Registers the WebMCP query tool for server logs filtering and visualisation.
 * @param {React.MutableRefObject<function>} executeQueryRef - A mutable ref object holding the latest executeQuery callback.
 */
export default function useWebMCPQueryTool(executeQueryRef) {
  useEffect(() => {
    if (!window.navigator.modelContext) {
      console.warn("WebMCP not detected in this browser.");
      return;
    }

    navigator.modelContext.registerTool({
      name: "query",
      description: `Query the server logs. Sets all filters and visualization in one atomic call — every parameter is always applied together, so no stale state can carry over from a previous query.

FILTERS (all optional — omit or pass null to leave unfiltered):
  status     — HTTP status code: '200' | '201' | '301' | '304' | '401' | '403' | '404' | '500'
  method     — HTTP verb: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  pathSearch — substring matched against the request URL path, e.g. '/api'
  dateFrom   — start date inclusive, YYYY-MM-DD (resolve "last week", "yesterday", etc. before calling)
  dateTo     — end date inclusive, YYYY-MM-DD

AGGREGATION (required):
  groupBy — dimension to group by: 'date' | 'status' | 'method' | 'path' | 'country' | 'user_agent'
  measure — metric to compute:    'count' (requests) | 'bytes' (bandwidth) | 'unique_ips'

CHART (required):
  chartType — 'line' (trends over time, best with groupBy=date) | 'bar_vertical' | 'bar_horizontal' | 'table' (raw rows, groupBy/measure ignored)`,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "HTTP status filter. Omit for no filter.",
          },
          method: {
            type: "string",
            description: "HTTP method filter. Omit for no filter.",
          },
          pathSearch: {
            type: "string",
            description: "URL path substring filter. Omit for no filter.",
          },
          dateFrom: {
            type: "string",
            description: "Start date YYYY-MM-DD. Omit for no lower bound.",
          },
          dateTo: {
            type: "string",
            description: "End date YYYY-MM-DD. Omit for no upper bound.",
          },
          groupBy: {
            type: "string",
            enum: ["date", "status", "method", "path", "country", "user_agent"],
            description: "Dimension to group results by.",
          },
          measure: {
            type: "string",
            enum: ["count", "bytes", "unique_ips"],
            description: "Metric to compute: count (requests), bytes (bandwidth), or unique_ips.",
          },
          chartType: {
            type: "string",
            enum: ["line", "bar_vertical", "bar_horizontal", "table"],
            description: "Chart type. Use line for trends over time (best with groupBy=date). Use table for raw rows (groupBy/measure ignored).",
          },
        },
        required: ["groupBy", "measure", "chartType"],
      },
      execute: (params) => executeQueryRef.current(params),
    });

    return () => {
      navigator.modelContext.unregisterTool("query");
    };
  }, [executeQueryRef]);
}
