/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, WebmcpConfig } from "../types/config.js";
import { Message, TestResult, TestResults, FunctionCall } from "../types/evals.js";
import { matchesArgument } from "../matcher.js";
import { sortObjectKeys } from "../utils.js";

function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderReport(config: Config, testResults: TestResults): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebMCP Eval Results</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              sans: ['Inter', 'sans-serif'],
            }
          }
        }
      }
    </script>
</head>
<body class="bg-slate-50 text-slate-900 font-sans p-8 antialiased">
    <div class="max-w-5xl mx-auto space-y-8">
        <header class="border-b border-slate-200 pb-6 mb-8">
            <h1 class="text-3xl font-bold tracking-tight text-slate-900">Evaluation Results</h1>
        </header>
        
        <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 class="text-xl font-semibold mb-4 text-slate-800">Configuration</h2>
            ${renderConfiguration(config)}
        </section>

        <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 class="text-xl font-semibold mb-4 text-slate-800">Summary</h2>
            ${renderEvalsSummary(testResults)}
        </section>

        <section class="space-y-6">
            <h2 class="text-xl font-semibold text-slate-800 pb-2 border-b border-slate-200">Details</h2>
            ${renderDetails(testResults.results)}
        </section>
    </div>
</body>    
</html>`;
}

function renderEvalsSummary(testResults: TestResults): string {
  const totalEvals = testResults.passCount + testResults.failCount + testResults.errorCount;
  const passRate = (totalEvals > 0 ? (testResults.passCount / totalEvals) * 100 : 0).toFixed(1);

  const caseNames = new Set(
    testResults.results.map(
      (r) =>
        r.test.name ||
        (r.test.messages[0] && r.test.messages[0].type === "message"
          ? r.test.messages[0].content
          : ""),
    ),
  );
  const totalCases = caseNames.size;
  const runs = testResults.results.reduce((max, r) => Math.max(max, r.runIndex || 1), 1);

  return `
        <p class="text-sm text-slate-500 mb-4 font-medium">
          Evaluated ${totalCases} test case${totalCases !== 1 ? "s" : ""} across ${runs} run${runs !== 1 ? "s" : ""}.
        </p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div class="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col">
                <span class="text-sm text-slate-500 font-medium">Total Evals</span>
                <span class="text-2xl font-bold text-slate-900">${totalEvals}</span>
            </div>
            <div class="bg-emerald-50 p-4 rounded-lg border border-emerald-100 flex flex-col">
                <span class="text-sm text-emerald-600 font-medium">Passed</span>
                <span class="text-2xl font-bold text-emerald-700">${testResults.passCount}</span>
            </div>
            <div class="bg-rose-50 p-4 rounded-lg border border-rose-100 flex flex-col">
                <span class="text-sm text-rose-600 font-medium">Failed</span>
                <span class="text-2xl font-bold text-rose-700">${testResults.failCount}</span>
            </div>
            <div class="bg-amber-50 p-4 rounded-lg border border-amber-100 flex flex-col">
                <span class="text-sm text-amber-600 font-medium">Errors</span>
                <span class="text-2xl font-bold text-amber-700">${testResults.errorCount}</span>
            </div>
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col">
                <span class="text-sm text-blue-600 font-medium">Pass Rate</span>
                <span class="text-2xl font-bold text-blue-700">${passRate}%</span>
            </div>            
        </div>`;
}

function renderConfiguration(config: Config): string {
  return `
