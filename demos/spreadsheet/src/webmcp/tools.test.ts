/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Range } from "../engine/address.ts";
import { DEFAULT_SCALE } from "../model/conditional.ts";
import { Workbook, type Sheet } from "../model/workbook.ts";
import { buildTools, type ToolHost } from "./index.ts";

// The tools check colors with CSS.supports(), which only browsers have.
Object.defineProperty(globalThis, "CSS", {
  value: {
    supports: (_property: string, value: string) => /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value),
  },
});

type Result = Record<string, any>;

function setup() {
  const wb = new Workbook();
  const feed: { tool: string; state: string; text: string }[] = [];
  let selection = {
    sheet: wb.active,
    range: { r1: 0, c1: 0, r2: 0, c2: 0 },
    active: { row: 0, col: 0 },
  };
  const host: ToolHost = {
    wb,
    activity: {
      start: (tool) => {
        const entry = { tool, state: "running", text: "" };
        feed.push(entry);
        return {
          done: (text) => void Object.assign(entry, { state: "done", text }),
          fail: (text) => void Object.assign(entry, { state: "failed", text }),
        };
      },
    },
    selection: () => selection,
    reveal: ({ sheet, range }: { sheet: Sheet; range: Range }) => {
      selection = { sheet, range, active: { row: range.r1, col: range.c1 } };
    },
    fitWidth: () => 77,
  };
  const tools = buildTools(host);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  /** Calls a tool and returns what the agent receives: the result as JSON. */
  const call = (name: string, input: Record<string, unknown> = {}): Result => {
    const tool = byName.get(name);
    assert.ok(tool, `no tool ${name}`);
    return JSON.parse(
      JSON.stringify(tool.execute(input, { signal: new AbortController().signal })),
    );
  };
  return { wb, feed, tools, call, select: (s: typeof selection) => (selection = s) };
}

const SALES = [
  ["Region", "Q1", "Q2"],
  ["North", "100", "150"],
  ["South", "80", "60"],
  ["East", "120", "90"],
];

test("the tool surface: 27 described tools, annotation hints, no schema without input", () => {
  const { tools } = setup();
  assert.equal(tools.length, 27);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 27);
  for (const tool of tools) {
    assert.ok(tool.description.length > 20, tool.name);
    const properties = Object.entries(
      (tool.inputSchema as { properties?: Record<string, { description?: string }> } | undefined)
        ?.properties ?? {},
    );
    for (const [name, schema] of properties)
      assert.ok(schema.description, `${tool.name}.${name} has a description`);
  }
  const noInput = tools.filter((tool) => !tool.inputSchema).map((tool) => tool.name);
  assert.deepEqual(noInput, ["get_workbook_info", "get_selection"]);
  const readOnly = tools.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name);
  assert.deepEqual(readOnly, ["get_workbook_info", "get_selection", "read_range", "find_cells"]);
  const untrusted = tools
    .filter((tool) => tool.annotations?.untrustedContentHint)
    .map((tool) => tool.name);
  assert.deepEqual(untrusted, ["get_selection", "read_range", "find_cells"]);
});

test("input is checked against the schema before a tool runs", () => {
  const { call, feed } = setup();
  assert.match(
    call("clear_range", { range: "A1", color: "red" }).error,
    /Unknown parameter "color"\. Parameters: range, what\./,
  );
  assert.match(
    call("clear_range", { range: "A1", what: "everything" }).error,
    /"what" must be one of: contents, formats, all\. Got "everything"\./,
  );
  assert.match(call("set_values", { range: "A1" }).error, /Missing required parameter "values"/);
  assert.match(call("insert_rows", { row: 0 }).error, /"row" must be between 1 and 1000/);
  assert.match(call("get_workbook_info", { verbose: true }).error, /This takes no parameters/);
  assert.match(
    call("set_values", { range: "nowhere", values: [["x"]] }).error,
    /isn't a cell or range/,
  );
  assert.ok(feed.every((entry) => entry.state === "failed"));
});

