// ===================================================================== core: rules, map, physics, match, bots
// Shared by the offline game, the online host (the authority) and the online clients (for prediction).
const DT = 1 / 60, H = 1.5, RAD = 0.33, STEP = 0.36, SC = 1.5, HALF = 30 * SC, GRAV = 20;  // the page is 90 m by 90 m; SC scales the whole world, the doodles stay their size
const MAXHP = 100, LIVES = 3, COUNTDOWN = 3, SD_T = 150, END_T = 230, ZONE_R0 = 66, ZONE_R1 = 6, ZONE_DUR = 70;
const RUN = 6.2, WALK = 2.5, ACC = 36, AIR_ACC = 14, JUMP = 7.4, JUMP2 = 6.6, DASH = 14;
const BULLET_V = 26, BULLET_LIFE = 1.3, DMG = 13, FIRE_EVERY = 0.2;
const COLORS = [
  { name: 'Blue', hex: '#3b7bff', hue: null },
  { name: 'Red', hex: '#ff4d5e', hue: 354 },
  { name: 'Green', hex: '#2fbf5f', hue: 128 },
  { name: 'Orange', hex: '#ff9a1f', hue: 32 },
];
const BOT_NAMES = ['Scribbles', 'Smudgy', 'Inkling', 'Squiggle', 'Crayonne', 'Pencilvania', 'Doodlebug', 'Sketchy'];
const POWERS = {
  h: { name: 'Band-aid', note: '+40 health' },
  s: { name: 'Speed sneakers', note: 'Run faster, dash more often', t: 10 },
  b: { name: 'Bubble shield', note: 'Soaks up 50 damage' },
  t: { name: 'Triple shot', note: 'Three ink shots at once', t: 10 },
  p: { name: 'Sharpener', note: 'Shots hit 60% harder', t: 10 },
};
const PW_CODES = ['', 's', 't', 'p'];
const BOT = {
  easy: { err: 1.0, react: 0.6, fire: 0.45, dodge: 0, keep: 8, jumpy: 0.15, lead: 0.4, range: 15 },
  normal: { err: 0.5, react: 0.32, fire: 0.75, dodge: 0.2, keep: 7, jumpy: 0.45, lead: 0.85, range: 18 },
  hard: { err: 0.22, react: 0.16, fire: 0.95, dodge: 0.45, keep: 6.5, jumpy: 0.8, lead: 1, range: 20 },
};
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---- the arena: one big sheet of notebook paper on a desk. Every quarter is the same layout turned by 90 degrees, so all four spawns are equal.
// Fall off the edge of the page and you lose a life.
const ARM_IN = 6.5 * SC, ARM_OUT = 11.5 * SC, ARM_H = 0.8;  // the sweeping pencil reaches from 9.75 to 17.25 m out (low enough to jump)
const MAP = (() => {
  const boxes = [], lifts = [], pads = [], tps = [], spawns = [], spawners = [], crates = [], trees = [], decor = [], targets = [];
  const rq = (x, z, q) => { for (let i = 0; i < q; i++) [x, z] = [-z, x]; return [x, z]; };
  const box = (cx, cz, w, d, bottom, top, kind, q = 0, extra = {}) => {
    const [x, z] = rq(cx, cz, q), [ww, dd] = q % 2 ? [d, w] : [w, d];
    return { minX: x - ww / 2, maxX: x + ww / 2, minZ: z - dd / 2, maxZ: z + dd / 2, bottom, top, kind, q, cx: x, cz: z, w: ww, d: dd, ...extra };
  };
  // the layout is drawn at 1x and scaled by SC: positions, widths and heights alike
  const k = v => v * SC;
  const TOWER = k(3.6), MID = k(1.9);
  boxes.push(box(0, 0, k(8), k(8), 0, TOWER, 'tower'));
  // a pad launch: up from the pad, landing at (tx, tz) on a top at height `land`
  const padLaunch = (vy, land) => { const dh = land - 0.2; return (vy + Math.sqrt(vy * vy - 2 * GRAV * dh)) / GRAV; };
  for (let q = 0; q < 4; q++) {
    // along each axis: a sticky-note lift beside the tower, a long ruler bridge (you can walk under it), a big book at the far end
    lifts.push(box(k(5), 0, k(2), k(2), 0, MID, 'lift', q, { lo: MID, hi: TOWER }));
    boxes.push(box(k(11), 0, k(10), k(1.5), k(1.6), MID, 'bridge', q));
    boxes.push(box(k(18), 0, k(4), k(5), 0, MID, 'book', q));
    // in each quarter: the spawn, a pad up to the tower, crates, eraser cover, a pencil box, a stack of books, trees, a teleporter
    { const [x, z] = rq(k(19), k(19), q); spawns.push({ x, z, yaw: Math.atan2(-x, -z) }); }
    { const [x, z] = rq(k(7.4), k(7.4), q), [tx, tz] = rq(k(2.2), k(2.2), q); pads.push({ x, z, r: k(0.85), top: 0.2, tx, tz, q, vy: 16, tt: padLaunch(16, TOWER) }); boxes.push(box(k(7.4), k(7.4), k(1.7), k(1.7), 0, 0.2, 'pad', q)); }
    for (const [cx, cz] of [[12.6, 5.6], [13.8, 5.6], [5.6, 12.6], [5.6, 13.8], [11.4, 11.4]]) crates.push(box(k(cx), k(cz), k(1.0), k(1.0), 0, k(1.0), 'crate', q));
    boxes.push(box(k(15.2), k(12.2), k(1.4), k(2.6), 0, k(1.1), 'eraser', q));
    boxes.push(box(k(12.2), k(15.2), k(2.6), k(1.4), 0, k(1.1), 'eraser', q));
    boxes.push(box(k(24.5), k(13), k(2), k(6), 0, k(1.4), 'pbox', q));
    boxes.push(box(k(12.5), k(23.5), k(4.2), k(3.2), 0, k(1.0), 'book2', q));
    boxes.push(box(k(12.8), k(23.8), k(3), k(2.2), k(1.0), k(2.0), 'book3', q));
    { const [x, z] = rq(k(17.5), k(7.5), q); trees.push({ x, z, r: k(0.38), s: k(1.2) }); }
    for (const [cx, cz, s] of [[27.2, 3.5, 1.1], [26.5, 26.5, 1.3], [7, 27.2, 1.0]]) { const [x, z] = rq(k(cx), k(cz), q); trees.push({ x, z, r: k(0.34), s: k(s) }); }
    { const [x, z] = rq(k(26), k(8.5), q); tps.push({ x, z, r: k(0.75), q, to: (q + 2) % 4 }); }
    { const [x, z] = rq(k(15), k(19.5), q); spawners.push({ x, y: 0, z, kinds: 'h', every: 12 }); }
    { const [x, z] = rq(k(18), 0, q); spawners.push({ x, y: MID, z, kinds: 'stb', every: 14 }); }
    { const [x, z] = rq(k(12.8), k(23.8), q); spawners.push({ x, y: k(2.0), z, kinds: 'sb', every: 16 }); }
  }
  spawners.push({ x: 0, y: TOWER, z: 0, kinds: 'pt', every: 16, big: true });
  for (const [x, y, z] of [[8, 0, -9.5], [-10, 0, 7.5], [0, 3.6, 2.6], [18, 1.9, 1.6], [-18, 1.9, -1.6], [4, 0, 21], [-21, 0, -8], [24.5, 1.4, 13], [-12.8, 2.0, -23.8]]) targets.push({ x: k(x), y: k(y), z: k(z) });
  for (const t of trees) boxes.push({ minX: t.x - t.r, maxX: t.x + t.r, minZ: t.z - t.r, maxZ: t.z + t.r, bottom: 0, top: 2.3 * t.s, kind: 'trunk', bulletOnly: true });
  return { boxes, lifts, pads, tps, spawns, spawners, crates, trees, decor, targets, rq, TOWER, MID };
})();
const onPage = (x, z, m = 0) => Math.abs(x) < HALF + m && Math.abs(z) < HALF + m;
const edgeDist = (x, z) => HALF - Math.max(Math.abs(x), Math.abs(z));

