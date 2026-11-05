// Boots the two-file build (dist/artifact) in Chromium and starts a game.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(pathToFileURL(path.resolve('dist/artifact/index.html')).href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cc && window.__cc.screen === 'titleScreen', null, { timeout: 30000 });
await page.click('#playBtn');
await page.waitForFunction(() => window.__cc.mode === 'play');
await page.evaluate(() => { window.__cc.sim.callWave(); window.__cc.advance(8); });
await page.waitForTimeout(1500);
console.log('rats', await page.evaluate(() => window.__cc.sim.enemies.length), 'errors', errors.length ? errors : 'none');
await browser.close();
