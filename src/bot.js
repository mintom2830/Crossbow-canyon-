// A simple automated player used for balance checks and for the in-browser
// autoplay test. It walks to coins, and builds/upgrades whenever it can pay
// for a pad in full.
import { CFG } from './config.js';
import { pondDepth, oasisLayout } from './world.js';

// Level 3 has a pool and landmarks in the middle of the map: when the way to
// the goal is blocked the bot plans a route on a 1-unit grid (A*) round the
// pool, the palms, the camels, the arch and the towers.
function makeNav() {
  let grid = null, key = '', nx = 0, nz = 0, x0 = 0, z0 = 0;
  let path = null, pathKey = '';
  const idx = (x, z) => {
    const i = Math.round(x - x0), j = Math.round(z - z0);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const build = (sim) => {
    const k = sim.towers.map((t) => t.slotIndex + ':' + t.level).join(',');
    if (grid && k === key) return;
    key = k;
    const W = CFG.walk; x0 = Math.floor(W.minX); z0 = Math.floor(W.minZ);
    nx = Math.ceil(W.maxX) - x0 + 1; nz = Math.ceil(W.maxZ) - z0 + 1;
    grid = new Uint8Array(nx * nz);
    const r = CFG.hero.radius + 0.35, lay = oasisLayout();
    const round = [];
    if (lay) for (const o of lay.solids) round.push([o.x, o.z, o.r + r]);
    for (const t of sim.towers) round.push([t.x, t.z, sim._towerRadius(t) + r]);
    round.push([sim.fortress.x, sim.fortress.z, CFG.fortress.radius + r]);
    for (const h of CFG.huts) round.push([h.x, h.z, 1.5 + r]);
    for (const o of CFG.town.obstacles) round.push([o.x, o.z, o.r + r]);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i, z = z0 + j;
      let b = pondDepth(x, z) > -r;
      for (let q = 0; !b && q < round.length; q++) b = (round[q][0] - x) ** 2 + (round[q][1] - z) ** 2 < round[q][2] ** 2;
      grid[j * nx + i] = b ? 1 : 0;
    }
  };
  const free = (x, z) => { const i = idx(x, z); return i >= 0 && !grid[i]; };
  const clear = (ax, az, bx, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
    for (let k = 1; k <= n; k++) if (!free(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false;
    return true;
  };
  const nearestFree = (x, z) => {
    let best = -1, bd = Infinity;
    const ci = Math.round(x - x0), cj = Math.round(z - z0);
    for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= nx || j >= nz || grid[j * nx + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = j * nx + i; }
    }
    return best;
  };
  const astar = (s, g) => {
    const N = nx * nz, cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const gi = g % nx, gj = (g / nx) | 0;
    const h = (c) => { const di = Math.abs(c % nx - gi), dj = Math.abs(((c / nx) | 0) - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    const open = [[h(s), s]]; cost[s] = 0;
    while (open.length) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
      const [, c] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === g) break;
      const ci = c % nx, cj = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const n = j * nx + i;
        if (grid[n] || done[n] || (di && dj && (grid[cj * nx + i] || grid[j * nx + ci]))) continue;
        const nc = cost[c] + (di && dj ? 1.414 : 1);
        if (nc < cost[n]) { cost[n] = nc; from[n] = c; open.push([nc + h(n), n]); }
      }
    }
    if (from[g] < 0 && g !== s) return null;
    const out = [];
    for (let c = g; c !== s && c >= 0; c = from[c]) out.push([x0 + c % nx, z0 + ((c / nx) | 0)]);
    return out.reverse();
  };
  // where to head next on the way to (gx, gz)
  return function waypoint(sim, gx, gz) {
    build(sim);
    const h = sim.hero;
    if (clear(h.x, h.z, gx, gz)) { path = null; return [gx, gz]; }
    const pk = Math.round(gx) + ',' + Math.round(gz) + '|' + key;
    if (!path || pk !== pathKey) {
      pathKey = pk;
      const s = free(h.x, h.z) ? idx(h.x, h.z) : nearestFree(h.x, h.z), g = free(gx, gz) ? idx(gx, gz) : nearestFree(gx, gz);
      path = s >= 0 && g >= 0 ? astar(s, g) : null;
      if (!path) return [gx, gz];
    }
    // skip ahead to the furthest point on the route that can be walked to in a straight line
    while (path.length > 1 && clear(h.x, h.z, path[1][0], path[1][1])) path.shift();
    if (path.length && Math.hypot(path[0][0] - h.x, path[0][1] - h.z) < 0.6) path.shift();
    return path.length ? path[0] : [gx, gz];
  };
}