function liftTop(l, t) {
  const c = ((t % 6) + 6) % 6;
  const s = c < 1.5 ? 0 : c < 3 ? smooth((c - 1.5) / 1.5) : c < 4.5 ? 1 : 1 - smooth((c - 4.5) / 1.5);
  return l.lo + (l.hi - l.lo) * s;
}
const armAngle = t => t * 0.3 + Math.max(0, t - SD_T) * 0.22;
const zoneRadius = t => t < SD_T ? 99 : lerp(ZONE_R0, ZONE_R1, clamp((t - SD_T) / ZONE_DUR, 0, 1));

// the page as it is at time t: fixed boxes, lifts where they are now, crates that are standing
class World {
  constructor() { this.boxes = []; this.liftBoxes = MAP.lifts.map(l => ({ ...l })); this.t = 0; this.arm = 0; this.zone = 99; this.trees = MAP.trees; }
  update(t, crates) {
    this.t = t; this.arm = armAngle(t); this.zone = zoneRadius(t);
    const B = this.boxes; B.length = 0;
    for (const b of MAP.boxes) if (!b.bulletOnly) B.push(b);
    for (const l of this.liftBoxes) { l.top = liftTop(l, t); B.push(l); }
    if (crates) for (let i = 0; i < MAP.crates.length; i++) if (crates[i]) B.push(MAP.crates[i]);
    return this;
  }
}

function support(W, x, z, y) {
  let best = onPage(x, z, 0.12) ? 0 : -1e9;
  const m = RAD * 0.7;
  for (const b of W.boxes) if (b.top <= y + STEP && b.top > best && x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m) best = b.top;
  return best;
}
function pushOut(p, W) {
  for (const b of W.boxes) {
    if (p.y >= b.top - STEP || p.y + H <= b.bottom + 0.02) continue;
    const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= RAD * RAD) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), k = (RAD - d) / d, nx = dx / d, nz = dz / d;
      p.x += dx * k; p.z += dz * k;
      const vn = p.vx * nx + p.vz * nz; if (vn < 0) { p.vx -= vn * nx; p.vz -= vn * nz; }
    } else {
      let o = [p.x - b.minX, -1, 0];
      if (b.maxX - p.x < o[0]) o = [b.maxX - p.x, 1, 0];
      if (p.z - b.minZ < o[0]) o = [p.z - b.minZ, 0, -1];
      if (b.maxZ - p.z < o[0]) o = [b.maxZ - p.z, 0, 1];
      p.x += o[1] * (o[0] + RAD); p.z += o[2] * (o[0] + RAD);
    }
  }
  for (const t of W.trees) {
    if (p.y > 2.3 * t.s) continue;
    const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), m = RAD + t.r;
    if (d < m && d > 1e-6) { p.x = t.x + dx / d * m; p.z = t.z + dz / d * m; const nx = dx / d, nz = dz / d, vn = p.vx * nx + p.vz * nz; if (vn < 0) { p.vx -= vn * nx; p.vz -= vn * nz; } }
  }
}
function headBump(p, W) {
  if (p.vy <= 0) return;
  const m = RAD * 0.6;
  for (const b of W.boxes) if (b.bottom > p.y + 0.3 && p.y + H > b.bottom && p.x > b.minX - m && p.x < b.maxX + m && p.z > b.minZ - m && p.z < b.maxZ + m) { p.y = b.bottom - H; p.vy = 0; }
}

