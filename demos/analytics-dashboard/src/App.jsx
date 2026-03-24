/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  VALID_STATUSES,
  VALID_METHODS,
  GROUP_BY_OPTIONS,
  MEASURE_OPTIONS,
  CHART_TYPE_OPTIONS,
  CHART_COLORS,
  DEFAULT_QUERY,
} from "./constants.js";
import { logDateToISO, aggregate } from "./utils.js";
import LineChart from "./components/LineChart.jsx";
import PromptsHelper from "./components/PromptsHelper.jsx";
import DataTable from "./components/DataTable.jsx";
import VerticalBarChart from "./components/VerticalBarChart.jsx";
import HorizontalBarChart from "./components/HorizontalBarChart.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import useWebMCPQueryTool from "./hooks/useWebMCPQueryTool.js";

/**
 * The main WebMCP Dashboard application component.
 * @returns {JSX.Element} The rendered dashboard.
 */
export default function WebMCPDashboard() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
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

  const [MOCK_RAW_LOGS, setMockRawLogs] = useState([]);

  useEffect(() => {
    fetch("./mockData.json")
      .then((r) => r.json())
      .then(setMockRawLogs);
  }, []);

  const data = useMemo(
    () =>
      MOCK_RAW_LOGS.filter((log) => {
        const statusMatch =
          statusFilter === "All" || log.status.toString() === statusFilter;
        const methodMatch =
          methodFilter === "All" || log.method === methodFilter;
        const pathMatch =
          pathSearch === "" ||
          log.path.toLowerCase().includes(pathSearch.toLowerCase());
        const isoDate = logDateToISO(log.timestamp);
        const dateMatch =
          (!dateFrom || isoDate >= dateFrom) && (!dateTo || isoDate <= dateTo);
        return statusMatch && methodMatch && pathMatch && dateMatch;
      }),
    [MOCK_RAW_LOGS, statusFilter, methodFilter, pathSearch, dateFrom, dateTo],
  );

  const aggregatedData = useMemo(
    () =>
      chartType === "table"
        ? []
        : aggregate(data, groupBy, measure, GROUP_BY_OPTIONS, MEASURE_OPTIONS),
    [data, groupBy, measure, chartType],
  );

  const maxValue = Math.max(...aggregatedData.map((d) => d.value), 1);

  const executeQuery = useCallback(
    async (params) => {
      const {
        status,
        method,
        pathSearch: ps,
        dateFrom: df,
        dateTo: dt,
        groupBy: gb,
        measure: ms,
        chartType: ct,
      } = params;

      if (status && !VALID_STATUSES.has(status))
        return {
          content: [
            {
              type: "text",
              text: `Error: status "${status}" is invalid. Options: ${[...VALID_STATUSES].join(", ")}`,
            },
          ],
        };
      if (method && !VALID_METHODS.has(method))
        return {
          content: [
            {
              type: "text",
              text: `Error: method "${method}" is invalid. Options: ${[...VALID_METHODS].join(", ")}`,
            },
          ],
        };
      if (!GROUP_BY_OPTIONS[gb])
        return {
          content: [
            {
              type: "text",
              text: `Error: groupBy "${gb}" is invalid. Options: ${Object.keys(GROUP_BY_OPTIONS).join(", ")}`,
            },
          ],
        };
      if (!MEASURE_OPTIONS[ms])
        return {
          content: [
            {
              type: "text",
              text: `Error: measure "${ms}" is invalid. Options: ${Object.keys(MEASURE_OPTIONS).join(", ")}`,
            },
          ],
        };
      if (!CHART_TYPE_OPTIONS[ct])
        return {
          content: [
            {
              type: "text",
              text: `Error: chartType "${ct}" is invalid. Options: ${Object.keys(CHART_TYPE_OPTIONS).join(", ")}`,
            },
          ],
        };

      const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
      if (df && !isoPattern.test(df))
        return {
          content: [
            {
              type: "text",
              text: `Error: dateFrom must be YYYY-MM-DD, got "${df}".`,
            },
          ],
        };
      if (dt && !isoPattern.test(dt))
        return {
          content: [
            {
              type: "text",
              text: `Error: dateTo must be YYYY-MM-DD, got "${dt}".`,
            },
          ],
        };

      setQuery({
        statusFilter: status || "All",
        methodFilter: method || "All",
        pathSearch: ps || "",
        dateFrom: df || "",
        dateTo: dt || "",
        groupBy: gb,
        measure: ms,
        chartType: ct,
      });

      const filters = [
        status ? `status=${status}` : null,
        method ? `method=${method}` : null,
        ps ? `path contains "${ps}"` : null,
        df || dt ? `date ${df || ""}–${dt || ""}` : null,
      ].filter(Boolean);

      const filterDesc = filters.length
        ? ` | filters: ${filters.join(", ")}`
        : "";
      const vizDesc = ct === "table" ? "table" : `${ms} by ${gb} as ${ct}`;

      // Wait for React to render the state update to the DOM
      // so the agent can see the updated UI before the execution completes
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        content: [
          { type: "text", text: `Query applied: ${vizDesc}${filterDesc}.` },
        ],
      };
    },
    [setQuery],
  );

  const executeQueryRef = useRef(executeQuery);

  useEffect(() => {
    executeQueryRef.current = executeQuery;
  }, [executeQuery]);

  useWebMCPQueryTool(executeQueryRef);

  const PAGE_SIZE = 50;
  const [tablePage, setTablePage] = useState(0);
  const [prevDataLen, setPrevDataLen] = useState(data.length);

  if (prevDataLen !== data.length) {
    setTablePage(0);
    setPrevDataLen(data.length);
  }

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const pagedData = data.slice(
    tablePage * PAGE_SIZE,
    (tablePage + 1) * PAGE_SIZE,
  );

  const fmtValue = MEASURE_OPTIONS[measure].fmt;
  const color = CHART_COLORS[measure];
  const chartTitle = `${MEASURE_OPTIONS[measure].label} by ${GROUP_BY_OPTIONS[groupBy].label}`;

  return (
    <div
      style={{
        padding: "1.5rem 2rem 2rem",
        fontFamily: "sans-serif",
        color: "var(--text-h)",
        textAlign: "left",
      }}
    >
      <div style={{ marginBottom: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.4rem",
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              Server Access Logs
            </h1>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "13px",
                color: "var(--text)",
              }}
            >
              WebMCP demo — AI agents control this dashboard via{" "}
              <code style={{ fontSize: "12px" }}>navigator.modelContext</code>
            </p>
          </div>
          <PromptsHelper />
        </div>
      </div>

      <ControlPanel
        query={query}
        setQuery={setQuery}
        dataLength={data.length}
        totalDataLength={MOCK_RAW_LOGS.length}
      />

      <div
        style={{
          border: "1px solid var(--border)",
          padding: "1.5rem 2rem",
          borderRadius: "8px",
          overflowX: "auto",
          background: "var(--bg)",
          color: "var(--text-h)",
        }}
      >
        {chartType === "table" ? (
          <DataTable
            pagedData={pagedData}
            tablePage={tablePage}
            totalPages={totalPages}
            setTablePage={setTablePage}
          />
        ) : chartType === "bar_vertical" ? (
          <VerticalBarChart
            data={aggregatedData}
            maxValue={maxValue}
            color={color}
            title={chartTitle}
            fmtValue={fmtValue}
          />
        ) : chartType === "line" ? (
          <LineChart
            data={aggregatedData}
            maxValue={maxValue}
            color={color}
            title={chartTitle}
            fmtValue={fmtValue}
          />
        ) : (
          <HorizontalBarChart
            data={aggregatedData}
            maxValue={maxValue}
            color={color}
            title={chartTitle}
            fmtValue={fmtValue}
          />
        )}
      </div>
    </div>
  );
}
