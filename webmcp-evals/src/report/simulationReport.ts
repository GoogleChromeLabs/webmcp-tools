/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The HTML report for `simulate`. Its rows are verdicts, not steps: a
 * simulation produces exactly one judgement, and the trajectory that led there
 * is detail behind it rather than the subject (ADR D9).
 */

import { SimulationConfig } from "../types/config.js";
import { SimulationVerdict } from "../types/simulations.js";
import { ConversationTurn } from "../simulate/conversation.js";
import { ToolCallOutcome } from "../simulate/toolSequence.js";
import { SimulationResult, SimulationResults } from "../evaluator/simulationEvaluator.js";
import { ANALYZER_MODEL_DEFAULT } from "../analyzer/index.js";
import {
  escapeHtml,
  getCompactTimestamp,
  getDetailedTimestamp,
  renderBrowserConsoleErrors,
  renderTrajectory,
} from "./report.js";

const OUTCOME_BADGES = {
  pass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  fail: "bg-rose-100 text-rose-800 border-rose-200",
  error: "bg-amber-100 text-amber-800 border-amber-200",
} as const;

type SimulationGroup = {
  name: string;
  runs: SimulationResult[];
  passCount: number;
};

function groupBySimulation(results: SimulationResult[]): SimulationGroup[] {
  const groups = new Map<string, SimulationGroup>();
  for (const result of results) {
    const name = result.simulation.name;
    if (!groups.has(name)) groups.set(name, { name, runs: [], passCount: 0 });
    const group = groups.get(name)!;
    group.runs.push(result);
    if (result.outcome === "pass") group.passCount++;
  }
  return [...groups.values()];
}

function renderSummary(results: SimulationResults): string {
  const total = results.results.length;
  const passRate = (total > 0 ? (results.passCount / total) * 100 : 0).toFixed(1);
  const runs = results.results.reduce((max, result) => Math.max(max, result.runIndex), 1);

  return `
        <p class="text-sm text-slate-500 mb-4 font-medium">
          Judged <strong class="font-semibold text-slate-700">${results.simulationCount} simulation${results.simulationCount !== 1 ? "s" : ""}</strong> across <strong class="font-semibold text-slate-700">${runs} run${runs !== 1 ? "s" : ""}</strong>.
        </p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div class="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col">
                <span class="text-sm text-slate-500 font-medium">Verdicts</span>
                <span class="text-2xl font-bold text-slate-900">${total}</span>
            </div>
            <div class="bg-emerald-50 p-4 rounded-lg border border-emerald-100 flex flex-col">
                <span class="text-sm text-emerald-600 font-medium">Passed</span>
                <span class="text-2xl font-bold text-emerald-700">${results.passCount}</span>
            </div>
            <div class="bg-rose-50 p-4 rounded-lg border border-rose-100 flex flex-col">
                <span class="text-sm text-rose-600 font-medium">Failed</span>
                <span class="text-2xl font-bold text-rose-700">${results.failCount}</span>
            </div>
            <div class="bg-amber-50 p-4 rounded-lg border border-amber-100 flex flex-col">
                <span class="text-sm text-amber-600 font-medium">No verdict</span>
                <span class="text-2xl font-bold text-amber-700">${results.errorCount}</span>
            </div>
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col">
                <span class="text-sm text-blue-600 font-medium">Pass Rate</span>
                <span class="text-2xl font-bold text-blue-700">${passRate}%</span>
            </div>
        </div>`;
}

function renderConfiguration(config: SimulationConfig): string {
  return `
<ul class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-600">
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">URL</strong> <code class="mt-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-800 font-mono break-all">${escapeHtml(config.url)}</code></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Simulations</strong> <code class="mt-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-800 font-mono break-all">${escapeHtml(config.simulationsFile)}</code></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Agent under test</strong> <span class="mt-1 text-slate-800">${escapeHtml(config.model)}</span></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Simulated user</strong> <span class="mt-1 text-slate-800">${escapeHtml(config.userModel || config.model)}</span></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Judge</strong> <span class="mt-1 text-slate-800">${escapeHtml(config.judgeModel || ANALYZER_MODEL_DEFAULT)}</span></li>
    <li class="flex flex-col"><strong class="text-slate-900 font-medium">Chrome channel</strong> <span class="mt-1 text-slate-800">${escapeHtml(config.chromeChannel || "chrome-canary")}</span></li>
</ul>`;
}

