// Crossbow Canyon — game shell: loop, screens, HUD, saving, tutorial.
import { describeFocus, CROSSBOW_ABILITIES, cannonAbility } from './towerinfo.js';
import { RAT_GUIDE, guideEntry, firstWave, QUICK_COUNTERS } from './ratguide.js';
import { CFG, clearDiamonds, MAPS, towerName, towerUnlockCost, towerBuildMul, towerMaxLevel } from './config.js';
import { TOWER_KINDS, isArsenal, arsenalSpec, ARSENAL } from './arsenal.js';
import { setLevel, levelMap } from './world.js';
import { Sim, T_GRUNT, T_BOSS } from './sim.js';
import { makeBot } from './bot.js';
import { View } from './render/view.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Save, DEFAULT_SETTINGS, DEFAULT_PROGRESS } from './save.js';

const $ = (id) => document.getElementById(id);
// painted portraits of every enemy (built into the page; see docs/design/meshy)
const RAT_ART = (() => { try { return JSON.parse(document.getElementById('ratArt').textContent); } catch { return {}; } })();
// painted pictures of every tower (docs/design/meshy/towers)
const TOWER_ART = (() => { try { return JSON.parse(document.getElementById('towerArt').textContent); } catch { return {}; } })();
const TOWER_NAMES = CROSSBOW_ABILITIES.map((a) => (a ? a[0] : ''));
const FIXED = CFG.fixedDt;
const settings = Save.get('settings', DEFAULT_SETTINGS);
let progress = Save.get('progress', DEFAULT_PROGRESS);
progress.unlocks = { cannon: false, horse: false, cow: false, ...(progress.unlocks || {}) };
// towers: the crossbow is always yours; the rest are bought in the Shop
const towerOwned = (k) => k === 'crossbow' || !!progress.unlocks[k];
const ownedTowers = () => TOWER_KINDS.filter(towerOwned);
progress.skins = Array.isArray(progress.skins) ? progress.skins.filter((k) => CFG.skins[k]) : [];
if (!progress.skins.includes('classic')) progress.skins.unshift('classic');
// Shop: the ride and the weapon skin in use (only ever one the player owns)
const rideOwned = (k) => !!(CFG.rides[k] && progress.unlocks[k]);
const skinOwned = (k) => !!CFG.skins[k] && progress.skins.includes(k);
const currentRide = () => (rideOwned(settings.ride) ? settings.ride : null);
const currentSkin = () => (skinOwned(settings.skin) ? settings.skin : 'classic');
progress.diamonds = Math.max(0, progress.diamonds | 0);
// best results per map (saves from before Level 2 hold Level 1's results at the top level)
progress.byLevel = progress.byLevel || {};
if (!Object.keys(progress.byLevel).length && (progress.bestWave || progress.cleared)) progress.byLevel[1] = { bestWave: progress.bestWave | 0, cleared: !!progress.cleared, bestStars: progress.bestStars | 0, bestDiff: progress.bestDiff || null };
const levelBest = (id = CFG.level) => progress.byLevel[id] || (progress.byLevel[id] = { bestWave: 0, cleared: false, bestStars: 0, bestDiff: null });
// Maps unlock in order: hold all the waves of one map (on any difficulty) to open the next.
const levelCleared = (id) => !!(progress.byLevel[id] && progress.byLevel[id].cleared);
const levelUnlocked = (id) => id <= 1 || levelCleared(id - 1);
const topUnlocked = () => MAPS.reduce((top, m) => (levelUnlocked(m.id) ? Math.max(top, m.id) : top), 1);
const mapName = (id) => (MAPS.find((m) => m.id === id) || MAPS[0]).name;
// the map picked on the title screen is the one the game opens on (if it is unlocked)
{
  const want = MAPS.some((m) => m.id === settings.level) ? settings.level : 1;
  setLevel(levelUnlocked(want) ? want : topUnlocked());
}
const cannonUnlocked = () => !!progress.unlocks.cannon;
const moreTowers = () => ownedTowers().length > 1;
const coarse = matchMedia('(pointer: coarse)').matches;

function detectQuality() {
  const mem = navigator.deviceMemory || 4;
  if (coarse) return mem <= 2 ? 'low' : 'medium';
  return 'high';
}
let quality = settings.quality === 'auto' ? detectQuality() : settings.quality;

// ------------------------------------------------------------------ boot
const canvas = $('game');
let view;
try {
  view = new View(canvas, $('labels'), quality);
  view.towerArt = TOWER_ART;
  view.setSkin(currentSkin());
} catch (err) {
  $('loading').textContent = 'This browser could not start 3D graphics (WebGL). Try another browser or turn on hardware acceleration.';
  throw err;
}
const audio = new Audio();
audio.sfxOn = settings.sfx;
audio.musicOn = settings.music;

const newSeed = () => (Math.random() * 1e9) | 0;
let sim = makeDemo();
let demoBot = makeBot();
view.reset(sim);

let mode = 'title';          // title | play | pause | over
let screen = null;
let backTo = 'titleScreen';
let confirmAction = null;
let lastSaveAt = 0;
let overTimer = 0;
let autoBot = null; // test hook: lets the built-in bot drive the hero

const input = new Input(canvas, $('joy'), {
  // zoom: two fingers pinching, or the mouse wheel, move between the farmer and the whole map
  onPinch: (ratio) => { if (mode === 'play' || mode === 'pause') setZoom(view.overviewWant + (ratio - 1) * 1.6); },
  onWheel: (dy) => { if (mode !== 'play' && mode !== 'pause') return false; setZoom(view.overviewWant + dy * 0.0016); return true; },
  onPause: () => { if (mode === 'play') pause(); else if (mode === 'pause' && screen === 'pauseScreen') resume(); },
  onAction: () => { if (mode === 'play' && sim.canSkip) { audio.click(); skipWave(); return true; } return false; },
  onKey: (code) => {
    if (mode !== 'play') return;
    if (code === 'KeyM') { audio.click(); toggleZoom(); return; }
    if (code === 'KeyT') { audio.click(); toggleAuto(); return; }
    if (code === 'KeyF') { audio.click(); toggleSpeed(); return; }
    if (!moreTowers()) return;
    // 1-9 and 0 pick a tower you own (in the Shop's order); Q cycles through them
    const own = ownedTowers();
    const kind = code === 'KeyQ' ? own[(own.indexOf(sim.buildKind) + 1) % own.length] : own[code === 'Digit0' ? 9 : +code.slice(-1) - 1];
    if (kind) pickBuild(kind);
  },
  onInteract: () => audio.unlock(),
});
input.setEnabled(false);

function makeDemo() {
  const d = new Sim({ seed: 4242, ride: currentRide() });   // the title-screen farmer rides your ride
  d.buildTimer = 2.5;
  d.gold = 60;
  return d;
}

// --------------------------------------------------------------- screens
// Difficulty for a new game, picked on the title screen and saved with the settings.
const diffKey = () => (CFG.difficulties[settings.difficulty] ? settings.difficulty : 'normal');
const diffName = (k) => CFG.difficulties[k] ? CFG.difficulties[k].name : 'Normal';
function syncDiffPick() {
  const k = diffKey();
  for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-checked', String(b.dataset.diff === k));
  $('diffNote').innerHTML = `<span>${CFG.difficulties[k].blurb} · a full clear pays <b class="gem-txt">${clearDiamonds(k)} diamonds</b></span>`;
  fitTitle();
}
for (const b of document.querySelectorAll('[data-diff]')) {
  b.addEventListener('click', () => { audio.unlock(); audio.click(); settings.difficulty = b.dataset.diff; Save.set('settings', settings); syncDiffPick(); });
}

// Maps: the title screen picks Level 1 or 2. Switching rebuilds the 3D scene in
// place (the renderer is kept) and the title-screen demo carries on on the new map.
function syncLevelPick() {
  for (const b of document.querySelectorAll('[data-level]')) {
    const id = +b.dataset.level, open = levelUnlocked(id), played = !!(progress.byLevel[id] && progress.byLevel[id].bestWave);
    b.setAttribute('aria-checked', String(id === CFG.level));
    b.classList.toggle('locked', !open);
    b.setAttribute('aria-disabled', String(!open));
    b.title = open ? '' : `Locked: hold all ${CFG.waves.length} waves of Level ${id - 1} to unlock`;
    const stars = (progress.byLevel[id] && progress.byLevel[id].bestStars) | 0;
    b.querySelectorAll('.lc-stars i').forEach((st, i) => st.classList.toggle('on', i < stars));
    const nt = b.querySelector('.new-tag'), lk = b.querySelector('.lock-tag');
    if (nt) nt.hidden = !open || played || id === 1;
    if (lk) lk.hidden = open;
  }
}
let levelNoteTimer = 0;
function levelNote(text) {
  const el = $('levelNote');
  el.textContent = text; el.hidden = !text;
  clearTimeout(levelNoteTimer);
  if (text) levelNoteTimer = setTimeout(() => { el.hidden = true; }, 3500);
}
function switchLevel(id) {
  if (CFG.level === id || !MAPS.some((m) => m.id === id)) return false;
  setLevel(id);
  const old = view;
  old.dispose();
  view = new View(canvas, $('labels'), quality, old.renderer);
  view.towerArt = TOWER_ART;
  view.setSkin(currentSkin());
  hudCache = {}; tcKey = '';
  needsRender = true;
  return true;
}
for (const b of document.querySelectorAll('[data-level]')) {
  b.addEventListener('click', () => {
    audio.unlock();
    const id = +b.dataset.level;
    if (!levelUnlocked(id)) {
      // a locked map says what opens it, with a little shake
      audio.denied();
      levelNote(`Finish Level ${id - 1} (${mapName(id - 1)}) to unlock ${mapName(id)}`);
      b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
      return;
    }
    audio.click();
    levelNote('');
    settings.level = id; Save.set('settings', settings);
    if (switchLevel(id) && mode === 'title') { sim = makeDemo(); demoBot = makeBot(); view.reset(sim); }
    refreshTitle();
  });
}

