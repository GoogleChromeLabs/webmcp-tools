/**
 * WebMCP AbortSignal Explorer — Application Logic
 * Chrome 153 agent cancellation reference implementation
 *
 * Demonstrates the Web Model Context Protocol (WebMCP) execution cancellation
 * architecture using standard DOM AbortSignal.
 */

// =============================================================================
// 1. DOMAIN LAYER: Pure Stopwatch Engine
// =============================================================================

/**
 * Headless stopwatch state machine.
 * Completely decoupled from WebMCP and DOM rendering for testability and clean architecture.
 */
class StopwatchEngine {
  #elapsed = 0;
  #state = 'idle'; // 'idle' | 'running' | 'paused' | 'completed'
  #rafId = null;
  #onUpdate = null;

  constructor(onUpdate) {
    this.#onUpdate = onUpdate;
  }

  get elapsed() {
    return this.#elapsed;
  }

  get state() {
    return this.#state;
  }

  get isRunning() {
    return this.#state === 'running';
  }

  reset() {
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#elapsed = 0;
    this.#state = 'idle';
    this.#notify();
  }

  #notify() {
    this.#onUpdate?.({
      elapsed: this.#elapsed,
      state: this.#state
    });
  }

  /**
   * Runs the stopwatch up to maxSeconds.
   * If an AbortSignal is provided, gracefully and cooperatively pauses on abort.
   *
   * @param {number} maxSeconds - Maximum runtime in seconds.
   * @param {AbortSignal} [signal] - Optional DOM AbortSignal for cooperative cancellation.
   * @returns {Promise<{ status: 'completed' | 'cancelled', elapsed: number, reason?: any }>}
   */
  run(maxSeconds = 60, signal) {
    if (this.#state === 'running') {
      return Promise.reject(new Error('Stopwatch is already running'));
    }

    // 1. If signal is provided and already aborted, pause immediately without starting a loop
    if (signal?.aborted) {
      this.#state = 'paused';
      this.#notify();
      return Promise.resolve({
        status: 'cancelled',
        elapsed: this.#elapsed,
        reason: signal.reason || 'AbortError'
      });
    }

    return new Promise((resolve) => {
      const startTime = performance.now() - this.#elapsed;
      this.#state = 'running';
      this.#notify();

      // 2. Abort listener for cooperative cancellation
      const onAbort = () => {
        cleanup();
        this.#state = 'paused';
        this.#notify();
        resolve({
          status: 'cancelled',
          elapsed: this.#elapsed,
          reason: signal?.reason || 'AbortError'
        });
      };

      const cleanup = () => {
        if (this.#rafId) {
          cancelAnimationFrame(this.#rafId);
          this.#rafId = null;
        }
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      // 3. High-frequency tick loop
      const tick = () => {
        this.#elapsed = performance.now() - startTime;

        if (this.#elapsed >= maxSeconds * 1000) {
          cleanup();
          this.#state = 'completed';
          this.#notify();
          return resolve({
            status: 'completed',
            elapsed: this.#elapsed
          });
        }

        this.#notify();
        this.#rafId = requestAnimationFrame(tick);
      };

      this.#rafId = requestAnimationFrame(tick);
    });
  }
}


// =============================================================================
// 2. WEBMCP TOOL LAYER: Tool Provider
// =============================================================================

const TIMER_TOOL_DEFINITION = {
  name: 'start_timer',
  description: 'Starts or resumes a stopwatch timer that halts cooperatively via AbortSignal.',
  inputSchema: {
    type: 'object',
    properties: {
      duration: {
        type: 'number',
        default: 60,
        description: 'Maximum timer duration in seconds before completing.'
      }
    }
  }
};

/**
 * Registers the stopwatch execution tool on document.modelContext.
 * Receives options.signal (Chrome 153+) and passes it to the stopwatch engine.
 *
 * Centralizes all Promise lifecycle telemetry and logging so both simulated
 * UI runs and external agents update the UI consistently.
 *
 * @param {StopwatchEngine} stopwatch - The stopwatch instance to expose.
 */
function registerTools(stopwatch) {
  if (!document.modelContext?.registerTool) {
    hudLog('WARN', 'document.modelContext is not available in this environment.');
    renderRegisteredSchema(TIMER_TOOL_DEFINITION);
    return;
  }

  document.modelContext.registerTool({
    ...TIMER_TOOL_DEFINITION,
    // 👉 Chrome 153+: 2nd argument `options` receives the AbortSignal!
    execute: async ({ duration = 60 } = {}, options = {}) => {
      setPromiseInspectorState('pending');
      hudLog('AGENT', `executeTool("start_timer", { duration: ${duration} }, { signal: ${options.signal ? 'AbortSignal' : 'none'} })`);
      announce('Timer started via WebMCP');

      try {
        const outcome = await stopwatch.run(duration, options.signal);
        const elapsedSec = (outcome.elapsed / 1000).toFixed(2);

        setPromiseInspectorState('fulfilled', outcome, elapsedSec);

        if (outcome.status === 'cancelled') {
          hudLog('SIGNAL', `Promise fulfilled: Cancelled by agent at ${elapsedSec}s (reason: "${outcome.reason || 'AbortError'}")`);
          announce(`Timer cancelled by agent at ${elapsedSec} seconds`);
          return {
            status: 'cancelled',
            elapsed: outcome.elapsed,
            output: `Timer cancelled by agent at ${elapsedSec}s`,
            reason: outcome.reason || options.signal?.reason || 'AbortError'
          };
        } else {
          hudLog('EXEC', `Promise fulfilled: Completed at ${elapsedSec}s`);
          announce(`Timer completed at ${elapsedSec} seconds`);
          return {
            status: 'completed',
            elapsed: outcome.elapsed,
            output: `Timer completed at ${elapsedSec}s`
          };
        }
      } catch (err) {
        setPromiseInspectorState('rejected', err);
        hudLog('WARN', `Execution rejected: ${err.name} - ${err.message}`);
        throw err;
      }
    }
  });

  hudLog('SYS', 'Tool "start_timer" registered on document.modelContext');
  renderRegisteredSchema(TIMER_TOOL_DEFINITION);

  if (document.modelContext?.addEventListener) {
    document.modelContext.addEventListener('toolchange', () => {
      renderRegisteredSchema(TIMER_TOOL_DEFINITION);
    });
  }
}

/**
 * Computes and renders the registered tool schema dynamically at runtime
 * by querying document.modelContext.getTools(), matching the exact discovery
 * mechanism used by AI agents.
 *
 * @param {object} [fallbackDef] - Fallback definition if getTools() is unavailable.
 */
async function renderRegisteredSchema(fallbackDef) {
  const schemaCodeEl = document.getElementById('tool-schema-display');
  if (!schemaCodeEl) return;

  try {
    if (document.modelContext?.getTools) {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((t) => t.name === 'start_timer');
      if (tool) {
        const publicContract = {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        };
        schemaCodeEl.textContent = JSON.stringify(publicContract, null, 2);
        return;
      }
    }
  } catch (err) {
    // If getTools fails or throws, use fallback definition
  }

  if (fallbackDef) {
    schemaCodeEl.textContent = JSON.stringify(fallbackDef, null, 2);
  }
}


// =============================================================================
// 3. AGENT SIMULATOR (UI Host Caller Side)
// =============================================================================

let activeAbortController = null;

/**
 * Simulates how an AI agent or browser assistant calls the tool via WebMCP:
 * 1. Creates an AbortController to manage execution lifecycle.
 * 2. Invokes document.modelContext.executeTool() passing options = { signal }.
 *
 * @param {StopwatchEngine} stopwatch
 */
async function triggerAgentExecution(stopwatch) {
  if (stopwatch.isRunning) return;

  if (!document.modelContext?.executeTool) {
    hudLog('WARN', 'Cannot execute tool: document.modelContext.executeTool is unavailable.');
    return;
  }

  activeAbortController = new AbortController();
  const options = { signal: activeAbortController.signal };

  const tools = document.modelContext.getTools ? await document.modelContext.getTools() : [];
  const tool = tools.find((t) => t.name === 'start_timer') || { name: 'start_timer' };

  // Pass native JavaScript object (Chrome 154 spec), with fallback to stringified JSON for older Chrome
  let rawResult;
  try {
    rawResult = await document.modelContext.executeTool(tool, { duration: 60 }, options);
  } catch (err) {
    if (err instanceof TypeError || err.message?.includes('string')) {
      rawResult = await document.modelContext.executeTool(tool, JSON.stringify({ duration: 60 }), options);
    } else {
      throw err;
    }
  }
}

/**
 * Simulates cancellation initiated by the agent or user.
 * Dispatches controller.abort() which triggers the 'abort' event on options.signal.
 * Only cancels executions initiated by the on-page simulator.
 *
 * @param {StopwatchEngine} stopwatch
 */
function triggerAgentAbort(stopwatch) {
  if (!stopwatch.isRunning) return;

  if (activeAbortController) {
    hudLog('AGENT', 'activeAbortController.abort("User/Agent Cancellation") dispatched');
    activeAbortController.abort('User/Agent Cancellation');
  } else {
    hudLog('WARN', 'Cannot abort: execution was initiated by an external agent AbortSignal.');
  }
}

/**
 * Resets the timer and UI back to initial idle state.
 *
 * @param {StopwatchEngine} stopwatch
 */
function resetDemo(stopwatch) {
  activeAbortController?.abort('Reset');
  activeAbortController = null;
  stopwatch.reset();
  setPromiseInspectorState('uninvoked');
  hudLog('SYS', 'Timer reset to zero.');
  announce('Timer reset.');
}


// =============================================================================
// 4. UI, TELEMETRY & SAFE RENDERING HELPERS
// =============================================================================

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return {
    sec: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    ms: String(hundredths).padStart(2, '0')
  };
}