// One fixed step of one doodle. Pure in (p, inp, W) so a client predicts its own doodle with the same code the host runs.
// inp: { mx, mz (world-space move, length <= 1), walk, aim, jh (jump held), jumpE, dashE, ax, ay, az }
function stepPlayer(p, inp, W, fx) {
  if (!p.alive) return;
  const dt = DT;
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.stunT > 0) p.stunT -= dt;
  if (p.tpCd > 0) p.tpCd -= dt;
  if (p.inv > 0) p.inv -= dt;
  if (p.aimT > 0) p.aimT -= dt;
  if (p.emoteT > 0) { p.emoteT -= dt; if (p.emoteT <= 0) p.emote = 0; }
  const flop = p.emote === 2;
  let mx = num(inp.mx), mz = num(inp.mz), ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
  if (flop || p.frozen) { mx = mz = 0; ml = 0; }
  if (ml > 0.15 && p.emote === 1) { p.emote = 0; p.emoteT = 0; }
  const ctrl = p.stunT > 0 ? 0.2 : 1;
  const spd = (inp.aim || inp.walk ? WALK : RUN) * (p.pw === 's' ? 1.35 : 1);
  if (inp.dashE && p.dashCd <= 0 && !flop && p.stunT <= 0) {
    let dx = mx, dz = mz;
    if (ml < 0.15) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); }
    const l = Math.hypot(dx, dz) || 1;
    p.vx = dx / l * DASH; p.vz = dz / l * DASH; if (!p.ground) p.vy = Math.max(p.vy, 1.5);
    p.dashT = 0.22; p.dashCd = p.pw === 's' ? 0.45 : 0.75; p.emote = 0;
    if (fx) fx('dash', p.slot);
  }
  if (p.dashT > 0) p.dashT -= dt;
  else {
    const a = (p.ground ? ACC : AIR_ACC) * ctrl * dt, wx = mx * spd, wz = mz * spd, dx = wx - p.vx, dz = wz - p.vz, l = Math.hypot(dx, dz);
    if (l > a) { p.vx += dx / l * a; p.vz += dz / l * a; } else { p.vx = wx; p.vz = wz; }
    // air drag on anything faster than a run, so knockback and dashes don't send you sailing across the map
    const hs = Math.hypot(p.vx, p.vz);
    if (!p.ground && hs > RUN) { const k = Math.max(RUN, hs - 11 * dt) / hs; p.vx *= k; p.vz *= k; }
  }
  p.coyote = p.ground ? 0.1 : Math.max(0, p.coyote - dt);
  if (inp.jumpE && !flop && p.stunT <= 0) {
    if (p.ground || p.coyote > 0) { p.vy = JUMP; p.ground = false; p.coyote = 0; p.emote = 0; if (fx) fx('jump', p.slot); }
    else if (p.airJumps > 0) { p.vy = JUMP2; p.airJumps--; if (fx) fx('jump2', p.slot); }
  }
  if (p.padT > 0) p.padT -= dt;
  p.vy -= GRAV * (p.vy > 0 && inp.jh && !(p.padT > 0) ? 0.72 : 1) * (p.dashT > 0 ? 0.3 : 1) * dt;
  if (p.vy < -26) p.vy = -26;
  const wasGround = p.ground, vyIn = p.vy;
  const n = Math.min(5, Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy, p.vz) * dt / 0.12))), sdt = dt / n;
  for (let i = 0; i < n; i++) {
    p.x += p.vx * sdt; p.z += p.vz * sdt;
    pushOut(p, W);
    const floor = support(W, p.x, p.z, p.y);
    p.y += p.vy * sdt;
    headBump(p, W);
    if (p.y <= floor && p.vy <= 0) { p.y = floor; p.vy = 0; p.ground = true; p.airJumps = 1; }
    else if (wasGround && p.vy <= 0 && p.y > floor && p.y - floor < STEP && floor > -1) { p.y = floor; p.vy = 0; p.ground = true; }
    else if (p.y > floor + 0.02) p.ground = false;
  }
  if (!wasGround && p.ground && vyIn < -7.5 && fx) fx('land', p.slot);
  if (p.ground) p.padT = 0;
  // bounce pads (eraser springs): launch toward the top of the tower
  if (p.ground) for (const pd of MAP.pads) {
    if (Math.abs(p.y - pd.top) > 0.06 || Math.hypot(p.x - pd.x, p.z - pd.z) > pd.r) continue;
    const dx = pd.tx - p.x, dz = pd.tz - p.z;
    p.vy = pd.vy; p.vx = dx / pd.tt; p.vz = dz / pd.tt; p.ground = false; p.airJumps = 1; p.dashT = 0; p.padT = pd.tt;
    if (fx) fx('boing', pd.q, p.slot);
    break;
  }
  // teleporters: step in, come out of the one across the island
  if (p.tpCd <= 0 && p.y < 0.5) for (const tp of MAP.tps) {
    if (Math.hypot(p.x - tp.x, p.z - tp.z) > tp.r) continue;
    const to = MAP.tps[tp.to], l = Math.hypot(to.x, to.z), sp = Math.max(2, Math.hypot(p.vx, p.vz));
    p.x = to.x - to.x / l * 1.4; p.z = to.z - to.z / l * 1.4; p.y = 0; p.vx = -to.x / l * sp; p.vz = -to.z / l * sp; p.tpCd = 1.3;
    if (fx) fx('tp', tp.q, to.q, p.slot);
    break;
  }
  // which way the doodle faces: where it aims while aiming or shooting, otherwise where it goes
  const faceAim = inp.aim || inp.lock || p.aimT > 0;
  if (faceAim) { const d = angDiff(p.yaw, Math.atan2(num(inp.ax, p.x) - p.x, num(inp.az, p.z) - p.z)); p.yaw += d * Math.min(1, dt * 20); }
  else if (Math.hypot(p.vx, p.vz) > 0.4 && !flop) { const d = angDiff(p.yaw, Math.atan2(p.vx, p.vz)); p.yaw += d * Math.min(1, dt * 14); }
}

// ---- segment tests for shots and line of sight
function segBox(ax, ay, az, dx, dy, dz, b, pad) {
  let t0 = 0, t1 = 1, o, d, mn, mx, a, c;
  for (let k = 0; k < 3; k++) {
    if (k === 0) { o = ax; d = dx; mn = b.minX - pad; mx = b.maxX + pad; }
    else if (k === 1) { o = ay; d = dy; mn = b.bottom - pad; mx = b.top + pad; }
    else { o = az; d = dz; mn = b.minZ - pad; mx = b.maxZ + pad; }
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return 2; continue; }
    a = (mn - o) / d; c = (mx - o) / d;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    if (t0 > t1) return 2;
  }
  return t0;
}
// closest approach between the shot's path and a doodle's body (a vertical capsule): returns the path fraction, or 2 for a miss
function segCapsule(ax, ay, az, dx, dy, dz, px, py, pz, r) {
  const y0 = py + 0.3, y1 = py + 1.25;
  const L = dx * dx + dy * dy + dz * dz;
  let best = 2, bestD = r * r;
  // sample along the path: shots move ~0.4 per tick so 6 samples are finer than a doodle
  for (let i = 0; i <= 6; i++) {
    const s = i / 6, x = ax + dx * s, y = ay + dy * s, z = az + dz * s, cy = clamp(y, y0, y1);
    const d2 = (x - px) ** 2 + (y - cy) ** 2 + (z - pz) ** 2;
    if (d2 < bestD) { bestD = d2; best = s; break; }
  }
  return L > 0 ? best : 2;
}
function segBlocked(W, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const b of W.boxes) if (b.kind !== 'pad' && segBox(ax, ay, az, dx, dy, dz, b, 0) < 1) return true;
  for (const b of MAP.boxes) if (b.bulletOnly && segBox(ax, ay, az, dx, dy, dz, b, 0) < 1) return true;
  return false;
}

// ---- one match: the authority. Offline it runs here; online it runs on the host's page.
function newPlayer(slot, r) {
  return {
    slot, name: r.name, bot: !!r.bot, diff: r.diff || 'normal', peer: r.peer || '',
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, hp: MAXHP, lives: LIVES, alive: false, out: false,
    ground: true, airJumps: 1, coyote: 0, padT: 0, dashT: 0, dashCd: 0, stunT: 0, tpCd: 0, armCd: 0, inv: 0, shield: 0, pw: '', pwT: 0,
    fireCd: 0, quickBuf: 0, aimT: 0, aiming: false, ax: 0, ay: 1, az: 0, emote: 0, emoteT: 0,
    kills: 0, deaths: 0, score: 0, dmg: 0, hits: 0, shots: 0, place: 0, respawnT: 0, lastBy: -1, lastByT: -99,
    ack: 0, ljc: 0, ldc: 0, lec: 0, lqc: 0, brain: null,
  };
}
const IDLE = { mx: 0, mz: 0, walk: false, aim: false, fire: false, jh: false, ax: 0, ay: 1, az: 0, jc: 0, dc: 0, ec: 0, et: 0, qc: 0, seq: 0 };

