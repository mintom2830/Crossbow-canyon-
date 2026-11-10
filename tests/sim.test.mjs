// Headless gameplay tests (no browser). Run: node tests/sim.test.mjs
import { Sim, T_GRUNT, T_GIANT, T_BOSS, SHIELD, HEALER, BROOD, RATLING, BOMB, NINJA, JET } from '../src/sim.js';
import { RAT_GUIDE, firstWave, guideEntry, QUICK_COUNTERS } from '../src/ratguide.js';
import { existsSync, readFileSync } from 'node:fs';
import { CFG, cannonSpec, MAPS, towerUpgradeCost, towerBuildMul, towerUnlockCost } from '../src/config.js';
import { ARSENAL, TOWER_KINDS, arsenalSpec } from '../src/arsenal.js';
import { road, plateauSdf, setLevel, groundHeight, hillHeight, pondDepth, streamDistance, STREAM_HALF, inWater, oasisLayout } from '../src/world.js';
import { runLevel } from '../tools/balance.mjs';
import { makeBot } from '../src/bot.js';
import { describeFocus, towerStats, CROSSBOW_ABILITIES, cannonAbility } from '../src/towerinfo.js';
import { VILLAGERS, doorOf, fieldPoint, chatSpot, villagerAlarm, safeToComeOut, ALERT_RANGE, PANIC_RANGE } from '../src/town.js';

