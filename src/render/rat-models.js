// Meshy 3D models of the small rats (image to 3D from the Rat guide
// portraits). They replace the hand-built rats once loaded (models/rat-<v>.glb).
//
// The rats are drawn as GPU instances animated in the vertex shader (see
// ratanim.js), which moves each body part around its joint: legs 1-4, tail 5,
// head 6, body 0. A Meshy model is one skin, so each vertex gets a part from
// where it sits (the back is the tail, the top of the front the head, the bottom
// the legs, front or back, left or right) and a weight, so the parts bend out of
// the body smoothly (see aStiff in ratanim.js).
import * as THREE from 'three';
import { RAT_GAIT } from './models.js';
import { gltfGeometry } from './tower-models.js';

// per rat type: yaw turns the model so its nose points +Z; len: its length
// nose to tail (a rat on all fours) or h: its height (a rat standing up) in
// the game, before each type's own scale; upright: stands on its hind legs
// (only the feet swing); tail: share of the length at the back that is tail
export const RAT_FIT = {
  0: { len: 2.0 },
  1: { len: 2.0 },
  2: { len: 2.05 },
  3: { h: 1.25, upright: true },              // shield rat: stands behind its shield
  4: { h: 1.5, upright: true, tail: 0 },      // healer: stands with its staff (its cape hides the tail)
  5: { len: 2.05 },
  6: { h: 1.05, upright: true, tail: 0.25 },  // ratling: a big-headed baby, sitting up
  7: { len: 2.0, tail: 0.22 },                // bomb rat: the bomb rides on its back
  8: { len: 2.0 },
  9: { len: 2.1, tail: 0.22 },                // jetpack rat: the flame trails behind
};

// The model's geometry ready for the rat shader: facing +Z, standing on the
// ground, scaled to the rat's height, with aPart / aPivot / aGait.
export function ratGeometry(gltf, v) {
  const fit = RAT_FIT[v] || RAT_FIT[0];
  const { geo, map } = gltfGeometry(gltf);
  if (fit.yaw) geo.rotateY(fit.yaw);
  geo.computeBoundingBox();
  let b = geo.boundingBox;
  const s = fit.len ? fit.len / (b.max.z - b.min.z) : fit.h / (b.max.y - b.min.y);
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  b = geo.boundingBox;
  const H = b.max.y, z0 = b.min.z, z1 = b.max.z, L = z1 - z0, W = b.max.x - b.min.x;
  // shift so the body sits where the hand-built rat's does (nose a little ahead of centre)
  const shift = 0.25 * L * (fit.upright ? 0.2 : 1) - (z1 - 0.5 * L);
  geo.translate(0, 0, shift - 0.12);
  const Z0 = z0 + shift - 0.12, Z1 = z1 + shift - 0.12;
  const pos = geo.attributes.position, n = pos.count;
  const part = new Float32Array(n), piv = new Float32Array(n * 3);
  const tailZ = Z0 + (fit.tail ?? (fit.upright ? 0.18 : 0.3)) * L;
  const headZ = Z1 - (fit.upright ? 0.55 : 0.36) * L, headY = (fit.upright ? 0.6 : 0.32) * H;
  const legY = (fit.upright ? 0.16 : 0.3) * H, midZ = (Z0 + Z1) / 2 + 0.1 * L;
  const joints = {
    0: [0, 0, 0],
    1: [-0.22 * W, legY, midZ + 0.18 * L], 2: [0.22 * W, legY, midZ + 0.18 * L],
    3: [-0.22 * W, legY, midZ - 0.12 * L], 4: [0.22 * W, legY, midZ - 0.12 * L],
    5: [0, 0.3 * H, tailZ],
    6: [0, headY, headZ],
  };
  // Soft skinning: every vertex finds how strongly it belongs to a leg, the tail
  // and the head, from where it sits (so the copies of a vertex shared by several
  // triangles always agree and the skin never tears). Each weight fades to 0 at
  // its joint and grows toward the foot, the tail tip or the snout; a leg's weight
  // also fades to 0 along the middle of the body and between the front and back
  // legs, where the leg it belongs to switches. A vertex follows its strongest part
  // by how much stronger it is than the next one, so where two parts meet neither
  // moves it and the body bends instead of breaking.
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const stiff = new Float32Array(n);
  const tailOn = fit.tail !== 0;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const wt = tailOn ? sm(tailZ + 0.03 * L, tailZ - 0.12 * L, z) : 0;
    const wh = sm(headZ - 0.05 * L, headZ + 0.1 * L, z) * sm(headY - 0.15 * H, headY + 0.05 * H, y);
    const wl = sm(legY, legY * 0.45, y) * sm(0.04 * W, 0.14 * W, Math.abs(x)) * sm(0.03 * L, 0.12 * L, Math.abs(z - midZ));
    let p = 0, top = 0, next = 0;
    for (const [q, w] of [[5, wt], [6, wh], [-1, wl]]) {
      if (w > top) { next = top; top = w; p = q; } else if (w > next) next = w;
    }
    if (p === -1) p = (z > midZ ? 1 : 3) + (x > 0 ? 1 : 0);
    const w = top - next;
    if (w <= 0.001) p = 0;
    part[i] = p; stiff[i] = 1 - w;
    piv[i * 3] = joints[p][0]; piv[i * 3 + 1] = joints[p][1]; piv[i * 3 + 2] = joints[p][2];
  }
  geo.setAttribute('aStiff', new THREE.BufferAttribute(stiff, 1));
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geo.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
  geo.setAttribute('aGait', new THREE.BufferAttribute(new Float32Array(n).fill(RAT_GAIT[v] || 0), 1));
  geo.computeBoundingSphere();
  return { geo, map };
}

