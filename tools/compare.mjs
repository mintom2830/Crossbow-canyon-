// Renders a gameplay moment at the reference video's aspect ratio for side-by-side review.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 585, height: 799 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('crossbow-canyon:settings:v1', JSON.stringify({ sfx: false, music: false, quality: 'high', tutorialDone: true })));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cc && window.__cc.screen === 'titleScreen');
await page.tap('#playBtn');
await page.waitForFunction(() => window.__cc.mode === 'play');
await page.evaluate(() => {
  const c = window.__cc; c.autoplay(true);
  for (let i = 0; i < 60; i++) { c.advance(3); if (c.sim.waveIndex >= 2 && c.sim.state === 'build') break; }
  c.autoplay(false);
  c.sim.callWave(); c.advance(17.0);
  // stand on the plateau beside the front of the crowd, like the reference shot
  let lead = null; for (const e of c.sim.enemies) if (!lead || e.s > lead.s) lead = e;
  const p = { x: -1.8, z: 17 }; const dx = p.x - lead.x, dz = p.z - lead.z, l = Math.hypot(dx, dz);
  c.teleport(lead.x + dx / l * 9, lead.z + dz / l * 9);
});
for (let i = 0; i < 6; i++) { await page.evaluate(() => { const s = window.__cc.sim; for (let k = 0; k < 5; k++) s.step(1 / 60); }); await page.waitForTimeout(250); }
await page.screenshot({ path: process.argv[2] || '/tmp/claude-0/compare-game.png' });
await browser.close();