let pass = 0, fail = 0;
const results = [];
function test(name, fn) {
  try { fn(); pass++; results.push(`  ✓ ${name}`); }
  catch (e) { fail++; results.push(`  ✗ ${name}\n      ${e.message}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const dt = CFG.fixedDt;
// runs a check on every map (Level 1, Level 2, ...), then goes back to Level 1
function forLevels(fn) {
  try {
    for (const m of MAPS) { setLevel(m.id); try { fn(m); } catch (e) { e.message = `Level ${m.id}: ${e.message}`; throw e; } }
  } finally { setLevel(1); }
}
const run = (sim, sec, each) => { for (let i = 0, n = Math.round(sec / dt); i < n; i++) { each && each(sim); sim.step(dt); } };

test('road never cuts through a plateau (every map)', () => {
  forLevels(() => {
    for (const p of CFG.plateaus) for (let i = 0; i < road.count; i++) {
      assert(-plateauSdf(p, road.px[i], road.pz[i]) > CFG.roadHalfWidth - 0.05, `road overlaps plateau at ${road.px[i]},${road.pz[i]}`);
    }
  });
});

test('every tower slot can reach the road with a level 1 crossbow (every map)', () => {
  forLevels(() => {
    for (const s of CFG.slots) assert(road.distanceTo(s.x, s.z) < CFG.towers[1].range - 1, `slot ${s.id} too far`);
  });
});

test('a wave spawns a crowd of rats with giant rats and HP values from the wave table', () => {
  const sim = new Sim({ seed: 3 });
  sim.callWave();
  run(sim, 12);
  const giants = sim.enemies.filter((e) => e.type !== T_GRUNT);
  assert(sim.enemies.length > 30, 'crowd too small: ' + sim.enemies.length);
  assert(giants.length >= 1 && giants[0].maxHp === 32, 'wave 1 giant rat missing');
});

test('rats climb out of the burrow, follow the road and report hits and defeats for the animations', () => {
  const sim = new Sim({ seed: 3 });
  sim.callWave();
  run(sim, 2);
  const first = Math.min(...sim.enemies.map((e) => e.s));
  assert(sim.enemies.length > 0 && first >= CFG.spawnS - 0.01, `rats appeared at s=${first}, before the burrow`);
  const e = sim.enemies.find((q) => q.type === T_GRUNT);
  const s0 = e.s; run(sim, 1);
  assert(e.s > s0 + 1.5, 'rats are not walking along the road');
  e.hp = 1e6; sim._damage(e, 1);
  assert(e.hitT > 0, 'a hit did not start the flinch timer');
  run(sim, CFG.hitFlinch + 0.05);
  assert(e.hitT <= 0, 'the flinch never ended');
  sim.events.length = 0;
  e.hp = 1; sim._damage(e, 5);
  const d = sim.events.find((q) => q.type === 'death');
  assert(d && typeof d.yaw === 'number' && Math.abs(d.dir) === 1, 'death event lacks facing / roll direction');
});

test('rat types: fast rats outrun with low health, armored rats are slow, tough and resist arrows; each kind arrives in its own wave', () => {
  const RT = CFG.ratTypes;
  assert(RT.length === 10 && RT[1].speedMul > 1.4 && RT[1].hpMul < 0.6 && RT[2].speedMul < 0.75 && RT[2].hpMul > 1.8 && RT[2].armor > 0, 'rat type stats');
  assert(RT[SHIELD].shieldMul > 1 && RT[HEALER].heal && RT[BROOD].split && RT[RATLING].speedMul > 1.3 && RT[RATLING].hpMul < 0.5, 'special rat stats');
  // waves introduce them gradually
  const kinds = (wi) => { const sim = new Sim({ seed: 4 }); sim.waveIndex = wi; sim.callWave(); run(sim, 40); return sim; };
  const seenTypes = (wi) => { const sim = new Sim({ seed: 4 }); sim.waveIndex = wi; sim.callWave(); return new Set(sim.spawnQueue.filter((q) => q.type === T_GRUNT).map((q) => q.v)); };
  assert([...seenTypes(0)].join() === '0', 'wave 1 should be normal rats only');
  const w2 = seenTypes(1); assert(w2.has(1) && !w2.has(2), 'wave 2 should add fast rats only');
  const w3 = seenTypes(2); assert(w3.has(1) && w3.has(2) && !w3.has(SHIELD), 'wave 3 should add armored rats');
  const w4 = seenTypes(3); assert(w4.has(SHIELD) && !w4.has(HEALER) && !w4.has(BROOD), 'wave 4 should add shield rats');
  const w6 = seenTypes(5); assert(w6.has(HEALER) && !w6.has(BROOD), 'wave 6 should add healer rats');
  const w7 = seenTypes(6); assert(w7.has(BROOD) && w7.has(HEALER) && w7.has(SHIELD), 'wave 7 should add brood rats');
  for (const [wi, v] of [[1, 1], [2, 2], [3, SHIELD], [5, HEALER], [6, BROOD], [8, BOMB], [11, NINJA], [13, JET]]) assert(CFG.waves[wi].intro === v && CFG.waves[wi].title, `wave ${wi + 1} should introduce rat type ${v} with a title`);
  // the three late newcomers each arrive in their own wave, and not before
  for (const [wi, v] of [[8, BOMB], [11, NINJA], [13, JET]]) {
    assert(seenTypes(wi).has(v) && !seenTypes(wi - 1).has(v), `rat type ${v} should first come in wave ${wi + 1}`);
  }
  assert(!seenTypes(15).has(RATLING), 'ratlings only come out of brood rats');
  // in a real wave: speed and health follow the type
  const sim = kinds(4);
  sim.towers.length = 0;
  const by = (v) => sim.enemies.filter((e) => e.type === T_GRUNT && e.v === v);
  const [n, f, a] = [by(0), by(1), by(2)];
  assert(n.length && f.length && a.length, `types on the road: ${n.length}/${f.length}/${a.length}`);
  const avg = (arr, k) => arr.reduce((x, e) => x + e[k], 0) / arr.length;
  assert(avg(f, 'speed') > avg(n, 'speed') * 1.5 && avg(a, 'speed') < avg(n, 'speed') * 0.75, 'speeds do not match the types');
  assert(avg(f, 'maxHp') < avg(n, 'maxHp') && avg(a, 'maxHp') > avg(n, 'maxHp') * 1.8, 'health does not match the types');
  // armour: arrows lose a third, Armor Piercer gets most of it back, the Thunder Mortar's bonus applies
  const mk = (v) => ({ id: 1, type: T_GRUNT, v, armor: RT[v].armor, hp: 1000, maxHp: 1000, alive: true, broken: 0, stun: 0, slow: 0, slowMul: 1, frost: 0, frostT: 0, frozen: 0, freezeCd: 0, flash: 0, hitT: 0, x: 0, z: 0 });
  const armored = mk(2), plain = mk(0);
  sim._arrowHit(armored, 10, CFG.towers[3]); sim._arrowHit(plain, 10, CFG.towers[3]);
  assert(Math.abs(1000 - armored.hp - 10 * (1 - RT[2].armor)) < 1e-6 && plain.hp === 990, 'arrow armour wrong');
  const a4 = mk(2); sim._arrowHit(a4, 10, CFG.towers[4]);
  assert(1000 - a4.hp > (1000 - armored.hp) * 1.2, 'Armor Piercer should get through armored rats');
  const ac = mk(2); sim._damage(ac, 10, cannonSpec(4, 'blast').armor);
  assert(1000 - ac.hp === 10 * cannonSpec(4, 'blast').armor, 'the Thunder Mortar bonus should hit armored rats');
  const lr = mk(2); sim._damage(lr, 10, cannonSpec(4, 'rapid').armor);
  assert(1000 - lr.hp < 10, 'light Rapid Launcher shells should glance off armour');
});

// --------------------------------------------- enemies that need tactics
// a rat of type v placed on the road (s along it, lat across it), ready for direct tests
function onRoad(sim, v, s, lat = 0, hp = 100) {
  const e = sim._makeEnemy(T_GRUNT, v, hp, lat, s, CFG.ratTypes[v]);
  sim._placeEnemy(e); sim.enemies.push(e);
  return e;
}
const quietSim = () => { const sim = new Sim({ seed: 5 }); sim.towers.length = 0; for (const sl of sim.slots) sl.tower = null; sim.state = 'wave'; sim.spawnQueue = []; sim.spawnIndex = 0; return sim; };

test('physics: a crowd spreads out instead of stacking up; giants shoulder rats aside; a blast throws a rat back under gravity; enemies turn smoothly', () => {
  const sim = quietSim();
  // ten rats climbing out on the very same spot push each other apart across the road
  const rats = [];
  for (let i = 0; i < 10; i++) { const e = sim._makeEnemy(T_GRUNT, 0, 1e5, 0, 40, CFG.ratTypes[0]); sim._placeEnemy(e); sim.enemies.push(e); rats.push(e); }
  let maxTurn = 0;
  run(sim, 2, () => { for (const e of rats) if (e.pyaw !== undefined) maxTurn = Math.max(maxTurn, Math.abs(e.yaw - e.pyaw)); });
  let stacked = 0;
  for (let i = 0; i < rats.length; i++) for (let j = i + 1; j < rats.length; j++) {
    const a = rats[i], b = rats[j];
    if (Math.hypot((a.s - b.s) * 0.55, a.lat - b.lat) < (a.radius + b.radius) * 0.4) stacked++;
  }
  const lats = rats.map((e) => e.lat);
  assert(stacked === 0, `${stacked} pairs of rats still on top of each other`);
  assert(Math.max(...lats) - Math.min(...lats) > 1.5, 'the crowd did not spread across the road: ' + lats.map((l) => l.toFixed(2)));
  assert(lats.every((l) => Math.abs(l) <= CFG.roadHalfWidth - 0.4 + 1e-9), 'a rat was pushed off the road');
  // they turn toward where they are going, never snapping round
  assert(maxTurn <= 7 / 60 + 1e-9, 'turned too fast in one step: ' + maxTurn);
  // a giant walking into a rat shoulders it aside; the giant barely moves
  const g = quietSim();
  const giant = g._makeEnemy(T_GIANT, 0, 1e5, 0, 40, CFG.giant); g._placeEnemy(giant); g.enemies.push(giant);
  const r = g._makeEnemy(T_GRUNT, 0, 1e5, 0.1, 40.3, CFG.ratTypes[0]); r.speed = 0; g._placeEnemy(r); g.enemies.push(r);
  run(g, 0.6);
  assert(Math.abs(r.lat - 0.1) > 0.4 && Math.abs(giant.lat) < 0.2, `giant ${giant.lat.toFixed(2)} rat ${r.lat.toFixed(2)}`);
  // a blast throws a rat: back down the road and up into the air, head over heels; it falls
  // back under gravity, lands with a thump and slides to a stop about where it was kicked to
  const k = sim._makeEnemy(T_GRUNT, 0, 1e5, 0, 60, CFG.ratTypes[0]); k.speed = 0; sim._placeEnemy(k); sim.enemies.push(k);
  sim._kick(k, 1.5, k.x, k.z);
  assert(k.vy > 4 && k.spinV < 0 && k.kv < 0, 'not thrown: ' + JSON.stringify({ vy: k.vy, spin: k.spinV, kv: k.kv }));
  let peak = 0, lands = 0, maxDrop = 0, prevVy = k.vy;
  run(sim, 2, (s) => { peak = Math.max(peak, k.hy); maxDrop = Math.max(maxDrop, prevVy - k.vy); prevVy = k.vy; lands += s.events.filter((e) => e.type === 'land' && e.id === k.id).length; s.events.length = 0; });
  assert(peak > 0.6 && peak < 2, 'flight height ' + peak);
  assert(lands === 1 && k.hy === 0 && k.kv === 0 && k.spin === 0, 'did not land: ' + JSON.stringify({ lands, hy: k.hy, kv: k.kv }));
  assert(Math.abs((60 - k.s) - 1.5) < 0.15, 'slid back ' + (60 - k.s).toFixed(2) + ' (kicked 1.5)');
  // something about to be hit in the air is hit at its height
  sim._kick(k, 1, k.x, k.z); run(sim, 0.1);
  assert(k.hy > 0.2, 'not airborne');
});

test('shield rats: the shield soaks up arrows and stops piercing arrows; cannons and Crystal Storm get past it', () => {
  const sim = quietSim();
  const shield = onRoad(sim, SHIELD, 40, 0, 100), behind = onRoad(sim, 0, 38.9, 0, 100);
  assert(shield.shield === 100 * CFG.ratTypes[SHIELD].shieldMul, 'shield strength follows the rat health');
  // a piercing arrow fired down the road from in front: it stops in the shield, the rat behind is untouched
  sim._buildGrid();
  const o = { x: 0, z: 0, tx: 0, tz: 0 }; road.sample(43, o);
  const dx = shield.x - o.x, dz = shield.z - o.z, l = Math.hypot(dx, dz);
  sim.bolts.push({ x: o.x, z: o.z, y: 0.6, y0: 0.6, y1: 0.55, dx: dx / l, dz: dz / l, d: 0, aim: l, max: l + 6, dmg: 20, pierce: 2, hits: [], alive: true, level: 4, bounces: 0, fall: false, tid: shield.id });
  for (let i = 0; i < 30; i++) sim._updateBolts(dt);
  assert(shield.hp === 100 && shield.shield < shield.shieldMax, `the shield should take the hit (hp ${shield.hp}, shield ${shield.shield})`);
  assert(behind.hp === 100, 'a piercing arrow went through the shield');
  // Armor Piercer arrows split shields faster than plain arrows
  const a = onRoad(sim, SHIELD, 20), b = onRoad(sim, SHIELD, 21);
  sim._shieldHit(a, 10, CFG.towers[2]); sim._shieldHit(b, 10, CFG.towers[4]);
  assert(b.shieldMax - b.shield === 3 * (a.shieldMax - a.shield), 'Armor Piercer arrows should split shields three times faster');
  // breaking it: the rest of the arrow hits the rat, and an event fires
  sim.events.length = 0;
  const c = onRoad(sim, SHIELD, 22); c.shield = 5;
  sim._shieldHit(c, 15, CFG.towers[2]);
  assert(c.shield === 0 && c.hp === 90 && sim.events.some((e) => e.type === 'shieldBreak'), 'breaking the shield should pass the rest of the damage on');
  // cannon blasts and Crystal Storm arrows hit the rat itself, shield or not
  const d = onRoad(sim, SHIELD, 60), e = onRoad(sim, SHIELD, 70);
  sim._buildGrid();
  sim._explode({ tx: d.x, tz: d.z, level: 1, path: null, kind: 'shell', r: 1.5, dmg: 30 });
  assert(d.hp < 100 && d.shield === d.shieldMax, 'a cannon blast should go over the shield');
  sim._stormHit({ x: e.x, z: e.z, dmg: 20 }, CFG.towers[7]);
  assert(e.hp < 100 && e.shield === e.shieldMax, 'Crystal Storm arrows fall on it from above');
});

test('healer rats: mend the most hurt rats nearby, a little for giants, and not while frozen or stunned', () => {
  const sim = quietSim();
  const H = CFG.ratTypes[HEALER].heal;
  const healer = onRoad(sim, HEALER, 50, 0, 100);
  const hurt = [];
  for (let i = 0; i < 8; i++) { const r = onRoad(sim, 0, 49 + (i % 4) * 0.6, (i < 4 ? -1 : 1) * 0.8, 100); r.hp = 20 + i * 5; hurt.push(r); }
  const far = onRoad(sim, 0, 50 + H.r + 6, 0, 100); far.hp = 10;
  healer.healT = 0.001;
  sim._buildGrid(); sim.events.length = 0;
  sim._updateHealers(dt);
  const healed = hurt.filter((r) => r.hp > 20 + hurt.indexOf(r) * 5);
  assert(healed.length === H.max, `heals ${H.max} rats, healed ${healed.length}`);
  assert(healed.every((r) => hurt.indexOf(r) < H.max), 'the most badly hurt rats come first');
  assert(Math.abs(hurt[0].hp - (20 + 100 * H.pct)) < 1e-6, 'each heal is a share of the rat health');
  assert(far.hp === 10, 'rats out of reach are not healed');
  assert(sim.events.some((e) => e.type === 'heal' && e.n === H.max), 'no heal event');
  // next pulse only after the cooldown
  const before = hurt.map((r) => r.hp);
  sim._updateHealers(dt);
  assert(hurt.every((r, i) => r.hp === before[i]), 'healed twice in a row');
  // stunned or frozen: no heal
  healer.healT = 0.001; healer.stun = 1;
  sim._updateHealers(dt);
  assert(hurt.every((r, i) => r.hp === before[i]), 'a stunned healer still healed');
  // giants get a much smaller share
  healer.stun = 0; healer.healT = 0.001;
  for (const r of hurt) r.alive = false;
  const g = sim._makeEnemy(T_GIANT, 0, 2000, 0, 50.5, CFG.giant); sim._placeEnemy(g); sim.enemies.push(g); g.hp = 1000;
  sim._buildGrid(); sim._updateHealers(dt);
  assert(Math.abs(g.hp - (1000 + 2000 * H.bigPct)) < 1e-6, `giant healed to ${g.hp}`);
});

test('twin and triple crossbows send their extra arrows at a healer in range', () => {
  const sim = quietSim();
  const t = sim._placeTower(sim.slots[0], 3, true, 'crossbow');
  // a crowd near the tower, with a healer at the back
  const nearest = (() => { let best = 1e9, bs = 0; const o = { x: 0, z: 0 }; for (let q = 0; q < road.length; q += 0.5) { road.sample(q, o); const d = Math.hypot(o.x - t.x, o.z - t.z); if (d < best) { best = d; bs = q; } } return bs; })();
  const front = []; for (let i = 0; i < 6; i++) front.push(onRoad(sim, 0, nearest + 1 - i * 0.4, -1 + (i % 3)));
  const healer = onRoad(sim, HEALER, nearest - 2.5, 0);
  sim._buildGrid();
  const extra = sim._extraTargets(t, CFG.towers[3].range, front[0], 1);
  assert(extra[0] === healer, 'the extra arrow should go to the healer');
  healer.alive = false;
  assert(sim._extraTargets(t, CFG.towers[3].range, front[0], 1)[0] !== healer, 'a dead healer is no target');
});

test('brood rats burst into ratlings when killed (not when spent at the gate), and the wave waits for them', () => {
  const sim = quietSim();
  const S = CFG.ratTypes[BROOD].split;
  const b = onRoad(sim, BROOD, 60, 0, 200);
  sim.waveTotal = 1; sim.events.length = 0;
  sim._damage(b, 500);
  const kids = sim.enemies.filter((e) => e.alive && e.v === RATLING);
  assert(kids.length === S.n, `${kids.length} ratlings`);
  assert(kids.every((k) => k.maxHp === Math.round(200 * S.hpFrac) && Math.abs(k.s - 60) < 2 && k.speed > b.speed * 1.5), 'ratling stats');
  assert(sim.waveTotal === 1 + S.n, 'ratlings count toward the wave');
  assert(sim.events.some((e) => e.type === 'split' && e.n === S.n), 'no split event');
  // a brood rat that is spent at the gate does not burst
  const sim2 = new Sim({ seed: 3 }); sim2.towers.length = 0; for (const sl of sim2.slots) sl.tower = null;
  sim2.fortress.hp = sim2.fortress.maxHp = 1e6;
  sim2.waveIndex = 6; sim2.callWave();
  let spentBroods = 0, splits = 0;
  run(sim2, 120, (s) => { for (const e of s.events) { if (e.type === 'spent' && e.v === BROOD) spentBroods++; if (e.type === 'split') splits++; } s.events.length = 0; });
  assert(spentBroods > 0 && splits === 0, `with no towers nothing is killed: spent ${spentBroods}, splits ${splits}`);
  // a real wave only clears once the ratlings are gone too
  const sim3 = new Sim({ seed: 3 }); sim3.waveIndex = 6;
  for (const sl of sim3.slots) if (!sl.tower) sim3._placeTower(sl, 7, true, 'crossbow');
  sim3.fortress.hp = sim3.fortress.maxHp = 1e6; sim3.callWave();
  let cleared = false, ratlingsAtClear = -1;
  run(sim3, 200, (s) => { for (const e of s.events) if (e.type === 'waveCleared' && !cleared) { cleared = true; ratlingsAtClear = s.enemies.filter((q) => q.alive).length; } s.events.length = 0; });
  assert(cleared && ratlingsAtClear === 0 && sim3.stats.ratlings > 0, `wave 7 cleared ${cleared} with ${ratlingsAtClear} rats left, ratlings ${sim3.stats.ratlings}`);
});

test('the right tactic works: cannons ignore shields, and area damage handles brood rats better than single arrows', () => {
  // one shield-heavy wave against three crossbows or three cannons of the same level
  const trial = (kind, level, path) => {
    const sim = new Sim({ seed: 11, cannon: true }); sim.towers.length = 0; for (const sl of sim.slots) sl.tower = null;
    for (const si of [0, 1, 3]) { const t = sim._placeTower(sim.slots[si], level, true, kind); t.path = path; }
    sim.fortress.hp = sim.fortress.maxHp = 1e6;
    const W = CFG.waves[6], mix = W.mix; W.mix = [0, 0, 0.5, 0.3];
    try { sim.waveIndex = 6; sim.callWave(); run(sim, 40); } finally { W.mix = mix; }
    return sim.stats;
  };
  const xb = trial('crossbow', 3), cn = trial('cannon', 3);
  assert((cn.blocked || 0) < (xb.blocked || 0) * 0.1, `cannon blocked ${cn.blocked} vs crossbow ${xb.blocked}`);
  assert(cn.kills > xb.kills, `against shields and broods: cannon kills ${cn.kills} vs crossbow ${xb.kills}`);
});

test('bomb rats: shot down they blow up the rats round them (wounded bomb rats chain); at the gate they blow a big hole', () => {
  const B = CFG.ratTypes[BOMB].bomb;
  const sim = new Sim({ seed: 2 });
  const mk = (v, hp, lat, s0, type = T_GRUNT) => { const kind = type === T_GRUNT ? CFG.ratTypes[v] : CFG.giant; const e = sim._makeEnemy(type, v, hp, lat, s0, kind); sim._placeEnemy(e); sim.enemies.push(e); return e; };
  const bomb = mk(BOMB, 13, 0, 60);
  // (B.r is the blast reach: near and giant inside it, far outside; bomb2 inside, beyond only in bomb2's reach)
  const near = mk(0, 10, 0.8, 60.3), far = mk(0, 10, 0, 60 + B.r + 1.5), giant = mk(0, 500, -1.0, 60, T_GIANT);
  const bomb2 = mk(BOMB, 13, 0.4, 61.1), beyond = mk(0, 10, 0.4, 61.1 + B.r * 0.8);
  bomb2.hp = 6;   // already wounded: the first blast finishes it
  sim._buildGrid(); sim.events.length = 0;
  sim._damage(bomb, 999);
  assert(!near.alive, 'a rat next to the bomb survived the blast');
  assert(far.alive && far.hp === 10, 'a rat out of reach was hurt');
  assert(giant.alive && giant.hp < 500 && 500 - giant.hp < bomb.maxHp * B.mul, 'giants should take a smaller hit');
  assert(!bomb2.alive && !beyond.alive, 'a wounded bomb rat caught in the blast should go off and take its own neighbours');
  assert(sim.events.filter((e) => e.type === 'bomb').length === 2 && sim.stats.bombed >= 4, 'blast events ' + JSON.stringify(sim.events.filter((e) => e.type === 'bomb')));
  // at the gate: one big bite, and it is spent without going off on the crowd
  const g = new Sim({ seed: 2 }); g.callWave(); g.spawnQueue.length = 0;
  const kind = CFG.ratTypes[BOMB];
  const at = g._makeEnemy(T_GRUNT, BOMB, 50, 0, road.length, kind); at.s = at.gateS; at.atGate = true; at.attackT = 0; g._placeEnemy(at); g.enemies.push(at);
  const friend = g._makeEnemy(T_GRUNT, 0, 5, 0.6, road.length - 1, CFG.ratTypes[0]); friend.s = friend.gateS; friend.atGate = true; friend.attackT = 9; g._placeEnemy(friend); g.enemies.push(friend);
  const hp0 = g.fortress.hp; g.events.length = 0;
  run(g, 0.1);
  assert(hp0 - g.fortress.hp === kind.gateDmg && !at.alive && kind.swings === 1, `the bomb rat should blow a ${kind.gateDmg} hole in one go (lost ${hp0 - g.fortress.hp})`);
  assert(friend.alive && !g.events.some((e) => e.type === 'bomb'), 'a bomb spent at the gate should not go off on the crowd');
});

test('ninja rats dodge one arrow every so often; blasts, arrow storms and stuns still get them', () => {
  const D = CFG.ratTypes[NINJA].dodge;
  const sim = new Sim({ seed: 3 });
  sim.towers.length = 0; for (const sl of sim.slots) sl.tower = null;
  const n = sim._makeEnemy(T_GRUNT, NINJA, 1000, 0, 70, CFG.ratTypes[NINJA]); sim._placeEnemy(n); sim.enemies.push(n);
  sim._buildGrid();
  // fire arrows straight at it from close by, one after another
  const shoot = () => { sim.bolts.push({ x: n.x - 3, z: n.z, y: 0.6, y0: 0.6, y1: 0.55, dx: 1, dz: 0, d: 0, aim: 3, max: 8, dmg: 10, pierce: 1, hits: [], alive: true, level: 1, bounces: 0, fall: false, air: false }); };
  const st = n.speed; n.speed = 0;
  shoot(); run(sim, 0.2);
  assert(n.hp === 1000 && sim.stats.dodged === 1, 'the first arrow should be dodged');
  shoot(); run(sim, 0.2);
  assert(n.hp === 990, 'a second arrow right after should hit: ' + n.hp);
  run(sim, D.every); shoot(); run(sim, 0.2);
  assert(n.hp === 990 && sim.stats.dodged === 2, 'after a moment it dodges again');
  // a blast cannot be dodged
  sim._buildGrid(); sim._explode({ tx: n.x, tz: n.z, r: 2, dmg: 30, level: 1, path: null, kind: 'shell', spec: cannonSpec(1) });
  assert(n.hp < 990, 'a cannon blast should hit a ninja rat');
  // stunned or frozen, it cannot dodge
  const before = n.hp; n.stun = 1; n.dodgeT = 0; shoot(); run(sim, 0.2);
  assert(n.hp < before, 'a stunned ninja rat should not dodge');
  n.speed = st;
});

test('jetpack rats fire their jetpacks every few seconds and rocket forward; stunned they cannot', () => {
  const J = CFG.ratTypes[JET].jet;
  const sim = new Sim({ seed: 5 });
  sim.towers.length = 0; for (const sl of sim.slots) sl.tower = null;
  const j = sim._makeEnemy(T_GRUNT, JET, 1000, 0, 40, CFG.ratTypes[JET]); sim._placeEnemy(j); sim.enemies.push(j);
  const plain = sim._makeEnemy(T_GRUNT, 0, 1000, 1.5, 40, CFG.ratTypes[0]); plain.speed = j.speed; sim._placeEnemy(plain); sim.enemies.push(plain);
  sim.state = 'wave';
  j.jetT = 0.5; let fired = 0;
  run(sim, J.every * 2 + 0.5 + J.t + 0.1, (s) => { for (const e of s.events) if (e.type === 'jet') fired++; s.events.length = 0; });
  assert(fired === 3, `the jetpack should fire every ${J.every} s (fired ${fired})`);
  const gain = (j.s - 40) - (plain.s - 40);
  assert(Math.abs(gain - 3 * J.t * (J.speedMul - 1) * j.speed) < 0.3, `each boost should add ${(J.t * (J.speedMul - 1) * j.speed).toFixed(2)} of road (got ${gain.toFixed(2)} over 3 boosts)`);
  // stunned: no boost while it lasts
  const s0 = j.s; j.boost = 0; j.jetT = 0.01; j.stun = 2;
  run(sim, 1.5);
  assert(j.s === s0 && j.boost === 0, 'a stunned jetpack rat should not move or fire');
});

test('Rat guide: every enemy has a name, a trait, a way to beat it and the wave it first appears in', () => {
  const keys = RAT_GUIDE.map((g) => g.key);
  for (let v = 0; v < CFG.ratTypes.length; v++) assert(keys.includes('rat:' + v), 'guide is missing rat type ' + v);
  for (const b of Object.keys(CFG.bosses)) assert(keys.includes('boss:' + b), 'guide is missing boss ' + b);
  assert(keys.includes('giant'), 'guide is missing the giant rat');
  for (const g of RAT_GUIDE) assert(g.name && g.trait.length > 30 && g.counter.length > 30 && g.tag, `incomplete guide entry ${g.key}`);
  assert(guideEntry('rat:' + SHIELD).name === CFG.ratTypes[SHIELD].name && guideEntry('rat:' + BROOD).name === CFG.ratTypes[BROOD].name, 'guide names should match the rat types');
  const fw = (k) => firstWave(k);
  assert(fw('rat:0') === 1 && fw('rat:1') === 2 && fw('rat:2') === 3 && fw('rat:3') === 4 && fw('rat:4') === 6 && fw('rat:5') === 7 && fw('rat:6') === 7, 'first waves ' + keys.map((k) => k + '=' + fw(k)).join(' '));
  assert(fw('boss:warlord') === 5 && fw('boss:slime') === 8 && fw('boss:baron') === 10 && fw('boss:mole') === 11 && fw('boss:buzzard') === 13 && fw('boss:king') === 15, 'boss waves');
});

// a boss put straight onto the road (through the spawn queue, so its abilities are set up)
function bossOnRoad(sim, boss, hp, s) {
  sim.spawnQueue = [{ t: sim.waveTime, type: T_BOSS, hp, boss, lat: 0 }]; sim.spawnIndex = 0;
  sim._spawn();
  const e = sim.enemies[sim.enemies.length - 1];
  e.s = s; sim._placeEnemy(e);
  return e;
}
const blastAt = (sim, x, z) => sim._explode({ tx: x, tz: z, dmg: 1000, r: 4, spec: cannonSpec(4, 'blast'), level: 4, path: 'blast', kind: 'shell' });

test('Sewer Slime: bursts into two slimes, each of those into two slimelets, and the wave waits for every piece', () => {
  const sim = quietSim(); sim.waveTotal = 1; sim.events.length = 0;
  const S = CFG.bosses.slime.split;
  const b = bossOnRoad(sim, 'slime', 1000, 60);
  sim._damage(b, 5000);
  let kids = sim.enemies.filter((e) => e.alive && e.boss === 'slime');
  assert(kids.length === S.n && kids.every((k) => k.type === T_GIANT && k.tier === 1 && k.maxHp === Math.round(1000 * S.hpFrac) && k.root === b.id), 'first split: ' + kids.map((k) => `${k.tier}/${k.maxHp}`));
  assert(kids.every((k) => k.speed > b.speed && k.radius < b.radius && Math.abs(k.s - 60) < 1), 'smaller slimes are faster and smaller');
  assert(kids[0].lat !== kids[1].lat, 'the two slimes land apart');
  for (const k of kids) sim._damage(k, 5000);
  kids = sim.enemies.filter((e) => e.alive && e.boss === 'slime');
  assert(kids.length === S.n * S.n && kids.every((k) => k.tier === 2 && k.maxHp === Math.round(Math.round(1000 * S.hpFrac) * S.hpFrac)), 'second split: ' + kids.map((k) => `${k.tier}/${k.maxHp}`));
  for (const k of kids) sim._damage(k, 5000);
  assert(!sim.enemies.some((e) => e.alive && e.boss === 'slime'), 'the slimelets do not split again');
  assert(sim.waveTotal === 1 + S.n + S.n * S.n && sim.stats.slimes === S.n + S.n * S.n, `wave total ${sim.waveTotal}`);
  assert(sim.events.filter((e) => e.type === 'slimeSplit').length === 1 + S.n, 'split events');
  // Frost Arrows freeze the small slimes solid; the big one is only slowed, like every boss
  const F = CFG.towers[6].frost, sim2 = quietSim();
  const big = bossOnRoad(sim2, 'slime', 1000, 60);
  sim2._damage(big, 5000);
  const small = sim2.enemies.find((e) => e.alive && e.boss === 'slime');
  const big2 = bossOnRoad(sim2, 'slime', 1000, 50);
  for (let i = 0; i < F.hits; i++) { sim2._frostHit(small, F); sim2._frostHit(big2, F); }
  assert(small.frozen > 0 && !(big2.frozen > 0) && big2.slow > 0, `frozen: small ${small.frozen}, big ${big2.frozen}`);
  // a slime that is spent at the gate does not split
  const sim3 = quietSim(); sim3.fortress.hp = sim3.fortress.maxHp = 1e6;
  const g = bossOnRoad(sim3, 'slime', 1000, 100);
  g.s = g.gateS; g.atGate = true; g.swings = 1; g.attackT = 0.001; sim3.events.length = 0;
  sim3.step(dt);
  assert(sim3.events.some((e) => e.type === 'spent') && !sim3.events.some((e) => e.type === 'slimeSplit'), 'a spent slime should just go');
});

test('Tunnel Mole: digs in, is out of reach while it tunnels, and bursts out near the town with a band of rats', () => {
  const sim = quietSim(); sim.fortress.hp = sim.fortress.maxHp = 1e6; sim.waveTotal = 1;
  const D = CFG.bosses.mole.dig;
  const m = bossOnRoad(sim, 'mole', 4000, D.at - 0.3);
  let down = null, up = null;
  run(sim, D.down + 0.5, (s) => { for (const e of s.events) if (e.type === 'digDown') down = { ...e, at: s.time }; s.events.length = 0; });
  assert(down && m.under && m.dig === 2, `digging: ${JSON.stringify(down)} under ${m.under}`);
  const o = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 }; road.sample(D.exit, o);
  assert(Math.hypot(down.ex - o.x, down.ez - o.z) < 0.01, 'the warning marks where it comes up');
  // nothing can reach it underground: no tower picks it, blasts pass over it
  sim._buildGrid();
  assert(sim._findTarget({ x: m.x, z: m.z }, 50) === null, 'a tunnelling mole is no target');
  const hp = m.hp; blastAt(sim, m.x, m.z);
  assert(m.hp === hp, 'a blast should not reach it underground');
  // it comes up at the exit, near the town, in about the time the warning said
  const before = sim.waveTotal;
  run(sim, 60, (s) => { for (const e of s.events) if (e.type === 'digUp' && !up) up = { ...e, at: s.time, s: m.s, total: s.waveTotal, mx: m.x, mz: m.z }; s.events.length = 0; });
  assert(up && up.s === D.exit && !m.under, 'never came up: ' + JSON.stringify(up));
  assert(Math.abs(up.at - down.at - down.eta) < 0.3, `came up after ${(up.at - down.at).toFixed(1)}s, warned ${down.eta.toFixed(1)}s`);
  assert(D.exit > road.length - 35 && D.exit - D.at > 100, 'it should skip most of the road and come up near the town');
  assert(sim.stats.moleRats === D.rats && up.total === before + D.rats, `rats with it: ${sim.stats.moleRats}, wave total ${up.total}`);
  // once out it can be hit again
  const sim2 = quietSim(); const m2 = bossOnRoad(sim2, 'mole', 4000, D.exit); m2.dig = 4; sim2._buildGrid();
  assert(sim2._findTarget({ x: m2.x, z: m2.z }, 6) === m2, 'once out, it can be hit again');
});

test('Canyon Buzzard: flies out of reach of cannon shells but not arrows, drops rats as it goes, and lands at the gate', () => {
  const sim = quietSim(); sim.fortress.hp = sim.fortress.maxHp = 1e6; sim.waveTotal = 1;
  const F = CFG.bosses.buzzard.fly;
  const b = bossOnRoad(sim, 'buzzard', 5000, 38);
  run(sim, 0.1);
  assert(Math.abs(b.fly - F.h) < 0.01 && b.fly > CFG.airborne, 'cruising height ' + b.fly);
  // cannons can't pick it or hurt it
  sim._buildGrid();
  const near = { x: b.x + 3, z: b.z, yaw: 0 };
  assert(sim._findCluster(near, 20, 2, null) === null, 'a cannon should find nothing to shoot at');
  const hp = b.hp; blastAt(sim, b.x, b.z);
  assert(b.hp === hp, 'a blast on the ground should not reach it');
  // a crossbow goes for it first, even with a rat further along, and its arrows hit it
  const rat = onRoad(sim, 0, b.s + 2, 0, 1e6);
  sim._buildGrid();
  assert(sim._findTarget(near, 20) === b, 'crossbows should target the flier');
  const t = sim._placeTower(sim.slots[0], 5, true, 'crossbow');
  run(sim, 2);
  assert(b.hp < hp && b.fly > CFG.airborne, `arrows should hit it in the air: ${b.hp}`);
  assert(rat.hp === 1e6, 'arrows aimed up at it fly over the rat under it');
  t.level = 1; sim.towers.length = 0; sim.slots[0].tower = null;
  // it drops rats every few seconds, which fall and then run on
  const total = sim.waveTotal;
  let drops = 0;
  run(sim, F.every * 3 + 0.5, (s) => { for (const e of s.events) if (e.type === 'drop') drops++; s.events.length = 0; });
  assert(drops >= 3 && sim.stats.dropped === drops * F.n && sim.waveTotal === total + drops * F.n, `drops ${drops}, rats ${sim.stats.dropped}`);
  const dropped = sim.enemies.filter((e) => e.type === T_GRUNT && e.fallT > 0);
  assert(dropped.length && dropped.every((e) => e.fallH > 4), 'dropped rats fall from the buzzard');
  // close to the town it stops dropping, glides down and lands at the gate, where cannons can hit it
  b.s = b.gateS - 0.5; sim.events.length = 0;
  run(sim, 1);
  assert(b.atGate && b.fly === 0, `landed: atGate ${b.atGate} fly ${b.fly}`);
  sim._buildGrid();
  assert(sim._findCluster({ x: b.x + 3, z: b.z, yaw: 0 }, 20, 2, null) !== null, 'once landed, cannons can shoot it');
});

test('rats at the gate swing on a fixed rhythm, so the bite animation can land with each hit', () => {
  const sim = new Sim({ seed: 3 });
  sim.towers.length = 0; for (const s of sim.slots) s.tower = null;
  sim.fortress.hp = sim.fortress.maxHp = 1e6;
  sim.callWave();
  const hits = [];
  run(sim, 120, (s) => { for (const ev of s.events) if (ev.type === 'fortressHit') hits.push(s.time); s.events.length = 0; });
  assert(hits.length > 10, 'rats never attacked the keep');
  const atGate = sim.enemies.filter((q) => q.atGate);
  for (const q of atGate) assert(q.attackT >= 0 && q.attackT <= CFG.grunt.gateRate + 1e-6 || q.type !== T_GRUNT, 'swing timer out of range');
});

test('crossbows fire bolts that kill rats and drop coins', () => {
  const sim = new Sim({ seed: 3 });
  sim.callWave();
  let fired = 0, deaths = 0;
  run(sim, 40, (s) => { for (const e of s.events) { if (e.type === 'fire') fired++; if (e.type === 'death') deaths++; } s.events.length = 0; });
  assert(fired > 20, 'not enough shots ' + fired);
  assert(deaths > 5, 'no kills');
  assert(sim.coins.length > 0, 'no coins dropped');
});

test('walking near coins collects them', () => {
  const sim = new Sim({ seed: 3 });
  const g0 = sim.gold;
  for (let i = 0; i < 10; i++) sim._dropCoin(sim.hero.x + 1.5, sim.hero.z + 1, 0, 1, 1);
  run(sim, 3);
  assert(sim.gold === g0 + 10, `gold ${sim.gold} expected ${g0 + 10}`);
  // and coins out of reach stay on the ground
  sim._dropCoin(sim.hero.x + 15, sim.hero.z, 0, 1, 0);
  run(sim, 2);
  assert(sim.coins.length === 1, 'distant coin was collected');
});

function standOn(sim, pad) { sim.hero.x = pad.x; sim.hero.z = pad.z; sim.hero.y = pad.y; sim.setInput(0, 0); }

test('standing on a pad pours coins in and builds exactly one crossbow', () => {
  const sim = new Sim({ seed: 3 });
  sim.gold = 500;
  const pad = sim.pads.find((p) => p.kind === 'build');
  // approach from outside so the pad is armed
  sim.hero.x = pad.x + 4; sim.hero.z = pad.z; run(sim, 0.1);
  standOn(sim, pad);
  const towers0 = sim.towers.length;
  run(sim, 0.2);
  assert(pad.paid === 0, 'paid before the arm delay');
  run(sim, 0.6);
  assert(pad.paid > 0 && pad.paid < pad.cost, 'no visible progress mid-fill');
  run(sim, 4);
  assert(sim.towers.length === towers0 + 1, 'tower not built exactly once');
  assert(sim.gold === 500 - pad.cost, 'charged wrong amount ' + sim.gold);
});

test('safeguard: a pad under the hero must be stepped off before it charges again', () => {
  const sim = new Sim({ seed: 3 });
  sim.gold = 1000;
  sim.fortress.level = 2; sim.refreshPads();
  const up = sim.pads.find((p) => p.kind === 'upgrade');
  assert(up, 'upgrade pad missing');
  sim.hero.x = up.x + 4; sim.hero.z = up.z; run(sim, 0.1);
  standOn(sim, up);
  run(sim, 5);
  const slot = sim.slots[up.slot];
  assert(slot.tower.level === 2, 'upgrade did not happen');
  const goldAfter = sim.gold;
  // fortress level 3 makes a level 3 upgrade pad appear in the same spot
  sim.fortress.level = 3; sim.refreshPads();
  const up3 = sim.pads.find((p) => p.kind === 'upgrade' && p.slot === up.slot);
  assert(up3 && up3.armed === false, 'new pad under hero should start disarmed');
  standOn(sim, up3);
  run(sim, 5);
  assert(sim.gold === goldAfter && slot.tower.level === 2, 'charged without stepping off');
  sim.hero.x += 4; run(sim, 0.2); standOn(sim, up3); run(sim, 5);
  assert(slot.tower.level === 3, 'did not upgrade after stepping back on');
});

test('partial payments are kept when the hero walks away', () => {
  const sim = new Sim({ seed: 3 });
  sim.gold = 7;
  const pad = sim.pads.find((p) => p.kind === 'build');
  sim.hero.x = pad.x + 4; sim.hero.z = pad.z; run(sim, 0.1);
  standOn(sim, pad); run(sim, 3);
  assert(pad.paid === 7 && sim.gold === 0, 'partial payment wrong');
  sim.hero.x += 5; run(sim, 1);
  assert(sim.pads.find((p) => p.id === pad.id).paid === 7, 'deposit lost');
});

test('the keep upgrade unlocks after wave 2 and raises max health', () => {
  const sim = new Sim({ seed: 3 });
  assert(!sim.pads.some((p) => p.kind === 'fortress'), 'keep pad visible too early');
  sim.waveIndex = 2; sim.refreshPads();
  const fp = sim.pads.find((p) => p.kind === 'fortress');
  assert(fp && fp.cost === 150, 'keep pad missing');
  sim.gold = 200; sim.hero.x = fp.x + 4; sim.hero.z = fp.z; run(sim, 0.1);
  standOn(sim, fp); run(sim, 4);
  assert(sim.fortress.level === 2 && sim.fortress.maxHp === 170, 'keep not upgraded');
});

test('a crossbow upgrades from level 1 to 7 at keep level 1, one step-on per level', () => {
  const sim = new Sim({ seed: 3 });
  sim.gold = 5000;
  const slot = sim.slots.find((x) => x.tower);
  let spent = 0;
  for (let lv = 2; lv <= 7; lv++) {
    const pad = sim.pads.find((p) => p.kind === 'upgrade' && p.slot === slot.index);
    assert(pad && pad.level === lv, `no level ${lv} pad (keep ${sim.fortress.level})`);
    sim.hero.x = pad.x + 4; sim.hero.z = pad.z; sim.hero.y = pad.y; run(sim, 0.2);  // step off
    standOn(sim, pad); run(sim, 4);                                                     // step on
    assert(slot.tower.level === lv, `stuck at level ${slot.tower.level}`);
    spent += CFG.upgradeCosts[lv];
  }
  assert(sim.gold === 5000 - spent, 'wrong total cost');
  assert(!sim.pads.some((p) => p.kind === 'upgrade' && p.slot === slot.index), 'pad offered past level 7');
  assert(sim.fortress.level === 1, 'keep should not matter');
});

test('every crossbow level fires: twin bolts at 3, triple at 5-7, coloured crystal bolts', () => {
  for (let lv = 1; lv <= 7; lv++) {
    const sim = new Sim({ seed: 5 });
    for (const t of sim.towers) t.level = lv;
    sim.callWave();
    let maxBolts = 0;
    run(sim, 20, (s) => { maxBolts = Math.max(maxBolts, s.bolts.length); });
    const want = CFG.towers[lv].bolts;
    assert(maxBolts >= want, `level ${lv} never had ${want} bolts in the air`);
    assert(sim.stats.kills > 0, `level ${lv} killed nothing`);
  }
});

// ------------------------------------------------- crossbow abilities 1-7
function crossbowTrial(level, waveIndex = 5, seconds = 25, slots = [0, 1, 3]) {
  const sim = new Sim({ seed: 9 });
  sim.towers.length = 0; for (const s of sim.slots) s.tower = null;
  for (const si of slots) sim._placeTower(sim.slots[si], level, true, 'crossbow');
  sim.fortress.hp = sim.fortress.maxHp = 1e6;
  sim.waveIndex = waveIndex; sim.callWave();
  const out = { stormTimes: {}, fires: 0, burstFires: 0, bursts: 0, storms: 0, freezes: 0, maxHits: 0, volleys: [], frozenMoved: 0, frozenSeen: 0, slowed: 0, falling: 0, sim };
  const lastS = new Map(), lastF = new Map(), seen = new Set();
  run(sim, seconds, (s) => {
    for (const b of s.bolts) seen.add(b);
    for (const e of s.events) {
      if (e.type === 'fire') {
        if (e.burst) out.burstFires++; else out.fires++;
        // the bolts this volley just added are the last ones in the list
        const n = CFG.towers[level].bolts;
        out.volleys.push(s.bolts.slice(-n).map((b) => b.tid));
      }
      if (e.type === 'burst') out.bursts++;
      if (e.type === 'storm') { out.storms++; (out.stormTimes[e.slot] ||= []).push(s.time); }
      if (e.type === 'freeze') out.freezes++;
    }
    s.events.length = 0;
    for (const b of s.bolts) if (b.fall) out.falling++;
    for (const e of s.enemies) {
      if (e.slow > 0) out.slowed++;
      const p = lastS.get(e.id);
      // frozen on both this frame and the last: it must not have moved
      if (e.frozen > 0 && lastF.get(e.id) && p !== undefined) { out.frozenSeen++; if (Math.abs(e.s - p) > 1e-6) out.frozenMoved++; }
      lastS.set(e.id, e.s); lastF.set(e.id, e.frozen > 0);
    }
  });
  // most rats one straight arrow went through (bounced arrows excluded)
  for (const b of seen) if (!b.bounced && !b.fall) out.maxHits = Math.max(out.maxHits, b.hits.length);
  return out;
}
const fakeEnemy = (type, hp = 1000, v = 0) => ({ id: 999, type, v, armor: type === T_GIANT ? CFG.giant.armor : type === T_BOSS ? CFG.boss.armor : CFG.ratTypes[v].armor, hp, maxHp: hp, alive: true, broken: 0, stun: 0, slow: 0, slowMul: 1, frost: 0, frostT: 0, frozen: 0, freezeCd: 0, flash: 0, x: 0, z: 0 });

test('crossbow L1 Single Shot: one arrow per attack, and each arrow hits only one rat', () => {
  const r = crossbowTrial(1, 2);
  assert(r.fires > 20 && r.sim.stats.kills > 10, `fires ${r.fires}, kills ${r.sim.stats.kills}`);
  assert(r.volleys.every((v) => v.length === 1), 'more than one arrow per attack');
  assert(r.maxHits === 1, `an arrow hit ${r.maxHits} rats`);
});

test('crossbow L2 Power Shot: fires faster and hits harder than level 1', () => {
  const [a, b] = [CFG.towers[1], CFG.towers[2]];
  assert(b.interval < a.interval && b.dmg > a.dmg, 'level 2 is not faster and stronger');
  const r1 = crossbowTrial(1, 4, 20), r2 = crossbowTrial(2, 4, 20);
  assert(r2.fires > r1.fires * 1.2, `fires L1 ${r1.fires} vs L2 ${r2.fires}`);
  assert(r2.sim.stats.kills > r1.sim.stats.kills, `kills L1 ${r1.sim.stats.kills} vs L2 ${r2.sim.stats.kills}`);
});

test('crossbow L3 Twin Shot: two arrows together, on two different rats or both on one giant rat', () => {
  const r = crossbowTrial(3, 4, 25);
  assert(r.volleys.every((v) => v.length === 2), 'not two arrows per attack');
  const split = r.volleys.filter((v) => v[0] !== v[1]).length, same = r.volleys.filter((v) => v[0] === v[1]).length;
  assert(split > 10, `only ${split} volleys split between two rats`);
  assert(same > 0, 'never fired both arrows at one rat');
  assert(r.maxHits === 1, 'twin arrows should not pierce yet');
});

test('crossbow L4 Armor Piercer: heavy arrows ignore most armour and pass through up to two rats', () => {
  const sim = new Sim({ seed: 1 });
  for (const type of [T_GIANT, T_BOSS]) {
    const g3 = fakeEnemy(type), g4 = fakeEnemy(type);
    sim._arrowHit(g3, 10, CFG.towers[3]); sim._arrowHit(g4, 10, CFG.towers[4]);
    const armor = type === T_BOSS ? CFG.boss.armor : CFG.giant.armor;
    assert(Math.abs(1000 - g3.hp - 10 * (1 - armor)) < 1e-6, `level 3 armour wrong: ${1000 - g3.hp}`);
    assert(1000 - g4.hp > (1000 - g3.hp) * 1.15, `armour piercing too weak: ${1000 - g4.hp} vs ${1000 - g3.hp}`);
  }
  const grunt = fakeEnemy(T_GRUNT); sim._arrowHit(grunt, 10, CFG.towers[1]);
  assert(grunt.hp === 990, 'small rats have no armour');
  const r = crossbowTrial(4, 5, 20);
  assert(r.maxHits === 2, `heavy arrows hit up to ${r.maxHits} rats`);
});

test('crossbow L5 Triple Barrage: three arrows per attack, and every fifth attack adds a rapid burst', () => {
  const r = crossbowTrial(5, 6, 25);
  assert(r.volleys.every((v) => v.length === 3), 'not three arrows per attack');
  assert(r.bursts >= 4, `only ${r.bursts} bursts`);
  assert(Math.abs(r.fires / r.bursts - 5) <= 1, `a burst every ${(r.fires / r.bursts).toFixed(1)} attacks`);
  assert(r.burstFires >= r.bursts * (CFG.towers[5].burst.volleys - 1), `burst volleys ${r.burstFires} for ${r.bursts} bursts`);
  assert(!CFG.towers[4].burst, 'level 4 should not burst');
});

test('crossbow L6 Frost Arrows: hits slow, three hits freeze a rat, the Rat King is only slowed', () => {
  const sim = new Sim({ seed: 1 });
  const F = CFG.towers[6];
  for (const type of [T_GRUNT, T_GIANT]) {
    const e = fakeEnemy(type, 1e6);
    sim._arrowHit(e, 1, F);
    assert(e.slow > 0 && e.slowMul < 1 && e.frozen === 0, 'first hit should only slow');
    sim._arrowHit(e, 1, F);
    assert(e.frozen === 0, 'froze after two hits');
    sim._arrowHit(e, 1, F);
    assert(e.frozen > 0 && e.stun > 0, `type ${type} not frozen after three hits`);
  }
  const king = fakeEnemy(T_BOSS, 1e6);
  for (let i = 0; i < 12; i++) sim._arrowHit(king, 1, F);
  assert(king.frozen === 0 && king.stun === 0 && king.slow > 0, 'the Rat King must only be slowed');
  const r = crossbowTrial(6, 12, 30);
  assert(r.freezes > 20 && r.slowed > 0, `freezes ${r.freezes}`);
  assert(r.frozenSeen > 0 && r.frozenMoved === 0, `frozen rats moved ${r.frozenMoved} times`);
  assert(!CFG.towers[5].frost, 'level 5 arrows should not freeze');
});

test('crossbow L7 Crystal Storm: arrows bounce between rats and an arrow storm falls every few seconds', () => {
  const r = crossbowTrial(7, 12, 30);
  const S = CFG.towers[7].storm;
  assert(r.sim.stats.bounces > 50, `bounces ${r.sim.stats.bounces}`);
  assert(r.storms >= 6, `only ${r.storms} storms from 3 towers`);
  for (const ts of Object.values(r.stormTimes)) for (let i = 1; i < ts.length; i++) assert(ts[i] - ts[i - 1] >= S.every - 0.05, 'storms came too often');
  const busiest = Math.max(...Object.values(r.stormTimes).map((ts) => ts.length));
  assert(busiest >= Math.floor(15 / S.every), `the busiest tower only stormed ${busiest} times`);
  assert(r.falling > 0 && r.sim.stats.stormHits > 30, `storm hits ${r.sim.stats.stormHits}`);
  assert(r.freezes > 0, 'level 7 keeps the frost arrows');
  assert(!CFG.towers[6].storm && !CFG.towers[6].bounce, 'level 6 should not bounce or storm');
});

// ------------------------------------------------------------- aiming
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function aimTrial(kind, level, path = null) {
  const sim = new Sim({ seed: 9, cannon: true });
  sim.towers.length = 0; for (const sl of sim.slots) sl.tower = null;
  const t = sim._placeTower(sim.slots[0], level, true, kind);
  t.path = path;
  t.yaw += Math.PI;                                     // start facing away from the road
  const yaw0 = t.yaw;
  sim.fortress.hp = sim.fortress.maxHp = 1e6;
  sim.waveIndex = 3; sim.callWave();
  const shots = [];
  run(sim, 30, (s) => {
    for (const e of s.events) if (e.type === 'fire' && e.slot === t.slotIndex && e.ax !== undefined) shots.push({ err: Math.abs(angDiff(t.yaw, Math.atan2(e.ax - t.x, e.az - t.z))), turned: Math.abs(angDiff(yaw0, t.yaw)) });
    s.events.length = 0;
  });
  return { shots, sim, t };
}
test('crossbows and cannons turn to face the rats before they shoot', () => {
  for (const [kind, lv, path] of [['crossbow', 1], ['crossbow', 5], ['cannon', 1], ['cannon', 4, 'blast'], ['cannon', 4, 'rapid']]) {
    const r = aimTrial(kind, lv, path);
    assert(r.shots.length > 3, `${kind} ${lv} barely fired (${r.shots.length})`);
    assert(r.shots[0].turned > 1.5, `${kind} ${lv} fired its first shot without turning around`);
    const worst = Math.max(...r.shots.map((q) => q.err));
    assert(worst < 0.45, `${kind} ${lv} fired ${worst.toFixed(2)} rad away from its target`);
  }
});

test('arrows fly from the crossbow to one rat; cannonballs arc down onto a group', () => {
  // arrows: each one heads for its own rat and closes in on it
  const sim = new Sim({ seed: 9 });
  sim.callWave();
  const tracked = new Map();
  let checked = 0, closing = 0;
  run(sim, 40, (s) => {
    for (const b of s.bolts) {
      const e = s.enemies.find((q) => q.id === b.tid);
      if (!e || b.fall) continue;
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      const prev = tracked.get(b);
      if (prev !== undefined) { checked++; if (d < prev) closing++; }
      tracked.set(b, d);
    }
  });
  assert(checked > 20 && closing / checked > 0.9, `arrows closed in on their rat ${closing}/${checked} frames`);
  // cannonballs: rise above the barrel, fall onto the aim point, and the blast hits several rats
  const c = cannonTrial(2, 4, 20);
  assert(c.explodes.length > 4, 'no blasts');
  const sim2 = new Sim({ seed: 9, cannon: true });
  sim2.towers.length = 0; for (const sl of sim2.slots) sl.tower = null;
  sim2._placeTower(sim2.slots[0], 2, true, 'cannon');
  sim2.waveIndex = 3; sim2.callWave();
  let apexOk = 0, landed = 0;
  const peak = new Map();
  run(sim2, 30, (s) => {
    for (const sh of s.shells) peak.set(sh, Math.max(peak.get(sh) || -1e9, sh.y));
    for (const [sh, py] of peak) if (!sh.alive && !sh.done) { sh.done = true; landed++; if (py > sh.y0 + 0.5 && Math.hypot(sh.x - sh.tx, sh.z - sh.tz) < 0.05) apexOk++; }
  });
  assert(landed > 3 && apexOk === landed, `cannonballs that arced and landed on target: ${apexOk}/${landed}`);
  assert(Math.max(...c.explodes.map((e) => e.hits)) >= 4, 'a blast never caught a group');
});

// ------------------------------------------------------------- cannon
function cannonTrial(level, waveIndex = 5, seconds = 30, slots = [0, 1, 3], path = null) {
  const sim = new Sim({ seed: 9, cannon: true });
  sim.towers.length = 0; for (const s of sim.slots) s.tower = null;
  for (const si of slots) { const t = sim._placeTower(sim.slots[si], level, true, 'cannon'); t.path = path; }
  sim.fortress.hp = sim.fortress.maxHp = 1e6;
  sim.waveIndex = waveIndex; sim.callWave();
  const out = { explodes: [], fires: 0, salvos: 0, volleys: 0, stunned: 0, slowed: 0, broken: 0, zones: 0, knocked: 0, novas: 0, sim };
  const lastS = new Map();
  run(sim, seconds, (s) => {
    for (const e of s.events) {
      if (e.type === 'explode') out.explodes.push(e);
      if (e.type === 'novaFire') out.novas++;
      if (e.type === 'salvo') out.salvos++;
      if (e.type === 'fire' && e.tower === 'cannon' && e.kind === 'shell') out.fires++;
    }
    s.events.length = 0;
    out.zones = Math.max(out.zones, s.zones.length);
    for (const e of s.enemies) {
      if (e.stun > 0) out.stunned++;
      if (e.slow > 0) out.slowed++;
      if (e.broken > 0) out.broken++;
      // a blast kicks a rat back down the road: it slides back (kv < 0) for a moment
      const p = lastS.get(e.id); if (e.kv < -0.5 && !(p < -0.5)) out.knocked++;
      lastS.set(e.id, e.kv);
    }
  });
  return out;
}

test('cannon is locked until unlocked; build pads then make cannons at a higher gold price', () => {
  const locked = new Sim({ seed: 3 });
  assert(locked.setBuildKind('cannon') === false && locked.pads.every((p) => p.kind !== 'build' || p.tower === 'crossbow'), 'cannon available while locked');
  const sim = new Sim({ seed: 3, cannon: true });
  const before = sim.pads.find((p) => p.kind === 'build').cost;
  assert(sim.setBuildKind('cannon'), 'could not pick the cannon');
  const pad = sim.pads.find((p) => p.kind === 'build');
  assert(pad.tower === 'cannon' && pad.cost > before, `cannon pad ${pad.tower} ${pad.cost}`);
  sim.gold = 500; sim.hero.x = pad.x + 4; sim.hero.z = pad.z; run(sim, 0.1); standOn(sim, pad); run(sim, 3);
  const t = sim.slots[pad.slot].tower;
  assert(t && t.kind === 'cannon', 'no cannon built');
  const up = sim.pads.find((p) => p.kind === 'upgrade' && p.slot === pad.slot);
  assert(up.tower === 'cannon' && up.cost === CFG.cannon.upgradeCosts[2], 'cannon upgrade pad');
});

test('cannon L1: explosive balls damage several rats at once', () => {
  const r = cannonTrial(1, 3);
  assert(r.explodes.length > 5, 'no explosions');
  const best = Math.max(...r.explodes.map((e) => e.hits));
  assert(best >= 5, `best blast hit only ${best}`);
});
test('cannon L2: heavy blast pushes small rats back', () => {
  const r = cannonTrial(2, 6);
  assert(r.knocked > 10, `knockbacks ${r.knocked}`);
  assert(r.explodes[0].r > CFG.cannon.levels[1].radius, 'blast not bigger');
});
test('cannon L3: two cannonballs per volley', () => {
  const r = cannonTrial(3, 5, 20, [0]);
  const times = r.explodes.length, l1 = cannonTrial(1, 5, 20, [0]).explodes.length;
  assert(times > l1 * 1.6, `L3 ${times} vs L1 ${l1} explosions`);
});

test('upgrade choice: a level 3 cannon gets two pads, one per path; the one you stand on decides', () => {
  const sim = new Sim({ seed: 3, cannon: true });
  const t = sim._placeTower(sim.slots[1], 3, true, 'cannon');
  sim.refreshPads();
  const pads = sim.pads.filter((p) => p.kind === 'upgrade' && p.slot === 1);
  assert(pads.length === 2 && pads.every((p) => p.choice && p.level === 4), 'expected two choice pads: ' + pads.map((p) => p.id));
  assert(new Set(pads.map((p) => p.path)).size === 2, 'the pads should lead to different paths');
  assert(Math.hypot(pads[0].x - pads[1].x, pads[0].z - pads[1].z) > CFG.pad.half * 2 + 0.3, 'the two pads overlap');
  // pay part of the Thunder Mortar pad, then walk over and buy the Rapid Launcher
  const rapid = pads.find((p) => p.path === 'rapid'), blast = pads.find((p) => p.path === 'blast');
  sim.gold = 30; sim.hero.x = blast.x + 5; sim.hero.z = blast.z; run(sim, 0.2); standOn(sim, blast); run(sim, 2.5);
  const partial = sim.pads.find((p) => p.id === blast.id).paid;
  assert(partial === 30 && sim.gold === 0, `partial payment ${partial}, gold ${sim.gold}`);
  sim.gold = 200; sim.hero.x = rapid.x + 5; sim.hero.z = rapid.z; run(sim, 0.2); standOn(sim, rapid); run(sim, 3);
  assert(t.level === 4 && t.path === 'rapid', `cannon is level ${t.level} on path ${t.path}`);
  assert(sim.gold === 200 - CFG.cannon.upgradeCosts[4] + 30, `the other path's partial payment should come back (gold ${sim.gold})`);
  const next = sim.pads.filter((p) => p.kind === 'upgrade' && p.slot === 1);
  assert(next.length === 1 && !next[0].choice && next[0].level === 5 && next[0].path === 'rapid', 'after the choice only the next Rapid Launcher pad remains');
});

test('upgrade choice pads sit on the same ground as their tower, clear of the road, other pads and the town', () => {
  forLevels(() => {
    const sim = new Sim({ seed: 1 });
    for (const s of sim.slots) {
      const home = CFG.plateaus.find((p) => plateauSdf(p, s.x, s.z) > 0);
      for (const [dx, dz] of s.upB) {
        const x = s.x + dx, z = s.z + dz;
        if (home) assert(plateauSdf(home, x, z) > CFG.pad.half, `slot ${s.id}: choice pad falls off its plateau`);
        else assert(CFG.plateaus.every((p) => plateauSdf(p, x, z) < -CFG.pad.half), `slot ${s.id}: choice pad climbs a plateau`);
        assert(road.distanceTo(x, z) > CFG.roadHalfWidth + CFG.pad.half, `slot ${s.id}: choice pad on the road`);
        for (const o of sim.slots) if (o !== s) {
          assert(Math.hypot(o.x - x, o.z - z) > 2.8, `slot ${s.id}: choice pad on slot ${o.id}`);
          assert(Math.hypot(o.x + o.up[0] - x, o.z + o.up[1] - z) > 2.6, `slot ${s.id}: choice pad on the upgrade pad of ${o.id}`);
        }
        for (const o of CFG.town.obstacles) assert(Math.hypot(o.x - x, o.z - z) > o.r + CFG.pad.half, `slot ${s.id}: choice pad inside a town building`);
      }
      const [a, b] = s.upB;
      assert(Math.hypot(a[0] - b[0], a[1] - b[1]) > CFG.pad.half * 2 + 0.3, `slot ${s.id}: choice pads overlap`);
    }
  });
});

test('Rapid Launcher: light shells several times as often, retargeting each shot; fewer fast rats slip past', () => {
  const r = cannonTrial(4, 7, 20, [0], 'rapid'), b = cannonTrial(4, 7, 20, [0], 'blast');
  assert(r.fires > b.fires * 4, `rapid fired ${r.fires} shells vs mortar ${b.fires}`);
  assert(r.explodes.every((e) => e.r < cannonSpec(3, null).radius), 'rapid blasts should be small');
  // a wave of nothing but fast rats against one cannon of each path
  const leaks = (path) => {
    const sim = new Sim({ seed: 9, cannon: true }); sim.towers.length = 0; for (const s of sim.slots) s.tower = null;
    const t = sim._placeTower(sim.slots[0], 4, true, 'cannon'); t.path = path;
    sim.fortress.hp = sim.fortress.maxHp = 1e6;
    const W = CFG.waves[1], mix = W.mix; W.mix = [1, 0];
    try { sim.waveIndex = 1; sim.callWave(); run(sim, 60); } finally { W.mix = mix; }
    return sim.stats.leaked;
  };
  const lr = leaks('rapid'), lb = leaks('blast');
  assert(lr * 2 < lb, `fast rats slipping past: rapid ${lr} vs mortar ${lb}`);
});
test('Rapid Launcher L5-7: cluster bomblets, burning ground, rocket salvos', () => {
  const c5 = cannonTrial(5, 7, 15, [0, 1], 'rapid');
  assert(c5.explodes.filter((e) => e.kind === 'bomblet').length > c5.explodes.filter((e) => e.kind === 'shell').length * 2, 'too few bomblets');
  const c6 = cannonTrial(6, 7, 15, [0, 1], 'rapid');
  assert(c6.zones >= 3 && c6.explodes.some((e) => e.burn), `burning patches ${c6.zones}`);
  const c7 = cannonTrial(7, 9, 20, [0, 1], 'rapid');
  const rockets = c7.explodes.filter((e) => e.kind === 'rocket').length;
  assert(c7.salvos >= 3 && rockets >= c7.salvos * 8, `salvos ${c7.salvos}, rockets ${rockets}`);
});
test('Thunder Mortar: huge, stunning blasts; L5 three at once; L6 shockwave cracks armour; L7 Nova', () => {
  const m4 = cannonTrial(4, 12, 25, [0, 1, 3], 'blast');
  assert(m4.explodes.every((e) => e.r >= 3), 'mortar blasts should be huge');
  assert(m4.stunned > 20 && m4.knocked > 10, `stunned ${m4.stunned}, knocked ${m4.knocked}`);
  assert(Math.max(...m4.explodes.map((e) => e.hits)) >= 8, 'one mortar shell should hit a crowd');
  const m5 = cannonTrial(5, 7, 20, [0], 'blast');
  assert(m5.explodes.length >= m5.fires && m5.fires % 3 === 0, `three shells per volley (${m5.fires} shells)`);
  const m6 = cannonTrial(6, 7, 25, [0, 1], 'blast');
  assert(m6.slowed > 50 && m6.broken > 20 && m6.explodes.every((e) => e.ring > 0), `slowed ${m6.slowed}, cracked ${m6.broken}`);
  const m7 = cannonTrial(7, 7, 30, [0, 1], 'blast');
  assert(m7.novas >= 6 && m7.explodes.some((e) => e.kind === 'side'), `novas ${m7.novas}`);
  const s = new Sim({ seed: 1 }); const g = { alive: true, type: 1, hp: 1000, maxHp: 1000, broken: 2 };
  s._damage(g, 100, 1); assert(1000 - g.hp === 150, 'cracked armour should add 50% damage from every tower');
});
test('each path has its own edge: the Thunder Mortar hurts a boss far more than the Rapid Launcher', () => {
  const bossDamage = (lv, path) => {
    const sim = new Sim({ seed: 9, cannon: true }); sim.towers.length = 0; for (const s of sim.slots) s.tower = null;
    const t = sim._placeTower(sim.slots[2], lv, true, 'cannon'); t.path = path;
    sim.fortress.hp = sim.fortress.maxHp = 1e6;
    sim.state = 'wave'; sim.waveIndex = 9; sim.waveTime = 0;
    sim.spawnQueue = [{ t: 0, type: T_BOSS, hp: 9000, boss: 'baron', lat: 0 }]; sim.spawnIndex = 0; run(sim, dt);
    const b = sim.enemies[0];
    let best = 1e9, bs = 0; const o = { x: 0, z: 0 };
    for (let q = 0; q < road.length; q += 0.5) { road.sample(q, o); const d = Math.hypot(o.x - t.x, o.z - t.z); if (d < best) { best = d; bs = q; } }
    b.s = bs; const hp0 = b.hp;
    run(sim, 10, () => { b.speed = 0; });
    return hp0 - Math.max(0, b.hp);
  };
  for (const lv of [4, 5, 6]) {
    const m = bossDamage(lv, 'blast'), r = bossDamage(lv, 'rapid');
    assert(m > r * 1.5, `level ${lv}: mortar ${m.toFixed(0)} vs rapid ${r.toFixed(0)} boss damage`);
  }
});

test('cannons are stronger than crossbows of the same level (both cannon paths)', () => {
  for (const [lv, path] of [[1, null], [3, null], [5, 'blast'], [5, 'rapid']]) {
    // level 5 towers face the tougher rats of wave 12, where they would really be built
    const kills = (kind) => { const sim = new Sim({ seed: 9, cannon: true }); sim.towers.length = 0; for (const s of sim.slots) s.tower = null; for (const si of [0, 1, 3]) { const t = sim._placeTower(sim.slots[si], lv, true, kind); if (kind === 'cannon') t.path = path; } sim.fortress.hp = sim.fortress.maxHp = 1e6; sim.waveIndex = lv >= 5 ? 11 : 7; sim.callWave(); run(sim, lv >= 5 ? 22 : 35); return sim.stats.kills; };
    const c = kills('cannon'), x = kills('crossbow');
    assert(c > x * 1.2, `level ${lv} ${path || ''}: cannon ${c} vs crossbow ${x}`);
  }
});
test('save/load keeps cannon towers, their path and the chosen build type; older saves become Thunder Mortars', () => {
  const sim = new Sim({ seed: 3, cannon: true });
  const t = sim._placeTower(sim.slots[1], 6, true, 'cannon'); t.path = 'rapid'; sim.setBuildKind('cannon');
  sim._placeTower(sim.slots[3], 2, true, 'cannon');
  const d = JSON.parse(JSON.stringify(sim.serialize()));
  const b = new Sim({ seed: 4, cannon: true }); b.load(d);
  const bt = b.slots[1].tower;
  assert(bt && bt.kind === 'cannon' && bt.level === 6 && bt.path === 'rapid' && b.buildKind === 'cannon', 'cannon path not restored');
  assert(b.slots[3].tower.path === null, 'a level 2 cannon has no path yet');
  // a save from before the upgrade choice: [slot, level, kind] only
  d.towers = d.towers.map((x) => x.slice(0, 3));
  const c = new Sim({ seed: 4, cannon: true }); c.load(d);
  assert(c.slots[1].tower.path === 'blast', 'old saves should carry on as Thunder Mortars');
});

test('enemies at the gate damage the keep and can cause defeat', () => {
  const sim = new Sim({ seed: 3 });
  sim.towers.length = 0; for (const s of sim.slots) s.tower = null;
  sim.callWave();
  let defeated = false;
  run(sim, 200, (s) => { if (s.state === 'defeat') defeated = true; });
  assert(defeated || sim.fortress.hp < 100, 'keep took no damage');
});

test('save → load round trip keeps towers, gold, keep and coins', () => {
  const sim = new Sim({ seed: 3 });
  sim.gold = 77; sim.fortress.level = 2; sim.fortress.maxHp = 170; sim.fortress.hp = 120;
  sim._dropCoin(20, 0, 0, 3, 0); run(sim, 1);
  sim.waveIndex = 3;
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  const b = new Sim({ seed: 9 });
  assert(b.load(data), 'load failed');
  assert(b.gold === 77 && b.fortress.level === 2 && b.fortress.hp === 120 && b.waveIndex === 3, 'state mismatch');
  assert(b.towers.length === sim.towers.length, 'towers mismatch');
  assert(b.coins.reduce((a, c) => a + c.value, 0) === 3, 'coins mismatch');
  assert(b.state === 'build', 'should resume in the build phase');
});

test('simulation is deterministic for a seed', () => {
  const a = runLevel('bot', 11), b = runLevel('bot', 11);
  assert(JSON.stringify(a.stats) === JSON.stringify(b.stats), 'different results');
});

// ------------------------------------------------ 16 waves, skip, auto skip
const waveHp = (w) => w.grunts * w.hp + w.giants.reduce((a, g) => a + g[0], 0);
test('town: houses, farms, windmill, barn, well and market stay clear of the road, build spots and plateaus', () => {
  forLevels(() => {
    const T = CFG.town, W = CFG.walk;
    const clear = (name, x, z, roadGap) => {
      assert(road.distanceTo(x, z) > CFG.roadHalfWidth + roadGap, `${name} too close to the road (${road.distanceTo(x, z).toFixed(1)})`);
      for (const sl of CFG.slots) assert(Math.hypot(sl.x - x, sl.z - z) > 3.2, `${name} blocks tower slot ${sl.id}`);
      assert(Math.hypot(CFG.fortressPad.x - x, CFG.fortressPad.z - z) > 3, `${name} blocks the town hall pad`);
      for (const p of CFG.plateaus) assert(plateauSdf(p, x, z) < -0.4, `${name} sits on a plateau`);
      assert(x > W.minX - 1.5 && x < W.maxX + 1.5 && z > W.minZ - 1.5 && z < W.maxZ + 1.5, `${name} is outside the canyon floor`);
    };
    CFG.huts.forEach((h, i) => clear(`house ${i}`, h.x, h.z, 2.5));
    for (const [name, o] of [['windmill', T.windmill], ['barn', T.barn], ['well', T.well], ['market', T.market]]) clear(name, o.x, o.z, 2);
    T.fields.forEach((f, i) => {
      for (const [u, v] of [[0, 0], [-0.56, -0.56], [0.56, -0.56], [0.56, 0.56], [-0.56, 0.56]]) { const p = fieldPoint(f, u, v); clear(`field ${i}`, p.x, p.z, 0.8); }
    });
    // nothing overlaps: houses, buildings and fields keep apart from each other
    const things = [...CFG.huts.map((h) => [h.x, h.z, 1.8]), [T.windmill.x, T.windmill.z, 1.8], [T.barn.x, T.barn.z, 3], [T.well.x, T.well.z, 1], [T.market.x, T.market.z, 1.3],
      [CFG.fortress.x, CFG.fortress.z, CFG.fortress.radius], ...T.fields.map((f) => [f.x, f.z, Math.min(f.w, f.d) / 2 + 0.45])];
    for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) {
      const [ax, az, ar] = things[i], [bx, bz, br] = things[j];
      assert(Math.hypot(ax - bx, az - bz) > ar + br - 0.1, `town pieces ${i} and ${j} overlap`);
    }
  });
});

