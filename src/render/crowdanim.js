// Crowd skeletal animation: the healer rats and ratlings come by the dozen, so a
// SkinnedMesh and mixer each would cost a draw call and a skeleton update apiece.
// Instead each model's clips are sampled once at load (30 frames a second) into a
// float texture of bone matrices, one row per frame; the vertex shader skins every
// copy straight from it. Each copy (instance) says which frame row it shows, and a
// second row it is still blending out of (iClip = rowA, rowB, weight of B, unused),
// so one draw call animates the whole crowd, each rat at its own moment.
import * as THREE from 'three';
import { toonGradient } from './toon.js';
import { toonPBR } from './toonpbr.js';

const FPS = 30;

// bake: rows of bone matrices for every clip, the geometry ready to skin
export function bakeCrowd(model) {
  const scene = model.scene;
  let skin = null;
  scene.traverse((o) => { if (!skin && o.isSkinnedMesh) skin = o; });
  if (!skin) return null;
  const bones = skin.skeleton.bones, B = bones.length;
  const mixer = new THREE.AnimationMixer(scene);
  const names = Object.keys(model.clips);
  const clips = {};
  let rows = 0;
  for (const k of names) { const d = model.clips[k].duration; const n = Math.max(2, Math.round(d * FPS) + 1); clips[k] = { start: rows, frames: n, duration: d }; rows += n; }
  const data = new Float32Array(B * 16 * rows);
  // fit (scale and centre, as the giants are fitted) * bone * bind matrix: a vertex
  // in the mesh's own space goes straight to the fitted model's space
  const fit = new THREE.Matrix4().compose(model.offset.clone().multiplyScalar(model.scale), new THREE.Quaternion(), new THREE.Vector3(model.scale, model.scale, model.scale));
  const m = new THREE.Matrix4(), bm = new THREE.Matrix4();
  for (const k of names) {
    mixer.stopAllAction();
    const a = mixer.clipAction(model.clips[k]); a.reset().play();
    const c = clips[k];
    for (let f = 0; f < c.frames; f++) {
      mixer.setTime(Math.min(c.duration, f / FPS));
      scene.updateMatrixWorld(true);
      skin.skeleton.update();
      const bmats = skin.skeleton.boneMatrices;
      for (let b = 0; b < B; b++) {
        bm.fromArray(bmats, b * 16);
        m.multiplyMatrices(fit, bm).multiply(skin.bindMatrix);
        m.toArray(data, ((c.start + f) * B + b) * 16);
      }
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  const tex = new THREE.DataTexture(data, B * 4, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  // the geometry: position, normal, uv and the skin weights (it is drawn in the fitted space)
  const src = skin.geometry, geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) if (src.attributes[name]) geo.setAttribute(name, src.attributes[name]);
  if (src.index) geo.setIndex(src.index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, model.fit.top / 2, 0), model.fit.top * 1.5);
  return { tex, clips, bones: B, geo, map: model.map, model };
}

// GLSL: the skin matrix of this vertex, blended between frame rows (and the row it
// is blending out of)
const SKIN_GLSL = `
uniform sampler2D uBones;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec4 iClip;
mat4 crowdBone(int row, float b) {
  int x = int(b) * 4;
  return mat4(texelFetch(uBones, ivec2(x, row), 0), texelFetch(uBones, ivec2(x + 1, row), 0), texelFetch(uBones, ivec2(x + 2, row), 0), texelFetch(uBones, ivec2(x + 3, row), 0));
}
mat4 crowdSkinAt(int row) {
  return skinWeight.x * crowdBone(row, skinIndex.x) + skinWeight.y * crowdBone(row, skinIndex.y)
       + skinWeight.z * crowdBone(row, skinIndex.z) + skinWeight.w * crowdBone(row, skinIndex.w);
}
mat4 crowdSkin() {
  float r = iClip.x;
  int r0 = int(floor(r));
  mat4 S = crowdSkinAt(r0);
  float f = fract(r);
  if (f > 0.01) S = S * (1.0 - f) + crowdSkinAt(r0 + 1) * f;
  if (iClip.z > 0.01) S = S * (1.0 - iClip.z) + crowdSkinAt(int(iClip.y + 0.5)) * iClip.z;
  return S;
}
`;

// Toon-shaded crowd material: skinned from the bone texture, flashes white on a hit
// (iAnim.y, as the other rats do). A model with Meshy PBR maps (normal, roughness and
// metal) is drawn with them in the toon style (toonpbr.js), like the bosses.
export function crowdMaterial(bake) {
  const M = bake.model, pbr = M.fit && M.fit.pbr;
  const skin = (sh) => {
    sh.uniforms.uBones = { value: bake.tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_GLSL + '\nattribute vec4 iAnim;\nvarying float vFlash;')
      .replace('#include <beginnormal_vertex>', 'mat4 cS = crowdSkin();\nvec3 objectNormal = normalize(mat3(cS) * normal);\nvFlash = smoothstep(0.6, 1.0, max(iAnim.y, 0.0)) * 0.75;')
      .replace('#include <begin_vertex>', 'vec3 transformed = (cS * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.96, 0.92) * vFlash;');
  };
  if (pbr) {
    return toonPBR({ map: bake.map, side: THREE.DoubleSide, ...(M.normalMap ? { normalMap: M.normalMap, normalScale: M.normalScale } : {}), ormMap: M.ormMap || null, aoStrength: M.aoStrength, extend: skin, key: '-crowd-' + M.name });
  }
  const mat = new THREE.MeshToonMaterial({ map: bake.map, gradientMap: toonGradient(), side: THREE.DoubleSide });
  mat.onBeforeCompile = skin;
  mat.customProgramCacheKey = () => 'crowd-skin-' + bake.model.name;
  return mat;
}

// the same skinning for the ink outline (see inkMaterial's pose option in toon.js)
export function crowdInkPose(bake) {
  return {
    key: 'crowd-' + bake.model.name, glsl: SKIN_GLSL, uniforms: { uBones: { value: bake.tex } },
    begin: 'mat4 cS = crowdSkin();\nvec3 transformed = (cS * vec4(position, 1.0)).xyz;\nvec3 oN = mat3(cS) * oNormal;\nfloat inkFade = 1.0;',
  };
}

// Which frame row a crowd rat shows. clip: state name; t: seconds into it (or, for
// walk and run, the fraction of the loop, from the distance walked); loop: whether
// it wraps. Returns a float row (the shader blends to the next row).
export function crowdRow(bake, clip, t, loop) {
  const c = bake.clips[clip] || bake.clips.idle || Object.values(bake.clips)[0];
  const last = c.frames - 1;
  let f = (t * FPS);
  if (loop) { f %= last; if (f < 0) f += last; } else f = Math.min(last - 0.001, Math.max(0, f));
  return c.start + f;
}
export const crowdFPS = FPS;