/**
 * Under its own heading, and never among the agent's tool calls: crediting the
 * agent with work the harness did is the one misreading this report has to make
 * impossible (ADR D5).
 */
function renderSetupCalls(setupCalls?: ToolCallOutcome[]): string {
  if (!setupCalls?.length) return "";

  return `
    <div class="bg-white rounded-lg border border-violet-200 overflow-hidden">
      <div class="p-3 bg-violet-50/60 border-b border-violet-200">
        <h5 class="text-xs font-semibold text-violet-900 uppercase tracking-wider">World state before the conversation</h5>
        <p class="text-xs text-violet-700 mt-1">Performed by the harness to set the scene. Not the agent's work.</p>
      </div>
      <ul class="divide-y divide-slate-100">
        ${setupCalls
          .map(
            (call) => `
          <li class="p-3 space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold text-slate-400">#${call.index}</span>
              <span class="font-mono text-xs font-semibold text-slate-800">${escapeHtml(call.functionName)}</span>
              ${
                call.outcome === "error"
                  ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold border ${OUTCOME_BADGES.error}">FAILED</span>`
                  : ""
              }
            </div>
            <pre class="whitespace-pre-wrap text-xs text-slate-600 font-mono m-0">${escapeHtml(JSON.stringify(call.arguments, null, 2))}</pre>
            <pre class="whitespace-pre-wrap text-xs ${call.outcome === "error" ? "text-amber-800" : "text-slate-500"} font-mono m-0">${escapeHtml(
              call.outcome === "error" ? call.error || "" : JSON.stringify(call.result ?? null),
            )}</pre>
          </li>`,
          )
          .join("")}
      </ul>
    </div>`;
}

/**
 * The reasoning and the cited evidence sit in the open, not behind a further
 * collapse. The criteria are prose, so the harness cannot cross-check the
 * verdict; this is the whole audit trail it carries (ADR D10).
 */
function renderVerdict(verdict: SimulationVerdict, criteria: string): string {
  return `
    <div class="space-y-3">
      <div class="bg-white rounded-lg border border-slate-200 p-3">
        <h5 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Success criteria, as authored</h5>
        <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(criteria)}</p>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-3">
        <h5 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Judge's reasoning</h5>
        <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(verdict.reasoning)}</p>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-3">
        <h5 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Evidence the judge cited</h5>
        <ul class="space-y-2">
          ${verdict.evidence
            .map(
              (item) =>
                `<li class="border-l-2 border-blue-300 pl-3 text-xs text-slate-700 font-mono whitespace-pre-wrap">${escapeHtml(item)}</li>`,
            )
            .join("")}
        </ul>
      </div>
    </div>`;
}

function renderTurn(turn: ConversationTurn): string {
  return `
    <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div class="p-3 border-b border-slate-100 bg-slate-50/60">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Turn ${turn.index}</span>
      </div>
      <div class="p-3 space-y-3">
        <div>
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold border bg-purple-100 text-purple-800 border-purple-200">Simulated user</span>
          <p class="mt-1 text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(turn.userMessage)}</p>
        </div>
        ${
          turn.toolCalls.length > 0
            ? `<div>
                 <em class="text-xs font-semibold text-blue-500 uppercase tracking-wider block mb-1">Tool calls (${turn.toolCalls.length})</em>
                 <div class="bg-slate-800 rounded-md p-3 overflow-x-auto border border-slate-700">
                   <pre class="text-xs text-blue-300 font-mono m-0">${escapeHtml(JSON.stringify(turn.toolCalls, null, 2))}</pre>
                 </div>
               </div>`
            : `<p class="text-xs text-slate-400 italic">No tool calls in this turn.</p>`
        }
        <div>
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold border bg-blue-100 text-blue-800 border-blue-200">Agent</span>
          <p class="mt-1 text-sm text-slate-700 whitespace-pre-wrap">${
            turn.agentText.trim()
              ? escapeHtml(turn.agentText)
              : '<em class="text-slate-400">Said nothing.</em>'
          }</p>
        </div>
        ${renderTrajectory(turn.steps)}
      </div>
    </div>`;
}