// A cheap stand-in for a model (for its ink outline, which needs no texture):
// every vertex snaps to the centre of its cell in a grid `cell` wide, and the
// triangles that collapse are dropped. Parts and joints are kept per triangle.
export function clusterGeometry(geo, cell) {
  const pos = geo.attributes.position, n = pos.count;
  const keyOf = (i) => `${Math.round(pos.getX(i) / cell)},${Math.round(pos.getY(i) / cell)},${Math.round(pos.getZ(i) / cell)}`;
  const sums = new Map();
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = keyOf(i); keys[i] = k;
    let s = sums.get(k);
    if (!s) { s = [0, 0, 0, 0]; sums.set(k, s); }
    s[0] += pos.getX(i); s[1] += pos.getY(i); s[2] += pos.getZ(i); s[3]++;
  }
  const extra = ['aPart', 'aPivot', 'aGait', 'aStiff'].filter((a) => geo.attributes[a]);
  const out = { position: [] };
  for (const a of extra) out[a] = [];
  const seen = new Set();
  for (let t = 0; t < n / 3; t++) {
    const k0 = keys[t * 3], k1 = keys[t * 3 + 1], k2 = keys[t * 3 + 2];
    if (k0 === k1 || k1 === k2 || k0 === k2) continue;
    const id = [k0, k1, k2].sort().join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    for (const [j, k] of [[0, k0], [1, k1], [2, k2]]) {
      const s = sums.get(k), i = t * 3 + j;
      out.position.push(s[0] / s[3], s[1] / s[3], s[2] / s[3]);
      for (const a of extra) { const at = geo.attributes[a]; for (let c = 0; c < at.itemSize; c++) out[a].push(at.array[i * at.itemSize + c]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out.position), 3));
  for (const a of extra) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(out[a]), geo.attributes[a].itemSize));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- giants and bosses
// The giant rat and the bosses are posed by joints (body, two arms, two legs; see
// giantParts in models.js). A Meshy model becomes one skinned mesh on bones at
// those joints. top: the height the game draws them at.
export const GIANT_FIT = {
  giant: { yaw: 0, top: 3.55, maxW: 3.8 },
  warlord: { yaw: 0, top: 3.55 },
  baron: { yaw: 0, top: 3.55 },
  king: { yaw: 0, top: 3.75, noArms: true },   // the robe hides his arms: it stays in one piece
  slime: { yaw: 0, top: 1.85, whole: true },
  mole: { yaw: 0, top: 3.4, maxW: 4.4 },
  buzzard: { yaw: 0, top: 3.15, wings: true, noLegs: true },   // its wings flap; the net of rats hangs from the body
};
export function giantModelParts(gltf, style) {
  const fit = GIANT_FIT[style] || GIANT_FIT.giant;
  const { geo, map } = gltfGeometry(gltf);
  if (fit.yaw) geo.rotateY(fit.yaw);
  geo.computeBoundingBox();
  let b = geo.boundingBox;
  // as tall as the hand-built one, but no wider than maxW (a crouching giant swinging a club is wide)
  const s = Math.min(fit.top / (b.max.y - b.min.y), (fit.maxW || 3.6) / (b.max.x - b.min.x));
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  b = geo.boundingBox;
  const top = b.max.y + 0.15;
  if (fit.whole) return { torso: geo, top, map };
  const H = b.max.y, W = b.max.x - b.min.x;
  const sh = fit.wings ? 0.22 : 0.27;
  const pivots = {
    armL: [-sh * W, (fit.wings ? 0.62 : 0.72) * H, 0], armR: [sh * W, (fit.wings ? 0.62 : 0.72) * H, 0],
    legL: [-0.17 * W, 0.27 * H, 0], legR: [0.17 * W, 0.27 * H, 0],
  };
  // Skinned: one mesh on a skeleton (bones 0 root at the feet, 1 body, 2/3 left and
  // right arm, 4/5 left and right leg; see _getGiant in view.js). Every vertex gets
  // weights from where it sits, fading smoothly across the shoulders and hips, so
  // when an arm swings or a leg strides the skin bends instead of splitting.
  const sm = (a, c, x) => { const k = Math.min(1, Math.max(0, (x - a) / (c - a))); return k * k * (3 - 2 * k); };
  const pos = geo.attributes.position, nv = pos.count;
  const idx = new Uint16Array(nv * 4), wts = new Float32Array(nv * 4);
  const hipY = 0.27 * H, armLo = (fit.wings ? 0.35 : 0.3) * H;
  for (let i = 0; i < nv; i++) {
    const x = pos.getX(i), y = pos.getY(i), ax = Math.abs(x);
    let wl = fit.noLegs ? 0 : sm(hipY + 0.04 * H, hipY - 0.1 * H, y) * sm(0.02 * W, 0.09 * W, ax);
    let wa = fit.noArms ? 0 : sm((sh - 0.05) * W, (sh + 0.05) * W, ax) * sm(armLo, armLo + 0.08 * H, y) * (1 - sm(0.86 * H, 0.92 * H, y));
    if (wl + wa > 1) { const k = 1 / (wl + wa); wl *= k; wa *= k; }
    const rest = 1 - wl - wa, kb = sm(hipY - 0.02 * H, hipY + 0.12 * H, y);
    idx[i * 4] = 0; idx[i * 4 + 1] = 1; idx[i * 4 + 2] = x < 0 ? 2 : 3; idx[i * 4 + 3] = x < 0 ? 4 : 5;
    wts[i * 4] = rest * (1 - kb); wts[i * 4 + 1] = rest * kb; wts[i * 4 + 2] = wa; wts[i * 4 + 3] = wl;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4));
  geo.computeBoundingSphere();
  return { skinned: geo, top, map, pivots };
}
