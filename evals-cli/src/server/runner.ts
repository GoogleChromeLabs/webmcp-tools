/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile } from "fs/promises";
import { Eval, TestResults } from "../types/evals.js";
import { Tool, ToolsSchema } from "../types/tools.js";
import { Config, WebmcpConfig } from "../types/config.js";
import { listToolsFromPage } from "../browser/webmcp.js";
import { renderReport, renderWebmcpReport } from "../report/report.js";
import * as dotenv from "dotenv";
import { executeEvals, RunEvent } from "../evaluator.js";

export { RunEvent };

export async function runEvaluations(
  config: Config | WebmcpConfig,
  onEvent: (event: RunEvent) => void
) {
  dotenv.config();

  try {
    let tools: Array<Tool>;
    let reportHtml = '';
    let finalResults: TestResults;

    if ('url' in config) {
      tools = await listToolsFromPage(config.url);
      const tests: Array<Eval> = JSON.parse(
        await readFile(config.evalsFile, "utf-8"),
      );
      finalResults = await executeEvals(tests, tools, config, onEvent);
      reportHtml = renderWebmcpReport(config as WebmcpConfig, finalResults);

    } else {
      const toolsSchema: ToolsSchema = JSON.parse(
        await readFile(config.toolSchemaFile, "utf-8"),
      );
      tools = toolsSchema.tools.map((t) => {
        return {
          description: t.description,
          functionName: t.name,
          parameters: t.inputSchema || {},
        };
      });

      const tests: Array<Eval> = JSON.parse(
        await readFile(config.evalsFile, "utf-8"),
      );
      finalResults = await executeEvals(tests, tools, config, onEvent);
      reportHtml = renderReport(config as Config, finalResults);
    }

    const reportName = `report-${Date.now()}.html`;
    await writeFile(reportName, reportHtml);

    onEvent({
      type: 'completed',
      results: finalResults,
      reportFile: reportName
    });

  } catch (error: any) {
    onEvent({ type: 'error', message: error.message });
  }
}
