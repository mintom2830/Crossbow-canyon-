// 3D models of the Arsenal towers, made with Meshy from the tower pictures
// (image to 3D) and shrunk for the game (see tools/optimize-models.mjs).
// Each tower has three models: levels 1-2, 3-4 and 5. They are loaded only
// when that tower is first built, from models/<kind>-<tier>.glb next to the
// page. Until a model has loaded (or if it cannot be loaded, e.g. the game
// opened straight from a file) the view keeps the hand-built model.
//
// A model is fitted to a tower pad (FOOT wide), stood on the ground and,
// for towers that aim, cut in two at `cut` (share of its height): the part
// above turns toward the target, the part below stays put.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { toonGradient, inkGeometry } from './toon.js';
import { CFG } from '../config.js';

const FOOT = 2.3;        // how wide a model may be (a tower pad is about 2.2)
const MAX_H = 4.4;       // and how tall
// per tower: cut (null: the whole model stays still), yaw (turns the model so
// its weapon faces +Z), aura (where the glow sprite sits, as shares of the
// model's width, height and depth), lift (shares of height the weapon's muzzle is at)
export const MODEL_FIT = {
  mortar: { cut: 0.52, yaw: 0 },
  crystal: { cut: null, aura: [0, 0.82, 0] },
  tesla: { cut: null, aura: [0, 0.9, 0] },
  flame: { cut: 0.42, yaw: 0 },
  ice: { cut: null, aura: [0, 0.8, 0] },
  poison: { cut: 0.4, yaw: 0, aura: [0, 0.55, 0] },
  sniper: { cut: 0.5, yaw: 0 },
  rocket: { cut: 0.5, yaw: 0 },
  mine: { cut: null, aura: [0, 0.72, 0] },
  spike: { cut: null },
  summoner: { cut: null, aura: [0, 0.6, 0] },
  totem: { cut: null },
  warp: { cut: null, aura: [0, 0.62, 0] },
};
export const modelTier = (level) => (level <= 2 ? 1 : level <= 4 ? 2 : 3);
// the models that were shipped with this build (build.mjs lists src/assets/models)
/* global __TOWER_MODELS__ */
const SHIPPED = typeof __TOWER_MODELS__ !== 'undefined' ? new Set(__TOWER_MODELS__) : null;

// Weapon skins on a textured model: the same mapping as skins.js (each colour
// by its brightness onto the skin's dark → mid → light ramp, vivid trim in the
// accent colour, Lava's bright parts glowing), done in the fragment shader.
const SKIN_GLSL = `
#ifdef USE_MAP
if (uSkinOn > 0.5) {
  vec3 c = diffuseColor.rgb;
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float t = min(0.9, pow(clamp((L - 0.01) / 0.6, 0.0, 1.0), 0.8));
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5, d = mx - mn;
  float s = d < 1e-5 ? 0.0 : (l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn));
  vec3 r;
  if (uSkinGlow > 0.5) {
    r = (s > 0.35 && l > 0.2) ? mix(uSkinLight, uSkinAccent, min(1.0, t * 1.2)) : mix(uSkinDark, uSkinMid, t);
  } else {
    r = t < 0.5 ? mix(uSkinDark, uSkinMid, t * 2.0) : mix(uSkinMid, uSkinLight, (t - 0.5) * 2.0);
    if (s > 0.55 && l > 0.25 && l < 0.8) r = mix(r, uSkinAccent, 0.65);
  }
  diffuseColor.rgb = mix(r, c, 0.08);
}
#endif
`;

export class TowerModels {
  constructor(base = 'models/') {
    this.base = base;
    this.cache = new Map();
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.onLoad = null;      // (kind) => void: a model is ready
    this.misses = 0;         // models that could not be loaded
    this.disabled = typeof window === 'undefined' || (typeof location !== 'undefined' && location.protocol === 'file:');
    this.skinU = {
      uSkinOn: { value: 0 }, uSkinGlow: { value: 0 },
      uSkinDark: { value: new THREE.Color() }, uSkinMid: { value: new THREE.Color() }, uSkinLight: { value: new THREE.Color() }, uSkinAccent: { value: new THREE.Color() },
    };
  }

  // The fitted model for a tower kind at a level, or null while it loads (or if there is none).
  get(kind, level) {
    if (this.disabled || !MODEL_FIT[kind]) return null;
    const key = `${kind}-${modelTier(level)}`;
    if (SHIPPED && !SHIPPED.has(key)) return null;
    let e = this.cache.get(key);
    if (!e) {
      e = { parts: null, failed: false };
      this.cache.set(key, e);
      this.loader.loadAsync(this.base + key + '.glb').then((gltf) => {
        e.parts = this._fit(kind, gltf);
        if (this.onLoad) this.onLoad(kind);
      }).catch(() => { e.failed = true; this.misses++; });
    }
    return e.parts;
  }