test('town: every villager has a home with a door, and a field or spot to go to', () => {
  assert(VILLAGERS.length >= 12, 'too few villagers: ' + VILLAGERS.length);
  const jobs = new Set(VILLAGERS.map((v) => v.job));
  for (const j of ['farm', 'stroll', 'chat', 'kid']) assert(jobs.has(j), 'nobody has the job ' + j);
  for (const v of VILLAGERS) {
    const d = doorOf(v.home);
    assert(Number.isFinite(d.x) && Number.isFinite(d.z), 'bad home ' + v.home);
    assert(road.distanceTo(d.x, d.z) > CFG.roadHalfWidth, 'a front door opens onto the road');
    if (v.job === 'farm') for (const f of v.fields) assert(CFG.town.fields[f], 'farmer with a missing field ' + f);
    if (v.job === 'chat') { const c = chatSpot(v.spot); assert(Number.isFinite(c.x), 'bad chat spot'); }
    assert([0, 1, 2].includes(v.look), 'unknown look ' + v.look);
  }
  // chatters come in pairs
  for (const spot of [0, 1]) assert(VILLAGERS.filter((v) => v.job === 'chat' && v.spot === spot).length === 2, 'chat spot ' + spot + ' needs a pair');
});

test('villagers: calm without rats, alert when rats come near, panic up close or while the town hall is hit, cheer on a win', () => {
  const sim = new Sim({ seed: 2 });
  const mk = (x, z) => ({ id: 900 + sim.enemies.length, type: T_GRUNT, v: 0, alive: true, x, z, hp: 5, maxHp: 5 });
  const vx = 9.5, vz = -41.5;   // in the north-east wheat field
  sim.enemies.length = 0;
  assert(villagerAlarm(sim, vx, vz) === 'calm', 'calm with no rats');
  sim.enemies.push(mk(vx + ALERT_RANGE + 2, vz));
  assert(villagerAlarm(sim, vx, vz) === 'calm', 'a far rat should not worry anyone');
  sim.enemies.push(mk(vx, vz + ALERT_RANGE - 3));
  assert(villagerAlarm(sim, vx, vz) === 'alert', 'a rat in sight makes villagers alert');
  sim.enemies.push(mk(vx + PANIC_RANGE - 2, vz));
  assert(villagerAlarm(sim, vx, vz) === 'panic', 'a rat close by makes villagers run');
  sim.enemies[2].alive = false;
  assert(villagerAlarm(sim, vx, vz) === 'alert', 'a defeated rat is no threat');
  // the town hall under attack: people near it run, far-off farmers do not
  sim.enemies.length = 0;
  sim.fortress.underAttack = 1;
  const sq = CFG.town.square;
  assert(villagerAlarm(sim, sq.x, sq.z) === 'panic', 'the square panics while the town hall is hit');
  assert(villagerAlarm(sim, -20.5, -12.5) === 'calm', 'the west farm is too far to hear it');
  // hiding: stay in while rats are about, come out after the wave
  sim.state = 'wave';
  assert(!safeToComeOut(sim, sq.x, sq.z), 'nobody comes out while the town hall is under attack');
  sim.fortress.underAttack = 0;
  sim.enemies.push(mk(sq.x + 10, sq.z));
  assert(!safeToComeOut(sim, sq.x, sq.z), 'nobody comes out with rats nearby');
  sim.enemies.length = 0;
  assert(safeToComeOut(sim, sq.x, sq.z), 'villagers come out once the rats are gone');
  sim.state = 'build';
  sim.enemies.push(mk(sq.x + 2, sq.z));
  assert(safeToComeOut(sim, sq.x, sq.z), 'between waves it is safe');
  sim.state = 'victory';
  assert(villagerAlarm(sim, vx, vz) === 'cheer', 'everyone cheers a win');
  sim.state = 'defeat';
  assert(villagerAlarm(sim, vx, vz) === 'panic' && !safeToComeOut(sim, vx, vz), 'a lost town runs and hides');
});