function renderTime(ms) {
  const t = formatTime(ms);
  const secEl = document.getElementById('timer-sec');
  const msEl = document.getElementById('timer-ms');
  if (secEl) secEl.textContent = t.sec;
  if (msEl) msEl.textContent = t.ms;
}

function setTimerState(state) {
  const card = document.getElementById('timer-card');
  if (card) card.dataset.state = state;
}

function setPromiseInspectorState(state, result, elapsedSec) {
  const promiseEl = document.getElementById('promise-state');
  if (!promiseEl) return;

  promiseEl.replaceChildren();

  const span = document.createElement('span');

  switch (state) {
    case 'pending':
      span.className = 'promise-pending';
      span.textContent = '<PENDING>';
      break;
    case 'fulfilled':
      if (result?.status === 'cancelled') {
        span.className = 'promise-cancelled';
        span.textContent = `<FULFILLED: Cancelled by Agent { status: "cancelled", elapsed: "${elapsedSec}s" }>`;
      } else {
        span.className = 'promise-resolved';
        span.textContent = `<FULFILLED: Completed { status: "completed", elapsed: "${elapsedSec}s" }>`;
      }
      break;
    case 'rejected':
      span.className = 'promise-rejected';
      span.textContent = `<REJECTED: ${result?.name || 'Error'} - ${result?.message || 'aborted'}>`;
      break;
    case 'uninvoked':
    default:
      promiseEl.textContent = '<UNINVOKED>';
      return;
  }

  promiseEl.appendChild(span);
}