function renderRun(result: SimulationResult, totalRuns: number): string {
  const badge = OUTCOME_BADGES[result.outcome];
  const turnsUsed = result.verdict?.turnsUsed ?? result.conversation?.turnsUsed;
  const endedBy = result.verdict?.endedBy ?? result.conversation?.endedBy;

  return `
    <div class="border border-slate-200 rounded-lg bg-white shadow-xs overflow-hidden">
      <details class="group/run" open>
        <summary class="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50/80 transition-all duration-200 select-none font-medium text-slate-700 text-sm">
          <div class="flex items-center space-x-2">
            <svg aria-hidden="true" class="w-4 h-4 text-slate-400 group-open/run:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="font-semibold">Run #${result.runIndex}/${totalRuns}</span>
          </div>
          <div class="flex items-center gap-2">
            ${
              turnsUsed !== undefined
                ? `<span class="text-xs text-slate-500">${turnsUsed} turn${turnsUsed === 1 ? "" : "s"}</span>`
                : ""
            }
            ${
              endedBy
                ? // Neutral by design: a run that used its whole budget and
                  // still got the job done is a pass, not a problem (ADR D6).
                  `<span class="px-2 py-0.5 rounded text-xs font-medium border bg-slate-100 text-slate-600 border-slate-200">ended by ${escapeHtml(endedBy)}</span>`
                : ""
            }
            <span class="px-2.5 py-0.5 rounded text-xs font-semibold border ${badge}">${result.outcome.toUpperCase()}</span>
          </div>
        </summary>

        <div class="p-4 border-t border-slate-100 bg-slate-50/30 space-y-4">
          ${
            result.error
              ? `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                   <h5 class="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">Never reached a verdict</h5>
                   <pre class="whitespace-pre-wrap text-xs text-amber-900 font-mono m-0">${escapeHtml(result.error)}</pre>
                 </div>`
              : ""
          }
          ${
            result.verdict
              ? renderVerdict(result.verdict, result.simulation.successCriteria)
              : `<div class="bg-white rounded-lg border border-slate-200 p-3">
                   <h5 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Success criteria, as authored</h5>
                   <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(result.simulation.successCriteria)}</p>
                 </div>`
          }
          ${renderSetupCalls(result.setupCalls)}
          <div class="bg-white rounded-lg border border-slate-200 p-3">
            <h5 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">The user's brief</h5>
            <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(result.simulation.userScenario)}</p>
          </div>
          <div class="space-y-3">
            <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversation</h4>
            ${
              result.conversation?.turns.length
                ? result.conversation.turns.map(renderTurn).join("")
                : `<p class="text-xs text-slate-400 italic">Nothing was exchanged.</p>`
            }
            ${
              result.conversation?.closingMessage
                ? `<div class="bg-white rounded-lg border border-slate-200 p-3">
                     <span class="px-2 py-0.5 rounded text-[10px] font-semibold border bg-purple-100 text-purple-800 border-purple-200">Simulated user closed</span>
                     <p class="mt-1 text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(result.conversation.closingMessage)}</p>
                   </div>`
                : ""
            }
          </div>
          ${renderBrowserConsoleErrors(result.browserConsoleErrors)}
        </div>
      </details>
    </div>`;
}