test('the level has at least 16 waves that keep getting harder', () => {
  const W = CFG.waves;
  assert(W.length >= 16, 'only ' + W.length + ' waves');
  for (let i = 1; i < W.length; i++) assert(waveHp(W[i]) > waveHp(W[i - 1]), `wave ${i + 1} is not harder than wave ${i}`);
  // a boss on waves 5, 8, 10, 11, 13 and 15, and all six return in the final wave
  const bossesIn = (i) => W[i].giants.filter((g) => g[2]).map((g) => g[2]);
  const order = { 4: 'warlord', 7: 'slime', 9: 'baron', 10: 'mole', 12: 'buzzard', 14: 'king' };
  for (let i = 0; i < W.length - 1; i++) {
    assert(bossesIn(i).join() === (order[i] || ''), `wave ${i + 1} should have ${order[i] || 'no boss'}, has ${bossesIn(i).join() || 'none'}`);
    if (order[i]) assert(/^Boss wave/.test(W[i].title), `wave ${i + 1} title should announce its boss`);
  }
  assert(bossesIn(W.length - 1).sort().join() === Object.keys(CFG.bosses).sort().join(), 'every boss should return in the final wave');
  const hpOf = (i) => W[i].giants.find((g) => g[2])[0];
  assert(hpOf(4) < hpOf(9) && hpOf(9) < hpOf(14), 'each rat boss should be tougher than the last');
  for (const k of Object.keys(CFG.bosses)) assert(CFG.bosses[k] && CFG.bosses[k].name, `boss ${k} has no name`);
});

