// Browser end-to-end tests (Playwright + Chromium). Run: node tests/e2e.mjs
// Builds are tested from dist/index.html exactly as players get them.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';

const URL = pathToFileURL(path.resolve('dist/index.html')).href;
const SHOTS = process.env.SHOTS || 'test-results';
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let pass = 0, fail = 0;
const lines = [];
const perfReport = {};
const openContexts = new Set();

// A tiny local web server for tests that reload the page: headless Chromium can
// drop a file:// page's storage writes across a reload, an http page keeps them.
let server = null;
async function httpURL() {
  if (!server) {
    server = http.createServer((req, res) => {
      try { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(path.resolve('dist/index.html'))); }
      catch { res.writeHead(500); res.end(); }
    });
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  }
  return `http://127.0.0.1:${server.address().port}/index.html`;
}

async function open(kind = 'desktop', settings = { sfx: false, music: false, quality: 'high', tutorialDone: false }, keepStorage = null, url = URL) {
  const opts = kind === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : kind === 'land' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 } };
  const ctx = keepStorage || await browser.newContext(opts);
  openContexts.add(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('crash', () => { errors.push('page crashed'); console.log('PAGE CRASHED'); });
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_FAILED|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
  if (settings && !keepStorage) await page.addInitScript((s) => { try { if (!localStorage.getItem('cc-test-seeded')) { localStorage.setItem('crossbow-canyon:settings:v1', JSON.stringify(s)); localStorage.setItem('cc-test-seeded', '1'); } } catch {} }, settings);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cc && window.__cc.screen === 'titleScreen');
  return { ctx, page, errors };
}
const g = (page, fn, arg) => page.evaluate(fn, arg);
// Writes a localStorage key, then reloads until the page sees it. Headless Chromium
// occasionally drops a file:// storage write made shortly before a reload.
async function setStorageAndReload(page, key, value) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__cc && window.__cc.screen === 'titleScreen');
    if (await page.evaluate((k) => localStorage.getItem(k), key) === value) return;
  }
  throw new Error('storage write never survived a reload');
}
const visible = (page, sel) => page.locator(sel).isVisible();
function assert(c, msg) { if (!c) throw new Error(msg); }