const SCREENS = ['titleScreen', 'helpScreen', 'settingsScreen', 'pauseScreen', 'confirmScreen', 'victoryScreen', 'defeatScreen', 'shopScreen', 'guideScreen'];
function showScreen(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  screen = id;
  // the painted canyon sits behind every menu while no game is on
  $('menuBg').hidden = !(mode === 'title' && id);
  if (id === 'titleScreen') fitTitle();
  if (id) {
    const first = $(id).querySelector('button:not([hidden])');
    if (first && !coarse) first.focus({ preventScroll: true });
  }
}
// The title menu scales to fit any screen without scrolling: measured at its
// natural size, then zoomed so it fills the height (or width) available.
function fitTitle() {
  const menu = $('titleMenu');
  if (!menu || $('titleScreen').hidden) return;
  // On a phone held upright the menu is laid out at a fixed width and kept a
  // size smaller than the screen, so the painted canyon shows round it.
  const W = window.innerWidth, H = window.innerHeight, upright = W / H < 0.8;
  menu.style.width = upright ? '400px' : '';
  menu.style.zoom = '1';
  const w = menu.offsetWidth, h = menu.offsetHeight;
  if (!w || !h) return;
  // (room for the screen's own padding round the edge)
  const k = Math.max(0.45, Math.min(1.35, (H * (upright ? 0.9 : 1) - 44) / h, (W * (upright ? 0.84 : 1) - 28) / w));
  menu.style.zoom = k.toFixed(3);
}
window.addEventListener('resize', () => fitTitle());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitTitle());

function refreshTitle() {
  const cp = Save.get('checkpoint', null);
  const valid = cp && cp.v === CFG.version;
  $('continueBtn').hidden = !valid;
  if (valid) $('continueInfo').textContent = `${(cp.level || 1) !== 1 || MAPS.length > 1 ? `Level ${cp.level || 1} · ` : ''}wave ${cp.waveIndex + 1} of ${CFG.waves.length}${cp.diff && cp.diff !== 'normal' ? ' · ' + diffName(cp.diff) : ''}`;
  syncDiffPick();
  syncLevelPick();
  for (const el of document.querySelectorAll('.cannonCost')) el.textContent = CFG.cannonUnlockCost;
  const p = progress;
  $('gemVal').textContent = p.diamonds;
  const affordable = shopItems().filter((it) => !it.owned && it.cost <= p.diamonds);
  $('shopInfo').textContent = affordable.length ? `${affordable.length} thing${affordable.length > 1 ? 's' : ''} you can buy!` : 'rides, skins and towers';
  $('shopBtn').classList.toggle('ready', affordable.length > 0);
  fitTitle();
  const b = levelBest(), map = levelMap();
  $('bestLine').textContent = `Level ${map.id} · ${map.name} · ` + (b.cleared
    ? `held${b.bestDiff ? ' on ' + diffName(b.bestDiff) : ''} · best ${'★'.repeat(b.bestStars)}${'☆'.repeat(3 - b.bestStars)}`
    : b.bestWave > 0 ? `best: survived ${b.bestWave} of ${CFG.waves.length} waves` : `${CFG.waves.length} waves`);
}

function goTitle() {
  saveCheckpointIfSafe();
  hideEnemyCard();
  mode = 'title';
  input.setEnabled(false);
  setZoom(0);
  $('hud').hidden = true;
  if (!levelUnlocked(CFG.level)) switchLevel(topUnlocked());   // back from a saved game on a map that is still locked
  sim = makeDemo(); demoBot = makeBot();
  view.reset(sim);
  view.arrowTarget = null;
  refreshTitle();
  showScreen('titleScreen');
  audio.musicIntensity = 0;
}

function askConfirm(title, text, yesLabel, action) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  $('confirmYes').textContent = yesLabel;
  confirmAction = action;
  backTo = screen;
  showScreen('confirmScreen');
}

const introducedBosses = new Set();   // bosses whose card has shown this game
function startGame(saveData, difficulty = diffKey()) {
  audio.unlock();
  hideEnemyCard();
  introducedBosses.clear();
  if (saveData && (saveData.level || 1) !== CFG.level) switchLevel(saveData.level || 1);
  if (settings.level !== CFG.level) { settings.level = CFG.level; Save.set('settings', settings); }   // the map last played opens next time
  sim = new Sim({ seed: newSeed(), cannon: cannonUnlocked(), unlocks: progress.unlocks, autoSkip: !!settings.autoSkip, difficulty, ride: currentRide() });
  if (saveData && !sim.load(saveData)) saveData = null;
  syncAuto();
  sim.events.length = 0;
  view.reset(sim);
  view.night = undefined;
  setZoom(0);   // every game starts close in on the farmer
  mode = 'play';
  showScreen(null);
  $('hud').hidden = false;
  input.setEnabled(true);
  tutorial.reset();
  lastSaveAt = performance.now();
  hudCache = {};
  if (!saveData) {
    progress.games++;
    Save.set('progress', progress);
    Save.set('checkpoint', sim.serialize());
    Save.del('waveStart');
    banner('Hold the canyon!', `${CFG.waves.length} waves are coming${sim.difficulty !== 'normal' ? ' · ' + diffName(sim.difficulty) : ''}`, true);
  } else {
    banner(`Wave ${sim.waveIndex + 1}`, 'Game restored', true);
  }
  canvas.focus({ preventScroll: true });
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  input.setEnabled(false);
  saveCheckpointIfSafe();
  $('pauseInfo').textContent = (sim.state === 'build'
    ? `Wave ${sim.waveIndex + 1} of ${CFG.waves.length} starts in ${Math.ceil(sim.buildTimer)}s`
    : `Wave ${sim.waveIndex + 1} of ${CFG.waves.length} · ${sim.waveTotal - sim.waveKilled} rats left`) + ` · ${diffName(sim.difficulty)}`;
  showScreen('pauseScreen');
  freezeEnemyCard();
  audio.suspend();
}

function resume() {
  if (mode !== 'pause') return;
  mode = 'play';
  showScreen(null);
  $('hud').hidden = false;
  input.setEnabled(true);
  audio.resume();
  thawEnemyCard();
  last = performance.now();
  canvas.focus({ preventScroll: true });
}

// Skip wave: between waves it starts the next one now (early bonus); during a
// wave it unlocks once every rat is out and sends the next wave right behind.
function skipWave() {
  if (mode !== 'play' || !sim.canSkip) return false;
  return sim.skipWave();
}

// Auto skip: each wave starts CFG.autoSkipDelay seconds after the last one
// is cleared. Saved with the settings so it stays on between games.
function toggleAuto() {
  settings.autoSkip = !settings.autoSkip;
  Save.set('settings', settings);
  sim.autoSkip = settings.autoSkip;
  syncAuto();
  toast(settings.autoSkip ? `Auto skip on: waves start ${CFG.autoSkipDelay}s after a clear` : 'Auto skip off');
}
function syncAuto() { $('autoBtn').setAttribute('aria-pressed', String(!!settings.autoSkip)); }

// Game speed: 1x or 2x. The simulation simply takes twice as many fixed steps
// per frame, so a fast game plays out exactly like a normal one. Saved with the settings.
const gameSpeed = () => (settings.speed === 2 ? 2 : 1);
// Zoom out to see the whole map (and back in on the farmer)
function setZoom(t) {
  view.setOverview(t);
  const on = view.overviewWant > 0.5;
  $('zoomBtn').setAttribute('aria-pressed', String(on));
  $('zoomBtn').setAttribute('aria-label', on ? 'Zoom back in on the farmer (key M)' : 'Zoom out to see the whole map (key M)');
}
function toggleZoom() { setZoom(view.overviewWant > 0.5 ? 0 : 1); }
function toggleSpeed() {
  settings.speed = gameSpeed() === 2 ? 1 : 2;
  Save.set('settings', settings);
  syncSpeed();
  toast(settings.speed === 2 ? 'Double speed' : 'Normal speed');
}
function syncSpeed() {
  const fast = gameSpeed() === 2;
  $('speedBtn').setAttribute('aria-pressed', String(fast));
  $('speedBtn').setAttribute('aria-label', `Game speed: ${fast ? 'double' : 'normal'} (key F)`);
  $('speedVal').textContent = fast ? '2×' : '1×';
}

function saveCheckpointIfSafe() {
  if ((mode === 'play' || mode === 'pause') && sim.state === 'build') Save.set('checkpoint', sim.serialize());
}

// ------------------------------------------------------------ buttons
const click = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); audio.unlock(); audio.click(); fn(); });
click('playBtn', () => {
  const cp = Save.get('checkpoint', null);
  if (cp && cp.v === CFG.version && cp.waveIndex > 0) {
    askConfirm('Start a new game?', `Your saved game on wave ${cp.waveIndex + 1} will be replaced.`, 'New game', () => startGame(null));
  } else startGame(null);
});
click('continueBtn', () => startGame(Save.get('checkpoint', null)));
click('helpBtn', () => { backTo = 'titleScreen'; showScreen('helpScreen'); });
click('settingsBtn', () => { backTo = 'titleScreen'; syncSettingsUi(); showScreen('settingsScreen'); });
click('shopBtn', () => openShop());
click('gemPlus', () => openShop());
click('pickCur', (e) => { e && e.stopPropagation && e.stopPropagation(); toggleBuildMenu(); });
// a tower button in the picker (row or menu)
$('buildPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  pickBuild(b.dataset.pick);
  toggleBuildMenu(false);
});
document.addEventListener('pointerdown', (e) => { if (!$('pickMenu').hidden && !e.target.closest('#buildPick')) toggleBuildMenu(false); });

