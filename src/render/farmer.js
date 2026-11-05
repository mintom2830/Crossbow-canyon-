// The farmer, built properly: a skeleton, a body, and every garment as its own
// skinned mesh with real thickness, each with its own material (farmer-maps.js):
//   body      head (with the face), nose, ears, neck, forearms, hands
//   hair      a short dark crop under the hat
//   shirt     red plaid: torso, sleeves, a folded collar, thick rolled cuffs
//   overalls  denim: hips, legs with rolled cuffs, a bib with a pocket, straps that
//             go over the shoulders and cross on the back, brass buttons
//   belt      leather, with a brass buckle
//   boots     leather uppers on dark soles
//   hat       straw crown, a brim with real thickness that curls up at the sides,
//             a red band; it sits on its own bone so it can wobble on a spring
//   pitchfork its own object in a socket on the back, on a spring too
// Every surface is a parametric patch (a grid of u, v) with normals from the
// surface itself, so curves shade smoothly across seams. Garments are shells offset
// from the body and weighted to the same bones by the same rule (nearest bone
// segments), so body and clothes bend together instead of passing through each
// other. Model units: feet at y 0, the hat's top at about 1.45, facing +z, the
// farmer's left at +x (the view scales it like the old farmer).
import * as THREE from 'three';
import { toonPBR } from './toonpbr.js';
import { farmerMaps } from './farmer-maps.js';
import { inkMaterial, inkNormals, INK_PX } from './toon.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// ------------------------------------------------------------------ skeleton
// joints in the rest pose (an A-pose, arms 45 degrees down), model space
const ARM_DIR = V3(Math.SQRT1_2, -Math.SQRT1_2, 0);
const side = (s, v) => V3(v.x * s, v.y, v.z);
const J = {};
J.hips = V3(0, 0.5, 0); J.spine = V3(0, 0.62, 0.005); J.chest = V3(0, 0.77, 0); J.neck = V3(0, 0.945, -0.01); J.head = V3(0, 1.0, 0); J.headTop = V3(0, 1.38, 0);
for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
  J['shoulder' + k] = side(s, V3(0.05, 0.9, -0.01));
  J['arm' + k] = side(s, V3(0.205, 0.9, -0.01));
  J['foreArm' + k] = J['arm' + k].clone().addScaledVector(side(s, ARM_DIR), 0.21);
  J['hand' + k] = J['foreArm' + k].clone().addScaledVector(side(s, ARM_DIR), 0.19);
  J['handEnd' + k] = J['hand' + k].clone().addScaledVector(side(s, ARM_DIR), 0.1);
  J['upLeg' + k] = side(s, V3(0.1, 0.475, 0));
  J['leg' + k] = side(s, V3(0.1, 0.27, 0.012));
  J['foot' + k] = side(s, V3(0.1, 0.075, -0.005));
  J['toe' + k] = side(s, V3(0.1, 0.03, 0.09));
  J['toeEnd' + k] = side(s, V3(0.1, 0.03, 0.155));
}
// bone: [parent, joint, the end of its segment (for skin weights)]
const BONES = {
  hips: [null, 'hips', 'spine'], spine: ['hips', 'spine', 'chest'], chest: ['spine', 'chest', 'neck'],
  neck: ['chest', 'neck', 'head'], head: ['neck', 'head', 'headTop'],
};
for (const k of ['L', 'R']) Object.assign(BONES, {
  ['shoulder' + k]: ['chest', 'shoulder' + k, 'arm' + k], ['arm' + k]: ['shoulder' + k, 'arm' + k, 'foreArm' + k],
  ['foreArm' + k]: ['arm' + k, 'foreArm' + k, 'hand' + k], ['hand' + k]: ['foreArm' + k, 'hand' + k, 'handEnd' + k],
  ['upLeg' + k]: ['hips', 'upLeg' + k, 'leg' + k], ['leg' + k]: ['upLeg' + k, 'leg' + k, 'foot' + k],
  ['foot' + k]: ['leg' + k, 'foot' + k, 'toe' + k], ['toe' + k]: ['foot' + k, 'toe' + k, 'toeEnd' + k],
});
// extra bones for secondary motion: the hat, the pitchfork's socket, the belly
J.hat = V3(0, 1.27, 0); J.fork = V3(0, 0.84, -0.2); J.belly = V3(0, 0.66, 0.12);
Object.assign(BONES, { hat: ['head', 'hat', null], fork: ['chest', 'fork', null], belly: ['spine', 'belly', null] });
export const FARMER_JOINTS = J;

