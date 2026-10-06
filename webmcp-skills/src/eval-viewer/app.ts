/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface EvalRun {
  output: string;
  timing: { total_tokens: number; duration_ms: number };
  agent?: { turns: number; files_read: string[] };
  grading: {
    assertion_results: Array<{ text: string; passed: boolean; evidence: string }>;
    summary: { passed: number; failed: number; total: number; pass_rate: number };
  };
}

interface EvalCardData {
  id: string;
  with_skill?: EvalRun;
  without_skill?: EvalRun;
}

interface IterationData {
  iteration: number;
  skill_name: string;
  benchmark: {
    metadata?: {
      runs_per_configuration?: number;
      total_runs?: number;
      model?: string;
    };
    run_summary: {
      with_skill: {
        pass_rate: { mean: number };
        time_seconds: { mean: number };
        tokens: { mean: number };
        files_read?: { mean: number };
      };
      without_skill?: {
        pass_rate: { mean: number };
        time_seconds: { mean: number };
        tokens: { mean: number };
      };
      delta?: { pass_rate: number; time_seconds: number; tokens: number };
    };
    eval_results?: Array<{
      id: string;
      with_skill: {
        passed: boolean;
        pass_rate: number;
        time_seconds: number;
        tokens: number;
      };
      without_skill?: {
        passed: boolean;
        pass_rate: number;
        time_seconds: number;
        tokens: number;
      };
      delta_pass_rate?: number;
    }>;
  };
  evals: EvalCardData[];
  feedback: Record<string, string>;
}

