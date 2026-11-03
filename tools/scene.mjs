// Scripted screenshots: node tools/scene.mjs <desktop|hd|phone|land> <steps.json>
// steps: [{eval: "js"}, {wait: ms}, {shot: "name"}, {click: "#sel"}, {key: "KeyW", ms: 500}]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const kind = process.argv[2] || 'desktop';
const steps = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(kind === 'phone'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : kind === 'land' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : kind === 'hd' ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errors.push(m.text()); if (m.type() === 'log') console.log('log:', m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { try { localStorage.setItem('crossbow-canyon:settings:v1', JSON.stringify({ sfx: false, music: false, quality: 'high', tutorialDone: true })); } catch {} });
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
await page.waitForTimeout(1200);
for (const s of steps) {
  if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval ->', JSON.stringify(r)); }
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) await page.click(s.click);
  if (s.key) { await page.keyboard.down(s.key); await page.waitForTimeout(s.ms || 400); await page.keyboard.up(s.key); }
  if (s.shot) await page.screenshot({ path: `/tmp/claude-0/${s.shot}.png`, timeout: 120000 });   // software GL can be slow
}
console.log(errors.join('\n') || 'no errors');
await browser.close();