// ------------------------------------------------------------------ the body's shape
// torso cross-sections up the body: [y, half width, half depth, centre z]
const TORSO = [[0.42, 0.17, 0.125, -0.005], [0.5, 0.195, 0.15, 0.0], [0.56, 0.205, 0.165, 0.01], [0.63, 0.212, 0.186, 0.026], [0.7, 0.215, 0.19, 0.03],
  [0.78, 0.214, 0.172, 0.014], [0.85, 0.222, 0.15, 0.0], [0.9, 0.2, 0.13, -0.006], [0.94, 0.135, 0.1, -0.01], [0.965, 0.075, 0.07, -0.01]];
function torsoAt(y) {
  // Catmull-Rom through the cross-sections
  const T = TORSO;
  if (y <= T[0][0]) return T[0].slice(1);
  if (y >= T[T.length - 1][0]) return T[T.length - 1].slice(1);
  let i = 0; while (T[i + 1][0] < y) i++;
  const p0 = T[Math.max(0, i - 1)], p1 = T[i], p2 = T[i + 1], p3 = T[Math.min(T.length - 1, i + 2)];
  const t = (y - p1[0]) / (p2[0] - p1[0]), out = [];
  for (let c = 1; c < 4; c++) out.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t));
  return out;
}
// a point on the torso at angle a (0 front, +pi/2 the farmer's left) and height y,
// pushed out by off; a squarish cross-section for a chunky look
const SQ = 2.5;
function torso(a, y, off = 0) {
  const [rx, rz, z0] = torsoAt(y), s = Math.sin(a), c = Math.cos(a);
  const ex = Math.sign(s) * Math.pow(Math.abs(s), 2 / SQ), ez = Math.sign(c) * Math.pow(Math.abs(c), 2 / SQ);
  const p = V3(ex * rx, y, z0 + ez * rz);
  if (off) p.addScaledVector(torsoNormal(a, y), off);
  return p;
}
function torsoNormal(a, y) {
  const e = 1e-3, du = torso(a + e, y).sub(torso(a - e, y)), dv = torso(a, y + e).sub(torso(a, y - e));
  return du.cross(dv).normalize();
}