test("set_values types like a person, reports results and formula errors, and is one undo step", () => {
  const { call, wb } = setup();
  const result = call("set_values", {
    range: "A1",
    values: [
      ["Item", "Price", "Share", "Date"],
      ["Pens", "$1,200", "12.5%", "2026-10-13"],
      ["Total", "=SUM(B2:B2)", "=B2/0", 7],
    ],
  });
  assert.equal(result.range, "Sheet1!A1:D3");
  assert.deepEqual(result.values[1], ["Pens", 1200, 0.125, "2026-10-13"]);
  assert.deepEqual(result.values[2], ["Total", 1200, "#DIV/0!", 7]);
  assert.deepEqual(result.formula_errors, { C3: "Division by zero." });
  assert.equal(wb.cell(wb.active, 1, 1)?.fmt?.numFmt, "currency");
  call("undo");
  assert.equal(wb.usedRange(wb.active), null);
});

test("set_values fills a range from one value and refuses mismatched sizes", () => {
  const { call, wb } = setup();
  call("set_values", { range: "A1", values: [["1"], ["2"], ["3"]] });
  assert.deepEqual(call("set_values", { range: "B1:B3", values: [["=A1*10"]] }).values, [
    [10],
    [20],
    [30],
  ]);
  assert.equal(wb.cell(wb.active, 2, 1)?.f, "=A3*10");
  assert.match(
    call("set_values", { range: "C1:C3", values: [["a", "b"]] }).error,
    /values has 1 row of up to 2 cells, but C1:C3 is 3 rows by 1 column/,
  );
});

test("a failing call changes nothing", () => {
  const { call, wb } = setup();
  const result = call("set_values", { range: "A999", values: [["a"], ["b"], ["c"]] });
  assert.match(result.error, /is the furthest a sheet goes/);
  assert.equal(wb.usedRange(wb.active), null);
  assert.equal(wb.undoLabel, null);
});

test("read_range trims empty rows and columns after the data, and reads whole sheets by name", () => {
  const { call } = setup();
  call("set_values", { range: "A1", values: SALES });
  const read = call("read_range", { range: "A1:Z100" });
  assert.equal(read.range, "Sheet1!A1:C4");
  assert.deepEqual(read.values[3], ["East", 120, 90]);
  assert.deepEqual(call("read_range", { range: "Sheet1" }).values, read.values);
  assert.deepEqual(call("read_range", { range: "K1:K5" }).values, []);
  call("format_cells", { range: "B2", bold: true, number_format: "currency" });
  assert.deepEqual(call("read_range", { range: "B2", include_formats: true }).formats, {
    B2: { bold: true, number_format: "currency" },
  });
});

test("empty calls are refused instead of quietly doing nothing", () => {
  const { call } = setup();
  assert.match(call("undo").error, /There is nothing to undo/);
  assert.match(call("redo").error, /There is nothing to redo/);
  call("set_values", { range: "A1", values: SALES });
  assert.match(call("format_cells", { range: "A1" }).error, /Pass at least one format/);
  assert.match(call("update_sheet", { sheet: "Sheet1" }).error, /Pass what to change/);
  assert.match(
    call("resize_columns", { columns: "A" }).error,
    /Pass width, or fit_to_content: true/,
  );
  assert.match(
    call("resize_columns", { columns: "A", width: 90, fit_to_content: true }).error,
    /not both/,
  );
  assert.match(call("delete_conditional_format", {}).error, /Pass the id of a rule/);
  assert.equal(call("resize_columns", { columns: "A:B", fit_to_content: true }).widths.B, 77);
});