function announce(msg) {
  const el = document.getElementById('a11y-announcer');
  if (el) {
    el.textContent = '';
    setTimeout(() => {
      el.textContent = msg;
    }, 50);
  }
}

/**
 * Safely appends an entry to the HUD log stream without innerHTML interpolation.
 */
function hudLog(tag, msg) {
  const stream = document.getElementById('hud-log-stream');
  if (!stream) return;

  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = 'log-entry';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${time}]`;

  const tagClass = {
    SYS: 'log-tag-sys',
    EXEC: 'log-tag-exec',
    ABORT: 'log-tag-abort',
    WARN: 'log-tag-warn',
    AGENT: 'log-tag-agent',
    SIGNAL: 'log-tag-signal'
  }[tag] || 'log-tag-sys';

  const tagSpan = document.createElement('span');
  tagSpan.className = `log-tag ${tagClass}`;
  tagSpan.textContent = `[${tag}]`;

  const msgSpan = document.createElement('span');
  msgSpan.textContent = msg;

  div.append(timeSpan, tagSpan, msgSpan);
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;
}

function clearHudLog() {
  const stream = document.getElementById('hud-log-stream');
  if (stream) stream.replaceChildren();
}

function updateRuntimeBadge() {
  const badge = document.getElementById('runtime-badge');
  if (!badge) return;

  if (window.__webmcp_registered_tools) {
    badge.textContent = 'Polyfill Active';
    badge.className = 'badge badge-blue';
  } else if (document.modelContext) {
    badge.textContent = 'Native API';
    badge.className = 'badge badge-mint';
  } else {
    badge.textContent = 'API Unavailable';
    badge.className = 'badge badge-amber';
    hudLog('WARN', 'WebMCP API is not available. Please verify the WebMCP polyfill or flags.');
  }
}


// =============================================================================
// 5. INITIALIZATION & EVENT BINDINGS
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize stopwatch engine
  const stopwatch = new StopwatchEngine(({ elapsed, state }) => {
    renderTime(elapsed);
    setTimerState(state);
  });

  // Attach event listeners
  document.getElementById('btn-reset')?.addEventListener('click', () => resetDemo(stopwatch));
  document.getElementById('btn-agent-execute')?.addEventListener('click', () => triggerAgentExecution(stopwatch));
  document.getElementById('btn-agent-abort')?.addEventListener('click', () => triggerAgentAbort(stopwatch));

  document.getElementById('btn-clear-log')?.addEventListener('click', clearHudLog);

  // Initialize display
  renderTime(0);
  updateRuntimeBadge();
  registerTools(stopwatch);
});