// ------------------------------------------------------------------ surface builder
// Collects patches for one mesh. grid(nu, nv, f, o): f(u, v) -> Vector3 for u, v in
// 0..1; o.wrapU / o.wrapV: the surface closes on itself that way (normals and
// shading run smoothly across the join); o.uv(u, v) -> [u, v] texture coordinates;
// o.flip turns it inside out; o.w(p) -> skin weights {bone: weight} for a rest
// position (else the builder's own rule).
class Patchwork {
  constructor(weightRule) { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; this.sk = []; this.rule = weightRule; }
  grid(nu, nv, f, o = {}) {
    const base = this.pos.length / 3, e = 1e-3;
    const at = (u, v) => f(o.wrapU ? ((u % 1) + 1) % 1 : Math.min(1, Math.max(0, u)), o.wrapV ? ((v % 1) + 1) % 1 : Math.min(1, Math.max(0, v)));
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = at(u, v);
      // the normal from the surface's own slopes (one-sided at an open edge)
      const du = at(u + e, v).sub(at(u - e, v)), dv = at(u, v + e).sub(at(u, v - e));
      let n = du.cross(dv);
      if (n.lengthSq() < 1e-14) n = (o.pole ? o.pole(u, v) : V3(0, 1, 0)); else n.normalize();
      if (o.flip) n.negate();
      this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z);
      const t = o.uv ? o.uv(u, v) : [u, v]; this.uv.push(t[0], t[1]);
      this.sk.push((o.w || this.rule)(p));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (o.flip) this.idx.push(a, c, b, b, c, d); else this.idx.push(a, b, c, b, d, c);
    }
    return this;
  }
  // a closed slab with thickness: two sides of a patch f (offset along the patch's
  // normal by +-t/2) and its four edges
  slab(nu, nv, f, normal, t, o = {}) {
    const off = (s) => (u, v) => f(u, v).addScaledVector(normal(u, v), s * t / 2);
    this.grid(nu, nv, off(1), o);
    this.grid(nu, nv, off(-1), { ...o, flip: !o.flip });
    // edges: a strip from the outer to the inner face along each side
    const edge = (n, path) => this.grid(n, 1, (u, v) => { const [a, b] = path(u); return f(a, b).addScaledVector(normal(a, b), (0.5 - v) * t); }, { ...o, flip: o.flip });
    edge(nu, (u) => [u, 0]); edge(nu, (u) => [1 - u, 1]); edge(nv, (u) => [0, 1 - u]); edge(nv, (u) => [1, u]);
    return this;
  }
  build(bones) {
    const g = new THREE.BufferGeometry(), n = this.pos.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    this.sk.forEach((w, i) => {
      const ent = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4), tot = ent.reduce((s, e) => s + e[1], 0) || 1;
      ent.forEach(([name, x], c) => { si[i * 4 + c] = bones.index[name]; sw[i * 4 + c] = x / tot; });
    });
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// skin weights: by distance to the nearest bone segments among `names` (a sharp
// inverse power, so a point mid-bone follows its bone and one near a joint blends)
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sp = new THREE.Vector3();
function segDist(p, a, b) { _sb.subVectors(b, a); const t = Math.min(1, Math.max(0, _sp.subVectors(p, a).dot(_sb) / Math.max(1e-9, _sb.lengthSq()))); return _sa.copy(a).addScaledVector(_sb, t).distanceTo(p); }
const byDistance = (names, sharp = 4) => (p) => {
  const w = {};
  for (const nm of names) { const [, j, end] = BONES[nm]; const d = end ? segDist(p, J[j], J[end]) : J[j].distanceTo(p); w[nm] = 1 / Math.pow(d * d + 4e-4, sharp / 2); }
  return w;
};
const rigid = (name) => () => ({ [name]: 1 });

// texture coordinates in tiles of a given size (so every piece of a material has
// the same weave scale); around a closed loop the count is rounded to whole tiles
const tiles = (len, tile) => Math.max(1, Math.round(len / tile));

