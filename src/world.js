// Shared world geometry: road path (arc-length lookup), plateau shapes,
// terrain height and walkability. Pure JS — used by the simulation (Node or
// browser) and by the renderer.
import { CFG, MAPS } from './config.js';

// ---------- Seeded RNG (mulberry32) ----------
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  return rng;
}

// ---------- Road path ----------
function catmull(p0, p1, p2, p3, t) {
  // centripetal-ish uniform Catmull-Rom (good enough for smooth roads)
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class RoadPath {
  constructor(points, step = 0.25) {
    const dense = [];
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const sub = Math.max(8, Math.ceil(segLen * 3));
      for (let k = 0; k < sub; k++) {
        const t = k / sub;
        dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
      }
    }
    dense.push(points[n - 1].slice());
    // cumulative length
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    this.length = cum[cum.length - 1];
    // resample at uniform arc-length steps
    this.step = step;
    const count = Math.ceil(this.length / step) + 1;
    this.count = count;
    this.px = new Float32Array(count);
    this.pz = new Float32Array(count);
    this.tx = new Float32Array(count);
    this.tz = new Float32Array(count);
    let j = 0;
    for (let i = 0; i < count; i++) {
      const s = Math.min(this.length, i * step);
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const segL = cum[j + 1] - cum[j] || 1;
      const f = (s - cum[j]) / segL;
      this.px[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
      this.pz[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
    }
    for (let i = 0; i < count; i++) {
      const a = Math.max(0, i - 2), b = Math.min(count - 1, i + 2);
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
  }
  // writes {x, z, tx, tz, nx, nz} into out; normal points to the left of travel
  sample(s, out) {
    const f = Math.max(0, Math.min(this.length, s)) / this.step;
    const i = Math.min(this.count - 2, Math.floor(f));
    const t = f - i;
    out.x = this.px[i] + (this.px[i + 1] - this.px[i]) * t;
    out.z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * t;
    let tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t;
    let tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    out.tx = tx; out.tz = tz;
    out.nx = tz; out.nz = -tx;
    return out;
  }
  // distance from a point to the road centreline (coarse search)
  distanceTo(x, z) {
    let best = Infinity;
    for (let i = 0; i < this.count; i += 2) {
      const dx = this.px[i] - x, dz = this.pz[i] - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
}

// ---------- Plateaus ----------
export function plateauRadius(p, ang) {
  return 1 + 0.055 * Math.sin(3 * ang + p.seed) + 0.035 * Math.sin(5 * ang + p.seed * 2.3) + 0.02 * Math.sin(9 * ang + p.seed * 0.7);
}
// > 0 inside, < 0 outside (approx distance in world units)
export function plateauSdf(p, x, z) {
  const dx = (x - p.x) / p.rx, dz = (z - p.z) / p.rz;
  const ang = Math.atan2(dz, dx);
  const r = Math.hypot(dx, dz);
  const R = plateauRadius(p, ang);
  return (R - r) * Math.min(p.rx, p.rz);
}
export function plateauOutline(p, segments = 96) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const R = plateauRadius(p, a);
    pts.push([p.x + Math.cos(a) * R * p.rx, p.z + Math.sin(a) * R * p.rz]);
  }
  return pts;
}

// ---------- Hills ----------
// A smooth sand dome: a cosine bump, slightly uneven round its edge.
// Every tower spot on a hill gets a flat terrace dug into the slope, so a
// tower stands level instead of half-buried on the uphill side.
const TERRACE_IN = 2.1, TERRACE_OUT = 3.4;   // flat out to IN, blending back into the slope by OUT
export function hillHeight(x, z) {
  let h = domeHeight(x, z);
  for (const s of CFG.slots) {
    const d2 = (x - s.x) ** 2 + (z - s.z) ** 2;
    if (d2 >= TERRACE_OUT * TERRACE_OUT) continue;
    const top = s._terrace ?? (s._terrace = domeHeight(s.x, s.z));
    if (top <= 0 && d2 > 0 && domeHeight(x, z) <= 0) continue;   // nothing to flatten off the hill
    const d = Math.sqrt(d2), k = d <= TERRACE_IN ? 1 : 1 - (d - TERRACE_IN) / (TERRACE_OUT - TERRACE_IN);
    h += (top - h) * k * k * (3 - 2 * k);
  }
  return h;
}
function domeHeight(x, z) {
  let h = 0;
  for (const H of CFG.hills) {
    const dx = (x - H.x) / H.rx, dz = (z - H.z) / H.rz, r2 = dx * dx + dz * dz;
    if (r2 >= 1.3) continue;
    const a = Math.atan2(dz, dx);
    const r = Math.sqrt(r2) / (1 + 0.07 * Math.sin(3 * a + H.seed) + 0.04 * Math.sin(5 * a + H.seed * 2.3));
    if (r < 1) h += H.h * (0.5 + 0.5 * Math.cos(Math.PI * r));
  }
  return h;
}

export function groundHeight(x, z) {
  for (const p of CFG.plateaus) {
    if (plateauSdf(p, x, z) > 0) return CFG.plateauHeight;
  }
  return CFG.hills.length ? hillHeight(x, z) : 0;
}

// Where a tower stands: on a hill it sits on the lowest point of its footprint,
// so its base never floats over the slope.
export function footHeight(x, z, r = 1.3) {
  if (!CFG.hills.length) return groundHeight(x, z);
  let h = hillHeight(x, z);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; h = Math.min(h, hillHeight(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
  return groundHeight(x, z) - hillHeight(x, z) + h;
}

// ---------- Water (Level 3's oasis) ----------
// The pool is a slightly wobbly ellipse; the stream that runs out of it is a
// smooth curve through decor.stream, STREAM_HALF wide either side.
export const STREAM_HALF = 1.2;
export function pondEdge(P, a) {   // radius scale of the pool's edge in direction a (about 1)
  return 1 + 0.05 * Math.sin(3 * a + P.seed) + 0.035 * Math.sin(5 * a + P.seed * 1.7);
}
// > 0 inside the pool, roughly the distance in from its edge (< 0 outside)
export function pondDepth(x, z) {
  const P = CFG.decor && CFG.decor.pond;
  if (!P) return -1e9;
  const dx = (x - P.x) / P.rx, dz = (z - P.z) / P.rz, r = Math.hypot(dx, dz);
  return (pondEdge(P, Math.atan2(dz, dx)) - r) * Math.min(P.rx, P.rz);
}
let streamCache = null;
export function streamPath() {
  const pts = CFG.decor && CFG.decor.stream;
  if (!pts) return null;
  if (!streamCache || streamCache.src !== pts) streamCache = { src: pts, path: new RoadPath(pts, 0.4) };
  return streamCache.path;
}
// distance from the stream's middle line (Infinity on maps without one)
export function streamDistance(x, z) {
  const s = streamPath();
  return s ? s.distanceTo(x, z) : Infinity;
}
// true where something would stand in the water (margin: how far to keep back)
export function inWater(x, z, margin = 0) {
  return pondDepth(x, z) > -margin || streamDistance(x, z) < STREAM_HALF + margin;
}

// Level 3's landmarks that the farmer walks round: the arch's two pillars,
// the palm trunks and the resting camels. Worked out from the map (seeded), so
// the scenery and the game agree on where everything stands.
let oasisCache = null;
export function oasisLayout() {
  const D = CFG.decor;
  if (!D || !D.pond) return null;
  if (oasisCache && oasisCache.src === D) return oasisCache;
  const out = { src: D, arch: null, pillars: [], palms: [], solids: [] };
  if (D.arch) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < road.count; i++) { const d = (road.px[i] - D.arch.x) ** 2 + (road.pz[i] - D.arch.z) ** 2; if (d < best) { best = d; bi = i; } }
    const o = {}; road.sample(bi * road.step, o);
    const half = CFG.roadHalfWidth + 1.9;
    out.arch = { x: o.x, z: o.z, nx: o.nx, nz: o.nz, tx: o.tx, tz: o.tz, half };
    for (const side of [-1, 1]) out.pillars.push({ x: o.x + o.nx * side * half, z: o.z + o.nz * side * half, r: 1.45 });
  }
  const rng = makeRng(31);
  const camels = D.camels || [];
  // the town, its farms and footpaths stay clear
  const T = CFG.town, busy = [];
  for (const h of CFG.huts) busy.push([h.x, h.z, 3.5]);
  for (const f of T.fields) busy.push([f.x, f.z, Math.hypot(f.w, f.d) / 2 + 1.8]);
  busy.push([T.windmill.x, T.windmill.z, 4.5], [T.barn.x, T.barn.z, 5.5], [T.well.x, T.well.z, 2.5], [T.market.x, T.market.z, 3], [T.square.x, T.square.z, 7.5], [CFG.fortress.x, CFG.fortress.z, 8], [CFG.fortressPad.x, CFG.fortressPad.z, 3.5]);
  for (const pts of T.paths) for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k <= 4; k++) busy.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / 4, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / 4, 2]);
  const clear = (x, z, gap) => road.distanceTo(x, z) > CFG.roadHalfWidth + gap
    && !CFG.slots.some((q) => Math.hypot(q.x - x, q.z - z) < 5.4)
    && !inWater(x, z, 0.5)
    && !busy.some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br)
    && !out.pillars.some((q) => Math.hypot(q.x - x, q.z - z) < 3)
    && !camels.some((c) => Math.hypot(c.x - x, c.z - z) < 2.6)
    && !out.palms.some((q) => Math.hypot(q.x - x, q.z - z) < 2.4)
    && x > CFG.walk.minX + 1 && x < CFG.walk.maxX - 1 && z > CFG.walk.minZ + 1 && z < CFG.walk.maxZ - 1;
  // a ring of palms round the pool, then a few out in the dunes
  const P = D.pond, want = D.palms || 0;
  for (let tries = 0; out.palms.length < Math.ceil(want * 0.65) && tries < 400; tries++) {
    const a = rng() * Math.PI * 2, k = pondEdge(P, a) * (1.18 + rng() * 0.32);
    const x = P.x + Math.cos(a) * P.rx * k, z = P.z + Math.sin(a) * P.rz * k;
    if (clear(x, z, 1.6)) out.palms.push({ x, z, h: 4.2 + rng() * 1.2, lean: rng() * Math.PI * 2, tilt: 0.12 + rng() * 0.16, r: 0.4 });
  }
  for (let tries = 0; out.palms.length < want && tries < 600; tries++) {
    const x = rng.range(CFG.walk.minX + 2, CFG.walk.maxX - 2), z = rng.range(-26, CFG.walk.maxZ - 2);
    if (clear(x, z, 2.2)) out.palms.push({ x, z, h: 4.2 + rng() * 1.4, lean: rng() * Math.PI * 2, tilt: 0.1 + rng() * 0.18, r: 0.4 });
  }
  out.solids = [...out.pillars, ...out.palms.map((p) => ({ x: p.x, z: p.z, r: p.r })), ...camels.map((c) => ({ x: c.x, z: c.z, r: 1.1 }))];
  oasisCache = out;
  return out;
}

export let road = new RoadPath(CFG.roadPoints);

// Switches every map field of CFG to another level and rebuilds the road.
export function setLevel(id) {
  const m = MAPS.find((q) => q.id === id) || MAPS[0];
  Object.assign(CFG, {
    level: m.id, roadPoints: m.roadPoints, plateaus: m.plateaus, hills: m.hills, slots: m.slots,
    fortress: m.fortress, fortressPad: m.fortressPad, walk: m.walk, huts: m.huts, town: m.town, decor: m.decor, levelHp: m.hpMul || 1,
  });
  CFG.hero.start = m.heroStart;
  road = new RoadPath(CFG.roadPoints);
  oasisCache = null; streamCache = null;
  if (!m.moleExit) m.moleExit = Math.round(road.length - 30);
  CFG.bosses.mole.dig.exit = m.moleExit;
  return m;
}
export const levelMap = (id = CFG.level) => MAPS.find((q) => q.id === id) || MAPS[0];