// ------------------------------------------------------------ shop
// Towers (the cannon), rides (horse, cow) and weapon skins, bought with diamonds.
const GEM_SVG = '<svg class="gem" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="#63e4ff" stroke="#0f6d93" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 9h20M8 3l4 18 4-18M6 3l2 6m10-6-2 6" stroke="#167fa8" fill="none" stroke-width="1.5" stroke-linejoin="round"/></svg>';
let shopTab = 'towers';
function shopItems() {
  const out = TOWER_KINDS.filter((k) => k !== 'crossbow').map((id) => ({ kind: 'tower', id, cost: towerUnlockCost(id), owned: towerOwned(id) }));
  for (const [id, R] of Object.entries(CFG.rides)) out.push({ kind: 'ride', id, cost: R.cost, owned: rideOwned(id) });
  for (const [id, S] of Object.entries(CFG.skins)) out.push({ kind: 'skin', id, cost: S.cost, owned: skinOwned(id) });
  return out;
}
function openShop(tab = shopTab) {
  audio.unlock();
  shopTab = tab;
  refreshShop();
  backTo = 'titleScreen';
  showScreen('shopScreen');
}
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { audio.click(); shopTab = b.dataset.tab; refreshShop(); });
function shopCard({ id, img, name, blurb, stat, swatch, cost, owned, using, useLabel, usingLabel, extra = '' }) {
  const action = using ? `<button class="btn gold" type="button" disabled>${usingLabel}</button>`
    : owned ? `<button class="btn" type="button" data-use="${id}">${useLabel}</button>`
    : `<button class="btn gold" type="button" data-buy="${id}" ${progress.diamonds < cost ? 'disabled' : ''}>Buy ${cost} ${GEM_SVG}</button>`;
  return `<section class="shop-item${using ? ' on' : ''}" data-item="${id}">
    <img alt="" ${img ? `src="${img}"` : ''} width="112" height="112">
    <h3>${name}</h3>${swatch || ''}<p>${blurb}</p>${stat ? `<p class="stat">${stat}</p>` : ''}${extra}${action}</section>`;
}
function refreshShop() {
  refreshArmory();
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === shopTab));
  for (const pg of document.querySelectorAll('[data-page]')) pg.hidden = pg.dataset.page !== shopTab;
  const P = view.portraits;
  if (shopTab === 'towers') $('towerGrid').innerHTML = TOWER_KINDS.map(towerCard).join('');
  if (shopTab === 'rides') {
    const ride = currentRide();
    $('rideGrid').innerHTML = shopCard({ id: 'none', img: P.get('ride:none', false), name: 'On foot', blurb: 'The farmer runs along at a steady pace.', cost: 0, owned: true, using: !ride, useLabel: 'Walk', usingLabel: 'Walking ✓' })
      + Object.entries(CFG.rides).map(([id, R]) => shopCard({ id, img: P.get('ride:' + id, false), name: R.name, blurb: R.blurb, stat: `Speed +${Math.round((R.speedMul - 1) * 100)}%${R.magnetMul > 1 ? ` · coin reach +${Math.round((R.magnetMul - 1) * 100)}%` : ''}`, cost: R.cost, owned: rideOwned(id), using: ride === id, useLabel: 'Ride', usingLabel: 'Riding ✓' })).join('');
  } else if (shopTab === 'skins') {
    const skin = currentSkin();
    $('skinGrid').innerHTML = Object.entries(CFG.skins).map(([id, S]) => shopCard({
      id, img: P.get('skin:' + id, false), name: S.name, blurb: S.blurb, cost: S.cost, owned: skinOwned(id), using: skin === id, useLabel: 'Equip', usingLabel: 'Equipped ✓',
      swatch: S.colors ? `<span class="swatch">${[...S.colors, S.accent].map((c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('')}</span>` : '',
    })).join('');
  }
  P.flush();
}
// buy and use: rides and skins
document.getElementById('shopScreen').addEventListener('click', (e) => {
  const buy = e.target.closest('[data-buy]'), use = e.target.closest('[data-use]');
  if (!buy && !use) return;
  const id = (buy || use).dataset[buy ? 'buy' : 'use'];
  const kind = shopTab === 'rides' ? 'ride' : shopTab === 'towers' ? 'tower' : 'skin';
  const equip = () => {
    if (kind === 'tower') return;
    if (kind === 'ride') { settings.ride = id; if (mode === 'title') sim.ride = currentRide(); }
    else { settings.skin = id; view.setSkin(currentSkin()); }
    Save.set('settings', settings);
  };
  audio.unlock();
  if (use) { audio.click(); equip(); refreshShop(); refreshTitle(); return; }
  const item = kind === 'ride' ? CFG.rides[id] : kind === 'tower' ? (TOWER_KINDS.includes(id) && !towerOwned(id) ? { name: towerName(id), cost: towerUnlockCost(id) } : null) : CFG.skins[id];
  if (!item || progress.diamonds < item.cost) return;
  audio.click();
  askConfirm(kind === 'tower' ? `Unlock the ${item.name}?` : `Buy the ${item.name}${kind === 'skin' ? ' skin' : ''}?`, `This spends ${item.cost} of your ${progress.diamonds} diamonds.`, kind === 'tower' ? 'Unlock' : 'Buy', () => {
    progress.diamonds -= item.cost;
    if (kind === 'ride' || kind === 'tower') progress.unlocks[id] = true; else progress.skins.push(id);
    Save.set('progress', progress);
    equip();
    audio.build('fortress');
    refreshShop(); refreshTitle();
    backTo = 'titleScreen';
    showScreen('shopScreen');
  });
});
// the corner buttons: full screen (where the browser allows it) and settings
if (!document.fullscreenEnabled) $('fullBtn').hidden = true;
click('fullBtn', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => setTimeout(fitTitle, 120));
click('moreBtn', () => { backTo = 'titleScreen'; syncSettingsUi(); showScreen('settingsScreen'); });
function refreshArmory() {
  $('shopGems').textContent = progress.diamonds;
}

// One tower's card in the Shop: its Meshy picture, what it does, its levels and price.
const TYPE_COLORS = { Physical: '#8a8f99', Explosive: '#e0702a', Fire: '#e0502a', Ice: '#3aa9d8', Poison: '#5aa02a', Electric: '#3a7ad8', Pierce: '#c2762a', Magic: '#8a4ad8' };
function towerLevels(kind) {
  if (kind === 'crossbow') return CROSSBOW_ABILITIES.slice(1).map((a, i) => [i + 1, a[0], a[1]]);
  if (kind === 'cannon') {
    const out = [1, 2, 3].map((lv) => [lv, ...cannonAbility(lv)]);
    out.push(['4–7', 'Choose a path', `${CFG.cannon.paths.rapid.name} (fast light shells, rockets) or ${CFG.cannon.paths.blast.name} (huge blasts, Doomsday Nova).`]);
    return out;
  }
  return ARSENAL[kind].levels.slice(1).map((L, i) => [i + 1, L.ab[0], L.ab[1]]);
}
function towerCard(kind) {
  const A = ARSENAL[kind];
  const type = kind === 'crossbow' ? 'Pierce' : kind === 'cannon' ? 'Explosive' : A.type;
  const blurb = kind === 'crossbow' ? 'Fast, precise arrows. The only tower you start with.' : kind === 'cannon' ? 'Explosive cannonballs that hurt every rat near the blast.' : A.blurb;
  const levels = towerLevels(kind);
  const mul = towerBuildMul(kind);
  const extra = `<span class="type" style="--chip:${TYPE_COLORS[type] || '#7a5a3a'}">${type}</span>
    <p class="gold-note">${mul === 1 ? 'Normal build price' : `Builds for ${mul > 1 ? '+' : ''}${Math.round((mul - 1) * 100)}% gold`} · ${towerMaxLevel(kind)} levels</p>
    <details><summary>Levels &amp; abilities</summary><ol>${levels.map(([lv, n, d]) => `<li><b>${lv}</b> <em>${esc(n)}:</em> ${esc(d)}</li>`).join('')}</ol></details>`;
  return shopCard({ id: kind, img: TOWER_ART[kind], name: towerName(kind), blurb, cost: towerUnlockCost(kind), owned: towerOwned(kind), using: towerOwned(kind), usingLabel: kind === 'crossbow' ? 'Owned ✓' : 'Unlocked ✓', extra });
}