// ------------------------------------------------------------------ the pieces
function limb(P, from, to, r0, r1, tile, o = {}) {
  // a tube from `from` to `to` (radii r0 -> r1), its cross-section square to the limb
  const axis = to.clone().sub(from), len = axis.length(); axis.normalize();
  const ref = Math.abs(axis.y) > 0.9 ? V3(0, 0, 1) : V3(0, 1, 0);
  const s1 = ref.clone().cross(axis).normalize(), s2 = axis.clone().cross(s1).normalize();
  const around = tiles(2 * Math.PI * Math.max(r0, r1), tile);
  return P.grid(o.nu || 14, o.nv || 6, (u, v) => {
    const a = u * Math.PI * 2, r = r0 + (r1 - r0) * (o.ease ? sm(0, 1, v) : v) * (o.bulge ? 1 + o.bulge * Math.sin(v * Math.PI) : 1);
    return from.clone().addScaledVector(axis, v * len).addScaledVector(s1, Math.cos(a) * r).addScaledVector(s2, Math.sin(a) * r);
  }, { wrapU: true, uv: (u, v) => [u * around, v * len / tile], ...o });
}
// a thick rolled ring around a limb or a body (cuff, band): centre c, axis, radius,
// width along the axis, thickness outwards; rx/rz scale it to an ellipse
function ring(P, c, axis, r, width, thick, tile, o = {}) {
  axis = axis.clone().normalize();
  const ref = Math.abs(axis.y) > 0.9 ? V3(0, 0, 1) : V3(0, 1, 0);
  const s1 = ref.clone().cross(axis).normalize(), s2 = axis.clone().cross(s1).normalize();
  const around = tiles(2 * Math.PI * r, tile);
  return P.grid(o.nu || 18, 8, (u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    // a rounded rectangle cross-section: width along the axis, thickness outwards
    const cx = Math.cos(b), cy = Math.sin(b), k = 1 / Math.pow(Math.pow(Math.abs(cx), 4) + Math.pow(Math.abs(cy), 4), 0.25);
    const along = cx * k * width / 2, out = r + thick / 2 + cy * k * thick / 2;
    const rx = out * (o.sx || 1), rz = out * (o.sz || 1);
    return c.clone().addScaledVector(axis, along).addScaledVector(s1, Math.cos(a) * rx).addScaledVector(s2, Math.sin(a) * rz);
  }, { wrapU: true, wrapV: true, uv: (u, v) => [u * around, v], ...o });
}
function ellipsoid(P, c, rx, ry, rz, o = {}) {
  return P.grid(o.nu || 16, o.nv || 10, (u, v) => {
    const a = (u - 0.5) * Math.PI * 2, b = (v - 0.5) * Math.PI;
    const p = V3(Math.sin(a) * Math.cos(b) * rx, Math.sin(b) * ry, Math.cos(a) * Math.cos(b) * rz);
    if (o.shape) o.shape(p, u, v);
    return o.m ? p.applyMatrix4(o.m).add(c) : p.add(c);
  }, { wrapU: true, pole: (u, v) => V3(0, v < 0.5 ? -1 : 1, 0), uv: (u, v) => [u * (o.tu || 1), v * (o.tv || 1)], ...o });
}

