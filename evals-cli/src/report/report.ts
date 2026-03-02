/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, WebmcpConfig } from "../types/config.js";
import { Message, TestResult, TestResults, FunctionCall } from "../types/evals.js";
import { matchesArgument } from "../matcher.js";
import { sortObjectKeys } from "../utils.js";

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
  const passRate = (
    (testResults.passCount / (testResults.passCount + testResults.failCount)) *
    100
  ).toFixed(1);
  return `
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div class="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col">
                <span class="text-sm text-slate-500 font-medium">Total Evals</span>
                <span class="text-2xl font-bold text-slate-900">${testResults.testCount}</span>
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

function renderDetails(testResults: Array<TestResult>): string {
  return `<div class="space-y-4">${testResults.map((t, i) => renderDetail(i + 1, t)).join("")}</div>`;
}

// FIXME: Add graceful handling of expected calls
function renderDetail(testNumber: number, testResult: TestResult): string {
  const functionNameOutcome =
    (testResult.test.expectedCall?.[0] as FunctionCall)?.functionName ===
      testResult.response?.functionName
      ? "pass"
      : "fail";

  const argsOutcome = matchesArgument(
    (testResult.test.expectedCall?.[0] as FunctionCall)?.arguments,
    testResult.response?.args,
  )
    ? "pass"
    : "fail";
    
  const badgeClass = testResult.outcome === 'pass' 
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
    : testResult.outcome === 'fail'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : 'bg-amber-100 text-amber-800 border-amber-200';

  return `
    <div class="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <details class="group">
            <summary class="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors select-none font-medium text-slate-800">
                <span>Test #${testNumber}</span>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}">
                    ${testResult.outcome.toUpperCase()}
                </span>
            </summary>
            
            <div class="p-4 border-t border-slate-100 bg-slate-50 space-y-6">
                <details class="group/msgs bg-white rounded border border-slate-200">
                    <summary class="p-3 font-medium text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                        Messages
                    </summary>
                    <div class="p-3 border-t border-slate-100">
                        ${renderMessages(testResult.test.messages)}
                    </div>
                </details>

                <div class="bg-white rounded border border-slate-200 overflow-hidden">
                    <h4 class="text-sm font-medium text-slate-700 bg-slate-50 p-3 border-b border-slate-200">
                        <a href="#result-${testNumber}" class="hover:text-blue-600 transition-colors">Result</a>
                    </h4>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm text-slate-600">
                            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th class="px-4 py-2 font-medium">Type</th>
                                    <th class="px-4 py-2 font-medium">Expected</th>
                                    <th class="px-4 py-2 font-medium">Actual</th>
                                    <th class="px-4 py-2 font-medium w-24">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr class="hover:bg-slate-50/50">
                                    <td class="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">Function</td>
                                    <td class="px-4 py-3"><code class="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xs">${(testResult.test.expectedCall?.[0] as FunctionCall)?.functionName || null}</code></td>
                                    <td class="px-4 py-3"><code class="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xs">${testResult.response?.functionName || null}</code></td>
                                    <td class="px-4 py-3">
                                        <span class="${functionNameOutcome === 'pass' ? 'text-emerald-600' : 'text-rose-600'} font-semibold text-xs">
                                            ${functionNameOutcome.toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                                <tr class="hover:bg-slate-50/50">
                                    <td class="px-4 py-3 font-medium text-slate-700 whitespace-nowrap align-top">Arguments</td>
                                    <td class="px-4 py-3">
                                        <div class="bg-slate-800 rounded p-3 overflow-x-auto">
                                            <pre class="text-xs text-slate-200 font-mono m-0 leading-relaxed">${JSON.stringify(sortObjectKeys((testResult.test.expectedCall?.[0] as FunctionCall)?.arguments) || null, null, 2)}</pre>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="bg-slate-800 rounded p-3 overflow-x-auto">
                                            <pre class="text-xs text-slate-200 font-mono m-0 leading-relaxed">${JSON.stringify(sortObjectKeys(testResult.response?.args) || null, null, 2)}</pre>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3 align-top">
                                        <span class="${argsOutcome === 'pass' ? 'text-emerald-600' : 'text-rose-600'} font-semibold text-xs mt-2 inline-block">
                                            ${argsOutcome.toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                ${renderTrajectory(testResult.trajectory)}
            </div>
        </details>
    </div>`;
}

function renderTrajectory(trajectory?: any[]): string {
  if (!trajectory || trajectory.length === 0) return "";
  
  return `
    <details class="group/traj bg-white rounded border border-slate-200 mt-6">
      <summary class="p-3 font-medium text-sm text-slate-700 cursor-pointer hover:bg-slate-50 border-b border-transparent group-open/traj:border-slate-200">
        Trajectory
      </summary>
      <div class="p-4 space-y-6">
        ${trajectory.map((step, index) => {
          let html = '<div class="relative pl-6 border-l-2 border-slate-200 space-y-3 pb-6 last:pb-0">' +
                     '<div class="absolute w-3 h-3 bg-slate-200 rounded-full -left-[7px] top-1"></div>' +
                     '<strong class="block text-sm text-slate-900 font-semibold mb-2">Step ' + (index + 1) + '</strong>';
          
          if (step.text) {
            html += '<div><em class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Thoughts:</em>' +
                    '<pre class="whitespace-pre-wrap bg-slate-50 p-3 rounded-md text-sm text-slate-700 border border-slate-200 font-sans">' + step.text + '</pre></div>';
          }
          if (step.toolCalls && step.toolCalls.length > 0) {
            html += '<div><em class="text-xs font-semibold text-blue-500 uppercase tracking-wider block mb-1">Tool Calls:</em>' +
                    '<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700">' +
                    '<pre class="text-xs text-blue-300 font-mono m-0">' + JSON.stringify(step.toolCalls, null, 2) + '</pre>' +
                    '</div></div>';
          }
          if (step.toolResults && step.toolResults.length > 0) {
            html += '<div><em class="text-xs font-semibold text-emerald-500 uppercase tracking-wider block mb-1">Tool Results:</em>' +
                    '<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700">' +
                    '<pre class="text-xs text-emerald-300 font-mono m-0">' + JSON.stringify(step.toolResults, null, 2) + '</pre>' +
                    '</div></div>';
          }
          html += '</div>';
          return html;
        }).join("")}
      </div>
    </details>
  `;
}

function renderMessages(messages: Array<Message>): string {
  return `<ul class="space-y-4">${messages.map(renderMessage).join("")}</ul>`;
}

function renderMessage(message: Message): string {
  let content;
  let roleBadgeClass = message.role === "user" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-blue-100 text-blue-800 border-blue-200";
  
  switch (message.type) {
    case "message":
      content = `<div class="bg-slate-50 border border-slate-200 p-3 rounded-md text-sm text-slate-700 whitespace-pre-wrap">${message.content}</div>`;
      break;
    case "functioncall":
      content = `<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700"><pre class="text-xs font-mono text-blue-300 m-0">${JSON.stringify(
        { function: message.name, args: message.arguments },
        null,
        2,
      )}</pre></div>`;
      break;
    case "functionresponse":
      content = `<div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700"><pre class="text-xs font-mono text-emerald-300 m-0">${JSON.stringify(
        { function: message.name, args: message.response },
        null,
        2,
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

export function renderWebmcpReport(
  config: WebmcpConfig,
  testResults: TestResults,
): string {
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