<ul class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-600">
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Tool definitions</strong> <code class="mt-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-800 font-mono break-all">${config.toolSchemaFile}</code></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Evals</strong> <code class="mt-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-800 font-mono break-all">${config.evalsFile}</code></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Backend</strong> <span class="mt-1 text-slate-800">${config.backend}</span></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Model</strong> <span class="mt-1 text-slate-800">${config.model}</span></li>
</ul>`;
}

interface TestStep {
  stepIndex: number;
  originalIndex: number;
  result: TestResult;
}

interface TestRun {
  runIndex: number;
  steps: TestStep[];
  outcome: "pass" | "fail" | "error";
  messages: Message[];
  trajectory?: any[];
}

interface TestCase {
  name: string;
  runs: TestRun[];
  passCount: number;
  failCount: number;
  errorCount: number;
  totalCount: number;
}

function renderDetails(testResults: Array<TestResult>): string {
  const groupsMap = new Map<string, TestCase>();
  let originalIndex = 1;

  for (const result of testResults) {
    const firstMsg = result.test.messages[0];
    const fallbackName =
      firstMsg && firstMsg.type === "message" ? firstMsg.content : `Test case #${originalIndex}`;
    const caseName = result.test.name || fallbackName;

    if (!groupsMap.has(caseName)) {
      groupsMap.set(caseName, {
        name: caseName,
        runs: [],
        passCount: 0,
        failCount: 0,
        errorCount: 0,
        totalCount: 0,
      });
    }

    const group = groupsMap.get(caseName)!;
    const runIdx = result.runIndex || 1;

    let run = group.runs.find((r) => r.runIndex === runIdx);
    if (!run) {
      run = {
        runIndex: runIdx,
        steps: [],
        outcome: "pass",
        messages: result.test.messages,
        trajectory: result.trajectory,
      };
      group.runs.push(run);
    }

    run.steps.push({
      stepIndex: result.stepIndex || run.steps.length + 1,
      originalIndex,
      result,
    });

    if (result.outcome === "error") {
      run.outcome = "error";
    } else if (result.outcome === "fail" && run.outcome !== "error") {
      run.outcome = "fail";
    }

    group.totalCount++;
    if (result.outcome === "pass") {
      group.passCount++;
    } else if (result.outcome === "fail") {
      group.failCount++;
    } else {
      group.errorCount++;
    }

    originalIndex++;
  }

  const groups = Array.from(groupsMap.values());
  const totalCases = groups.length;

  return `
    <div class="space-y-6">
      ${groups.map((group, index) => renderTestCase(group, index + 1, totalCases)).join("")}
    </div>
  `;
}

function renderTestCase(group: TestCase, caseIndex: number, totalCases: number): string {
  const hasFailures = group.failCount > 0 || group.errorCount > 0;
  const isOpen = hasFailures ? "open" : "";

  let containerClass = "border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden";
  let headerBgClass = "bg-slate-50 hover:bg-slate-100";
  let titleColorClass = "text-slate-800";

  if (group.passCount === group.totalCount) {
    containerClass = "border border-emerald-200 rounded-xl bg-white shadow-sm overflow-hidden";
    headerBgClass = "bg-emerald-50/40 hover:bg-emerald-50/70";
    titleColorClass = "text-emerald-900";
  } else if (hasFailures) {
    containerClass = "border border-rose-200 rounded-xl bg-white shadow-sm overflow-hidden";
    headerBgClass = "bg-rose-50/40 hover:bg-rose-50/70";
    titleColorClass = "text-rose-900";
  }

  const badgeClass =
    group.passCount === group.totalCount
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : "bg-rose-100 text-rose-800 border-rose-200";

  const passRateText = `${group.passCount}/${group.totalCount} Passed`;
  const totalRuns = group.runs.length;

  return `
    <div class="${containerClass}">
      <details class="group/case" ${isOpen}>
        <summary class="flex items-center justify-between p-5 cursor-pointer ${headerBgClass} transition-all duration-200 select-none">
          <div class="flex items-center space-x-3 flex-1 min-w-0 mr-4">
            <svg class="w-5 h-5 text-slate-400 group-open/case:rotate-90 transition-transform duration-200 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
            <div class="truncate">
              <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Test case #${caseIndex}/${totalCases}</span>
              <h3 class="text-base font-semibold ${titleColorClass} truncate font-sans">
                ${escapeHtml(group.name)}
              </h3>
            </div>
          </div>
          <div class="flex items-center space-x-3 shrink-0">
            <span class="px-3 py-1 rounded text-xs font-semibold border ${badgeClass}">
              ${passRateText}
            </span>
          </div>
        </summary>
        
        <div class="p-5 border-t border-slate-100 bg-slate-50/50 space-y-5">
          ${group.runs.map((run) => renderRunIteration(run, caseIndex, totalCases, totalRuns)).join("")}
        </div>
      </details>
    </div>
  `;
}

