// ============================================================
// FOCUS — WebMCP Companion (test bench)
//
// Runs in a *separate* same-origin browser window (companion.html),
// opened by the main FOCUS window. It talks to the main window by JS
// reference through window.opener — no serialization, no postMessage.
//
// It is the ground-truth "is WebMCP exposed?" harness:
//   • Enumerates the ACTUAL registered-tool Map on the main window
//     (window.opener.__webmcp_registered_tools).
//   • Shows a live read-only snapshot of the store
//     (window.opener.__focus_state, pushed by companionBridge).
//   • Runs any tool by delegating to the peer's modelContext
//     (window.opener.__focus_exec(name, args)).
//   • Drives a real agentic loop against an OpenAI-compatible endpoint,
//     surfacing the exact WebMCP tool surface to the model via the
//     standard `tools`/`tool_calls` protocol.
//
// The API key is held in-memory only, sent only to the configured
// endpoint, and never persisted or echoed.
// ============================================================

import './companion.css';

const MAX_LOOP_TURNS = 8;

// --- Operation classes, matching the FOCUS tool table. ---
// Read is derived from annotations.readOnlyHint (registered by the tools).
// These two are the mutating classes:
const CLASS_PROPOSAL = new Set([
  'propose_focus_block', 'restructure_plan', 'defer_task', 'override_plan',
]);
const CLASS_CONSEQUENTAL = new Set([
  'start_focus_block', 'complete_focus_block',
]);

function classify(name, annotations) {
  if (annotations && annotations.readOnlyHint === true) return 'read';
  if (CLASS_CONSEQUENTAL.has(name)) return 'consequential';
  return 'proposal';
}

const CLASS_LABEL = { read: 'READ', proposal: 'PROPOSE', consequential: 'CONSEQ' };
const CLASS_GROUP_TITLE = { read: 'Read', proposal: 'Proposal', consequential: 'Consequential' };