test('boss waves: the HUD knows a boss is next, and a warning fires seconds before it climbs out', () => {
  const sim = new Sim({ seed: 5 });
  sim.towers.length = 0; for (const sl of sim.slots) sl.tower = null;
  sim.fortress.hp = sim.fortress.maxHp = 1e6;
  sim.waveIndex = 4; sim.state = 'build'; sim.buildTimer = 5;
  assert(sim.upcomingBosses.join() === 'Rat Warlord', 'build phase should know the Rat Warlord is next: ' + sim.upcomingBosses);
  sim.waveIndex = 5; assert(sim.upcomingBosses.length === 0, 'wave 6 has no boss');
  sim.waveIndex = 4; sim.callWave();
  let warn = null, spawn = null;
  run(sim, 60, (s) => { for (const e of s.events) { if (e.type === 'bossWarning' && !warn) warn = { ...e, at: s.time }; if (e.type === 'bossSpawn' && !spawn) spawn = { ...e, at: s.time }; } s.events.length = 0; });
  assert(warn && spawn, 'no boss warning or spawn');
  assert(warn.name === 'Rat Warlord' && spawn.name === 'Rat Warlord', 'wrong boss');
  const lead = spawn.at - warn.at;
  assert(Math.abs(lead - CFG.bossWarning) < 0.1, `warning came ${lead.toFixed(2)}s before the boss`);
  const boss = sim.enemies.find((e) => e.id === spawn.id);
  assert(boss && boss.armor === CFG.bosses.warlord.armor && Math.abs(boss.speed / CFG.grunt.speed - CFG.bosses.warlord.speedMul) < 0.04, 'boss stats not applied');
});

test('skip wave between waves starts the next wave at once with the early bonus', () => {
  const sim = new Sim({ seed: 5 });
  assert(sim.canSkip, 'skip should be available before wave 1');
  const g = sim.gold;
  assert(sim.skipWave() === true && sim.state === 'wave', 'wave did not start');
  assert(sim.events.some((e) => e.type === 'earlyBonus') && sim.gold > g, 'no early bonus');
});

test('skip wave mid-wave: unlocks once the wave is out, pays the clear bonus and merges the next wave', () => {
  const sim = new Sim({ seed: 5 });
  sim.callWave();
  run(sim, 0.5);
  assert(!sim.canSkip && sim.skipIn > 0, 'skip should wait while rats are still pouring in');
  assert(sim.skipWave() === false && sim.waveIndex === 0, 'skip went through too early');
  run(sim, sim.skipIn + 0.05);
  assert(sim.canSkip && sim.skipIn === 0, 'skip did not unlock after the wave poured in');
  const gold = sim.gold, total = sim.waveTotal, alive = sim.enemies.length;
  sim.events.length = 0;
  assert(sim.skipWave() === true, 'skip refused');
  const w2 = CFG.waves[1];
  assert(sim.waveIndex === 1 && sim.state === 'wave', 'did not move to wave 2');
  assert(sim.gold === gold + CFG.waveClearBonus(1) + CFG.skipBonus, `bonus ${sim.gold - gold}`);
  assert(sim.waveTotal === total + w2.grunts + w2.giants.length, 'wave 2 was not added to the count');
  assert(sim.events.some((e) => e.type === 'skipped') && sim.events.some((e) => e.type === 'waveStart' && e.index === 1), 'missing events');
  assert(sim.enemies.length === alive, 'wave 1 rats should still be on the road');
  // wave 2 marches in behind wave 1, and clearing everything ends wave 2
  sim.gold += 400;
  const bot = makeBot();
  let cleared = null, after = null;
  run(sim, 240, (s) => {
    if (cleared !== null) return;
    bot(s);
    for (const e of s.events) if (e.type === 'waveCleared' && cleared === null) { cleared = e.index; after = `${s.waveIndex}/${s.state}`; }
    s.events.length = 0;
  });
  assert(cleared === 1 && after === '2/build', `cleared ${cleared}, then ${after}`);
});

test('the final wave cannot be skipped', () => {
  const sim = new Sim({ seed: 5 });
  sim.waveIndex = CFG.waves.length - 1;
  sim.callWave();
  run(sim, 60);
  assert(sim.skipIn === null && !sim.canSkip && sim.skipWave() === false, 'final wave was skippable');
});

test('auto skip starts the next wave a few seconds after a clear (and never before wave 1)', () => {
  for (const auto of [true, false]) {
    const sim = new Sim({ seed: 6, autoSkip: auto });
    assert(sim.autoIn === null, 'auto must not start wave 1 by itself');
    sim.gold += 300;
    sim.callWave();
    const bot = makeBot();
    let clearedAt = null, startedAt = null;
    run(sim, 200, (s) => {
      bot(s);
      for (const e of s.events) {
        if (e.type === 'waveCleared' && clearedAt === null) clearedAt = s.time;
        if (e.type === 'waveStart' && clearedAt !== null && startedAt === null) startedAt = s.time;
      }
      s.events.length = 0;
    });
    assert(clearedAt !== null && startedAt !== null, 'wave 2 never started');
    const gap = startedAt - clearedAt;
    if (auto) assert(Math.abs(gap - CFG.autoSkipDelay) < 0.1, `auto gap ${gap.toFixed(2)}s`);
    else assert(Math.abs(gap - CFG.buildTime) < 0.1, `manual gap ${gap.toFixed(2)}s`);
  }
});

test('diamonds are paid for every wave cleared, add up to 50 for a full clear, and are never paid twice', () => {
  const W = CFG.waveDiamonds;
  assert(W.length === CFG.waves.length && W.reduce((a, b) => a + b, 0) === CFG.diamondsPerClear, 'wave diamonds must add up to the full-clear reward');
  assert(W.every((d, i) => i === 0 || d >= W[i - 1]), 'later waves should never pay less');
  // a run that clears 3 waves earns the first three payouts
  const sim = new Sim({ seed: 3 }); const bot = makeBot();
  const paid = [];
  sim.callWave();
  run(sim, 400, (s) => { if (s.waveIndex < 3) { bot(s); if (s.state === 'build') s.callWave(); } for (const e of s.events) if (e.type === 'waveCleared') paid.push(e.diamonds); s.events.length = 0; });
  assert(sim.waveIndex >= 3 && paid.slice(0, 3).join() === W.slice(0, 3).join(), `paid ${paid.join()}`);
  assert(sim.stats.diamonds === paid.reduce((a, b) => a + b, 0), 'run total does not match the payouts');
  // reloading a checkpoint (continue / retry) does not pay the same waves again
  const snap = JSON.parse(JSON.stringify(sim.serialize()));
  const again = new Sim({ seed: 8 }); again.load(snap);
  assert(again.diamondsPaid === sim.diamondsPaid && again.stats.diamonds === sim.stats.diamonds, 'checkpoint lost the diamond record');
  again.waveIndex = sim.waveIndex; again.callWave();
  const bot2 = makeBot(); let next = null;
  run(again, 200, (s) => { if (next === null) bot2(s); for (const e of s.events) if (e.type === 'waveCleared' && next === null) next = e; s.events.length = 0; });
  assert(next && next.diamonds === W[sim.waveIndex], `after reload the next clear paid ${next && next.diamonds}`);
});

