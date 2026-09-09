/**
 * WebMCP AbortSignal Explorer — Application Logic
 * Chrome 153 Reference Implementation
 *
 * Demonstrates the Web Model Context Protocol (WebMCP) execution cancellation
 * architecture using standard DOM AbortSignal.
 */

// =============================================================================
// 1. STATE
// =============================================================================

const timer = {
  elapsed: 0,
  running: false,
  ctrl: null,
  rafId: null
};


// =============================================================================
// 2. HEADLESS EXECUTION ENGINE
// =============================================================================

/**
 * Runs a stopwatch animation loop at ~60 FPS.
 * If an AbortSignal is provided, listens for cooperative cancellation.
 */
function runTimer(maxSeconds = 60, signal) {
  return new Promise((resolve) => {
    const startTime = performance.now() - timer.elapsed;

    // 1. Check if already aborted before starting
    if (signal?.aborted) {
      setTimerState('paused');
      return resolve({ status: 'paused', elapsed: timer.elapsed });
    }

    // 2. Cooperative cancellation via standard DOM AbortSignal
    signal?.addEventListener('abort', () => {
      cancelAnimationFrame(timer.rafId);
      timer.running = false;
      setTimerState('paused');
      resolve({ status: 'paused', elapsed: timer.elapsed });
    }, { once: true });

    // 3. High-frequency tick loop
    function tick() {
      timer.elapsed = performance.now() - startTime;
      renderTime(timer.elapsed);

      if (timer.elapsed >= maxSeconds * 1000) {
        cancelAnimationFrame(timer.rafId);
        timer.running = false;
        setTimerState('completed');
        return resolve({ status: 'completed', elapsed: timer.elapsed });
      }

      timer.rafId = requestAnimationFrame(tick);
    }

    timer.running = true;
    setTimerState('running');
    timer.rafId = requestAnimationFrame(tick);
  });
}


// =============================================================================
// 3. WEBMCP TOOL REGISTRATION
// =============================================================================

function registerTools() {
  if (!document.modelContext?.registerTool) return;

  document.modelContext.registerTool({
    name: 'start_timer',
    description: 'Starts a stopwatch timer that halts cooperatively via AbortSignal.',
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'number', default: 60, description: 'Duration in seconds' }
      }
    },
    // 👉 NEW IN CHROME 153: 2nd argument `options` receives the AbortSignal!
    async execute({ duration = 60 } = {}, options = {}) {
      const outcome = await runTimer(duration, options.signal);
      return {
        status: outcome.status,
        output: `Timer ${outcome.status} at ${(outcome.elapsed / 1000).toFixed(2)}s`,
        elapsed: outcome.elapsed
      };
    }
  });

  hudLog('SYS', 'Tool "start_timer" registered with document.modelContext');
}


// =============================================================================
// 4. ACTUATION & CANCELLATION (Host caller side)
// =============================================================================

/**
 * Invokes start_timer via document.modelContext.executeTool().
 * Passes options = { signal: timer.ctrl.signal } to allow cancellation.
 */
async function startTimer() {
  if (timer.running) return;

  timer.ctrl = new AbortController();
  const options = { signal: timer.ctrl.signal };

  const promiseEl = document.getElementById('promise-state');
  if (promiseEl) promiseEl.innerHTML = '<span class="promise-pending">&lt;PENDING&gt;</span>';

  hudLog('AGENT', 'executeTool("start_timer", { duration: 60 }, { signal })');
  announce('Timer started');

  try {
    const tools = document.modelContext?.getTools ? await document.modelContext.getTools() : [];
    const tool = tools.find(t => t.name === 'start_timer') || { name: 'start_timer' };
    const rawResult = await document.modelContext.executeTool(tool, JSON.stringify({ duration: 60 }), options);
    const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
    const sec = (timer.elapsed / 1000).toFixed(2);
    if (promiseEl) {
      promiseEl.innerHTML = `<span class="promise-resolved">&lt;RESOLVED { status: "${result?.status || 'completed'}", elapsed: "${sec}s" }&gt;</span>`;
    }
    hudLog('SIGNAL', `Promise resolved: status="${result?.status}", elapsed=${sec}s`);
    if (result?.status === 'paused') announce(`Timer paused at ${sec} seconds`);
  } catch (err) {
    if (err.name === 'AbortError' || timer.ctrl?.signal?.aborted) {
      const sec = (timer.elapsed / 1000).toFixed(2);
      if (promiseEl) {
        promiseEl.innerHTML = `<span class="promise-resolved">&lt;RESOLVED { status: "paused", elapsed: "${sec}s" }&gt;</span>`;
      }
      hudLog('SIGNAL', 'Promise cooperatively aborted via AbortSignal');
      announce(`Timer paused at ${sec} seconds`);
    } else {
      if (promiseEl) promiseEl.innerHTML = `<span class="promise-rejected">&lt;REJECTED: ${err.name}&gt;</span>`;
      hudLog('WARN', `Execution error: ${err.message}`);
    }
  }
}

/**
 * Halts the timer by triggering controller.abort().
 * The timer loop hears the 'abort' event and pauses immediately.
 */
function pauseTimer() {
  if (!timer.running) return;
  hudLog('AGENT', 'controller.abort() dispatched');
  timer.ctrl?.abort('User/Agent Pause');
}

/**
 * Resets the timer back to zero.
 */
function resetTimer() {
  timer.ctrl?.abort('Reset');
  cancelAnimationFrame(timer.rafId);
  timer.elapsed = 0;
  timer.running = false;
  renderTime(0);
  setTimerState('idle');
  const promiseEl = document.getElementById('promise-state');
  if (promiseEl) promiseEl.textContent = '<UNINVOKED>';
  hudLog('SYS', 'Timer reset to zero.');
  announce('Timer reset.');
}


// =============================================================================
// 5. UI, TELEMETRY & A11Y HELPERS
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

function announce(msg) {
  const el = document.getElementById('a11y-announcer');
  if (el) {
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 50);
  }
}

function hudLog(tag, msg) {
  const stream = document.getElementById('hud-log-stream');
  if (!stream) return;
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = 'log-entry';
  const tagClass = {
    SYS: 'log-tag-sys',
    EXEC: 'log-tag-exec',
    ABORT: 'log-tag-abort',
    WARN: 'log-tag-warn',
    AGENT: 'log-tag-agent',
    SIGNAL: 'log-tag-signal'
  }[tag] || 'log-tag-sys';
  div.innerHTML = `<span class="log-time">[${time}]</span><span class="log-tag ${tagClass}">[${tag}]</span><span>${msg}</span>`;
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;
}

function clearHudLog() {
  const stream = document.getElementById('hud-log-stream');
  if (stream) stream.innerHTML = '';
}

// Keyboard shortcuts (Space: Start/Pause, R: Reset)
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.code === 'Space') {
    if (['BUTTON', 'A'].includes(e.target.tagName)) return;
    e.preventDefault();
    if (timer.running) pauseTimer();
    else startTimer();
  }
  if (e.key === 'r' || e.key === 'R') {
    resetTimer();
  }
});


// =============================================================================
// 6. INITIALIZATION
// =============================================================================

if (window.__webmcp_registered_tools) {
  const badge = document.getElementById('runtime-badge');
  if (badge) {
    badge.textContent = 'Polyfill Active';
    badge.className = 'badge badge-blue';
  }
}

renderTime(0);
registerTools();
