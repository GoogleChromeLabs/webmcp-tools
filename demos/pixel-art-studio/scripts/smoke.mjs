/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Smoke test: exercises every WebMCP tool through the browser's own document.modelContext.executeTool().
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
// Screenshots are test output, so they go to the git-ignored test-results/ folder.
const shots = fileURLToPath(new URL("../test-results", import.meta.url));
mkdirSync(shots, { recursive: true });
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let p =
  (await b.pages()).find((x) => x.url().startsWith("http://127.0.0.1:8810")) ?? (await b.newPage());
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.goto("http://127.0.0.1:8810", { waitUntil: "load" });
await p.bringToFront();
await new Promise((r) => setTimeout(r, 1000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (name, args = {}) =>
  p.evaluate(
    async (name, args) => {
      const mc = document.modelContext;
      const t = (await mc.getTools()).find((t) => t.name === name);
      if (!t) return { MISSING: name };
      let raw;
      try {
        raw = await mc.executeTool(t, args);
      } // Chrome 155+: plain object input
      catch (e) {
        if (!String(e?.message).startsWith("Failed to parse input")) throw e;
        raw = await mc.executeTool(t, JSON.stringify(args));
      }
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    name,
    args,
  );
const tools = await p.evaluate(async () =>
  (await document.modelContext.getTools()).map((t) => ({
    name: t.name,
    ro: t.annotations?.readOnlyHint ?? false,
  })),
);
console.log("registered", tools.length, tools.map((t) => t.name + (t.ro ? "(ro)" : "")).join(", "));
const used = new Set(),
  failed = [];
const log = async (n, a, wait = 350) => {
  used.add(n);
  const r = await call(n, a);
  if (r && typeof r === "object" && (r.MISSING || r.ok === false)) failed.push(n);
  const s = JSON.stringify(r);
  console.log(n.padEnd(18), s.length > 160 ? s.slice(0, 160) + "…" : s);
  await sleep(wait);
  return r;
};
await log("get_canvas_info");
await log("set_canvas_size", { size: 128 });
await log("set_canvas_size", { size: 64 });
await log("set_palette", { preset: "sunset" });
await log("add_color", { color: "#2b8a3e" });
await log("set_colors", { primary: "#ff7b5c", secondary: 3 });
await log("set_selection", { x: 4, y: 4, width: 24, height: 18 });
await log("get_selection");
await log(
  "gradient_fill",
  { colors: ["#2d1457", "#e23a6e", "#ffc145"], direction: "vertical", dither: "bayer4" },
  900,
);
await log(
  "draw_shape_preset",
  { shape: "sun", x: 16, y: 16, size: 9, color: "#ffe066", color2: "#ff9f4a" },
  600,
);
await log("add_layer", { name: "Smoke layer" });
await log("draw_rect", { x: 34, y: 6, width: 12, height: 8, color: 9, filled: false });
await log("draw_ellipse", { x: 48, y: 6, width: 12, height: 12, color: "#5ee0e6" });
await log("flood_fill", { x: 40, y: 10, color: "b" });
await log("draw_line", { x0: 34, y0: 26, x1: 60, y1: 30, color: "#fff3b0", thickness: 2 });
await log("draw_pixels", {
  pixels: [
    { x: 36, y: 34 },
    { x: 38, y: 34, color: "e" },
    { x: 40, y: 34, color: "#ffffff" },
  ],
  color: "#ff7b5c",
});
await log(
  "paint_rows",
  {
    x: 6,
    y: 34,
    rows: [
      "..ee..ee..",
      ".efffffffe.",
      ".effffffffe",
      "..efffffe.",
      "...efffe..",
      "....efe...",
      ".....e....",
    ],
    legend: { f: "#ff4d8d" },
  },
  900,
);
await log(
  "draw_svg",
  {
    svg: '<svg viewBox="0 0 64 64"><circle cx="54" cy="54" r="6" fill="#5ee0e6"/><path d="M48 46 L60 46" stroke="#ffe066" stroke-width="2"/></svg>',
    outline: "#1b0f3b",
  },
  900,
);
await log("update_layer", { layer: "Smoke layer", opacity: 0.85, name: "Smoke layer ✓" });
await log("set_selection", {
  polygon: [
    [30, 40],
    [58, 38],
    [54, 60],
    [34, 58],
  ],
});
await log(
  "replace_selection",
  {
    mode: "rows",
    rows: Array.from({ length: 22 }, (_, y) =>
      Array.from({ length: 29 }, (_, x) => ((x + y) % 4 < 2 ? "e" : "b")).join(""),
    ),
  },
  0,
);
await sleep(420);
await p.screenshot({ path: `${shots}/03-agent-materialize.png` });
await sleep(1200);
// human interaction: mouse rectangle selection must be exposed to agents
const box = await p.evaluate(() => {
  const r = document.querySelector("#cv").getBoundingClientRect(),
    v = window.pixelStudio.view;
  return { l: r.left, t: r.top, z: v.zoom / v.dpr, px: v.panX / v.dpr, py: v.panY / v.dpr };
});
const at = (x, y) => [box.l + box.px + (x + 0.5) * box.z, box.t + box.py + (y + 0.5) * box.z];
await p.click('[data-tool="select"]');
let [mx, my] = at(40, 2);
await p.mouse.move(mx, my);
await p.mouse.down();
[mx, my] = at(61, 17);
await p.mouse.move(mx, my, { steps: 8 });
await p.mouse.up();
console.log("human selection seen by agent:", JSON.stringify(await call("get_selection")));
await p.click('[data-tool="pencil"]');
[mx, my] = at(2, 60);
await p.mouse.move(mx, my);
await p.mouse.down();
[mx, my] = at(20, 62);
await p.mouse.move(mx, my, { steps: 10 });
await p.mouse.up();
console.log(
  "pencil stroke pixels:",
  await p.evaluate(() => window.pixelStudio.studio.layer.data.filter(Boolean).length),
);
await p.click('[data-sel="agent"]').catch(() => {});
await sleep(600);
await log("get_region_pixels", { x: 6, y: 34, width: 11, height: 7 });
await log("set_view", { grid: true, bloom: true, fit: true });
await sleep(800);
await p.screenshot({ path: `${shots}/02-smoke-test.png` });
await log("undo", { steps: 2 });
await log("redo", { steps: 1 });
await log("delete_layer", { layer: "Smoke layer ✓" });
await log("set_selection", { clear: true });
await log("clear_canvas", { scope: "all", reset_layers: true }, 600);
const bad = await call("paint_rows", { rows: "nope" });
console.log("error-path", JSON.stringify(bad));
if (bad?.ok !== false) failed.push("error-path");
const badSvg = await call("draw_svg", { svg: "not svg" });
console.log("svg-error-path", JSON.stringify(badSvg));
if (badSvg?.ok !== false) failed.push("svg-error-path");
// Cancel while the SVG decodes: the tool must stop before it paints. The debug handle passes the
// same signal Chrome would, and the abort lands while execute waits on the decode.
const cancel = await p.evaluate(async () => {
  const s = window.pixelStudio.studio;
  const before = s.composite.slice();
  const ac = new AbortController();
  const pending = window.pixelStudio.call(
    "draw_svg",
    { svg: '<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#5ee0e6"/></svg>' },
    ac.signal,
  );
  ac.abort();
  const result = await pending;
  return { result, unchanged: s.composite.every((c, i) => c === before[i]) };
});
console.log("cancel-path", JSON.stringify(cancel));
if (cancel.result?.error !== "Cancelled" || !cancel.unchanged) failed.push("cancel-path");
await log("set_palette", { preset: "sunset" });
await log("set_colors", { primary: "#ff7b5c", secondary: "#1b0f3b" });
// reset view state to pristine: reload so feed/history are clean too
const missing = tools.map((t) => t.name).filter((n) => !used.has(n));
console.log("unexercised:", missing.join(",") || "none");
await sleep(500);
await p.goto("http://127.0.0.1:8810", { waitUntil: "load" });
await sleep(1200);
const after = await p.evaluate(async () => ({
  tools: (await document.modelContext.getTools()).length,
  filled: window.pixelStudio.studio.composite.some((c) => c),
}));
console.log("after reload", JSON.stringify(after));
await p.screenshot({ path: `${shots}/01-empty-studio.png` });
console.log(
  failed.length ? `FAIL: ${failed.join(", ")}` : `PASS: ${used.size}/${tools.length} tools ok`,
);
b.disconnect();
process.exitCode = failed.length || missing.length || tools.length !== 25 ? 1 : 0;