// ONLY="part of a name" runs just the matching tests.
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  try { await fn(); pass++; lines.push(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { fail++; lines.push(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
  finally { for (const c of openContexts) await c.close().catch(() => {}); openContexts.clear(); }
}

// ------------------------------------------------------------------------
await test('title screen loads without errors; How to play and Settings work', async () => {
  const { ctx, page, errors } = await open();
  assert(await visible(page, '#titleScreen'), 'title hidden');
  assert(await visible(page, '#playBtn'), 'play button hidden');
  await page.click('#helpBtn'); assert(await visible(page, '#helpScreen'), 'help not shown');
  await page.click('#helpScreen [data-back]'); assert(await visible(page, '#titleScreen'), 'back failed');
  await page.click('#settingsBtn'); assert(await visible(page, '#settingsScreen'), 'settings not shown');
  await page.click('#sfxToggle');
  const s1 = await g(page, () => JSON.parse(localStorage.getItem('crossbow-canyon:settings:v1')));
  assert(s1.sfx === true, 'sfx toggle not saved');
  await page.click('#musicToggle');
  assert((await page.getAttribute('#musicToggle', 'aria-checked')) === 'true', 'music toggle state');
  await page.selectOption('#qualitySelect', 'low');
  assert(await g(page, () => window.__cc.quality) === 'low', 'quality not applied');
  await page.selectOption('#qualitySelect', 'high');
  await page.click('#settingsScreen [data-back]');
  assert(await visible(page, '#titleScreen'), 'settings back failed');
  await page.screenshot({ path: `${SHOTS}/desktop-title.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('new game: HUD, tutorial hint, WASD + arrow keys move the hero', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert(await visible(page, '#hud'), 'HUD hidden');
  await page.waitForSelector('#hint:not([hidden])', { timeout: 10000 });
  const h0 = await g(page, () => ({ ...window.__cc.sim.hero }));
  await page.keyboard.down('KeyD');
  await page.waitForFunction((x0) => window.__cc.sim.hero.x - x0 > 1.5, h0.x, { timeout: 15000 });
  await page.keyboard.up('KeyD');
  const h1 = await g(page, () => ({ ...window.__cc.sim.hero }));
  assert(Math.abs(h1.z - h0.z) < 0.6, 'D key drifted vertically');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction((z1) => z1 - window.__cc.sim.hero.z > 1.5, h1.z, { timeout: 15000 });
  await page.keyboard.up('ArrowUp');
  const h2 = await g(page, () => ({ ...window.__cc.sim.hero }));
  await page.keyboard.down('KeyA'); await page.keyboard.down('KeyS');
  await page.waitForFunction((h) => window.__cc.sim.hero.x < h.x - 0.8 && window.__cc.sim.hero.z > h.z + 0.8, h2, { timeout: 15000 });
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyS');
  const tUp = await g(page, () => window.__cc.sim.time);
  await page.waitForFunction((t) => window.__cc.sim.time > t + 0.6, tUp, { timeout: 15000 });
  const v = await g(page, () => Math.hypot(window.__cc.sim.hero.vx, window.__cc.sim.hero.vz));
  assert(v < 0.5, 'hero keeps sliding after keys are released');
  const gold = await page.textContent('#goldVal');
  assert(Number(gold) === await g(page, () => window.__cc.sim.gold), 'gold HUD mismatch');
  await page.screenshot({ path: `${SHOTS}/desktop-start.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('pause button, Escape key and tab-hide all pause; resume continues', async () => {
  const { ctx, page } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await page.click('#pauseBtn');
  assert(await visible(page, '#pauseScreen'), 'pause screen hidden');
  const t0 = await g(page, () => window.__cc.sim.time);
  await page.waitForTimeout(600);
  assert(await g(page, () => window.__cc.sim.time) === t0, 'sim advanced while paused');
  await page.click('#resumeBtn');
  await page.waitForFunction((t0) => window.__cc.sim.time > t0, t0, { timeout: 10000 });
  await page.keyboard.press('Escape');
  assert(await g(page, () => window.__cc.mode) === 'pause', 'Escape did not pause');
  await page.keyboard.press('Escape');
  assert(await g(page, () => window.__cc.mode) === 'play', 'Escape did not resume');
  await g(page, () => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert(await g(page, () => window.__cc.mode) === 'pause', 'hiding the tab did not pause');
  await ctx.close();
});

await test('Start wave / Skip wave: early start, locked while rats pour in, then skips mid-wave for bonus gold', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await page.waitForSelector('#callBtn', { state: 'visible', timeout: 10000 });
  assert((await page.textContent('#callLabel')) === 'Start wave', 'first button should say Start wave');
  const before = await g(page, () => window.__cc.sim.gold);
  await page.click('#callBtn');
  const s = await g(page, () => ({ state: window.__cc.sim.state, gold: window.__cc.sim.gold }));
  assert(s.state === 'wave', 'wave did not start');
  assert(s.gold > before, 'no early bonus');
  // during the wave the button turns into a locked Skip wave with a countdown
  await page.waitForFunction(() => document.getElementById('callBonus').textContent.startsWith('in '), null, { timeout: 10000 });
  assert(await page.locator('#callBtn').isDisabled(), 'skip should be locked while rats pour in');
  assert((await page.textContent('#callLabel')) === 'Skip wave', 'label should say Skip wave');
  await page.click('#callBtn', { force: true });
  assert(await g(page, () => window.__cc.sim.waveIndex) === 0, 'locked skip still skipped');
  await g(page, () => { const s = window.__cc.sim; window.__cc.advance(s.skipIn + 0.1); });
  await page.waitForFunction(() => !document.getElementById('callBtn').disabled, null, { timeout: 10000 });
  const bonusText = await page.textContent('#callBonus');
  const g0 = await g(page, () => window.__cc.sim.gold);
  await page.click('#callBtn');
  const after = await g(page, () => ({ wave: window.__cc.sim.waveIndex, gold: window.__cc.sim.gold, state: window.__cc.sim.state }));
  assert(after.wave === 1 && after.state === 'wave', 'mid-wave skip did not send wave 2');
  assert(bonusText === `+${after.gold - g0}`, `skip bonus ${after.gold - g0} vs button ${bonusText}`);
  await page.waitForFunction(() => document.getElementById('waveTitle').textContent === 'WAVE 2 / 16', null, { timeout: 5000 });
  await page.waitForSelector('.toast', { timeout: 5000 });
  assert((await page.textContent('.toast')).includes('skipped'), 'no skip toast');
  // Space also skips once the new wave has poured in
  await g(page, () => { const s = window.__cc.sim; window.__cc.advance(s.skipIn + 0.1); });
  await page.keyboard.press('Space');
  assert(await g(page, () => window.__cc.sim.waveIndex) === 2, 'Space did not skip');
  await page.screenshot({ path: `${SHOTS}/desktop-skip.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('Auto skip: button and T key toggle it, it is saved, and the next wave starts 3 s after a clear', async () => {
  // served over http: headless Chromium can drop a file:// page's storage writes across the reload below
  const { ctx, page, errors } = await open('desktop', undefined, null, await httpURL());
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert((await page.getAttribute('#autoBtn', 'aria-pressed')) === 'false', 'auto should start off');
  await page.click('#autoBtn');
  assert((await page.getAttribute('#autoBtn', 'aria-pressed')) === 'true', 'auto button did not turn on');
  assert(await g(page, () => window.__cc.sim.autoSkip && JSON.parse(localStorage.getItem('crossbow-canyon:settings:v1')).autoSkip === true), 'auto not applied or saved');
  await page.keyboard.press('KeyT');
  assert((await page.getAttribute('#autoBtn', 'aria-pressed')) === 'false' && !(await g(page, () => window.__cc.sim.autoSkip)), 'T did not turn auto off');
  await page.keyboard.press('KeyT');
  assert(await g(page, () => window.__cc.sim.autoSkip), 'T did not turn auto back on');
  assert(await g(page, () => window.__cc.sim.state === 'build'), 'auto must not start wave 1 by itself');
  // clear wave 1 with the autoplayer, then watch the countdown
  await g(page, () => { window.__cc.autoplay(true); window.__cc.sim.callWave(); });
  await page.waitForFunction(() => { window.__cc.advance(2); return window.__cc.sim.waveIndex === 1 && window.__cc.sim.state === 'build'; }, null, { timeout: 60000, polling: 50 });
  await g(page, () => window.__cc.autoplay(false));
  await page.waitForFunction(() => document.getElementById('waveSub').textContent.startsWith('Auto start in'), null, { timeout: 10000 });
  const t = await g(page, () => {
    const s = window.__cc.sim, t0 = s.time;
    for (let n = 0; s.state === 'build' && n < 1200; n++) s.step(1 / 60);
    const gap = +(s.time - t0).toFixed(2);
    window.__cc.advance(0);
    return { gap, state: s.state, wave: s.waveIndex };
  });
  assert(t.state === 'wave' && t.wave === 1, 'wave 2 did not start automatically');
  assert(t.gap <= 3.05, `auto start took ${t.gap}s`);
  // the setting survives a reload (same commit wait as the Armory test)
  await page.waitForTimeout(6000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cc && window.__cc.screen === 'titleScreen');
  await page.click('#playBtn');
  if (await visible(page, '#confirmScreen')) await page.click('#confirmYes');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert((await page.getAttribute('#autoBtn', 'aria-pressed')) === 'true' && await g(page, () => window.__cc.sim.autoSkip), 'auto skip not restored after reload: ' + (await g(page, () => Object.keys(localStorage).join(',') + ' ' + localStorage.getItem('crossbow-canyon:settings:v1'))));
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('game speed: the 2× button and F key run the game at double speed, and the choice is saved', async () => {
  const { ctx, page, errors } = await open('desktop', { sfx: false, music: false, quality: 'low', tutorialDone: true });
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert((await page.getAttribute('#speedBtn', 'aria-pressed')) === 'false' && (await page.textContent('#speedVal')) === '1×', 'speed should start at 1×');
  await g(page, () => { window.__cc.sim.buildTimer = 999; });
  // how much game time passes in a second of real time
  const rate = () => g(page, async () => { const s = window.__cc.sim, t0 = s.time, w0 = performance.now(); await new Promise((r) => setTimeout(r, 1500)); return (s.time - t0) / ((performance.now() - w0) / 1000); });
  const slow = await rate();
  await page.click('#speedBtn');
  assert((await page.getAttribute('#speedBtn', 'aria-pressed')) === 'true' && (await page.textContent('#speedVal')) === '2×', 'speed button did not switch to 2×');
  assert(await g(page, () => JSON.parse(localStorage.getItem('crossbow-canyon:settings:v1')).speed === 2), '2× not saved');
  const fast = await rate();
  assert(fast > slow * 1.6, `2× ran the game only ${(fast / slow).toFixed(2)}× as fast`);
  await page.keyboard.press('KeyF');
  assert((await page.textContent('#speedVal')) === '1×' && (await g(page, () => window.__cc.speed)) === 1, 'F did not switch back to 1×');
  // a paused game stays paused at 2×
  await page.keyboard.press('KeyF');
  await page.keyboard.press('Escape');
  const t0 = await g(page, () => window.__cc.sim.time);
  await page.waitForTimeout(600);
  assert((await g(page, () => window.__cc.sim.time)) === t0, 'the game kept running while paused');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('difficulty: pick Easy, Normal or Hard on the title screen; a saved game keeps its own', async () => {
  const { ctx, page, errors } = await open();
  assert((await page.getAttribute('[data-diff=normal]', 'aria-checked')) === 'true', 'Normal should be picked by default');
  assert((await page.textContent('#diffNote')).includes('50 diamonds'), 'note should show the Normal payout');
  await page.click('[data-diff=hard]');
  assert((await page.getAttribute('[data-diff=hard]', 'aria-checked')) === 'true' && (await page.getAttribute('[data-diff=normal]', 'aria-checked')) === 'false', 'Hard not picked');
  assert((await page.textContent('#diffNote')).includes('100 diamonds'), 'note should show the Hard payout');
  assert(await g(page, () => JSON.parse(localStorage.getItem('crossbow-canyon:settings:v1')).difficulty === 'hard'), 'difficulty not saved');
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  const hp = await g(page, () => { const c = window.__cc, s = c.sim; s.callWave(); c.advance(4); const r = s.enemies.find((e) => e.type === 0 && e.v === 0); return { diff: s.difficulty, hp: r && r.maxHp }; });
  assert(hp.diff === 'hard' && hp.hp === Math.round(3 * 1.2), 'Hard rats ' + JSON.stringify(hp));
  await page.keyboard.press('Escape');
  assert((await page.textContent('#pauseInfo')).includes('Hard'), 'pause screen should name the difficulty');
  // back on the title the saved game says it is on Hard, and Continue keeps Hard even with Easy picked
  await g(page, () => { const s = window.__cc.sim; s.state = 'build'; });
  await page.click('#quitBtn');
  await page.waitForFunction(() => window.__cc.screen === 'titleScreen');
  await page.click('[data-diff=easy]');
  assert((await page.textContent('#continueInfo')).includes('Hard'), 'Continue should name the saved game\'s difficulty');
  await page.click('#continueBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert((await g(page, () => window.__cc.sim.difficulty)) === 'hard', 'Continue lost the difficulty');
  // Restart level stays on the game's difficulty
  await page.keyboard.press('Escape');
  await page.click('#restartBtn'); await page.click('#confirmYes');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert((await g(page, () => window.__cc.sim.difficulty)) === 'hard', 'Restart changed the difficulty');
  await page.screenshot({ path: `${SHOTS}/difficulty-hard.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('repair pad: a damaged town hall gets a repair pad; walking onto it with gold restores full health', async () => {
  const { ctx, page, errors } = await open('desktop', { sfx: false, music: false, quality: 'high', tutorialDone: true });
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  const pad = await g(page, () => { const c = window.__cc, s = c.sim; s.buildTimer = 999; s.fortress.hp = 45; s.refreshPads(); const p = s.pads.find((q) => q.kind === 'repair'); c.teleport(p.x + 3.4, p.z); s.gold = 200; return p && { x: p.x, z: p.z, cost: p.cost }; });
  assert(pad && pad.cost === 55, 'repair pad ' + JSON.stringify(pad));
  await page.waitForFunction(() => window.__cc.view.padViews.has('repair'), null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('hint').textContent.includes('repair pad'), null, { timeout: 10000 });
  await page.waitForFunction((x) => window.__cc.sim.hero.x > x + 3, pad.x, { timeout: 15000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction((x) => window.__cc.sim.hero.x <= x + 0.4, pad.x, { timeout: 25000 });
  await page.keyboard.up('ArrowLeft');
  await page.waitForFunction(() => !document.getElementById('towerCard').hidden && document.getElementById('tcNextTitle').textContent === 'Repair the town hall', null, { timeout: 10000 });
  await page.waitForFunction(() => { const f = window.__cc.sim.fortress; return f.hp === f.maxHp; }, null, { timeout: 20000 });
  const r = await g(page, () => ({ gold: window.__cc.sim.gold, pads: window.__cc.sim.pads.map((p) => p.kind), toast: window.__cc.toasts.find((t) => t.includes('repaired')) }));
  assert(r.gold === 145 && !r.pads.includes('repair') && r.toast && r.toast.includes('+55'), 'after the repair ' + JSON.stringify(r));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/repair-pad.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('Level 2: pick Lonetree Hill on the title screen; rats climb the hill; a saved game reopens on its own map', async () => {
  const { ctx, page, errors } = await open('desktop', { sfx: false, music: false, quality: 'high', tutorialDone: true }, null, await httpURL());
  assert((await page.getAttribute('[data-level="1"]', 'aria-checked')) === 'true', 'Level 1 should be picked at first');
  await page.click('[data-level="2"]');
  assert((await page.getAttribute('[data-level="2"]', 'aria-checked')) === 'true', 'Level 2 not picked');
  assert((await page.textContent('#bestLine')).includes('Lonetree Hill'), 'title should name Level 2');
  const t = await g(page, () => ({ level: window.__cc.level, kite: !!window.__cc.view.env.kite, saved: JSON.parse(localStorage.getItem('crossbow-canyon:settings:v1')).level }));
  assert(t.level === 2 && t.kite && t.saved === 2, 'the map did not switch: ' + JSON.stringify(t));
  // switching back and forth rebuilds the scene cleanly
  await page.click('[data-level="1"]'); await page.waitForTimeout(400);
  assert((await g(page, () => window.__cc.level)) === 1 && !(await g(page, () => window.__cc.view.env.kite)), 'did not switch back to Level 1');
  await page.click('[data-level="2"]'); await page.waitForTimeout(400);
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert((await g(page, () => window.__cc.sim.slots[0].id)) === 'H1', 'the game did not start on Level 2');
  // a crowd crosses the hill: rats are drawn standing on the slope
  const r = await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.callWave(); s.fortress.hp = s.fortress.maxHp = 99999;
    for (let i = 0; i < 400 && !s.enemies.some((e) => e.type === 0 && e.gy > 1.8); i++) c.advance(0.25);
    return { onHill: s.enemies.filter((e) => e.type === 0 && e.gy > 1.8).length };
  });
  assert(r.onHill > 0, 'no rat ever reached the hill');
  await page.waitForTimeout(800);
  const drawn = await g(page, () => {
    const c = window.__cc, s = c.sim, v = c.view, m = new (v.camera.matrix.constructor)();
    const e = s.enemies.find((q) => q.type === 0 && q.gy > 1.8 && q.v === 0 && q.alive);
    if (!e) return { skip: true };
    let best = null;
    v.gruntMesh.count && [...Array(v.gruntMesh.count).keys()].forEach((i) => { v.gruntMesh.getMatrixAt(i, m); const p = m.elements; const d = Math.hypot(p[12] - e.x, p[14] - e.z); if (!best || d < best.d) best = { d, y: p[13] }; });
    return { gy: e.gy, best };
  });
  assert(drawn.skip || (drawn.best && drawn.best.d < 0.8 && drawn.best.y > drawn.gy - 0.8), 'rat not drawn on the slope: ' + JSON.stringify(drawn));
  await g(page, () => window.__cc.teleport(2, 8));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/level2-hill.png` });
  // back on the title (with Level 1 picked) the saved game still says Level 2, and Continue reopens it there
  await g(page, () => { const s = window.__cc.sim; s.state = 'build'; });
  await page.keyboard.press('Escape');
  await page.click('#quitBtn');
  await page.waitForFunction(() => window.__cc.screen === 'titleScreen');
  await page.click('[data-level="1"]');
  assert((await page.textContent('#continueInfo')).includes('Level 2'), 'Continue should name Level 2: ' + await page.textContent('#continueInfo'));
  await page.click('#continueBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  assert((await g(page, () => window.__cc.level)) === 2, 'Continue did not reopen Level 2');
  // the map choice survives a reload
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cc && window.__cc.screen === 'titleScreen');
  assert((await g(page, () => window.__cc.level)) === 2, 'the picked map was not remembered');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('walking onto a pad builds one crossbow; coins are collected by walking near them', async () => {
  const { ctx, page } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  const pad = await g(page, () => { const s = window.__cc.sim; s.gold = 100; const p = s.pads.find((q) => q.kind === 'build'); window.__cc.teleport(p.x + 3.2, p.z); return { x: p.x, z: p.z, cost: p.cost, id: p.id }; });
  const towers0 = await g(page, () => window.__cc.sim.towers.length);
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction((px) => window.__cc.sim.hero.x <= px + 0.3, pad.x, { timeout: 25000 });
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/desktop-pad-filling.png` });
  await page.waitForFunction((n) => window.__cc.sim.towers.length === n + 1, towers0, { timeout: 8000 });
  const tBuilt = await g(page, () => window.__cc.sim.time);
  await page.waitForFunction((t) => window.__cc.sim.time > t + 2.5, tBuilt, { timeout: 30000 }); // keep standing still: nothing else may be bought
  const r = await g(page, () => ({ towers: window.__cc.sim.towers.length, gold: window.__cc.sim.gold }));
  assert(r.towers === towers0 + 1, 'built more than once');
  assert(r.gold === 100 - pad.cost, `gold ${r.gold}, expected ${100 - pad.cost}`);
  await page.screenshot({ path: `${SHOTS}/desktop-built.png` });
  // coin pickup
  const g0 = await g(page, () => { const s = window.__cc.sim; for (let i = 0; i < 6; i++) s._dropCoin(s.hero.x + 1.2, s.hero.z + 1.2, 0, 1, 1.5); return s.gold; });
  await page.waitForFunction((g0) => window.__cc.sim.gold === g0 + 6, g0, { timeout: 30000 });
  await ctx.close();
});

await test('keep upgrade swaps the keep model and unlocks crossbow upgrade pads', async () => {
  const { ctx, page } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { const s = window.__cc.sim; s.waveIndex = 2; s.gold = 400; s.refreshPads(); const fp = s.pads.find((p) => p.kind === 'fortress'); window.__cc.teleport(fp.x + 4, fp.z); });
  await page.waitForTimeout(300);
  await g(page, () => { const s = window.__cc.sim; const fp = s.pads.find((p) => p.kind === 'fortress'); s.hero.x = fp.x; s.hero.z = fp.z; });
  await page.waitForFunction(() => window.__cc.sim.fortress.level === 2, null, { timeout: 30000 });   // real-time sim; software GL can be slow
  await page.waitForTimeout(1500);
  const r = await g(page, () => ({ vis: window.__cc.view.fortressLevel, hp: window.__cc.sim.fortress.maxHp, full: window.__cc.sim.fortress.hp === window.__cc.sim.fortress.maxHp }));
  assert(r.vis === 2, 'keep model not upgraded');
  assert(r.full, 'keep not repaired by the upgrade');
  assert(r.hp === 170, 'keep max health not raised');
  await page.screenshot({ path: `${SHOTS}/desktop-keep2.png` });
  await ctx.close();
});

await test('one crossbow upgrades 1 → 7 by walking onto its pad (keep never upgraded)', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { window.__cc.sim.gold = 5000; window.__cc.sim.buildTimer = 999; });
  for (let lv = 2; lv <= 7; lv++) {
    const pad = await g(page, (lv) => { const s = window.__cc.sim; const t = s.towers[0]; const p = s.pads.find((q) => q.kind === 'upgrade' && q.slot === t.slotIndex); if (!p) return null; window.__cc.teleport(p.x + 3.4, p.z); return { x: p.x, z: p.z, level: p.level }; }, lv);
    assert(pad && pad.level === lv, `no level ${lv} pad offered`);
    await page.waitForFunction((x) => window.__cc.sim.hero.x > x + 3, pad.x, { timeout: 15000 });
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction((x) => window.__cc.sim.hero.x <= x + 0.4, pad.x, { timeout: 25000 });
    await page.keyboard.up('ArrowLeft');
    await page.waitForFunction((lv) => window.__cc.sim.towers[0].level === lv, lv, { timeout: 30000 });
    // each level announces its new ability
    const ability = ['', '', 'Power Shot', 'Twin Shot', 'Armor Piercer', 'Triple Barrage', 'Frost Arrows', 'Crystal Storm'][lv];
    await page.waitForFunction((n) => window.__cc.toasts.some((t) => t.includes(n)), ability, { timeout: 8000 });
    // the tower card beside the farmer shows the new level and ability, and the next upgrade (or max)
    await page.waitForFunction(([lv, n]) => { const c = document.getElementById('towerCard'); return !c.hidden && document.getElementById('tcLevel').textContent === `Level ${lv} · ${n}`; }, [lv, ability], { timeout: 10000 });
    if (lv < 7) assert((await page.textContent('#tcNextTitle')).includes(`Level ${lv + 1}`), 'card does not preview the next level');
    else assert(await page.isVisible('#tcMax'), 'card should say max level at 7');
    // standing on a pad shows the full card; anywhere else beside the tower, just a small name tag
    await page.waitForFunction(() => { const s = window.__cc.sim, on = s.pads.some((p) => p.heroOn); return document.getElementById('towerCard').classList.contains('mini') === !on; }, null, { timeout: 5000 });
    if (lv === 3) {
      // standing still on the next pad must not buy level 4: the label asks to step off
      await page.waitForFunction(() => { const s = window.__cc.sim; const p = s.pads.find((q) => q.kind === 'upgrade' && q.slot === s.towers[0].slotIndex); return p && (!p.heroOn || !p.armed); }, null, { timeout: 10000 });
    }
  }
  const view = await g(page, () => [...window.__cc.view.towerViews.values()][0].level);
  assert(view === 7, 'tower model is not level 7');
  // at max level there is no pad left: the farmer beside it sees the small name tag with "Max level"
  await page.waitForFunction(() => { const c = document.getElementById('towerCard'); return !c.hidden && c.classList.contains('mini') && !document.getElementById('tcMax').hidden; }, null, { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/upgraded-to-7.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('all seven crossbow levels render in the browser', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { const s = window.__cc.sim; s.towers.length = 0; for (const sl of s.slots) sl.tower = null; for (let i = 1; i <= 7; i++) { const t = s._placeTower({ index: 100 + i, x: -11.5 + (i - 1) * 3.6, z: 17.5, y: 1.6 }, i, true); t.yaw = 0; } s.pads = []; s.buildTimer = 999; window.__cc.teleport(-0.5, 22); document.getElementById('hud').hidden = true; });
  await page.waitForTimeout(2500);
  const lv = await g(page, () => [...window.__cc.view.towerViews.values()].map((v) => v.level).filter((l) => l).sort().join(''));
  assert(lv.includes('1234567'), 'tower views ' + lv);
  await page.screenshot({ path: `${SHOTS}/tower-levels.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('crossbow abilities in the browser: frozen rats in ice, Crystal Storm arrows rain down', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.towers.length = 0; for (const sl of s.slots) sl.tower = null;
    s.slots.forEach((sl, i) => s._placeTower(sl, i % 2 ? 6 : 7, true, 'crossbow'));
    s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 12; s.callWave(); c.advance(15); c.teleport(-2, 30);
  });
  // step until a storm is falling, then let the renderer draw it
  const st = await g(page, () => { const s = window.__cc.sim; for (let i = 0; i < 900; i++) { s.step(1 / 60); if (s.bolts.some((b) => b.fall) && s.enemies.some((e) => e.frozen > 0)) return { ok: true, frozen: s.enemies.filter((e) => e.frozen > 0).length }; } return { ok: false }; });
  assert(st.ok, 'never saw a storm and a frozen rat together');
  await page.waitForFunction(() => window.__cc.view.iceMesh.count > 0 || window.__cc.sim.enemies.every((e) => !(e.frozen > 0)), null, { timeout: 10000 });
  const drawn = await g(page, () => ({ ice: window.__cc.view.iceMesh.count, bolts: window.__cc.view.boltMesh.count, stats: window.__cc.sim.stats }));
  assert(drawn.bolts > 0, 'no arrows drawn');
  assert(drawn.stats.frozen > 0 && drawn.stats.stormHits > 0 && drawn.stats.bounces > 0, 'abilities did not trigger: ' + JSON.stringify(drawn.stats));
  await page.screenshot({ path: `${SHOTS}/crossbow-abilities.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('rat animations: burrow spawn, walk cycle, gate attack, defeat flip and giant fall-over', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // walking: every rat on screen gets its own walk phase from the distance it covered
  const walk = await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.towers.length = 0; for (const sl of s.slots) sl.tower = null;
    s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 2; s.callWave(); c.advance(8);
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = c.view.ratAnim.array, n = c.view.gruntMesh.count, phases = new Set();
      for (let i = 0; i < n; i++) phases.add(Math.round(a[i * 4] * 10));
      res({ n, distinct: phases.size, minS: Math.min(...s.enemies.map((e) => e.s)) });
    })));
  });
  assert(walk.n > 20 && walk.distinct > walk.n * 0.5, `walk phases ${walk.distinct} for ${walk.n} rats`);
  // the three rat types of wave 3 are drawn, each with its own model
  const types = await g(page, () => window.__cc.view.ratMeshes.map((m) => m.count));
  assert(types.length === 11 && types.slice(0, 3).every((n) => n > 0), `rat types drawn: ${types.join('/')}`);
  assert(walk.minS >= 7.99, 'a rat appeared before the burrow');
  // attacking: rats at the gate carry an attack phase in [0, 1)
  const atk = await g(page, () => {
    const c = window.__cc, s = c.sim; c.advance(60);
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      let attacking = 0;
      c.view.ratMeshes.forEach((m, v) => { const a = c.view.ratAnims[v].array; for (let i = 0; i < m.count; i++) if (a[i * 4 + 2] >= 0 && a[i * 4 + 2] < 1) attacking++; });
      res({ attacking, atGate: s.enemies.filter((e) => e.atGate && e.type === 0).length });
    })));
  });
  assert(atk.atGate > 0 && atk.attacking >= atk.atGate, `attack phases ${atk.attacking} for ${atk.atGate} rats at the gate`);
  const f = await g(page, () => window.__cc.sim.fortress);
  await g(page, (f) => window.__cc.teleport(f.x + 5, f.z + 8), f);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/rats-attack.png` });
  // defeat: killed rats keep animating for a moment, then disappear
  const dying = await g(page, () => {
    const c = window.__cc, s = c.sim; let n = 0;
    for (const e of s.enemies) if (e.type === 0 && n < 12) { s._damage(e, 1e9); n++; }
    const giant = s.enemies.find((e) => e.type !== 0);
    if (giant) s._damage(giant, 1e9);
    window.__giantId = giant ? giant.id : -1;
    return { n, giant: !!giant };
  });
  assert(dying.n > 0, 'no rats to defeat');
  await page.waitForFunction(() => window.__cc.view.ratDying.length > 0, null, { timeout: 5000 });
  await g(page, () => { window.__dyingSnap = [...window.__cc.view.ratDying]; });
  await page.screenshot({ path: `${SHOTS}/rats-defeat.png` });
  if (dying.giant) {
    const falling = await g(page, () => [...window.__cc.view.giantViews.values()].some((v) => v.dying !== undefined));
    assert(falling, 'the defeated giant rat vanished without falling over');
  }
  // those bodies finish and are removed (new rats keep arriving, so check these ones)
  await page.waitForFunction(() => window.__dyingSnap.every((d) => !window.__cc.view.ratDying.includes(d)) && !window.__cc.view.giantViews.has(window.__giantId), null, { timeout: 30000 });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('tower attacks in the browser: heads turn and tilt at rats, barrels elevate, cannonballs show where they land', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.unlocked.cannon = true; s.towers.length = 0; for (const sl of s.slots) sl.tower = null;
    s._placeTower(s.slots[8], 2, true, 'cannon'); s._placeTower(s.slots[0], 3, true, 'crossbow');
    s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 2; s.callWave(); c.advance(6); c.teleport(14, 31);
  });
  // step until a cannonball is in the air and the crossbow has a rat, then let a few frames draw
  // step until a cannonball is in the air and the crossbow has a rat, then freeze the simulation there
  const ok = await g(page, () => { const s = window.__cc.sim; for (let i = 0; i < 900; i++) { s.step(1 / 60); const sh = s.shells.find((q) => q.t / q.T < 0.5); if (sh && s.towers[1].target) { s.step = () => {}; return true; } } return false; });
  assert(ok, 'never had a cannonball in flight with the crossbow tracking a rat');
  // wait for the renderer to draw the placed towers (software GL can be slow)
  await page.waitForFunction(() => { const c = window.__cc; return c.sim.towers.every((t) => c.view.towerViews.has(t.slotIndex)); }, null, { timeout: 20000 });
  // wait until a frame has drawn the frozen simulation
  await page.waitForFunction(() => { const c = window.__cc; return c.sim.towers.every((t) => Math.abs(c.view.towerViews.get(t.slotIndex).head.rotation.y - t.yaw) < 1e-6); }, null, { timeout: 20000 });
  // the bow jerks up as it looses: let the last shot's recoil spring settle before measuring its tilt
  // (a busy test machine can briefly hide the page, which pauses the game and holds the tilt still: resume it)
  await page.waitForFunction(() => { const c = window.__cc; if (c.mode === 'pause') c.resume(); const t = c.sim.towers[1]; return c.view.towerViews.get(t.slotIndex).head.rotation.x > 0.02; }, null, { timeout: 15000 }).catch(() => {});
  const r = await g(page, () => {
    const c = window.__cc, s = c.sim, v = c.view;
    const views = s.towers.map((t) => ({ t, v: v.towerViews.get(t.slotIndex) }));
    return {
      yawMatch: views.every(({ t, v: tv }) => Math.abs(tv.head.rotation.y - t.yaw) < 1e-6),
      crossbowPitch: views[1].v.head.rotation.x,
      cannonElev: -views[0].v.gun.rotation.x,
      rings: v.impactMesh.count, shells: s.shells.length, arrows: v.boltMesh.count,
    };
  });
  assert(r.yawMatch, 'a tower head does not face the way the simulation aims');
  assert(r.crossbowPitch > 0.02, `crossbow not tilted at the rat below (${r.crossbowPitch.toFixed(3)})`);
  assert(r.cannonElev > 0.25, `cannon barrel not raised for the shot (${r.cannonElev.toFixed(3)})`);
  assert(r.shells === 0 || r.rings === r.shells, `landing rings ${r.rings} for ${r.shells} cannonballs`);
  await page.screenshot({ path: `${SHOTS}/tower-attacks.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('boss waves: the build phase and a siren warn before the Rat Warlord climbs out; it gets its own model and health bar', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // build phase before wave 5: the wave counter says a boss is next
  await g(page, () => { const s = window.__cc.sim; s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 4; });
  await page.waitForFunction(() => { const el = document.getElementById('waveSub'); return el.classList.contains('alert') && /Boss next/.test(el.textContent); }, null, { timeout: 20000 });
  // start the wave and run until the warning banner goes up
  const w = await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.callWave();
    const a = s.bossAlerts[0];
    let found = false;
    for (let i = 0; i < 400 && !found; i++) { c.advance(0.1); found = /Boss incoming/.test(document.getElementById('bannerHost').textContent); }
    return {
      found, lead: a.t - s.waveTime, boss: a.boss, banner: document.getElementById('bannerHost').textContent,
      vignette: !document.getElementById('bossVignette').hidden, bossOut: s.enemies.some((e) => e.type === 2), alarm: c.view.bossAlarm,
    };
  });
  assert(w.found, 'no "Boss incoming" banner before the boss');
  assert(w.boss === 'warlord', 'wave 5 boss should be the Rat Warlord, got ' + w.boss);
  assert(w.lead > 4 && w.lead <= 5.2, `warning came ${w.lead.toFixed(2)} s before the boss`);
  assert(!w.bossOut, 'the boss was already on the road when the warning appeared');
  assert(/Rat Warlord/.test(w.banner), 'banner does not name the boss: ' + w.banner);
  assert(w.vignette, 'red warning vignette not shown');
  assert(w.alarm > 0, 'burrow alarm not running');
  // the edge arrow points at the burrow while the boss is on its way
  await page.waitForFunction(() => document.querySelector('.off-arrow.boss').style.display !== 'none', null, { timeout: 20000 });
  // run past the spawn: the boss is out, announced, and has a health bar and its own model
  const b = await g(page, () => {
    const c = window.__cc, s = c.sim;
    c.advance(s.bossAlerts[0].t + 1 - s.waveTime);
    const e = s.enemies.find((q) => q.type === 2);
    return e && { id: e.id, boss: e.boss, hp: e.hp, toasts: c.toasts.slice() };
  });
  assert(b && b.boss === 'warlord', 'the Rat Warlord did not spawn');
  assert(b.toasts.some((t) => /Rat Warlord has appeared/.test(t)), 'no toast when the boss appeared');
  await page.waitForFunction(() => /Rat Warlord · \d+/.test(document.getElementById('bossBars').textContent), null, { timeout: 30000 });
  await page.waitForFunction((id) => { const v = window.__cc.view.giantViews.get(id); return v && v.boss === 'warlord' && v.group.visible; }, b.id, { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/boss-warlord.png` });
  // defeat it: the bar goes away
  await g(page, (id) => { const c = window.__cc; const e = c.sim.enemies.find((q) => q.id === id); e.hp = 1; c.sim._damage(e, 50); c.advance(0.5); }, b.id);
  await page.waitForFunction(() => [...document.querySelectorAll('#bossBars .boss-bar')].every((r) => r.hidden), null, { timeout: 30000 });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('cartoon look: every lit surface is toon shaded and models get ink outlines that really draw', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { const c = window.__cc, s = c.sim; s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 4; s.callWave(); c.advance(9); });
  await page.waitForFunction(() => window.__cc.view.giantViews.size > 0, null, { timeout: 30000 });
  const r = await g(page, () => {
    const v = window.__cc.view; const bad = []; let toon = 0, inks = 0;
    v.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      if (m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial) bad.push(m.type);
      if (m.isMeshToonMaterial) toon++;
      if (o.name === 'ink') inks++;
    });
    const giant = [...v.giantViews.values()][0];
    const tower = [...v.towerViews.values()][0];
    return {
      bad, toon, inks,
      rats: v.ratMeshes.every((m) => m.userData.ink && m.userData.ink.isInstancedMesh && m.userData.ink.count === m.count),
      ratCount: v.ratMeshes.reduce((a, m) => a + m.count, 0),
      hero: !!v.hero.inner.children[0].userData.ink, keep: !!v.fortress.userData.ink,
      terrain: !!v.env.group.children.find((m) => m.userData.ink),
      giant: !!(giant && giant.group.children[0].children[0].userData.ink),
      tower: !!(tower && tower.base.userData.ink && tower.base.userData.ink.visible && tower.headMesh.userData.ink.visible),
      width: v.ink.uRes.value.x > 0 && v.ink.uDpr.value > 0,
    };
  });
  assert(r.bad.length === 0, 'non-toon lit materials left: ' + [...new Set(r.bad)].join(', '));
  assert(r.toon > 10, 'too few toon materials: ' + r.toon);
  assert(r.rats && r.ratCount > 0, 'rat outlines missing or out of step with the rats');
  assert(r.hero && r.keep && r.terrain && r.giant && r.tower, 'an outline is missing: ' + JSON.stringify(r));
  assert(r.width, 'outline width uniforms not set');
  // the outlines really draw: with them on, far more ink-dark pixels appear on screen
  const darkPixels = (scale) => g(page, (k) => new Promise((res) => {
    const v = window.__cc.view;
    v.ink.uInkScale.value = k;
    v.render();
    const url = v.renderer.domElement.toDataURL();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 1] < 56 && d[i + 2] < 46) n++;
      res(n);
    };
    img.src = url;
  }), scale);
  await g(page, () => { window.__cc.sim.step = () => {}; });   // hold the scene still
  const off = await darkPixels(0);
  const on = await darkPixels(1);
  await g(page, () => { window.__cc.view.ink.uInkScale.value = 1; });
  assert(on - off > 3000, `outlines do not show: ${on} ink pixels with outlines, ${off} without`);
  await page.screenshot({ path: `${SHOTS}/cartoon-look.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('town: villagers go about their day, run and hide from rats, come back out, and celebrate a win', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // the town is there: town hall, houses with outlines, windmill, villagers
  const r = await g(page, () => {
    const v = window.__cc.view, st = v.town.stats();
    return { st, houses: !!v.houses.userData.ink && v.houses.geometry.attributes.position.count > 1000, sails: !!v.sails, meshes: v.town.meshes.map((m) => m.count), inks: v.town.meshes.every((m) => m.userData.ink && m.userData.ink.count === m.count) };
  });
  assert(r.st.total >= 12 && r.st.visible === r.st.total, 'villagers missing: ' + JSON.stringify(r.st));
  assert(r.houses && r.sails && r.inks, 'town pieces missing: ' + JSON.stringify(r));
  // everyday life: farmers work, neighbours chat
  const busy = await g(page, () => { const c = window.__cc; for (let i = 0; i < 300; i++) c.view.town.update(0.1, c.sim); const st = c.view.town.stats(); return st.working + st.talking; });
  assert(busy >= 4, 'nobody is working or chatting: ' + busy);
  // rats burst into the square: villagers nearby panic, run home and hide
  const p = await g(page, () => {
    const c = window.__cc, s = c.sim, sq = { x: -17.5, z: -36 };
    s.callWave(); c.advance(3);
    s.step = () => {};   // freeze the rats where we put them
    s.enemies.slice(0, 8).forEach((e, i) => { e.x = sq.x + (i % 4) * 2 - 3; e.z = sq.z + 1 + Math.floor(i / 4) * 2; });
    let sawEmote = false, peakPanic = 0;
    for (let i = 0; i < 300; i++) {
      c.view.town.update(0.05, s);
      c.view.town.placeEmotes();
      const st = c.view.town.stats();
      peakPanic = Math.max(peakPanic, st.panic);
      if ([...document.querySelectorAll('.emote')].some((el) => el.style.display !== 'none' && /!|Eek/.test(el.textContent))) sawEmote = true;
    }
    return { st: c.view.town.stats(), sawEmote, peakPanic };
  });
  assert(p.peakPanic >= 3, 'villagers did not panic: ' + JSON.stringify(p));
  assert(p.st.hidden >= 3, 'villagers did not hide indoors: ' + JSON.stringify(p.st));
  assert(p.sawEmote, 'no alarmed speech bubble appeared');
  // the rats are gone and the wave is over: everyone comes back out
  const out = await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.enemies.length = 0; s.state = 'build';
    for (let i = 0; i < 200; i++) c.view.town.update(0.05, s);
    return c.view.town.stats();
  });
  assert(out.hidden === 0, 'villagers stayed hidden after the wave: ' + JSON.stringify(out));
  // a win: the camera turns to the town and everyone cheers
  await g(page, () => {
    const c = window.__cc, s = c.sim;
    delete s.step;   // back to the real simulation step
    s.state = 'build'; s.waveIndex = s.waveCount - 1; s.callWave(); c.advance(0.3);
    s.spawnQueue.length = 0; s.spawnIndex = 0; s.enemies.length = 0; c.advance(0.2);
  });
  await page.waitForFunction(() => window.__cc.sim.state === 'victory' && window.__cc.view.focus, null, { timeout: 20000 });
  const w = await g(page, () => { const c = window.__cc; for (let i = 0; i < 250; i++) c.view.town.update(0.05, c.sim); return c.view.town.stats(); });
  assert(w.cheering >= Math.floor(w.total * 0.6), 'too few villagers cheering: ' + JSON.stringify(w));
  assert(w.mood === 'cheer', 'town mood is not cheering');
  // the camera has swung over to the town square
  await page.waitForFunction(() => { const v = window.__cc.view; return Math.hypot(v.camTarget.x - v.focus.x, v.camTarget.z - v.focus.z) < 5; }, null, { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/town-celebrates.png` });
  await page.waitForFunction(() => window.__cc.screen === 'victoryScreen', null, { timeout: 30000 });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('enemies that need tactics: shield, healer and brood rats are drawn; shields break, broods burst, healers heal; a card introduces each', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // wave 4 introduces shield rats: the New enemy card shows its 3D portrait and how to beat it
  await g(page, () => { const c = window.__cc, s = c.sim; s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 3; s.callWave(); c.advance(0.5); });
  await page.waitForFunction(() => !document.getElementById('enemyCard').hidden, null, { timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('ecImg').naturalWidth > 0, null, { timeout: 30000 });
  const card = await g(page, () => ({ name: document.getElementById('ecName').textContent, counter: document.getElementById('ecCounter').textContent }));
  assert(card.name === 'Shield rat' && /cannon/i.test(card.counter), 'card: ' + JSON.stringify(card));
  await page.waitForTimeout(700);   // let it slide in
  await page.screenshot({ path: `${SHOTS}/enemy-card.png` });
  await page.click('#ecClose');
  assert(await g(page, () => document.getElementById('enemyCard').hidden), 'the card did not close');
  // wave 7: shield, healer and brood rats all on the road, each drawn with its own model
  const r = await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.towers.length = 0; for (const sl of s.slots) sl.tower = null;
    s.state = 'build'; s.waveIndex = 6; s.callWave(); c.advance(40);
    s.step = () => {};   // hold the crowd still
    const SH = 3, HE = 4, BR = 5;
    const shield = s.enemies.find((e) => e.alive && e.v === SH), brood = s.enemies.find((e) => e.alive && e.v === BR);
    // break a shield and kill a brood rat
    s._shieldHit(shield, 1e6, { armorPierce: 0 });
    s._damage(brood, 1e7);
    const healer = s.enemies.find((e) => e.alive && e.v === HE);
    const hurt = s.enemies.find((e) => e.alive && e.v === 0 && Math.hypot(e.x - healer.x, e.z - healer.z) < 3);
    if (hurt) hurt.hp = 1;
    healer.healT = 0.001; s._buildGrid(); s._updateHealers(0.016);
    return { shieldGone: shield.shield === 0, ratlings: s.enemies.filter((e) => e.alive && e.v === 6).length, events: s.events.map((e) => e.type) };
  });
  assert(r.shieldGone && r.ratlings >= 4, 'shield / brood: ' + JSON.stringify({ ...r, events: undefined }));
  assert(['shieldBreak', 'split', 'heal'].every((k) => r.events.includes(k)), 'missing events: ' + r.events.filter((k) => /shield|split|heal/.test(k)));
  await g(page, () => { const c = window.__cc; for (const e of c.sim.events) c.view.handleEvent(e, c.sim); c.sim.events.length = 0; });
  // the first eight rat meshes draw: plain, fast, armored, shield, healer, brood, ratling and the shield rat without its shield (10)
  await page.waitForFunction(() => window.__cc.view.ratMeshes.every((m, v) => v > 6 && v < 10 || m.count > 0), null, { timeout: 30000 });
  const plusses = await g(page, () => window.__cc.view.fx.plusses.items.length);
  assert(plusses > 0, 'no green plus signs over healed rats');
  await page.screenshot({ path: `${SHOTS}/new-enemies.png` });
  // the Rat guide from the pause menu: every enemy with a 3D portrait; Back returns to the pause menu
  await g(page, () => { delete window.__cc.sim.step; });
  await page.click('#pauseBtn');
  await page.click('#pauseGuideBtn');
  await page.waitForFunction(() => window.__cc.screen === 'guideScreen');
  await page.waitForFunction(() => { const imgs = [...document.querySelectorAll('#guideList img')]; return imgs.length >= 14 && imgs.every((i) => i.naturalWidth > 0); }, null, { timeout: 60000 });
  const names = await page.$$eval('#guideList h3', (els) => els.map((e) => e.firstChild.textContent.trim()));
  for (const n of ['Shield rat', 'Healer rat', 'Brood rat', 'Ratling', 'Sewer Slime', 'Tunnel Mole', 'Canyon Buzzard', 'Rat King']) assert(names.includes(n), 'guide is missing ' + n);
  // portraits are real pictures, not blank squares
  const varied = await g(page, () => { const img = document.querySelector('#guideList img'); const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 48, 48); const d = x.getImageData(0, 0, 48, 48).data; const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4)); return set.size; });
  assert(varied > 12, 'the portrait looks blank: ' + varied + ' colours');
  await page.screenshot({ path: `${SHOTS}/rat-guide.png` });
  await page.click('#guideScreen [data-back]');
  assert(await g(page, () => window.__cc.screen) === 'pauseScreen', 'Back should return to the pause menu');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('phone: the New enemy card is small, says "Tap for more", opens the full details on a tap and closes on the next', async () => {
  const { ctx, page, errors } = await open('phone', { sfx: false, music: false, quality: 'low', tutorialDone: true });
  await page.tap('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { const c = window.__cc, s = c.sim; s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 3; s.callWave(); c.advance(0.5); });
  await page.waitForFunction(() => !document.getElementById('enemyCard').hidden, null, { timeout: 30000 });
  const vis = (id) => g(page, (id) => { const el = document.getElementById(id); return !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'; }, id);
  const small = await g(page, () => document.getElementById('enemyCard').getBoundingClientRect().height);
  assert(await vis('ecMore') && (await page.textContent('#ecMore')) === 'Tap for more', 'the small card should say "Tap for more"');
  assert(!(await vis('ecTrait')), 'the small card should leave out what the rat does');
  await page.tap('#ecName');
  assert(!(await g(page, () => document.getElementById('enemyCard').hidden)), 'the first tap should open the card, not close it');
  assert(await vis('ecTrait') && (await page.textContent('#ecMore')) === 'Tap to close', 'the open card shows the full details');
  const big = await g(page, () => document.getElementById('enemyCard').getBoundingClientRect().height);
  assert(big > small + 20, `the open card should be taller (${small} → ${big})`);
  await page.screenshot({ path: `${SHOTS}/phone-enemy-card-open.png` });
  await page.tap('#ecName');
  assert(await g(page, () => document.getElementById('enemyCard').hidden), 'the second tap should close the card');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('new rats: bomb, ninja and jetpack rats get their own card and model, and their tricks show', async () => {
  const { ctx, page, errors } = await open('desktop', { sfx: false, music: false, quality: 'high', tutorialDone: true });
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // wave 9 brings the first bomb rats, with a New enemy card
  await g(page, () => { const c = window.__cc, s = c.sim; s.towers.length = 0; for (const sl of s.slots) sl.tower = null; s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 8; s.callWave(); c.advance(2); });
  await page.waitForFunction(() => !document.getElementById('enemyCard').hidden && document.getElementById('ecName').textContent === 'Bomb rat', null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('ecImg').naturalWidth > 0, null, { timeout: 30000 });
  // tapping anywhere on the card closes it
  await page.click('#ecName');
  assert(await g(page, () => document.getElementById('enemyCard').hidden), 'tapping the card did not close it');
  // the final wave has plenty of all three: each drawn with its own model; a bomb rat goes off in the crowd
  const r = await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.state = 'build'; s.waveIndex = 15; s.callWave(); c.advance(40);
    const by = (v) => s.enemies.filter((e) => e.alive && e.type === 0 && e.v === v);
    const counts = [by(7).length, by(8).length, by(9).length];
    const bomb = by(7)[0];
    s._buildGrid(); s.events.length = 0;
    if (bomb) s._damage(bomb, 1e7);
    const blast = s.events.some((e) => e.type === 'bomb');
    for (const e of s.events) c.view.handleEvent(e, s);
    s.events.length = 0;
    return { counts, blast, jets: s.stats.jets | 0, scorch: c.view.fx.scorch.items.length };
  });
  assert(r.counts.every((n) => n > 0), 'new rats on the road: ' + r.counts.join('/'));
  assert(r.blast && r.scorch > 0 && r.jets > 0, 'tricks: ' + JSON.stringify(r));
  await page.waitForFunction(() => [7, 8, 9].every((v) => window.__cc.view.ratMeshes[v].count > 0), null, { timeout: 30000 });
  await g(page, () => { const c = window.__cc, s = c.sim, e = s.enemies.find((q) => q.v === 8) || s.enemies[0]; c.teleport(e.x + 1, e.z + 2); s.step = () => {}; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/new-rats.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('bosses with special abilities: the Sewer Slime splits, the Tunnel Mole tunnels to the town, the Canyon Buzzard flies and drops rats', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // wave 8: the Sewer Slime climbs out, gets a boss card, a model and a health bar
  const sl = await g(page, () => {
    const c = window.__cc, s = c.sim;
    s.fortress.hp = s.fortress.maxHp = 1e6; s.towers.length = 0; for (const q of s.slots) q.tower = null;
    s.waveIndex = 7; s.callWave();
    for (let i = 0; i < 600 && !s.enemies.some((e) => e.boss === 'slime'); i++) c.advance(0.1);
    const e = s.enemies.find((q) => q.boss === 'slime');
    return e && { id: e.id, hp: e.hp };
  });
  assert(sl, 'the Sewer Slime did not come');
  await page.waitForFunction(() => !document.getElementById('enemyCard').hidden && document.getElementById('ecName').textContent === 'Sewer Slime', null, { timeout: 30000 });
  assert(await g(page, () => document.getElementById('ecTag').textContent) === 'Boss', 'the card should say Boss');
  await page.waitForFunction((id) => { const v = window.__cc.view.giantViews.get(id); return v && v.boss === 'slime' && v.group.visible; }, sl.id, { timeout: 30000 });
  await page.waitForFunction(() => /Sewer Slime · \d+/.test(document.getElementById('bossBars').textContent), null, { timeout: 30000 });
  const first = await g(page, (id) => {
    const c = window.__cc, s = c.sim;
    s._damage(s.enemies.find((e) => e.id === id), 1e7); c.advance(0.05);
    return s.enemies.filter((e) => e.alive && e.boss === 'slime').map((e) => ({ id: e.id, tier: e.tier }));
  }, sl.id);
  assert(first.map((k) => k.tier).join() === '1,1', 'first split: ' + JSON.stringify(first));
  // the two new slimes are drawn, smaller than the big one
  await page.waitForFunction((ids) => ids.every((id) => { const v = window.__cc.view.giantViews.get(id); return v && v.boss === 'slime' && v.group.visible && v.baseScale < 1.5; }), first.map((k) => k.id), { timeout: 30000 });
  await page.waitForFunction(() => /Sewer Slime ×2 · \d+/.test(document.getElementById('bossBars').textContent), null, { timeout: 30000 });
  const second = await g(page, () => {
    const c = window.__cc, s = c.sim;
    for (const e of s.enemies.filter((q) => q.alive && q.boss === 'slime')) s._damage(e, 1e7);
    c.advance(0.05);
    return s.enemies.filter((e) => e.alive && e.boss === 'slime').map((e) => e.tier);
  });
  assert(second.join() === '2,2,2,2', 'second split: ' + second);
  await page.waitForFunction(() => /Sewer Slime ×4 · \d+/.test(document.getElementById('bossBars').textContent), null, { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/boss-slime.png` });
  // the Tunnel Mole: digs in (hidden, a hump of earth, red cracks where it will come up), then bursts out near the town
  const mole = await g(page, () => {
    const c = window.__cc, s = c.sim;
    for (const e of s.enemies) e.alive = false; s._compact();
    s.state = 'wave'; s.waveIndex = 10;
    s.spawnQueue = [{ t: s.waveTime, type: 2, hp: 4000, boss: 'mole', lat: 0 }]; s.spawnIndex = 0; s._spawn();
    const m = s.enemies[s.enemies.length - 1]; m.s = 35.8; s._placeEnemy(m);
    for (let i = 0; i < 60 && !m.under; i++) c.advance(0.05);
    return { id: m.id, under: m.under, banner: document.getElementById('bannerHost').textContent };
  });
  assert(mole.under, 'the mole did not dig in');
  assert(/Underground/.test(mole.banner) && /Tunnel Mole/.test(mole.banner), 'dig banner: ' + mole.banner);
  // drawn: the mole is out of sight, a hump of earth moves along, red cracks mark the way out; the bar says so
  await page.waitForFunction((id) => { const c = window.__cc, v = c.view.giantViews.get(id); return v && !v.group.visible && c.view.mound.visible && c.view.exitMark.visible; }, mole.id, { timeout: 30000 });
  await page.waitForFunction(() => /Tunnel Mole · \d+ · underground/.test(document.getElementById('bossBars').textContent), null, { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/boss-mole-tunnel.png` });
  const out = await g(page, (id) => {
    const c = window.__cc, s = c.sim, m = s.enemies.find((e) => e.id === id);
    for (let i = 0; i < 400 && m.under; i++) c.advance(0.1);
    c.advance(0.2);
    return { under: m.under, s: m.s, toasts: c.toasts.slice(), rats: s.enemies.filter((e) => e.type === 0).length };
  }, mole.id);
  assert(!out.under, 'came up: ' + JSON.stringify(out));
  await page.waitForFunction((id) => { const c = window.__cc, v = c.view.giantViews.get(id); return v && v.group.visible && !c.view.mound.visible && !c.view.exitMark.visible; }, mole.id, { timeout: 30000 });
  assert(out.toasts.some((t) => /burst out near the town/.test(t)), 'no toast when it burst out');
  assert(out.rats >= 8, 'rats should come out with it: ' + out.rats);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/boss-mole-out.png` });
  // the Canyon Buzzard: flies high, drops rats that fall to the road, lands at the gate
  const bz = await g(page, () => {
    const c = window.__cc, s = c.sim;
    for (const e of s.enemies) e.alive = false; s._compact();
    s.state = 'wave'; s.waveIndex = 12;
    s.spawnQueue = [{ t: s.waveTime, type: 2, hp: 5000, boss: 'buzzard', lat: 0 }]; s.spawnIndex = 0; s._spawn();
    const b = s.enemies[s.enemies.length - 1]; b.s = 40; b.dropT = 0.3; s._placeEnemy(b);
    s.hero.x = 2; s.hero.z = 24;
    c.advance(0.6);
    return { id: b.id, fly: b.fly, dropped: s.stats.dropped || 0 };
  });
  assert(bz.fly > 4, 'the buzzard should fly high: ' + JSON.stringify(bz));
  assert(bz.dropped > 0, 'no rats dropped');
  await page.waitForFunction((id) => { const v = window.__cc.view.giantViews.get(id); return v && v.group.position.y > 4; }, bz.id, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/boss-buzzard.png` });
  const land = await g(page, (id) => {
    const c = window.__cc, s = c.sim, b = s.enemies.find((e) => e.id === id);
    b.s = b.gateS - 0.5; c.advance(0.5);
    return { atGate: b.atGate, fly: b.fly };
  }, bz.id);
  assert(land.atGate && land.fly === 0, 'landing: ' + JSON.stringify(land));
  await page.waitForFunction((id) => { const v = window.__cc.view.giantViews.get(id); return v && v.group.position.y < 0.5; }, bz.id, { timeout: 30000 });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('satisfying effects: towers recoil and spring back, arrows burst and stick in giants, blasted rats fly back and see stars, coins squash, monsters leave cartoon splashes', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // a fight: crossbows on a wave with giants (the frames below are stepped by hand, so they are exact)
  const r = await g(page, () => {
    const c = window.__cc, s = c.sim, v = c.view;
    s.fortress.hp = s.fortress.maxHp = 1e5;
    for (const i of [1, 3, 4]) s._placeTower(s.slots[i], 5, true, 'crossbow');
    s.slots[0].tower.level = 5;
    s.waveIndex = 5; s.callWave(); c.advance(16);
    s.step = () => {};   // hold the battle still while we look at the effects
    const out = {};
    // recoil: a shot kicks the tower back, it springs forward past rest, then settles
    const tw = s.towers[0], tv = v.towerViews.get(tw.slotIndex);
    tv.kick = 0; tv.kickV = 0;
    v.handleEvent({ type: 'fire', x: tw.x, z: tw.z, level: 5, slot: tw.slotIndex, burst: false }, s);
    let peak = 0, low = 0, headBack = 0;
    for (let i = 0; i < 90; i++) { v.sync(s, 1 / 60); peak = Math.max(peak, tv.kick); low = Math.min(low, tv.kick); headBack = Math.min(headBack, tv.headMesh.position.z); }
    out.recoil = { peak, low, headBack, rest: tv.kick };
    // arrows hitting rats burst; arrows hitting a giant stay stuck in it
    const giant = s.enemies.find((e) => e.alive && e.type === 1);
    const rat = s.enemies.find((e) => e.alive && e.type === 0);
    v.pokeBudget = 6;
    const b0 = v.fx.bursts.items.length;
    v.handleEvent({ type: 'poke', x: rat.x, y: 0.6, z: rat.z }, s);
    v.handleEvent({ type: 'hit', x: giant.x, z: giant.z, y: 1.9, giant: true, id: giant.id, dx: 1, dz: 0, level: 5 }, s);
    out.bursts = v.fx.bursts.items.length - b0;
    out.stuck = v.stuck.length;
    v.sync(s, 1 / 60);
    out.boltsDrawn = v.boltMesh.count;
    // the giant falls: its arrows drop off
    s._damage(giant, 1e7);
    for (const e of s.events) v.handleEvent(e, s);
    out.falling = v.stuck.every((a) => a.falling);
    // ...and a cartoon splash with droplets is left where monsters fall
    out.splats = v.fx.dust.items.length; out.drops = v.fx.drops.items.length;
    out.splatColours = new Set(v.fx.dust.items.map((d) => d.color)).size;
    s.events.length = 0;
    // a blast throws a rat back: it is drawn flying back in a hop, then lands where the simulation put it
    const k = s.enemies.find((e) => e.alive && e.type === 0 && e.s > 30 && !(e.stun > 0)) || s.enemies.find((e) => e.alive && e.type === 0 && !(e.stun > 0));
    v.sync(s, 1 / 60);
    k.s -= 1.5; s._placeEnemy(k);
    v.sync(s, 1 / 60);
    out.knock = { kb: k._kb, sliding: k._vs - k.s };
    for (let i = 0; i < 30; i++) v.sync(s, 1 / 60);
    out.knock.landed = Math.abs(k._vs - k.s);
    // stunned rats: dizzy stars circle their heads
    for (const e of s.enemies.filter((q) => q.alive && q.type === 0).slice(0, 5)) e.stun = 3;
    v.sync(s, 1 / 60);
    out.dizzy = v.dizzyMesh.count;
    // coins: squashed flat right after a bounce
    if (!s.coins.length) s._dropCoin(k.x, k.z, 0, 1, 2);
    const coin = s.coins[0]; coin.bt = 0.02; coin.bv = 10; coin.rest = true; coin.state = 0;
    v.sync(s, 1 / 60);
    const m = new (v.coinMesh.matrix.constructor)(); v.coinMesh.getMatrixAt(0, m);
    const e = m.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]);
    out.coin = { sx, sy };
    return out;
  });
  assert(r.recoil.peak > 0.5 && r.recoil.headBack < -0.1, 'recoil: ' + JSON.stringify(r.recoil));
  assert(r.recoil.low < -0.02 && Math.abs(r.recoil.rest) < 0.03, 'the recoil should spring past rest and settle: ' + JSON.stringify(r.recoil));
  assert(r.bursts === 2, 'impact bursts: ' + r.bursts);
  assert(r.stuck === 1 && r.boltsDrawn >= 1, `stuck arrows: ${r.stuck}, drawn ${r.boltsDrawn}`);
  assert(r.falling, 'arrows should drop off a fallen giant');
  assert(r.splats >= 1 && r.drops >= 3, `splash: ${r.splats} splats, ${r.drops} droplets`);
  assert(r.knock.kb > 1.4 && r.knock.sliding > 1 && r.knock.landed < 0.01, 'knockback hop: ' + JSON.stringify(r.knock));
  assert(r.dizzy >= 15, 'dizzy stars: ' + r.dizzy);
  assert(r.coin.sy < r.coin.sx * 0.75, 'a bouncing coin should squash: ' + JSON.stringify(r.coin));
  await page.screenshot({ path: `${SHOTS}/effects.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('Rat guide opens from the title screen', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#guideBtn');
  await page.waitForFunction(() => window.__cc.screen === 'guideScreen');
  await page.waitForFunction(() => [...document.querySelectorAll('#guideList img')].filter((i) => i.naturalWidth > 0).length >= 14, null, { timeout: 60000 });
  await page.click('#guideScreen [data-back]');
  assert(await g(page, () => window.__cc.screen) === 'titleScreen', 'Back should return to the title');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('Armory: the cannon costs 100 diamonds, unlocks after confirming, and is saved', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#armoryBtn');
  assert(await visible(page, '#armoryScreen'), 'armory hidden');
  const xb = await page.locator('.tower-card').first().locator('.levels li').allTextContents();
  assert(xb.length === 7 && xb[0].includes('Single Shot') && xb[5].includes('Frost Arrows') && xb[6].includes('Crystal Storm'), 'crossbow ability list missing');
  assert(await page.isDisabled('#buyCannon'), 'unlock button should be disabled with 0 diamonds');
  assert((await page.textContent('#cannonNote')).includes('100 more'), 'missing diamonds note');
  assert((await page.textContent('#buyCannon')).includes('100'), 'unlock button shows the wrong price');
  await page.click('#armoryScreen [data-back]');
  const prog = await g(page, () => { const p = JSON.parse(localStorage.getItem('crossbow-canyon:progress:v1') || '{}'); p.diamonds = 230; return JSON.stringify(p); });
  await setStorageAndReload(page, 'crossbow-canyon:progress:v1', prog);
  await page.waitForFunction(() => document.getElementById('gemVal').textContent === '230', null, { timeout: 5000 }).catch(() => {});
  assert((await page.textContent('#gemVal')) === '230', 'title diamond count: ' + (await page.textContent('#gemVal')) + ' / stored ' + (await g(page, () => localStorage.getItem('crossbow-canyon:progress:v1') + ' keys=' + Object.keys(localStorage).join(','))));
  await page.click('#armoryBtn');
  await page.click('#buyCannon');
  assert(await visible(page, '#confirmScreen'), 'no confirmation before spending diamonds');
  await page.click('#confirmNo');
  assert(await visible(page, '#armoryScreen'), 'cancel did not return to the armory');
  await page.click('#buyCannon');
  await page.click('#confirmYes');
  const p = await g(page, () => JSON.parse(localStorage.getItem('crossbow-canyon:progress:v1')));
  assert(p.diamonds === 130 && p.unlocks.cannon === true, 'purchase not saved ' + JSON.stringify(p));
  assert(await visible(page, '#cannonOwned'), 'unlocked badge hidden');
  await page.screenshot({ path: `${SHOTS}/armory-unlocked.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('cannon: pick it, build it, upgrade it, choose Rapid Launcher or Thunder Mortar at level 4, and both paths fight', async () => {
  const { ctx, page, errors } = await open();
  await setStorageAndReload(page, 'crossbow-canyon:progress:v1', JSON.stringify({ diamonds: 0, unlocks: { cannon: true } }));
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await page.waitForSelector('#buildPick:not([hidden])', { timeout: 10000 });
  await page.keyboard.press('Digit2');
  assert(await g(page, () => window.__cc.sim.buildKind) === 'cannon', 'key 2 did not pick the cannon');
  await page.click('#pickCrossbow');
  assert(await g(page, () => window.__cc.sim.buildKind) === 'crossbow', 'crossbow button');
  await page.click('#pickCannon');
  const pad = await g(page, () => { const s = window.__cc.sim; s.gold = 5000; s.buildTimer = 999; const p = s.pads.find((q) => q.kind === 'build'); window.__cc.teleport(p.x + 3.4, p.z); return { x: p.x, tower: p.tower, slot: p.slot }; });
  assert(pad.tower === 'cannon', 'pad does not build a cannon');
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction((x) => window.__cc.sim.hero.x <= x + 0.4, pad.x, { timeout: 25000 });
  await page.keyboard.up('ArrowLeft');
  await page.waitForFunction((si) => window.__cc.sim.slots[si].tower && window.__cc.sim.slots[si].tower.kind === 'cannon', pad.slot, { timeout: 30000 });
  // walk onto an upgrade pad of this tower (path: which choice pad at level 4)
  const upgrade = (si, path) => g(page, ([slot, want]) => {
    const s = window.__cc.sim;
    const p = s.pads.find((q) => q.kind === 'upgrade' && q.slot === slot && (!q.choice || q.path === want));
    if (!p) return -1;
    s.hero.x = p.x + 4; s.hero.z = p.z; window.__cc.advance(0.3); s.hero.x = p.x; s.hero.z = p.z; s.setInput(0, 0); window.__cc.advance(3);
    return s.slots[slot].tower.level;
  }, [si, path]);
  for (let lv = 2; lv <= 3; lv++) assert(await upgrade(pad.slot) === lv, `cannon stuck below level ${lv}`);
  // level 3: two choice pads, and the card beside the cannon offers both paths
  const choice = await g(page, (si) => { const s = window.__cc.sim, t = s.slots[si].tower; window.__cc.teleport(t.x + 1.8, t.z + 0.3); return s.pads.filter((q) => q.slot === si && q.kind === 'upgrade').map((q) => q.choice && q.path); }, pad.slot);
  assert(choice.length === 2 && choice.includes('rapid') && choice.includes('blast'), 'no upgrade choice pads: ' + JSON.stringify(choice));
  await page.waitForFunction(() => !document.getElementById('tcChoice').hidden && document.querySelectorAll('#tcChoice .tcard-opt').length === 2, null, { timeout: 20000 });
  const opts = await page.$$eval('#tcChoice .tcard-opt b', (els) => els.map((e) => e.textContent));
  assert(opts.join() === 'Rapid Launcher,Thunder Mortar', 'card options: ' + opts);
  await page.waitForFunction((si) => [...window.__cc.view.padViews.values()].filter((v) => v.group.visible !== false).length >= 2, pad.slot, { timeout: 20000 });
  await page.screenshot({ path: `${SHOTS}/cannon-choice.png` });
  // take the Rapid Launcher path, then on to level 7
  for (let lv = 4; lv <= 7; lv++) assert(await upgrade(pad.slot, 'rapid') === lv, `rapid cannon stuck below level ${lv}`);
  const after = await g(page, (si) => ({ path: window.__cc.sim.slots[si].tower.path, choices: window.__cc.sim.pads.filter((q) => q.choice).length }), pad.slot);
  assert(after.path === 'rapid' && after.choices === 0, 'path not taken: ' + JSON.stringify(after));
  await page.waitForFunction((si) => { const tv = window.__cc.view.towerViews.get(si); return tv && tv.level === 7 && tv.path === 'rapid'; }, pad.slot, { timeout: 20000 });
  await page.screenshot({ path: `${SHOTS}/cannon-rapid7.png` });
  // a second cannon takes the Thunder Mortar path
  const other = await g(page, (si) => { const s = window.__cc.sim; const sl = s.slots.find((q) => !q.tower && q.index !== si); s._placeTower(sl, 3, true, 'cannon'); s.refreshPads(); return sl.index; }, pad.slot);
  for (let lv = 4; lv <= 7; lv++) assert(await upgrade(other, 'blast') === lv, `mortar stuck below level ${lv}`);
  await page.waitForFunction((si) => { const tv = window.__cc.view.towerViews.get(si); return tv && tv.level === 7 && tv.path === 'blast'; }, other, { timeout: 20000 });
  // both fight: rocket salvos from the launcher, Novas from the mortar
  const fight = await g(page, () => { const s = window.__cc.sim; s.fortress.hp = s.fortress.maxHp = 99999; s.waveIndex = 8; s.callWave(); let n = 0, novas = 0, rockets = 0; for (let i = 0; i < 60 * 40; i++) { s.step(1 / 60); for (const e of s.events) { if (e.type === 'explode') { n++; if (e.kind === 'rocket') rockets++; } if (e.type === 'novaFire') novas++; } s.events.length = 0; } return { n, novas, rockets, kills: s.stats.kills }; });
  assert(fight.n > 30 && fight.novas >= 2 && fight.rockets >= 12 && fight.kills > 80, 'the cannons did not fight: ' + JSON.stringify(fight));
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('restart asks for confirmation; Cancel keeps the game, Yes restarts', async () => {
  const { ctx, page } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { window.__cc.sim.callWave(); window.__cc.advance(5); });
  await page.click('#pauseBtn');
  await page.click('#restartBtn');
  assert(await visible(page, '#confirmScreen'), 'no confirmation');
  await page.click('#confirmNo');
  assert(await visible(page, '#pauseScreen'), 'cancel did not return to pause');
  assert(await g(page, () => window.__cc.sim.state) === 'wave', 'cancel changed the game');
  await page.click('#restartBtn');
  await page.click('#confirmYes');
  const s = await g(page, () => ({ mode: window.__cc.mode, state: window.__cc.sim.state, wave: window.__cc.sim.waveIndex, towers: window.__cc.sim.towers.length }));
  assert(s.mode === 'play' && s.state === 'build' && s.wave === 0 && s.towers === 1, 'restart failed ' + JSON.stringify(s));
  await page.click('#pauseBtn'); await page.click('#quitBtn');
  assert(await visible(page, '#titleScreen'), 'main menu button failed');
  await ctx.close();
});

await test('defeat screen appears when the keep falls; Retry restores the wave start', async () => {
  const { ctx, page } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { window.__cc.sim.callWave(); window.__cc.advance(1); window.__cc.sim.fortress.hp = 1; window.__cc.sim.towers.length = 0; });
  await page.waitForFunction(() => { window.__cc.advance(2); return window.__cc.sim.state === 'defeat'; }, null, { timeout: 60000, polling: 50 });
  await page.waitForSelector('#defeatScreen:not([hidden])', { timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/desktop-defeat.png` });
  assert((await page.textContent('#retryBtn')).includes('wave 1'), 'retry label');
  assert((await page.textContent('#dGemText')).includes('Clear a wave'), 'defeat on wave 1 should explain how to earn diamonds');
  await page.click('#retryBtn');
  const s = await g(page, () => ({ mode: window.__cc.mode, state: window.__cc.sim.state, wave: window.__cc.sim.waveIndex, towers: window.__cc.sim.towers.length, hp: window.__cc.sim.fortress.hp }));
  assert(s.mode === 'play' && s.state === 'build' && s.wave === 0 && s.towers === 1 && s.hp === 100, 'retry failed ' + JSON.stringify(s));
  await ctx.close();
});

await test('diamonds are earned wave by wave, so a lost run still pays for the waves it cleared', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  // clear two waves with the autoplayer, watching the wave-cleared banner mention diamonds
  await g(page, () => { window.__cc.autoplay(true); window.__cc.sim.callWave(); });
  await page.waitForFunction(() => { window.__cc.advance(2); return window.__cc.sim.waveIndex >= 1 && window.__cc.sim.state === 'build'; }, null, { timeout: 60000, polling: 50 });
  await page.waitForFunction(() => /diamond/.test(document.getElementById('bannerHost').textContent), null, { timeout: 8000 });
  await page.waitForFunction(() => { const s = window.__cc.sim; if (s.state === 'build') s.callWave(); window.__cc.advance(2); return s.waveIndex >= 2 && s.state === 'build'; }, null, { timeout: 60000, polling: 50 });
  const mid = await g(page, () => ({ run: window.__cc.sim.stats.diamonds, saved: JSON.parse(localStorage.getItem('crossbow-canyon:progress:v1')).diamonds }));
  const want = await g(page, () => window.__cc.sim.diamondsPaid);
  assert(mid.run === 2 && mid.saved === 2 && want === 2, 'two cleared waves should have paid 2 diamonds: ' + JSON.stringify(mid));
  // now let the keep fall on wave 3
  await g(page, () => { const c = window.__cc, s = c.sim; c.autoplay(false); s.callWave(); c.advance(1); s.fortress.hp = 1; s.towers.length = 0; });
  await page.waitForFunction(() => { window.__cc.advance(2); return window.__cc.sim.state === 'defeat'; }, null, { timeout: 60000, polling: 50 });
  await page.waitForSelector('#defeatScreen:not([hidden])', { timeout: 8000 });
  const text = await page.textContent('#dGemText');
  assert(text.includes('+2 diamonds') && text.includes('you have 2'), 'defeat screen should show the diamonds earned: ' + text);
  // retrying the wave and clearing it pays only that wave, never the earlier ones again
  await page.click('#retryBtn');
  await g(page, () => { window.__cc.autoplay(true); window.__cc.sim.callWave(); });
  await page.waitForFunction(() => { window.__cc.advance(2); return window.__cc.sim.waveIndex >= 3 && window.__cc.sim.state === 'build'; }, null, { timeout: 60000, polling: 50 });
  const after = await g(page, () => JSON.parse(localStorage.getItem('crossbow-canyon:progress:v1')).diamonds);
  assert(after === 3, `after retrying and clearing wave 3 you should have 3 diamonds, have ${after}`);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('progress is saved: reload shows Continue and restores towers, gold and wave', async () => {
  const { ctx, page } = await open('desktop', undefined, null, await httpURL());
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { window.__cc.autoplay(true); });
  await page.waitForFunction(() => { window.__cc.advance(3); return window.__cc.sim.waveIndex >= 1 && window.__cc.sim.state === 'build'; }, null, { timeout: 90000, polling: 50 });
  const before = await g(page, () => { window.__cc.autoplay(false); const s = window.__cc.sim; window.__cc.advance(0.1); return { wave: s.waveIndex, towers: s.towers.length, gold: s.gold }; });
  await page.waitForTimeout(5600); // periodic save in the build phase
  // pausing saves too; then nothing writes while we give the storage time to commit before the reload
  await g(page, () => window.__cc.pause());
  const before2 = await g(page, () => ({ gold: window.__cc.sim.gold, towers: window.__cc.sim.towers.length }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cc && window.__cc.screen === 'titleScreen');
  assert(await visible(page, '#continueBtn'), 'continue hidden after reload');
  assert((await page.textContent('#continueBtn')).includes(`wave ${before.wave + 1}`), 'continue label');
  await page.click('#continueBtn');
  const after = await g(page, () => ({ wave: window.__cc.sim.waveIndex, towers: window.__cc.sim.towers.length, gold: window.__cc.sim.gold, state: window.__cc.sim.state }));
  assert(after.wave === before.wave && after.towers === before2.towers && after.state === 'build', 'restore mismatch ' + JSON.stringify({ before2, after }));
  assert(Math.abs(after.gold - before2.gold) <= 25, 'gold not restored ' + JSON.stringify({ before2, after }));
  // New game over an existing save asks first
  await page.click('#pauseBtn'); await page.click('#quitBtn');
  await page.click('#playBtn');
  assert(await visible(page, '#confirmScreen'), 'new game over a save did not ask');
  await page.click('#confirmNo');
  await ctx.close();
});

await test('full level in the real browser: autoplayer reaches the victory screen', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => window.__cc.autoplay(true));
  let shotNight = false;
  let shotKing = false, maxWave = 0;
  for (let i = 0; i < 900; i++) {
    const st = await g(page, () => { window.__cc.advance(4); return { state: window.__cc.sim.state, wave: window.__cc.sim.waveIndex, n: window.__cc.sim.enemies.length, last: window.__cc.sim.waveCount - 1 }; });
    maxWave = Math.max(maxWave, st.wave);
    if (!shotKing && st.wave === 7 && st.n > 150) { await page.waitForTimeout(1200); await page.screenshot({ path: `${SHOTS}/desktop-wave8.png` }); shotKing = true; }
    if (!shotNight && st.wave === st.last && st.n > 150) { await page.waitForTimeout(1200); await page.screenshot({ path: `${SHOTS}/desktop-final-wave.png` }); shotNight = true; }
    if (st.state === 'victory' || st.state === 'defeat') break;
  }
  const end = await g(page, () => ({ state: window.__cc.sim.state, stars: window.__cc.sim.stars, kills: window.__cc.sim.stats.kills, n: window.__cc.sim.waveCount }));
  assert(end.state === 'victory', 'autoplayer did not win: ' + end.state + ' on wave ' + (maxWave + 1));
  assert(end.n >= 16 && maxWave >= end.n - 1, `victory came before wave ${end.n} (reached ${maxWave + 1})`);
  await page.waitForSelector('#victoryScreen:not([hidden])', { timeout: 5000 });
  const starsOn = await page.locator('#victoryStars .on').count();
  assert(starsOn === end.stars && starsOn >= 1, 'stars mismatch');
  assert(Number(await page.textContent('#vKills')) === end.kills, 'kills mismatch');
  await page.screenshot({ path: `${SHOTS}/desktop-victory.png` });
  const prog = await g(page, () => JSON.parse(localStorage.getItem('crossbow-canyon:progress:v1')));
  assert(prog.cleared === true && prog.bestStars >= 1, 'victory not saved');
  assert(prog.diamonds === 50, `clearing the canyon should give 50 diamonds, got ${prog.diamonds}`);
  assert((await page.textContent('#vGemText')).includes('+50'), 'victory screen does not show the diamonds');
  await page.click('#againBtn');
  assert(await g(page, () => window.__cc.sim.waveIndex === 0 && window.__cc.mode === 'play'), 'play again failed');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('phone: drag-anywhere joystick moves the hero; HUD fits the screen', async () => {
  const { ctx, page, errors } = await open('phone');
  await page.screenshot({ path: `${SHOTS}/phone-title.png` });
  await page.tap('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  const cdp = await ctx.newCDPSession(page);
  const h0 = await g(page, () => ({ ...window.__cc.sim.hero }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600, id: 1 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 + i * 12, y: 600 - i * 4, id: 1 }] }); await page.waitForTimeout(16); }
  assert(await visible(page, '#joy'), 'joystick not shown while dragging');
  await page.waitForFunction((x0) => window.__cc.sim.hero.x - x0 > 2, h0.x, { timeout: 20000 });
  await page.screenshot({ path: `${SHOTS}/phone-joystick.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const h1 = await g(page, () => ({ ...window.__cc.sim.hero }));
  assert(h1.x - h0.x > 2, `joystick moved ${h1.x - h0.x}`);
  assert(h1.z < h0.z, 'joystick vertical axis');
  assert(!(await visible(page, '#joy')), 'joystick stuck on screen');
  for (const sel of ['#goldPill', '#fortPill', '.wave-card', '#pauseBtn', '#callBtn', '#autoBtn']) {
    const b = await page.locator(sel).boundingBox();
    assert(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 390 && b.y + b.height <= 844, `${sel} off screen`);
  }
  const a = await page.locator('#fortPill').boundingBox(), w = await page.locator('.wave-card').boundingBox();
  assert(a.x + a.width <= w.x + 1 || a.y >= w.y + w.height - 1, 'HUD pills overlap the wave card');
  const overlap = (p, q) => p.x < q.x + q.width - 1 && q.x < p.x + p.width - 1 && p.y < q.y + q.height - 1 && q.y < p.y + p.height - 1;
  const boxes = {};
  for (const sel of ['#goldPill', '#fortPill', '.wave-card', '#pauseBtn', '#callBtn', '#autoBtn']) boxes[sel] = await page.locator(sel).boundingBox();
  for (const p of ['#callBtn', '#autoBtn']) for (const q of ['#goldPill', '#fortPill', '.wave-card', '#pauseBtn']) assert(!overlap(boxes[p], boxes[q]), `${p} overlaps ${q}`);
  assert(!overlap(boxes['#callBtn'], boxes['#autoBtn']), 'skip and auto buttons overlap');
  await page.tap('#autoBtn');
  assert(await g(page, () => window.__cc.sim.autoSkip), 'tapping Auto did not turn it on');
  await page.tap('#pauseBtn');
  assert(await visible(page, '#pauseScreen'), 'tap pause failed');
  await page.tap('#resumeBtn');
  await g(page, () => { window.__cc.sim.callWave(); window.__cc.advance(12); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/phone-wave.png` });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('phone landscape: layout fits and the game keeps running after rotation', async () => {
  const { ctx, page } = await open('land');
  await page.tap('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { window.__cc.sim.callWave(); window.__cc.advance(12); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/landscape-wave.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const cv = await page.locator('#game').boundingBox();
  assert(Math.round(cv.width) === 390 && Math.round(cv.height) === 844, 'canvas did not resize');
  const t0 = await g(page, () => window.__cc.sim.time);
  await page.waitForFunction((t0) => window.__cc.sim.time > t0, t0, { timeout: 10000 });
  await ctx.close();
});

await test('performance: frame cost with the biggest crowd on screen', async () => {
  const { ctx, page } = await open();
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  await g(page, () => { const s = window.__cc.sim; s.waveIndex = s.waveCount - 1; s.fortress.hp = 99999; s.fortress.maxHp = 99999; s.callWave(); window.__cc.advance(24); window.__cc.teleport(-14, 30); });
  await page.waitForTimeout(800);
  // screenshot first: software GL takes a few hundred ms per frame, so the
  // timing loop below would otherwise queue seconds of GPU work ahead of it
  await page.screenshot({ path: `${SHOTS}/desktop-big-crowd.png`, timeout: 90000 });
  const r = await g(page, () => new Promise((res) => {
    const s = window.__cc.sim, v = window.__cc.view;
    // time the CPU side of one frame: sim step + scene sync + render submit
    const N = 30; const times = { step: 0, sync: 0, render: 0 };
    for (let i = 0; i < N; i++) {
      let t = performance.now(); s.step(1 / 60); times.step += performance.now() - t;
      t = performance.now(); v.sync(s, 1 / 60); times.sync += performance.now() - t;
      t = performance.now(); v.render(); times.render += performance.now() - t;
    }
    res({ enemies: s.enemies.length, coins: s.coins.length, stepMs: +(times.step / N).toFixed(2), syncMs: +(times.sync / N).toFixed(2), renderSubmitMs: +(times.render / N).toFixed(2), ...v.stats() });
  }));
  Object.assign(perfReport, r);
  assert(r.enemies > 300, 'crowd too small for the test: ' + r.enemies);
  assert(r.stepMs + r.syncMs < 8, `CPU frame cost too high: ${r.stepMs + r.syncMs} ms`);
  assert(r.calls < 120, 'too many draw calls: ' + r.calls);
  await ctx.close();
});

await browser.close();
if (server) server.close();
console.log(lines.join('\n'));
console.log('\nPerformance (headless, software GL):', JSON.stringify(perfReport));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