class Match {
  constructor(o) {
    this.mode = o.mode || 'ffa';
    this.players = o.roster.map((r, i) => newPlayer(i, r));
    this.inputs = this.players.map(() => IDLE);
    this.W = new World(); this.evId = 0; this.events = [];
    this.reset(o.lobby ? 'lobby' : undefined);
  }
  reset(state) {
    this.state = state || (this.mode === 'practice' ? 'playing' : 'countdown');
    this.t = this.state === 'countdown' ? -COUNTDOWN : 0; this.tick = 0; this.sd = false;
    this.bullets = []; this.nextB = 1; this.ranking = [];
    this.crates = MAP.crates.map(() => ({ alive: true, hp: 30, t: 0 }));
    this.spawners = MAP.spawners.map(s => ({ k: s.big ? '' : s.kinds[(Math.random() * s.kinds.length) | 0], t: s.big ? 6 : 0 }));
    this.drops = []; this.nextDrop = 1;
    this.targets = this.mode === 'practice' ? MAP.targets.map(() => ({ down: false, t: 0 })) : [];
    this.players.forEach((p, i) => {
      Object.assign(p, { hp: MAXHP, lives: LIVES, out: false, kills: 0, deaths: 0, score: 0, dmg: 0, hits: 0, shots: 0, place: 0, lastBy: -1, lastByT: -99, brain: null });
      this.spawnAt(p, MAP.spawns[i]);
    });
    this.ev('reset', this.state === 'lobby' ? 0 : 1);
  }
  ev(type, ...a) { this.events.push([++this.evId, type, ...a]); }
  drain() { const e = this.events; this.events = []; return e; }
  crateFlags() { return this.crates.map(c => c.alive); }
  spawnAt(p, s) {
    Object.assign(p, { x: s.x, y: 0, z: s.z, vx: 0, vy: 0, vz: 0, yaw: s.yaw, alive: true, hp: MAXHP, ground: true, airJumps: 1, dashT: 0, dashCd: 0, stunT: 0, tpCd: 0.5, armCd: 0, inv: 1.6, shield: 0, pw: '', pwT: 0, fireCd: 0.3, aimT: 0, emote: 0, emoteT: 0, respawnT: 0, ax: 0, ay: 1, az: 0 });
    this.ev('spawn', p.slot);
  }
  respawn(p) {
    // the spawn farthest from everyone still playing (all four are the same layout, so this only keeps you out of a fight)
    let best = MAP.spawns[p.slot], bs = -1;
    for (const s of MAP.spawns) {
      let d = 99;
      for (const o of this.players) if (o !== p && o.alive) d = Math.min(d, Math.hypot(o.x - s.x, o.z - s.z));
      d += Math.random() * 0.5;
      if (d > bs) { bs = d; best = s; }
    }
    this.spawnAt(p, best);
  }
  setInput(slot, inp) { this.inputs[slot] = inp || IDLE; }
  step() {
    this.tick++;
    if (this.state === 'countdown') { this.t += DT; if (this.t >= 0) { this.t = 0; this.state = 'playing'; this.ev('go'); } }
    else if (this.state === 'playing' || this.state === 'lobby') {
      this.t += DT;
      if (this.mode === 'ffa' && this.state === 'playing') {
        if (!this.sd && this.t >= SD_T) { this.sd = true; this.ev('sd'); }
        if (this.t >= END_T) { this.finish(); return; }
      }
    } else if (this.state === 'ended') { this.t += DT; }
    const W = this.W.update(this.t, this.crateFlags());
    const fight = this.state === 'playing';
    const fx = (...a) => this.ev(...a);
    for (const p of this.players) {
      let inp;
      if (p.bot) inp = this.state === 'ended' ? IDLE : botInput(this, p, W);
      else {
        const raw = this.inputs[p.slot] || IDLE;
        inp = {
          mx: clamp(num(raw.mx), -1, 1), mz: clamp(num(raw.mz), -1, 1), walk: !!raw.walk, aim: !!raw.aim, lock: !!raw.lock, fire: !!raw.fire, jh: !!raw.jh,
          ax: clamp(num(raw.ax, p.x), p.x - 60, p.x + 60), ay: clamp(num(raw.ay, p.y + 1), -5, 30), az: clamp(num(raw.az, p.z), p.z - 60, p.z + 60),
          jumpE: raw.jc !== p.ljc, dashE: raw.dc !== p.ldc, quickE: raw.qc !== p.lqc, emoteE: raw.ec !== p.lec ? (raw.et | 0) : 0,
        };
        p.ljc = raw.jc; p.ldc = raw.dc; p.lqc = raw.qc; p.lec = raw.ec; p.ack = raw.seq | 0;
      }
      if (this.state === 'countdown' || this.state === 'ended') { inp = { ...inp, mx: 0, mz: 0, dashE: false, fire: false, quickE: false }; if (this.state === 'ended') inp.jumpE = false; }
      this.applyInput(p, inp, W, fight, fx);
    }
    this.separate(fight);
    this.updateBullets(W, fight);
    this.updateItems(fight);
    if (fight) this.hazards(W);
    for (const p of this.players) {
      if (p.alive) { if (p.y < -1.2) { this.ev('splash', r1(p.x), r1(p.z)); this.kill(p, -1, 'water'); } continue; }
      if (p.out) continue;
      p.respawnT -= DT;
      if (p.respawnT <= 0) this.respawn(p);
    }
    if (this.mode === 'ffa' && this.state === 'playing' && this.players.filter(p => !p.out).length <= 1) this.finish();
  }
  applyInput(p, inp, W, fight, fx) {
    p.aiming = !!inp.aim; p.locked = !!inp.lock; p.ax = inp.ax; p.ay = inp.ay; p.az = inp.az;
    if (inp.emoteE && p.alive && p.ground && !p.emote) { p.emote = inp.emoteE; p.emoteT = inp.emoteE === 1 ? 1.6 : 1.5; this.ev('emote', p.slot, inp.emoteE); }
    if (p.pwT > 0) { p.pwT -= DT; if (p.pwT <= 0) { p.pw = ''; p.pwT = 0; } }
    if (p.fireCd > 0) p.fireCd -= DT;
    if (inp.quickE) p.quickBuf = 0.25;
    if (p.alive && p.emote !== 2 && this.state !== 'countdown' && this.state !== 'ended' && (inp.fire || p.quickBuf > 0) && p.fireCd <= 0) { this.fire(p); p.quickBuf = 0; }
    if (p.quickBuf > 0) p.quickBuf -= DT;
    stepPlayer(p, inp, W, fx);
  }
  fire(p) {
    const fwx = Math.sin(p.yaw), fwz = Math.cos(p.yaw), rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
    const ox = p.x + rx * 0.22 + fwx * 0.3, oy = p.y + 1.1, oz = p.z + rz * 0.22 + fwz * 0.3;
    let dx = p.ax - ox, dy = p.ay - oy, dz = p.az - oz, l = Math.hypot(dx, dy, dz);
    if (l < 0.8) { dx = fwx; dy = 0; dz = fwz; l = 1; }
    dx /= l; dy /= l; dz /= l;
    if (dy < -0.7) dy = -0.7;
    const spread = p.aiming ? 0.006 : 0.035, big = p.pw === 'p', dmg = DMG * (big ? 1.6 : 1);
    const offs = p.pw === 't' ? [-0.16, 0, 0.16] : [0];
    for (const o of offs) {
      const a = Math.atan2(dx, dz) + o + (Math.random() - 0.5) * spread, hl = Math.hypot(dx, dz), ey = dy + (Math.random() - 0.5) * spread;
      const vx = Math.sin(a) * hl, vz = Math.cos(a) * hl, id = this.nextB++;
      this.bullets.push({ id, o: p.slot, x: ox, y: oy, z: oz, vx: vx * BULLET_V, vy: ey * BULLET_V, vz: vz * BULLET_V, life: BULLET_LIFE, dmg, big });
      this.ev('shot', id, p.slot, r2(ox), r2(oy), r2(oz), r2(vx), r2(ey), r2(vz), big ? 1 : 0, r2(this.t));
    }
    p.shots++;
    p.fireCd = p.pw === 't' ? 0.26 : FIRE_EVERY;
    p.aimT = 0.6;
    const rk = p.aiming ? 0.8 : 1.8;
    p.vx -= dx * rk; p.vz -= dz * rk; if (!p.ground) p.vy -= dy * 1.2;
  }
  separate(fight) {
    const P = this.players;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (!a.alive || !b.alive || Math.abs(a.y - b.y) > 1.2) continue;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= RAD * 2) continue;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
      const nx = dx / d, nz = dz / d, push = (RAD * 2 - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      // a dash into someone shoves them
      if (fight) for (const [s, o, sg] of [[a, b, 1], [b, a, -1]]) if (s.dashT > 0 && o.dashT <= 0 && o.stunT <= 0) {
        this.hurt(o, 6, s.slot, nx * sg * 7, 3.5, nz * sg * 7, 0.35, 'dash');
        s.vx *= 0.3; s.vz *= 0.3;
      }
    }
    for (const p of P) if (p.alive) pushOut(p, this.W);
  }
  hurt(v, amt, by, kx, ky, kz, stun, cause) {
    if (!v.alive || this.state !== 'playing') return false;
    if (v.inv > 0) { this.ev('block', v.slot); return false; }
    v.vx += kx; v.vz += kz; if (ky) v.vy = Math.max(v.vy, ky);
    if (stun) v.stunT = Math.max(v.stunT, stun);
    if (v.shield > 0) { const a = Math.min(v.shield, amt); v.shield -= a; amt -= a; this.ev('shieldhit', v.slot, Math.round(v.shield)); }
    if (amt > 0) {
      v.hp -= amt;
      const att = by >= 0 ? this.players[by] : null;
      if (att && att !== v) { att.dmg += amt; att.score += Math.round(amt); att.hits++; v.lastBy = by; v.lastByT = this.t; }
      this.ev('hit', v.slot, by, Math.round(amt), r1(v.x), r1(v.y + 1.2), r1(v.z), cause === 'shot' ? 0 : 1);
    }
    if (v.emote) { v.emote = 0; v.emoteT = 0; }
    if (v.hp <= 0) this.kill(v, by, cause);
    return true;
  }
  kill(v, by, cause) {
    if (!v.alive) return;
    if ((by < 0 || by === v.slot) && this.t - v.lastByT < 5) by = v.lastBy;
    v.alive = false; v.hp = 0; v.deaths++; v.respawnT = 2.6; v.emote = 0; v.pw = ''; v.pwT = 0; v.shield = 0; v.vx = v.vz = 0;
    if (this.mode === 'ffa' && this.state === 'playing') v.lives--;
    const k = by >= 0 && by !== v.slot ? this.players[by] : null;
    if (k && this.state === 'playing') { k.kills++; k.score += 100; }
    this.ev('kill', v.slot, k ? by : -1, cause === 'water' ? 1 : cause === 'arm' ? 2 : cause === 'zone' ? 3 : 0, r1(v.x), r1(v.y), r1(v.z));
    if (this.mode === 'ffa' && this.state === 'playing' && v.lives <= 0) {
      v.out = true; v.place = this.players.filter(p => !p.out).length + 1;
      this.ev('out', v.slot, v.place);
    }
  }
  finish() {
    if (this.state === 'ended') return;
    const alive = this.players.filter(p => !p.out).sort((a, b) => b.lives - a.lives || b.hp - a.hp || b.kills - a.kills || b.score - a.score);
    alive.forEach((p, i) => { p.place = i + 1; });
    for (const p of alive) if (p.place === 1) p.score += 250;
    this.ranking = this.players.slice().sort((a, b) => a.place - b.place).map(p => p.slot);
    this.state = 'ended';
    this.bullets.length = 0;
    this.ev('end', this.ranking[0]);
  }
  updateBullets(W, fight) {
    const B = this.bullets;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      const dx = b.vx * DT, dy = b.vy * DT, dz = b.vz * DT;
      let hitT = 2, hit = null, kind = 0;
      for (const bx of W.boxes) { const t = segBox(b.x, b.y, b.z, dx, dy, dz, bx, b.big ? 0.06 : 0.03); if (t < hitT) { hitT = t; hit = bx; kind = bx.kind === 'crate' ? 2 : 1; } }
      for (const bx of MAP.boxes) if (bx.bulletOnly) { const t = segBox(b.x, b.y, b.z, dx, dy, dz, bx, 0.02); if (t < hitT) { hitT = t; hit = bx; kind = 1; } }
      let victim = null;
      for (const p of this.players) {
        if (!p.alive || p.slot === b.o) continue;
        const t = segCapsule(b.x, b.y, b.z, dx, dy, dz, p.x, p.y, p.z, b.big ? 0.5 : 0.42);
        if (t < hitT) { hitT = t; victim = p; kind = 3; }
      }
      let tgt = -1;
      this.targets.forEach((tg, k) => {
        if (tg.down) return;
        const T = MAP.targets[k], cx = T.x, cy = T.y + 1.35, cz = T.z;
        for (let s = 0; s <= 4; s++) { const f = s / 4; if ((b.x + dx * f - cx) ** 2 + (b.y + dy * f - cy) ** 2 + (b.z + dz * f - cz) ** 2 < 0.25 && f < hitT) { hitT = f; tgt = k; kind = 4; break; } }
      });
      // the island and the water
      const ny = b.y + dy;
      if (ny < 0 && hitT > 1) { const f = b.y / Math.max(1e-6, b.y - ny); const hx = b.x + dx * f, hz = b.z + dz * f; if (onPage(hx, hz)) { hitT = f; kind = 5; } else if (ny < -0.5) { hitT = 1; kind = 6; } }
      if (hitT <= 1) {
        const hx = b.x + dx * hitT, hy = b.y + dy * hitT, hz = b.z + dz * hitT;
        if (kind === 3 && fight) {
          const l = Math.hypot(b.vx, b.vz) || 1;
          this.hurt(victim, b.dmg, b.o, b.vx / l * (b.big ? 4.4 : 3.2), 1.2, b.vz / l * (b.big ? 4.4 : 3.2), 0.1, 'shot');
        } else if (kind === 2 && fight) {
          const ci = MAP.crates.indexOf(hit), c = this.crates[ci];
          if (c && c.alive) { c.hp -= b.dmg; if (c.hp <= 0) this.breakCrate(ci, b.o); else this.ev('cratehit', ci); }
        } else if (kind === 4) {
          const tg = this.targets[tgt]; tg.down = true; tg.t = 0; const sh = this.players[b.o]; if (sh) { sh.hits++; sh.score += 10; }
          this.ev('tgt', tgt, b.o);
        }
        this.ev('bend', b.id, r2(hx), r2(hy), r2(hz), kind);
        B.splice(i, 1);
        continue;
      }
      b.x += dx; b.y += dy; b.z += dz; b.life -= DT;
      if (b.life <= 0) { this.ev('bend', b.id, r2(b.x), r2(b.y), r2(b.z), 0); B.splice(i, 1); }
    }
  }
  breakCrate(i, by) {
    const c = this.crates[i]; c.alive = false; c.t = 18; c.hp = 0;
    this.ev('crate', i, by);
    if (Math.random() < 0.35) { const C = MAP.crates[i]; this.drops.push({ id: this.nextDrop++, x: C.cx, z: C.cz, life: 12 }); }
  }
  updateItems(fight) {
    for (let i = 0; i < this.spawners.length; i++) {
      const S = MAP.spawners[i], s = this.spawners[i];
      if (!s.k) { if (this.state !== 'lobby') s.t -= DT; if (s.t <= 0) { s.k = S.kinds[(Math.random() * S.kinds.length) | 0]; this.ev('item', i); } continue; }
      for (const p of this.players) {
        if (!p.alive || Math.hypot(p.x - S.x, p.z - S.z) > 0.85 || Math.abs(p.y - S.y) > 1.0) continue;
        if (s.k === 'h' && p.hp >= MAXHP) continue;
        this.give(p, s.k); this.ev('pick', i, p.slot, s.k); s.k = ''; s.t = S.every; break;
      }
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.life -= DT;
      let gone = d.life <= 0;
      if (!gone) for (const p of this.players) if (p.alive && p.hp < MAXHP && Math.hypot(p.x - d.x, p.z - d.z) < 0.8 && p.y < 1.2) { this.give(p, 'h'); this.ev('pick', -1, p.slot, 'h'); gone = true; break; }
      if (gone) this.drops.splice(i, 1);
    }
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i]; if (c.alive) continue;
      c.t -= DT;
      if (c.t > 0) continue;
      const C = MAP.crates[i];
      if (this.players.some(p => p.alive && p.x > C.minX - RAD && p.x < C.maxX + RAD && p.z > C.minZ - RAD && p.z < C.maxZ + RAD && p.y < 1.1)) { c.t = 1; continue; }
      c.alive = true; c.hp = 30; this.ev('crateback', i);
    }
    for (const tg of this.targets) if (tg.down) { tg.t += DT; if (tg.t > 3) { tg.down = false; tg.t = 0; } }
  }
  give(p, k) {
    if (k === 'h') p.hp = Math.min(MAXHP, p.hp + 40);
    else if (k === 'b') p.shield = 50;
    else { p.pw = k; p.pwT = POWERS[k].t; }
  }
  hazards(W) {
    // the giant pencil sweeping round the tower
    const a = W.arm, ca = Math.cos(a), sa = Math.sin(a);
    for (const p of this.players) {
      if (p.armCd > 0) p.armCd -= DT;
      if (!p.alive || p.y > ARM_H || p.armCd > 0) continue;
      const along = clamp(p.x * ca + p.z * sa, ARM_IN, ARM_OUT), qx = ca * along, qz = sa * along;
      if (Math.hypot(p.x - qx, p.z - qz) > RAD + 0.44) continue;
      p.armCd = 0.9;
      this.hurt(p, 8, -1, -sa * 8 + ca * 2, 6.5, ca * 8 + sa * 2, 0.45, 'arm');
      this.ev('arm', p.slot);
    }
    // sudden death: the ink closes in
    if (this.sd) for (const p of this.players) {
      if (!p.alive || Math.hypot(p.x, p.z) < W.zone) { p.zoneAcc = 0; continue; }
      p.zoneAcc = (p.zoneAcc || 0) + DT;
      if (p.zoneAcc >= 0.25) { p.zoneAcc -= 0.25; this.hurt(p, 4, -1, 0, 0, 0, 0, 'zone'); }
    }
  }
  // ---- snapshot (sent by the host to everyone; small enough for 20 a second)
  snapshot(lobbyExtra) {
    const st = { lobby: 0, countdown: 1, playing: 2, ended: 3 }[this.state];
    const p = this.players.map(q => {
      const f = (q.alive ? 1 : 0) | (q.ground ? 2 : 0) | (q.out ? 4 : 0) | (q.dashT > 0 ? 8 : 0) | (q.stunT > 0 ? 16 : 0) | (q.aiming || q.locked || q.aimT > 0 ? 32 : 0) | (q.inv > 0 ? 64 : 0) | (q.emote === 1 ? 128 : 0) | (q.emote === 2 ? 256 : 0) | (q.bot ? 512 : 0) | (q.aiming ? 1024 : 0);
      return [r2(q.x), r2(q.y), r2(q.z), r1(q.vx), r1(q.vy), r1(q.vz), r2(q.yaw), Math.ceil(q.hp), q.lives, f, PW_CODES.indexOf(q.pw), r1(q.pwT), Math.ceil(q.shield), q.kills, q.score, q.ack, r1(q.ax), r1(q.ay), r1(q.az), r1(q.respawnT), q.place, Math.round(q.dmg), r1(q.emoteT), r1(q.stunT), r1(q.dashCd), q.airJumps];
    });
    const ro = this.players.map(q => [q.name, q.bot ? 1 : 0, q.peer || '', q.diff]);
    let cr = 0; this.crates.forEach((c, i) => { if (c.alive) cr |= 1 << i; });
    let tg = 0; this.targets.forEach((t, i) => { if (t.down) tg |= 1 << i; });
    return { v: 1, k: this.tick, t: r2(this.t), st, sd: this.sd ? 1 : 0, m: this.mode === 'practice' ? 1 : 0, p, ro, cr, tg,
      sp: this.spawners.map(s => s.k || '.').join(''), dr: this.drops.map(d => [d.id, r1(d.x), r1(d.z)]), rk: this.ranking, ...lobbyExtra };
  }
  // a new host carries on from the last snapshot it heard
  static fromSnapshot(s, roster) {
    const m = new Match({ mode: s.m ? 'practice' : 'ffa', roster });
    m.state = ['lobby', 'countdown', 'playing', 'ended'][s.st] || 'lobby'; m.t = num(s.t); m.sd = !!s.sd; m.tick = s.k | 0;
    m.crates.forEach((c, i) => { c.alive = !!(s.cr & (1 << i)); c.t = c.alive ? 0 : 8; });
    m.spawners.forEach((sp, i) => { const k = (s.sp || '')[i]; sp.k = k && k !== '.' && POWERS[k] ? k : ''; sp.t = 4; });
    (s.p || []).forEach((a, i) => {
      const q = m.players[i]; if (!q || !Array.isArray(a)) return;
      Object.assign(q, { x: num(a[0]), y: num(a[1]), z: num(a[2]), vx: num(a[3]), vy: num(a[4]), vz: num(a[5]), yaw: num(a[6]), hp: num(a[7], MAXHP), lives: num(a[8], LIVES), alive: !!(a[9] & 1), out: !!(a[9] & 4), pw: PW_CODES[a[10]] || '', pwT: num(a[11]), shield: num(a[12]), kills: num(a[13]), score: num(a[14]), respawnT: num(a[19], 1), place: num(a[20]), dmg: num(a[21]) });
    });
    m.ranking = Array.isArray(s.rk) ? s.rk.slice(0, 4) : [];
    m.evId = 0;
    return m;
  }
}

