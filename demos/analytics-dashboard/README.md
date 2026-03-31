# WebMCP Analytics Dashboard

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/analytics-dashboard/

A React + Vite demo of **WebMCP** — a browser API (`navigator.modelContext`) that lets AI agents call semantic tools registered by the frontend, enabling bidirectional control of a web app without DOM scraping.

## Getting started

```bash
npm install
npm run dev
```

Requires Chrome Canary 140+ or a WebMCP-capable browser (HTTPS or localhost).

## How it works

The dashboard registers JavaScript functions as agent-callable tools via `navigator.modelContext.registerTool()`. Both the human (via UI controls) and an AI agent (via tools) can control the same state simultaneously and stay in sync.

### Registered tools

A single `query` tool handles everything atomically — filters, aggregation, and chart type are all set in one call so no stale state can carry over between queries.

| Parameter    | Type    | Description                                                              |
| ------------ | ------- | ------------------------------------------------------------------------ |
| `status`     | string? | HTTP status filter: `200` `201` `301` `304` `401` `403` `404` `500`      |
| `method`     | string? | HTTP method filter: `GET` `POST` `PUT` `DELETE` `PATCH` `HEAD` `OPTIONS` |
| `pathSearch` | string? | URL path substring filter                                                |
| `dateFrom`   | string? | Start date `YYYY-MM-DD` (relative terms resolved before calling)         |
| `dateTo`     | string? | End date `YYYY-MM-DD`                                                    |
| `groupBy`    | string  | `date` · `status` · `method` · `path` · `country` · `user_agent`         |
| `measure`    | string  | `count` · `bytes` · `unique_ips`                                         |
| `chartType`  | string  | `line` · `bar_vertical` · `bar_horizontal` · `table`                     |

### Visualization axes

The `query` tool takes three independent parameters for visualization:

- **`groupBy`** — `date` · `status` · `method` · `path` · `country` · `user_agent`
- **`measure`** — `count` · `bytes` · `unique_ips`
- **`chartType`** — `bar_vertical` · `bar_horizontal` · `line` · `table`

Any combination works without additional code.

## Example prompts

These can be typed to an AI agent connected to this dashboard via WebMCP:

**Ranked breakdowns**

- "Show me which pages are getting the most 404 errors"
- "What's the bandwidth usage broken down by country?"
- "Which user agents are sending the most POST requests?"
- "Which countries are making the most requests?"
- "How many unique IPs hit /admin?"
- "Show me request volume by HTTP method"

**Trends over time (line chart)**

- "Show me a line chart of daily requests over the past 3 months"
- "Is there a spike in 500 errors over time?"
- "How has bandwidth usage trended over the last year?"
- "Show unique visitors per day as a line chart"
- "Plot GET request volume over time"

**Filtered views**

- "How many unique visitors did we get each day last week?"
- "Show me bandwidth usage for GET requests only"
- "Show me all DELETE requests to /api as a table"

## License

[Apache-2.0](LICENSE)