// opts: prefer (pad kinds in order), focus, cannon (build cannons),
// cannonPath ('rapid' | 'blast': which way to take the cannon upgrade choice),
// repair (patch up a badly damaged town hall between waves)
export function makeBot(opts = {}) {
  const prefer = opts.prefer || ['build', 'fortress', 'upgrade'];
  let goal = null; // {x,z,padId}
  let lastPadDone = null;
  const nav = makeNav();
  return function botStep(sim) {
    const h = sim.hero;
    // a cannon player still builds every third tower as a crossbow: only crossbows
    // can shoot down the Canyon Buzzard while it flies
    if (opts.cannon && sim.unlocked.cannon) {
      const kind = sim.builtOrder % 3 === 2 ? 'crossbow' : 'cannon';
      if (sim.buildKind !== kind) sim.setBuildKind(kind);
    }
    // finish the pad we are standing on
    if (goal && goal.away) {
      // stepping off a disarmed pad (the repeat-purchase safeguard), then come back
      if (Math.hypot(goal.x - h.x, goal.z - h.z) < 0.4) goal = goal.back;
    } else if (goal && goal.padId) {
      const p = sim.pads.find((q) => q.id === goal.padId);
      if (!p) { lastPadDone = goal.padId; goal = null; }
      else if (sim.gold <= 0 && p.paid < p.cost) goal = null;
      else if (p.heroOn && !p.armed) {
        const dx = p.x - (sim.slots[p.slot]?.x ?? p.x - 1), dz = p.z - (sim.slots[p.slot]?.z ?? p.z);
        const l = Math.hypot(dx, dz) || 1;
        goal = { x: p.x + dx / l * 2.4, z: p.z + dz / l * 2.4, away: true, back: goal };
      }
    }
    if (!goal || (!goal.padId && !goal.away)) {
      // choose an affordable pad
      let best = null, bestScore = -Infinity;
      // a sensible player saves up for the keep once it can be upgraded
      const keep = prefer.includes('fortress') ? sim.pads.find((p) => p.kind === 'fortress') : null;
      const reserve = keep ? keep.cost - keep.paid : 0;
      for (const p of sim.pads) {
        const need = p.cost - p.paid;
        if (need > sim.gold) continue;
        if (keep && p.kind === 'upgrade' && sim.gold - need < reserve) continue;
        // repairs come last, between waves, once the hall has lost a fair share of its health
        const repair = p.kind === 'repair' && opts.repair && sim.state === 'build' && sim.fortress.hp < sim.fortress.maxHp * 0.85;
        const pri = repair ? prefer.length : prefer.indexOf(p.kind);
        if (pri < 0) continue;
        // the cannon upgrade choice: stick to one path if told to
        if (p.choice && opts.cannonPath && p.path !== opts.cannonPath) continue;
        // spread upgrades: lower-level crossbows first
        const lv = (p.level || 0) * (opts.focus ? -10 : 6); // focus: pour everything into the strongest crossbow
        const score = -pri * 30 - lv - Math.hypot(p.x - h.x, p.z - h.z) * 0.3;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) goal = { x: best.x, z: best.z, padId: best.id };
    }
    if (!goal) {
      // nearest coin
      let bc = null, bd = Infinity;
      for (const c of sim.coins) {
        if (c.state !== 0 || c.age < 0.5) continue;
        const d = (c.x - h.x) ** 2 + (c.z - h.z) ** 2;
        if (d < bd) { bd = d; bc = c; }
      }
      if (bc) goal = { x: bc.x, z: bc.z, coin: true };
    }
    if (!goal) { sim.setInput(0, 0); return; }
    const dx = goal.x - h.x, dz = goal.z - h.z;
    const d = Math.hypot(dx, dz);
    if (goal.coin && d < CFG.hero.magnetRadius * 0.6) { goal = null; sim.setInput(0, 0); return; }
    if (d < 0.25) { sim.setInput(0, 0); return; }
    const s = Math.min(1, d / 1.2);
    let ix = dx / d, iz = dz / d;
    if (CFG.decor && CFG.decor.pond) {
      // Level 3: follow a route round the pool and the landmarks
      const [wx, wz] = nav(sim, goal.x, goal.z);
      const wl = Math.hypot(wx - h.x, wz - h.z);
      if (wl > 0.05) { ix = (wx - h.x) / wl; iz = (wz - h.z) / wl; }
    }
    sim.setInput(ix * s, iz * s);
    if (goal.coin) goal = null; // re-pick next frame
  };
}
