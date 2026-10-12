/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Diagnostics: report WebMCP registration and optionally save a screenshot (node scripts/shot.mjs out.png).
import puppeteer from "puppeteer-core";
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const pages = await b.pages();
let p = pages.find((x) => x.url().startsWith("http://127.0.0.1:8810"));
if (!p) {
  p = await b.newPage();
}
p.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.goto("http://127.0.0.1:8810", { waitUntil: "networkidle0" });
await p.bringToFront();
await new Promise((r) => setTimeout(r, 800));
const info = await p.evaluate(() => ({
  reg: window.pixelStudio.registration,
  supported: "modelContext" in document,
  vp: [innerWidth, innerHeight, devicePixelRatio],
}));
console.log(JSON.stringify(info));
if (process.argv[2]) {
  await p.screenshot({ path: process.argv[2] });
  console.log("shot", process.argv[2]);
}
b.disconnect();
