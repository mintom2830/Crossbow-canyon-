// Crossbow Canyon — deterministic gameplay simulation.
// No rendering or DOM code lives here, so it runs unchanged in Node for the
// balance bot and in the browser for the real game.
import { CFG, giantCoins, cannonSpec, waveDiamonds, clearDiamonds, towerMaxLevel, towerUpgradeCost, towerBuildMul } from './config.js';
import { isArsenal, arsenalSpec, WEAK_MUL } from './arsenal.js';
import { road, groundHeight, footHeight, hillHeight, makeRng, plateauSdf, inWater, oasisLayout, pondEdge } from './world.js';

export const T_GRUNT = 0, T_GIANT = 1, T_BOSS = 2;
// small rat types (CFG.ratTypes index) with special abilities
export const SHIELD = 3, HEALER = 4, BROOD = 5, RATLING = 6, BOMB = 7, NINJA = 8, JET = 9;
const ROW_TYPES = [1, 2, SHIELD, BROOD, BOMB, NINJA, JET];   // what wave.mix shares stand for
const healBuf = [];

const GRID_MIN_X = -46, GRID_MIN_Z = -56, CELL = 2, GW = 52, GH = 54;
const MAX_ENEMIES = 1400;
const tmp = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
const tmp2 = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
const aimOut = { x: 0, z: 0 };
// height of an Arsenal tower's muzzle above its foot
const arsMuzzle = (t) => 1.45 + t.level * 0.07;
const extraBuf = [];
const AIR = CFG.airborne;   // flying higher than this: out of reach of blasts and ground effects
// where an arrow strikes an enemy (gy: the ground under it, on a hill)
const hitY = (e) => e.gy + (e.fly > 0 ? e.fly + 0.9 : e.type === T_GRUNT ? 0.55 : e.type === T_GIANT ? 1.6 : 2.2);
// the ground under a point of the road (0 on a map without hills)
const roadY = (x, z) => (CFG.hills.length ? hillHeight(x, z) : 0);
// standing still for a moment (aim straight at it, no lead)
const holding = (e) => e.atGate || e.stun > 0 || e.held > 0 || e.fall > 0 || e.dig === 1 || e.dig === 3;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// Where each slot's upgrade pad sits (beside the tower, on solid ground).
function upgradeOffset(slot) {
  for (const p of CFG.plateaus) {
    if (plateauSdf(p, slot.x, slot.z) > 0) {
      let dx = p.x - slot.x, dz = (p.z - slot.z) * 1.6;
      const l = Math.hypot(dx, dz) || 1;
      return [dx / l * 3.3, dz / l * 3.3];
    }
  }
  // ground slot: step away from the road
  let best = 1e9, bx = 0, bz = 0;
  for (let i = 0; i < road.count; i += 2) {
    const d = (road.px[i] - slot.x) ** 2 + (road.pz[i] - slot.z) ** 2;
    if (d < best) { best = d; bx = road.px[i]; bz = road.pz[i]; }
  }
  let dx = slot.x - bx, dz = slot.z - bz; const l = Math.hypot(dx, dz) || 1;
  return [dx / l * 3.3, dz / l * 3.3];
}

// Two spots for the upgrade-choice pads of a cannon reaching level 3 (Rapid
// Launcher on one side, Thunder Mortar on the other): the usual upgrade spot
// turned either way, kept on the same ground and clear of the road, other
// towers' pads and the town.
export function branchOffsets(slot, up) {
  const home = CFG.plateaus.find((p) => plateauSdf(p, slot.x, slot.z) > 0);
  const W = CFG.walk, H = CFG.pad.half;
  const ok = (x, z) => {
    if (home ? plateauSdf(home, x, z) < H + 0.35 : CFG.plateaus.some((p) => plateauSdf(p, x, z) > -H - 0.4)) return false;
    if (road.distanceTo(x, z) < CFG.roadHalfWidth + H + 0.2) return false;
    if (inWater(x, z, H + 0.5)) return false;
    const oasis = oasisLayout();
    if (oasis && oasis.solids.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + H + 0.3)) return false;
    if (x < W.minX + H || x > W.maxX - H || z < W.minZ + H || z > W.maxZ - H) return false;
    for (const o of CFG.slots) {
      if (o.x === slot.x && o.z === slot.z) continue;
      if (Math.hypot(o.x - x, o.z - z) < 2.9) return false;
      const ou = upgradeOffset(o);
      if (Math.hypot(o.x + ou[0] - x, o.z + ou[1] - z) < 2.7) return false;
    }
    if (Math.hypot(CFG.fortressPad.x - x, CFG.fortressPad.z - z) < 2.7) return false;
    for (const h of CFG.huts) if (Math.hypot(h.x - x, h.z - z) < 1.8 + H) return false;
    for (const o of CFG.town.obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + H + 0.2) return false;
    return true;
  };
  // every spot round the usual one that is free, then the closest pair far enough apart
  const spots = [];
  for (let a = -1.8; a <= 1.81; a += 0.1) {
    for (const k of [1, 1.12, 1.25, 1.4]) {
      const c = Math.cos(a), sn = Math.sin(a);
      const o = [(up[0] * c + up[1] * sn) * k, (-up[0] * sn + up[1] * c) * k];
      if (ok(slot.x + o[0], slot.z + o[1])) spots.push({ o, a, k });
    }
  }
  let best = null, bestScore = Infinity;
  for (const A of spots) for (const B of spots) {
    if (A.a <= B.a) continue;
    if (Math.hypot(A.o[0] - B.o[0], A.o[1] - B.o[1]) < H * 2 + 0.45) continue;
    const score = Math.abs(A.a) + Math.abs(B.a) + (A.k - 1) * 2 + (B.k - 1) * 2;
    if (score < bestScore) { bestScore = score; best = [A.o, B.o]; }
  }
  if (best) return best;
  const c = Math.cos(0.62), sn = Math.sin(0.62);
  return [[up[0] * c + up[1] * sn, -up[0] * sn + up[1] * c], [up[0] * c - up[1] * sn, up[0] * sn + up[1] * c]];
}