  setSkin(id) {
    const S = CFG.skins[id], u = this.skinU;
    u.uSkinOn.value = S && S.colors ? 1 : 0;
    if (!u.uSkinOn.value) return;
    u.uSkinGlow.value = id === 'lava' ? 1 : 0;
    u.uSkinDark.value.set(S.colors[0]); u.uSkinMid.value.set(S.colors[1]); u.uSkinLight.value.set(S.colors[2]);
    u.uSkinAccent.value.set(S.accent ?? S.colors[2]);
  }

  _material(map) {
    const m = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient(), emissive: 0x2a2018 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.skinU);
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uSkinOn;\nuniform float uSkinGlow;\nuniform vec3 uSkinDark;\nuniform vec3 uSkinMid;\nuniform vec3 uSkinLight;\nuniform vec3 uSkinAccent;\nvoid main() {')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + SKIN_GLSL);
    };
    m.customProgramCacheKey = () => 'tower-skin';
    return m;
  }

  // One geometry from the model (world transforms applied), stood on the
  // ground, centred and scaled to fit a pad; cut into base and head if it aims.
  _fit(kind, gltf) {
    const fit = MODEL_FIT[kind];
    const geos = [];
    let map = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = toFloat(o.geometry);
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
      if (!map && o.material && o.material.map) map = o.material.map;
    });
    const geo = geos.length === 1 ? geos[0] : mergeAll(geos);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (fit.yaw) geo.rotateY(fit.yaw);
    geo.computeBoundingBox();
    const b = geo.boundingBox, w = b.max.x - b.min.x, d = b.max.z - b.min.z, h = b.max.y - b.min.y;
    const s = Math.min(FOOT / Math.max(w, d), MAX_H / h);
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.scale(s, s, s);
    const H = h * s;
    if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
    const mat = this._material(map);
    let base = geo, head = null, headY = 0;
    if (fit.cut) {
      headY = fit.cut * H;
      [base, head] = splitAt(geo, headY);
      head.translate(0, -headY, 0);
    }
    const ink = (g) => (g ? inkGeometry(g) : null);
    const aura = fit.aura ? [fit.aura[0], fit.aura[1] * H - (fit.cut ? headY : 0), fit.aura[2]] : null;
    return { base, head, mat, headY, height: H, aura, ink: { base: ink(base), head: ink(head), gun: null } };
  }
}

// A plain copy of a geometry (no index) with float position / normal / uv:
// compressed models store them as quantized, often interleaved, integers.
function toFloat(src) {
  const out = new THREE.BufferGeometry();
  const idx = src.index ? src.index.array : null;
  const n = idx ? idx.length : src.attributes.position.count;
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name];
    if (!a) continue;
    const k = a.itemSize, dst = new Float32Array(n * k);
    const get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < n; i++) {
      const v = idx ? idx[i] : i;
      for (let c = 0; c < k; c++) dst[i * k + c] = get[c].call(a, v);
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, k));
  }
  return out;
}

// Triangles whose centre is above y go into the second geometry.
function splitAt(geo, y) {
  const pos = geo.attributes.position, n = pos.count / 3;
  const lo = [], hi = [];
  for (let t = 0; t < n; t++) {
    const cy = (pos.getY(t * 3) + pos.getY(t * 3 + 1) + pos.getY(t * 3 + 2)) / 3;
    (cy >= y ? hi : lo).push(t);
  }
  return [pick(geo, lo), pick(geo, hi)];
}
function pick(geo, tris) {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const k = attr.itemSize, src = attr.array, dst = new Float32Array(tris.length * 3 * k);
    let o = 0;
    for (const t of tris) for (let v = 0; v < 3; v++) { const i = (t * 3 + v); for (let c = 0; c < k; c++) dst[o++] = src[i * k + c]; }
    out.setAttribute(name, new THREE.BufferAttribute(dst, k));
  }
  out.computeBoundingSphere();
  return out;
}
function mergeAll(geos) {
  // join simple non-indexed geometries with position / normal / uv
  const parts = geos;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    if (!parts.every((g) => g.attributes[name])) continue;
    const k = parts[0].attributes[name].itemSize;
    const total = parts.reduce((n, g) => n + g.attributes[name].count, 0);
    const dst = new Float32Array(total * k);
    let o = 0;
    for (const g of parts) { const a = g.attributes[name]; dst.set(a.array, o); o += a.array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(dst, k));
  }
  return out;
}
