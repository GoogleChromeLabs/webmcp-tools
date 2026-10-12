import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUT = path.join(process.cwd(), 'gauntlet');
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name, full = true) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: full });
  console.log('  ✓', name);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ---- LINEAR reference ----
console.log('Capturing Linear reference');
const lp = await ctx.newPage();
try {
  await lp.goto('https://linear.app', { waitUntil: 'networkidle', timeout: 45000 });
  await lp.waitForTimeout(3500);
  // Linear's landing is light; the registered app is dark. Capture landing as-is.
  await shot(lp, 'linear-reference.png');
  console.log('  title:', await lp.title());
} catch (e) {
  console.log('  Linear capture note:', e.message?.slice(0, 120));
}
await lp.close();

// ---- FOCUS baseline, full hero flow ----
console.log('\nCapturing FOCUS hero flow');
const fp = await ctx.newPage();
fp.on('console', m => { if (m.type() === 'error') console.log('  [err]', m.text().slice(0, 80)); });

await fp.goto('http://localhost:5174', { waitUntil: 'networkidle' });
await fp.waitForTimeout(1200);
await shot(fp, 'focus-01-load.png');

const t = async (name, args) => fp.evaluate(({ name, args }) =>
  document.modelContext.executeTool({ name, execute: async () => {} }, args), { name, args });

// bottleneck
await t('identify_bottleneck', {});
await fp.waitForTimeout(600);
await shot(fp, 'focus-02-bottleneck.png');

// propose
await t('propose_focus_block', { taskId: 'quiz-prep', durationMinutes: 45, reason: 'Quiz is the most urgent deadline' });
await fp.waitForTimeout(600);
await shot(fp, 'focus-03-proposal.png');

// override
await t('override_plan', { taskId: 'management-ch7' });
await fp.waitForTimeout(600);
await shot(fp, 'focus-04-override.png');

// click APPROVE to enter focus mode silently (human gate)
const approve = fp.locator('.start-here-panel .btn-primary').first();
if (await approve.count()) {
  await approve.click();
  await fp.waitForTimeout(900);
  await shot(fp, 'focus-05-focusmode.png');
}

await fp.close();
await browser.close();

console.log('\nDone. Files:', fs.readdirSync(OUT).join(', '));