function renderRunIteration(
  run: TestRun,
  caseIndex: number,
  totalCases: number,
  totalRuns: number,
): string {
  const isPass = run.outcome === "pass";
  const isOpen = !isPass ? "open" : "";

  const totalSteps = run.steps.length;
  const passedSteps = run.steps.filter((s) => s.result.outcome === "pass").length;

  const badgeClass =
    run.outcome === "pass"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : run.outcome === "fail"
        ? "bg-rose-100 text-rose-800 border-rose-200"
        : "bg-amber-100 text-amber-800 border-amber-200";

  const runBadgeText = `${passedSteps}/${totalSteps} Passed`;

  return `
    <div class="border border-slate-200 rounded-lg bg-white shadow-xs overflow-hidden">
      <details class="group/run" ${isOpen}>
        <summary class="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50/80 transition-all duration-200 select-none font-medium text-slate-700 text-sm">
          <div class="flex items-center space-x-2">
            <svg class="w-4 h-4 text-slate-400 group-open/run:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="font-semibold">Run #${run.runIndex}/${totalRuns}</span>
          </div>
          <span class="px-2.5 py-0.5 rounded text-xs font-semibold border ${badgeClass}">
            ${runBadgeText}
          </span>
        </summary>
        
        <div class="p-4 border-t border-slate-100 bg-slate-50/30 space-y-5">
          <details class="group/msgs bg-white rounded-lg border border-slate-200 overflow-hidden">
            <summary class="p-3 font-semibold text-xs text-slate-600 cursor-pointer hover:bg-slate-50 flex items-center justify-between select-none">
              <span>Prompt & Expected Messages</span>
              <svg class="w-4 h-4 text-slate-400 group-open/msgs:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div class="p-3 border-t border-slate-150 bg-slate-50/20">
              ${renderMessages(run.messages)}
            </div>
          </details>

          <div class="space-y-4">
            <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Steps Evaluation</h4>
            ${run.steps.map((step) => renderStepDetails(step, run.steps.length)).join("")}
          </div>

          ${renderTrajectory(run.trajectory)}
        </div>
      </details>
    </div>
  `;
}

