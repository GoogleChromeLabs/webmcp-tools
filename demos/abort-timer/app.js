/**
 * WebMCP AbortSignal Explorer — Application Logic
 *
 * Demonstrates the Web Model Context Protocol (WebMCP) execution cancellation
 * architecture using native DOM AbortSignal.
 *
 * Architecture Sections:
 * 1. Runtime State Model
 * 2. Section 1: Pure Headless Engine & Cancellation Core
 * 3. Section 2: WebMCP Tool Registration (document.modelContext.registerTool)
 * 4. Section 3: Unified Actuation Pathway (document.modelContext.executeTool)
 * 5. Section 4: UI State, Diagnostics & Keyboard Wiring
 */

// =============================================================================
// RUNTIME STATE MODEL
// =============================================================================

/**
 * Global WebMCP model context reference. Populated by ensureWebMCP().
 */
let modelContext = null;

/**
 * Dual engine state trackers.
 * Tracks elapsed execution time, current status, active AbortController,
 * internal cancellation handlers, and monotonically increasing runId for stale dispatch protection.
 */
const stateA = { elapsed: 0, status: 'idle', ctrl: null, cancel: null, abort: null, runId: 0 };
const stateB = { elapsed: 0, status: 'idle', ctrl: null, cancel: null, abort: null, runId: 0 };


// =============================================================================
// SECTION 1: PURE HEADLESS ENGINE & CANCELLATION CORE
// =============================================================================

/**
 * Ensure WebMCP document.modelContext is available.
 * If running on a browser without native Chrome 153 WebMCP support,
 * dynamically injects the WebMCP polyfill.
 */
async function ensureWebMCP() {
  if (window.document.modelContext) {
    return window.document.modelContext;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../shared/webmcp-polyfill.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load WebMCP polyfill'));
    document.head.appendChild(script);
  });

  const badge = document.getElementById('runtime-badge');
  if (badge) {
    badge.textContent = 'Polyfill Active';
    badge.className = 'badge badge-blue';
  }

  return window.document.modelContext;
}

/**
 * Pure reusable stopwatch execution engine.
 *
 * In Chrome 153 WebMCP, tools receive an AbortSignal that allows the host
 * (agent or user) to cooperatively interrupt long-running executions.
 *
 * @param {Object} options
 * @param {AbortSignal} [options.signal] - DOM AbortSignal for cooperative cancellation
 * @param {Function} [options.onTick] - Millisecond update callback (called per animation frame)
 * @param {number} [options.maxDurationSeconds=60] - Safety timeout in seconds
 * @param {number} [options.initialElapsed=0] - Starting elapsed milliseconds
 * @param {Function} [options.bindCancel] - Callback to expose hard cancellation (reset)
 * @param {Function} [options.bindAbort] - Callback to expose direct abort handle
 * @returns {Promise<{status: string, elapsedSeconds: string, reason: string}>}
 */
function startTimerExecution({ signal, onTick, maxDurationSeconds = 60, initialElapsed = 0, bindCancel, bindAbort }) {
  return new Promise((resolve) => {
    let elapsed = initialElapsed;
    let startTime = performance.now() - initialElapsed;
    let rafId = null;
    let isTerminated = false;

    function finish(status, reason) {
      if (isTerminated) return;
      isTerminated = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      resolve({
        status,
        elapsedSeconds: (elapsed / 1000).toFixed(2),
        reason
      });
    }

    // Hard cancellation handle for UI reset
    bindCancel?.(() => {
      finish('reset', 'Reset');
    });

    // Direct abort handle for pause / abort
    bindAbort?.((reason = 'Aborted') => {
      finish('paused', reason);
    });

    // 1. Check if already aborted before starting
    if (signal?.aborted) {
      return finish('paused', signal.reason || 'Pre-aborted');
    }

    // 2. Listen for cooperative cancellation via AbortSignal
    signal?.addEventListener('abort', () => {
      finish('paused', signal.reason || 'AbortSignal triggered');
    }, { once: true });

    // 3. Execution loop (ticks at ~60 FPS)
    function tick() {
      if (isTerminated) return;
      elapsed = performance.now() - startTime;
      onTick?.(elapsed);
      if (elapsed >= maxDurationSeconds * 1000) {
        return finish('completed', 'Max duration reached');
      }
      if (!isTerminated) {
        rafId = requestAnimationFrame(tick);
      }
    }
    rafId = requestAnimationFrame(tick);
  });
}


