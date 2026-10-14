/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Tools for charts that float over a sheet and redraw as their data changes. */
import { cellName, rangeName } from "../../engine/address.ts";
import { CHART_LIMITS, chartData, detectLayout } from "../../model/charts.ts";
import { CHART_TYPES, SpreadsheetError, type Chart, type Sheet } from "../../model/workbook.ts";
import { chartInfo, readRange, RETURNS_CONTENT, where } from "../refs.ts";
import { defineTool, type ToolHost, type ToolSpec } from "../runtime.ts";
import { bool, int, object, oneOf, str } from "../schema.ts";

const { minWidth, maxWidth, minHeight, maxHeight } = CHART_LIMITS;

export function chartTools(host: ToolHost): ToolSpec[] {
  const { wb } = host;
  const allCharts = () =>
    wb.sheets.flatMap((sheet) =>
      sheet.charts.map((chart) => ({ sheet: sheet.name, id: chart.id, title: chart.title })),
    );

  /** A range or cell on the chart's own sheet. */
  const onSheet = (sheet: Sheet, text: string, what: string) => {
    const target = readRange(wb, text, sheet);
    if (target.sheet !== sheet)
      throw new SpreadsheetError(`The chart's ${what} must be on its own sheet, ${sheet.name}.`);
    return target.range;
  };
  const anchorAt = (sheet: Sheet, text: string) => {
    const { r1, c1 } = onSheet(sheet, text, "position");
    if (r1 >= sheet.rows || c1 >= sheet.cols)
      throw new SpreadsheetError(`${cellName(r1, c1)} is past the end of ${sheet.name}.`);
    return { row: r1, col: c1 };
  };
  /** Refuses charts that would draw nothing, and describes the ones that would. */
  const plotted = (sheet: Sheet, chart: Omit<Chart, "id">) => {
    const { series, categories } = chartData(wb, sheet, chart);
    if (!series.length)
      throw new SpreadsheetError(
        `${where({ sheet, range: chart.range })} has no numbers to chart.`,
      );
    return { series: series.map((s) => s.name), categories: categories.length };
  };
  const find = (id: string) => {
    const found = wb.findChart(id);
    if (!found) throw new SpreadsheetError(`There is no chart "${id}".`, { charts: allCharts() });
    return found;
  };

  return [
    defineTool({
      name: "add_chart",
      description:
        "Adds a chart of a range: one series per column, category labels down the first column and series names across the first row. The chart redraws when the data changes.",
      inputSchema: object(
        {
          range: str("Data to chart, like A1:E6 or Sales!A1:E6."),
          type: oneOf(CHART_TYPES, "Chart type.", { default: "column" }),
          title: str("Title above the chart."),
          position: str(
            "Cell for the chart's top-left corner, like H2. Leave out to place it to the right of the data.",
          ),
          width: int("Width in pixels.", { default: 480, minimum: minWidth, maximum: maxWidth }),
          height: int("Height in pixels.", {
            default: 300,
            minimum: minHeight,
            maximum: maxHeight,
          }),
          header_row: bool("Whether the first row holds series names. Leave out to detect it."),
          label_column: bool(
            "Whether the first column holds category labels. Leave out to detect it.",
          ),
        },
        ["range"],
      ),
      execute: (input) => {
        const data = readRange(wb, input.range);
        const { sheet, range } = data;
        const detected = detectLayout(wb, sheet, range);
        const spec = {
          type: input.type,
          title: input.title ?? "",
          range,
          anchor:
            input.position === undefined
              ? { row: range.r1, col: Math.min(range.c2 + 2, sheet.cols - 1) }
              : anchorAt(sheet, input.position),
          width: input.width,
          height: input.height,
          headerRow: input.header_row ?? detected.headerRow,
          labelColumn: input.label_column ?? detected.labelColumn,
        };
        const drawn = plotted(sheet, spec);
        const chart = wb.addChart(sheet, spec);
        return {
          result: { ...chartInfo(chart), sheet: sheet.name, ...drawn },
          summary: `Added ${chart.title ? `"${chart.title}", a ${chart.type} chart` : `a ${chart.type} chart`} of ${rangeName(range)}`,
          target: data,
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "update_chart",
      description: "Changes a chart's type, title, data, position or size.",
      inputSchema: object(
        {
          id: str("Chart id, like chart1, from add_chart or get_workbook_info.", { minLength: 1 }),
          type: oneOf(CHART_TYPES, "Chart type."),
          title: str("Title above the chart. An empty string removes it."),
          range: str("New data range on the chart's sheet, like A1:C6."),
          position: str("Cell for the chart's top-left corner, like H2."),
          width: int("Width in pixels.", { minimum: minWidth, maximum: maxWidth }),
          height: int("Height in pixels.", { minimum: minHeight, maximum: maxHeight }),
          header_row: bool("Whether the first row holds series names."),
          label_column: bool("Whether the first column holds category labels."),
        },
        ["id"],
      ),
      execute: ({ id, ...changes }) => {
        const { sheet, chart } = find(id);
        if (Object.values(changes).every((value) => value === undefined))
          throw new SpreadsheetError(
            "Pass what to change, like type, title, range, position, width or height.",
          );
        const patch: Partial<Omit<Chart, "id">> = {
          ...(changes.type !== undefined && { type: changes.type }),
          ...(changes.title !== undefined && { title: changes.title }),
          ...(changes.range !== undefined && { range: onSheet(sheet, changes.range, "data") }),
          ...(changes.position !== undefined && { anchor: anchorAt(sheet, changes.position) }),
          ...(changes.width !== undefined && { width: changes.width }),
          ...(changes.height !== undefined && { height: changes.height }),
          ...(changes.header_row !== undefined && { headerRow: changes.header_row }),
          ...(changes.label_column !== undefined && { labelColumn: changes.label_column }),
        };
        const drawn = plotted(sheet, { ...chart, ...patch });
        const updated = wb.updateChart(sheet, id, patch);
        return {
          result: { ...chartInfo(updated), sheet: sheet.name, ...drawn },
          summary: `Updated chart ${id}`,
          target: { sheet, range: updated.range },
        };
      },
      annotations: RETURNS_CONTENT,
    }),
    defineTool({
      name: "delete_chart",
      description: "Deletes a chart. Its data stays.",
      inputSchema: object(
        {
          id: str("Chart id, like chart1, from add_chart or get_workbook_info.", { minLength: 1 }),
        },
        ["id"],
      ),
      execute: ({ id }) => {
        const { sheet } = find(id);
        wb.deleteChart(sheet, id);
        return { result: { deleted: id, sheet: sheet.name }, summary: `Deleted chart ${id}` };
      },
      annotations: RETURNS_CONTENT,
    }),
  ];
}