function renderStepDetails(stepEval: TestStep, totalSteps: number): string {
  const { stepIndex, result } = stepEval;

  const functionNameOutcome =
    (result.test.expectedCall?.[0] as FunctionCall)?.functionName === result.response?.functionName
      ? "pass"
      : "fail";

  const argsOutcome = matchesArgument(
    (result.test.expectedCall?.[0] as FunctionCall)?.arguments,
    result.response?.args,
  )
    ? "pass"
    : "fail";

  const statusColor =
    result.outcome === "pass"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : result.outcome === "fail"
        ? "text-rose-700 bg-rose-50 border-rose-200"
        : "text-amber-700 bg-amber-50 border-amber-200";

  return `
    <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div class="flex items-center justify-between bg-slate-50/80 p-3 border-b border-slate-200">
        <h5 class="text-xs font-semibold text-slate-700">
          Step #${stepIndex}/${totalSteps}
        </h5>
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold border ${statusColor}">
          ${result.outcome.toUpperCase()}
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-slate-600">
          <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 font-medium">
            <tr>
              <th class="px-4 py-2">Type</th>
              <th class="px-4 py-2">Expected Pattern</th>
              <th class="px-4 py-2">Actual Result</th>
              <th class="px-4 py-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr class="hover:bg-slate-50/30">
              <td class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Function Name</td>
              <td class="px-4 py-3"><code class="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xs">${escapeHtml((result.test.expectedCall?.[0] as FunctionCall)?.functionName || null)}</code></td>
              <td class="px-4 py-3"><code class="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xs">${escapeHtml(result.response?.functionName || null)}</code></td>
              <td class="px-4 py-3">
                <span class="${functionNameOutcome === "pass" ? "text-emerald-600" : "text-rose-600"} font-bold text-xs">
                  ${functionNameOutcome.toUpperCase()}
                </span>
              </td>
            </tr>
            <tr class="hover:bg-slate-50/30">
              <td class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap align-top">Arguments</td>
              <td class="px-4 py-3">
                <div class="bg-slate-800 rounded-md p-3 overflow-x-auto max-w-md">
                  <pre class="text-xs text-slate-200 font-mono m-0 leading-relaxed">${escapeHtml(JSON.stringify(sortObjectKeys((result.test.expectedCall?.[0] as FunctionCall)?.arguments) || null, null, 2))}</pre>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="bg-slate-800 rounded-md p-3 overflow-x-auto max-w-md">
                  <pre class="text-xs text-slate-200 font-mono m-0 leading-relaxed">${escapeHtml(JSON.stringify(sortObjectKeys(result.response?.args) || null, null, 2))}</pre>
                </div>
              </td>
              <td class="px-4 py-3 align-top">
                <span class="${argsOutcome === "pass" ? "text-emerald-600" : "text-rose-600"} font-bold text-xs mt-2 inline-block">
                  ${argsOutcome.toUpperCase()}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTrajectory(trajectory?: any[]): string {
  if (!trajectory || trajectory.length === 0) return "";

  return `
    <details class="group/traj bg-white rounded border border-slate-200 mt-6">
      <summary class="p-3 font-medium text-sm text-slate-700 cursor-pointer hover:bg-slate-50 border-b border-transparent group-open/traj:border-slate-200">
        Trajectory
      </summary>
      <div class="p-4 space-y-6">
        ${trajectory
          .map((step, index) => {
            let html =
              '<div class="relative pl-6 border-l-2 border-slate-200 space-y-3 pb-6 last:pb-0">' +
              '<div class="absolute w-3 h-3 bg-slate-200 rounded-full -left-[7px] top-1"></div>' +
              '<strong class="block text-sm text-slate-900 font-semibold mb-2">Step ' +
              (index + 1) +
              "</strong>";

            const thoughts = step.reasoningText || step.text;
            if (thoughts) {
              html +=
                '<div><em class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Thoughts:</em>' +
                '<pre class="whitespace-pre-wrap bg-slate-50 p-3 rounded-md text-sm text-slate-700 border border-slate-200 font-sans">' +
                escapeHtml(thoughts) +
                "</pre></div>";
            }
            if (step.availableTools && step.availableTools.length > 0) {
              html +=
                '<div><em class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">' +
                "Available Tools (" +
                step.availableTools.length +
                "):" +
                "</em>" +
                '<div class="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2.5 mt-2 bg-slate-50 p-3 rounded-md border border-slate-200 max-h-60 overflow-y-auto font-sans">' +
                step.availableTools
                  .map(
                    (t: any) =>
                      '<div class="flex items-start">' +
                      '<span class="px-1.5 py-0.5 font-mono font-semibold bg-slate-200 text-slate-800 border border-slate-300 rounded text-[10px] truncate max-w-full" title="' +
                      escapeHtml(t.functionName) +
                      '">' +
                      escapeHtml(t.functionName) +
                      "</span>" +
                      "</div>" +
                      '<div class="text-xs text-slate-600 text-left align-top mt-0.5">' +
                      (t.description
                        ? escapeHtml(t.description)
                        : '<em class="text-slate-400">No description</em>') +
                      "</div>",
                  )
                  .join("") +
                "</div></div>";
            }
            if (step.toolCalls && step.toolCalls.length > 0) {
              html +=
                '<div><em class="text-xs font-semibold text-blue-500 uppercase tracking-wider block mb-1">Tool Calls:</em>' +
                '<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700">' +
                '<pre class="text-xs text-blue-300 font-mono m-0">' +
                escapeHtml(JSON.stringify(step.toolCalls, null, 2)) +
                "</pre>" +
                "</div></div>";
            }
            if (step.toolResults && step.toolResults.length > 0) {
              html +=
                '<div><em class="text-xs font-semibold text-emerald-500 uppercase tracking-wider block mb-1">Tool Results:</em>' +
                '<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700">' +
                '<pre class="text-xs text-emerald-300 font-mono m-0">' +
                escapeHtml(JSON.stringify(step.toolResults, null, 2)) +
                "</pre>" +
                "</div></div>";
            }
            html += "</div>";
            return html;
          })
          .join("")}
      </div>
    </details>
  `;
}

function renderMessages(messages: Array<Message>): string {
  return `<ul class="space-y-4">${messages.map(renderMessage).join("")}</ul>`;
}

function renderMessage(message: Message): string {
  let content;
  let roleBadgeClass =
    message.role === "user"
      ? "bg-purple-100 text-purple-800 border-purple-200"
      : "bg-blue-100 text-blue-800 border-blue-200";

  switch (message.type) {
    case "message":
      content = `<div class="bg-slate-50 border border-slate-200 p-3 rounded-md text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(message.content)}</div>`;
      break;
    case "functioncall":
      content = `<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700"><pre class="text-xs font-mono text-blue-300 m-0">${escapeHtml(
        JSON.stringify({ function: message.name, args: message.arguments }, null, 2),
      )}</pre></div>`;
      break;
    case "functionresponse":
      content = `<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700"><pre class="text-xs font-mono text-emerald-300 m-0">${escapeHtml(
        JSON.stringify({ function: message.name, args: message.response }, null, 2),
      )}</pre></div>`;
      break;
  }
  return `
    <li class="flex flex-col space-y-2">
        <div class="flex items-center space-x-2">
          <span class="px-2 py-0.5 rounded text-xs font-medium border capitalize ${roleBadgeClass}">${message.role}</span>
          <span class="text-xs text-slate-500 font-medium uppercase tracking-wider">${message.type}</span>
        </div>
        <div>${content}</div>
    </li>`;
}