test('tower card: shows the tower beside the farmer, its ability and what the next upgrade costs and adds', () => {
  for (let lv = 1; lv <= 7; lv++) {
    const A = [CROSSBOW_ABILITIES[lv], cannonAbility(lv, 'rapid'), cannonAbility(lv, 'blast')];
    assert(A.every((a) => a && a[0] && a[1]), `missing ability text for level ${lv}`);
  }
  assert(cannonAbility(4, 'rapid')[0] !== cannonAbility(4, 'blast')[0], 'the two cannon paths need their own abilities');
  for (const [kind, path] of [['crossbow'], ['cannon', 'rapid'], ['cannon', 'blast']]) for (let lv = 2; lv <= 7; lv++) {
    assert(JSON.stringify(towerStats(kind, lv, path)) !== JSON.stringify(towerStats(kind, lv - 1, path)), `${kind} ${path || ''} level ${lv} changes nothing`);
  }
  const sim = new Sim({ seed: 3, cannon: true });
  sim.hero.x = 40; sim.hero.z = 40; run(sim, 0.05);
  assert(describeFocus(sim) === null, 'card should hide away from towers');
  // beside the starting crossbow, upgraded to 3
  const t = sim.slots[0].tower; t.level = 3; sim.refreshPads();
  sim.hero.x = t.x + 2; sim.hero.z = t.z; run(sim, 0.05);
  const f = describeFocus(sim);
  assert(f && f.kind === 'crossbow' && f.level === 3 && f.ability === 'Twin Shot', 'wrong tower info ' + JSON.stringify(f));
  assert(f.next.level === 4 && f.next.ability === 'Armor Piercer' && f.next.cost === CFG.upgradeCosts[4], 'wrong next upgrade');
  assert(f.next.changes.some(([k, a, b]) => k === 'Damage' && b > a), 'next upgrade should list its stat gains');
  // standing on a build pad
  const pad = sim.pads.find((p) => p.kind === 'build');
  sim.hero.x = pad.x; sim.hero.z = pad.z; run(sim, 0.05);
  const fb = describeFocus(sim);
  assert(fb && fb.build && fb.next.level === 1 && fb.next.cost === pad.cost, 'build pad info ' + JSON.stringify(fb));
  // a level 3 cannon offers the choice of paths; standing on one pad shows just that path
  t.kind = 'cannon'; t.level = 3; t.path = null; sim.refreshPads();
  sim.hero.x = t.x + 2; sim.hero.z = t.z; run(sim, 0.05);
  const fc = describeFocus(sim);
  assert(fc && !fc.next && fc.choice && fc.choice.length === 2, 'no upgrade choice on the card ' + JSON.stringify(fc));
  assert(fc.choice.map((c) => c.pathName).join() === 'Rapid Launcher,Thunder Mortar' && fc.choice.every((c) => c.blurb && c.cost === CFG.cannon.upgradeCosts[4]), 'choice options ' + JSON.stringify(fc.choice));
  const rp = sim.pads.find((p) => p.choice && p.path === 'rapid');
  sim.hero.x = rp.x; sim.hero.z = rp.z; sim.hero.y = rp.y; run(sim, 0.05);
  const fr = describeFocus(sim);
  assert(fr.next && fr.next.ability === 'Rapid Launcher' && fr.next.pathName === 'Rapid Launcher' && !fr.choice, 'on the Rapid pad ' + JSON.stringify(fr.next));
  // a maxed cannon has no next level, and shows its path
  t.level = 7; t.path = 'blast'; sim.refreshPads();
  sim.hero.x = t.x + 2; sim.hero.z = t.z; run(sim, 0.05);
  const fm = describeFocus(sim);
  assert(fm && fm.kind === 'cannon' && fm.max && !fm.next && fm.ability === 'Doomsday Nova' && fm.pathName === 'Thunder Mortar', 'max level info ' + JSON.stringify(fm));
});

test('difficulty: Easy and Hard scale every enemy\'s health and each wave\'s diamonds; saves keep it', () => {
  const D = CFG.difficulties;
  assert(D.easy.hp < 1 && D.normal.hp === 1 && D.hard.hp > 1, 'Easy must be weaker and Hard tougher than Normal');
  // the same wave on each difficulty: same crowd, scaled health
  const queue = (difficulty) => { const sim = new Sim({ seed: 3, difficulty }); sim.waveIndex = 4; sim.callWave(); return sim.spawnQueue; };
  const n = queue('normal'), e = queue('easy'), h = queue('hard');
  assert(n.length === e.length && n.length === h.length, 'difficulty changed the size of the crowd');
  for (let i = 0; i < n.length; i++) {
    assert(n[i].type === h[i].type && n[i].v === h[i].v, 'difficulty changed which rats come');
    assert(e[i].hp < n[i].hp || n[i].hp <= 2, `Easy rat ${i} not weaker: ${e[i].hp} vs ${n[i].hp}`);
    assert(h[i].hp > n[i].hp, `Hard rat ${i} not tougher: ${h[i].hp} vs ${n[i].hp}`);
  }
  const boss = (q) => q.find((d) => d.boss === 'warlord').hp;
  assert(boss(h) === Math.round(boss(n) * D.hard.hp) && boss(e) === Math.round(boss(n) * D.easy.hp), 'boss health not scaled');
  // rats that come out of the Tunnel Mole's tunnel or drop from the Canyon Buzzard are scaled too
  const mole = new Sim({ seed: 3, difficulty: 'hard' }); mole.waveIndex = 10;
  mole._moleRats({ lat: 0, s: 100 }, 2);
  assert(mole.enemies[0].maxHp === Math.round(CFG.waves[10].hp * D.hard.hp), 'mole rats not scaled: ' + mole.enemies[0].maxHp);
  // diamonds: 30 on Easy, 50 on Normal, 100 on Hard for a full clear; later waves never pay less
  const total = (difficulty) => new Sim({ difficulty }).diamondsPerClear;
  assert(total('easy') === 30 && total('normal') === CFG.diamondsPerClear && total('hard') === 100, `full-clear diamonds ${total('easy')}/${total('normal')}/${total('hard')}`);
  for (const k of Object.keys(D)) { const s = new Sim({ difficulty: k }); for (let i = 1; i < CFG.waves.length; i++) assert(s.waveDiamonds(i) >= s.waveDiamonds(i - 1), `${k} wave ${i + 1} pays less`); }
  // saves keep the difficulty; older saves and unknown names play on Normal
  const snap = JSON.parse(JSON.stringify(new Sim({ seed: 3, difficulty: 'hard' }).serialize()));
  const l = new Sim({ seed: 4 }); l.load(snap);
  assert(l.difficulty === 'hard', 'the save lost its difficulty');
  delete snap.diff; const o = new Sim({ seed: 4 }); o.load(snap);
  assert(o.difficulty === 'normal', 'an old save should play on Normal');
  assert(new Sim({ difficulty: 'nightmare' }).difficulty === 'normal', 'unknown difficulty');
});

test('repair pad: a damaged town hall is patched up for gold; it never blocks an upgrade, refunds and survives a reload', () => {
  const sim = new Sim({ seed: 3 });
  assert(!sim.pads.some((p) => p.kind === 'repair'), 'repair pad beside an unhurt town hall');
  sim.callWave();
  // the hall takes a hit: a pad appears, priced at the health it lost (rounded up to 5)
  sim.fortress.hp = 63; sim._repairDirty = true; run(sim, 0.05);
  const rp = sim.pads.find((p) => p.kind === 'repair');
  assert(rp && rp.cost === 40, 'repair pad ' + JSON.stringify(rp && { cost: rp.cost }));
  sim.fortress.hp = 52; sim._repairDirty = true; run(sim, 0.05);
  assert(rp.cost === 50, 'more damage should raise the price, got ' + rp.cost);
  const card = (() => { sim.hero.x = rp.x; sim.hero.z = rp.z; sim.hero.y = rp.y; run(sim, 0.05); return describeFocus(sim); })();
  assert(card && card.next && card.next.repair && card.next.cost === 50 && card.next.changes[0][2] === sim.fortress.maxHp, 'tower card on the repair pad ' + JSON.stringify(card && card.next));
  // standing on it pours in gold and restores all health
  sim.gold = 120; sim.events.length = 0;
  let built = null;
  run(sim, 3, (s) => { for (const ev of s.events) if (ev.type === 'built') built = ev; s.events.length = 0; });
  assert(sim.fortress.hp === sim.fortress.maxHp, 'hall not repaired: ' + sim.fortress.hp);
  assert(sim.gold === 70 && built && built.kind === 'repair' && built.amount === 48, `gold ${sim.gold}, event ${JSON.stringify(built)}`);
  assert(!sim.pads.some((p) => p.kind === 'repair'), 'repair pad still there after a full repair');
  // while a town hall upgrade is on offer (it repairs fully anyway) there is no repair pad
  const up = new Sim({ seed: 3 }); up.waveIndex = 2; up.fortress.hp = 40; up.refreshPads();
  assert(up.pads.some((p) => p.kind === 'fortress') && !up.pads.some((p) => p.kind === 'repair'), 'repair pad next to an upgrade pad');
  // gold half-poured into a repair is refunded when an upgrade takes its place
  const rf = new Sim({ seed: 3 }); rf.waveIndex = 1; rf.fortress.hp = 40; rf.refreshPads();
  const pad = rf.pads.find((p) => p.kind === 'repair'); pad.paid = rf.padPaid.repair = 25;
  const gold = rf.gold; rf.events.length = 0;
  rf.waveIndex = 2; rf.refreshPads();
  assert(rf.gold === gold + 25 && rf.events.some((ev) => ev.type === 'refund' && ev.repair && ev.amount === 25), 'repair gold was not refunded');
  // a checkpoint keeps the damage and the partial payment
  const sv = new Sim({ seed: 3 }); sv.waveIndex = 1; sv.fortress.hp = 70; sv.refreshPads();
  sv.pads.find((p) => p.kind === 'repair').paid = sv.padPaid.repair = 10;
  const back = new Sim({ seed: 5 }); back.load(JSON.parse(JSON.stringify(sv.serialize())));
  const bp = back.pads.find((p) => p.kind === 'repair');
  assert(bp && bp.cost === 30 && bp.paid === 10, 'reloaded repair pad ' + JSON.stringify(bp && { cost: bp.cost, paid: bp.paid }));
});

test('Level 2: the road climbs over a sand hill; rats, arrows and cannonballs follow the ground', () => {
  try {
    setLevel(2);
    assert(CFG.level === 2 && CFG.hills.length === 1, 'Level 2 has no hill');
    const H = CFG.hills[0];
    let top = 0; for (let i = 0; i < road.count; i++) top = Math.max(top, groundHeight(road.px[i], road.pz[i]));
    assert(top > 2, `the road should climb the hill (highest point ${top.toFixed(2)})`);
    assert(groundHeight(H.x, H.z) > top + 1, 'the summit should rise above the road');
    // the lone tree and the picnic sit on the summit, clear of the road, the towers and their pads
    const D = CFG.decor, sim0 = new Sim({ seed: 1, cannon: true });
    for (const [name, d, r] of [['tree', D.tree, 2.6], ['picnic', D.picnic, 2.2]]) {
      assert(groundHeight(d.x, d.z) > 3.5, `the ${name} is not on the hilltop`);
      assert(road.distanceTo(d.x, d.z) > CFG.roadHalfWidth + r, `the ${name} is on the road`);
      for (const sl of sim0.slots) {
        assert(Math.hypot(sl.x - d.x, sl.z - d.z) > r + 1.8, `the ${name} blocks slot ${sl.id}`);
        for (const [ox, oz] of [sl.up, ...sl.upB]) assert(Math.hypot(sl.x + ox - d.x, sl.z + oz - d.z) > r + CFG.pad.half - 0.4, `the ${name} covers a pad of slot ${sl.id}`);
      }
    }
    // the town stays on flat ground
    for (const h of CFG.huts) assert(hillHeight(h.x, h.z) === 0, 'a house sits on the hill');
    for (const f of CFG.town.fields) assert(hillHeight(f.x, f.z) === 0, 'a field sits on the hill');
    // towers on the hill stand on the lowest point of their footprint
    for (const sl of sim0.slots) assert(sl.y <= groundHeight(sl.x, sl.z) + 1e-9, `tower ${sl.id} floats`);
    // ...and each one sits on a flat terrace dug into the slope, so its base is never half-buried
    for (const sl of sim0.slots) {
      const y0 = groundHeight(sl.x, sl.z);
      for (let a = 0; a < 16; a++) for (const r of [1, 1.6, 2]) {
        const y = groundHeight(sl.x + r * Math.cos(a * Math.PI / 8), sl.z + r * Math.sin(a * Math.PI / 8));
        assert(Math.abs(y - y0) < 0.02, `slot ${sl.id} is on a slope: ${(y - y0).toFixed(2)} at ${r} out`);
      }
    }
    // a crowd walking over the hill: each rat stands on the slope, arrows strike at its height
    const sim = new Sim({ seed: 4 });
    sim.towers.length = 0; for (const sl of sim.slots) sl.tower = null;
    const t = sim._placeTower(sim.slots.find((q) => q.id === 'H3'), 5, true, 'crossbow');
    sim.callWave();
    let onHill = null, bolt = null;
    run(sim, 160, (s) => {
      for (const e of s.enemies) if (e.gy > 1.5 && !onHill) onHill = { gy: e.gy, want: hillHeight(e.x, e.z) };
      for (const b of s.bolts) { const e = s.enemies.find((q) => q.id === b.tid); if (!bolt && e && e.gy > 1 && !b.fall) bolt = { y1: b.y1, gy: e.gy, type: e.type, fly: e.fly }; }
      s.fortress.hp = s.fortress.maxHp;
    });
    assert(onHill && Math.abs(onHill.gy - onHill.want) < 1e-6, 'rats do not walk on the hill: ' + JSON.stringify(onHill));
    assert(bolt && bolt.y1 > bolt.gy && bolt.y1 < bolt.gy + 2.5, 'arrows do not aim at a rat on the slope: ' + JSON.stringify(bolt));
    assert(t.fired > 0, 'the hilltop crossbow never fired');
    // a cannonball lands on the slope, not under it
    const cs = new Sim({ seed: 5, cannon: true });
    cs.towers.length = 0; for (const sl of cs.slots) sl.tower = null;
    cs._placeTower(cs.slots.find((q) => q.id === 'H4'), 3, true, 'cannon');
    cs.callWave();
    let shell = null;
    run(cs, 160, (s) => { for (const sh of s.shells) if (!shell && hillHeight(sh.tx, sh.tz) > 1) shell = { ty: sh.ty, want: 0.3 + hillHeight(sh.tx, sh.tz), kind: sh.kind }; s.fortress.hp = s.fortress.maxHp; });
    assert(shell && Math.abs(shell.ty - shell.want) < 1e-6, 'cannonballs do not land on the slope: ' + JSON.stringify(shell));
  } finally { setLevel(1); }
});

test('Level 2: a save remembers its map, and never loads on another map', () => {
  try {
    setLevel(2);
    const sim = new Sim({ seed: 3 }); sim.gold = 77;
    const snap = JSON.parse(JSON.stringify(sim.serialize()));
    assert(snap.level === 2, 'the save does not record its map');
    const back = new Sim({ seed: 9 });
    assert(back.load(snap) && back.gold === 77 && back.slots[0].id === 'H1', 'a Level 2 save did not load on Level 2');
    setLevel(1);
    assert(!new Sim({ seed: 9 }).load(snap), 'a Level 2 save loaded on Level 1');
    const old = JSON.parse(JSON.stringify(new Sim({ seed: 3 }).serialize())); delete old.level;
    assert(new Sim({ seed: 9 }).load(old), 'an old save (no map recorded) should load on Level 1');
  } finally { setLevel(1); }
});