// ---- bots: fill every empty seat; they aim, lead, dodge, grab items, use the bounce pads and hop over the pencil
function botInput(m, p, W) {
  const C = BOT[p.diff] || BOT.normal;
  const B = p.brain || (p.brain = { dodged: 0, think: 0, tgt: -1, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1, goal: null, seen: 0, stuck: 0, detour: 0, dx: 0, dz: 0, nx: 0, ny: 0, nz: 0, noiseT: 0, fireOn: false, kills: 0, mx: 0, mz: 0 });
  const inp = { mx: 0, mz: 0, walk: false, aim: false, fire: false, jh: false, ax: p.x, ay: p.y + 1, az: p.z, jumpE: false, dashE: false, quickE: false, emoteE: 0 };
  if (!p.alive || m.state === 'lobby') return inp;
  const enemies = m.players.filter(o => o !== p && o.alive);
  B.think -= DT; B.strafeT -= DT; B.noiseT -= DT;
  if (B.think <= 0) {
    B.think = 0.12 + Math.random() * 0.08;
    B.fireOn = Math.random() < C.fire;
    // target: close, visible and hurt rivals first
    let best = null, bs = 1e9;
    for (const o of enemies) {
      const d = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z), vis = !segBlocked(W, p.x, p.y + 1.1, p.z, o.x, o.y + 1, o.z);
      const s = d + (vis ? 0 : 7) + o.hp / 30 + (o.inv > 0 ? 8 : 0) - (o.slot === B.tgt ? 2.5 : 0);
      if (s < bs) { bs = s; best = o; }
    }
    if ((best ? best.slot : -1) !== B.tgt) B.seen = 0;
    B.tgt = best ? best.slot : -1;
    // goal: health when hurt, the contested items when they are close, else the fight
    B.goal = null;
    if (p.hp < 50) {
      let bd = 36;
      m.spawners.forEach((s, i) => { const S = MAP.spawners[i]; if (s.k === 'h' && S.y < 0.5) { const d = Math.hypot(S.x - p.x, S.z - p.z); if (d < bd) { bd = d; B.goal = { x: S.x, z: S.z, y: S.y }; } } });
      for (const d of m.drops) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { bd = dd; B.goal = { x: d.x, z: d.z, y: 0 }; } }
    }
    const near = best && Math.hypot(best.x - p.x, best.z - p.z) < 14;
    if (!B.goal && !near) {
      const top = m.spawners[m.spawners.length - 1], S = MAP.spawners[m.spawners.length - 1];
      if (top.k && p.hp >= 45 && Math.hypot(p.x, p.z) < 30) {
        if (p.y > 2) B.goal = { x: S.x, z: S.z, y: S.y };
        else { let bd = 99; for (const pd of MAP.pads) { const d = Math.hypot(pd.x - p.x, pd.z - p.z); if (d < bd) { bd = d; B.goal = { x: pd.x, z: pd.z, y: 0.2, pad: true }; } } }
      } else m.spawners.forEach((s, i) => { const S2 = MAP.spawners[i]; if (!B.goal && s.k && s.k !== 'h' && S2.y > 0.5 && Math.hypot(S2.x - p.x, S2.z - p.z) < 13) B.goal = { x: S2.x, z: S2.z, y: S2.y }; });
    }
    // celebrate a fresh elimination when nobody is near
    if (p.kills > B.kills) { B.kills = p.kills; if (!enemies.some(o => Math.hypot(o.x - p.x, o.z - p.z) < 9) && Math.random() < 0.5) inp.emoteE = 1; }
  }
  const T = B.tgt >= 0 ? m.players[B.tgt] : null;
  let wx = 0, wz = 0, vis = false, d = 0;
  if (T && T.alive) {
    const tx = T.x - p.x, tz = T.z - p.z; d = Math.hypot(tx, tz) || 1;
    vis = !segBlocked(W, p.x, p.y + 1.1, p.z, T.x, T.y + 1, T.z);
    if (vis) B.seen += DT; else B.seen = Math.max(0, B.seen - DT * 2);
    if (!B.goal) {
      const keep = C.keep;
      const radial = d > keep + 2 || !vis ? 1 : d < keep - 2 ? -1 : 0;
      if (B.strafeT <= 0) { B.strafe = -B.strafe; B.strafeT = 0.9 + Math.random() * 1.6; }
      const sw = d > keep + 5 ? 0.3 : 0.8; // far away: close in; at fighting range: strafe
      wx = tx / d * radial + (-tz / d) * B.strafe * sw; wz = tz / d * radial + (tx / d) * B.strafe * sw;
    }
  } else if (!B.goal) { const r = Math.hypot(p.x, p.z) || 1; wx = -p.x / r * (r > 18 ? 1 : 0) + Math.sin(m.t * 0.3 + p.slot) * 0.6; wz = -p.z / r * (r > 18 ? 1 : 0) + Math.cos(m.t * 0.3 + p.slot) * 0.6; }
  if (B.goal) { const gx = B.goal.x - p.x, gz = B.goal.z - p.z, gd = Math.hypot(gx, gz) || 1; wx = gx / gd * Math.min(1, gd * 1.5); wz = gz / gd * Math.min(1, gd * 1.5); }
  // keep away from the water, and inside the ink ring in sudden death
  // keep off the edge of the page, and inside the ink ring in sudden death
  const r = Math.hypot(p.x, p.z) || 1, ed = edgeDist(p.x, p.z), zr = W.zone - 1.5;
  const ex = Math.abs(p.x) > Math.abs(p.z) ? Math.sign(p.x) : 0, ez = ex ? 0 : Math.sign(p.z); // outward from the nearest edge
  if (ed < 3.2) { const k = clamp((3.2 - ed) / 1.5, 0, 2); wx -= ex * k * 1.6; wz -= ez * k * 1.6; }
  if (r > zr) { const k = clamp((r - zr) / 1.5, 0, 2); wx -= p.x / r * k * 1.6; wz -= p.z / r * k * 1.6; }
  if (B.detour > 0) { B.detour -= DT; wx = B.dx; wz = B.dz; }
  let wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; wl = 1; }
  // steer: hop up onto low things in the way, go round tall ones
  if (wl > 0.2 && p.ground) {
    const ax = p.x + wx / wl * 0.75, az = p.z + wz / wl * 0.75;
    for (const b of W.boxes) {
      if (b.top <= p.y + STEP || b.bottom > p.y + 1.4 || ax < b.minX - RAD || ax > b.maxX + RAD || az < b.minZ - RAD || az > b.maxZ + RAD) continue;
      if (b.top - p.y < 3.2 && b.kind !== 'lift' && (ed > 3.2 || (wx * ex + wz * ez) < 0)) inp.jumpE = true;
      else { const s = B.strafe; const nx = -wz * s, nz = wx * s; wx = nx; wz = nz; }
      break;
    }
  }
  if (!p.ground && p.vy < 0.5 && p.vy > -2 && p.airJumps > 0 && wl > 0.2) {
    // a second hop if the first one wasn't enough to clear it
    const ax = p.x + wx / (wl || 1) * 0.6, az = p.z + wz / (wl || 1) * 0.6;
    for (const b of W.boxes) if (b.top > p.y + 0.1 && b.top - p.y < 2.0 && ax > b.minX - RAD && ax < b.maxX + RAD && az > b.minZ - RAD && az < b.maxZ + RAD && b.bottom < p.y + 1) { inp.jumpE = true; break; }
  }
  if (ed < 0.6 && !p.ground && p.airJumps > 0 && p.vy < 0) inp.jumpE = true; // save yourself at the edge
  // stuck: jump, then try another way
  const sp = Math.hypot(p.vx, p.vz);
  if (wl > 0.5 && p.ground && sp < 0.6 && B.detour <= 0) { B.stuck += DT; if (B.stuck > 0.35) inp.jumpE = true; if (B.stuck > 1) { B.stuck = 0; const a = Math.random() * TAU; B.dx = Math.cos(a); B.dz = Math.sin(a); B.detour = 0.8; } }
  else B.stuck = 0;
  // the sweeping pencil: jump it as it comes round
  if (p.ground && p.y < 0.7) {
    const rr = Math.hypot(p.x, p.z);
    if (rr > ARM_IN - 0.6 && rr < ARM_OUT + 0.7) {
      const w = m.t > SD_T ? 0.52 : 0.3, dA = angDiff(W.arm, Math.atan2(p.z, p.x)), tti = dA / w;
      if (tti > 0.05 && tti < 0.42 + (C.react - 0.16)) inp.jumpE = true;
    }
  }
  // dodge shots coming at you
  if (C.dodge > 0 && p.dashCd <= 0 && p.ground) for (const b of m.bullets) {
    if (b.o === p.slot || b.id <= B.dodged) continue;
    const rx = p.x - b.x, rz = p.z - b.z, v2 = b.vx * b.vx + b.vz * b.vz, tca = (rx * b.vx + rz * b.vz) / (v2 || 1);
    if (tca < 0 || tca > 0.32) continue;
    const cx = b.x + b.vx * tca - p.x, cz = b.z + b.vz * tca - p.z;
    if (Math.hypot(cx, cz) > 0.7 || Math.abs(b.y - (p.y + 0.8)) > 1) continue;
    B.dodged = b.id;
    if (Math.random() > C.dodge) continue;
    const l = Math.sqrt(v2) || 1;
    // dash to whichever side keeps you on the island
    let best = null;
    for (const side of [1, -1]) { const dx = -b.vz / l * side, dz = b.vx / l * side, ex2 = p.x + dx * 2.8, ez2 = p.z + dz * 2.8; const er = Math.hypot(ex2, ez2); if (edgeDist(ex2, ez2) > 2.5 && er < W.zone - 1 && (!best || er < best.r)) best = { dx, dz, r: er }; }
    if (best) { wx = best.dx; wz = best.dz; B.mx = wx; B.mz = wz; inp.dashE = true; }
    break;
  }
  if (T && vis && d < 12 && ed > 4 && Math.random() < C.jumpy * DT) inp.jumpE = true;
  // in the air near the edge: steer back inland
  if (!p.ground && ed < 6) { const out = p.vx * ex + p.vz * ez; if (out > 0 || ed < 2.5) { wx = -ex; wz = -ez; B.mx = wx; B.mz = wz; } }
  // never walk outward past the safe ring
  if (ed < 2.8) { const out = wx * ex + wz * ez; if (out > 0) { wx -= ex * out; wz -= ez * out; } }
  if (r > zr - 0.4) { const out = (wx * p.x + wz * p.z) / r; if (out > 0) { wx -= p.x / r * out; wz -= p.z / r * out; } }
  B.mx += (wx - B.mx) * Math.min(1, DT * 10); B.mz += (wz - B.mz) * Math.min(1, DT * 10);
  inp.mx = B.mx; inp.mz = B.mz; inp.jh = p.vy > 0;
  // aim with a lead and a human-sized wobble; shoot once the target has been in view for the reaction time
  if (T && T.alive) {
    if (B.noiseT <= 0) { B.noiseT = 0.25 + Math.random() * 0.2; const e = C.err * (0.3 + d / 16); B.nx = (Math.random() - 0.5) * e; B.ny = (Math.random() - 0.5) * e * 0.6; B.nz = (Math.random() - 0.5) * e; }
    const ts = Math.hypot(T.vx, T.vz), tk = ts > RUN ? RUN / ts : 1, lead = (d / BULLET_V) * C.lead * tk;
    inp.ax = T.x + T.vx * lead + B.nx; inp.ay = T.y + 1.0 + B.ny; inp.az = T.z + T.vz * lead + B.nz;
    inp.fire = vis && d < C.range && B.seen > C.react && B.fireOn && T.inv <= 0;
  }
  return inp;
}
