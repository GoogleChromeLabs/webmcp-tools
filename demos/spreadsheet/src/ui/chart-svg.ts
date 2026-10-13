/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Draws charts as SVG. Series colors are CSS custom properties, so charts follow light and dark mode. */
import type { ChartData } from "../model/charts.ts";
import type { ChartType } from "../model/workbook.ts";
import { svg } from "./dom.ts";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const color = (index: number) => `var(--series-${index % 8})`;
const clip = (text: string, max = 12) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const CHART_LABELS: Record<ChartType, string> = {
  column: "Column",
  bar: "Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  scatter: "Scatter",
};

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Smallest and largest value, without spreading a big array into Math.min. */
function bounds(values: number[]): [number, number] {
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of values) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  return [lo, hi];
}

/** Round axis bounds and a step of 1, 2, 2.5 or 5 times a power of ten. */
function niceScale(min: number, max: number): { min: number; max: number; step: number } {
  if (min === max) [min, max] = min === 0 ? [0, 1] : [Math.min(0, min), Math.max(0, max)];
  const raw = (max - min) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

const titled = <T extends SVGElement>(element: T, text: string): T => {
  element.append(svg("title", {}, text));
  return element;
};

function legend(names: string[], width: number, y: number): SVGGElement {
  const items = names.slice(0, 8).map((name) => clip(name, 16));
  const widths = items.map((name) => 18 + name.length * 6.5);
  const total = widths.reduce((a, b) => a + b, 0) + (items.length - 1) * 12;
  let x = Math.max(8, (width - total) / 2);
  const group = svg("g", { class: "chart-legend" });
  items.forEach((name, i) => {
    group.append(
      svg("rect", { x, y: y - 9, width: 10, height: 10, rx: 2, fill: color(i) }),
      svg("text", { x: x + 15, y }, name),
    );
    x += widths[i] + 12;
  });
  return group;
}

function pie(root: SVGSVGElement, data: ChartData, area: Box): void {
  const values = data.series[0].values.map((v) => Math.max(0, v ?? 0));
  const total = values.reduce((a, b) => a + b, 0);
  const [cx, cy] = [(area.left + area.right) / 2, (area.top + area.bottom) / 2];
  const r = Math.max(10, Math.min(area.right - area.left, area.bottom - area.top) / 2 - 4);
  let angle = -Math.PI / 2;
  values.forEach((value, i) => {
    if (!value) return;
    const share = value / total;
    const tip = `${data.categories[i]}: ${full.format(value)} (${percent.format(share)})`;
    if (share >= 0.9999) {
      root.append(titled(svg("circle", { cx, cy, r, fill: color(i) }), tip));
      return;
    }
    const end = angle + share * 2 * Math.PI;
    const point = (a: number, radius = r) =>
      `${cx + radius * Math.cos(a)} ${cy + radius * Math.sin(a)}`;
    const d = `M${cx} ${cy}L${point(angle)}A${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${point(end)}Z`;
    root.append(titled(svg("path", { d, fill: color(i), class: "slice" }), tip));
    if (share >= 0.06) {
      const [x, y] = point((angle + end) / 2, r * 0.62).split(" ");
      root.append(
        svg(
          "text",
          { x, y, class: "slice-label", "text-anchor": "middle", "dominant-baseline": "middle" },
          percent.format(share),
        ),
      );
    }
    angle = end;
  });
}

function cartesian(root: SVGSVGElement, type: ChartType, data: ChartData, area: Box): void {
  const horizontal = type === "bar";
  const values = data.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const startAtZero = type === "column" || type === "bar" || type === "area";
  const [lo, hi] = bounds(values);
  const scale = niceScale(startAtZero ? Math.min(0, lo) : lo, startAtZero ? Math.max(0, hi) : hi);
  const plot: Box = {
    left: area.left + (horizontal ? 76 : 44),
    top: area.top + 4,
    right: area.right - 8,
    bottom: area.bottom - 20,
  };
  const span = (v: number) => (v - scale.min) / (scale.max - scale.min);
  const valuePos = (v: number) =>
    horizontal
      ? plot.left + span(v) * (plot.right - plot.left)
      : plot.bottom - span(v) * (plot.bottom - plot.top);
  // Scatter puts numbers on both axes; the others share one category axis.
  const xs = data.categories.map(Number);
  const numericX = type === "scatter" && xs.every((x) => Number.isFinite(x));
  const xScale = numericX ? niceScale(...bounds(xs)) : null;
  const n = data.categories.length;
  const band =
    ((horizontal ? plot.bottom - plot.top : plot.right - plot.left) || 1) / Math.max(1, n);
  const categoryPos = (i: number) =>
    xScale
      ? plot.left + ((xs[i] - xScale.min) / (xScale.max - xScale.min)) * (plot.right - plot.left)
      : (horizontal ? plot.top : plot.left) + band * (i + 0.5);

  for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) {
    const p = valuePos(v);
    root.append(
      horizontal
        ? svg("line", { x1: p, x2: p, y1: plot.top, y2: plot.bottom, class: "chart-grid" })
        : svg("line", { x1: plot.left, x2: plot.right, y1: p, y2: p, class: "chart-grid" }),
      horizontal
        ? svg(
            "text",
            { x: p, y: plot.bottom + 14, "text-anchor": "middle", class: "chart-axis" },
            compact.format(v),
          )
        : svg(
            "text",
            { x: plot.left - 6, y: p + 4, "text-anchor": "end", class: "chart-axis" },
            compact.format(v),
          ),
    );
  }
  const every = Math.max(1, Math.ceil((horizontal ? 16 : 58) / band));
  data.categories.forEach((label, i) => {
    if (xScale || i % every) return;
    const p = categoryPos(i);
    root.append(
      horizontal
        ? svg(
            "text",
            { x: plot.left - 6, y: p + 4, "text-anchor": "end", class: "chart-axis" },
            clip(label),
          )
        : svg(
            "text",
            { x: p, y: plot.bottom + 14, "text-anchor": "middle", class: "chart-axis" },
            clip(label, 10),
          ),
    );
  });
  if (xScale)
    for (let v = xScale.min; v <= xScale.max + xScale.step / 2; v += xScale.step) {
      const p =
        plot.left + ((v - xScale.min) / (xScale.max - xScale.min)) * (plot.right - plot.left);
      root.append(
        svg(
          "text",
          { x: p, y: plot.bottom + 14, "text-anchor": "middle", class: "chart-axis" },
          compact.format(v),
        ),
      );
    }

  const zero = valuePos(Math.min(Math.max(0, scale.min), scale.max));
  data.series.forEach((series, s) => {
    const tip = (i: number, v: number) =>
      `${data.categories[i]} · ${series.name}: ${full.format(v)}`;
    if (type === "column" || type === "bar") {
      const thickness = (band * 0.8) / data.series.length;
      series.values.forEach((v, i) => {
        if (v === null) return;
        const offset = categoryPos(i) - band * 0.4 + thickness * s;
        const [a, b] = [valuePos(v), zero];
        const rect = horizontal
          ? { x: Math.min(a, b), y: offset, width: Math.abs(a - b), height: thickness * 0.92 }
          : { x: offset, y: Math.min(a, b), width: thickness * 0.92, height: Math.abs(a - b) };
        root.append(
          titled(svg("rect", { ...rect, rx: 2, fill: color(s), class: "bar" }), tip(i, v)),
        );
      });
      return;
    }
    const points = series.values.map((v, i) =>
      v === null ? null : ([categoryPos(i), valuePos(v)] as const),
    );
    if (type !== "scatter") {
      const segments: string[][] = [[]];
      points.forEach((p) =>
        p ? segments[segments.length - 1].push(`${p[0]},${p[1]}`) : segments.push([]),
      );
      for (const segment of segments.filter((seg) => seg.length)) {
        if (type === "area") {
          const [first, last] = [
            segment[0].split(",")[0],
            segment[segment.length - 1].split(",")[0],
          ];
          root.append(
            svg("polygon", {
              points: `${first},${zero} ${segment.join(" ")} ${last},${zero}`,
              fill: color(s),
              class: "area",
            }),
          );
        }
        root.append(
          svg("polyline", { points: segment.join(" "), stroke: color(s), class: "line" }),
        );
      }
    }
    points.forEach((p, i) => {
      if (p)
        root.append(
          titled(
            svg("circle", {
              cx: p[0],
              cy: p[1],
              r: type === "scatter" ? 4 : 3,
              fill: color(s),
              class: "dot",
            }),
            tip(i, series.values[i]!),
          ),
        );
    });
  });
  root.append(
    horizontal
      ? svg("line", { x1: zero, x2: zero, y1: plot.top, y2: plot.bottom, class: "chart-zero" })
      : svg("line", { x1: plot.left, x2: plot.right, y1: zero, y2: zero, class: "chart-zero" }),
  );
}

