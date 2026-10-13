/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Charts float over the sheet: drag to move, drag the corner to resize, Delete to remove. */
import { CHART_LIMITS, chartData } from "../model/charts.ts";
import type { Chart, ChartType } from "../model/workbook.ts";
import type { App } from "./app.ts";
import { CHART_LABELS, renderChart } from "./chart-svg.ts";
import { $, h, icon } from "./dom.ts";

const clampSize = (n: number, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, n)));

export class ChartsView {
  private readonly layer = $("#charts");
  private readonly elements = new Map<string, HTMLElement>();
  private readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  render(): void {
    const { wb, grid } = this.app;
    const sheet = grid.sheet;
    const ids = new Set(sheet.charts.map((chart) => chart.id));
    for (const [id, element] of this.elements)
      if (!ids.has(id)) {
        element.remove();
        this.elements.delete(id);
      }
    for (const chart of sheet.charts) {
      let element = this.elements.get(chart.id);
      if (!element) {
        element = this.create(chart.id);
        this.layer.append(element);
        this.elements.set(chart.id, element);
      }
      Object.assign(element.style, {
        left: `${grid.colLeft(chart.anchor.col)}px`,
        top: `${grid.rowTop(chart.anchor.row)}px`,
        width: `${chart.width}px`,
        height: `${chart.height}px`,
        translate: "",
      });
      element.firstElementChild!.replaceWith(
        renderChart(
          chart.type,
          chart.title,
          chartData(wb, sheet, chart),
          chart.width,
          chart.height,
        ),
      );
      element.querySelector("select")!.value = chart.type;
    }
  }

  /** Focuses a chart, e.g. after an agent adds it. */
  focus(id: string): void {
    this.elements.get(id)?.focus({ preventScroll: true });
  }

  private update(id: string, patch: Partial<Omit<Chart, "id">>): void {
    this.app.run(() => this.app.wb.updateChart(this.app.grid.sheet, id, patch));
  }

  private remove(id: string): void {
    this.app.run(() => this.app.wb.deleteChart(this.app.grid.sheet, id));
    this.app.focusGrid();
  }

  private create(id: string): HTMLElement {
    const type = h(
      "select",
      { className: "chart-type", ariaLabel: "Chart type" },
      ...Object.entries(CHART_LABELS).map(([value, label]) => h("option", { value }, label)),
    );
    const remove = h(
      "button",
      { type: "button", className: "icon-btn", ariaLabel: "Delete chart" },
      icon("trash"),
    );
    const figure = h(
      "figure",
      { className: "chart", tabIndex: 0, dataset: { id } },
      h("span"),
      h("div", { className: "chart-tools" }, type, remove),
      h("div", { className: "chart-resize" }),
    );
    type.addEventListener("change", () => this.update(id, { type: type.value as ChartType }));
    remove.addEventListener("click", () => this.remove(id));
    figure.addEventListener("keydown", (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && e.target === figure) {
        e.preventDefault();
        this.remove(id);
      }
    });
    figure.addEventListener("pointerdown", (e) => this.drag(e, figure, id));
    return figure;
  }

  private drag(e: PointerEvent, figure: HTMLElement, id: string): void {
    const target = e.target as Element;
    if (e.button !== 0 || target.closest(".chart-tools")) return;
    e.preventDefault();
    figure.focus({ preventScroll: true });
    figure.setPointerCapture(e.pointerId);
    const resizing = target.classList.contains("chart-resize");
    const start = {
      x: e.clientX,
      y: e.clientY,
      width: figure.offsetWidth,
      height: figure.offsetHeight,
    };
    const { minWidth, maxWidth, minHeight, maxHeight } = CHART_LIMITS;
    const move = (ev: PointerEvent) => {
      const [dx, dy] = [ev.clientX - start.x, ev.clientY - start.y];
      if (resizing) {
        figure.style.width = `${clampSize(start.width + dx, minWidth, maxWidth)}px`;
        figure.style.height = `${clampSize(start.height + dy, minHeight, maxHeight)}px`;
      } else figure.style.translate = `${dx}px ${dy}px`;
    };
    const up = (ev: PointerEvent) => {
      figure.removeEventListener("pointermove", move);
      figure.removeEventListener("pointerup", up);
      const [dx, dy] = [ev.clientX - start.x, ev.clientY - start.y];
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        figure.style.translate = "";
        return;
      }
      if (resizing)
        this.update(id, {
          width: clampSize(start.width + dx, minWidth, maxWidth),
          height: clampSize(start.height + dy, minHeight, maxHeight),
        });
      else
        this.update(id, {
          anchor: this.app.grid.pointAt(figure.offsetLeft + dx + 1, figure.offsetTop + dy + 1),
        });
    };
    figure.addEventListener("pointermove", move);
    figure.addEventListener("pointerup", up);
  }
}
