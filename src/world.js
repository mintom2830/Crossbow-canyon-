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
export function hillHeight(x, z) {
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
  if (!m.moleExit) m.moleExit = Math.round(road.length - 30);
  CFG.bosses.mole.dig.exit = m.moleExit;
  return m;
}
export const levelMap = (id = CFG.level) => MAPS.find((q) => q.id === id) || MAPS[0];
