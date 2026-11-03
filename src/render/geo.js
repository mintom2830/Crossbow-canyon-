// Tiny procedural-geometry kit: add coloured primitives with transforms,
// then merge them into one vertex-coloured BufferGeometry (one draw call).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class GB {
  // opts.parts: also write aPart / aPivot vertex attributes (o.part, o.pivot)
  // so a vertex shader can move each body part around its own joint.
  // opts.tint: also write aTint (o.tint: 1 where a per-instance colour applies)
  constructor(opts = {}) { this.parts = []; this.tagged = !!opts.parts; this.tinted = !!opts.tint; }
  // o: {x,y,z, rx,ry,rz, s, sx,sy,sz, flat, jitter, rng, keep (keep the
  // geometry's own vertex colours: for adding whole pre-built models)}
  add(geo, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (o.jitter) {
      const p = g.attributes.position, rng = o.rng || Math.random;
      // jitter shared vertices consistently by hashing positions
      const map = new Map();
      for (let i = 0; i < p.count; i++) {
        const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        let d = map.get(k);
        if (!d) { d = [(rng() - 0.5) * o.jitter, (rng() - 0.5) * o.jitter * (o.jitterY ?? 1), (rng() - 0.5) * o.jitter]; map.set(k, d); }
        p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
      }
    }
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
    _q.setFromEuler(_e);
    const s = o.s ?? 1;
    _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
    _v.set(o.x || 0, o.y || 0, o.z || 0);
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    if (o.flat || o.jitter) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (this.tinted) g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n).fill(o.tint || 0), 1));
    if (o.keep && g.attributes.color) { this.parts.push(g); return this; }
    const col = new Float32Array(n * 3);
    _c.set(color);
    const shade = o.shadeY; // optional vertical gradient [bottomMul, topMul]
    let minY = Infinity, maxY = -Infinity;
    if (shade) for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (shade) { const t = (g.attributes.position.getY(i) - minY) / ((maxY - minY) || 1); k = shade[0] + (shade[1] - shade[0]) * t; }
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.tagged) {
      const part = new Float32Array(n).fill(o.part || 0);
      const piv = new Float32Array(n * 3);
      const pv = o.pivot || [0, 0, 0];
      for (let i = 0; i < n; i++) { piv[i * 3] = pv[0]; piv[i * 3 + 1] = pv[1]; piv[i * 3 + 2] = pv[2]; }
      g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
      g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    }
    this.parts.push(g);
    return this;
  }
  build() {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

// Primitive shortcuts (unit-ish sizes, positioned at origin)
export const P = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 10, ...rest) => new THREE.CylinderGeometry(rt, rb, h, seg, ...rest),
  cone: (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg),
  sph: (r, ws = 10, hs = 8, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  oct: (r, d = 0) => new THREE.OctahedronGeometry(r, d),
  dod: (r, d = 0) => new THREE.DodecahedronGeometry(r, d),
  cap: (r, l, cs = 4, rs = 8) => new THREE.CapsuleGeometry(r, l, cs, rs),
  tor: (r, t, rs = 6, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  // one smooth tube along a curve through pts ([x,y,z] list), tapering from
  // radius r0 at the first point to r1 at the last (tails; r1 = 0 closes the tip)
  taper: (pts, r0, r1, tubular = 14, radial = 7, ease = 0.8) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
    const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
    const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.floor(i / (radial + 1)) / tubular;
      curve.getPointAt(t, c);
      v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(r1 + (r0 - r1) * Math.pow(1 - t, ease)).add(c);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  },
  // triangular prism roof: width w (x), height h, depth d (z)
  roof: (w, h, d) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return g;
  },
};

export const lambert = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });

// Radial soft-shadow / glow texture
export function radialTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)', size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.6) + ')')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Re-winds triangles of a non-indexed geometry so each face normal points
// along want(cx, cy, cz) (a function returning a direction for the face centre).
export function orientTriangles(g, want) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3] - ax, by = p[i + 4] - ay, bz = p[i + 5] - az;
    const cx = p[i + 6] - ax, cy = p[i + 7] - ay, cz = p[i + 8] - az;
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    const w = want((ax + p[i + 3] + p[i + 6]) / 3, (ay + p[i + 4] + p[i + 7]) / 3, (az + p[i + 5] + p[i + 8]) / 3);
    if (nx * w[0] + ny * w[1] + nz * w[2] < 0) {
      for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    }
  }
  g.attributes.position.needsUpdate = true;
  return g;
}