function pickBuild(kind) {
  if (mode !== 'play' || !sim.setBuildKind(kind)) return;
  audio.click();
  syncBuildPick();
}
function toggleBuildMenu(open = $('pickMenu').hidden) {
  $('pickMenu').hidden = !open;
  $('pickCur').setAttribute('aria-expanded', String(open));
}
// The towers you own: a row of buttons when there are three or fewer, otherwise
// the current one with a menu of all of them.
let pickKey = '';
function syncBuildPick() {
  const show = moreTowers() && (mode === 'play' || mode === 'pause');
  $('buildPick').hidden = !show;
  if (!show) { toggleBuildMenu(false); return; }
  const own = ownedTowers(), many = own.length > 3, cur = sim.buildKind;
  const btn = (k, i) => `<button ${k === 'crossbow' ? 'id="pickCrossbow"' : k === 'cannon' ? 'id="pickCannon"' : ''} class="pick${k === cur ? ' on' : ''}" type="button" data-pick="${k}" aria-pressed="${k === cur}" aria-label="Build ${esc(towerName(k))}${i < 10 ? ` (key ${(i + 1) % 10})` : ''}" title="${esc(towerName(k))}"><img src="${TOWER_ART[k]}" alt="">${many && i < 10 ? `<b>${(i + 1) % 10}</b>` : ''}</button>`;
  const key = own.join(',') + '|' + cur;
  if (key !== pickKey) {
    pickKey = key;
    $('pickRow').innerHTML = many ? '' : own.map(btn).join('');
    $('pickMenu').innerHTML = many ? own.map(btn).join('') : '';
    $('pickCurImg').src = TOWER_ART[cur] || '';
  }
  $('pickCur').hidden = !many;
  if (!many) toggleBuildMenu(false);
}
click('pauseSettingsBtn', () => { backTo = 'pauseScreen'; syncSettingsUi(); showScreen('settingsScreen'); });
click('guideBtn', () => { backTo = 'titleScreen'; openGuide(); });
click('pauseGuideBtn', () => { backTo = 'pauseScreen'; openGuide(); });
click('ecClose', () => hideEnemyCard());
// On a phone the card is cut down to the main tip and says "Tap for more": the
// first tap opens the full details, the next one closes it. On a bigger screen
// the card already shows everything, so a click closes it.
const compactCard = matchMedia('(max-width: 640px), (max-height: 500px)');
$('enemyCard').addEventListener('click', (e) => {
  if (e.target.closest('#ecClose')) return;
  const card = $('enemyCard');
  if (compactCard.matches && !card.classList.contains('open')) {
    card.classList.add('open');
    $('ecMore').textContent = 'Tap to close';
    audio.click();
    holdEnemyCard(15000);
  } else hideEnemyCard();
});
click('pauseBtn', () => pause());
click('resumeBtn', () => resume());
click('restartBtn', () => askConfirm('Restart the level?', 'You will start again from wave 1 with no crossbows built.', 'Restart', () => { const d = sim.difficulty; Save.del('checkpoint'); Save.del('waveStart'); startGame(null, d); }));
click('quitBtn', () => goTitle());
click('callBtn', () => { skipWave(); canvas.focus({ preventScroll: true }); });
click('autoBtn', () => { toggleAuto(); canvas.focus({ preventScroll: true }); });
click('speedBtn', () => { toggleSpeed(); canvas.focus({ preventScroll: true }); });
click('zoomBtn', () => { toggleZoom(); canvas.focus({ preventScroll: true }); });
click('confirmYes', () => { const a = confirmAction; confirmAction = null; a && a(); });
click('confirmNo', () => { confirmAction = null; showScreen(backTo); });
click('againBtn', () => startGame(null, sim.difficulty));
click('nextLevelBtn', () => {
  const next = CFG.level + 1, d = sim.difficulty;
  if (!levelUnlocked(next) || !switchLevel(next)) return;
  settings.level = next; Save.set('settings', settings);
  startGame(null, d);
});
click('retryBtn', () => { const ws = Save.get('waveStart', null); startGame(ws && ws.v === CFG.version ? ws : null); });
click('defeatRestartBtn', () => { const d = sim.difficulty; Save.del('checkpoint'); Save.del('waveStart'); startGame(null, d); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { audio.click(); showScreen(backTo); });
for (const b of document.querySelectorAll('[data-menu]')) b.addEventListener('click', () => { audio.click(); goTitle(); });

function syncSettingsUi() {
  $('sfxToggle').setAttribute('aria-checked', String(settings.sfx));
  $('musicToggle').setAttribute('aria-checked', String(settings.music));
  $('qualitySelect').value = settings.quality;
  $('qualityNote').textContent = settings.quality === 'auto' ? `Auto picked ${quality} detail for this device and lowers it if the game slows down.` : 'Lower detail runs faster on older phones.';
  $('resetBtn').textContent = 'Erase saved progress';
  resetArmed = false;
}
let resetArmed = false;
$('sfxToggle').addEventListener('click', () => { settings.sfx = !settings.sfx; audio.setSfx(settings.sfx); Save.set('settings', settings); syncSettingsUi(); audio.click(); });
$('musicToggle').addEventListener('click', () => { audio.unlock(); settings.music = !settings.music; audio.setMusic(settings.music); Save.set('settings', settings); syncSettingsUi(); });
$('qualitySelect').addEventListener('change', (e) => {
  settings.quality = e.target.value;
  Save.set('settings', settings);
  quality = settings.quality === 'auto' ? detectQuality() : settings.quality;
  view.setQuality(quality);
  perf.reset();
  syncSettingsUi();
});
$('resetBtn').addEventListener('click', () => {
  audio.click();
  if (!resetArmed) { resetArmed = true; $('resetBtn').textContent = 'Tap again to erase everything'; return; }
  Save.del('checkpoint'); Save.del('waveStart'); Save.del('progress');
  progress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  settings.tutorialDone = false; Save.set('settings', settings);
  $('resetBtn').textContent = 'Progress erased';
  resetArmed = false;
  refreshTitle();
});

// ------------------------------------------------------------- HUD bits
const toastLog = [];   // recent toasts, read by the browser tests
function toast(text, warn = false) {
  toastLog.push(text); if (toastLog.length > 20) toastLog.shift();
  const host = $('toastHost');
  host.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast' + (warn ? ' warn' : '');
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}
function banner(text, sub, style = false) {
  const host = $('bannerHost');
  host.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'banner' + (style === true ? ' good' : style ? ' ' + style : '');
  el.textContent = text;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  host.appendChild(el);
  setTimeout(() => el.remove(), style === 'boss' ? 3600 : 2300);
}
// red pulse around the screen edges while a boss warning is up
let vignetteTimer = 0;
function bossVignette(seconds) {
  const el = $('bossVignette');
  el.hidden = false;
  clearTimeout(vignetteTimer);
  vignetteTimer = setTimeout(() => { el.hidden = true; }, seconds * 1000);
}

let hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setStyle(id, prop, v) { const k = id + prop; if (hudCache[k] !== v) { hudCache[k] = v; $(id).style[prop] = v; } }
function updateHud() {
  const s = sim;
  const bk = `${s.buildKind}|${cannonUnlocked()}|${mode}`;
  if (hudCache.bk !== bk) { hudCache.bk = bk; syncBuildPick(); }
  setText('goldVal', String(s.gold));
  const f = s.fortress;
  setText('fortVal', String(Math.ceil(f.hp)));
  setStyle('fortFill', 'width', (f.hp / f.maxHp * 100).toFixed(1) + '%');
  const low = f.hp / f.maxHp < 0.35;
  if (hudCache.low !== low) { hudCache.low = low; $('fortFill').classList.toggle('low', low); }
  const n = CFG.waves.length;
  setText('waveTitle', `WAVE ${Math.min(s.waveIndex + 1, n)} / ${n}`);
  let call = 'off'; // off | on | wait
  if (s.state === 'build') {
    const ai = s.autoIn;
    if (ai != null) {
      setText('waveSub', `Auto start in ${Math.ceil(ai)}s`);
      setStyle('waveFill', 'width', (100 - ai / CFG.autoSkipDelay * 100).toFixed(1) + '%');
    } else {
      const nb = s.upcomingBosses;
      setText('waveSub', nb.length ? `⚠ Boss next · ${Math.ceil(Math.max(0, s.buildTimer))}s` : `Next wave in ${Math.ceil(Math.max(0, s.buildTimer))}s`);
      const total = s.waveIndex === 0 ? CFG.firstBuildTime : CFG.buildTime;
      setStyle('waveFill', 'width', (100 - Math.max(0, s.buildTimer) / total * 100).toFixed(1) + '%');
    }
    const bonus = Math.floor(s.buildTimer / 2);
    setText('callLabel', s.waveIndex === 0 ? 'Start wave' : 'Skip wave');
    setText('callBonus', bonus > 0 ? `+${bonus}` : '');
    call = 'on';
  } else {
    const left = s.waveTotal - s.waveKilled;
    setText('waveSub', s.state === 'wave' ? `${left} rat${left === 1 ? '' : 's'} left` : s.state === 'victory' ? 'Canyon held' : 'Town hall destroyed');
    setStyle('waveFill', 'width', (s.waveProgress * 100).toFixed(1) + '%');
    const si = s.skipIn;
    if (si != null) {
      setText('callLabel', 'Skip wave');
      if (si > 0) { setText('callBonus', `in ${Math.ceil(si)}s`); call = 'wait'; }
      else { setText('callBonus', `+${CFG.waveClearBonus(s.waveIndex + 1) + CFG.skipBonus}`); call = 'on'; }
    }
  }
  const bossNext = s.state === 'build' && s.upcomingBosses.length > 0;
  if (hudCache.bossNext !== bossNext) { hudCache.bossNext = bossNext; $('waveSub').classList.toggle('alert', bossNext); }
  updateBossBars();
  updateTowerCard();
  if (hudCache.call !== call) {
    hudCache.call = call;
    const b = $('callBtn');
    b.hidden = call === 'off';
    b.disabled = call === 'wait';
    b.title = call === 'wait' ? 'Unlocks once every rat of this wave is out' : 'Send the next wave now for bonus gold (Space)';
  }
}

// ------------------------------------------------------------ boss bars
// One health bar per boss on the road, under the wave counter.
const bossRows = [];
// Every boss on the road, with a Sewer Slime and all the slimes it has split
// into counted as one: its bar holds the health still to beat, pieces to come included.
function bossGroups() {
  const groups = new Map();
  const S = CFG.bosses.slime.split, T = S.tiers.length;
  for (const e of sim.enemies) {
    if (!e.alive || (e.type !== T_BOSS && e.boss !== 'slime')) continue;
    const key = e.boss === 'slime' ? 'slime:' + e.root : 'b:' + e.id;
    let g = groups.get(key);
    if (!g) { g = { boss: e.boss || 'king', hp: 0, maxHp: 0, n: 0, under: false, s: -1e9 }; groups.set(key, g); }
    g.n++;
    g.s = Math.max(g.s, e.s);
    if (e.boss === 'slime') {
      let size = e.maxHp, count = 1, future = 0;
      for (let t = e.tier; t < T; t++) { size *= S.hpFrac; count *= S.n; future += size * count; }
      g.hp += Math.max(0, e.hp) + future;
      let total = 0; size = e.rootHp; count = 1;
      for (let t = 0; t <= T; t++) { total += size * count; size *= S.hpFrac; count *= S.n; }
      g.maxHp = total;
    } else { g.hp = Math.max(0, e.hp); g.maxHp = e.maxHp; g.under = e.under; }
  }
  return [...groups.values()];
}
// Slim bars, and only the few bosses nearest the town hall: the rest fold into
// a "+3 more bosses" chip, so a crowd of bosses never covers the battlefield.
const BOSS_BARS = { wide: 3, small: 2 };
const smallScreen = matchMedia('(max-width: 640px), (max-height: 500px)');
function updateBossBars() {
  const host = $('bossBars');
  const all = mode === 'play' || mode === 'pause' ? bossGroups() : [];
  all.sort((a, b) => b.s - a.s);
  const cap = smallScreen.matches ? BOSS_BARS.small : BOSS_BARS.wide;
  const bosses = all.slice(0, cap), extra = all.length - bosses.length;
  let more = host.querySelector('.boss-more');
  if (!more) { more = document.createElement('div'); more.className = 'boss-more'; more.hidden = true; host.appendChild(more); }
  const moreText = extra > 0 ? `+${extra} more boss${extra > 1 ? 'es' : ''}` : '';
  if (more.textContent !== moreText) { more.textContent = moreText; more.hidden = !extra; }
  while (bossRows.length < bosses.length) {
    const row = document.createElement('div'); row.className = 'boss-bar';
    row.innerHTML = '<span></span><div class="bar"><div></div></div>';
    host.insertBefore(row, more);
    bossRows.push({ row, name: row.firstChild, fill: row.querySelector('.bar > div'), key: '' });
  }
  bossRows.forEach((r, i) => {
    const b = bosses[i];
    r.row.hidden = !b;
    if (!b) return;
    const name = CFG.bosses[b.boss].name + (b.n > 1 ? ` ×${b.n}` : '');
    const pct = Math.max(0, Math.min(100, b.hp / b.maxHp * 100)).toFixed(1);
    const key = name + pct + b.under;
    if (key === r.key) return;
    r.key = key;
    r.name.textContent = `${name} · ${Math.ceil(Math.max(0, b.hp))}${b.under ? ' · underground' : ''}`;
    r.fill.style.width = pct + '%';
  });
  // on a narrow screen the enemy card sits under the wave card: keep it below the boss bars
  const card = $('enemyCard');
  const top = !card.hidden && window.innerWidth <= 520 && bosses.length ? Math.round(host.getBoundingClientRect().bottom + 8) + 'px' : '';
  if (hudCache.ecTop !== top) { hudCache.ecTop = top; card.style.top = top; }
}

// ------------------------------------------------------------ tower card
// Shows the tower (or pad) beside the farmer: level, ability and what the
// next upgrade costs and adds.
const ICONS = {
  crossbow: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 20a14 14 0 0 1 22 0" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M16 27V5m-4 4 4-5 4 5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cannon: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="9" width="19" height="11" rx="5" fill="currentColor"/><circle cx="23" cy="14.5" r="6" fill="currentColor"/><circle cx="12" cy="23" r="5" fill="currentColor"/><circle cx="12" cy="23" r="2" fill="#3a1d12"/></svg>',
  keep: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 22V9h3V6h2v3h3V3h2v6h3V6h2v3h3v13h-7v-5a2 2 0 0 0-4 0v5z"/></svg>',
  // the two cannon paths: a rack of launch tubes, and one big mortar
  rapid: '<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor"><rect x="5" y="6" width="9" height="9" rx="3"/><rect x="18" y="6" width="9" height="9" rx="3"/><rect x="5" y="17" width="9" height="9" rx="3"/><rect x="18" y="17" width="9" height="9" rx="3"/></g><g fill="#3a1d12"><circle cx="9.5" cy="10.5" r="2.2"/><circle cx="22.5" cy="10.5" r="2.2"/><circle cx="9.5" cy="21.5" r="2.2"/><circle cx="22.5" cy="21.5" r="2.2"/></g></svg>',
  blast: '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M7 27h18l-2-7H9z"/><circle cx="16" cy="13" r="9" fill="currentColor"/><circle cx="16" cy="13" r="4.5" fill="#3a1d12"/></svg>',
};
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
let tcKey = '';
function updateTowerCard() {
  const f = mode === 'play' || mode === 'pause' ? describeFocus(sim) : null;
  const key = f ? [f.kind, f.level, f.path, f.slot, f.build, f.desc, f.next && f.next.cost, f.next && Math.floor(f.next.paid), f.next && f.next.path, f.choice && f.choice.map((c) => Math.floor(c.paid)).join(','), f.onPad].join('|') : '';
  if (key === tcKey) return;
  tcKey = key;
  const card = $('towerCard');
  if (!f) { card.hidden = true; return; }
  card.hidden = false;
  // walking past a tower: a small name tag; standing on a pad: the upgrade details
  card.classList.toggle('mini', !f.onPad);
  $('tcIcon').innerHTML = isArsenal(f.kind) ? `<img src="${TOWER_ART[f.kind]}" alt="">` : ICONS[f.path] || ICONS[f.kind] || ICONS.crossbow;
  $('tcTitle').textContent = f.build ? `Build a ${f.title.toLowerCase()}` : f.pathName ? `${f.title} · ${f.pathName}` : f.title;
  $('tcLevel').textContent = f.build ? 'Empty pad' : `Level ${f.level} · ${f.ability}`;
  $('tcDesc').textContent = f.build ? 'Stand on the pad to pour in gold.' : f.desc;
  $('tcMax').hidden = !f.max;
  $('tcNext').hidden = !f.next;
  // the cannon's upgrade choice: both paths side by side
  $('tcChoice').hidden = !f.choice;
  if (f.choice) {
    $('tcChoice').innerHTML = '<p class="tcard-choose">Choose an upgrade: step on a pad</p><div class="tcard-opts">' + f.choice.map((c) => `<div class="tcard-opt ${c.path}">
      <div class="tcard-opthead"><span class="tcard-opticon">${ICONS[c.path]}</span><b>${esc(c.pathName)}</b></div>
      <p>${esc(c.blurb)}</p>
      <span class="tcard-cost"><i class="coin"></i>${c.paid > 0 ? `${Math.floor(c.paid)}/${c.cost}` : c.cost}</span>
    </div>`).join('') + '</div>';
  }
  if (f.next) {
    const n = f.next;
    $('tcNextTitle').textContent = n.repair ? 'Repair the town hall' : n.pathName ? `${n.pathName} · Level ${n.level} · ${n.ability}` : `${f.build ? 'Builds ' : ''}Level ${n.level} · ${n.ability}`;
    $('tcCost').textContent = n.paid > 0 ? `${Math.floor(n.paid)}/${n.cost}` : String(n.cost);
    $('tcNextDesc').textContent = n.desc;
    $('tcStats').innerHTML = n.changes.map(([k, a, b]) => `<span><em>${esc(k)}</em>${a === null ? '' : esc(a) + ' '}<b>${a === null ? '' : '→ '}${esc(b)}</b></span>`).join('');
    $('tcPaid').style.width = `${Math.min(100, (n.paid / n.cost) * 100).toFixed(1)}%`;
  }
}

// ------------------------------------------------------------ rat guide
// The "New enemy" card (the first wave a kind of rat marches in) and the Rat guide screen.
let enemyCardTimer = 0;
function showEnemyCard(key) {
  const g = guideEntry(key);
  if (!g) return;
  const url = RAT_ART[key] || view.portraits.get(key);
  if (url) $('ecImg').src = url; else $('ecImg').removeAttribute('src');
  const boss = key.startsWith('boss:');
  $('ecTag').textContent = boss ? 'Boss' : 'New enemy';
  $('enemyCard').classList.toggle('boss', boss);
  $('ecName').textContent = g.name;
  $('ecTrait').textContent = g.trait;
  // the first sentence is the main tip; phones leave out the rest
  const [, tip, more] = /^(.*?[.;])\s+(.+)$/s.exec(g.counter) || [, g.counter, ''];
  $('ecCounter').innerHTML = esc(tip) + (more ? ` <span class="ec-more">${esc(more)}</span>` : '');
  $('enemyCard').classList.remove('open');
  $('ecMore').textContent = 'Tap for more';
  $('enemyCard').hidden = false;
  $('enemyCard').dataset.key = key;
  holdEnemyCard(7000);
}
// The card stays up for a while; time spent paused does not count.
let enemyCardLeft = 0, enemyCardFrom = 0;
function holdEnemyCard(ms) {
  clearTimeout(enemyCardTimer);
  enemyCardLeft = ms; enemyCardFrom = performance.now();
  enemyCardTimer = setTimeout(hideEnemyCard, ms);
}
function freezeEnemyCard() {
  if ($('enemyCard').hidden) return;
  clearTimeout(enemyCardTimer);
  enemyCardLeft = Math.max(1500, enemyCardLeft - (performance.now() - enemyCardFrom));
}
function thawEnemyCard() { if (!$('enemyCard').hidden) holdEnemyCard(enemyCardLeft); }
function hideEnemyCard() { clearTimeout(enemyCardTimer); $('enemyCard').hidden = true; }

const speedWord = (m) => (m >= 1.4 ? 'very fast' : m >= 1.1 ? 'fast' : m >= 0.95 ? 'normal' : m >= 0.75 ? 'slow' : 'very slow');
function guideStats(key) {
  if (key.startsWith('rat:')) {
    const RT = CFG.ratTypes[+key.slice(4)];
    const out = [['Speed', speedWord(RT.speedMul)], ['Health', key === 'rat:6' ? `${Math.round(CFG.ratTypes[5].split.hpFrac * 100)}% of its brood rat` : `×${RT.hpMul} a rat`], ['Bites', RT.gateDmg * RT.swings]];
    if (RT.shieldMul) out.push(['Shield', `×${RT.shieldMul} its health`]);
    if (RT.armor) out.push(['Armour', `${Math.round(RT.armor * 100)}%`]);
    if (RT.bomb) out.push(['Blast', `${RT.bomb.r} wide`]);
    if (RT.dodge) out.push(['Dodges', `1 arrow every ${RT.dodge.every} s`]);
    if (RT.jet) out.push(['Jetpack', `${RT.jet.speedMul}× speed every ${RT.jet.every} s`]);
    return out;
  }
  if (key === 'giant') return [['Speed', speedWord(CFG.giant.speedMul || 0.8)], ['Health', '32 to 10,600'], ['Armour', `${Math.round(CFG.giant.armor * 100)}%`]];
  const B = { ...CFG.boss, ...CFG.bosses[key.slice(5)] };
  const hp = CFG.waves.flatMap((w) => w.giants.filter((g) => g[2] === key.slice(5)).map((g) => g[0]));
  const lo = Math.min(...hp).toLocaleString('en-US'), hi = Math.max(...hp).toLocaleString('en-US');
  const out = [['Speed', speedWord(B.speedMul)], ['Health', lo === hi ? hi : `${lo} to ${hi}`]];
  if (B.armor) out.push(['Armour', `${Math.round(B.armor * 100)}%`]);
  if (B.split) out.push(['Splits', `into ${B.split.n}, then ${B.split.n ** 2}`]);
  if (B.dig) out.push(['Tunnels', `${B.dig.speedMul}× as fast`]);
  if (B.fly) out.push(['Drops', `${B.fly.n} rats every ${B.fly.every} s`]);
  return out;
}
// The Rat Bestiary: a card for every enemy, then the Quick Counter Guide.
const STAT_ICON = {
  Health: '<svg viewBox="0 0 24 24"><path fill="#ff4a5a" stroke="#5a0a14" stroke-width="1.6" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>',
  Armour: '<svg viewBox="0 0 24 24"><path fill="#8fb8ff" stroke="#14305a" stroke-width="1.6" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>',
  Shield: '<svg viewBox="0 0 24 24"><path fill="#ffc63a" stroke="#5a3a08" stroke-width="1.6" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>',
  Speed: '<svg viewBox="0 0 24 24"><path fill="none" stroke="#ffc63a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M4 6l6 6-6 6M12 6l6 6-6 6"/></svg>',
  Bites: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#e0a85a" stroke="#5a3010" stroke-width="1.6"/><circle cx="9" cy="10" r="1.6" fill="#7a4a20"/><circle cx="14.5" cy="13.5" r="1.6" fill="#7a4a20"/><circle cx="13" cy="8" r="1.2" fill="#7a4a20"/></svg>',
  other: '<svg viewBox="0 0 24 24"><path fill="#c9a2ff" stroke="#3a1a5a" stroke-width="1.4" d="M12 2l2.6 6.4L21 9l-5 4.3L17.5 20 12 16.6 6.5 20 8 13.3 3 9l6.4-.6z"/></svg>',
};
const TARGET_ICON = '<svg class="ge-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#9be05a" stroke-width="2.4"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#9be05a" stroke-width="2.4"/><circle cx="12" cy="12" r="1.8" fill="#ffd23a"/></svg>';
const QC_ICON = {
  crowd: '<svg viewBox="0 0 24 24"><g fill="#e8603a" stroke="#5a1a08" stroke-width="1.2"><circle cx="7" cy="10" r="4"/><circle cx="17" cy="10" r="4"/><circle cx="12" cy="15" r="4.5"/></g></svg>',
  fast: STAT_ICON.Speed, armour: STAT_ICON.Armour, shield: STAT_ICON.Shield,
  heal: '<svg viewBox="0 0 24 24"><path fill="#4cd964" stroke="#0e4a1a" stroke-width="1.6" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  fly: '<svg viewBox="0 0 24 24"><path fill="#9ad8ff" stroke="#14405a" stroke-width="1.5" d="M2 9c4-3 7-2 10 2 3-4 6-5 10-2-3 1-5 3-6 6l-4-2-4 2C7 12 5 10 2 9z"/></svg>',
  boom: '<svg viewBox="0 0 24 24"><path fill="#ff6a2a" stroke="#5a1a08" stroke-width="1.5" d="M12 2l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z"/></svg>',
  split: '<svg viewBox="0 0 24 24"><g fill="#6dff4a" stroke="#1a5a10" stroke-width="1.4"><ellipse cx="9" cy="13" rx="6" ry="5"/><ellipse cx="18" cy="16" rx="3.5" ry="3"/><ellipse cx="18" cy="8" rx="3" ry="2.6"/></g></svg>',
};
let guideJob = 0;
function openGuide() {
  const list = $('guideList');
  list.innerHTML = RAT_GUIDE.map((g) => {
    const fw = firstWave(g.key), boss = g.key.startsWith('boss');
    const stats = guideStats(g.key).map(([k, v]) => `<span>${STAT_ICON[k] || STAT_ICON.other}${esc(k)}: <b>${esc(v)}</b></span>`).join('');
    const abil = g.abilities.length ? g.abilities.map((a) => `<span>${esc(a)}</span>`).join('') : '<span>No tricks: just lots of them</span>';
    return `<section class="guide-entry${boss ? ' boss' : ''}" data-key="${g.key}" style="--aura:${g.aura}">
      <div class="ge-top"><h3>${esc(g.name)}</h3><span class="ge-pill">${esc(g.tag)}</span>${fw ? `<span class="ge-pill wave">${g.key === 'rat:6' || g.key === 'giant' || boss ? 'Wave' : 'From wave'} ${fw}</span>` : ''}</div>
      <div class="ge-mid"><div class="ge-art"><img alt="" width="256" height="256" ${RAT_ART[g.key] ? `src="${RAT_ART[g.key]}"` : ''}></div><div class="ge-stats">${stats}</div></div>
      <p>${esc(g.trait)}</p>
      <div class="ge-abil">${abil}</div>
      <p class="counter">${TARGET_ICON}<span><em>How to beat it:</em>${esc(g.counter)}</span></p>
    </section>`;
  }).join('') + `<section class="guide-entry quick"><div class="ge-top"><h3>Quick Counter Guide</h3></div>${QUICK_COUNTERS.map((q) => `<div class="qc-row">${QC_ICON[q.icon]}<span><b>${esc(q.kind)}</b> → ${esc(q.beat)}<small>${esc(q.who)}</small></span></div>`).join('')}</section>`;
  showScreen('guideScreen');
  // any enemy without a painted portrait gets its 3D one, drawn just after the screen shows
  const job = ++guideJob;
  setTimeout(() => {
    if (job !== guideJob || screen !== 'guideScreen') return;
    for (const el of list.querySelectorAll('.guide-entry[data-key]')) {
      const img = el.querySelector('img');
      if (img.getAttribute('src')) continue;
      const url = view.portraits.get(el.dataset.key, false);
      if (url) img.src = url;
    }
    view.portraits.flush();
  }, 30);
}

// ------------------------------------------------------------- tutorial
const tutorial = {
  step: 0, shownAt: 0, keepShown: false, upShown: false, timer: 0,
  reset() { this.step = settings.tutorialDone ? 3 : 0; this.keepShown = false; this.upShown = false; this.cannonShown = false; this.cannonT = 0; this.repairShown = false; this.repairT = 0; this.timer = 0; this.text = null; },
  set(text) {
    if (text === this.text) return;
    this.text = text;
    const el = $('hint');
    if (text) { el.innerHTML = text; el.hidden = false; } else el.hidden = true;
    $('hud').classList.toggle('has-hint', !!text);   // the tower card moves up out of its way
  },
  update(dt) {
    const s = sim;
    const start = CFG.hero.start;
    let arrow = null, text = null;
    if (this.step === 0) {
      text = input.lastKind === 'touch' ? 'Drag anywhere on the screen to move' : 'Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys';
      if (Math.hypot(s.hero.x - start[0], s.hero.z - start[1]) > 3) this.step = 1;
    } else if (this.step === 1) {
      const pad = cheapestPad('build');
      if (pad && s.gold >= pad.cost - pad.paid) this.step = 2;
      else if (s.coins.length) text = 'Walk over the gold coins to scoop them up';
      else if (s.state === 'build') text = `Rats arrive in ${Math.ceil(s.buildTimer)}s. Your crossbow fires on its own`;
      if (s.builtOrder > 0) this.step = 3;
    } else if (this.step === 2) {
      const pad = cheapestPad('build');
      if (pad) { arrow = pad.id; text = `Stand on the pad to pour in gold and build a ${towerName(pad.tower || 'crossbow').replace(' Tower', '').toLowerCase()}`; }
      if (s.builtOrder > 0) { this.step = 3; settings.tutorialDone = true; Save.set('settings', settings); }
    }
    if (this.step >= 3) {
      const fp = s.pads.find((p) => p.kind === 'fortress');
      const up = s.builtOrder > 0 ? s.pads.find((p) => p.kind === 'upgrade') : null;
      if (fp && !this.keepShown && s.fortress.level === 1) {
        arrow = fp.id; text = 'Upgrade the town hall: more health and a full repair';
        this.timer += dt;
        if (this.timer > 9) { this.keepShown = true; this.timer = 0; }
      } else if (up && !this.upShown) {
        arrow = up.id; text = 'Stand on the pad beside a crossbow to upgrade it';
        this.timer += dt;
        if (this.timer > 7) { this.upShown = true; this.timer = 0; }
      }
      const rp = s.pads.find((p) => p.kind === 'repair');
      if (!text && rp && !this.repairShown) {
        arrow = rp.id; text = 'Town hall damaged: stand on the repair pad to fix it';
        this.repairT += dt;
        if (this.repairT > 7) this.repairShown = true;
      }
      if (s.stats.repaired) this.repairShown = true;   // already found it
      if (s.fortress.level > 1) this.keepShown = true;
      if (!text && moreTowers() && !this.cannonShown && s.state === 'build') {
        text = input.lastKind === 'touch' ? 'More towers unlocked: tap <b>Build</b> to pick one, then step on a build pad' : 'More towers unlocked: press <kbd>1</kbd>–<kbd>9</kbd> or click a tower by <b>Build</b>, then step on a build pad';
        this.cannonT += dt;
        if (this.cannonT > 8 || s.buildKind !== 'crossbow' || s.towers.some((t) => t.kind !== 'crossbow')) this.cannonShown = true;
      }
      if (s.towers.some((t) => t.level > 1)) this.upShown = true;
    }
    view.arrowTarget = arrow;
    this.set(text);
  },
};
function cheapestPad(kind) {
  let best = null;
  for (const p of sim.pads) if (p.kind === kind && (!best || p.cost - p.paid < best.cost - best.paid)) best = p;
  return best;
}

// Tell the player why a pad is not taking coins after a purchase.
const reminded = new Set();
let disarmedFor = 0;
function stepOffReminder(dt) {
  const p = sim.pads.find((q) => q.heroOn && !q.armed);
  if (!p) { disarmedFor = 0; return; }
  disarmedFor += dt;
  // the reminder itself is drawn above the hero by the view
  if (disarmedFor > 0.9 && !reminded.has(p.id)) reminded.add(p.id);
}

// --------------------------------------------------------------- events
function processEvents() {
  const s = sim;
  const playing = mode === 'play';
  for (const e of s.events) {
    view.handleEvent(e, s);
    if (!playing) continue;
    switch (e.type) {
      case 'fire':
        if (isArsenal(e.tower)) audio.arsenal(e.tower === 'poison' ? 'gas' : e.tower);
        else if (e.tower !== 'cannon') audio.fire(e.level);
        else audio.cannon(e.kind, e.level >= CFG.cannon.branchLevel ? (e.path === 'rapid' ? 'rapid' : 'heavy') : '');
        break;
      case 'explode': audio.explosion(e.kind, e.level); break;
      case 'freeze': audio.freeze(e.giant); break;
      case 'bossWarning':
        banner('⚠ Boss incoming!', `The ${e.name} climbs out of the burrow in ${Math.max(1, Math.round(e.in))}s`, 'boss');
        bossVignette(CFG.bossWarning);
        audio.bossWarning();
        break;
      case 'bossSpawn':
        toast(`The ${e.name} has appeared!`, true); audio.bossRoar();
        // the first time a boss comes in a game, a card says what it does and how to beat it
        if (!introducedBosses.has(e.boss)) {
          introducedBosses.add(e.boss);
          setTimeout(() => { if (mode === 'play' && sim === s) showEnemyCard('boss:' + e.boss); }, 1200);
        }
        break;
      case 'slimeSplit': audio.slimeSplit(e.tier); break;
      case 'digDown':
        banner('Underground!', `The ${e.name} bursts out near the town in ${Math.max(1, Math.round(e.eta))}s. Watch for the red cracks`, 'boss');
        audio.digDown();
        break;
      case 'digUp': toast(`The ${e.name} burst out near the town!`, true); audio.digUp(); break;
      case 'drop': audio.drop(); break;
      case 'clink': audio.clink(); break;
      case 'block': audio.shieldBlock(); break;
      case 'shieldBreak': audio.shieldBreak(); break;
      case 'heal': audio.heal(); break;
      case 'bomb': audio.explosion('shell', 2); break;
      case 'dodge': audio.dodge(); break;
      case 'jet': audio.jet(); break;
      case 'spent': if (e.kind === T_GRUNT && e.v === 7) audio.explosion('shell', 2); break;
      case 'split': audio.broodSplit(); break;
      case 'storm': audio.storm(); break;
      case 'stormHit': audio.stormHit(); break;
      case 'zap': case 'overload': audio.arsenal('zap'); break;
      case 'snipe': audio.arsenal('snipe'); if (e.head) audio.arsenal('headshot'); break;
      case 'plant': audio.arsenal('plant'); break;
      case 'impale': audio.arsenal('impale'); break;
      case 'roar': audio.arsenal('roar'); toast('Battle Roar! Nearby towers hit twice as hard'); break;
      case 'warp': audio.arsenal('warp'); break;
      case 'blizzard': audio.arsenal('blizzard'); break;
      case 'inferno': audio.arsenal('flame'); break;
      case 'allyUp': audio.arsenal('summon'); break;
      case 'hit': audio.hitGiant(); break;
      case 'death': if (e.kind === T_GRUNT) audio.pop(); else audio.bigDeath(e.kind === T_BOSS); break;
      case 'coin': audio.coin(); bumpGold(); break;
      case 'pay': audio.pay(e.frac); break;
      case 'needGold': toast(`Need ${e.need} more gold`, true); audio.denied(); break;
      case 'built':
        audio.build(e.kind);
        if (e.kind === 'build') toast(`${towerName(e.tower)} built`);
        else if (e.kind === 'upgrade') {
          if (isArsenal(e.tower)) toast(`${towerName(e.tower)} level ${e.level}: ${arsenalSpec(e.tower, e.level).ab[0]}`);
          else if (e.tower !== 'cannon') toast(`Crossbow level ${e.level}: ${TOWER_NAMES[e.level]}`);
          else if (e.level === CFG.cannon.branchLevel) banner(CFG.cannon.paths[e.path].name, e.path === 'rapid' ? 'Rapid fire for swarms and fast rats' : 'Huge blasts for crowds, giants and bosses', true);
          else if (e.level === CFG.cannon.branchLevel - 1) toast(`Cannon level ${e.level}: ${cannonAbility(e.level)[0]}. Next, choose its path!`);
          else toast(`Cannon level ${e.level}: ${cannonAbility(e.level, e.path)[0]}`);
        }
        else if (e.kind === 'repair') toast(`Town hall repaired · +${e.amount} health`);
        else { banner(`Town hall level ${e.level}`, `Town hall health raised to ${CFG.fortressLevels[e.level].hp}`, true); }
        break;
      case 'refund': toast(e.repair ? `+${e.amount} gold back: the upgrade repaired the town hall` : `+${e.amount} gold back from the path you didn't take`); break;
      case 'fortressHit': audio.fortressHit(); shakeFort(); break;
      case 'earlyBonus': toast(`+${e.amount} gold for calling the wave early`); break;
      case 'skipped': toast(`Wave ${e.index + 1} skipped · +${e.bonus} gold`); audio.pay(1); break;
      case 'waveStart': {
        banner(`Wave ${e.index + 1}`, e.title || `${e.total} rats incoming`);
        if (e.intro) setTimeout(() => { if (mode === 'play' && sim === s) showEnemyCard('rat:' + e.intro); }, 1800);
        audio.horn();
        audio.musicIntensity = Math.min(1, 0.35 + e.index * 0.1);
        break;
      }
      case 'waveCleared':
        if (e.diamonds > 0) { progress.diamonds += e.diamonds; Save.set('progress', progress); }
        if (e.index + 1 < CFG.waves.length) banner('Wave cleared!', `+${e.bonus} gold` + (e.diamonds > 0 ? ` · +${e.diamonds} diamond${e.diamonds === 1 ? '' : 's'}` : ''), true);
        {
          // first warning: the next wave brings a boss
          const next = s.upcomingBosses;
          if (next.length) setTimeout(() => { if (mode === 'play' && sim === s && s.state === 'build') { banner('Boss wave next!', next.length > 1 ? 'Every boss is coming back. Get ready.' : `The ${next[0]} is coming. Get ready.`, 'boss'); audio.bossWarning(); } }, 2400);
        }
        audio.musicIntensity = 0.15;
        if (e.index + 1 > progress.bestWave) { progress.bestWave = e.index + 1; Save.set('progress', progress); }
        if (e.index + 1 > levelBest().bestWave) { levelBest().bestWave = e.index + 1; Save.set('progress', progress); }
        break;
      case 'checkpoint': {
        const snap = s.serialize();
        if (e.kind === 'waveStart') Save.set('waveStart', snap);
        Save.set('checkpoint', snap);
        lastSaveAt = performance.now();
        break;
      }
      case 'victory': endGame(true, e.stars); break;
      case 'defeat': endGame(false); break;
      default: break;
    }
  }
  s.events.length = 0;
}

function bumpGold() {
  const el = $('goldPill');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function shakeFort() {
  const el = $('fortPill');
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
}

function endGame(won, stars = 0) {
  mode = 'over';
  hideEnemyCard();
  input.setEnabled(false);
  view.arrowTarget = null;
  tutorial.set(null);
  audio.musicIntensity = 0;
  let opened = null;   // the map this win unlocks, if any
  if (won) {
    progress.cleared = true;
    progress.clears = (progress.clears | 0) + 1;   // diamonds were already paid wave by wave
    progress.bestWave = CFG.waves.length;
    progress.bestStars = Math.max(progress.bestStars, stars);
    const rank = (k) => Object.keys(CFG.difficulties).indexOf(k);
    if (!progress.bestDiff || rank(sim.difficulty) > rank(progress.bestDiff)) progress.bestDiff = sim.difficulty;
    const lb = levelBest();
    opened = MAPS.find((m) => m.id === CFG.level + 1 && !levelUnlocked(m.id)) || null;
    lb.cleared = true; lb.bestWave = CFG.waves.length; lb.bestStars = Math.max(lb.bestStars, stars);
    if (!lb.bestDiff || rank(sim.difficulty) > rank(lb.bestDiff)) lb.bestDiff = sim.difficulty;
    Save.set('progress', progress);
    Save.del('checkpoint'); Save.del('waveStart');
  } else {
    // the wave-start snapshot stays so "Retry wave" and "Continue" work
    const ws = Save.get('waveStart', null);
    if (ws) Save.set('checkpoint', ws);
  }
  if (won) {
    // the camera swings over to the town square while everyone celebrates
    view.focus = { x: CFG.town.square.x, z: CFG.town.square.z + 1, zoom: 30 };
    banner('Victory!', 'The town is safe. Everyone is celebrating!', true);
  }
  overTimer = setTimeout(() => {
    audio.jingle(won);
    if (won) {
      $('victoryStars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
      $('victoryStars').setAttribute('aria-label', `${stars} of 3 stars`);
      $('vKills').textContent = sim.stats.kills;
      $('vGold').textContent = sim.stats.coins;
      $('vKeep').textContent = `${Math.round(sim.fortress.hp / sim.fortress.maxHp * 100)}%`;
      $('vGemText').textContent = `+${sim.stats.diamonds | 0} diamonds on ${diffName(sim.difficulty)} · you have ${progress.diamonds}`;
      // finishing a map opens the next one: say so, with a button straight to it
      const next = MAPS.find((m) => m.id === CFG.level + 1);
      $('vUnlock').hidden = !opened;
      if (opened) $('vUnlockText').textContent = `Level ${opened.id} unlocked: ${opened.name}!`;
      $('nextLevelBtn').hidden = !next;
      if (next) $('nextLevelBtn').textContent = `Play Level ${next.id}`;
      showScreen('victoryScreen');
    } else {
      $('defeatInfo').textContent = `The rats broke through on wave ${sim.waveIndex + 1}. Retry it with the crossbows you had when it began.`;
      $('retryBtn').textContent = `Retry wave ${sim.waveIndex + 1}`;
      $('retryBtn').hidden = !Save.get('waveStart', null);
      const gems = sim.stats.diamonds | 0;
      $('dGemText').textContent = gems > 0
        ? `+${gems} diamond${gems === 1 ? '' : 's'} for the waves you cleared · you have ${progress.diamonds}`
        : `Clear a wave to start earning diamonds (${sim.diamondsPerClear} for all ${CFG.waves.length})`;
      showScreen('defeatScreen');
    }
  }, won ? 4200 : 1600);
}

// ------------------------------------------------------- performance
const perf = {
  samples: [], strikes: 0, fps: 60,
  reset() { this.samples.length = 0; this.strikes = 0; },
  add(dt) {
    this.samples.push(dt);
    if (this.samples.length < 120) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    this.fps = Math.round(1 / avg);
    if (settings.quality !== 'auto') return;
    if (avg > 1 / 38) this.strikes++; else this.strikes = 0;
    if (this.strikes >= 2) {
      this.strikes = 0;
      const next = quality === 'high' ? 'medium' : quality === 'medium' ? 'low' : null;
      if (next) { quality = next; view.setQuality(quality); }
    }
  },
};

// --------------------------------------------------------------- loop
let last = performance.now();
let acc = 0;
let needsRender = true;
let clopT = 0, clopHi = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (mode === 'pause' && !needsRender) return;
  if (mode === 'title' && (screen === 'guideScreen' || screen === 'shopScreen') && !needsRender) return;   // the backdrop holds still while portraits render
  if (mode === 'title' && !$('menuBg').hidden && !needsRender) return;   // the painted canyon covers the 3D scene: save the battery
  const speed = mode === 'play' ? gameSpeed() : 1;   // fast forward only ever speeds up a game in progress

  if (mode === 'play' || mode === 'title') {
    if (mode === 'play') {
      if (autoBot) autoBot(sim);
      else { const v = input.vector(); sim.setInput(v.x, v.z); }
      perf.add(dt);
    } else {
      demoBot(sim);
      if (sim.state === 'victory' || sim.state === 'defeat' || sim.time > 240) { sim = makeDemo(); demoBot = makeBot(); view.reset(sim); }
    }
    acc += dt * speed;
    let steps = 0;
    const maxSteps = 6 * speed;
    while (acc >= FIXED && steps < maxSteps) { sim.step(FIXED); acc -= FIXED; steps++; }
    if (steps === maxSteps) acc = 0;
    processEvents();
    if (mode === 'play') {
      // clip-clop while riding
      if (sim.ride && sim.hero.moving) {
        clopT -= dt * speed * Math.min(1.6, Math.hypot(sim.hero.vx, sim.hero.vz) / 7);
        if (clopT <= 0) { clopT += 0.17; clopHi = !clopHi; audio.clop(clopHi); }
      }
      tutorial.update(dt);
      stepOffReminder(dt);
      if (sim.state === 'build' && now - lastSaveAt > 5000) { Save.set('checkpoint', sim.serialize()); lastSaveAt = now; }
    }
  } else if (mode === 'over') {
    sim.step(dt);
    sim.events.length = 0;
  }
  view.sync(sim, mode === 'pause' ? 0 : dt * speed);
  // townsfolk sounds: startled squeaks, relieved sighs, cheering
  const ts = view.town.sounds;
  if (ts.length) {
    if (mode === 'play' || mode === 'over') for (const k of ts) { if (k === 'gasp') audio.villagerGasp(); else if (k === 'phew') audio.villagerPhew(); else if (k === 'cheer') audio.villagerCheer(); }
    ts.length = 0;
  }
  if (mode !== 'title') updateHud();
  view.render();
  needsRender = false;
}

// ------------------------------------------------------ window events
function onResize() { view.resize(); needsRender = true; }
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pause(); saveCheckpointIfSafe(); audio.suspend(); }
  else if (mode !== 'pause') audio.resume();
});
window.addEventListener('pagehide', saveCheckpointIfSafe);
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Hot-update support for the artifact viewer: keep a running game across republishes.
try {
  window.claude?.hot?.snapshot?.(() => ({ save: (mode === 'play' || mode === 'pause') ? sim.serialize() : null }));
} catch { /* not in a viewer */ }