export function renderChart(
  type: ChartType,
  title: string,
  data: ChartData,
  width: number,
  height: number,
): SVGSVGElement {
  const names = data.series.map((s) => s.name);
  const summary = `${CHART_LABELS[type]} chart${title ? ` "${title}"` : ""}: ${names.join(", ") || "no data"} across ${data.categories.length} categories`;
  const root = svg("svg", {
    class: "chart-svg",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": summary,
  });
  const pad = 12;
  let top = pad;
  if (title) {
    root.append(
      svg(
        "text",
        { x: width / 2, y: top + 13, "text-anchor": "middle", class: "chart-title" },
        title,
      ),
    );
    top += 26;
  }
  const legendNames = type === "pie" ? data.categories : names;
  const showLegend = data.series.length > 0 && (type === "pie" || names.length > 1);
  const bottom = height - pad - (showLegend ? 22 : 0);
  if (showLegend) root.append(legend(legendNames, width, height - pad - 4));
  if (!data.series.length) {
    root.append(
      svg(
        "text",
        { x: width / 2, y: (top + bottom) / 2, "text-anchor": "middle", class: "chart-empty" },
        "No numbers to chart in this range.",
      ),
    );
    return root;
  }
  const area = { left: pad, top, right: width - pad, bottom };
  if (type === "pie") pie(root, data, area);
  else cartesian(root, type, data, area);
  return root;
}