export function renderWebmcpReport(config: WebmcpConfig, testResults: TestResults): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebMCP Eval Results</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              sans: ['Inter', 'sans-serif'],
            }
          }
        }
      }
    </script>
</head>
<body class="bg-slate-50 text-slate-900 font-sans p-8 antialiased">
    <div class="max-w-5xl mx-auto space-y-8">
        <header class="border-b border-slate-200 pb-6 mb-8">
            <h1 class="text-3xl font-bold tracking-tight text-slate-900">Evaluation Results</h1>
        </header>
        
        <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 class="text-xl font-semibold mb-4 text-slate-800">Configuration</h2>
            ${renderWebmcpConfiguration(config)}
        </section>

        <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 class="text-xl font-semibold mb-4 text-slate-800">Summary</h2>
            ${renderEvalsSummary(testResults)}
        </section>

        <section class="space-y-6">
            <h2 class="text-xl font-semibold text-slate-800 pb-2 border-b border-slate-200">Details</h2>
            ${renderDetails(testResults.results)}
        </section>
    </div>
</body>    
</html>`;
}

function renderWebmcpConfiguration(config: WebmcpConfig): string {
  return `
<ul class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-600">
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">URL</strong> <code class="mt-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-800 font-mono break-all">${config.url}</code></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Evals</strong> <code class="mt-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-800 font-mono break-all">${config.evalsFile}</code></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Backend</strong> <span class="mt-1 text-slate-800">${config.backend}</span></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Model</strong> <span class="mt-1 text-slate-800">${config.model}</span></li>
</ul>`;
}