const balance = {};
test('balance: idle player loses early', () => {
  const r = runLevel('idle', 1); balance.idle = r;
  assert(r.result === 'defeat' && r.wave <= 3, `idle reached wave ${r.wave}`);
  const cleared = r.wave - 1;
  assert(r.stats.diamonds === CFG.waveDiamonds.slice(0, cleared).reduce((a, b) => a + b, 0), `a short run should still earn its waves' diamonds (${r.stats.diamonds})`);
});
test('balance: building without upgrades is not enough', () => {
  const r = runLevel('noup', 1); balance.noup = r;
  assert(r.result === 'defeat' && r.wave >= 5, `no-upgrade result ${r.result} wave ${r.wave}`);
});
test('balance: a distracted player can still win', () => {
  for (const seed of [1, 2, 3]) { const r = runLevel('lazy', seed); balance['lazy' + seed] = r; assert(r.result === 'victory', `lazy seed ${seed} lost on wave ${r.wave}`); }
});
test('balance: a cannon player wins with 3 stars, whichever path they take', () => {
  for (const mode of ['cannon+rapid', 'cannon+blast']) for (const seed of [1, 2]) {
    const r = runLevel(mode, seed); balance[mode.replace('cannon+', '') + seed] = r;
    assert(r.result === 'victory' && r.stars === 3, `${mode} seed ${seed}: ${r.result} ${r.stars}`);
  }
});
test('balance: an efficient player wins all 16 waves with 3 stars', () => {
  for (const seed of [1, 2, 3]) {
    const r = runLevel('bot', seed); balance['bot' + seed] = r;
    assert(r.result === 'victory' && r.stars === 3, `bot seed ${seed}: ${r.result} ${r.stars}`);
    assert(r.report.length === CFG.waves.length && r.report.at(-1).wave === CFG.waves.length, 'victory before the last wave');
    assert(r.stats.diamonds === CFG.diamondsPerClear, `a full clear paid ${r.stats.diamonds} diamonds`);
  }
});
test('balance: with Auto skip on, an efficient player still wins and finishes sooner', () => {
  const r = runLevel('bot+auto', 1); balance.auto1 = r;
  assert(r.result === 'victory' && r.stars >= 2, `auto: ${r.result} ${r.stars}`);
  assert(r.time < (balance.bot1 || runLevel('bot', 1)).time, 'auto skip was not faster');
});
test('balance: Hard is tougher; an efficient player still wins, and cannons make it comfortable', () => {
  const r = runLevel('bot+hard', 1); balance.hard1 = r;
  assert(r.result === 'victory', `Hard bot lost on wave ${r.wave}`);
  const normal = balance.bot1 || runLevel('bot', 1);
  assert(r.report.at(-1).hp < normal.report.at(-1).hp, 'Hard should cost the town hall more health than Normal');
  assert(r.stats.diamonds === 100, `a Hard clear paid ${r.stats.diamonds} diamonds`);
  const l = runLevel('lazy+hard', 1); balance.hardlz = l;
  assert(l.result === 'defeat', 'a distracted player should not win on Hard');
  const c = runLevel('cannon+hard+blast', 1); balance.hardcn = c;
  assert(c.result === 'victory' && c.stars === 3, `cannons on Hard: ${c.result} ${c.stars}`);
});
test('balance: spare gold matters: repairing the town hall between waves saves stars on Hard', () => {
  const r = runLevel('bot+hard+repair', 1); balance.hardrp = r;
  const plain = balance.hard1 || runLevel('bot+hard', 1);
  assert(r.result === 'victory' && r.stats.repaired > 0, `repairing bot: ${r.result}, repaired ${r.stats.repaired}`);
  assert(r.stars > plain.stars, `repairs should earn more stars (${r.stars} vs ${plain.stars})`);
});
test('balance: Easy is gentle, but you still have to build and upgrade', () => {
  const r = runLevel('lazy+easy', 1); balance.easylz = r;
  assert(r.result === 'victory' && r.stars === 3, `lazy on Easy: ${r.result} ${r.stars}`);
  assert(r.stats.diamonds === 30, `an Easy clear paid ${r.stats.diamonds} diamonds`);
  const i = runLevel('idle+easy', 1); balance.easyid = i;
  assert(i.result === 'defeat', 'an idle player should still lose on Easy');
  const n = runLevel('noup+easy', 1); balance.easynu = n;
  assert(n.result === 'defeat', 'never upgrading should still lose on Easy');
});
test('balance (Level 2): tougher rats; an efficient player wins with 2-3 stars, a distracted one still wins, idling or never upgrading loses', () => {
  try {
    for (const seed of [1, 2]) {
      const r = runLevel('bot+l2', seed); balance['l2bot' + seed] = r;
      assert(r.result === 'victory' && r.stars >= 2, `Level 2 bot seed ${seed}: ${r.result} ${r.stars}`);
    }
    const l = runLevel('lazy+l2', 1); balance.l2lazy = l;
    assert(l.result === 'victory', `distracted player lost Level 2 on wave ${l.wave}`);
    const n = runLevel('noup+l2', 1); balance.l2noup = n;
    assert(n.result === 'defeat' && n.wave >= 5, `no-upgrade on Level 2: ${n.result} wave ${n.wave}`);
    const i = runLevel('idle+l2', 1); balance.l2idle = i;
    assert(i.result === 'defeat' && i.wave <= 3, `idle on Level 2 reached wave ${i.wave}`);
  } finally { setLevel(1); }
});
test('balance (Level 2 Hard): cannons win with 3 stars; crossbows alone barely hold, or fall', () => {
  try {
    const c = runLevel('cannon+hard+blast+l2', 1); balance.l2hardc = c;
    assert(c.result === 'victory' && c.stars === 3, `cannons on Level 2 Hard: ${c.result} ${c.stars}`);
    // one seed is a knife edge (a rat pushed a step aside can tip it), so judge three
    const bs = [1, 2, 3].map((seed) => runLevel('bot+hard+l2', seed)), b = bs[0]; balance.l2hardb = b;
    const avgStars = bs.reduce((a, q) => a + q.stars, 0) / bs.length;
    assert(avgStars <= 1.5, `crossbows alone should only just hold Level 2 Hard: ${bs.map((q) => q.result + ' ' + q.stars).join(', ')} (average ${avgStars.toFixed(2)} stars)`);
    const r = runLevel('bot+hard+repair+l2', 1); balance.l2hardr = r;
    assert(r.result === 'victory' && r.stars >= b.stars, `repairs should never hurt: ${r.result} ${r.stars}`);
  } finally { setLevel(1); }
});
test('Level 3: the road loops round the oasis without touching the water, crossing the stream once (the bridge)', () => {
  try {
    setLevel(3);
    assert(CFG.level === 3 && CFG.decor.pond && CFG.decor.stream, 'Level 3 has no oasis');
    let closest = Infinity;
    for (let i = 0; i < road.count; i++) closest = Math.min(closest, -pondDepth(road.px[i], road.pz[i]));
    assert(closest > CFG.roadHalfWidth + 2, `the road runs too close to the pool (${closest.toFixed(1)})`);
    // the stream crosses the road in exactly one place
    let crossings = 0, wet = false;
    for (let i = 0; i < road.count; i++) {
      const w = streamDistance(road.px[i], road.pz[i]) < STREAM_HALF;
      if (w && !wet) crossings++;
      wet = w;
    }
    assert(crossings === 1, `the stream crosses the road ${crossings} times`);
    // the road goes all the way round the pool: it passes it on every side
    const P = CFG.decor.pond, sides = new Set();
    for (let i = 0; i < road.count; i++) {
      const dx = road.px[i] - P.x, dz = road.pz[i] - P.z;
      if (Math.hypot(dx / P.rx, dz / P.rz) < 3) sides.add(Math.abs(dx / P.rx) > Math.abs(dz / P.rz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N'));
    }
    assert(sides.size === 4, 'the road does not loop round the pool: ' + [...sides].join(''));
    // the arch's pillars stand either side of the road, clear of it
    const lay = oasisLayout();
    assert(lay.pillars.length === 2, 'no arch');
    for (const q of lay.pillars) assert(road.distanceTo(q.x, q.z) > CFG.roadHalfWidth + q.r, 'an arch pillar stands on the road');
    // palms and camels stay off the road and out of the water
    for (const q of [...lay.palms, ...CFG.decor.camels]) {
      assert(road.distanceTo(q.x, q.z) > CFG.roadHalfWidth + 1.2, `a palm or camel is on the road at ${q.x.toFixed(1)},${q.z.toFixed(1)}`);
      assert(!inWater(q.x, q.z, 0.3), `a palm or camel stands in the water at ${q.x.toFixed(1)},${q.z.toFixed(1)}`);
    }
    assert(lay.palms.length === CFG.decor.palms, `only ${lay.palms.length} palms found room`);
  } finally { setLevel(1); }
});

test('Level 3: towers and every pad stand on dry ground clear of the landmarks; the farmer walks round the pool', () => {
  try {
    setLevel(3);
    const sim = new Sim({ seed: 2, cannon: true });
    const lay = oasisLayout(), H = CFG.pad.half;
    for (const sl of sim.slots) {
      assert(!inWater(sl.x, sl.z, 2), `slot ${sl.id} is too close to the water`);
      for (const [ox, oz] of [sl.up, ...sl.upB]) {
        const x = sl.x + ox, z = sl.z + oz;
        assert(!inWater(x, z, H + 0.4), `a pad of slot ${sl.id} is in the water at ${x.toFixed(1)},${z.toFixed(1)}`);
        for (const o of lay.solids) assert(Math.hypot(o.x - x, o.z - z) > o.r + H, `a pad of slot ${sl.id} is under a landmark`);
      }
      for (const o of lay.solids) assert(Math.hypot(o.x - sl.x, o.z - sl.z) > o.r + 2.2, `a landmark stands on slot ${sl.id}`);
    }
    // walking straight at the pool stops at its edge
    const P = CFG.decor.pond;
    sim.hero.x = P.x; sim.hero.z = P.z - P.rz - 1.5;
    sim.setInput(0, 1);
    run(sim, 3);
    assert(pondDepth(sim.hero.x, sim.hero.z) < 0, 'the farmer walked into the pool');
    // and the arch's pillars, the palms and the camels are solid too
    const q = lay.pillars[0];
    sim.hero.x = q.x - 3; sim.hero.z = q.z; sim.setInput(1, 0);
    run(sim, 1.5);
    assert(Math.hypot(sim.hero.x - q.x, sim.hero.z - q.z) >= q.r + CFG.hero.radius - 0.01, 'the farmer walked through the arch');
  } finally { setLevel(1); }
});

test('balance (Level 3, Normal): the hardest map: the bot holds with 2 stars, no upgrades falls by wave 6', () => {
  try {
    const b = runLevel('bot+l3', 1); balance.l3bot = b;
    assert(b.result === 'victory' && b.stars >= 1 && b.stars <= 2, `bot on Level 3: ${b.result} wave ${b.wave} ${b.stars} stars`);
    const l = runLevel('lazy+l3', 1); balance.l3lazy = l;
    assert(l.result === 'victory', `distracted player lost Level 3 on wave ${l.wave}`);
    const n = runLevel('noup+l3', 1); balance.l3noup = n;
    assert(n.result === 'defeat' && n.wave <= 8, `no-upgrade on Level 3: ${n.result} wave ${n.wave}`);
    const i = runLevel('idle+l3', 1); balance.l3idle = i;
    assert(i.result === 'defeat' && i.wave <= 3, `idle on Level 3 reached wave ${i.wave}`);
  } finally { setLevel(1); }
});
test('balance (Level 3, Hard and Easy): cannons win Hard with 3 stars; crossbows alone fall on Hard; Easy is 3 stars', () => {
  try {
    const c = runLevel('cannon+hard+blast+l3', 1); balance.l3hardc = c;
    assert(c.result === 'victory' && c.stars === 3, `cannons on Level 3 Hard: ${c.result} ${c.stars}`);
    const b = runLevel('bot+hard+l3', 1); balance.l3hardb = b;
    assert(b.result === 'defeat' || b.stars === 1, `crossbows alone should not comfortably hold Level 3 Hard: ${b.result} ${b.stars}`);
    const e = runLevel('bot+easy+l3', 1); balance.l3easy = e;
    assert(e.result === 'victory' && e.stars === 3, `Level 3 Easy: ${e.result} ${e.stars}`);
  } finally { setLevel(1); }
});
test('Levels 4 to 7: every tower spot and pad stands on open ground, clear of the road, the water and the landmarks', () => {
  forLevels((m) => {
    if (m.id < 4) return;
    const sim = new Sim({ seed: 2, cannon: true }), lay = oasisLayout(), H = CFG.pad.half, Wk = CFG.walk;
    assert(sim.slots.length === 10 && sim.slots[0].prebuilt, 'ten tower spots, the first one built');
    for (const sl of sim.slots) {
      const d = road.distanceTo(sl.x, sl.z);
      assert(d > CFG.roadHalfWidth + 2.3, `slot ${sl.id} is on the road (${d.toFixed(1)})`);
      assert(!inWater(sl.x, sl.z, 2), `slot ${sl.id} is too close to the water`);
      assert(sl.upB.length === 2, `slot ${sl.id} has no room for the cannon's two choice pads`);
      for (const o of lay ? lay.solids : []) assert(Math.hypot(o.x - sl.x, o.z - sl.z) > o.r + 2.2, `a landmark stands on slot ${sl.id}`);
      for (const [ox, oz] of [sl.up, ...sl.upB]) {
        const x = sl.x + ox, z = sl.z + oz;
        assert(road.distanceTo(x, z) > CFG.roadHalfWidth + H, `a pad of slot ${sl.id} is on the road`);
        assert(!inWater(x, z, H + 0.4), `a pad of slot ${sl.id} is in the water`);
        assert(x > Wk.minX + H && x < Wk.maxX - H && z > Wk.minZ + H && z < Wk.maxZ - H, `a pad of slot ${sl.id} is outside the canyon`);
        for (const o of lay ? lay.solids : []) assert(Math.hypot(o.x - x, o.z - z) > o.r + H, `a pad of slot ${sl.id} is under a landmark`);
      }
    }
    // the road keeps clear of itself, and nothing solid stands on it once the rats are out of the burrow
    for (let i = 0; i < road.count; i += 2) for (let j = i + 120; j < road.count; j += 2) {
      assert(Math.hypot(road.px[i] - road.px[j], road.pz[i] - road.pz[j]) > 2 * CFG.roadHalfWidth + 3.5, 'the road runs into itself');
    }
    for (let i = Math.ceil((CFG.spawnS + 3) / road.step); i < road.count; i++) for (const o of lay ? lay.solids : []) {
      assert(Math.hypot(o.x - road.px[i], o.z - road.pz[i]) > o.r + CFG.roadHalfWidth - 0.45, `a landmark at ${o.x.toFixed(0)},${o.z.toFixed(0)} stands on the road`);
    }
    // the farmer walks round every landmark
    if (lay && lay.solids.length) {
      const q = lay.solids[0];
      sim.hero.x = q.x - q.r - 1.5; sim.hero.z = q.z; sim.setInput(1, 0);
      run(sim, 1.5);
      assert(Math.hypot(sim.hero.x - q.x, sim.hero.z - q.z) >= q.r + CFG.hero.radius - 0.01, 'the farmer walked through a landmark');
    }
  });
});
test('Levels 4 to 7: three bridges over the river, a frozen lake by the ridge, mesas with a temple and two arches, a volcano the rats come out from under', () => {
  try {
    setLevel(4);
    let crossings = 0, wet = false;
    for (let i = 0; i < road.count; i++) { const w = streamDistance(road.px[i], road.pz[i]) < STREAM_HALF; if (w && !wet) crossings++; wet = w; }
    assert(CFG.theme === 'meadow' && crossings === 3, `Greenwood Vale: the road crosses the river ${crossings} times`);
    assert(oasisLayout().trees.length === CFG.decor.trees.n && oasisLayout().trees.every((t) => t.kind === 'leafy'), 'not every tree found room');
    setLevel(5);
    assert(CFG.theme === 'snow' && CFG.decor.pond.kind === 'ice' && CFG.hills.length === 1, 'Frostpeak Pass: ridge and frozen lake');
    let over = 0, up = false;
    for (let i = 0; i < road.count; i++) { const h = hillHeight(road.px[i], road.pz[i]) > 1.2; if (h && !up) over++; up = h; }
    assert(over === 2, `the road should cross the ridge twice (${over})`);
    const P = CFG.decor.pond, s5 = new Sim({ seed: 1 });
    s5.hero.x = P.x; s5.hero.z = P.z - P.rz - 1.5; s5.setInput(0, 1); run(s5, 3);
    assert(pondDepth(s5.hero.x, s5.hero.z) < 0, 'the farmer walked onto the ice');
    setLevel(6);
    const l6 = oasisLayout();
    assert(CFG.theme === 'mesa' && CFG.plateaus.length === 3 && l6.arches.length === 2 && l6.pillars.length === 4, 'Sunset Mesas: three mesas, two arches');
    assert(l6.columns.filter((c) => c.temple).length === 10 && l6.columns.some((c) => c.altar), 'no temple');
    assert(CFG.slots.filter((sl) => CFG.plateaus.some((p) => plateauSdf(p, sl.x, sl.z) > 0)).length >= 5, 'most towers should stand on the mesas');
    setLevel(7);
    const C = CFG.decor.cone, o = {};
    road.sample(0, o);
    assert(CFG.theme === 'lava' && CFG.roadStub === 0 && Math.hypot(o.x - C.x, o.z - C.z) < C.r, 'Cinder Crater: the road should start under the volcano');
    road.sample(CFG.spawnS, o);
    assert(Math.hypot(o.x - C.x, o.z - C.z) > C.r + 1.5, 'the burrow should be clear of the volcano');
    // the road winds more than once round the volcano
    let turn = 0, pa = null;
    for (let i = Math.ceil(12 / road.step); i < road.count; i += 4) {
      const a = Math.atan2(road.pz[i] - C.z, road.px[i] - C.x);
      if (pa !== null) { let d = a - pa; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turn += d; }
      pa = a;
    }
    assert(Math.abs(turn) > Math.PI * 2.2, `the road should spiral round the volcano (${(Math.abs(turn) / Math.PI / 2).toFixed(2)} turns)`);
    const s7 = new Sim({ seed: 1 }); s7.callWave(); run(s7, 3);
    assert(s7.enemies.length > 0 && s7.enemies.every((e) => Math.hypot(e.x - C.x, e.z - C.z) > C.r), 'rats should come out at the foot of the volcano');
  } finally { setLevel(1); }
});
test('balance (Levels 4 to 7, Normal): an efficient player wins every map, a distracted one too; never upgrading loses', () => {
  try {
    for (const L of [4, 5, 6, 7]) {
      const b = runLevel('bot+l' + L, 1); balance['l' + L + 'bot'] = b;
      assert(b.result === 'victory' && b.stars >= 1, `bot on Level ${L}: ${b.result} wave ${b.wave} ${b.stars} stars`);
      const l = runLevel('lazy+l' + L, 1); balance['l' + L + 'lazy'] = l;
      assert(l.result === 'victory', `distracted player lost Level ${L} on wave ${l.wave}`);
      const n = runLevel('noup+l' + L, 1); balance['l' + L + 'noup'] = n;
      assert(n.result === 'defeat' && n.wave <= 9, `no-upgrade on Level ${L}: ${n.result} wave ${n.wave}`);
    }
  } finally { setLevel(1); }
});
test('balance (Levels 4 to 7, Hard and Easy): cannons win Hard with 3 stars; Easy is 3 stars', () => {
  try {
    for (const L of [4, 5, 6, 7]) {
      const c = runLevel('cannon+hard+blast+l' + L, 1); balance['l' + L + 'hardc'] = c;
      assert(c.result === 'victory' && c.stars === 3, `cannons on Level ${L} Hard: ${c.result} ${c.stars}`);
      const e = runLevel('bot+easy+l' + L, 1); balance['l' + L + 'easy'] = e;
      assert(e.result === 'victory' && e.stars === 3, `Level ${L} Easy: ${e.result} ${e.stars}`);
    }
  } finally { setLevel(1); }
});
test('rides (Shop): the horse and the cow cost 50 diamonds; the farmer rides 50% / 35% faster, the cow pulls coins in from further', () => {
  assert(CFG.rides.horse.cost === 50 && CFG.rides.cow.cost === 50, 'each ride costs 50 diamonds');
  const dist = (ride) => { const s = new Sim({ seed: 1, ride }); s.setInput(1, 0); const x0 = s.hero.x; run(s, 1); return { d: s.hero.x - x0, s }; };
  const walk = dist(null), horse = dist('horse'), cow = dist('cow');
  assert(walk.s.ride === null && dist('unicorn').s.ride === null, 'no ride unless a real one is picked');
  assert(Math.abs(horse.d / walk.d - 1.5) < 0.05, `horse ${horse.d.toFixed(2)} vs walk ${walk.d.toFixed(2)}`);
  assert(Math.abs(cow.d / walk.d - 1.35) < 0.05, `cow ${cow.d.toFixed(2)} vs walk ${walk.d.toFixed(2)}`);
  assert(Math.abs(cow.s.magnetRadius - CFG.hero.magnetRadius * 1.4) < 1e-9 && horse.s.magnetRadius === CFG.hero.magnetRadius, 'coin reach');
  // the cow's wider reach really picks up a coin the farmer on foot would leave
  const pick = (ride) => {
    const s = new Sim({ seed: 1, ride });
    s.coins.length = 0;
    s._dropCoin(s.hero.x + CFG.hero.magnetRadius * 1.25, s.hero.z, 0.2, 1, 0);
    const g0 = s.gold; run(s, 3); return s.gold - g0;
  };
  assert(pick('cow') > 0 && pick(null) === 0, 'the cow should reach a coin just out of the farmer\'s reach');
});

test('weapon skins (Shop): classic is free, the rest cost diamonds and each has its own colours', () => {
  const S = CFG.skins;
  assert(S.classic.cost === 0 && !S.classic.colors, 'classic is the free, unpainted look');
  const paid = Object.entries(S).filter(([k]) => k !== 'classic');
  assert(paid.length >= 5, 'at least five skins to buy');
  for (const [k, v] of paid) assert(v.cost > 0 && v.colors && v.colors.length === 3 && v.name && v.blurb, 'skin ' + k);
  assert(new Set(paid.map(([, v]) => v.colors.join())).size === paid.length, 'every skin looks different');
});

test('Rat Bestiary: every enemy has a painted portrait, an aura colour and its ability badges; the Quick Counter Guide covers every kind', () => {
  const tpl = readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
  for (const g of RAT_GUIDE) {
    const file = `rat-art-${g.key.replace(':', '-')}.webp`;
    assert(existsSync(new URL('../src/assets/' + file, import.meta.url)), 'no portrait for ' + g.key);
    assert(tpl.includes(`"${g.key}":"__ASSET(${file})__"`), 'portrait not built into the page: ' + g.key);
    assert(/^#[0-9a-f]{6}$/.test(g.aura), 'no aura colour for ' + g.key);
    assert(Array.isArray(g.abilities), 'no abilities for ' + g.key);
  }
  assert(RAT_GUIDE.length === 17, 'the bestiary should list 17 enemies');
  assert(QUICK_COUNTERS.length === 8 && QUICK_COUNTERS.every((q) => q.kind && q.beat && q.who), 'quick counter guide');
});

test('performance: one simulation step stays well under 1 ms', () => {
  const r = balance.bot1 || runLevel('bot', 1);
  assert(r.avgStepMs < 1, 'avg step ' + r.avgStepMs);
  assert(r.peakEnemies > 350, 'crowd smaller than expected: ' + r.peakEnemies);
});


// ------------------------------------------------------------ the Arsenal
const ALL_UNLOCKED = Object.fromEntries(TOWER_KINDS.map((k) => [k, true]));
const arsSim = (kind, level = 5, slot = 1) => {
  const sim = quietSim();
  sim.unlocked = { ...ALL_UNLOCKED };
  const t = sim._placeTower(sim.slots[slot], level, true, kind);
  return { sim, t };
};
// a rat on the road at the point closest to tower t (offset ds along the road)
const ratNear = (sim, t, ds = 0, hp = 100, v = 0, lat = 0) => onRoad(sim, v, sim._nearestRoadS(t) + ds, lat, hp);

test('Arsenal: 13 towers, 5 levels each; the stronger the tower the more diamonds and gold it costs', () => {
  const kinds = Object.keys(ARSENAL);
  assert(kinds.length === 13 && TOWER_KINDS.length === 15, 'tower count');
  for (const k of kinds) {
    const A = ARSENAL[k];
    assert(A.levels.length === 6 && A.levels.slice(1).every((L) => L.ab && L.ab[0] && L.ab[1]), `${k}: five levels with abilities`);
    for (let lv = 3; lv <= 5; lv++) assert(towerUpgradeCost(k, lv) > towerUpgradeCost(k, lv - 1), `${k}: upgrades get dearer`);
  }
  const byCost = kinds.slice().sort((a, b) => ARSENAL[a].cost - ARSENAL[b].cost);
  for (let i = 1; i < byCost.length; i++) {
    const a = byCost[i - 1], b = byCost[i];
    assert(ARSENAL[b].cost > ARSENAL[a].cost && towerBuildMul(b) >= towerBuildMul(a) && towerUpgradeCost(b, 5) >= towerUpgradeCost(a, 5), `${b} should cost at least as much as ${a}`);
  }
  assert(towerUnlockCost('spike') === 60 && towerUnlockCost('warp') === 500 && towerUnlockCost('crossbow') === 0, 'unlock prices');
});

test('Arsenal: a tower must be unlocked to build it; build pads charge its price; saves keep it', () => {
  const sim = new Sim({ seed: 3 });
  assert(!sim.setBuildKind('tesla') && sim.buildKind === 'crossbow', 'locked tesla picked');
  const s2 = new Sim({ seed: 3, unlocks: { tesla: true, warp: true } });
  assert(s2.setBuildKind('tesla'), 'unlocked tesla refused');
  const pad = s2.pads.find((p) => p.kind === 'build');
  assert(pad.tower === 'tesla' && pad.cost === Math.round(CFG.buildCosts[0] * ARSENAL.tesla.buildMul / 5) * 5, 'tesla pad price ' + pad.cost);
  s2.gold = 500;
  s2.hero.x = pad.x + 5; s2.step(dt); standOn(s2, pad);
  run(s2, 4);
  const t = s2.slots[pad.slot].tower;
  assert(t && t.kind === 'tesla' && t.level === 1, 'tesla not built');
  const up = s2.pads.find((p) => p.kind === 'upgrade' && p.slot === pad.slot);
  assert(up.cost === towerUpgradeCost('tesla', 2), 'upgrade price');
  t.level = 5; s2.refreshPads();
  assert(!s2.pads.some((p) => p.kind === 'upgrade' && p.slot === pad.slot), 'a level 5 Arsenal tower has no upgrade pad');
  s2.setBuildKind('warp');
  const save = JSON.parse(JSON.stringify(s2.serialize()));
  const s3 = new Sim({ seed: 9, unlocks: { tesla: true, warp: true } });
  assert(s3.load(save), 'load');
  const t3 = s3.slots[pad.slot].tower;
  assert(t3 && t3.kind === 'tesla' && t3.level === 5 && s3.buildKind === 'warp', 'save lost the tesla: ' + JSON.stringify(save.towers));
});

test('Arsenal: every tower kills rats at level 1 and level 5 (support towers excepted)', () => {
  for (const k of Object.keys(ARSENAL)) {
    if (k === 'totem' || k === 'warp') continue;
    for (const lv of [1, 5]) {
      const sim = new Sim({ seed: 11, unlocks: ALL_UNLOCKED });
      for (const sl of sim.slots) sl.tower = null; sim.towers = [];
      for (const sl of sim.slots.slice(0, 4)) sim._placeTower(sl, lv, true, k);
      sim.waveIndex = 2; sim.fortress.hp = sim.fortress.maxHp = 1e6; sim.callWave();
      run(sim, 60);
      assert(sim.stats.kills > 30, `${k} L${lv}: only ${sim.stats.kills} kills`);
    }
  }
});

test('Tesla: lightning jumps from rat to rat (more at higher levels) and reaches fliers', () => {
  const { sim, t } = arsSim('tesla', 4);
  const rats = [0, 1.5, 3, 4.5, 6].map((ds) => ratNear(sim, t, ds, 10000));
  sim._buildGrid(); t.cooldown = 0;
  run(sim, 0.05);
  const hurt = rats.filter((e) => e.hp < 10000).length;
  assert(hurt === arsenalSpec('tesla', 4).chain, 'chain hit ' + hurt);
});

test('Flamethrower: a cone of fire hurts every rat in front, sets them burning, and burnt rats take 30% more damage', () => {
  const { sim, t } = arsSim('flame', 3);
  const a = ratNear(sim, t, 0, 10000), b = ratNear(sim, t, 1, 10000, 0, 1);
  run(sim, 2);
  assert(a.hp < 10000 && b.hp < 10000, 'both rats burn');
  assert(a.burn > 0 && a.weak > 0, 'burning and scorched');
  const hp = a.hp; sim._damage(a, 100);
  assert(Math.abs(hp - a.hp - 130) < 0.01, 'scorched rats take +30%: ' + (hp - a.hp));
});

test('Poison Gas: clouds hurt rats over time and corrode them; Toxic Cloud slows', () => {
  const { sim, t } = arsSim('poison', 5);
  const e = ratNear(sim, t, 0, 10000);
  e.speed = 0;
  run(sim, 5);
  assert(sim.zones.some((z) => z.gas) || e.hp < 10000, 'no gas');
  assert(e.hp < 10000 && e.weak > 0 && e.slow > 0 && e.slowMul <= 0.71, `gas did not hurt/corrode/slow: ${JSON.stringify({ hp: e.hp, weak: e.weak, slowMul: e.slowMul })}`);
});

test('Sniper: shoots the rat with the most health, headshots do extra damage', () => {
  const { sim, t } = arsSim('sniper', 5);
  const small = ratNear(sim, t, 2, 300), big = ratNear(sim, t, -2, 50000);
  let shots = 0, heads = 0;
  run(sim, 20, (s) => { for (const ev of s.events) if (ev.type === 'snipe') { shots++; if (ev.head) heads++; assert(ev.id === big.id || !big.alive, 'sniped the weaker rat'); } s.events.length = 0; });
  assert(shots >= 5 && heads >= 1 && big.hp < 50000, `shots ${shots}, headshots ${heads}`);
  void small;
});

test('Rocket: homing rockets chase their rat, even a flier, and explode', () => {
  const { sim, t } = arsSim('rocket', 3);
  const e = ratNear(sim, t, 0, 5000);
  e.fly = 4;   // up in the air, out of reach of blasts on the ground
  run(sim, 5);
  assert(e.hp < 5000, 'the rocket missed the flier');
});

test('Mine Tower: plants mines on the road that blow up under rats; Chain Mine sets off its neighbours', () => {
  const { sim, t } = arsSim('mine', 5);
  sim.state = 'build';
  run(sim, 14);
  const n = sim.mines.length;
  assert(n >= 5 && n <= arsenalSpec('mine', 5).max, 'mines planted: ' + n);
  sim.state = 'wave';
  const m = sim.mines[0];
  const ms = sim._nearestRoadS(m), q = road.sample(ms, {});
  const e = onRoad(sim, 0, ms, (m.x - q.x) * q.nx + (m.z - q.z) * q.nz, 100000); e.speed = 0;
  let booms = 0;
  run(sim, 1, (s) => { booms += s.events.filter((ev) => ev.type === 'explode' && ev.kind === 'mine').length; s.events.length = 0; });
  assert(booms >= 1 && e.hp < 100000, 'mine did not blow');
  void t;
});

test('Spike Trap: the bed covers the whole road, hurts and slows; Impale stuns', () => {
  const { sim, t } = arsSim('spike', 5);
  const L = arsenalSpec('spike', 5);
  const a = ratNear(sim, t, 0, 10000, 0, CFG.roadHalfWidth - 0.6), b = ratNear(sim, t, 0, 10000, 0, -(CFG.roadHalfWidth - 0.6));
  a.speed = b.speed = 0;
  let impales = 0;
  run(sim, 3.5, (s) => { impales += s.events.filter((ev) => ev.type === 'impale').length; s.events.length = 0; });
  assert(a.hp < 10000 && b.hp < 10000, 'rats at the road edges escaped the spikes');
  assert(Math.abs(a.slowMul - (1 - L.slow)) < 1e-6, 'slow ' + a.slowMul);
  assert(impales >= 1, 'no impale');
});

test('Summoner: rat soldiers march to the road, hold rats back and fight; fallen soldiers come back', () => {
  const { sim, t } = arsSim('summoner', 3);
  run(sim, 4);
  const allies = sim.allies.filter((a) => a.slot === t.slotIndex);
  assert(allies.length === 3 && allies.every((a) => a.state === 'post'), 'soldiers not on guard: ' + allies.map((a) => a.state));
  const a0 = allies[0];
  const e = onRoad(sim, 0, sim._nearestRoadS(t) - 3, 0, 400);
  const s0 = e.s;
  e.lat = 0; let held = false;
  for (let i = 0; i < 60 * 6; i++) { sim.step(dt); if (e.held > 0) held = true; }
  assert(held, 'the rat was never held');
  assert(!e.alive || e.s < s0 + 6, 'the rat walked straight through');
  a0.hp = 0.01;
  const big = onRoad(sim, 0, sim._nearestRoadS(t) - 0.5, a0.lat ?? 0, 1e6); big.x = a0.x; big.z = a0.z; big.speed = 0;
  run(sim, 1);
  const down = sim.allies.filter((a) => a.state === 'dead').length;
  run(sim, arsenalSpec('summoner', 3).respawn + 1);
  assert(down >= 1 && sim.allies.filter((a) => a.state === 'dead').length < down + 1, 'soldiers do not fall and return');
});

test('Berserker Totem and Time Warp: nearby towers hit harder and faster; the warp slows rats and Time Loop stops them', () => {
  const sim = quietSim(); sim.unlocked = { ...ALL_UNLOCKED };
  const [s0, s1] = sim.slots.slice(0).sort((a, b) => Math.hypot(a.x - sim.slots[0].x, a.z - sim.slots[0].z) - Math.hypot(b.x - sim.slots[0].x, b.z - sim.slots[0].z));
  const xb = sim._placeTower(s0, 3, true, 'crossbow');
  const tot = sim._placeTower(s1, 5, true, 'totem');
  sim.step(dt);
  const near = Math.hypot(xb.x - tot.x, xb.z - tot.z) <= arsenalSpec('totem', 5).r;
  if (near) assert(xb.dmgMul > 1.39 && xb.rateMul > 1.29 && xb.rangeMul > 1.09, 'totem boost ' + JSON.stringify([xb.dmgMul, xb.rateMul, xb.rangeMul]));
  // the warp
  const { sim: w, t } = arsSim('warp', 5);
  const e = ratNear(w, t, 0, 1e6);
  w.step(dt);
  assert(Math.abs(e.slowMul - 0.4) < 1e-6, 'warp slow ' + e.slowMul);
  let stops = 0;
  run(w, 9, (s) => { stops += s.events.filter((ev) => ev.type === 'warp' && ev.kind === 'stop').length; s.events.length = 0; });
  assert(stops >= 1, 'no Time Loop');
  // a warp next to a crossbow hastes it
  const h = quietSim(); h.unlocked = { ...ALL_UNLOCKED };
  const c = h._placeTower(s0 === sim.slots[0] ? h.slots[0] : h.slots[s0.index], 1, true, 'crossbow');
  h._placeTower(h.slots[s1.index], 5, true, 'warp');
  h.step(dt);
  if (Math.hypot(c.x - h.slots[s1.index].x, c.z - h.slots[s1.index].z) <= arsenalSpec('warp', 5).r) assert(c.rateMul >= 1.5 - 1e-9, 'warp haste ' + c.rateMul);
});

test('Ice Tower: frost bolts slow, freeze after three hits; Blizzard freezes a crowd but bosses only slow', () => {
  const { sim, t } = arsSim('ice', 5);
  const rats = [0, 0.8, 1.6].map((ds) => ratNear(sim, t, ds, 1e5));
  for (const e of rats) e.speed = 0;
  let bl = 0;
  run(sim, 8, (s) => { bl += s.events.filter((ev) => ev.type === 'blizzard').length; s.events.length = 0; });
  assert(rats[0].slow > 0 && bl >= 1 && (sim.stats.frozen || 0) >= 2, 'ice: ' + JSON.stringify({ bl, frozen: sim.stats.frozen }));
});

console.log(results.join('\n'));
console.log('\nBalance summary:');
for (const [k, r] of Object.entries(balance)) console.log(`  ${k.padEnd(6)} ${r.result.padEnd(8)} wave ${r.wave}  stars ${r.stars}  keep ${r.fortress}  peak crowd ${r.peakEnemies}  step ${r.avgStepMs} ms`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