// --- Escape helpers (arg form values are untrusted strings). ---
const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
const escapeAttr = (v) => escapeHtml(v).replace(/`/g, '&#96;');

// --- DOM shell. ---
const app = document.getElementById('app');
app.innerHTML = `
  <div class="bench" id="bench">
    <header class="bench-head">
      <div class="bench-title">FOCUS&nbsp;·&nbsp;Think<span class="bench-note">WebMCP companion</span></div>
      <div class="bench-link-status" id="linkStatus">
        <span class="lamp"></span><span id="linkText">checking link</span>
      </div>
    </header>

    <div class="unlinked" id="unlinked">
      No connected FOCUS window found. Open this companion from the "WebMCP
      Companion" button in the main FOCUS window so it can reach the
      registered tools and live state.
    </div>

    <div class="bench-grid">
      <!-- TOOL INSPECTOR -->
      <section class="panel">
        <div class="panel-head">
          <span class="panel-label">WebMCP tools <span class="count" id="toolCount"></span></span>
          <button class="btn btn-secondary" id="refreshTools">Refresh</button>
        </div>
        <div class="panel-body" id="toolList"></div>
      </section>

      <!-- LIVE STATE -->
      <section class="panel">
        <div class="panel-head">
          <span class="panel-label">Live state</span>
          <span class="panel-sub">from main window</span>
        </div>
        <div class="panel-body">
          <div class="state-rows" id="stateRows"></div>
          <div class="state-epoch" id="stateEpoch">—</div>
        </div>
      </section>
    </div>

    <!-- AGENT LOOP -->
    <section class="panel">
      <div class="panel-head">
        <span class="panel-label">Agent loop</span>
        <span class="panel-sub">OpenAI-compatible · tools: function</span>
      </div>
      <div class="panel-body">
        <form class="agent-form" id="agentForm" autocomplete="off">
          <div class="arg-field">
            <label>Base URL</label>
            <input type="text" id="baseUrl" value="https://api.openai.com/v1"
                   placeholder="https://api.openai.com/v1">
          </div>
          <div class="arg-field">
            <label>API key <span class="req">*</span></label>
            <input type="password" id="apiKey" placeholder="sk-… (in-memory only)">
          </div>
          <div class="arg-field">
            <label>Model</label>
            <input type="text" id="model" value="gpt-4o-mini">
          </div>
          <div class="arg-field">
            <label>Prompt</label>
            <textarea class="agent-prompt" id="prompt"
              placeholder="e.g. I'm overwhelmed. Check my workload, assess overload, and tell me the next action."></textarea>
          </div>
          <div class="agent-run">
            <button type="submit" class="btn btn-primary" id="runAgent">Run agent loop</button>
            <span class="arg-hint">Key is never stored or echoed.</span>
          </div>
        </form>
        <div class="agent-log" id="agentLog"></div>
      </div>
    </section>

    <footer class="bench-foot">
      Tools run through <code>window.opener.__focus_exec</code> → the main window's
      <code>document.modelContext.executeTool</code>. Consequential tools still need
      human approval in the main UI. API key stays in this window's memory.
    </footer>
  </div>
`;

const $ = (sel) => app.querySelector(sel);
const $all = (sel) => app.querySelectorAll(sel);
const bench = $('#bench');

// --- Peer (main window) connectivity. ---
function getPeer() {
  try {
    const p = window.opener;
    if (p && !p.closed) return p;
  } catch (_) { /* cross-origin opener is not linked */ }
  return null;
}

// The peer's __webmcp_registered_tools is a Map created in the *main window's*
// realm. `instanceof Map` fails across realms (different Map constructors), so
// test for the shape we need instead of the identity.
const isToolMap = (m) => !!(m && typeof m.values === 'function' && typeof m.get === 'function');

function isLinked() {
  const p = getPeer();
  try {
    return !!(p && isToolMap(p.__webmcp_registered_tools));
  } catch (_) {
    return false;
  }
}

function getPeerState() {
  const p = getPeer();
  try { return p && p.__focus_state ? p.__focus_state : null; }
  catch (_) { return null; }
}

async function execPeerTool(name, args) {
  const p = getPeer();
  if (!p) throw new Error('Main FOCUS window is not linked');
  if (typeof p.__focus_exec !== 'function') {
    throw new Error('Main window has no __focus_exec (bridge not installed)');
  }
  return await p.__focus_exec(name, args);
}

// Convert a tool result to a string for the model / display.
function toolContentToString(result) {
  if (result == null) return 'null';
  if (typeof result === 'string') return result;
  if (typeof result === 'number' || typeof result === 'boolean') return String(result);
  if (result.content && Array.isArray(result.content)) {
    return result.content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('\n');
  }
  try { return JSON.stringify(result); }
  catch (_) { return String(result); }
}

// --- Render the link status each tick. ---
function updateLinkStatus() {
  const ok = isLinked();
  bench.classList.toggle('is-lost', !ok);
  const st = $('#linkStatus');
  const text = $('#linkText');
  if (ok) { st.className = 'bench-link-status is-linked'; text.textContent = 'linked to main window'; }
  else { st.className = 'bench-link-status is-lost'; text.textContent = 'not linked'; }
}

// --- Build an arg form for a tool's inputSchema. ---
// Returns { html, collect(scope), usesStateVersion }.
function buildArgForm(inputSchema) {
  const schema = inputSchema || {};
  const props = schema.properties || {};
  const required = schema.required || [];
  const keys = Object.keys(props);
  const usesStateVersion = keys.includes('expectedStateVersion');
  const visibleKeys = keys.filter((k) => k !== 'expectedStateVersion');

  if (visibleKeys.length === 0) {
    const intro = keys.length ? 'Auto-injects the current state version.' : 'No arguments.';
    return { html: `<div class="arg-hint">${intro}</div>`, collect: () => ({}), usesStateVersion };
  }

  let html = '<div class="arg-form">';
  for (const key of visibleKeys) {
    const meta = props[key] || {};
    const isReq = required.includes(key);
    const reqStar = isReq ? ' <span class="req">*</span>' : '';
    const hint = meta.description ? `placeholder="${escapeAttr(meta.description)}"` : '';

    if (Array.isArray(meta.enum) && meta.enum.length) {
      html += `
        <div class="arg-field">
          <label>${escapeHtml(key)}${reqStar}</label>
          <select data-key="${escapeAttr(key)}">
            ${meta.enum.map((v) => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('')}
          </select>
        </div>`;
    } else if (meta.type === 'number' || meta.type === 'integer') {
      html += `
        <div class="arg-field">
          <label>${escapeHtml(key)}${reqStar}</label>
          <input type="number" data-key="${escapeAttr(key)}" ${isReq ? 'required' : ''} step="any" ${hint}>
        </div>`;
    } else {
      html += `
        <div class="arg-field">
          <label>${escapeHtml(key)}${reqStar}</label>
          <input type="text" data-key="${escapeAttr(key)}" ${isReq ? 'required' : ''} ${hint}>
        </div>`;
    }
  }
  html += '</div>';

  const collect = (scope) => {
    const out = {};
    scope.querySelectorAll('[data-key]').forEach((inp) => {
      if (inp.value === '') return;
      let v = inp.value;
      if (inp.type === 'number') { v = Number(v); if (Number.isNaN(v)) return; }
      out[inp.dataset.key] = v;
    });
    return out;
  };

  return { html, collect, usesStateVersion };
}

// --- Render the tool inspector, grouped by operation class. ---
function renderTools(tools) {
  const list = $('#toolList');
  if (!tools.length) {
    list.innerHTML = '<div class="arg-hint">No tools enumerated yet. Are you linked?</div>';
    $('#toolCount').textContent = '';
    return;
  }

  const byClass = { read: [], proposal: [], consequential: [] };
  for (const t of tools) byClass[classify(t.name, t.annotations)].push(t);
  const order = ['consequential', 'proposal', 'read']; // most-gated first
  const classTone = { read: 'op-read', proposal: 'op-proposal', consequential: 'op-consequential' };

  let html = '';
  for (const cls of order) {
    const items = byClass[cls];
    if (!items.length) continue;
    html += `
      <div class="tool-group ${classTone[cls]}">
        <div class="group-label">${CLASS_GROUP_TITLE[cls]}
          <span class="op-class">${CLASS_LABEL[cls]}</span>
        </div>`;
    for (const t of items) {
      const form = buildArgForm(t.inputSchema);
      const badge = cls === 'read' ? 'free' : (cls === 'consequential' ? 'gate' : 'propose');
      html += `
        <div class="tool" data-name="${escapeAttr(t.name)}">
          <div class="tool-row" data-toggle>
            <span class="tool-name">${escapeHtml(t.name)}</span>
            <span class="tool-badge ${badge}">${CLASS_LABEL[cls]}</span>
          </div>
          <div class="tool-detail">
            <div class="tool-desc">${escapeHtml(t.description || '')}</div>
            ${form.html}
            <button class="btn btn-primary btn-block" data-run>Run</button>
            <div class="tool-result" hidden></div>
          </div>
        </div>`;
    }
    html += '</div>';
  }
  list.innerHTML = html;

  $('#toolCount').textContent = `(${tools.length})`;
}

// --- Run a single tool from its detail panel. ---
async function runToolButton(toolEl) {
  const name = toolEl.dataset.name;
  const detail = toolEl.querySelector('.tool-detail');
  const btn = toolEl.querySelector('[data-run]');
  const resultEl = toolEl.querySelector('.tool-result');

  const schema = currentTools.find((t) => t.name === name)?.inputSchema;
  const form = buildArgForm(schema);
  const args = form.collect(detail);
  if (form.usesStateVersion) {
    const sv = getPeerState()?.stateVersion;
    if (sv !== undefined) args.expectedStateVersion = sv;
  }

  resultEl.hidden = false;
  resultEl.className = 'tool-result ';
  resultEl.textContent = 'Running…';
  btn.disabled = true;
  try {
    const res = await execPeerTool(name, args);
    resultEl.textContent = toolContentToString(res);
    const isErr = res && res.status === 'error';
    resultEl.className = 'tool-result ' + (isErr ? 'err' : 'ok');
  } catch (err) {
    resultEl.textContent = 'ERROR: ' + (err.message || String(err));
    resultEl.className = 'tool-result err';
  } finally {
    btn.disabled = false;
  }
}

// --- Live state readout. ---
function renderState(st) {
  if (!st) { $('#stateRows').innerHTML = '<div class="arg-hint">Waiting for link…</div>'; return; }

  const hl = (v) => (v === 'high' ? 'class="state-val clay"' : 'class="state-val hl"');
  const rows = [
    ['overload', `<span ${hl(st.overloadLevel)}>${escapeHtml(String(st.overloadLevel).toUpperCase())}</span>`],
    ['available', `<span class="state-val">${st.availableMinutes}m</span>`],
    ['bottleneck', `<span class="state-val">${st.bottleneckTaskId ? escapeHtml(st.bottleneckTaskId) : '—'}</span>`],
    ['tasks', `<span class="state-val">${st.activeCount} / ${st.taskCount} active</span>`],
    ['version', `<span class="state-val">v${st.stateVersion}</span>`],
  ];
  if (st.activeFocusBlock) {
    rows.push(['focus', `<span class="state-val hl">${escapeHtml(st.activeFocusBlock.taskId || st.activeFocusBlock.status || '')}</span>`]);
  }
  $('#stateRows').innerHTML = rows
    .map(([k, v]) => `<span class="state-key">${k}</span><span>${v}</span>`)
    .join('');

  $('#stateEpoch').textContent = 'updates live from the main window store';
}

// --- Agent-loop transcript. ---
function pushLog(kind, text) {
  const log = $('#agentLog');
  const el = document.createElement('div');
  el.className = 'log-entry ' + kind;
  const who = { user: 'you', assistant: 'agent', tool: 'tool', error: 'error' }[kind] || kind;
  el.innerHTML = `<span class="who">${who}</span> ${escapeHtml(text)}`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

// --- OpenAI-compatible agent loop. ---
// POSTs to the same-origin dev proxy (/api/agent-loop), which forwards to the
// configured upstream. OpenAI-compatible providers block in-browser CORS, so a
// direct fetch from the window is always denied; the proxy is what lets this
// actually reach the model. The key travels only in the Authorization header
// and only to the proxy.
async function runAgentLoop(env, tools, onLog) {
  const baseUrl = env.baseUrl.replace(/\/+$/, '');
  const messages = [{ role: 'user', content: env.prompt }];
  const fnTools = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  let finalText = '';
  for (let turn = 0; turn < MAX_LOOP_TURNS; turn++) {
    let data;
    try {
      const res = await fetch('/api/agent-loop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.apiKey}`,
        },
        body: JSON.stringify({ baseUrl, model: env.model, messages, tools: fnTools, tool_choice: 'auto' }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      data = JSON.parse(text);
    } catch (err) {
      const msg = env.redact('Network/API error — ' + (err.message || String(err)));
      onLog('error', msg);
      finalText = msg;
      break;
    }

    const msg = data.choices?.[0]?.message;
    if (!msg) { onLog('error', 'Message empty'); finalText = 'Message empty'; break; }
    messages.push(msg);

    const textPart = (msg.content || '').trim();
    const calls = msg.tool_calls || [];

    if (calls.length === 0) {
      if (textPart) onLog('assistant', textPart);
      finalText = textPart;
      break;
    }

    // The model wants tools.
    let turnSummary = '';
    for (const call of calls) {
      const fname = call.function?.name || '?';
      let fargs = {};
      try { fargs = JSON.parse(call.function?.arguments || '{}'); }
      catch (_) { fargs = {}; }
      onLog('assistant', `→ ${fname}(${jsonish(fargs)})`);
      try {
        const result = await execPeerTool(fname, fargs);
        const content = toolContentToString(result);
        onLog('tool', content);
        messages.push({ role: 'tool', tool_call_id: call.id, content });
        turnSummary += `${fname}: ${content}\n`;
      } catch (err) {
        const content = 'ERROR: ' + (err.message || String(err));
        onLog('tool', content);
        messages.push({ role: 'tool', tool_call_id: call.id, content });
        turnSummary += `${fname}: ${content}\n`;
      }
    }
    if (!turnSummary) {
      finalText = textPart;
      break;
    }
    continue; // loop for the model's next answer
  }
  return finalText;
}

