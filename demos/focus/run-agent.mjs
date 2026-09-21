// Drives the REAL companion agent loop against NVIDIA NIM (OpenAI-compatible).
// Key is read from process.env.NIMKEY — never hardcoded, never written to disk.
import { chromium } from 'playwright';

const BASE = process.env.FOCUS_URL || 'http://localhost:5173';
const KEY = process.env.NIMKEY || '';
const MODEL = process.env.NIM_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct';
const BASEURL = process.env.NIM_BASE || 'https://integrate.api.nvidia.com/v1';
const PROMPT = process.env.NIM_PROMPT ||
  "I'm overwhelmed. Please check my workload state, assess my overload, and identify the bottleneck. " +
  "Then tell me the single next action I should take, in one sentence.";

if (!KEY) {
  console.error('NIMKEY env var not set — refusing to run.');
  process.exit(1);
}

const b = await chromium.launch();
const ctx = await b.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

// Capture the chat/completions round-trips + any request/failure.
const responses = [];
function watchResponses(pageObj) {
  const isLoopUrl = (u) => /\/chat\/completions$/.test(u) || /\/api\/agent-loop/.test(u);
  pageObj.on('request', (req) => {
    if (isLoopUrl(req.url())) {
      responses.push({ event: 'request', url: req.url(), postData: req.postData()?.replace(KEY, '•••').slice(0, 600) });
    }
  });
  pageObj.on('requestfailed', (req) => {
    if (isLoopUrl(req.url())) {
      responses.push({ event: 'requestfailed', url: req.url(), failure: req.failure()?.errorText });
    }
  });
  pageObj.on('response', async (res) => {
    const u = res.url();
    if (isLoopUrl(u)) {
      let body = '';
      try { body = await res.text(); } catch (_) {}
      responses.push({ event: 'response', url: u, status: res.status(), body: body.replace(KEY, '•••').slice(0, 1200) });
    }
  });
}
watchResponses(page);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Open companion via the button.
const popupP = ctx.waitForEvent('page');
await page.locator('.top-bar-companion').click();
const popup = await popupP;
watchResponses(popup);
await popup.waitForLoadState('networkidle');
await popup.waitForTimeout(700);

// Confirm linked + tools enumerated.
const linked = await popup.evaluate(() => !!document.querySelector('.bench.is-lost') === false
  && document.querySelector('#linkStatus')?.classList.contains('is-linked'));
const toolRows = await popup.evaluate(() => document.querySelectorAll('.tool').length);
console.log(`linked=${linked} tools=${toolRows}`);

// Fill the agent form.
await popup.locator('#baseUrl').fill(BASEURL);
await popup.locator('#apiKey').fill(KEY);
await popup.locator('#model').fill(MODEL);
await popup.locator('#prompt').fill(PROMPT);

// Before the loop: test whether the browser can even reach the endpoint (CORS).
const corsCheck = await popup.evaluate(async ({ base, key }) => {
  try {
    const res = await fetch(base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
    });
    const txt = await res.text();
    return { ok: true, status: res.status, body: txt.split(key).join('•••').slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}, { base: BASEURL, key: KEY });
console.log('CORS/egress check:', JSON.stringify(corsCheck));

console.log('submitting agent loop (model=' + MODEL + ')…');
const t0 = Date.now();
const btn = popup.locator('#runAgent');
await btn.click();
// Wait for the loop to START (button disables), then FINISH (re-enables).
await popup.waitForFunction(() => document.querySelector('#runAgent')?.disabled, { timeout: 15000 });
await popup.waitForFunction(() => !document.querySelector('#runAgent')?.disabled, { timeout: 180000 });
console.log(`loop finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Capture transcript, redacting the key.
const transcript = await popup.evaluate((key) => {
  const log = document.querySelector('#agentLog');
  const text = log ? log.innerText : '(no log)';
  return text.split(key).join('•••');
}, KEY);
console.log('\n=== AGENT TRANSCRIPT ===\n' + transcript + '\n=== END ===');

// Report current state version (did the loop's tool calls mutate state?).
const st = await popup.evaluate(() => window.opener.__focus_state);
console.log('\nFOCUS state version after loop: v' + st?.stateVersion);

console.log('errors:', errors.length ? errors.join(' | ') : '(none)');
console.log('\nchat/completions responses:', responses.length);
for (const r of responses) {
  console.log(`  [${r.status}] ${r.body || '(empty)'}`);
}
await b.close();