// Test / debugging hooks
window.__cc = {
  get sim() { return sim; }, get view() { return view; }, audio, input, settings, switchLevel,
  get level() { return CFG.level; },
  get mode() { return mode; },
  get screen() { return screen; },
  get quality() { return quality; },
  get fps() { return perf.fps; },
  autoplay(on) { autoBot = on ? makeBot() : null; },
  advance(seconds) { const n = Math.round(seconds / FIXED); for (let i = 0; i < n; i++) { if (autoBot) autoBot(sim); sim.step(FIXED); if (i % 30 === 0) processEvents(); } processEvents(); view.clearTransient(); },
  setGold(g) { sim.gold = g; },
  teleport(x, z) { sim.hero.x = x; sim.hero.z = z; view.camTarget.set(x, 0, z - 2.5); },
  pause, resume, startGame, goTitle, skipWave, toggleAuto, toggleSpeed, showEnemyCard, openGuide,
  get speed() { return gameSpeed(); },
  toasts: toastLog,
};

// --------------------------------------------------------------- start
let booted = false;
function boot(data) {
  if (booted) return;
  booted = true;
  $('loading').hidden = true;
  if (data && data.save) {
    goTitle();
    startGame(data.save);
    pause();
  } else {
    goTitle();
  }
  for (const el of document.querySelectorAll('.nWaves')) el.textContent = String(CFG.waves.length);
  syncAuto();
  syncSpeed();
  if (coarse) $('helpMove').textContent = 'Drag anywhere on the screen to steer the farmer. On a keyboard, use WASD or the arrow keys.';
  requestAnimationFrame((t) => { last = t; frame(t); });
}
const hot = window.claude?.hot;
try {
  if (hot?.ready) hot.ready((d) => boot(d || {})); else boot(hot?.data ?? {});
} catch { boot({}); }
// never leave the player on the loading screen if the host hook stays silent
setTimeout(() => boot({}), 1200);
// redraw pad price labels once the display font arrives
if (document.fonts?.ready) document.fonts.ready.then(() => { for (const v of view.padViews.values()) v.shown = -1; });