// =============================================================================
// SECTION 2: WEBMCP TOOL REGISTRATION (document.modelContext.registerTool)
// =============================================================================

let toolStartRef = null;
let toolPauseRef = null;

/**
 * Registers WebMCP tools on document.modelContext:
 * 1. "start_timer" - Demonstrates passing AbortSignal to execution loop (Core A)
 *                   vs omitting signal to illustrate un-abortable runaway (Core B).
 * 2. "pause_timer" - Cooperatively triggers controller abort to halt Core A.
 */
function registerWebMCPTools() {
  if (!modelContext?.registerTool) return;
  try {
    // Tool 1: start_timer
    toolStartRef = modelContext.registerTool({
      name: 'start_timer',
      description: 'Starts an active stopwatch timer execution thread that ticks continuously until completed or aborted.',
      inputSchema: {
        type: 'object',
        properties: {
          targetEngine: { type: 'string', enum: ['A', 'B'], description: 'Engine: "A" (Chrome 153 with AbortSignal) or "B" (Legacy un-abortable)' },
          maxDurationSeconds: { type: 'number', default: 60 }
        }
      },
      execute: async (params, clientContext = {}) => {
        const engine = (params.targetEngine || 'A').toUpperCase();
        // In Chrome 153 native WebMCP, execute receives only 1 parameter (params),
        // while polyfill passes { signal: options.signal } in clientContext.
        // Fall back to host controller signal for Core A so cooperative abort works in both environments.
        const signal = engine === 'A'
          ? (clientContext?.signal || stateA.ctrl?.signal)
          : null;
        hudLog('EXEC', `Tool "start_timer" invoked on Core ${engine} (signal attached: ${Boolean(signal)})`);

        if (engine === 'A') {
          setCoreState('A', 'running');
          return startTimerExecution({
            signal,
            initialElapsed: stateA.elapsed,
            maxDurationSeconds: params.maxDurationSeconds || 60,
            onTick: (elapsed) => renderTime('A', elapsed),
            bindCancel: (cancelFn) => { stateA.cancel = cancelFn; },
            bindAbort: (abortFn) => { stateA.abort = abortFn; }
          });
        } else {
          setCoreState('B', 'running');
          // Legacy baseline: intentionally omits signal to illustrate thread lock
          return startTimerExecution({
            signal: null,
            initialElapsed: stateB.elapsed,
            maxDurationSeconds: params.maxDurationSeconds || 60,
            onTick: (elapsed) => renderTime('B', elapsed),
            bindCancel: (cancelFn) => { stateB.cancel = cancelFn; },
            bindAbort: null
          });
        }
      }
    });
    hudLog('SYS', 'Tool "start_timer" registered with document.modelContext');

    // Tool 2: pause_timer
    toolPauseRef = modelContext.registerTool({
      name: 'pause_timer',
      description: 'Pauses an active stopwatch timer execution. In Chrome 153 mode, cooperatively halts the background execution loop.',
      inputSchema: {
        type: 'object',
        properties: {
          targetEngine: { type: 'string', enum: ['A', 'B'], default: 'A' },
          reason: { type: 'string' }
        }
      },
      execute: async (params = {}) => {
        const engine = (params.targetEngine || 'A').toUpperCase();
        const reason = params.reason || 'Agent pause command';
        hudLog('EXEC', `Tool "pause_timer" called on Core ${engine} (reason: "${reason}")`);

        if (engine === 'A') {
          if (stateA.status === 'idle' || stateA.status === 'completed') {
            return { success: false, engine: 'A', message: `Core A is ${stateA.status}` };
          }
          // Cooperative halt: trigger signal and direct handle
          stateA.ctrl?.abort(reason);
          stateA.abort?.(reason);
          setCoreState('A', 'paused');
          return {
            success: true,
            engine: 'A',
            status: 'paused',
            elapsedSeconds: (stateA.elapsed / 1000).toFixed(2),
            message: 'Core A halted cooperatively via AbortSignal.'
          };
        } else {
          if (stateB.status === 'idle' || stateB.status === 'completed') {
            return { success: false, engine: 'B', message: `Core B is ${stateB.status}` };
          }
          stateB.ctrl?.abort(reason); // Emitted on host... but tool has no signal!
          hudLog('WARN', 'Core B ignores abort: execution loop has no AbortSignal attached!');
          setCoreState('B', 'runaway');
          document.getElementById('promise-state-b').innerHTML = '<span class="promise-runaway">&lt;PENDING (Abort Ignored)&gt;</span>';
          return {
            success: false,
            engine: 'B',
            status: 'running',
            elapsedSeconds: (stateB.elapsed / 1000).toFixed(2),
            message: 'Notice: Core B was invoked without AbortSignal. Abort was ignored.'
          };
        }
      }
    });
    hudLog('SYS', 'Tool "pause_timer" registered with document.modelContext');
  } catch (err) {
    hudLog('WARN', `Registration notice: ${err.message}`);
  }
}


