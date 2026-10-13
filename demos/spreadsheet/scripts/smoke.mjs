/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// End-to-end check in a real Chrome: calls every WebMCP tool through the browser's own
// document.modelContext.executeTool(), checks what comes back, checks that what a person types is
// visible to agents, and saves a screenshot to test-results/ (git-ignored).
// Start the dev server first (`npm run dev`, any port) and set URL to the address it prints;
// without URL, it uses Vite's default address, http://localhost:5173.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const url = process.env.URL ?? "http://localhost:5173";
const shots = fileURLToPath(new URL("../test-results/", import.meta.url));
mkdirSync(shots, { recursive: true });

const browser = await puppeteer.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-features=WebMCP"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(async () => (await document.modelContext?.getTools())?.length > 0);

const tools = await page.evaluate(async () =>
  (await document.modelContext.getTools()).map((tool) => tool.name),
);
const used = new Set();

/** Calls a tool the way an agent does and returns the parsed result. */
async function call(name, input = {}) {
  used.add(name);
  return page.evaluate(
    async (name, input) => {
      const tool = (await document.modelContext.getTools()).find((t) => t.name === name);
      if (!tool) return { error: `No tool named ${name}` };
      const result = await document.modelContext.executeTool(tool, input);
      return JSON.parse(result);
    },
    name,
    input,
  );
}

/** Calls a tool that must succeed. */
async function ok(name, input) {
  const result = await call(name, input);
  assert.equal(result.error, undefined, `${name} failed: ${result.error}`);
  console.log(`✓ ${name}`);
  return result;
}

await ok("get_workbook_info");
const table = await ok("set_values", {
  range: "A1",
  values: [
    ["Month", "Revenue", "Costs", "Profit"],
    ["Jan", "$12,000", "$8,000", "=B2-C2"],
    ["Feb", "$13,500", "$8,600", "=B3-C3"],
  ],
});
assert.deepEqual(table.values[2], ["Feb", 13500, 8600, 4900]);
const filled = await ok("autofill", { source: "A2:D3", target: "A2:D7" });
assert.deepEqual(filled.values.at(-1), ["Jun", 19500, 11000, 8500]);
assert.equal((await ok("read_range", { range: "A:D" })).range, "Sheet1!A1:D7");
await ok("format_cells", { range: "A1:D1", bold: true, fill_color: "#e8e6ff" });
await ok("resize_columns", { columns: "A:D", fit_to_content: true });
await ok("add_conditional_format", { range: "D2:D7", condition: "color_scale" });
const chart = await ok("add_chart", { range: "A1:D7", type: "line", title: "First half" });
assert.deepEqual(chart.series, ["Revenue", "Costs", "Profit"]);
await ok("update_chart", { id: chart.id, type: "column", position: "F10" });
assert.equal((await ok("find_cells", { query: "jun" })).count, 1);
assert.equal(
  (await ok("replace_text", { find: "Jun", replacement: "June", entire_cell: true })).replaced,
  1,
);
await ok("sort_range", {
  range: "A1:D7",
  by: [{ column: "D", descending: true }],
  has_header: true,
});
assert.deepEqual((await ok("read_range", { range: "A2" })).values, [["June"]]);
await ok("select_range", { range: "B2:B7" });
assert.equal((await ok("get_selection")).sum, 94500);

// A person types a formula; the agent sees it.
await page.click("#name-box", { clickCount: 3 });
await page.keyboard.type("F2");
await page.keyboard.press("Enter");
await page.keyboard.type("=SUM(D2:D7)");
await page.keyboard.press("Enter");
const typed = await ok("read_range", { range: "F2" });
assert.deepEqual([typed.values, typed.formulas], [[[37500]], { F2: "=SUM(D2:D7)" }]);

await ok("add_sheet", { name: "Summary" });
await ok("copy_range", { source: "Sheet1!A1:D7", destination: "Summary!A1", paste: "values" });
await ok("update_sheet", { sheet: "Sheet1", name: "Sales", frozen_rows: 1 });
await ok("insert_columns", { column: "B", sheet: "Summary" });
await ok("delete_columns", { column: "B", sheet: "Summary" });
await ok("insert_rows", { row: 2, count: 2, sheet: "Summary" });
await ok("delete_rows", { row: 2, count: 2, sheet: "Summary" });
await ok("clear_range", { range: "Summary!D1:D7", what: "all" });
await ok("delete_sheet", { sheet: "Summary" });
assert.deepEqual((await ok("undo")).undone, ["Delete sheet"]);
await ok("redo");
await ok("delete_conditional_format", { range: "Sales!D:D" });
await ok("delete_chart", { id: chart.id });

// Refused calls come back as errors the agent can act on, and change nothing.
const before = await ok("get_workbook_info");
const refused = await call("set_values", { range: "Nope!A1", values: [["x"]] });
assert.match(refused.error, /There is no sheet named "Nope"/);
assert.deepEqual(refused.sheets, ["Sales"]);
assert.deepEqual(await call("get_workbook_info"), before);

await page.screenshot({ path: `${shots}smoke.png` });
await browser.close();

const missing = tools.filter((name) => !used.has(name));
assert.deepEqual(missing, [], `Tools not exercised: ${missing.join(", ")}`);
assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join("; ")}`);
console.log(`PASS: ${used.size}/${tools.length} tools ok`);