test("format_cells applies only what is passed; none removes colors", () => {
  const { call, wb } = setup();
  call("set_values", { range: "A1", values: SALES });
  call("format_cells", { range: "A1:C1", bold: true, fill_color: "#e8e6ff", align: "center" });
  call("format_cells", { range: "A1:C1", fill_color: "none", currency: "eur" });
  assert.deepEqual(wb.cell(wb.active, 0, 1)?.fmt, {
    bold: true,
    align: "center",
    currency: "EUR",
    numFmt: "currency",
  });
  assert.match(
    call("format_cells", { range: "A1", text_color: "not a color!" }).error,
    /isn't a color/,
  );
  assert.match(
    call("format_cells", { range: "A1", currency: "XYZ" }).error,
    /isn't a currency code/,
  );
});

test("sorting, moving and inserting keep formulas pointing at the same data", () => {
  const { call, wb } = setup();
  call("set_values", { range: "A1", values: SALES });
  call("set_values", { range: "E1", values: [["=SUM(B2:B4)"]] });
  const sorted = call("sort_range", {
    range: "A1:C4",
    by: [{ column: "B", descending: true }],
    has_header: true,
  });
  assert.equal(sorted.rows, 3);
  assert.deepEqual(call("read_range", { range: "A2:A4" }).values, [["East"], ["North"], ["South"]]);
  assert.match(
    call("sort_range", { range: "A1:C4", by: [{ column: "F" }] }).error,
    /Column F is outside A1:C4/,
  );
  call("insert_rows", { row: 1, count: 2 });
  assert.equal(wb.cell(wb.active, 2, 4)?.f, "=SUM(B4:B6)");
  call("copy_range", { source: "A3:C6", destination: "H1", move: true });
  assert.equal(wb.cell(wb.active, 2, 4)?.f, "=SUM(I2:I4)");
  assert.deepEqual(call("read_range", { range: "E3" }).values, [[300]]);
});

test("autofill continues series and copy_range pastes values", () => {
  const { call } = setup();
  call("set_values", {
    range: "A1",
    values: [
      ["Jan", "1"],
      ["Feb", "2"],
    ],
  });
  const filled = call("autofill", { source: "A1:B2", target: "A1:B5" });
  assert.deepEqual(filled.values.at(-1), ["May", 5]);
  call("set_values", { range: "C1", values: [["=B1*2"]] });
  const pasted = call("copy_range", { source: "C1", destination: "D1", paste: "values" });
  assert.deepEqual(pasted.values, [[2]]);
  assert.match(
    call("copy_range", { source: "C1", destination: "D1", paste: "values", move: true }).error,
    /paste must be all/,
  );
});

test("conditional formats check which parameters each condition uses", () => {
  const { call, wb } = setup();
  call("set_values", { range: "A1", values: SALES });
  const rule = call("add_conditional_format", {
    range: "B2:C4",
    condition: "less_than",
    value: "90",
    text_color: "#b42318",
  });
  assert.equal(rule.id, "rule1");
  assert.equal(wb.active.rules[0].value, 90);
  assert.match(
    call("add_conditional_format", { range: "B2:C4", condition: "is_empty", value: "1" }).error,
    /is_empty condition doesn't use value/,
  );
  assert.match(
    call("add_conditional_format", {
      range: "B2:C4",
      condition: "color_scale",
      fill_color: "#ffffff",
    }).error,
    /doesn't take text or fill styles/,
  );
  assert.match(
    call("add_conditional_format", { range: "B2:C4", condition: "between", value: "9", value2: 1 })
      .error,
    /lower bound/,
  );
  assert.deepEqual(
    call("add_conditional_format", { range: "C2:C4", condition: "color_scale" }).max_color,
    DEFAULT_SCALE.max,
  );
  assert.deepEqual(call("delete_conditional_format", { id: "rule1" }).removed, ["rule1"]);
  assert.match(
    call("delete_conditional_format", { id: "rule1" }).error,
    /There is no conditional format "rule1"/,
  );
  assert.match(
    call("delete_conditional_format", { range: "A1" }).error,
    /No conditional formats overlap/,
  );
});