// =============================================================================
// SECTION 3: UNIFIED ACTUATION PATHWAY (document.modelContext.executeTool)
// =============================================================================

/**
 * Resolves a registered WebMCP tool object by name.
 */
async function resolveTool(name) {
  if (!modelContext) {
    modelContext = await ensureWebMCP();
  }
  if (modelContext?.getTools) {
    try {
      const tools = await modelContext.getTools();
      const match = tools.find(t => t.name === name);
      if (match) return match;
    } catch (e) { }
  }
  return {
    name,
    description: `Tool ${name}`,
    window: window,
    origin: window.origin
  };
}

/**
 * Actuates start_timer via document.modelContext.executeTool.
 * Passes AbortSignal for Core A (Chrome 153), omits signal for Core B (Legacy).
 */
async function invokeStartTool(engine) {
  const state = engine === 'A' ? stateA : stateB;
  if (state.status === 'running' || state.status === 'runaway') return;

  const runId = ++state.runId;
  setCoreState(engine, 'running');
  const promiseEl = document.getElementById(`promise-state-${engine.toLowerCase()}`);
  promiseEl.innerHTML = '<span class="promise-pending">&lt;PENDING&gt;</span>';

  hudLog('AGENT', `executeTool('start_timer', { targetEngine: "${engine}" })`);
  announce(`Starting Core ${engine}`);

  state.ctrl = new AbortController();
  const options = engine === 'A' ? { signal: state.ctrl.signal } : {};

  const toolRef = await resolveTool('start_timer');
  if (state.runId !== runId) return; // Stale if reset occurred during resolution

  modelContext.executeTool(toolRef, JSON.stringify({ targetEngine: engine }), options)
    .then((result) => {
      if (state.runId !== runId) return; // Discard if reset!
      const res = typeof result === 'string' ? JSON.parse(result) : result;
      if (res.status === 'paused' || res.status === 'completed') {
        setCoreState(engine, res.status);
      }
      const resClass = engine === 'A' ? 'promise-resolved-a' : 'promise-resolved-b';
      promiseEl.innerHTML = `<span class="${resClass}">&lt;RESOLVED { status: "${res.status}", elapsed: "${res.elapsedSeconds || (state.elapsed / 1000).toFixed(2)}s" }&gt;</span>`;
      hudLog(engine === 'A' ? 'SIGNAL' : 'EXEC', `Core ${engine} Promise resolved: ${JSON.stringify(res)}`);
      if (res.status === 'paused') {
        announce(`Core ${engine} paused at ${res.elapsedSeconds} seconds`);
      }
    })
    .catch((err) => {
      if (state.runId !== runId) return; // Discard if reset!
      if (err.name === 'AbortError' || state.ctrl?.signal?.aborted) {
        state.abort?.('executeTool aborted');
        setCoreState(engine, 'paused');
        const resClass = engine === 'A' ? 'promise-resolved-a' : 'promise-resolved-b';
        promiseEl.innerHTML = `<span class="${resClass}">&lt;RESOLVED { status: "paused", elapsed: "${(state.elapsed / 1000).toFixed(2)}s" }&gt;</span>`;
        hudLog('SIGNAL', `Core ${engine} Promise cooperatively aborted via AbortSignal`);
        announce(`Core ${engine} paused at ${(state.elapsed / 1000).toFixed(2)} seconds`);
        return;
      }
      promiseEl.innerHTML = `<span class="promise-rejected">&lt;REJECTED: ${err.name}&gt;</span>`;
      hudLog('WARN', `Core ${engine} error: ${err.message}`);
    });
}

/**
 * Actuates pause_timer via document.modelContext.executeTool.
 */
async function invokePauseTool(engine) {
  hudLog('AGENT', `executeTool('pause_timer', { targetEngine: "${engine}" })`);
  const toolRef = await resolveTool('pause_timer');
  try {
    const rawRes = await modelContext.executeTool(toolRef, JSON.stringify({
      targetEngine: engine,
      reason: 'Autonomous pause request'
    }));
    const res = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
    hudLog('AGENT', `pause_timer result: ${JSON.stringify(res)}`);
  } catch (err) {
    hudLog('WARN', `pause_timer error: ${err.message}`);
  }
}