async function loadData() {
  const res = await fetch("/api/workspace");
  const data: { iterations: IterationData[] } = await res.json();
  const select = document.getElementById("iterationSelect") as HTMLSelectElement;
  const container = document.getElementById("evalsContainer")!;
  const stats = document.getElementById("benchmarkStats")!;

  if (!data.iterations || data.iterations.length === 0) {
    container.innerHTML =
      '<p style="color: var(--text-muted)">No benchmark iterations found in workspace. Run "npm test" first.</p>';
    return;
  }

  select.innerHTML = data.iterations
    .map(
      (it) =>
        `<option value="${it.iteration}">Iteration ${it.iteration} (${it.skill_name})</option>`,
    )
    .join("");

  function renderIteration(iterationNum: number) {
    const it = data.iterations.find((i) => i.iteration === iterationNum) || data.iterations[0];
    const summary = it.benchmark.run_summary;
    const runsPerConfig = it.benchmark.metadata?.runs_per_configuration;

    stats.innerHTML = `
      ${
        runsPerConfig
          ? `
      <div class="metric">
        <span class="metric-label">Runs / Config</span>
        <span class="metric-val">${runsPerConfig}</span>
      </div>`
          : ""
      }
      <div class="metric">
        <span class="metric-label">With Skill Pass Rate</span>
        <span class="metric-val">${Math.round(summary.with_skill.pass_rate.mean * 100)}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">Avg Latency</span>
        <span class="metric-val">${summary.with_skill.time_seconds.mean}s</span>
      </div>
      <div class="metric">
        <span class="metric-label">Avg Tokens</span>
        <span class="metric-val">${Math.round(summary.with_skill.tokens.mean)}</span>
      </div>
      ${
        summary.with_skill.files_read
          ? `
      <div class="metric">
        <span class="metric-label">Avg Files Read</span>
        <span class="metric-val">${summary.with_skill.files_read.mean}</span>
      </div>`
          : ""
      }
      ${
        summary.delta
          ? `
      <div class="metric">
        <span class="metric-label">Skill Delta</span>
        <span class="metric-val" style="color: ${summary.delta.pass_rate >= 0 ? "var(--pass)" : "var(--fail)"}">
          ${summary.delta.pass_rate >= 0 ? "+" : ""}${Math.round(summary.delta.pass_rate * 100)}%
        </span>
      </div>`
          : ""
      }
    `;

    container.innerHTML = it.evals
      .map((e) => {
        const evalReport = it.benchmark.eval_results?.find((r) => r.id === e.id);
        const withSummary = e.with_skill?.grading?.summary;
        const passed = evalReport
          ? evalReport.with_skill.passed
          : withSummary
            ? withSummary.failed === 0
            : false;
        const passRate = evalReport
          ? evalReport.with_skill.pass_rate
          : withSummary
            ? withSummary.pass_rate
            : 0;
        const currentFeedback = it.feedback[e.id] || "";

        return `
        <div class="eval-card">
          <div class="eval-header">
            <span class="eval-title">${e.id}</span>
            <span class="badge ${passed ? "badge-pass" : "badge-fail"}">
              ${passed ? "PASS" : "FAIL"} (${Math.round(passRate * 100)}%)
            </span>
          </div>
          <div class="eval-body">
            <div class="run-pane">
              <div class="pane-title">
                <span>With Skill</span>
                <span>${e.with_skill ? `${e.with_skill.timing.duration_ms}ms · ${e.with_skill.timing.total_tokens} tokens` : "N/A"}</span>
              </div>
              ${renderFilesRead(e.with_skill)}
              <div class="pane-output">${e.with_skill ? escapeHtml(e.with_skill.output) : "No output"}</div>
              <ul class="assertions-list">
                ${(e.with_skill?.grading.assertion_results || [])
                  .map(
                    (a) => `
                  <li class="assertion-item">
                    <span class="assertion-status" style="color: ${a.passed ? "var(--pass)" : "var(--fail)"}">
                      ${a.passed ? "✓" : "✗"}
                    </span>
                    <span>${escapeHtml(a.text)}</span>
                    <div class="evidence">${escapeHtml(a.evidence)}</div>
                  </li>
                `,
                  )
                  .join("")}
              </ul>
            </div>

            <div class="run-pane">
              <div class="pane-title">
                <span>Without Skill (Baseline)</span>
                <span>${e.without_skill ? `${e.without_skill.timing.duration_ms}ms · ${e.without_skill.timing.total_tokens} tokens` : "N/A"}</span>
              </div>
              ${renderFilesRead(e.without_skill)}
              <div class="pane-output">${e.without_skill ? escapeHtml(e.without_skill.output) : "No baseline run"}</div>
              <ul class="assertions-list">
                ${(e.without_skill?.grading.assertion_results || [])
                  .map(
                    (a) => `
                  <li class="assertion-item">
                    <span class="assertion-status" style="color: ${a.passed ? "var(--pass)" : "var(--fail)"}">
                      ${a.passed ? "✓" : "✗"}
                    </span>
                    <span>${escapeHtml(a.text)}</span>
                    <div class="evidence">${escapeHtml(a.evidence)}</div>
                  </li>
                `,
                  )
                  .join("")}
              </ul>
            </div>
          </div>
          <div style="padding: 0 16px 16px 16px;">
            <div class="feedback-section">
              <textarea class="feedback-input" id="fb-${e.id}" placeholder="Add review feedback for this eval...">${escapeHtml(currentFeedback)}</textarea>
              <button class="save-feedback-btn" onclick="saveFeedback('${it.skill_name}', ${it.iteration}, '${e.id}')">Save Feedback</button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  select.addEventListener("change", () => {
    renderIteration(parseInt(select.value, 10));
  });

  renderIteration(parseInt(select.value, 10));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFilesRead(run: EvalRun | undefined): string {
  if (!run?.agent) return "";
  const files = run.agent.files_read.length > 0 ? run.agent.files_read.join(", ") : "none";
  return `<div class="evidence">Files read (${run.agent.turns} turns): ${escapeHtml(files)}</div>`;
}

(
  window as unknown as { saveFeedback: (skill: string, iter: number, id: string) => Promise<void> }
).saveFeedback = async (skill: string, iter: number, id: string) => {
  const textarea = document.getElementById(`fb-${id}`) as HTMLTextAreaElement;
  const feedback = textarea.value;

  await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skill, iteration: iter, eval_id: id, feedback }),
  });

  alert("Feedback saved to feedback.json");
};

loadData();