function renderSimulationCard(group: SimulationGroup, index: number, total: number): string {
  const allPassed = group.passCount === group.runs.length;
  const isOpen = allPassed ? "" : "open";
  const onlyRun = group.runs.length === 1 ? group.runs[0] : undefined;
  const turnsUsed = onlyRun?.verdict?.turnsUsed ?? onlyRun?.conversation?.turnsUsed;
  const endedBy = onlyRun?.verdict?.endedBy ?? onlyRun?.conversation?.endedBy;

  const containerClass = allPassed
    ? "border border-emerald-200 rounded-xl bg-white shadow-sm overflow-hidden"
    : "border border-rose-200 rounded-xl bg-white shadow-sm overflow-hidden";
  const headerBgClass = allPassed
    ? "bg-emerald-50/40 hover:bg-emerald-50/70"
    : "bg-rose-50/40 hover:bg-rose-50/70";
  const titleColorClass = allPassed ? "text-emerald-900" : "text-rose-900";
  const badgeClass = onlyRun
    ? OUTCOME_BADGES[onlyRun.outcome]
    : allPassed
      ? OUTCOME_BADGES.pass
      : OUTCOME_BADGES.fail;
  const badgeText = onlyRun
    ? onlyRun.outcome.toUpperCase()
    : `${group.passCount}/${group.runs.length} Passed`;

  return `
    <div class="${containerClass}">
      <details class="group/case" ${isOpen}>
        <summary class="flex items-center justify-between p-5 cursor-pointer ${headerBgClass} transition-all duration-200 select-none">
          <div class="flex items-center space-x-3 flex-1 min-w-0 mr-4">
            <svg aria-hidden="true" class="w-5 h-5 text-slate-400 group-open/case:rotate-90 transition-transform duration-200 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
            <div class="truncate">
              <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Simulation #${index}/${total}</span>
              <h3 class="text-base font-semibold ${titleColorClass} truncate font-sans">${escapeHtml(group.name)}</h3>
            </div>
          </div>
          <div class="flex items-center space-x-3 shrink-0">
            ${
              turnsUsed !== undefined
                ? `<span class="text-xs text-slate-500">${turnsUsed} turn${turnsUsed === 1 ? "" : "s"}</span>`
                : ""
            }
            ${
              endedBy
                ? `<span class="px-2 py-0.5 rounded text-xs font-medium border bg-slate-100 text-slate-600 border-slate-200">ended by ${escapeHtml(endedBy)}</span>`
                : ""
            }
            <span class="px-3 py-1 rounded text-xs font-semibold border ${badgeClass}">${badgeText}</span>
          </div>
        </summary>

        <div class="p-5 border-t border-slate-100 bg-slate-50/50 space-y-5">
          ${group.runs.map((run) => renderRun(run, group.runs.length)).join("")}
        </div>
      </details>
    </div>`;
}

export function renderSimulationReport(
  config: SimulationConfig,
  results: SimulationResults,
): string {
  const groups = groupBySimulation(results.results);

  // TODO(simulate): third copy of this document shell, after `renderReport`
  // and `renderWebmcpReport`. Collapse the three into one when the simulation
  // type is accepted; doing it now would mean editing both existing reporters.
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebMCP Simulation Results ${getCompactTimestamp()}</title>
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
            <h1 class="text-3xl font-bold tracking-tight text-slate-900">Simulation Results</h1>
            <p class="text-sm text-slate-500 mt-1">Generated on ${getDetailedTimestamp()}</p>
        </header>

        <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 class="text-xl font-semibold mb-4 text-slate-800">Configuration</h2>
            ${renderConfiguration(config)}
        </section>

        <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 class="text-xl font-semibold mb-4 text-slate-800">Summary</h2>
            ${renderSummary(results)}
        </section>

        <section class="space-y-6">
            <h2 class="text-xl font-semibold text-slate-800 pb-2 border-b border-slate-200">Verdicts</h2>
            ${groups.map((group, index) => renderSimulationCard(group, index + 1, groups.length)).join("")}
        </section>
    </div>
</body>
</html>`;
}