/**
 * Resets a single engine's state, aborting active runs and resetting DOM readouts.
 */
function resetCore(engine) {
  const state = engine === 'A' ? stateA : stateB;
  state.runId++;
  state.ctrl?.abort('Reset');
  state.cancel?.();
  state.abort?.('Reset');
  state.cancel = null;
  state.abort = null;
  state.elapsed = 0;
  setCoreState(engine, 'idle');
  renderTime(engine, 0);
  document.getElementById(`promise-state-${engine.toLowerCase()}`).textContent = '<UNINVOKED>';
}

/**
 * Master Toolbar: Start both Core A and Core B simultaneously.
 */
function masterStartBoth() {
  invokeStartTool('A');
  invokeStartTool('B');
}

/**
 * Master Toolbar: Abort both Core A and Core B.
 * Demonstrates Core A cooperatively stopping while Core B ignores the abort.
 */
function masterAbortBoth() {
  hudLog('ABORT', 'Master Abort Dual dispatched: Core A halting cooperatively, Core B ignoring signal.');
  invokePauseTool('A');
  invokePauseTool('B');
}

/**
 * Master Toolbar: Reset both engines.
 */
function masterResetBoth() {
  resetCore('A');
  resetCore('B');
  hudLog('SYS', 'Both engines reset to zero.');
  announce('Both engines reset.');
}


// =============================================================================
// SECTION 4: UI STATE, DIAGNOSTICS & KEYBOARD WIRING
// =============================================================================

/**
 * Formats elapsed milliseconds into MM:SS, hundredths, and screen reader text.
 */
function formatTimeComponents(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return {
    sec: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    ms: String(hundredths).padStart(2, '0'),
    spoken: `${seconds} seconds, ${hundredths} hundredths`
  };
}

/**
 * Updates an engine card's declarative data-state attribute.
 */
function setCoreState(engine, state) {
  const section = document.getElementById(`core-${engine.toLowerCase()}`);
  if (section) section.dataset.state = state;
  if (engine === 'A') stateA.status = state; else stateB.status = state;
}

/**
 * Updates DOM digital readout numbers for an engine.
 */
function renderTime(engine, ms) {
  const t = formatTimeComponents(ms);
  document.getElementById(`timer-${engine.toLowerCase()}-sec`).textContent = t.sec;
  document.getElementById(`timer-${engine.toLowerCase()}-ms`).textContent = t.ms;
  if (engine === 'A') stateA.elapsed = ms; else stateB.elapsed = ms;
}

/**
 * WCAG 2.2 AAA live region polite speech announcer for screen readers.
 */
function announce(msg) {
  const el = document.getElementById('a11y-announcer');
  if (el) {
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 50);
  }
}

/**
 * Appends a color-tagged entry to the HUD telemetry stream.
 */
function hudLog(tag, msg) {
  const stream = document.getElementById('hud-log-stream');
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = "log-entry";
  const tagClasses = {
    SYS: 'log-tag-sys',
    EXEC: 'log-tag-exec',
    ABORT: 'log-tag-abort',
    WARN: 'log-tag-warn',
    AGENT: 'log-tag-agent',
    SIGNAL: 'log-tag-signal'
  };
  div.innerHTML = `<span class="log-time">[${time}]</span><span class="log-tag ${tagClasses[tag] || 'log-tag-sys'}">[${tag}]</span><span>${msg}</span>`;
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;
}

/**
 * Clears the HUD telemetry stream.
 */
function clearHudLog() {
  document.getElementById('hud-log-stream').innerHTML = '';
}

/**
 * Keyboard shortcuts (WCAG 2.1.4 compliant):
 * - Space: Engage Dual or Abort Dual
 * - R / r: Master Reset Both
 */
window.addEventListener('keydown', (e) => {
  const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
  if (isInput) return;

  if (e.code === 'Space') {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
    e.preventDefault();
    if (stateA.status === 'running' || stateB.status === 'running' || stateB.status === 'runaway') {
      masterAbortBoth();
    } else {
      masterStartBoth();
    }
  }
  if (e.key === 'r' || e.key === 'R') {
    masterResetBoth();
  }
});

// Initial render & WebMCP initialization
renderTime('A', 0);
renderTime('B', 0);

(async () => {
  modelContext = await ensureWebMCP();
  registerWebMCPTools();
})();
