import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'audit-screenshots');

import fs from 'fs';
fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('  [CONSOLE ERROR]', msg.text());
  });

  // 1. Initial page load
  console.log('\n1. Initial page load');
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '01-initial');
  console.log('   Page title:', await page.title());

  // Check WebMCP tools registered
  const toolCount = await page.evaluate(() => {
    const ctx = document.modelContext;
    if (!ctx) return -1;
    return ctx.getTools().then(tools => tools.length);
  });
  console.log('   WebMCP tools registered:', toolCount);

  // 2. Assess overload via WebMCP tool
  console.log('\n2. Running assess_overload');
  const assessResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'assess_overload', execute: async () => {} }, {});
  });
  console.log('   assess_overload result:', assessResult?.content?.[0]?.text?.substring(0, 120));

  await page.waitForTimeout(500);
  await shot(page, '02-after-assess');

  // 3. Identify bottleneck via WebMCP tool
  console.log('\n3. Running identify_bottleneck');
  const bottleneckResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'identify_bottleneck', execute: async () => {} }, {});
  });
  const bottleneckData = JSON.parse(bottleneckResult?.content?.[0]?.text || '{}');
  console.log('   bottleneckTaskId:', bottleneckData.bottleneckTaskId);

  await page.waitForTimeout(500);
  await shot(page, '03-bottleneck-identified');

  // 4. Propose focus block
  console.log('\n4. Running propose_focus_block');
  const proposeResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'propose_focus_block', execute: async () => {} }, {
      taskId: 'quiz-prep',
      durationMinutes: 45,
      reason: 'Quiz is the most urgent deadline'
    });
  });
  console.log('   propose result:', proposeResult?.content?.[0]?.text?.substring(0, 200));

  await page.waitForTimeout(500);
  await shot(page, '04-proposal-active');

  // 5. Override the plan
  console.log('\n5. Running override_plan');
  const overrideResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'override_plan', execute: async () => {} }, {
      taskId: 'management-ch7'
    });
  });
  console.log('   override result:', overrideResult?.content?.[0]?.text?.substring(0, 200));

  await page.waitForTimeout(500);
  await shot(page, '05-override-applied');

  // 6. Restructure
  console.log('\n6. Running restructure_plan');
  const restructureResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'restructure_plan', execute: async () => {} }, {});
  });
  await page.waitForTimeout(500);
  await shot(page, '06-restructured');

  // 7. Approve & start focus block (simulate UI approval)
  console.log('\n7. Testing approval gate');
  const directStartResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'start_focus_block', execute: async () => {} }, {});
  });
  const startData = JSON.parse(directStartResult?.content?.[0]?.text || '{}');
  console.log('   Without UI approval:', startData.code || startData.status);

  // Click APPROVE button in UI
  const approveBtn = page.locator('.btn-primary').filter({ hasText: 'APPROVE' });
  const approveCount = await approveBtn.count();
  console.log('   APPROVE buttons found:', approveCount);
  if (approveCount > 0) {
    await approveBtn.first().click();
    await page.waitForTimeout(1000);
    await shot(page, '07-focus-mode-active');
    console.log('   Focus mode activated');

    // Focus mode content
    const focusTitle = await page.locator('.focus-mode-title').textContent();
    console.log('   Focus mode task:', focusTitle);
  }

  // 8. Complete focus block
  console.log('\n8. Running complete_focus_block');
  const completeResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'complete_focus_block', execute: async () => {} }, {
      result: 'completed'
    });
  });
  console.log('   complete result:', completeResult?.content?.[0]?.text?.substring(0, 200));

  await page.waitForTimeout(500);
  await shot(page, '08-block-completed');

  // 9. Stale state test
  console.log('\n9. Testing stale-state detection');
  const staleResult = await page.evaluate(() => {
    return document.modelContext.executeTool({ name: 'propose_focus_block', execute: async () => {} }, {
      taskId: 'quiz-prep',
      durationMinutes: 30,
      expectedStateVersion: 999
    });
  });
  const staleData = JSON.parse(staleResult?.content?.[0]?.text || '{}');
  console.log('   Stale state error code:', staleData.code);

  // 10. Multi-flow screenshots for detail
  await shot(page, '09-full-ui');

  // Get store state for audit
  const storeState = await page.evaluate(async () => {
    const mod = await import('/src/store/focusStore.js');
    return JSON.parse(JSON.stringify(mod.default.getState()));
  });
  console.log('\nStore state summary:');
  console.log('   stateVersion:', storeState.stateVersion);
  console.log('   overloadLevel:', storeState.overloadLevel);
  console.log('   bottleneckTaskId:', storeState.bottleneckTaskId);
  console.log('   hasProposal:', !!storeState.currentProposal);
  console.log('   hasFocusBlock:', !!storeState.activeFocusBlock);
  console.log('   taskCount:', storeState.tasks?.length);

  await browser.close();

  // Summary
  const files = fs.readdirSync(OUT_DIR);
  console.log(`\n✓ ${files.length} screenshots saved to ${OUT_DIR}`);
}

main().catch(e => {
  console.error('Audit failed:', e);
  process.exit(1);
});