export function buildFarmer() {
  const maps = farmerMaps();
  // ---- skeleton
  const bones = { index: {} }, list = [];
  for (const [name, [parent, joint]] of Object.entries(BONES)) {
    const b = new THREE.Bone(); b.name = 'farmer-' + name;
    b.position.copy(J[joint]).sub(parent ? J[BONES[parent][1]] : V3(0, 0, 0));
    if (parent) bones[parent].add(b);
    bones[name] = b; bones.index[name] = list.length; list.push(b);
  }
  const root = new THREE.Group(); root.name = 'farmer';
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);

  const meshes = {};
  const add = (name, P, mat, px = INK_PX.unit) => {
    const geo = P.build(bones);
    const m = new THREE.SkinnedMesh(geo, mat); m.name = 'farmer-' + name; m.frustumCulled = false;
    root.add(m); m.bind(skeleton);
    inkNormals(geo);
    const ink = new THREE.SkinnedMesh(geo, inkMaterial(px)); ink.frustumCulled = false; ink.name = 'ink'; ink.raycast = () => {};
    root.add(ink); ink.bind(skeleton);
    meshes[name] = m;
    return m;
  };
  const mat = (mm, extra = {}) => toonPBR({ map: mm.map, ...(mm.normalMap ? { normalMap: mm.normalMap, normalScale: new THREE.Vector2(1, 1) } : {}), ormMap: mm.ormMap, ...extra });

  // ---- skin: forearms, hands, neck, nose, ears
  const skin = new Patchwork(byDistance(['foreArmL', 'handL', 'foreArmR', 'handR']));
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const w = byDistance(['foreArm' + k, 'hand' + k]);
    limb(skin, J['foreArm' + k].clone().lerp(J['hand' + k], 0.2), J['hand' + k].clone().lerp(J['handEnd' + k], 0.1), 0.047, 0.04, 0.3, { w });
    // a cartoon mitt: palm and fingers in one, facing in toward the body, and a thumb
    const d = side(s, ARM_DIR), hx = V3(0, 0, 1).cross(d).normalize(), m = new THREE.Matrix4().makeBasis(hx, d, hx.clone().cross(d));
    ellipsoid(skin, J['hand' + k].clone().addScaledVector(d, 0.06), 0.044, 0.066, 0.052, { m, w, nu: 12, nv: 8 });
    ellipsoid(skin, J['hand' + k].clone().addScaledVector(d, 0.035).add(V3(0, 0, 0.045)), 0.019, 0.034, 0.02, { m: new THREE.Matrix4().makeRotationX(-0.6), w, nu: 8, nv: 6 });
  }
  limb(skin, V3(0, 0.9, -0.012), V3(0, 1.06, -0.005), 0.066, 0.064, 0.3, { w: byDistance(['chest', 'neck', 'head']) });
  const headW = rigid('head');
  ellipsoid(skin, V3(0, 1.155, 0.205), 0.043, 0.037, 0.04, { w: headW, nu: 10, nv: 8 });
  for (const s of [1, -1]) ellipsoid(skin, V3(s * 0.198, 1.165, -0.005), 0.026, 0.055, 0.04, { w: headW, nu: 10, nv: 8 });
  add('skin', skin, mat(maps.skin));

  // ---- the head, with the face painted on (u around the head, the front at 0.5)
  const head = new Patchwork(headW);
  ellipsoid(head, V3(0, 1.165, 0.005), 0.2, 0.205, 0.195, {
    nu: 28, nv: 18,
    // a fuller jaw and cheeks, a slightly flatter back
    shape: (p) => { const low = sm(0.05, -0.15, p.y); p.x *= 1 + 0.06 * low; p.z *= p.z < 0 ? 0.95 : 1 + 0.04 * low; },
  });
  const faceMat = mat(maps.face);
  add('head', head, faceMat);

  // ---- hair: a short crop around the back and sides, under the hat
  const hair = new Patchwork(headW);
  hair.grid(20, 6, (u, v) => {
    const a = Math.PI * (0.42 + u * 1.16), b = (-0.32 + v * 0.62) * Math.PI / 2;
    return V3(Math.sin(a) * Math.cos(b) * 0.209, 1.215 + Math.sin(b) * 0.21, 0.005 + Math.cos(a) * Math.cos(b) * 0.204);
  }, { uv: (u, v) => [u * 6, v] });
  add('hair', hair, mat(maps.hair));

  // ---- shirt: torso, sleeves, collar, rolled cuffs
  const torsoW = byDistance(['hips', 'spine', 'chest', 'neck', 'shoulderL', 'shoulderR', 'armL', 'armR'], 5);
  const shirt = new Patchwork(torsoW);
  const plaidTile = 0.17;
  shirt.grid(36, 16, (u, v) => torso(u * Math.PI * 2, 0.56 + v * 0.405), { wrapU: true, uv: (u, v) => [u * tiles(1.25, plaidTile), v * 0.405 / plaidTile] });
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const w = byDistance(['chest', 'shoulder' + k, 'arm' + k, 'foreArm' + k]);
    const a0 = J['arm' + k].clone().add(side(s, V3(-0.04, 0.0, 0))), cuff = J['foreArm' + k].clone().lerp(J['hand' + k], 0.18);
    limb(shirt, a0, cuff, 0.078, 0.066, plaidTile, { w, nv: 8, bulge: 0.05 });
    // the sleeve rolled up into a thick cuff
    ring(shirt, J['foreArm' + k].clone().lerp(J['hand' + k], 0.2), side(s, ARM_DIR), 0.064, 0.05, 0.022, plaidTile, { w: byDistance(['foreArm' + k]) });
  }
  // the collar: a folded band round the neck, open at the front where its points fall
  shirt.grid(30, 6, (u, v) => {
    const a = Math.PI * (0.13 + u * 1.74), lift = Math.sin(a / 2), b = v * Math.PI * 2;
    const h = 0.05 * (0.8 + 0.4 * lift), t = 0.012;
    const flare = 0.025 * (1 - lift) * 0;
    const c = torso(a, 0.95, 0.004), n = torsoNormal(a, 0.95);
    // a thin closed strip: up the band and out, tipping outwards as it rises
    const up = Math.sin(b) * 0.5 + 0.5, out = Math.cos(b) * t * 0.5;
    const y = c.y + up * h - (1 - lift) * 0.035 * up;
    return V3(c.x + n.x * (out + up * (0.018 + flare)), y, c.z + n.z * (out + up * (0.018 + flare)) + (1 - lift) * 0.012 * up);
  }, { wrapV: true, w: byDistance(['chest', 'neck']), uv: (u, v) => [u * 5, v] });
  add('shirt', shirt, mat(maps.plaid), INK_PX.unit);

  // ---- overalls: hips, legs, cuffs, bib, pocket, straps
  const denimTile = 0.22;
  const pants = new Patchwork(byDistance(['hips', 'spine', 'upLegL', 'upLegR'], 5));
  // the seat: the body's lower cross-sections a little out from the shirt, closed underneath
  pants.grid(36, 10, (u, v) => {
    const y = 0.42 + v * 0.23, p = torso(u * Math.PI * 2, y, 0.008);
    const close = sm(0.47, 0.42, y); p.x *= 1 - 0.55 * close * close; p.z = p.z * (1 - 0.5 * close * close);
    return p;
  }, { wrapU: true, uv: (u, v) => [u * tiles(1.2, denimTile), v * 0.23 / denimTile] });
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const w = byDistance(['hips', 'upLeg' + k, 'leg' + k]);
    limb(pants, J['upLeg' + k].clone().add(V3(0, 0.03, 0)), J['leg' + k], 0.098, 0.088, denimTile, { w, nv: 6 });
    limb(pants, J['leg' + k], J['foot' + k].clone().add(V3(0, 0.07, 0.008)), 0.088, 0.082, denimTile, { w: byDistance(['upLeg' + k, 'leg' + k, 'foot' + k]), nv: 6 });
    ring(pants, J['foot' + k].clone().add(V3(0, 0.1, 0.008)), V3(0, 1, 0), 0.081, 0.05, 0.028, denimTile, { w: byDistance(['leg' + k]) });
  }
  // the bib over the chest, with thickness; a pocket on it
  const bibF = (a0, a1, y0, y1, off) => (u, v) => torso(a0 + (a1 - a0) * u, y0 + (y1 - y0) * v, off);
  const bibN = (a0, a1, y0, y1) => (u, v) => torsoNormal(a0 + (a1 - a0) * u, y0 + (y1 - y0) * v);
  pants.slab(10, 6, bibF(-0.62, 0.62, 0.6, 0.855, 0.016), bibN(-0.62, 0.62, 0.6, 0.855), 0.012, { uv: (u, v) => [u * 1.4, v * 1.2] });
  pants.slab(6, 4, bibF(-0.3, 0.3, 0.68, 0.79, 0.03), bibN(-0.3, 0.3, 0.68, 0.79), 0.008, { uv: (u, v) => [u * 0.7, v * 0.5] });
  // straps: up from the bib's top corners, over the shoulders, crossing on the back
  // to the other side of the waist
  for (const s of [1, -1]) {
    const path = [[0.5, 0.85], [0.42, 0.93], [0.52, 0.965], [Math.PI - 0.55, 0.93], [Math.PI - 0.3, 0.8], [Math.PI + 0.1, 0.7], [Math.PI + 0.42, 0.6]].map(([a, y]) => [s * a, y]);
    const at = (t) => { const f = t * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), r = f - i; return [path[i][0] + (path[i + 1][0] - path[i][0]) * r, path[i][1] + (path[i + 1][1] - path[i][1]) * r]; };
    const centre = (t) => { const [a, y] = at(t); return torso(a, Math.min(0.955, y), 0.02); };
    pants.grid(28, 6, (u, v) => {
      const c = centre(u), [a, y] = at(u), n = torsoNormal(a, Math.min(0.955, y));
      const tng = centre(Math.min(1, u + 0.01)).sub(centre(Math.max(0, u - 0.01))).normalize(), across = tng.clone().cross(n).normalize();
      const b = v * Math.PI * 2, k = 1 / Math.pow(Math.pow(Math.abs(Math.cos(b)), 4) + Math.pow(Math.abs(Math.sin(b)), 4), 0.25);
      return c.addScaledVector(across, Math.cos(b) * k * 0.022).addScaledVector(n, Math.sin(b) * k * 0.006);
    }, { wrapV: true, uv: (u, v) => [v * 0.25, u * 6] });
  }
  add('overalls', pants, mat(maps.denim));

  // ---- belt and buckle, buttons
  const belt = new Patchwork(byDistance(['hips', 'spine'], 5));
  belt.grid(40, 8, (u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2, k = 1 / Math.pow(Math.pow(Math.abs(Math.cos(b)), 4) + Math.pow(Math.abs(Math.sin(b)), 4), 0.25);
    const y = 0.61 + Math.cos(b) * k * 0.022;
    return torso(a, y, 0.026 + Math.sin(b) * k * 0.007);
  }, { wrapU: true, wrapV: true, uv: (u, v) => [u * 10, v] });
  add('belt', belt, mat(maps.leather));
  const brass = new Patchwork(byDistance(['hips', 'spine', 'chest'], 5));
  // the buckle: a rounded rectangular frame on the front of the belt
  const bc = torso(0, 0.61, 0.036);
  brass.grid(24, 8, (u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const kx = 1 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 6) + Math.pow(Math.abs(Math.sin(a)), 6), 1 / 6);
    const R = 1 + Math.cos(b) * 0.18;
    return V3(bc.x + Math.cos(a) * kx * 0.034 * R, bc.y + Math.sin(a) * kx * 0.026 * R, bc.z + Math.sin(b) * 0.006);
  }, { wrapU: true, wrapV: true });
  for (const s of [1, -1]) {
    const p = torso(s * 0.5, 0.84, 0.026), n = torsoNormal(s * 0.5, 0.84);
    const m = new THREE.Matrix4().lookAt(V3(0, 0, 0), n, V3(0, 1, 0));
    ellipsoid(brass, p, 0.022, 0.022, 0.009, { m, nu: 12, nv: 6 });
  }
  add('brass', brass, mat(maps.brass), INK_PX.thin);

  // ---- boots and soles
  const boots = new Patchwork(null), soles = new Patchwork(null);
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const w = byDistance(['leg' + k, 'foot' + k, 'toe' + k]);
    const x0 = s * 0.1;
    // the foot: heel to toe, a rounded box that is taller at the heel and rounder at the toe
    boots.grid(18, 12, (u, v) => {
      const zz = -0.06 + v * 0.215, a = u * Math.PI * 2;
      const toe = sm(0.55, 1, v), heel = sm(0.12, 0, v);
      const hw = 0.06 + 0.008 * toe - 0.012 * heel, hh = 0.055 - 0.022 * toe;
      const cx = Math.cos(a), cy = Math.sin(a), k4 = 1 / Math.pow(Math.pow(Math.abs(cx), 3) + Math.pow(Math.abs(cy), 3), 1 / 3);
      const end = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(heel, sm(0.85, 1, v)), 2)));
      return V3(x0 + cx * k4 * hw * end, 0.02 + hh + cy * k4 * hh * end, zz);
    }, { wrapU: true, w, uv: (u, v) => [u * 2, v * 1.5] });
    // the shaft up to the trouser cuff
    limb(boots, V3(x0, 0.06, -0.012), V3(x0, 0.16, -0.004), 0.066, 0.07, 0.15, { w: byDistance(['leg' + k, 'foot' + k]), nv: 3 });
    // the sole: a flat rounded slab under the boot
    soles.slab(14, 3, (u, v) => {
      const a = u * Math.PI * 2, zz = 0.0475 + Math.cos(a) * 0.115, xx = Math.sin(a) * (0.064 + 0.01 * sm(-0.02, 0.1, zz));
      return V3(x0 + xx * v, 0.011, zz * (0.6 + 0.4 * v) + 0.019 * (1 - v));
    }, () => V3(0, 1, 0), 0.022, { w });
  }
  add('boots', boots, mat(maps.boot));
  add('soles', soles, mat(maps.sole), INK_PX.thin);

  // ---- hat: crown, brim (real thickness, curling up at the sides), band
  const hatW = rigid('hat');
  const hat = new Patchwork(hatW), band = new Patchwork(hatW);
  // the crown: up from the band, rounded, with a dent along the top
  hat.grid(28, 10, (u, v) => {
    const a = u * Math.PI * 2, y = 1.255 + v * 0.17;
    const r = 0.168 * (1 - Math.pow(v, 6) * 0.65) - 0.008 * v;
    const dent = Math.pow(v, 4) * (0.035 * Math.pow(Math.cos(a), 2));
    const p = V3(Math.sin(a) * r * 0.96, y - dent - 0.02 * Math.pow(v, 8), Math.cos(a) * r * 1.04);
    return p;
  }, { wrapU: true, uv: (u, v) => [u * 12, v * 3] });
  hat.grid(8, 3, (u, v) => {   // the crown's top, closing the dent
    const a = u * Math.PI * 2, r = 0.168 * 0.35 * (1 - v) - 0.003;
    return V3(Math.sin(a) * r * 0.96, 1.405 - 0.035 * Math.pow(Math.cos(a), 2) * (1 - v) - 0.012 * v, Math.cos(a) * r * 1.04);
  }, { wrapU: true, uv: (u, v) => [u * 4, v] });
  // the brim: a thin closed ring cross-section swept round, rising at the sides
  hat.grid(40, 8, (u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const cx = Math.cos(b), cy = Math.sin(b), k = 1 / Math.pow(Math.pow(Math.abs(cx), 6) + Math.pow(Math.abs(cy), 6), 1 / 6);
    const rr = 0.25 + cx * k * 0.105, t = 0.0095 * (1.15 - 0.3 * (rr - 0.15) / 0.2);
    const lift = 0.085 * Math.pow(Math.max(0, (rr - 0.17) / 0.19), 2) * Math.pow(Math.sin(a), 2) - 0.012 * Math.pow(Math.cos(a), 2) * Math.max(0, (rr - 0.2) / 0.15);
    return V3(Math.sin(a) * rr * 1.04, 1.262 + lift + cy * k * t, Math.cos(a) * rr * 0.92);
  }, { wrapU: true, wrapV: true, uv: (u, v) => [u * 20, v * 2] });
  ring(band, V3(0, 1.282, 0), V3(0, 1, 0), 0.166, 0.034, 0.006, 0.05, { sx: 0.96, sz: 1.04 });
  add('hat', hat, mat(maps.straw));
  add('band', band, mat(maps.band), INK_PX.thin);

  // ---- the belly jiggles: the front of the shirt, bib, pocket and belt over the belly
  // take part of their weight from the belly bone
  const bellyIdx = bones.index.belly, from = [bones.index.hips, bones.index.spine, bones.index.chest];
  for (const name of ['shirt', 'overalls', 'belt', 'brass']) {
    const g = meshes[name].geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), z = pos.getZ(i), x = pos.getX(i);
      const w = sm(0.05, 0.16, z) * sm(0.52, 0.62, y) * sm(0.82, 0.7, y) * sm(0.2, 0.08, Math.abs(x)) * 0.8;
      if (w <= 0.01) continue;
      let moved = 0;
      for (let c = 0; c < 4; c++) if (from.includes(si.getComponent(i, c))) { const d = sw.getComponent(i, c) * w; sw.setComponent(i, c, sw.getComponent(i, c) - d); moved += d; }
      if (moved <= 1e-4) continue;
      // the belly takes the weakest slot; what that slot held goes to the strongest
      let lo = 0, hi = 0;
      for (let c = 1; c < 4; c++) { if (sw.getComponent(i, c) < sw.getComponent(i, lo)) lo = c; if (sw.getComponent(i, c) > sw.getComponent(i, hi)) hi = c; }
      if (hi === lo) hi = (lo + 1) % 4;
      sw.setComponent(i, hi, sw.getComponent(i, hi) + sw.getComponent(i, lo));
      sw.setComponent(i, lo, moved);
      si.setComponent(i, lo, bellyIdx);
    }
  }

  // ---- the pitchfork: its own object in the socket on the back
  return { root, bones, skeleton, meshes, maps, faceMat, rest: Object.fromEntries(Object.keys(BONES).map((n) => [n, bones[n].position.clone()])) };
}