test("charts detect their layout, refuse data without numbers, and report what they draw", () => {
  const { call } = setup();
  call("set_values", { range: "A1", values: SALES });
  const chart = call("add_chart", { range: "A1:C4", title: "Sales" });
  assert.deepEqual(
    [chart.id, chart.type, chart.header_row, chart.label_column],
    ["chart1", "column", true, true],
  );
  assert.deepEqual(chart.series, ["Q1", "Q2"]);
  assert.equal(chart.position, "E1");
  assert.match(call("add_chart", { range: "A1:A4" }).error, /has no numbers to chart/);
  assert.equal(call("update_chart", { id: "chart1", type: "line", position: "B8" }).position, "B8");
  assert.match(call("update_chart", { id: "chart1" }).error, /Pass what to change/);
  assert.match(call("delete_chart", { id: "chart9" }).error, /There is no chart "chart9"/);
  assert.equal(call("delete_chart", { id: "chart1" }).deleted, "chart1");
});

test("sheet tools rename with formulas following, freeze rows, and delete", () => {
  const { call, wb } = setup();
  call("add_sheet", { name: "Data" });
  call("set_values", { range: "Data!A1", values: [["5"]] });
  call("set_values", { range: "A1", values: [["=Data!A1*2"]] });
  assert.equal(
    call("update_sheet", { sheet: "data", name: "Numbers", position: 1, frozen_rows: 1 }).position,
    1,
  );
  assert.equal(wb.cell(wb.sheets[1], 0, 0)?.f, "=Numbers!A1*2");
  assert.equal(wb.sheets[0].frozenRows, 1);
  assert.match(call("add_sheet", { name: "numbers" }).error, /already exists/);
  call("delete_sheet", { sheet: "Numbers" });
  assert.deepEqual(call("read_range", { range: "A1" }).values, [["#REF!"]]);
  assert.match(call("delete_sheet", { sheet: "Sheet1" }).error, /at least one sheet/);
  assert.deepEqual(call("delete_sheet", { sheet: "Nope" }).sheets, ["Sheet1"]);
});

test("selection tools share what the person sees", () => {
  const { call, wb, select } = setup();
  call("set_values", { range: "A1", values: SALES });
  select({ sheet: wb.active, range: { r1: 1, c1: 1, r2: 3, c2: 2 }, active: { row: 1, col: 1 } });
  const selection = call("get_selection");
  assert.deepEqual(
    [selection.selection, selection.active_cell, selection.count, selection.sum],
    ["Sheet1!B2:C4", "Sheet1!B2", 6, 600],
  );
  assert.equal(call("select_range", { range: "A1:A4" }).selected, "Sheet1!A1:A4");
  assert.equal(call("get_selection").selection, "Sheet1!A1:A4");
  assert.deepEqual(call("find_cells", { query: "th" }).matches, [
    { cell: "Sheet1!A2", value: "North" },
    { cell: "Sheet1!A3", value: "South" },
  ]);
});

test("undo and redo step through agent changes, and the workbook info tells what is next", () => {
  const { call } = setup();
  call("set_values", { range: "A1", values: SALES });
  call("format_cells", { range: "A1:C1", bold: true });
  assert.equal(call("get_workbook_info").next_undo, "Format cells");
  assert.deepEqual(call("undo", { steps: 5 }).undone, ["Format cells", "Set values"]);
  assert.deepEqual(call("redo").redone, ["Set values"]);
  const info = call("get_workbook_info");
  assert.deepEqual(
    [info.sheets[0].used_range, info.next_undo, info.next_redo],
    ["A1:C4", "Set values", "Format cells"],
  );
});

test("unexpected failures still come back as errors and roll back", (t) => {
  const { call, wb } = setup();
  call("set_values", { range: "A1", values: SALES });
  const before = [...wb.active.widths];
  t.mock.method(console, "error", () => {});
  wb.setWidths = () => {
    throw new TypeError("boom");
  };
  assert.equal(
    call("resize_columns", { columns: "A:B", width: 50 }).error,
    "Something went wrong: boom",
  );
  assert.deepEqual(wb.active.widths, before);
});
