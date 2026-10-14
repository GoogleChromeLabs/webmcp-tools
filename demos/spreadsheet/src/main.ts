/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Starts the spreadsheet and offers its tools to agents through WebMCP. */
import "./style.css";
import { Workbook } from "./model/workbook.ts";
import { App } from "./ui/app.ts";
import { $ } from "./ui/dom.ts";
import { buildTools, registerTools } from "./webmcp/index.ts";

const app = new App(new Workbook());
const { supported, count } = await registerTools(buildTools(app));
const status = $("#webmcp-status");
status.dataset.state = count ? "on" : "off";
status.textContent = !supported
  ? "WebMCP isn't available in this browser"
  : count
    ? `${count} WebMCP tools ready`
    : "WebMCP tools failed to register";