const jsonish = (o) => {
  if (typeof o === 'string') return o;
  try { return JSON.stringify(o); } catch (_) { return String(o); }
};

// --- Wire up. ---
let currentTools = [];

function refreshTools() {
  const p = getPeer();
  let tools = [];
  if (p) {
    try {
      const map = p.__webmcp_registered_tools;
      if (isToolMap(map)) tools = Array.from(map.values());
    } catch (_) { /* not linkable */ }
  }
  currentTools = tools;
  renderTools(tools);
  $('#refreshTools').disabled = false;
}

// Toggle + run (event delegation).
$('#toolList').addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const toolEl = toggle.closest('.tool');
    toolEl.classList.toggle('open');
    return;
  }
  const run = e.target.closest('[data-run]');
  if (run) {
    const toolEl = run.closest('.tool');
    runToolButton(toolEl);
  }
});

$('#refreshTools').addEventListener('click', () => {
  $('#refreshTools').disabled = true;
  refreshTools();
});

// Agent form submit.
$('#agentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const apiKey = $('#apiKey').value.trim();
  const baseUrl = $('#baseUrl').value.trim();
  const model = $('#model').value.trim();
  const prompt = $('#prompt').value.trim();
  const logEl = $('#agentLog');
  logEl.innerHTML = '';

  if (!apiKey) { pushLog('error', 'Enter an API key.'); return; }
  if (!prompt) { pushLog('error', 'Enter a prompt.'); return; }
  if (currentTools.length === 0) refreshTools();
  if (currentTools.length === 0) { pushLog('error', 'No WebMCP tools enumerated — link to the main window first.'); return; }

  const redact = (s) => s.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '•••');
  pushLog('user', `post ${redact(baseUrl)}/chat/completions · model=${model}`);
  pushLog('user', prompt);
  $('#runAgent').disabled = true;
  try {
    await runAgentLoop(
      { baseUrl, apiKey, model, prompt, redact },
      currentTools,
      (kind, text) => pushLog(kind, text),
    );
  } catch (err) {
    pushLog('error', redact(err.message || String(err)));
  } finally {
    $('#runAgent').disabled = false;
  }
});

// --- Poll the peer's live state + link status. ---
function tick() {
  updateLinkStatus();
  renderState(getPeerState());
}
setInterval(tick, 400);
tick();
refreshTools();