export class Sim {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 1234;
    // towers bought in the Shop: { cannon: true, tesla: true, ... }
    this.unlocked = { ...(opts.unlocks || {}), cannon: !!(opts.cannon || (opts.unlocks && opts.unlocks.cannon)) };
    this.ride = CFG.rides[opts.ride] ? opts.ride : null;   // the farmer rides a horse or a cow (Shop)
    this.autoSkip = !!opts.autoSkip;
    this.difficulty = CFG.difficulties[opts.difficulty] ? opts.difficulty : 'normal';
    this.cellCount = new Int32Array(GW * GH + 1);
    this.cellStart = new Int32Array(GW * GH + 1);
    this.cellItems = new Int32Array(MAX_ENEMIES);
    this.reset();
  }

  reset() {
    this.rng = makeRng(this.seed);
    this.time = 0;
    this.state = 'build';          // build | wave | victory | defeat
    this.gold = 15;
    this.waveIndex = 0;
    this.buildTimer = CFG.firstBuildTime;
    this.waveTime = 0;
    this.waveTotal = 0;
    this.waveKilled = 0;
    this.spawnQueue = [];
    this.spawnIndex = 0;
    this.enemies = [];
    this.nextId = 1;
    this.towers = [];
    this.bolts = [];
    this.shells = [];   // cannonballs in flight
    this.zones = [];    // burning ground and poison clouds
    this.mines = [];    // Mine Tower mines on the road
    this.rockets = [];  // Rocket Tower homing rockets
    this.allies = [];   // Summoner Tower rat soldiers
    this.allyId = 1;
    this.buildKind = 'crossbow';
    this.coins = [];
    this.pads = [];
    this.padPaid = {};
    this.events = [];
    this.builtOrder = 0;
    this.stars = 0;
    this.stats = { kills: 0, giants: 0, coins: 0, spent: 0, leaked: 0, diamonds: 0 };
    this.diamondsPaid = 0;   // waves whose diamonds this run has already paid out
    this.bossAlerts = [];
    const F = CFG.fortress;
    this.fortress = { level: 1, hp: CFG.fortressLevels[1].hp, maxHp: CFG.fortressLevels[1].hp, x: F.x, z: F.z, flash: 0, lastHit: -99, underAttack: 0 };
    const [hx, hz] = CFG.hero.start;
    this.hero = { x: hx, z: hz, y: groundHeight(hx, hz), vx: 0, vz: 0, facing: Math.PI, moving: false, collect: 0 };
    this.input = { x: 0, z: 0 };
    this.slots = CFG.slots.map((s, i) => { const up = upgradeOffset(s); return { ...s, index: i, y: footHeight(s.x, s.z), tower: null, up, upB: branchOffsets(s, up) }; });
    for (const s of this.slots) if (s.prebuilt) this._placeTower(s, 1, true, 'crossbow');
    this.refreshPads();
  }

  // ------------------------------------------------------------------ API
  setInput(x, z) {
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    this.input.x = x; this.input.z = z;
  }

  // Which tower empty build pads construct: 'crossbow', or any tower unlocked in the Shop.
  canBuild(kind) { return kind === 'crossbow' || ((kind === 'cannon' || isArsenal(kind)) && !!this.unlocked[kind]); }
  setBuildKind(kind) {
    if (!this.canBuild(kind)) return false;
    if (this.buildKind === kind) return true;
    this.buildKind = kind;
    this.refreshPads();
    this.events.push({ type: 'buildKind', kind });
    return true;
  }

  callWave() {
    if (this.state !== 'build') return false;
    const bonus = Math.floor(this.buildTimer / 2);
    if (bonus > 0) { this.gold += bonus; this.events.push({ type: 'earlyBonus', amount: bonus }); }
    this._startWave();
    return true;
  }

  get waveCount() { return CFG.waves.length; }
  // how far coins fly to the farmer (further with the cow's bell)
  get magnetRadius() { return CFG.hero.magnetRadius * (this.ride ? CFG.rides[this.ride].magnetMul : 1); }
  // Difficulty: every enemy's health is scaled by this.
  get hpMul() { return CFG.difficulties[this.difficulty].hp * CFG.levelHp; }
  // Diamonds a wave pays on this difficulty.
  waveDiamonds(i) { return waveDiamonds(i, this.difficulty); }
  get diamondsPerClear() { return clearDiamonds(this.difficulty); }
  get waveProgress() { return this.waveTotal ? this.waveKilled / this.waveTotal : 0; }
  // Day for the first half, sunset deepening through the second half.
  get nightFactor() { return clamp((this.waveIndex - 5) / (CFG.waves.length - 6), 0, 1); }

  step(dt) {
    if (this.state === 'victory' || this.state === 'defeat') {
      this._updateHero(dt);
      this._updateCoins(dt);
      return;
    }
    this.time += dt;
    if (this.state === 'build') {
      this.buildTimer -= dt;
      if (this.autoIn === 0) this.callWave();          // auto skip: go after a short pause
      else if (this.buildTimer <= 0) this._startWave();
    } else if (this.state === 'wave') {
      this.waveTime += dt;
      for (const a of this.bossAlerts) {
        if (!a.warned && this.waveTime >= a.t - CFG.bossWarning) {
          a.warned = true;
          this.events.push({ type: 'bossWarning', boss: a.boss, name: CFG.bosses[a.boss].name, in: Math.max(0, a.t - this.waveTime) });
        }
      }
      this._spawn();
    }
    this._updateHero(dt);
    this._updateEnemies(dt);
    if (this._repairDirty) { this._repairDirty = false; if (this.state === 'wave') this._syncRepairPad(); }
    this._buildGrid();
    this._updateHealers(dt);
    this._updateTowers(dt);
    this._updateBolts(dt);
    this._updateShells(dt);
    this._updateZones(dt);
    this._updateRockets(dt);
    this._updateMines(dt);
    this._updateAllies(dt);
    this._compact();
    this._updateCoins(dt);
    this._updatePads(dt);
    const f = this.fortress;
    f.flash = Math.max(0, f.flash - dt);
    f.underAttack = Math.max(0, f.underAttack - dt);

    if (this.state === 'wave' && this.spawnIndex >= this.spawnQueue.length && this.enemies.length === 0) this._waveCleared();
  }

  // ---------------------------------------------------------------- waves
  // Names of the bosses in the wave that is about to start (for the HUD).
  get upcomingBosses() {
    const w = CFG.waves[this.waveIndex];
    if (!w || this.state !== 'build') return [];
    return w.giants.filter((g) => g[2]).map((g) => CFG.bosses[g[2] === true ? 'king' : g[2]].name);
  }

  _kindOf(e) {
    if (e.kind) return e.kind;
    if (e.type === T_GRUNT) return CFG.ratTypes[e.v];
    if (e.type === T_GIANT) return CFG.giant;
    return e.kind || CFG.boss;
  }

  _startWave() {
    this.bossAlerts.length = 0;
    this.events.push({ type: 'checkpoint', kind: 'waveStart' });
    this.state = 'wave';
    this.waveTime = 0;
    this.waveKilled = 0;
    this.waveTotal = 0;
    this.spawnIndex = 0;
    this.spawnQueue = [];
    this._queueWave(this.waveIndex);
  }

  // Adds a wave's rats to the spawn queue, starting now (waveTime).
  _queueWave(index) {
    const w = CFG.waves[index];
    const q = [];
    const speed = CFG.grunt.speed;
    const rows = Math.ceil(w.grunts / w.perRow);
    const usable = CFG.roadHalfWidth - 0.55;
    const latStep = Math.min(0.95, (2 * usable) / (w.perRow - 1));
    const t0 = this.waveTime;
    let left = w.grunts;
    for (let r = 0; r < rows; r++) {
      const t = t0 + (r * CFG.rowSpacing) / speed + 1.2;
      const n = Math.min(w.perRow, left);
      // each row is one kind of rat (wave.mix: shares of fast, armored, shield and brood rows)
      let v = 0;
      if (w.mix && r > 0) {
        const x = this.rng(); let acc = 0;
        for (let i = 0; i < w.mix.length; i++) { acc += w.mix[i]; if (x < acc) { v = ROW_TYPES[i]; break; } }
      }
      // a healer walks in the middle of some rows (never with the fast or brood rats)
      let healers = 0;
      if (w.healers && r > 1 && (v === 0 || v === 2 || v === 3) && this.rng() < w.healers) healers = 1;
      const introRow = w.intro && (r === Math.floor(rows * 0.3) || r === Math.floor(rows * 0.6));
      if (introRow) {   // a wave that introduces a rat type always shows it
        if (w.intro === HEALER) { v = 0; healers = 2; } else v = w.intro;
      }
      for (let k = 0; k < n; k++) {
        const lat = (k - (w.perRow - 1) / 2) * latStep + this.rng.range(-0.14, 0.14) + (r % 2 ? latStep * 0.25 : -latStep * 0.25);
        const heal = healers === 1 ? k === Math.floor(n / 2) : healers === 2 ? (k === 1 || k === n - 2) : false;
        const vk = heal ? HEALER : v;
        q.push({ t: t + this.rng.range(0, 0.12), type: T_GRUNT, v: vk, hp: Math.max(1, Math.round(w.hp * this.hpMul * CFG.ratTypes[vk].hpMul)), lat: clamp(lat, -usable, usable) });
      }
      left -= n;
    }
    for (const g of w.giants) {
      const hp = Math.round(g[0] * this.hpMul), at = g[1], b = g[2];
      const boss = b === true ? 'king' : b || null;
      const t = t0 + (Math.floor(at * rows) * CFG.rowSpacing) / speed + (at === 0 ? 0 : 1.2);
      q.push({ t, type: boss ? T_BOSS : T_GIANT, hp, boss, lat: boss ? 0 : this.rng.range(-1.3, 1.3) });
      if (boss) this.bossAlerts.push({ t, boss, warned: false });   // warn CFG.bossWarning seconds before it climbs out
    }
    // keep the not-yet-spawned part of the queue sorted by time
    const rest = this.spawnQueue.slice(this.spawnIndex).concat(q).sort((a, b) => a.t - b.t);
    this.spawnQueue = rest;
    this.spawnIndex = 0;
    this.waveTotal += q.length;
    this.events.push({ type: 'waveStart', index, total: q.length, title: w.title || '', intro: w.intro || 0 });
  }

  // True while the "Skip wave" button can send the next wave:
  // between waves, or once the current wave has finished pouring in.
  get canSkip() {
    if (this.state === 'build') return true;
    return this.state === 'wave' && this.spawnIndex >= this.spawnQueue.length && this.waveIndex < CFG.waves.length - 1;
  }

  // Skip wave: start the next wave now. Between waves this pays the usual
  // early bonus; during a wave the next one marches in right behind the
  // current rats and you are paid the current wave's clear bonus up front.
  skipWave() {
    if (this.state === 'build') return this.callWave();
    if (!this.canSkip) return false;
    const bonus = CFG.waveClearBonus(this.waveIndex + 1) + CFG.skipBonus;
    this.gold += bonus;
    this.events.push({ type: 'skipped', index: this.waveIndex, bonus });
    this.waveIndex++;
    this.refreshPads();
    this.events.push({ type: 'checkpoint', kind: 'waveStart' });
    this._queueWave(this.waveIndex);
    return true;
  }

  // Seconds until the current wave has fully poured in and Skip wave unlocks
  // (null when skipping is not possible at all, e.g. on the final wave).
  get skipIn() {
    if (this.state === 'build') return 0;
    if (this.state !== 'wave' || this.waveIndex >= CFG.waves.length - 1) return null;
    const q = this.spawnQueue;
    return q.length && this.spawnIndex < q.length ? Math.max(0, q[q.length - 1].t - this.waveTime) : 0;
  }

  // Seconds until an auto-skip starts the next wave (null when not counting).
  get autoIn() {
    if (!this.autoSkip || this.state !== 'build' || this.waveIndex === 0) return null;
    return Math.max(0, CFG.autoSkipDelay - (CFG.buildTime - this.buildTimer));
  }

  _spawn() {
    const q = this.spawnQueue;
    while (this.spawnIndex < q.length && q[this.spawnIndex].t <= this.waveTime) {
      const d = q[this.spawnIndex++];
      if (this.enemies.length >= MAX_ENEMIES) { this.waveTotal--; continue; }
      const kind = d.type === T_GRUNT ? CFG.ratTypes[d.v || 0] : d.type === T_GIANT ? CFG.giant : { ...CFG.boss, ...CFG.bosses[d.boss || 'king'] };
      const e = this._makeEnemy(d.type, d.v || 0, d.hp, d.lat, CFG.spawnS + (this.waveTime - d.t) * CFG.grunt.speed * kind.speedMul, kind);
      if (d.type === T_BOSS) {
        e.boss = d.boss || 'king'; e.kind = kind;
        if (kind.split) { e.root = e.id; e.rootHp = e.hp; }              // Sewer Slime: the size it started at
        if (kind.fly) e.dropT = kind.fly.every * 0.7;                    // Canyon Buzzard: first drop soon after take-off
      }
      this._placeEnemy(e);
      this.enemies.push(e);
      if (d.type === T_BOSS) this.events.push({ type: 'bossSpawn', id: e.id, boss: e.boss, name: kind.name, hp: e.hp, x: e.x, z: e.z });
    }
  }

  _makeEnemy(type, v, hp, lat, s, kind) {
    const speed = CFG.grunt.speed * kind.speedMul;
    const L = road.length;
    const e = {
      id: this.nextId++, type, v, armor: kind.armor || 0, hp, maxHp: hp, lat,
      s, speed: speed * this.rng.range(0.97, 1.03),
      x: 0, z: 0, yaw: 0, alive: true, atGate: false,
      gateS: type === T_GRUNT ? L - this.rng.range(0.3, 4.2) : L - this.rng.range(1.6, 2.6),
      attackT: 0, swings: kind.swings, flash: 0, radius: kind.radius, phase: this.rng() * 6.28, cell: 0,
      stun: 0, slow: 0, slowMul: 1, broken: 0,
      weak: 0, mark: 0, burn: 0, burnDps: 0, held: 0,   // poisoned/scorched, sniper-marked, burning, held by a rat soldier
      frost: 0, frostT: 0, frozen: 0, freezeCd: 0, hitT: 0,
      shield: 0, shieldMax: 0, healT: 0, healed: 0, gy: 0,
      dodgeT: 0, jetT: 0, boost: 0,   // ninja rat: until it can dodge again · jetpack rat: until it fires, and how long it still burns
      // boss abilities: kind (stats), boss (name), slime size (tier) and family (root, rootHp),
      // mole tunnelling (dig, digT, under), buzzard flight (fly, dropT), rats falling from it (fall)
      kind: null, boss: null, tier: 0, root: 0, rootHp: 0, dig: 0, digT: 0, under: false,
      fly: 0, dropT: 0, fall: 0, fallT: 0, fallH: 0, born: 0,
    };
    if (kind.shieldMul) e.shield = e.shieldMax = hp * kind.shieldMul;      // shield rats
    if (kind.heal) e.healT = this.rng() * kind.heal.every;
    if (kind.jet) e.jetT = (0.4 + this.rng() * 0.6) * kind.jet.every;                // healers pulse out of step
    return e;
  }

  // A brood rat bursts: its ratlings tumble out around it and run on.
  _split(e, S) {
    const RT = CFG.ratTypes[S.v], usable = CFG.roadHalfWidth - 0.55;
    let n = 0;
    for (let i = 0; i < S.n; i++) {
      if (this.enemies.length >= MAX_ENEMIES) break;
      const s = Math.max(CFG.spawnS, e.s + (i - (S.n - 1) / 2) * 0.4 + this.rng.range(-0.15, 0.15));
      const lat = clamp(e.lat + this.rng.range(-S.spread, S.spread), -usable, usable);
      const r = this._makeEnemy(T_GRUNT, S.v, Math.max(1, Math.round(e.maxHp * S.hpFrac)), lat, s, RT);
      r.born = 0.45;   // hop out of the sack
      if (r.s >= r.gateS) { r.s = r.gateS; r.atGate = true; r.attackT = 0.5 + this.rng() * 0.6; }
      this._placeEnemy(r);
      this.enemies.push(r);
      n++;
    }
    this.waveTotal += n;
    this.stats.ratlings = (this.stats.ratlings || 0) + n;
    this.events.push({ type: 'split', x: e.x, z: e.z, n, id: e.id });
  }

  // A bomb rat shot down blows up: every rat close by takes a big hit (giants and
  // bosses less), so popping one in the middle of the crowd takes its friends with it.
  // Another bomb rat caught in the blast goes off too.
  _bombBlast(e) {
    const B = CFG.ratTypes[e.v].bomb, R = B.r, R2 = R * R, dmg = e.maxHp * B.mul;
    let hits = 0;
    this.events.push({ type: 'bomb', x: e.x, z: e.z, r: R, id: e.id });
    this._query(e.x - R, e.z - R, e.x + R, e.z + R, (o) => {
      if (o === e || !o.alive || o.under || o.fly > AIR || (o.x - e.x) ** 2 + (o.z - e.z) ** 2 > R2) return;
      hits++;
      this._damage(o, o.type === T_GRUNT ? dmg : dmg * B.bigMul, 1);
    });
    this.stats.bombed = (this.stats.bombed || 0) + hits;
  }

  // Healer rats: every few seconds, mend the rats around them (not while stunned or frozen).
  _updateHealers(dt) {
    for (const h of this.enemies) {
      if (h.v !== HEALER || h.type !== T_GRUNT || !h.alive || h.stun > 0) continue;
      const H = CFG.ratTypes[h.v].heal;
      h.healT -= dt;
      if (h.healT > 0) continue;
      h.healT += H.every;
      // the most badly hurt rats nearby, up to H.max of them
      const R = H.r, R2 = R * R, near = healBuf;
      near.length = 0;
      this._query(h.x - R, h.z - R, h.x + R, h.z + R, (e) => {
        if (!e.alive || e.hp >= e.maxHp || e.fly > AIR || (e.x - h.x) ** 2 + (e.z - h.z) ** 2 > R2) return;
        near.push(e);
      });
      near.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      let n = 0, amount = 0;
      for (const e of near) {
        if (n >= H.max) break;
        const k = e === h ? H.pct * H.self : e.type === T_GRUNT ? H.pct : H.bigPct;
        const add = Math.min(e.maxHp - e.hp, e.maxHp * k);
        e.hp += add; e.healed = 0.7; amount += add; n++;
      }
      this.stats.healed = (this.stats.healed || 0) + amount;
      this.events.push({ type: 'heal', x: h.x, z: h.z, r: R, n, id: h.id });
    }
  }

  // ------------------------------------------------------- boss abilities
  // Sewer Slime: a burst slime splits into smaller slimes that ooze on.
  _slimeSplit(e) {
    const SL = CFG.bosses.slime.split, T = SL.tiers[e.tier], usable = CFG.roadHalfWidth - 0.5;
    const kind = { ...CFG.giant, ...T, armor: 0 };
    const hp = Math.max(1, Math.round(e.maxHp * SL.hpFrac));
    let n = 0;
    for (let i = 0; i < SL.n; i++) {
      if (this.enemies.length >= MAX_ENEMIES) break;
      const side = SL.n === 1 ? 0 : (i / (SL.n - 1)) * 2 - 1;
      const lat = clamp(e.lat + side * SL.spread * (e.tier ? 0.6 : 1) + this.rng.range(-0.2, 0.2), -usable, usable);
      const c = this._makeEnemy(T_GIANT, 0, hp, lat, Math.max(CFG.spawnS, e.s + this.rng.range(-0.5, 0.5)), kind);
      c.kind = kind; c.boss = 'slime'; c.tier = e.tier + 1; c.root = e.root || e.id; c.rootHp = e.rootHp || e.maxHp;
      c.born = 0.5;   // flung out of the splat
      if (c.s >= c.gateS) { c.s = c.gateS; c.atGate = true; c.attackT = 0.6 + this.rng() * 0.6; }
      this._placeEnemy(c);
      this.enemies.push(c);
      n++;
    }
    this.waveTotal += n;
    this.stats.slimes = (this.stats.slimes || 0) + n;
    this.events.push({ type: 'slimeSplit', x: e.x, z: e.z, n, tier: e.tier + 1, id: e.id });
  }

  // Tunnel Mole: walks until it is far enough along, digs in (1), tunnels out of
  // reach (2), climbs out near the town (3) with a band of rats, then walks on (4).
  // Returns true while it is digging, tunnelling or climbing out (no walking).
  _updateMole(e, dt) {
    const D = e.kind.dig;
    if (e.dig === 0) {
      if (e.s < D.at || e.s > D.exit - 6 || e.atGate) return false;
      e.dig = 1; e.digT = D.down;
      road.sample(D.exit, tmp2);
      const ex = tmp2.x + tmp2.nx * e.lat, ez = tmp2.z + tmp2.nz * e.lat;
      const eta = D.down + (D.exit - e.s) / (e.speed * D.speedMul);
      this.events.push({ type: 'digDown', id: e.id, name: e.kind.name, x: e.x, z: e.z, ex, ez, eta });
      return true;
    }
    if (e.dig === 1) {
      if ((e.digT -= dt) <= 0) { e.dig = 2; e.under = true; this.stats.dug = (this.stats.dug || 0) + 1; }
      return true;
    }
    if (e.dig === 2) {
      e.s += e.speed * D.speedMul * (e.slow > 0 ? e.slowMul : 1) * dt;
      if (e.s >= D.exit) {
        e.s = D.exit; e.dig = 3; e.digT = D.up; e.under = false;
        this._placeEnemy(e);
        this._moleRats(e, D.rats);
        this.events.push({ type: 'digUp', id: e.id, name: e.kind.name, x: e.x, z: e.z });
      }
      return true;
    }
    if (e.dig === 3) {
      if ((e.digT -= dt) <= 0) e.dig = 4;
      return true;
    }
    return false;
  }

  // the rats that followed the mole down its tunnel scramble out around it
  _moleRats(e, count) {
    const w = CFG.waves[Math.min(this.waveIndex, CFG.waves.length - 1)], usable = CFG.roadHalfWidth - 0.55, RT = CFG.ratTypes[0];
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (this.enemies.length >= MAX_ENEMIES) break;
      const a = (i / count) * Math.PI * 2;
      const r = this._makeEnemy(T_GRUNT, 0, Math.max(1, Math.round(w.hp * this.hpMul)), clamp(e.lat + Math.cos(a) * 2.2, -usable, usable), e.s + Math.sin(a) * 1.8, RT);
      r.born = 0.45;
      this._placeEnemy(r);
      this.enemies.push(r);
      n++;
    }
    this.waveTotal += n;
    this.stats.moleRats = (this.stats.moleRats || 0) + n;
  }

  // Canyon Buzzard: takes off from the burrow, cruises high over the road
  // dropping rats, then glides down to land in front of the gate.
  _updateFlier(e, dt) {
    const F = e.kind.fly;
    const up = clamp((e.s - CFG.spawnS) / 6, 0, 1), down = clamp((e.gateS - e.s) / F.land, 0, 1);
    e.fly = e.atGate ? 0 : F.h * Math.min(up, Math.sqrt(down));
    if (this.state !== 'wave' || up < 1 || e.gateS - e.s < F.stop) return;
    e.dropT -= dt;
    if (e.dropT > 0) return;
    e.dropT += F.every;
    const w = CFG.waves[Math.min(this.waveIndex, CFG.waves.length - 1)], usable = CFG.roadHalfWidth - 0.55;
    let n = 0;
    for (let i = 0; i < F.n; i++) {
      if (this.enemies.length >= MAX_ENEMIES) break;
      const v = this.rng() < F.fast ? 1 : 0, RT = CFG.ratTypes[v];
      const r = this._makeEnemy(T_GRUNT, v, Math.max(1, Math.round(w.hp * this.hpMul * RT.hpMul)), clamp(e.lat + this.rng.range(-2.4, 2.4), -usable, usable), Math.max(CFG.spawnS, e.s + this.rng.range(-1.2, 1.2)), RT);
      r.fall = r.fallT = 0.55 + this.rng() * 0.2; r.fallH = e.fly;
      this._placeEnemy(r);
      this.enemies.push(r);
      n++;
    }
    this.waveTotal += n;
    this.stats.dropped = (this.stats.dropped || 0) + n;
    this.events.push({ type: 'drop', id: e.id, x: e.x, z: e.z, y: e.fly, n });
  }

  _waveCleared() {
    const bonus = CFG.waveClearBonus(this.waveIndex + 1);
    this.gold += bonus;
    // diamonds for every wave cleared so far that has not paid yet (a skipped wave pays when the merged crowd is cleared)
    let gems = 0;
    for (let i = this.diamondsPaid; i <= this.waveIndex; i++) gems += this.waveDiamonds(i);
    this.diamondsPaid = Math.max(this.diamondsPaid, this.waveIndex + 1);
    this.stats.diamonds = (this.stats.diamonds || 0) + gems;
    this.events.push({ type: 'waveCleared', index: this.waveIndex, bonus, diamonds: gems });
    this.waveIndex++;
    this.bolts.length = 0;
    this.shells.length = 0;
    this.zones.length = 0;
    this.bossAlerts.length = 0;
    for (const t of this.towers) { t.burst = 0; t.storms.length = 0; t.stormT = 0; }
    if (this.waveIndex >= CFG.waves.length) {
      this.state = 'victory';
      const r = this.fortress.hp / this.fortress.maxHp;
      this.stars = r >= 0.8 ? 3 : r >= 0.4 ? 2 : 1;
      this.events.push({ type: 'victory', stars: this.stars });
      return;
    }
    this.state = 'build';
    this.buildTimer = CFG.buildTime;
    this.refreshPads();
    this.events.push({ type: 'checkpoint', kind: 'build' });
  }

  // --------------------------------------------------------------- hero
  _updateHero(dt) {
    const h = this.hero, H = CFG.hero;
    const active = this.state !== 'defeat';
    const speed = H.speed * (this.ride ? CFG.rides[this.ride].speedMul : 1);
    const tx = active ? this.input.x * speed : 0, tz = active ? this.input.z * speed : 0;
    const k = 1 - Math.exp(-14 * dt);
    h.vx += (tx - h.vx) * k; h.vz += (tz - h.vz) * k;
    h.x += h.vx * dt; h.z += h.vz * dt;
    // collisions with structures
    const pushOut = (cx, cz, r) => {
      const dx = h.x - cx, dz = h.z - cz, rr = r + H.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        h.x = cx + (dx / d) * rr; h.z = cz + (dz / d) * rr;
      }
    };
    for (const t of this.towers) pushOut(t.x, t.z, this._towerRadius(t));
    pushOut(this.fortress.x, this.fortress.z, CFG.fortress.radius);
    if (CFG.decor && CFG.decor.tree) pushOut(CFG.decor.tree.x, CFG.decor.tree.z, 0.75);   // Level 2's lone tree
    const oasis = oasisLayout();
    if (oasis) {
      // Level 3: walk round the arch's pillars, the palms and the camels, and stay out of the pool
      for (const o of oasis.solids) pushOut(o.x, o.z, o.r);
      const P = CFG.decor.pond;
      const dx = (h.x - P.x) / P.rx, dz = (h.z - P.z) / P.rz, r = Math.hypot(dx, dz) || 1e-6;
      const lim = pondEdge(P, Math.atan2(dz, dx)) + H.radius / Math.min(P.rx, P.rz);
      if (r < lim) { h.x = P.x + (dx / r) * lim * P.rx; h.z = P.z + (dz / r) * lim * P.rz; }
    }
    for (const hut of CFG.huts) pushOut(hut.x, hut.z, 1.5);
    for (const o of CFG.town.obstacles) pushOut(o.x, o.z, o.r);
    const W = CFG.walk;
    h.x = clamp(h.x, W.minX, W.maxX); h.z = clamp(h.z, W.minZ, W.maxZ);
    const gy = groundHeight(h.x, h.z);
    h.y += (gy - h.y) * Math.min(1, 16 * dt);
    const sp = Math.hypot(h.vx, h.vz);
    h.moving = sp > 0.6;
    if (sp > 0.6) h.facing = Math.atan2(h.vx, h.vz);
    h.collect = Math.max(0, h.collect - dt);
  }

  // ------------------------------------------------------------- enemies
  _placeEnemy(e) {
    road.sample(e.s, tmp);
    e.x = tmp.x + tmp.nx * e.lat;
    e.z = tmp.z + tmp.nz * e.lat;
    e.yaw = Math.atan2(tmp.tx, tmp.tz);
    e.gy = roadY(e.x, e.z);
  }

  _updateEnemies(dt) {
    const f = this.fortress;
    const usable = CFG.roadHalfWidth - 0.4;
    // giants shoulder grunts aside so the crowd flows around them
    const giants = [];
    for (const e of this.enemies) if (e.type !== T_GRUNT && e.alive && !e.under && !(e.fly > AIR)) giants.push(e);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.healed > 0) e.healed -= dt;
      if (e.born > 0) e.born -= dt;
      if (e.broken > 0) e.broken -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.frostT > 0 && (e.frostT -= dt) <= 0) e.frost = 0;   // frost stacks fade
      if (e.frozen > 0) e.frozen -= dt;
      if (e.freezeCd > 0) e.freezeCd -= dt;
      if (e.hitT > 0) e.hitT -= dt;
      if (e.dodgeT > 0) e.dodgeT -= dt;
      if (e.weak > 0) e.weak -= dt;
      if (e.mark > 0) e.mark -= dt;
      if (e.burn > 0) {             // on fire: damage over time
        e.burn -= dt;
        if (this._dot(e, e.burnDps * dt)) continue;
        if (e.burn <= 0) e.burnDps = 0;
      }
      if (e.fall > 0) {            // dropped by the buzzard: still falling
        e.fall -= dt;
        e.flash = Math.max(0, e.flash - dt);
        this._placeEnemy(e);
        continue;
      }
      if (e.stun > 0) {            // stunned: no walking, no attacking
        e.stun -= dt;
        e.flash = Math.max(0, e.flash - dt);
        this._placeEnemy(e);
        continue;
      }
      if (e.held > 0) {            // held back by a Summoner's rat soldier
        e.held -= dt;
        e.flash = Math.max(0, e.flash - dt);
        this._placeEnemy(e);
        continue;
      }
      if (e.kind) {
        if (e.kind.dig && this._updateMole(e, dt)) { e.flash = Math.max(0, e.flash - dt); this._placeEnemy(e); continue; }
        if (e.kind.fly) this._updateFlier(e, dt);
      }
      if (!e.atGate) {
        // a jetpack rat fires its jetpack every few seconds and rockets forward
        let jet = 1;
        if (e.v === JET && e.type === T_GRUNT) {
          const J = CFG.ratTypes[JET].jet;
          if (e.boost > 0) { e.boost -= dt; jet = J.speedMul; }
          if ((e.jetT -= dt) <= 0) {
            e.jetT += J.every; e.boost = J.t; jet = J.speedMul;
            this.stats.jets = (this.stats.jets || 0) + 1;
            this.events.push({ type: 'jet', x: e.x, z: e.z, id: e.id });
          }
        }
        e.s += e.speed * (e.slow > 0 ? e.slowMul : 1) * jet * dt;
        if (e.type === T_GRUNT && giants.length) {
          for (const g of giants) {
            const ds = e.s - g.s; const R = g.radius + 0.35;
            if (ds > -R && ds < R) {
              const dl = e.lat - g.lat;
              if (dl > -R && dl < R) {
                const dir = dl === 0 ? (e.id & 1 ? 1 : -1) : Math.sign(dl);
                e.lat = clamp(e.lat + dir * 3.2 * dt, -usable, usable);
                if (Math.abs(e.lat) >= usable - 0.01) e.s -= e.speed * dt * 0.6; // squeezed: slow down
              }
            }
          }
        }
        if (e.s >= e.gateS) {
          e.s = e.gateS; e.atGate = true;
          e.attackT = this.rng() * 0.8;
        }
      } else if (this.state === 'wave') {
        e.attackT -= dt;
        if (e.attackT <= 0) {
          const kind = this._kindOf(e);
          e.attackT += kind.gateRate || CFG.grunt.gateRate;
          f.hp = Math.max(0, f.hp - kind.gateDmg);
          f.flash = 0.15; f.underAttack = 2.5;
          this.stats.leaked += kind.gateDmg;
          this._repairDirty = true;
          if (this.time - f.lastHit > 0.22) { this.events.push({ type: 'fortressHit', x: f.x, z: f.z }); f.lastHit = this.time; }
          if (--e.swings <= 0) {
            e.alive = false;
            this.waveKilled++;
            this.events.push({ type: 'spent', x: e.x, z: e.z, kind: e.type, v: e.v, id: e.id, yaw: e.yaw, sh: e.shield > 0 });
          }
          if (f.hp <= 0 && this.state === 'wave') {
            this.state = 'defeat';
            this.events.push({ type: 'defeat' });
          }
        }
      }
      e.flash = Math.max(0, e.flash - dt);
      this._placeEnemy(e);
    }
  }

  _buildGrid() {
    const cnt = this.cellCount, start = this.cellStart, items = this.cellItems;
    cnt.fill(0);
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.under) { e.cell = -1; continue; }   // tunnelling: out of reach of everything
      const cx = clamp(Math.floor((e.x - GRID_MIN_X) / CELL), 0, GW - 1);
      const cz = clamp(Math.floor((e.z - GRID_MIN_Z) / CELL), 0, GH - 1);
      e.cell = cz * GW + cx;
      cnt[e.cell]++;
    }
    let acc = 0;
    for (let c = 0; c < GW * GH; c++) { start[c] = acc; acc += cnt[c]; cnt[c] = start[c]; }
    start[GW * GH] = acc;
    for (let i = 0; i < es.length; i++) if (es[i].cell >= 0) items[cnt[es[i].cell]++] = i;
  }

  // Calls fn(enemy) for enemies in cells overlapping the box.
  _query(x0, z0, x1, z1, fn) {
    const cx0 = clamp(Math.floor((x0 - GRID_MIN_X) / CELL), 0, GW - 1), cx1 = clamp(Math.floor((x1 - GRID_MIN_X) / CELL), 0, GW - 1);
    const cz0 = clamp(Math.floor((z0 - GRID_MIN_Z) / CELL), 0, GH - 1), cz1 = clamp(Math.floor((z1 - GRID_MIN_Z) / CELL), 0, GH - 1);
    const start = this.cellStart, items = this.cellItems, es = this.enemies;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cz * GW + cx;
        for (let k = start[c], e = start[c + 1]; k < e; k++) {
          if (fn(es[items[k]]) === true) return;
        }
      }
    }
  }

  _kill(e) {
    if (!e.alive) return;
    e.alive = false;
    this.waveKilled++;
    this.stats.kills++;
    const gy = 0;
    if (e.type === T_GRUNT) {
      const n = Math.max(0, (CFG.waves[Math.min(this.waveIndex, CFG.waves.length - 1)].coins || 1) + CFG.ratTypes[e.v].coins);
      for (let i = 0; i < n; i++) this._dropCoin(e.x, e.z, gy, CFG.grunt.coins, 2.2);
    } else {
      this.stats.giants++;
      const n = e.kind && e.kind.coins != null ? e.kind.coins : giantCoins(e.maxHp, e.type === T_BOSS);
      for (let i = 0; i < n; i++) this._dropCoin(e.x, e.z, gy + 1.2 + e.fly, 1, e.type === T_BOSS ? 6 : 4.5);
    }
    this.events.push({ type: 'death', x: e.x, z: e.z, kind: e.type, v: e.v, id: e.id, yaw: e.yaw, dir: e.id & 1 ? 1 : -1, sh: e.shield > 0, boss: e.boss, tier: e.tier, fly: e.fly });
    if (e.type === T_GRUNT && CFG.ratTypes[e.v].split) this._split(e, CFG.ratTypes[e.v].split);
    if (e.type === T_GRUNT && CFG.ratTypes[e.v].bomb) this._bombBlast(e);
    if (e.boss === 'slime' && e.tier < CFG.bosses.slime.split.tiers.length) this._slimeSplit(e);
  }

  // All damage goes through here: armour bonus vs giants, Nova armour break.
  _damage(e, amount, armorMul = 1) {
    if (!e.alive) return false;
    let d = amount;
    if (e.type !== T_GRUNT || e.armor > 0) d *= armorMul;   // armour bonuses hit giant and armored rats
    if (e.broken > 0) d *= CFG.cannon.breakMul;
    if (e.weak > 0) d *= WEAK_MUL;
    if (e.mark > 0) d *= WEAK_MUL;
    e.hp -= d;
    e.flash = 0.09;
    e.hitT = CFG.hitFlinch;
    if (e.hp <= 0) { this._kill(e); return true; }
    return false;
  }

  // Damage over time (burning): no flinch or flash, but every weakness counts.
  _dot(e, amount) {
    if (!e.alive) return true;
    let d = amount;
    if (e.broken > 0) d *= CFG.cannon.breakMul;
    if (e.weak > 0) d *= WEAK_MUL;
    if (e.mark > 0) d *= WEAK_MUL;
    e.hp -= d;
    if (e.hp <= 0) { this._kill(e); return true; }
    return false;
  }

  _compact() {
    const es = this.enemies;
    let j = 0;
    for (let i = 0; i < es.length; i++) if (es[i].alive) es[j++] = es[i];
    es.length = j;
    const bs = this.bolts;
    j = 0;
    for (let i = 0; i < bs.length; i++) if (bs[i].alive) bs[j++] = bs[i];
    bs.length = j;
    const ss = this.shells;
    j = 0;
    for (let i = 0; i < ss.length; i++) if (ss[i].alive) ss[j++] = ss[i];
    ss.length = j;
  }

  // -------------------------------------------------------------- towers
  _towerRadius(t) { return t.kind === 'cannon' ? CFG.cannon.radii[t.level] : isArsenal(t.kind) ? 1.05 + t.level * 0.08 : CFG.towerRadii[t.level]; }

  _placeTower(slot, level, silent, kind = 'crossbow') {
    // face the road initially
    let best = 1e9, bx = 0, bz = 0;
    for (let i = 0; i < road.count; i += 3) {
      const d = (road.px[i] - slot.x) ** 2 + (road.pz[i] - slot.z) ** 2;
      if (d < best) { best = d; bx = road.px[i]; bz = road.pz[i]; }
    }
    const t = {
      slotIndex: slot.index, level, x: slot.x, z: slot.z, y: slot.y,
      yaw: Math.atan2(bx - slot.x, bz - slot.z), cooldown: 0.4, target: null, retarget: 0,
      recoil: 0, side: 0, builtAt: silent ? -10 : this.time, fired: 0,
      kind, charge: 0, pending: [], aim: null, sideFlip: 0, path: null, salvoT: 0,
      burst: 0, burstT: 0, stormT: 0, storms: [], alt: 0,
      rateMul: 1, dmgMul: 1, rangeMul: 1, buff: 0, tick: 0, roarT: 0, firing: false, fields: null, spots: null, rally: null,
    };
    slot.tower = t;
    this.towers.push(t);
    return t;
  }

  // The front-most enemy in range; a flier in range comes first (crossbows are
  // the only towers that can reach it, so they make it their target).
  _findTarget(t, range, ground = false) {
    let best = null, bestS = -1, flier = null;
    const r2 = range * range;
    this._query(t.x - range, t.z - range, t.x + range, t.z + range, (e) => {
      if (!e.alive || (ground && e.fly > AIR)) return;
      const dx = e.x - t.x, dz = e.z - t.z;
      if (dx * dx + dz * dz > r2) return;
      if (e.fly > AIR && (!flier || e.s > flier.s)) flier = e;
      if (e.s > bestS) { bestS = e.s; best = e; }
    });
    return flier || best;
  }

  _updateTowers(dt) {
    this._applyAuras(dt);
    for (const t of this.towers) {
      if (t.kind === 'cannon') { this._updateCannon(t, dt); continue; }
      if (isArsenal(t.kind)) { this._updateArsenal(t, dt); continue; }
      const L = CFG.towers[t.level];
      const range = L.range * t.rangeMul;
      t.cooldown -= dt * t.rateMul;
      t.recoil = Math.max(0, t.recoil - dt * 4);
      t.retarget -= dt;
      if (L.storm) this._updateStorm(t, L, dt * t.rateMul);
      let tg = t.target;
      if (tg && (!tg.alive || tg.under || (tg.x - t.x) ** 2 + (tg.z - t.z) ** 2 > (range + 0.6) ** 2)) tg = null;
      if (!tg || t.retarget <= 0) { tg = this._findTarget(t, range); t.retarget = 0.15; }
      t.target = tg;
      if (!tg) { t.burst = 0; continue; }
      const aim = this._aimAt(tg, t.x, t.z);
      const want = Math.atan2(aim.x - t.x, aim.z - t.z);
      const d = angDiff(t.yaw, want);
      const turn = L.turn * dt;
      t.yaw += Math.abs(d) <= turn ? d : Math.sign(d) * turn;
      const aligned = Math.abs(angDiff(t.yaw, want)) < 0.2;
      // Triple Barrage: the rapid burst after every fifth attack
      if (t.burst > 0) {
        t.burstT -= dt * t.rateMul;
        if (t.burstT <= 0 && aligned) { t.burst--; t.burstT = L.burst.gap; t.recoil = 1; this._fire(t, L, tg, true); }
        continue;
      }
      if (aligned && t.cooldown <= 0) {
        t.cooldown = L.interval;
        t.recoil = 1;
        t.fired++;
        this._fire(t, L, tg, false);
        if (L.burst && t.fired % L.burst.every === 0) {
          t.burst = L.burst.volleys; t.burstT = L.burst.gap;
          this.events.push({ type: 'burst', x: t.x, z: t.z, slot: t.slotIndex, level: t.level });
        }
      }
    }
  }

  // Where to shoot so an arrow from (ox, oz) meets the enemy.
  _aimAt(e, ox, oz) {
    let ax = e.x, az = e.z;
    if (!holding(e)) {
      const sp = e.speed * (e.slow > 0 ? e.slowMul : 1);
      for (let it = 0; it < 2; it++) {
        const flight = Math.hypot(ax - ox, az - oz) / CFG.boltSpeed;
        road.sample(e.s + sp * flight, tmp2);
        ax = tmp2.x + tmp2.nx * e.lat; az = tmp2.z + tmp2.nz * e.lat;
      }
    }
    aimOut.x = ax; aimOut.z = az;
    return aimOut;
  }

  // The n front-most enemies in range other than `primary`, front first.
  // A healer rat in range always goes first: twin and triple crossbows hunt healers.
  _extraTargets(t, range, primary, n) {
    const out = extraBuf;
    out.length = 0;
    const r2 = range * range;
    let healer = null;
    this._query(t.x - range, t.z - range, t.x + range, t.z + range, (e) => {
      if (!e.alive || e === primary) return;
      const dx = e.x - t.x, dz = e.z - t.z;
      if (dx * dx + dz * dz > r2) return;
      if (e.v === HEALER && e.type === T_GRUNT && (!healer || e.s > healer.s)) healer = e;
      if (out.length < n) out.push(e);
      else if (e.s > out[out.length - 1].s) out[out.length - 1] = e;
      else return;
      for (let i = out.length - 1; i > 0 && out[i - 1].s < out[i].s; i--) { const q = out[i - 1]; out[i - 1] = out[i]; out[i] = q; }
    });
    if (healer && out[0] !== healer) {
      const i = out.indexOf(healer);
      if (i > 0) out.splice(i, 1);
      out.unshift(healer);
      if (out.length > n) out.length = n;
    }
    return out;
  }

  // One volley. Twin / triple crossbows split their arrows between the
  // front rat and the next ones; against a giant every arrow focuses it.
  _fire(t, L, tg, burst) {
    const n = L.bolts;
    const ars = isArsenal(t.kind);
    const mh = ars ? arsMuzzle(t) : CFG.muzzleHeight[t.level];
    const spread = L.twin && tg.type === T_GRUNT;
    const extra = spread ? this._extraTargets(t, L.range * t.rangeMul, tg, Math.max(1, n - 1)) : null;
    let single = tg;
    if (n === 1 && spread) { t.alt ^= 1; if (t.alt && extra.length) single = extra[0]; }   // magazine alternates rats
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2);
      let e = n === 1 ? single : tg;
      if (n > 1 && spread) {
        const k = n === 2 ? i - 1 : i === 0 ? 0 : i === 2 ? 1 : -1;   // which extra rat this arrow takes (-1 = main)
        if (k >= 0 && extra[k]) e = extra[k];
      }
      // side-by-side muzzles for double / triple crossbows
      const lat = off * (n === 2 ? 2 : 1) * (L.lateral || 0);
      const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
      const ox = t.x + fx * 1.0 + Math.cos(t.yaw) * lat, oz = t.z + fz * 1.0 - Math.sin(t.yaw) * lat;
      const aim = this._aimAt(e, ox, oz);
      let dx = aim.x - ox, dz = aim.z - oz;
      let dist = Math.hypot(dx, dz);
      if (dist < 0.3) { dx = fx; dz = fz; dist = 0.3; } else { dx /= dist; dz /= dist; }
      if (e === tg && n > 1 && !spread) {
        // focusing one rat: fan the arrows a touch so they read as separate shots
        const yaw = Math.atan2(dx, dz) + off * (L.spread || 0.05) * 0.5;
        dx = Math.sin(yaw); dz = Math.cos(yaw);
      }
      this.bolts.push({
        x: ox, z: oz, y: t.y + mh, y0: t.y + mh, y1: hitY(e), dx, dz,
        d: 0, aim: Math.max(1, dist - 0.4), max: dist + CFG.boltExtra,
        dmg: L.dmg * t.dmgMul, pierce: L.pierce || 1, hits: [], alive: true, level: t.level,
        bounces: L.bounce ? L.bounce.n : 0, fall: false, tid: e.id, spec: ars ? L : null, kind: t.kind,
        air: e.fly > AIR,   // aimed up at a flier: passes over the rats on the road (and the other way round)
      });
    }
    this.events.push({ type: 'fire', tower: t.kind, x: t.x, z: t.z, level: t.level, slot: t.slotIndex, burst, ax: tg.x, az: tg.z, tid: tg.id });
  }

  // Crystal Storm: every few seconds a rain of crystal arrows falls on the
  // densest group in range.
  _updateStorm(t, L, dt) {
    const S = L.storm;
    for (let i = t.storms.length - 1; i >= 0; i--) {
      const a = t.storms[i];
      a.delay -= dt;
      if (a.delay > 0) continue;
      t.storms.splice(i, 1);
      const dx = a.x - t.x, dz = a.z - t.z, l = Math.hypot(dx, dz) || 1;
      this.bolts.push({
        x: a.x, z: a.z, y: S.height, y0: S.height, y1: 0.4 + roadY(a.x, a.z), dx: dx / l, dz: dz / l,
        d: 0, aim: 1, max: 99, dmg: S.dmg * t.dmgMul, pierce: 1, hits: [], alive: true, level: t.level,
        bounces: 0, fall: true, air: false, spec: isArsenal(t.kind) ? L : null, kind: t.kind,
      });
    }
    t.stormT = Math.min(S.every, t.stormT + dt);
    if (t.stormT < S.every || t.storms.length) return;
    const c = this._findCluster(t, L.range * t.rangeMul, 2.4, null);
    if (!c) return;
    t.stormT = 0;
    for (let i = 0; i < S.arrows; i++) {
      const r = S.radius * Math.sqrt(this.rng()), a = this.rng() * Math.PI * 2;
      t.storms.push({ delay: (i / S.arrows) * S.spawn, x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r });
    }
    this.events.push({ type: 'storm', x: c.x, z: c.z, r: S.radius, slot: t.slotIndex, tx: t.x, tz: t.z, time: S.spawn + S.height / S.speed });
  }

  // ------------------------------------------------------------ the Arsenal
  // Berserker Totems and Time Warps boost the towers around them: damage
  // (dmgMul), attack speed (rateMul) and reach (rangeMul). The strongest
  // totem and the strongest warp in reach count; the two stack.
  _applyAuras(dt) {
    const ts = this.towers;
    for (const t of ts) { t.rateMul = 1; t.dmgMul = 1; t.rangeMul = 1; t.buff = 0; t.bRate = 0; t.bHaste = 0; }
    for (const a of ts) {
      if (a.kind !== 'totem' && a.kind !== 'warp') continue;
      const L = arsenalSpec(a.kind, a.level), R2 = L.r * L.r;
      let k = 1;
      if (a.kind === 'totem' && L.roar) {
        // Battle Roar: every few seconds of battle, double boosts for a while
        if (a.roarT > 0) { a.roarT -= dt; k = 2; }
        else if (this.state === 'wave' && (a.stormT += dt) >= L.roar.every) {
          a.stormT = 0; a.roarT = L.roar.t; k = 2;
          this.events.push({ type: 'roar', slot: a.slotIndex, x: a.x, z: a.z, r: L.r });
        }
      }
      for (const t of ts) {
        if (t === a || t.kind === 'totem' || t.kind === 'warp') continue;
        if ((t.x - a.x) ** 2 + (t.z - a.z) ** 2 > R2) continue;
        if (a.kind === 'totem') {
          t.dmgMul = Math.max(t.dmgMul, 1 + L.dmg * k);
          t.bRate = Math.max(t.bRate, L.rate * k);
          t.rangeMul = Math.max(t.rangeMul, 1 + L.reach * k);
          t.buff |= k > 1 ? 5 : 1;
        } else { t.bHaste = Math.max(t.bHaste, L.haste); t.buff |= 2; }
      }
    }
    for (const t of ts) if (t.buff) t.rateMul = (1 + t.bRate) * (1 + t.bHaste);
  }

  _updateArsenal(t, dt) {
    const L = arsenalSpec(t.kind, t.level);
    t.cooldown -= dt * t.rateMul;
    t.recoil = Math.max(0, t.recoil - dt * 3);
    switch (t.kind) {
      case 'spike': this._updateSpike(t, L, dt); break;
      case 'mine': this._updateMineTower(t, L, dt); break;
      case 'ice': case 'crystal': this._updateBolter(t, L, dt); break;
      case 'poison': case 'mortar': this._updateLobber(t, L, dt); break;
      case 'flame': this._updateFlame(t, L, dt); break;
      case 'sniper': this._updateSniper(t, L, dt); break;
      case 'tesla': this._updateTesla(t, L, dt); break;
      case 'rocket': this._updateRocketTower(t, L, dt); break;
      case 'summoner': this._updateSummoner(t, L, dt); break;
      case 'warp': this._updateWarp(t, L, dt); break;
      default: break;   // the totem only boosts (_applyAuras)
    }
  }

  // Turn a turret toward its rat. Returns the rat once the head faces it.
  // ground: only rats on the ground · tough: the rat with the most health.
  _turret(t, L, dt, ground, tough = false) {
    const R = L.range * t.rangeMul;
    t.retarget -= dt;
    let tg = t.target;
    if (tg && (!tg.alive || tg.under || (ground && tg.fly > AIR) || (tg.x - t.x) ** 2 + (tg.z - t.z) ** 2 > (R + 0.6) ** 2)) tg = null;
    if (!tg || t.retarget <= 0) { tg = tough ? this._toughest(t, R, ground) : this._findTarget(t, R, ground); t.retarget = tough ? 0.4 : 0.15; }
    t.target = tg;
    if (!tg) return null;
    const want = Math.atan2(tg.x - t.x, tg.z - t.z);
    const d = angDiff(t.yaw, want), turn = (L.turn || 6) * dt;
    t.yaw += Math.abs(d) <= turn ? d : Math.sign(d) * turn;
    return Math.abs(angDiff(t.yaw, want)) < 0.2 ? tg : null;
  }

  // The rat with the most health in range (the front-most on a tie).
  _toughest(t, R, ground) {
    let best = null, hp = -1;
    const r2 = R * R;
    this._query(t.x - R, t.z - R, t.x + R, t.z + R, (e) => {
      if (!e.alive || (ground && e.fly > AIR) || (e.x - t.x) ** 2 + (e.z - t.z) ** 2 > r2) return;
      if (e.hp > hp || (e.hp === hp && e.s > best.s)) { hp = e.hp; best = e; }
    });
    return best;
  }

  _nearestEnemy(x, z, R) {
    let best = null, bd = R * R;
    this._query(x - R, z - R, x + R, z + R, (e) => {
      if (!e.alive) return;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }

  // Road positions (s) within R of a tower.
  _roadSpots(t, R) {
    const out = [], R2 = R * R;
    for (let i = 0; i < road.count; i++) if ((road.px[i] - t.x) ** 2 + (road.pz[i] - t.z) ** 2 <= R2) out.push(i * road.step);
    return out;
  }
  _nearestRoadS(t) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < road.count; i++) {
      const d = (road.px[i] - t.x) ** 2 + (road.pz[i] - t.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return bi * road.step;
  }

  // ---- Ice and Crystal Storm towers: bolts (with frost) like the crossbow's
  _updateBolter(t, L, dt) {
    if (L.storm) this._updateStorm(t, L, dt * t.rateMul);
    if (L.blizzard) t.stormT = Math.min(L.blizzard.every, t.stormT + dt * t.rateMul);
    const tg = this._turret(t, L, dt, false);
    if (!tg) return;
    if (t.cooldown <= 0) {
      t.cooldown = L.interval;
      t.recoil = 1;
      t.fired++;
      this._fire(t, L, tg, false);
    }
    if (L.blizzard && t.stormT >= L.blizzard.every) { t.stormT = 0; this._blizzard(t, L, tg); }
  }

  // Ice Tower's Blizzard: every rat around the target freezes (bosses only slow).
  _blizzard(t, L, tg) {
    const B = L.blizzard, F = L.frost, R = B.r, R2 = R * R;
    let n = 0;
    this._query(tg.x - R, tg.z - R, tg.x + R, tg.z + R, (e) => {
      if (!e.alive || (e.x - tg.x) ** 2 + (e.z - tg.z) ** 2 > R2) return;
      e.slowMul = e.slow > 0 ? Math.min(e.slowMul, 1 - F.slow) : 1 - F.slow;
      e.slow = Math.max(e.slow, F.t);
      if (e.type === T_BOSS) return;
      const ft = e.type === T_GRUNT ? B.freeze : F.giantFreeze;
      e.frozen = Math.max(e.frozen, ft);
      e.stun = Math.max(e.stun, ft);
      e.frost = 0;
      n++;
    });
    this.stats.frozen = (this.stats.frozen || 0) + n;
    this.events.push({ type: 'blizzard', x: tg.x, z: tg.z, r: R, slot: t.slotIndex, n });
  }

  // ---- Mortar and Poison Gas towers: lobbed shells at the densest group
  _updateLobber(t, L, dt) {
    const gas = t.kind === 'poison';
    for (let i = t.pending.length - 1; i >= 0; i--) {
      const p = t.pending[i];
      p.delay -= dt;
      if (p.delay <= 0) { this._lob(t, p.pt, L, p.kind, p.lateral, !gas); t.pending.splice(i, 1); }
    }
    const R = L.range * t.rangeMul, rad = gas ? L.cloud.r : L.radius;
    t.retarget -= dt;
    if (t.aim && (!t.aim.e.alive || t.aim.e.under || t.aim.e.fly > AIR)) t.aim = null;
    if (!t.aim || t.retarget <= 0) { t.aim = this._findCluster(t, R, rad, null); t.retarget = 0.3; }
    if (!t.aim) return;
    const aim = this._lead(t.aim.e, t.x, t.z);
    const want = Math.atan2(aim.x - t.x, aim.z - t.z);
    const d = angDiff(t.yaw, want), turn = L.turn * dt;
    t.yaw += Math.abs(d) <= turn ? d : Math.sign(d) * turn;
    if (Math.abs(angDiff(t.yaw, want)) > 0.25 || t.cooldown > 0) return;
    t.cooldown = L.interval;
    t.recoil = 1;
    t.fired++;
    if (gas) { this._lob(t, aim, L, 'gas', 0, false); return; }
    const pts = [aim];
    if (L.shells === 3) {
      // Shell Rain: two more shells along the road around the target group
      const e = aim.e;
      for (const ds of [L.spread, -L.spread]) {
        road.sample(Math.max(0, e.s + ds + (e.atGate ? 0 : e.speed * 0.6)), tmp2);
        pts.push({ x: tmp2.x + tmp2.nx * e.lat, z: tmp2.z + tmp2.nz * e.lat, e });
      }
    }
    for (let i = 0; i < pts.length; i++) t.pending.push({ delay: i * (L.gap || 0), pt: pts[i], lateral: 0, kind: 'mortar' });
  }

  _lob(t, pt, L, kind, lateral, heavy) {
    const yaw = t.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ox = t.x + fx * 0.7 + Math.cos(yaw) * lateral, oz = t.z + fz * 0.7 - Math.sin(yaw) * lateral;
    const oy = t.y + arsMuzzle(t) + 0.2;
    const dist = Math.hypot(pt.x - ox, pt.z - oz);
    const T = Math.max(0.35, dist / CFG.cannon.shellSpeed) * (heavy ? 1.2 : 1);
    const h = heavy ? 2.8 + dist * 0.2 : 1.6 + dist * 0.12;
    this.shells.push({
      x0: ox, y0: oy, z0: oz, tx: pt.x, tz: pt.z, ty: 0.3 + roadY(pt.x, pt.z), t: 0, T, h,
      r: kind === 'gas' ? L.cloud.r : L.radius, dmg: L.dmg || 0, x: ox, y: oy, z: oz,
      level: t.level, path: null, spec: L, kind, tower: t.kind, alive: true, mul: t.dmgMul,
    });
    this.events.push({ type: 'fire', tower: t.kind, kind, x: t.x, z: t.z, level: t.level, slot: t.slotIndex, ax: pt.x, az: pt.z });
  }

  // A gas canister lands: a poison cloud (see _updateZones).
  _gasLand(s) {
    const C = s.spec.cloud;
    this.zones.push({ x: s.tx, z: s.tz, r: C.r, t: C.t, max: C.t, dps: C.dps * (s.mul || 1), tick: 0, gas: true, weak: !!C.weak, slow: C.slow || 0 });
    this.events.push({ type: 'gas', x: s.tx, z: s.tz, r: C.r, level: s.level });
  }

  // ---- Flamethrower: a cone of fire, every 0.2 s, at every rat in front
  _updateFlame(t, L, dt) {
    if (L.inferno) t.stormT = Math.min(L.inferno.every, t.stormT + dt * t.rateMul);
    this._turret(t, L, dt, true);
    const R = L.range * t.rangeMul, tg = t.target;
    t.firing = !!tg && (tg.x - t.x) ** 2 + (tg.z - t.z) ** 2 <= R * R && Math.abs(angDiff(t.yaw, Math.atan2(tg.x - t.x, tg.z - t.z))) < L.arc + 0.3;
    if (!t.firing) return;
    t.tick -= dt * t.rateMul;
    if (t.tick > 0) return;
    t.tick = 0.2;
    const dmg = L.dps * 0.2 * t.dmgMul, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), cosA = Math.cos(L.arc), R2 = R * R;
    let hits = 0;
    this._query(t.x - R, t.z - R, t.x + R, t.z + R, (e) => {
      if (!e.alive || e.fly > AIR) return;
      const dx = e.x - t.x, dz = e.z - t.z, d2 = dx * dx + dz * dz;
      if (d2 > R2) return;
      const d = Math.sqrt(d2) || 0.01;
      if ((dx * fx + dz * fz) / d < cosA && d > e.radius + 0.8) return;   // outside the cone
      hits++;
      if (this._damage(e, dmg, 1)) return;
      e.burn = Math.max(e.burn, L.burn.t);
      e.burnDps = Math.max(e.burnDps, L.burn.dps * t.dmgMul);
      if (L.weak) e.weak = Math.max(e.weak, 2);
    });
    if (hits) this.stats.burned = (this.stats.burned || 0) + hits;
    if (L.inferno && t.stormT >= L.inferno.every) {
      // Inferno Zone: the road catches fire where the crowd is thickest
      const c = this._findCluster(t, R + 2, L.inferno.r, null);
      if (c) {
        t.stormT = 0;
        this.zones.push({ x: c.x, z: c.z, r: L.inferno.r, t: L.inferno.t, max: L.inferno.t, dps: L.inferno.dps * t.dmgMul, tick: 0 });
        this.events.push({ type: 'inferno', x: c.x, z: c.z, r: L.inferno.r, slot: t.slotIndex });
      }
    }
  }

  // ---- Sniper: one huge shot at the toughest rat in reach
  _updateSniper(t, L, dt) {
    const tg = this._turret(t, L, dt, false, true);
    if (!tg || t.cooldown > 0) return;
    t.cooldown = L.interval;
    t.recoil = 1;
    t.fired++;
    const head = this.rng() < L.head.chance;
    const dmg = L.dmg * (head ? L.head.mul : 1) * t.dmgMul;
    let dx = tg.x - t.x, dz = tg.z - t.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist; dz /= dist;
    let ex = tg.x, ez = tg.z, ey = hitY(tg);
    const behind = [];
    if (L.through) {
      // Penetrator: the bullet flies on through the rats behind the target
      const X = 7;
      this._query(Math.min(tg.x, tg.x + dx * X) - 1, Math.min(tg.z, tg.z + dz * X) - 1, Math.max(tg.x, tg.x + dx * X) + 1, Math.max(tg.z, tg.z + dz * X) + 1, (e) => {
        if (!e.alive || e === tg || (e.fly > AIR) !== (tg.fly > AIR)) return;
        const ux = e.x - tg.x, uz = e.z - tg.z, u = ux * dx + uz * dz;
        if (u <= 0 || u > X) return;
        const px = ux - dx * u, pz = uz - dz * u;
        if (px * px + pz * pz <= (e.radius + 0.25) ** 2) behind.push([u, e]);
      });
      behind.sort((a, b) => a[0] - b[0]);
    }
    this._sniperHit(tg, dmg, L);
    for (let i = 0; i < Math.min(L.through || 0, behind.length); i++) {
      const e = behind[i][1];
      ex = e.x; ez = e.z; ey = hitY(e);
      this._sniperHit(e, dmg * 0.6, L);
    }
    if (head) this.stats.headshots = (this.stats.headshots || 0) + 1;
    const mh = arsMuzzle(t);
    this.events.push({ type: 'snipe', slot: t.slotIndex, x: t.x + dx * 1.3, y: t.y + mh + 0.15, z: t.z + dz * 1.3, tx: ex, ty: ey, tz: ez, head, level: t.level, id: tg.id });
  }
  _sniperHit(e, dmg, L) {
    if (!e.alive) return;
    if (e.type !== T_GRUNT) this.events.push({ type: 'hit', x: e.x, z: e.z, y: e.fly > 0 ? e.fly + 1.2 : e.type === T_BOSS ? 2.6 : 1.9, giant: true, id: e.id });
    if (e.shield > 0) { this._shieldHit(e, dmg, L); return; }
    let mul = 1;
    if (e.armor > 0 && !(e.broken > 0)) mul = 1 - e.armor * (1 - (L.armorPierce || 0));
    if (this._damage(e, dmg, mul)) return;
    if (L.mark) e.mark = Math.max(e.mark, L.mark);
  }

  // ---- Tesla: lightning that jumps from rat to rat
  _updateTesla(t, L, dt) {
    if (L.overload) t.stormT = Math.min(L.overload.every, t.stormT + dt * t.rateMul);
    const R = L.range * t.rangeMul;
    t.retarget -= dt;
    let tg = t.target;
    if (tg && (!tg.alive || tg.under || (tg.x - t.x) ** 2 + (tg.z - t.z) ** 2 > (R + 0.6) ** 2)) tg = null;
    if (!tg || t.retarget <= 0) { tg = this._findTarget(t, R); t.retarget = 0.15; }
    t.target = tg;
    t.yaw += dt * (tg ? 3 : 0.6);   // the coil spins faster when it has a rat to strike
    if (!tg) return;
    const top = t.y + arsMuzzle(t) + 0.75;
    const zapMul = (e) => (e.armor > 0 ? 1 - e.armor * 0.5 : 1);   // lightning goes round most armour
    if (L.overload && t.stormT >= L.overload.every) {
      // Overload: a blast of lightning at every rat in range
      t.stormT = 0;
      const O = L.overload, R2 = R * R, pts = [];
      this._query(t.x - R, t.z - R, t.x + R, t.z + R, (e) => {
        if (!e.alive || (e.x - t.x) ** 2 + (e.z - t.z) ** 2 > R2) return;
        if (pts.length < 48) pts.push(e.x, hitY(e), e.z);
        if (this._damage(e, O.dmg * t.dmgMul, zapMul(e))) return;
        if (e.type === T_GRUNT) e.stun = Math.max(e.stun, O.stun);
      });
      this.events.push({ type: 'overload', slot: t.slotIndex, x: t.x, y: top, z: t.z, r: R, pts });
    }
    if (t.cooldown > 0) return;
    t.cooldown = L.interval;
    t.recoil = 1;
    t.fired++;
    const pts = [t.x, top, t.z], hit = [tg];
    let cur = tg, dmg = L.dmg * t.dmgMul;
    for (let i = 0; i < L.chain; i++) {
      pts.push(cur.x, hitY(cur), cur.z);
      if (!this._damage(cur, dmg, zapMul(cur)) && L.stun && cur.type === T_GRUNT) cur.stun = Math.max(cur.stun, L.stun);
      if (i === L.chain - 1) break;
      let best = null, bd = L.jump * L.jump;
      const J = L.jump, c = cur;
      this._query(c.x - J, c.z - J, c.x + J, c.z + J, (e) => {
        if (!e.alive || hit.includes(e)) return;
        const d2 = (e.x - c.x) ** 2 + (e.z - c.z) ** 2;
        if (d2 < bd) { bd = d2; best = e; }
      });
      if (!best) break;
      hit.push(best);
      cur = best;
      dmg *= L.falloff;
    }
    this.stats.zapped = (this.stats.zapped || 0) + hit.length;
    this.events.push({ type: 'zap', slot: t.slotIndex, pts, level: t.level });
  }

  // ---- Rocket Tower: homing rockets
  _updateRocketTower(t, L, dt) {
    const tg = this._turret(t, L, dt, false, L.rockets >= 3);
    if (!tg || t.cooldown > 0) return;
    t.cooldown = L.interval;
    t.recoil = 1;
    t.fired++;
    let targets = [tg];
    if (L.rockets > 1) {
      if (L.rockets >= 3) {
        // Missile Barrage: the toughest rats in range
        const R = L.range * t.rangeMul, R2 = R * R, all = [];
        this._query(t.x - R, t.z - R, t.x + R, t.z + R, (e) => { if (e.alive && e !== tg && (e.x - t.x) ** 2 + (e.z - t.z) ** 2 <= R2) all.push(e); });
        all.sort((a, b) => b.hp - a.hp);
        targets = [tg, ...all.slice(0, L.rockets - 1)];
      } else targets = [tg, ...this._extraTargets(t, L.range * t.rangeMul, tg, L.rockets - 1)];
    }
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    for (let i = 0; i < L.rockets; i++) {
      const e = targets[i % targets.length];
      const side = L.rockets === 1 ? 0 : (i - (L.rockets - 1) / 2) * 0.42;
      const x = t.x + fx * 0.5 + fz * side, z = t.z + fz * 0.5 - fx * side, y = t.y + arsMuzzle(t) + 0.35;
      this.rockets.push({ x, y, z, vx: fx * L.speed * 0.6, vy: L.speed * 0.45, vz: fz * L.speed * 0.6, speed: L.speed, e, dmg: L.dmg * t.dmgMul, r: L.r, life: 5, age: 0, delay: i * 0.12, alive: true, level: t.level, slot: t.slotIndex });
    }
    this.events.push({ type: 'fire', tower: 'rocket', x: t.x, z: t.z, level: t.level, slot: t.slotIndex, n: L.rockets, ax: tg.x, az: tg.z });
  }

  _updateRockets(dt) {
    const rs = this.rockets;
    let j = 0;
    for (const r of rs) {
      if (r.delay > 0) { r.delay -= dt; rs[j++] = r; continue; }
      r.age += dt; r.life -= dt;
      let e = r.e;
      if (!e || !e.alive || e.under) e = r.e = this._nearestEnemy(r.x, r.z, 7);
      let tx, ty, tz;
      if (e) { tx = e.x; tz = e.z; ty = hitY(e); } else { tx = r.x + r.vx; tz = r.z + r.vz; ty = r.y - 6; }
      const dx = tx - r.x, dy = ty - r.y, dz = tz - r.z;
      const d = Math.hypot(dx, dy, dz) || 0.001;
      // a short climb out of the tube, then it turns hard onto its rat
      const k = Math.min(1, dt * (r.age < 0.3 ? 2.5 : 8));
      r.vx += ((dx / d) * r.speed - r.vx) * k; r.vy += ((dy / d) * r.speed - r.vy) * k; r.vz += ((dz / d) * r.speed - r.vz) * k;
      const v = Math.hypot(r.vx, r.vy, r.vz) || 1;
      r.vx *= r.speed / v; r.vy *= r.speed / v; r.vz *= r.speed / v;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      const gy = roadY(r.x, r.z);
      if ((e && d < 0.55 + e.radius * 0.6) || r.y <= gy + 0.15 || r.life <= 0) { this._rocketBlast(r, e && d < 1.6 + e.radius ? e : null); continue; }
      rs[j++] = r;
    }
    rs.length = j;
  }
  _rocketBlast(r, e) {
    const R = r.r, R2 = R * R, air = !!(e && e.fly > AIR);
    let hits = 0;
    if (e) {
      hits++;
      if (e.type !== T_GRUNT) this.events.push({ type: 'hit', x: e.x, z: e.z, y: e.fly > 0 ? e.fly + 1.2 : e.type === T_BOSS ? 2.6 : 1.9, giant: true, id: e.id });
      this._damage(e, r.dmg, 1);
    }
    if (!air) {
      this._query(r.x - R, r.z - R, r.x + R, r.z + R, (o) => {
        if (!o.alive || o === e || o.fly > AIR || (o.x - r.x) ** 2 + (o.z - r.z) ** 2 > R2) return;
        hits++;
        this._damage(o, r.dmg * 0.6, 1);
      });
    }
    const x = e ? e.x : r.x, z = e ? e.z : r.z;
    this.events.push({ type: 'explode', x, z, y: air ? e.fly + 0.9 : 0, r: R, level: r.level, kind: 'rocketHit', tower: 'rocket', hits });
  }

  // ---- Mine Tower: plants mines on the road
  _updateMineTower(t, L, dt) {
    if (!t.spots) t.spots = this._roadSpots(t, L.range * t.rangeMul);
    if (!t.spots.length || t.cooldown > 0) return;
    let n = 0;
    for (const m of this.mines) if (m.slot === t.slotIndex) n++;
    if (n >= L.max) return;
    t.cooldown = L.interval;
    t.recoil = 1;
    t.fired++;
    // a fresh spot, away from the mines already down
    let x = 0, z = 0;
    for (let tries = 0; tries < 6; tries++) {
      road.sample(t.spots[(this.rng() * t.spots.length) | 0], tmp2);
      const lat = (this.rng() - 0.5) * 2 * (CFG.roadHalfWidth - 1);
      x = tmp2.x + tmp2.nx * lat; z = tmp2.z + tmp2.nz * lat;
      if (!this.mines.some((m) => (m.x - x) ** 2 + (m.z - z) ** 2 < 2.2)) break;
    }
    t.yaw = Math.atan2(x - t.x, z - t.z);
    this.mines.push({ id: this.allyId++, x, z, y: roadY(x, z), sx: t.x, sy: t.y + arsMuzzle(t), sz: t.z, slot: t.slotIndex, level: t.level, dmg: L.dmg * t.dmgMul, r: L.r, stun: L.stun || 0, chain: L.chain || 0, fly: 0.7, fuse: -1, alive: true });
    this.events.push({ type: 'plant', slot: t.slotIndex, x: t.x, z: t.z, tx: x, tz: z });
  }

  _updateMines(dt) {
    const ms = this.mines;
    for (const m of ms) {
      if (!m.alive) continue;
      if (m.fly > 0) { m.fly -= dt; continue; }   // still flying out of the tower
      if (m.fuse >= 0) { m.fuse -= dt; if (m.fuse < 0) this._mineBlast(m); continue; }
      let trig = false;
      this._query(m.x - 1.6, m.z - 1.6, m.x + 1.6, m.z + 1.6, (e) => {
        if (!e.alive || e.fly > AIR || e.fall > 0) return;
        if ((e.x - m.x) ** 2 + (e.z - m.z) ** 2 <= (0.75 + e.radius * 0.6) ** 2) { trig = true; return true; }
      });
      if (trig) this._mineBlast(m);
    }
    let j = 0;
    for (const m of ms) if (m.alive) ms[j++] = m;
    ms.length = j;
  }
  _mineBlast(m) {
    m.alive = false;
    const R = m.r, R2 = R * R;
    let hits = 0;
    this._query(m.x - R, m.z - R, m.x + R, m.z + R, (e) => {
      if (!e.alive || e.fly > AIR || (e.x - m.x) ** 2 + (e.z - m.z) ** 2 > R2) return;
      hits++;
      if (e.type !== T_GRUNT) this.events.push({ type: 'hit', x: e.x, z: e.z, y: e.type === T_BOSS ? 2.6 : 1.9, giant: true, id: e.id });
      if (this._damage(e, m.dmg, 1)) return;
      if (m.stun && e.type === T_GRUNT) e.stun = Math.max(e.stun, m.stun);
    });
    // Chain Mine: the blast sets off the mines around it
    if (m.chain) for (const o of this.mines) if (o.alive && o.fly <= 0 && o.fuse < 0 && (o.x - m.x) ** 2 + (o.z - m.z) ** 2 <= m.chain * m.chain) o.fuse = 0.15;
    this.stats.mines = (this.stats.mines || 0) + 1;
    this.events.push({ type: 'explode', x: m.x, z: m.z, r: R, level: m.level, kind: 'mine', tower: 'mine', hits });
  }

  // ---- Spike Trap: beds of spikes on the road
  _updateSpike(t, L, dt) {
    if (!t.fields) t.fields = this._spikeFields(t, L);
    if (L.impale) t.stormT = Math.min(L.impale.every, t.stormT + dt * t.rateMul);
    t.tick -= dt;
    if (t.tick > 0) return;
    t.tick = 0.25;
    const dmg = L.dps * 0.25 * t.dmgMul, R = L.r;
    const impale = !!L.impale && t.stormT >= L.impale.every;
    let on = 0;
    const Q = R + CFG.roadHalfWidth;
    for (const f of t.fields) {
      // a bed covers the whole width of the road, R either side of its centre
      this._query(f.x - Q, f.z - Q, f.x + Q, f.z + Q, (e) => {
        if (!e.alive || e.fly > AIR || e.fall > 0 || Math.abs(e.s - f.s) > R || (e.x - f.x) ** 2 + (e.z - f.z) ** 2 > Q * Q) return;
        on++;
        e.slowMul = e.slow > 0 ? Math.min(e.slowMul, 1 - L.slow) : 1 - L.slow;
        e.slow = Math.max(e.slow, 0.4);
        if (this._dot(e, dmg)) return;
        if (impale) {
          if (this._damage(e, L.impale.dmg * t.dmgMul, 1)) return;
          if (e.type !== T_BOSS) e.stun = Math.max(e.stun, L.impale.stun);
        }
      });
    }
    t.firing = on > 0;   // (view) the spikes stab while rats cross
    if (impale && on) {
      t.stormT = 0;
      t.recoil = 1;
      this.events.push({ type: 'impale', slot: t.slotIndex, fields: t.fields.map((f) => [f.x, f.z]), r: R });
    }
  }
  // The first bed sits where the road passes closest to the tower; the second one beside it.
  _spikeFields(t, L) {
    const s0 = this._nearestRoadS(t), ss = [s0];
    if (L.fields > 1) {
      const gap = L.r * 2 + 0.4;
      road.sample(s0 + gap, tmp2);
      const da = (tmp2.x - t.x) ** 2 + (tmp2.z - t.z) ** 2;
      road.sample(s0 - gap, tmp2);
      const db = (tmp2.x - t.x) ** 2 + (tmp2.z - t.z) ** 2;
      ss.push(s0 - gap >= 0 && db < da ? s0 - gap : Math.min(road.length, s0 + gap));
    }
    return ss.map((s) => { road.sample(s, tmp2); return { s, x: tmp2.x, z: tmp2.z, yaw: Math.atan2(tmp2.tx, tmp2.tz) }; });
  }

  // ---- Summoner: rat soldiers that hold the road
  _updateSummoner(t, L) {
    if (t.rally === null) t.rally = this._nearestRoadS(t);
    this._refreshAllies(t, false);
  }
  // Tops up the tower's soldiers to its level (heal: an upgrade heals them all).
  _refreshAllies(t, heal) {
    const L = arsenalSpec('summoner', t.level);
    let n = 0;
    for (const a of this.allies) {
      if (a.slot !== t.slotIndex) continue;
      n++;
      a.maxHp = L.hp;
      if (heal && a.state !== 'dead') a.hp = L.hp;
    }
    for (let i = n; i < L.allies; i++) {
      this.allies.push({ id: this.allyId++, slot: t.slotIndex, i, x: t.x, z: t.z, y: t.y, hp: L.hp, maxHp: L.hp, state: 'walk', respawn: 0, yaw: t.yaw, atk: 0.3, swing: 0, foe: null, hurt: 0 });
      this.events.push({ type: 'allyUp', slot: t.slotIndex, x: t.x, z: t.z });
    }
  }

  _updateAllies(dt) {
    if (!this.allies.length) return;
    const usable = CFG.roadHalfWidth - 0.7;
    for (const a of this.allies) {
      const t = this.slots[a.slot].tower;
      if (!t || t.kind !== 'summoner' || t.rally === null) continue;
      const L = arsenalSpec('summoner', t.level);
      a.swing = Math.max(0, a.swing - dt * 3);
      a.hurt = Math.max(0, a.hurt - dt);
      if (a.state === 'dead') {
        if ((a.respawn -= dt * t.rateMul) <= 0) {
          a.state = 'walk'; a.hp = a.maxHp; a.x = t.x; a.z = t.z; a.y = t.y;
          this.events.push({ type: 'allyUp', slot: t.slotIndex, x: t.x, z: t.z });
        }
        continue;
      }
      // its post: a line across the road where it passes the tower
      const n = L.allies, lat = n === 1 ? 0 : clamp((a.i - (n - 1) / 2) * Math.min(1.5, (usable * 2) / (n - 1)), -usable, usable);
      road.sample(t.rally + (a.i % 2 ? 0.5 : -0.5), tmp2);
      const px = tmp2.x + tmp2.nx * lat, pz = tmp2.z + tmp2.nz * lat;
      if (a.state === 'walk') {
        const dx = px - a.x, dz = pz - a.z, d = Math.hypot(dx, dz);
        const step = 4.5 * dt;
        if (d <= step) { a.x = px; a.z = pz; a.state = 'post'; }
        else { a.x += (dx / d) * step; a.z += (dz / d) * step; a.yaw = Math.atan2(dx, dz); }
        a.y = groundHeight(a.x, a.z);
        continue;
      }
      // on guard: hold back the rats that reach it, and fight them
      let held = 0, foe = null, hurt = 0;
      const reach = 0.8;
      this._query(a.x - 2.5, a.z - 2.5, a.x + 2.5, a.z + 2.5, (e) => {
        if (!e.alive || e.fly > AIR || e.fall > 0) return;
        const d = Math.hypot(e.x - a.x, e.z - a.z);
        if (d > reach + e.radius) return;
        const boss = e.type === T_BOSS;
        if (!boss) {
          const cost = e.type === T_GIANT ? 2 : 1;
          if (held + cost > L.block) return;
          held += cost;
          if (!e.atGate) e.held = Math.max(e.held, 0.15);
        }
        if (!foe || boss) foe = e;
        hurt += (1.5 + e.maxHp * 0.025) * (boss ? 2 : 1);
      });
      a.foe = foe ? foe.id : null;
      if (foe) {
        a.yaw = Math.atan2(foe.x - a.x, foe.z - a.z);
        a.hp -= hurt * (1 - (L.armor || 0)) * dt;
        a.hurt = 0.2;
        a.atk -= dt * t.rateMul;
        if (a.atk <= 0) {
          a.atk = 0.5; a.swing = 1;
          if (!this._damage(foe, L.dps * 0.5 * t.dmgMul, 1) && L.stun && foe.type === T_GRUNT) foe.stun = Math.max(foe.stun, L.stun);
        }
        if (a.hp <= 0) {
          a.state = 'dead'; a.respawn = L.respawn; a.hp = 0;
          this.stats.alliesLost = (this.stats.alliesLost || 0) + 1;
          this.events.push({ type: 'allyDown', slot: t.slotIndex, x: a.x, z: a.z });
        }
      } else {
        a.yaw = Math.atan2(-tmp2.tx, -tmp2.tz);   // face down the road, toward the coming rats
        a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.05 * dt);   // catches its breath
      }
    }
  }

  // ---- Time Warp: slows every rat in its area; Rewind and Time Loop
  _updateWarp(t, L, dt) {
    const R = L.r, R2 = R * R;
    t.yaw += dt * 0.5;
    if (L.rewind) t.stormT = Math.min(L.rewind.every, t.stormT + dt);
    if (L.stop) t.roarT = Math.min(L.stop.every, t.roarT + dt);
    const rewind = !!L.rewind && t.stormT >= L.rewind.every;
    const stop = !!L.stop && t.roarT >= L.stop.every;
    t.tick -= dt;
    if (t.tick > 0 && !rewind && !stop) return;
    if (t.tick <= 0) t.tick = 0.2;
    let n = 0;
    this._query(t.x - R, t.z - R, t.x + R, t.z + R, (e) => {
      if (!e.alive || (e.x - t.x) ** 2 + (e.z - t.z) ** 2 > R2) return;
      n++;
      e.slowMul = e.slow > 0 ? Math.min(e.slowMul, 1 - L.slow) : 1 - L.slow;
      e.slow = Math.max(e.slow, 0.3);
      if (rewind && e.type !== T_BOSS && !(e.fall > 0)) {
        e.s = Math.max(0, e.s - L.rewind.dist * (e.type === T_GIANT ? 0.5 : 1));
        if (e.atGate) { e.atGate = false; e.s = Math.min(e.s, e.gateS - 0.6); }
      }
      if (stop) e.stun = Math.max(e.stun, e.type === T_BOSS ? L.stop.boss : L.stop.t);
    });
    if (rewind && n) { t.stormT = 0; t.recoil = 1; this.events.push({ type: 'warp', kind: 'rewind', slot: t.slotIndex, x: t.x, z: t.z, r: R, n }); }
    if (stop && n) { t.roarT = 0; t.recoil = 1; this.events.push({ type: 'warp', kind: 'stop', slot: t.slotIndex, x: t.x, z: t.z, r: R, n }); }
  }

  // ------------------------------------------------------------- cannons
  // Where an enemy will be when a cannonball fired from (ox, oz) lands.
  _lead(e, ox, oz) {
    const flight = Math.hypot(e.x - ox, e.z - oz) / CFG.cannon.shellSpeed;
    if (holding(e)) return { x: e.x, z: e.z, e };
    const sp = e.speed * (e.slow > 0 ? e.slowMul : 1);
    road.sample(e.s + sp * flight, tmp2);
    return { x: tmp2.x + tmp2.nx * e.lat, z: tmp2.z + tmp2.nz * e.lat, e };
  }

  // Picks the densest group among the front-most enemies in range.
  // `avoid` (a point) makes a second barrel look for a different group.
  _findCluster(t, range, radius, avoid) {
    const cands = [];
    const r2 = range * range;
    this._query(t.x - range, t.z - range, t.x + range, t.z + range, (e) => {
      if (!e.alive || e.fly > AIR) return;   // shells can't reach a flier
      const dx = e.x - t.x, dz = e.z - t.z;
      if (dx * dx + dz * dz <= r2) cands.push(e);
    });
    if (!cands.length) return null;
    cands.sort((a, b) => b.s - a.s);
    const N = Math.min(14, cands.length);
    const R2 = radius * radius;
    let best = null, bestScore = -1;
    for (let i = 0; i < N; i++) {
      const c = cands[i];
      if (avoid) {
        // a second barrel looks for another group, but only one it is roughly facing
        if ((c.x - avoid.x) ** 2 + (c.z - avoid.z) ** 2 < (radius * 1.6) ** 2) continue;
        if (Math.abs(angDiff(t.yaw, Math.atan2(c.x - t.x, c.z - t.z))) > 0.32) continue;
      }
      let score = 0;
      this._query(c.x - radius, c.z - radius, c.x + radius, c.z + radius, (e) => {
        if (!e.alive || e.fly > AIR) return;
        if ((e.x - c.x) ** 2 + (e.z - c.z) ** 2 <= R2) score += e.type === T_GRUNT ? 1 : e.type === T_GIANT ? 6 : 10;
      });
      score += (N - i) * 0.05; // prefer the front of the crowd on ties
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best ? this._lead(best, t.x, t.z) : null;
  }

  _updateCannon(t, dt) {
    const L = cannonSpec(t.level, t.path);
    const range = L.range * t.rangeMul;
    t.cooldown -= dt * t.rateMul;
    t.recoil = Math.max(0, t.recoil - dt * 3);
    // shells waiting in a burst
    for (let i = t.pending.length - 1; i >= 0; i--) {
      const p = t.pending[i];
      p.delay -= dt;
      if (p.delay <= 0) { this._launch(t, p.pt, p.lateral, p.kind); t.pending.splice(i, 1); }
    }
    if (L.nova) t.charge = Math.min(L.nova.charge, t.charge + dt * t.rateMul);
    else t.charge = 0;
    t.retarget -= dt;
    if (t.aim && (!t.aim.e.alive || t.aim.e.under || t.aim.e.fly > AIR)) t.aim = null;
    if (!t.aim || t.retarget <= 0) { t.aim = this._findCluster(t, range, L.radius, null); t.retarget = 0.3; }
    if (!t.aim) return;
    const aim = this._lead(t.aim.e, t.x, t.z);
    // Rocket Barrage: a salvo at the front of the crowd every few seconds
    if (L.salvo) {
      t.salvoT += dt * t.rateMul;
      if (t.salvoT >= L.salvo.every) {
        const front = [];
        const R = range, R2 = R * R;
        this._query(t.x - R, t.z - R, t.x + R, t.z + R, (e) => { if (e.alive && !(e.fly > AIR) && (e.x - t.x) ** 2 + (e.z - t.z) ** 2 <= R2) front.push(e); });
        if (front.length) {
          front.sort((a, b) => b.s - a.s);
          for (let i = 0; i < L.salvo.n; i++) {
            const e = front[i % Math.min(front.length, Math.ceil(L.salvo.n / 2))];
            const p = this._lead(e, t.x, t.z);
            const j = i >= front.length ? 0.9 : 0;    // doubled-up targets get a little scatter
            t.pending.push({ delay: i * L.salvo.gap, pt: { x: p.x + (this.rng() - 0.5) * j * 2, z: p.z + (this.rng() - 0.5) * j * 2, e }, lateral: ((i % 3) - 1) * 0.28, kind: 'rocket' });
          }
          t.salvoT = 0;
          this.events.push({ type: 'salvo', slot: t.slotIndex, x: t.x, z: t.z, n: L.salvo.n });
        }
      }
    }
    const want = Math.atan2(aim.x - t.x, aim.z - t.z);
    const d = angDiff(t.yaw, want);
    const turn = L.turn * dt;
    t.yaw += Math.abs(d) <= turn ? d : Math.sign(d) * turn;
    const aligned = Math.abs(angDiff(t.yaw, want)) < 0.25;
    if (!aligned) return;
    // Doomsday Nova: the main cannon fires once fully charged
    if (L.nova && t.charge >= L.nova.charge) {
      t.charge = 0;
      t.recoil = 1.6;
      t.pending.push({ delay: 0, pt: aim, lateral: 0, kind: 'nova' });
      this.events.push({ type: 'novaFire', slot: t.slotIndex, x: t.x, z: t.z });
    }
    if (t.cooldown > 0) return;
    t.cooldown = L.interval;
    t.recoil = Math.max(t.recoil, 1);
    t.fired++;
    if (L.retarget) t.retarget = 0;   // Rapid Launcher: each shell picks the best group again
    if (L.sides) {
      // side cannons take turns
      const lat = t.sideFlip ? L.lateral : -L.lateral;
      t.sideFlip ^= 1;
      t.pending.push({ delay: 0, pt: aim, lateral: lat, kind: 'side' });
      return;
    }
    const pts = [aim];
    if (L.shells >= 2 && L.split) pts.push(this._findCluster(t, range, L.radius, aim) || { x: aim.x + 0.8, z: aim.z + 0.8, e: aim.e });
    else if (L.shells === 2) pts.push(aim);
    if (L.shells === 3) {
      // three shells spread along the road around the target group
      const e = aim.e;
      for (const ds of [L.spread, -L.spread]) {
        road.sample(Math.max(0, e.s + ds + (e.atGate ? 0 : e.speed * 0.6)), tmp2);
        pts.push({ x: tmp2.x + tmp2.nx * e.lat, z: tmp2.z + tmp2.nz * e.lat, e });
      }
    }
    const n = pts.length;
    if (n === 1 && L.retarget) { t.sideFlip = (t.sideFlip + 1) % 4; }   // the launcher's tubes take turns
    for (let i = 0; i < n; i++) {
      const lat = n === 1 ? (L.retarget ? [-1, 1, -0.33, 0.33][t.sideFlip] * L.lateral : 0) : n === 2 ? (i === 0 ? -L.lateral : L.lateral) : (i - 1) * L.lateral;
      t.pending.push({ delay: i * (L.gap || 0), pt: pts[i], lateral: lat, kind: 'shell' });
    }
  }

  _launch(t, pt, lateral, kind) {
    const L = cannonSpec(t.level, t.path);
    const yaw = t.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const fwd = kind === 'nova' ? 1.5 : 1.1;
    const ox = t.x + fx * fwd + Math.cos(yaw) * lateral, oz = t.z + fz * fwd - Math.sin(yaw) * lateral;
    const oy = t.y + CFG.cannon.headY[t.level] + 0.35;
    const dist = Math.hypot(pt.x - ox, pt.z - oz);
    // light shells and rockets fly fast and flat; mortar shells climb high and slow
    const speedK = kind === 'rocket' ? 0.6 : L.light ? 0.8 : L.heavy ? 1.2 : 1;
    const T = Math.max(0.3, dist / CFG.cannon.shellSpeed) * (kind === 'nova' ? 1.3 : 1) * speedK;
    const h = kind === 'rocket' ? 0.9 + dist * 0.06 : L.heavy ? 2.4 + dist * 0.18 : L.light ? 1.0 + dist * 0.08 : 1.4 + dist * 0.12;
    this.shells.push({
      x0: ox, y0: oy, z0: oz, tx: pt.x, tz: pt.z, ty: 0.3 + roadY(pt.x, pt.z), t: 0, T, h,
      r: kind === 'nova' ? L.nova.radius : kind === 'rocket' ? L.salvo.r : L.radius,
      dmg: kind === 'nova' ? L.nova.dmg : kind === 'rocket' ? L.salvo.dmg : L.dmg,
      x: ox, y: oy, z: oz, level: t.level, path: t.path, spec: L, kind, alive: true, mul: t.dmgMul,
    });
    this.events.push({ type: 'fire', tower: 'cannon', kind, x: t.x, z: t.z, level: t.level, path: t.path, slot: t.slotIndex, ax: pt.x, az: pt.z });
  }

  _updateShells(dt) {
    for (const s of this.shells) {
      if (!s.alive) continue;
      s.t += dt;
      const k = Math.min(1, s.t / s.T);
      s.x = s.x0 + (s.tx - s.x0) * k;
      s.z = s.z0 + (s.tz - s.z0) * k;
      s.y = s.y0 + (s.ty - s.y0) * k + 4 * s.h * k * (1 - k);
      if (k >= 1) { s.alive = false; if (s.kind === 'gas') this._gasLand(s); else this._explode(s); }
    }
  }

  _explode(s) {
    const L = s.spec || cannonSpec(s.level, s.path);
    const nova = s.kind === 'nova';
    const small = s.kind === 'bomblet' || s.kind === 'rocket';   // extras: no fire, rings or bomblets of their own
    const mul = s.mul || 1;
    const dmg = (s.dmg ?? (nova ? L.nova.dmg : L.dmg)) * mul;
    const R = s.r ?? (nova ? L.nova.radius : L.radius);
    const armor = L.armor || 1;
    const x = s.tx, z = s.tz;
    const R2 = R * R;
    let hits = 0;
    this._query(x - R, z - R, x + R, z + R, (e) => {
      if (!e.alive || e.fly > AIR) return;   // a blast on the ground can't reach a flier
      const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d2 > R2) return;
      const d = Math.sqrt(d2);
      // full damage at the centre, a direct hit adds 50%; light shells lose less towards the edge
      const f = (1 - (L.light ? 0.12 : 0.35) * (d / R)) * (d < e.radius + 0.5 ? 1.5 : 1);
      hits++;
      if (e.type !== T_GRUNT) this.events.push({ type: 'hit', x: e.x, z: e.z, y: e.type === T_BOSS ? 2.6 : 1.9, giant: true });
      if (this._damage(e, dmg * f, armor)) return;
      if (nova) e.broken = L.nova.breakT;
      else if (L.crack && !small) e.broken = Math.max(e.broken || 0, L.crack);   // Crystal Quake cracks armour
      if (e.type === T_GRUNT) {
        if (L.knock) {
          e.s = Math.max(0, e.s - L.knock * (1 - d / R) * (nova ? 2 : 1) * CFG.ratTypes[e.v].knockMul);
          if (e.atGate) { e.atGate = false; e.s = Math.min(e.s, e.gateS - 0.6); }
        }
        if (L.stun) e.stun = Math.max(e.stun, L.stun * (1 - 0.5 * d / R));   // survivors are dazed, longest near the impact
      }
    });
    if (L.burn && !nova && !small) this.zones.push({ x, z, r: L.burn.r, t: L.burn.t, max: L.burn.t, dps: L.burn.dps * mul, tick: 0 });
    // Cluster Shells: bomblets scatter out of the blast onto the rats around it
    if (L.cluster && !small && !nova) {
      const gy = roadY(x, z);
      const C = L.cluster, a0 = this.rng() * Math.PI * 2;
      for (let k = 0; k < C.n; k++) {
        const a = a0 + (k / C.n) * Math.PI * 2, d = C.spread * (0.8 + this.rng() * 0.4);
        this.shells.push({
          x0: x, y0: 0.5 + gy, z0: z, tx: x + Math.cos(a) * d, tz: z + Math.sin(a) * d, ty: 0.25 + roadY(x + Math.cos(a) * d, z + Math.sin(a) * d), t: 0, T: 0.3 + this.rng() * 0.08, h: 0.9,
          r: C.r, dmg: C.dmg, x, y: 0.5 + gy, z, level: s.level, path: s.path, spec: L, kind: 'bomblet', alive: true, mul,
        });
      }
    }
    let ringR = 0;
    if (L.ring && !small) {
      ringR = nova ? L.ring.r * 1.35 : L.ring.r;
      const RR = ringR * ringR;
      this._query(x - ringR, z - ringR, x + ringR, z + ringR, (e) => {
        if (!e.alive || e.fly > AIR || (e.x - x) ** 2 + (e.z - z) ** 2 > RR) return;
        if (this._damage(e, L.ring.dmg * mul, 1)) return;
        e.slow = Math.max(e.slow, L.ring.t);
        e.slowMul = 1 - L.ring.slow;
      });
    }
    this.events.push({ type: 'explode', x, z, r: R, level: s.level, path: s.path, kind: s.kind, tower: s.tower || 'cannon', ring: ringR, burn: !!(L.burn && !nova && !small), hits });
  }

  _updateZones(dt) {
    const zs = this.zones;
    let j = 0;
    for (let i = 0; i < zs.length; i++) {
      const zn = zs[i];
      zn.t -= dt;
      zn.tick -= dt;
      if (zn.tick <= 0) {
        zn.tick += 0.25;
        const r2 = zn.r * zn.r;
        this._query(zn.x - zn.r, zn.z - zn.r, zn.x + zn.r, zn.z + zn.r, (e) => {
          if (!e.alive || e.fly > AIR || e.under || (e.x - zn.x) ** 2 + (e.z - zn.z) ** 2 > r2) return;
          if (zn.gas) {
            // poison gas: eats away at the rat, corrodes it (more damage from everything) and may slow it
            if (zn.weak) e.weak = Math.max(e.weak, 0.6);
            if (zn.slow) { e.slowMul = e.slow > 0 ? Math.min(e.slowMul, 1 - zn.slow) : 1 - zn.slow; e.slow = Math.max(e.slow, 0.4); }
            this._dot(e, zn.dps * 0.25);
          } else this._damage(e, zn.dps * 0.25, 1);
        });
      }
      if (zn.t > 0) zs[j++] = zn;
    }
    zs.length = j;
  }

  _updateBolts(dt) {
    const sp = CFG.boltSpeed;
    for (const b of this.bolts) {
      if (!b.alive) continue;
      const L = b.spec || CFG.towers[b.level];
      if (b.fall) {                       // a Crystal Storm arrow dropping from the sky
        const step = L.storm.speed * dt;
        b.y -= step; b.d += step;
        if (b.y <= b.y1) { b.alive = false; this._stormHit(b, L); }
        continue;
      }
      const step = sp * dt;
      const x0 = b.x, z0 = b.z;
      const x1 = x0 + b.dx * step, z1 = z0 + b.dz * step;
      const pad = 1.7;
      let redirected = false;
      this._query(Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad, (e) => {
        if (!e.alive || b.pierce <= 0) return b.pierce <= 0;
        if ((e.fly > AIR) !== !!b.air || b.hits.includes(e.id)) return;   // arrows at a flier fly over the road, and under it
        // distance from enemy to the bolt segment (2D)
        const ex = e.x - x0, ez = e.z - z0;
        let u = ex * b.dx + ez * b.dz;
        if (u < 0 || u > step) {
          // allow small overlap at segment ends
          if (u < -e.radius || u > step + e.radius) return;
          u = clamp(u, 0, step);
        }
        const px = ex - b.dx * u, pz = ez - b.dz * u;
        const rr = e.radius + 0.14;
        if (px * px + pz * pz > rr * rr) return;
        b.hits.push(e.id);
        // a ninja rat flips out of the way and the arrow flies on (not while stunned or frozen)
        if (e.v === NINJA && e.type === T_GRUNT && e.dodgeT <= 0 && !(e.stun > 0)) {
          e.dodgeT = CFG.ratTypes[NINJA].dodge.every;
          this.stats.dodged = (this.stats.dodged || 0) + 1;
          this.events.push({ type: 'dodge', x: e.x, z: e.z, id: e.id });
          return;
        }
        // (view only) where the arrow strikes: a comic burst; arrows stick in giants
        if (e.type !== T_GRUNT) this.events.push({ type: 'hit', x: e.x, z: e.z, y: e.fly > 0 ? e.fly + 1.2 : e.type === T_BOSS ? 2.6 : 1.9, giant: true, id: e.id, dx: b.dx, dz: b.dz, level: b.level });
        else if (!(e.shield > 0)) this.events.push({ type: 'poke', x: e.x - b.dx * 0.3, y: b.air ? b.y - e.gy : 0.6, z: e.z - b.dz * 0.3 });
        if (e.shield > 0) {
          // a raised shield stops the arrow dead and soaks up its damage
          b.pierce = 0;
          this._shieldHit(e, b.dmg, L);
        } else {
          b.pierce -= e.type === T_GRUNT ? CFG.ratTypes[e.v].pierceCost : 3;   // giant rats always stop an arrow; armored rats soak up two
          if (e.armor > 0 && e.type === T_GRUNT) this.events.push({ type: 'clink', x: e.x, z: e.z });
          this._arrowHit(e, b.dmg, L);
        }
        if (b.pierce <= 0) {
          if (b.bounces > 0 && this._bounce(b, L, e)) { redirected = true; return true; }
          b.alive = false; b.endX = e.x; b.endZ = e.z; return true;
        }
      });
      if (redirected) continue;
      b.x = x1; b.z = z1; b.d += step;
      b.y = b.y0 + (b.y1 - b.y0) * Math.min(1, b.d / b.aim);
      if (b.d >= b.max) b.alive = false;
    }
  }

  // Arrow damage: giant-rat armour blocks part of it (Armor Piercer arrows
  // ignore most of that, Nova-broken armour blocks nothing), then frost.
  _arrowHit(e, dmg, L) {
    let mul = 1;
    if (e.armor > 0 && !(e.broken > 0)) mul = 1 - e.armor * (1 - (L.armorPierce || 0));
    if (this._damage(e, dmg, mul)) return true;
    if (L.frost) this._frostHit(e, L.frost);
    return false;
  }

  // An arrow into a shield: Armor Piercer arrows split it faster. When it
  // breaks, the rest of the arrow's damage goes into the rat.
  _shieldHit(e, dmg, L) {
    const d = dmg * (L.armorPierce ? CFG.ratTypes[e.v].shieldPierce : 1);
    e.shield -= d;
    e.hitT = CFG.hitFlinch * 0.6;
    this.stats.blocked = (this.stats.blocked || 0) + Math.min(d, d + e.shield);
    if (e.shield > 0) { this.events.push({ type: 'block', x: e.x, z: e.z, id: e.id }); return false; }
    const rest = -e.shield / (L.armorPierce ? CFG.ratTypes[e.v].shieldPierce : 1);
    e.shield = 0;
    this.stats.shieldsBroken = (this.stats.shieldsBroken || 0) + 1;
    this.events.push({ type: 'shieldBreak', x: e.x, z: e.z, yaw: e.yaw, id: e.id });
    return rest > 0 ? this._arrowHit(e, rest, L) : false;
  }

  // Frost Arrows: every hit slows; the third hit in a row freezes the rat.
  // Bosses are only ever slowed.
  _frostHit(e, F) {
    e.slowMul = e.slow > 0 ? Math.min(e.slowMul, 1 - F.slow) : 1 - F.slow;
    e.slow = Math.max(e.slow, F.t);
    if (e.type === T_BOSS || e.frozen > 0 || e.freezeCd > 0) return;
    e.frost++;
    e.frostT = F.decay;
    if (e.frost >= F.hits) {
      const ft = e.type === T_GRUNT ? F.freeze : F.giantFreeze;
      e.frost = 0;
      e.frozen = ft;
      e.stun = Math.max(e.stun, ft);
      e.freezeCd = ft + F.immune;
      this.stats.frozen = (this.stats.frozen || 0) + 1;
      this.events.push({ type: 'freeze', x: e.x, z: e.z, giant: e.type !== T_GRUNT, id: e.id });
    }
  }

  // Crystal Storm arrows bounce on to the nearest rat they have not hit yet.
  _bounce(b, L, from) {
    const B = L.bounce, R = B.range;
    let best = null, bd = R * R;
    this._query(from.x - R, from.z - R, from.x + R, from.z + R, (e) => {
      if (!e.alive || e === from || b.hits.includes(e.id)) return;
      const d2 = (e.x - from.x) ** 2 + (e.z - from.z) ** 2;
      if (d2 < bd) { bd = d2; best = e; }
    });
    if (!best) return false;
    const fy = b.y;
    b.x = from.x; b.z = from.z;
    const aim = this._aimAt(best, b.x, b.z);
    let dx = aim.x - b.x, dz = aim.z - b.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    b.dx = dx / dist; b.dz = dz / dist;
    b.d = 0; b.aim = dist; b.max = dist + 0.8;
    b.y0 = b.y = fy; b.y1 = hitY(best);
    b.pierce = 1; b.bounces--; b.dmg *= B.falloff; b.air = best.fly > AIR;
    this.stats.bounces = (this.stats.bounces || 0) + 1;
    this.events.push({ type: 'bounce', x: from.x, z: from.z, y: fy });
    return true;
  }

  _stormHit(b, L) {
    const R = L.storm.hitR, R2 = R * R;
    let hits = 0;
    this._query(b.x - R, b.z - R, b.x + R, b.z + R, (e) => {
      if (!e.alive || e.fly > AIR || (e.x - b.x) ** 2 + (e.z - b.z) ** 2 > R2) return;
      hits++;
      this._arrowHit(e, b.dmg, L);
    });
    this.stats.stormHits = (this.stats.stormHits || 0) + hits;
    this.events.push({ type: 'stormHit', x: b.x, z: b.z, hits });
  }

  // --------------------------------------------------------------- coins
  _dropCoin(x, z, y, value, power) {
    const C = CFG.coin;
    const W = CFG.walk;
    if (this.coins.length >= C.max) {
      // merge into an existing resting coin so no gold is ever lost
      const c = this.coins[(this.rng() * this.coins.length) | 0];
      c.value += value; return;
    }
    const a = this.rng() * Math.PI * 2, p = power * (0.35 + this.rng() * 0.65);
    this.coins.push({
      x: clamp(x, W.minX + 0.3, W.maxX - 0.3), z: clamp(z, W.minZ + 0.3, W.maxZ - 0.3), y: y + 0.4,
      vx: Math.cos(a) * p, vz: Math.sin(a) * p, vy: 5 + this.rng() * 3.5,
      value, age: 0, state: 0, rest: false, speed: 0, spin: this.rng() * 6.28, bt: 9, bv: 0,   // bt, bv: seconds since it last bounced and how hard (the view squashes it)
    });
  }

  // Coins never come to rest inside the keep, a hut or a tower, where the
  // hero could not reach them.
  _coinClear(c) {
    const push = (cx, cz, r) => {
      const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz);
      if (d < r) { const k = (r + 0.05) / (d || 0.001); c.x = cx + (d ? dx * k : r); c.z = cz + (d ? dz * k : 0); return true; }
      return false;
    };
    const f = CFG.fortress;
    let moved = push(f.x, f.z, f.radius + 0.4);
    for (const h of CFG.huts) moved = push(h.x, h.z, 1.7) || moved;
    for (const o of CFG.town.obstacles) moved = push(o.x, o.z, o.r + 0.2) || moved;
    for (const t of this.towers) moved = push(t.x, t.z, CFG.towerRadii[t.level] + 0.2) || moved;
    if (moved) c.y = groundHeight(c.x, c.z) + 0.12;
  }

  _updateCoins(dt) {
    const C = CFG.coin, h = this.hero, W = CFG.walk;
    const R2 = this.magnetRadius ** 2;
    const cs = this.coins;
    let j = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      c.age += dt;
      let keep = true;
      if (c.state === 0) {
        c.bt += dt;
        if (!c.rest) {
          c.vy += C.gravity * dt;
          c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
          if (c.x < W.minX || c.x > W.maxX) { c.vx = -c.vx; c.x = clamp(c.x, W.minX, W.maxX); }
          if (c.z < W.minZ || c.z > W.maxZ) { c.vz = -c.vz; c.z = clamp(c.z, W.minZ, W.maxZ); }
          const gy = groundHeight(c.x, c.z) + 0.12;
          if (c.y <= gy) {
            c.y = gy;
            if (c.vy < -2.2) { c.bv = -c.vy; c.vy = -c.vy * C.restitution; c.vx *= 0.62; c.vz *= 0.62; c.bt = 0; }
            else { c.bv = -c.vy; c.vy = 0; c.vx = 0; c.vz = 0; c.rest = true; c.bt = 0; this._coinClear(c); }
          }
        }
        const dx = h.x - c.x, dz = h.z - c.z;
        if (c.age > C.attractDelay && dx * dx + dz * dz < R2 && this.state !== 'defeat') { c.state = 1; c.speed = C.attractSpeed; }
      } else {
        c.speed += C.attractAccel * dt;
        const tx = h.x, ty = h.y + 0.7, tz = h.z;
        const dx = tx - c.x, dy = ty - c.y, dz = tz - c.z;
        const d = Math.hypot(dx, dy, dz);
        const step = c.speed * dt;
        if (d <= Math.max(C.collectDist, step)) {
          this.gold += c.value;
          this.stats.coins += c.value;
          h.collect = 0.15;
          this.events.push({ type: 'coin', value: c.value });
          keep = false;
        } else {
          c.x += (dx / d) * step; c.y += (dy / d) * step + Math.min(1, d) * dt * 2; c.z += (dz / d) * step;
        }
      }
      if (keep) cs[j++] = c;
    }
    cs.length = j;
  }

  // ---------------------------------------------------------------- pads
  // Rebuilds the list of visible pads from game progress, keeping the state
  // (partial payments, arming) of pads that persist.
  refreshPads() {
    const old = new Map(this.pads.map((p) => [p.id, p]));
    const next = [];
    const add = (id, kind, x, z, cost, extra) => {
      let p = old.get(id);
      if (!p) {
        p = { id, kind, x, z, y: groundHeight(x, z), cost, paid: this.padPaid[id] || 0, armed: false, lock: 0, hold: 0, acc: 0, warned: false, heroOn: false, born: this.time, ...extra };
        p.armed = !this._heroOnPad(p);
      }
      Object.assign(p, extra);
      p.cost = cost;
      p.paid = Math.min(p.paid, cost);
      next.push(p);
    };
    // build pads: next unbuilt slots in reveal order
    let shown = 0;
    for (const s of this.slots) {
      if (s.tower) continue;
      if (shown >= CFG.visibleBuildPads) break;
      const base = CFG.buildCosts[Math.min(this.builtOrder, CFG.buildCosts.length - 1)];
      const kind = this.canBuild(this.buildKind) ? this.buildKind : 'crossbow';
      const cost = kind === 'crossbow' ? base : Math.round((base * towerBuildMul(kind)) / 5) * 5;
      add('build:' + s.id, 'build', s.x, s.z, cost, { slot: s.index, tower: kind });
      shown++;
    }
    // upgrade pads: towers below the fortress level
    for (const s of this.slots) {
      const t = s.tower;
      if (!t || t.level >= towerMaxLevel(t.kind)) continue;
      const costs = [];
      for (let lv = 0; lv <= t.level + 1; lv++) costs.push(towerUpgradeCost(t.kind, lv));
      if (t.kind === 'cannon' && t.level + 1 === CFG.cannon.branchLevel) {
        // the upgrade choice: one pad per path, side by side
        ['rapid', 'blast'].forEach((path, i) => {
          add('up:' + s.id + ':' + (t.level + 1) + ':' + path, 'upgrade', s.x + s.upB[i][0], s.z + s.upB[i][1], costs[t.level + 1], { slot: s.index, level: t.level + 1, tower: t.kind, path, choice: true });
        });
        continue;
      }
      add('up:' + s.id + ':' + (t.level + 1), 'upgrade', s.x + s.up[0], s.z + s.up[1], costs[t.level + 1], { slot: s.index, level: t.level + 1, tower: t.kind, path: t.kind === 'cannon' ? t.path : undefined, choice: false });
    }
    // fortress upgrade pad
    const fl = this.fortress.level;
    const nextF = CFG.fortressLevels[fl + 1];
    const clearedWaves = this.waveIndex; // waves fully cleared so far
    if (nextF && clearedWaves >= nextF.unlockAfterWave) {
      add('fort:' + (fl + 1), 'fortress', CFG.fortressPad.x, CFG.fortressPad.z, nextF.cost, { level: fl + 1 });
    } else if (this.fortress.hp < this.fortress.maxHp && (this.state === 'build' || this.state === 'wave')) {
      // repair pad: a damaged town hall with no upgrade waiting can be patched up for gold
      add('repair', 'repair', CFG.fortressPad.x, CFG.fortressPad.z, this.repairCost, { level: fl });
    }
    // gold poured into a repair pad that is no longer needed (an upgrade repaired the hall) comes back
    if (this.padPaid.repair > 0 && !next.some((p) => p.kind === 'repair')) {
      const back = this.padPaid.repair;
      this.gold += back; this.stats.spent -= back;
      delete this.padPaid.repair;
      this.events.push({ type: 'refund', amount: back, repair: true, x: CFG.fortressPad.x, z: CFG.fortressPad.z, y: 0 });
    }
    for (const p of next) if (!old.has(p.id)) this.events.push({ type: 'padAppear', id: p.id, x: p.x, z: p.z, kind: p.kind });
    this.pads = next;
  }

  // Gold to restore all of the town hall's lost health (0 when it is unhurt).
  get repairCost() {
    const f = this.fortress, R = CFG.repair, missing = f.maxHp - f.hp;
    return missing <= 0 ? 0 : Math.max(R.min, Math.ceil((missing * R.goldPerHp) / 5) * 5);
  }

  // The town hall was hit: show the repair pad, or raise its price.
  _syncRepairPad() {
    if (this.pads.some((q) => q.kind === 'fortress')) return;   // the upgrade repairs it fully anyway
    const p = this.pads.find((q) => q.kind === 'repair');
    if (!p) this.refreshPads();
    else if (p.cost !== this.repairCost) { p.cost = this.repairCost; p.paid = Math.min(p.paid, p.cost); }
  }

  _heroOnPad(p) {
    const H = CFG.pad.half;
    return Math.abs(this.hero.x - p.x) < H && Math.abs(this.hero.z - p.z) < H && Math.abs(this.hero.y - p.y) < 0.9;
  }

  _updatePads(dt) {
    const P = CFG.pad;
    for (const p of this.pads) {
      p.lock = Math.max(0, p.lock - dt);
      const on = this._heroOnPad(p);
      p.heroOn = on;
      if (!on) { p.armed = true; p.hold = 0; p.acc = 0; p.warned = false; continue; }
      if (!p.armed || p.lock > 0) continue;
      if (this.state !== 'build' && this.state !== 'wave') continue;
      p.hold += dt;
      if (p.hold < P.armDelay) continue;
      const remaining = p.cost - p.paid;
      if (this.gold <= 0) {
        if (!p.warned) { this.events.push({ type: 'needGold', need: remaining, id: p.id }); p.warned = true; }
        continue;
      }
      const rate = Math.max(P.minRate, p.cost / P.fillTime);
      p.acc += rate * dt;
      let amt = Math.floor(p.acc);
      if (amt <= 0) continue;
      amt = Math.min(amt, this.gold, remaining);
      p.acc -= amt;
      this.gold -= amt;
      p.paid += amt;
      this.padPaid[p.id] = p.paid;
      this.stats.spent += amt;
      this.events.push({ type: 'pay', id: p.id, x: p.x, z: p.z, y: p.y, amount: amt, frac: p.paid / p.cost });
      if (p.paid >= p.cost) { this._completePad(p); break; }
    }
  }

  _completePad(p) {
    delete this.padPaid[p.id];
    let ev;
    if (p.kind === 'build') {
      const s = this.slots[p.slot];
      this._placeTower(s, 1, false, p.tower || 'crossbow');
      this.builtOrder++;
      ev = { type: 'built', kind: 'build', tower: p.tower || 'crossbow', x: s.x, z: s.z, y: s.y, slot: s.index, level: 1 };
    } else if (p.kind === 'upgrade') {
      const s = this.slots[p.slot];
      s.tower.level = p.level;
      s.tower.builtAt = this.time;
      s.tower.charge = 0;
      s.tower.salvoT = 0;
      s.tower.pending.length = 0;
      s.tower.fields = null; s.tower.spots = null; s.tower.rally = null;
      if (s.tower.kind === 'summoner') this._refreshAllies(s.tower, true);
      if (p.choice) {
        s.tower.path = p.path;
        // the path not taken: whatever was paid into its pad comes back
        for (const q of this.pads) {
          if (q !== p && q.choice && q.slot === p.slot && q.paid > 0) {
            this.gold += q.paid; this.stats.spent -= q.paid;
            this.events.push({ type: 'refund', amount: q.paid, x: q.x, z: q.z, y: q.y });
            delete this.padPaid[q.id];
          }
        }
      }
      ev = { type: 'built', kind: 'upgrade', tower: s.tower.kind, path: s.tower.path, x: s.x, z: s.z, y: s.y, slot: s.index, level: p.level };
    } else if (p.kind === 'repair') {
      const f = this.fortress, healed = Math.ceil(f.maxHp - f.hp);
      f.hp = f.maxHp;
      this.stats.repaired = (this.stats.repaired || 0) + healed;
      ev = { type: 'built', kind: 'repair', x: f.x, z: f.z, y: 0, level: f.level, amount: healed };
    } else {
      const f = this.fortress;
      f.level = p.level;
      f.maxHp = CFG.fortressLevels[p.level].hp;
      f.hp = f.maxHp;
      ev = { type: 'built', kind: 'fortress', x: f.x, z: f.z, y: 0, level: p.level };
    }
    this.pads = this.pads.filter((q) => q !== p);
    this.refreshPads();
    // Safeguard: any pad the hero is standing on right now must be stepped
    // off and on again before it can take more coins.
    for (const q of this.pads) {
      if (this._heroOnPad(q)) q.armed = false;
      if (Math.hypot(q.x - this.hero.x, q.z - this.hero.z) < 5) q.lock = Math.max(q.lock, CFG.pad.postBuildLock);
    }
    this.events.push(ev);
    if (this.state === 'build') this.events.push({ type: 'checkpoint', kind: 'build' });
  }

  // ------------------------------------------------------------ save/load
  serialize() {
    return {
      v: CFG.version,
      waveIndex: this.waveIndex,
      diff: this.difficulty,
      gold: this.gold,
      builtOrder: this.builtOrder,
      fortress: { level: this.fortress.level, hp: this.fortress.hp },
      // kind: 0 crossbow, 1 cannon, or the Arsenal tower's name
      towers: this.towers.map((t) => [t.slotIndex, t.level, t.kind === 'cannon' ? 1 : isArsenal(t.kind) ? t.kind : 0, t.path === 'rapid' ? 1 : t.path === 'blast' ? 2 : 0]),
      buildKind: this.buildKind,
      padPaid: { ...this.padPaid },
      coins: this.coins.filter((c) => c.state === 0).map((c) => [Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10, c.value]),
      hero: [Math.round(this.hero.x * 10) / 10, Math.round(this.hero.z * 10) / 10],
      stats: { ...this.stats },
      paid: this.diamondsPaid,
      level: CFG.level,
      buildTimer: this.state === 'build' ? Math.round(this.buildTimer) : CFG.buildTime,
    };
  }

  load(d) {
    if (!d || d.v !== CFG.version || (d.level || 1) !== CFG.level) return false;   // a save loads only on its own map
    if (CFG.difficulties[d.diff]) this.difficulty = d.diff;   // older saves have none: they stay on Normal
    this.reset();
    this.towers = [];
    for (const s of this.slots) s.tower = null;
    for (const [si, lv, k, pc] of d.towers) {
      const s = this.slots[si];
      // a saved cannon stays a cannon even if the save is opened on a fresh profile
      if (!s) continue;
      const kind = k === 1 ? 'cannon' : isArsenal(k) ? k : 'crossbow';
      const t = this._placeTower(s, clamp(lv | 0, 1, towerMaxLevel(kind)), true, kind);
      // saves from before the upgrade choice carry on as Thunder Mortars
      if (t.kind === 'cannon' && t.level >= CFG.cannon.branchLevel) t.path = pc === 1 ? 'rapid' : 'blast';
    }
    if (this.canBuild(d.buildKind)) this.buildKind = d.buildKind;
    this.waveIndex = clamp(d.waveIndex | 0, 0, CFG.waves.length - 1);
    this.gold = Math.max(0, d.gold | 0);
    this.builtOrder = d.builtOrder | 0;
    const fl = clamp(d.fortress.level | 0, 1, 3);
    this.fortress.level = fl;
    this.fortress.maxHp = CFG.fortressLevels[fl].hp;
    this.fortress.hp = clamp(d.fortress.hp, 1, this.fortress.maxHp);
    this.padPaid = { ...(d.padPaid || {}) };
    this.coins = [];
    for (const [x, z, v] of d.coins || []) {
      const c = { x, z, y: groundHeight(x, z) + 0.12, vx: 0, vy: 0, vz: 0, value: v, age: 1, state: 0, rest: true, speed: 0, spin: Math.random() * 6, bt: 9, bv: 0 };
      this.coins.push(c);
    }
    for (const c of this.coins) this._coinClear(c);
    if (d.hero) { this.hero.x = d.hero[0]; this.hero.z = d.hero[1]; this.hero.y = groundHeight(d.hero[0], d.hero[1]); }
    if (d.stats) Object.assign(this.stats, d.stats);
    this.diamondsPaid = clamp(d.paid | 0, 0, CFG.waves.length);
    this.state = 'build';
    this.buildTimer = Math.max(8, d.buildTimer || CFG.buildTime);
    this.pads = [];
    this.refreshPads();
    for (const p of this.pads) { p.armed = !this._heroOnPad(p); p.lock = 0.5; }
    this.events.push({ type: 'loaded' });
    return true;
  }
}
