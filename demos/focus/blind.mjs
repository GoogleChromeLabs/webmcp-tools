import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUT = path.join(process.cwd(), 'gauntlet');
fs.mkdirSync(OUT, { recursive: true });

// Capture a KNOWN-GOOD dark "app UI" reference frame from Linear's product
// area directly via Playwright (no intermediate HTML img-load, which was
// blocked by file:// origin and produced a blank crop last round).
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('https://linear.app', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(4000);
// The hero screenshot region is the app UI inside the landing; crop to the top
// 900px dark app-window frame as the comparable reference.
await page.screenshot({ path: path.join(OUT, 'ref-hero.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log('  ✓ ref-hero.png');

await browser.close();

fs.copyFileSync(path.join(OUT, 'ref-hero.png'), path.join(OUT, 'blind-a.png'));
fs.copyFileSync(path.join(OUT, 'focus-04-override.png'), path.join(OUT, 'blind-b.png'));
console.log('  ✓ blind-a.png (reference), blind-b.png (ours)');
console.log('Done.');