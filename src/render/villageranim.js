// GPU animation for the villagers (one instanced mesh per look).
// Per instance, iAnim holds:
//   x  walk phase in radians (driven by distance walked)
//   y  what they are doing (VACT below)
//   z  seconds spent doing it (drives work swings, waving, chatting)
//   w  head turn in radians (to look at approaching rats)
// Jumping and hiding move or scale the instance matrix on the CPU.
import * as THREE from 'three';

export const VACT = { idle: 0, walk: 1, run: 2, work: 3, cheer: 4, panic: 5, talk: 6, cower: 7, wave: 8 };

export const VILLAGER_POSE_GLSL = [
  'attribute float aPart;',
  'attribute vec3 aPivot;',
  'attribute vec4 iAnim;',
  'uniform float uTime;',
  'mat3 vX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }',
  'mat3 vY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }',
  'mat3 vZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }',
  'struct VPose { mat3 rot; vec3 pos; };',
  'VPose villagerPose(vec3 p) {',
  '  float ph = iAnim.x;',
  '  int act = int(iAnim.y + 0.5);',
  '  float t = iAnim.z;',
  '  int part = int(aPart + 0.5);',
  '  bool walking = act == 1 || act == 2 || act == 5;',
  '  float legAmp = act == 1 ? 0.55 : 0.95;',
  '  float side = (part == 1 || part == 3) ? 1.0 : -1.0;',
  '  mat3 R = mat3(1.0);',
  '  if (part == 1 || part == 2) {',
  '    float a = walking ? sin(ph) * side * legAmp : 0.0;',
  '    if (act == 4) a = -0.25 * abs(sin(t * 6.5));',              // tuck on each hop
  '    if (act == 7) a = -1.3;',                                      // kneel
  '    R = vX(a);',
  '  } else if (part == 3 || part == 4) {',
  '    float a = walking ? -sin(ph) * side * (act == 1 ? 0.5 : 0.95) : 0.08 * sin(uTime * 1.7 + side);',
  '    float z = 0.0;',
  '    if (act == 3) { float c = max(0.0, sin(t * 3.4)); a = -0.35 - 1.15 * c * c; }',      // swing the hoe
  '    if (act == 4) { a = -2.75 + 0.22 * sin(t * 11.0 + side); z = side * 0.35; }',       // arms up, cheering
  '    if (act == 5) { a = -2.5 + 0.5 * sin(t * 15.0 + side * 1.7); z = side * (0.45 + 0.3 * sin(t * 12.0)); }',   // flailing
  '    if (act == 6 && part == 4) a = -0.55 - 0.4 * max(0.0, sin(t * 2.6));',               // talking with the hands
  '    if (act == 7) { a = -2.3; z = -side * 0.55; }',                                      // hands over head
  '    if (act == 8 && part == 4) { a = -2.6; z = -0.35 + 0.35 * sin(t * 9.0); }',          // waving hello
  '    R = vZ(z) * vX(a);',
  '  } else if (part == 5) {',
  '    float yaw = iAnim.w, pitch = 0.0;',
  '    if (act == 4) pitch = -0.3;',
  '    if (act == 5) yaw += 0.35 * sin(t * 18.0);',
  '    if (act == 6) pitch = 0.08 * sin(t * 4.3);',
  '    if (act == 3) pitch = 0.25;',
  '    R = vY(yaw) * vX(pitch);',
  '  }',
  '  vec3 q = R * (p - aPivot) + aPivot;',
  '  float bob = walking ? abs(sin(ph)) * (act == 1 ? 0.035 : 0.07) : 0.012 * sin(uTime * 2.1 + ph);',
  '  float lean = act == 2 || act == 5 ? 0.22 : act == 3 ? 0.18 * max(0.0, sin(t * 3.4)) : 0.0;',
  '  vec3 sc = vec3(1.0);',
  '  if (act == 7) { lean = 0.45; sc = vec3(1.08, 0.78, 1.08); }',
  '  mat3 B = vX(lean);',
  '  vec3 hip = vec3(0.0, 0.48, 0.0);',
  '  vec3 r = B * ((q - hip) * sc) + hip + vec3(0.0, bob, 0.0);',
  '  if (act == 7) r.y -= 0.12;',
  '  return VPose(B * R, r);',
  '}',
].join('\n');

// Toon-shaded villager material: clothes take each villager's own colour
// (instanceColor), skin, hair and boots keep theirs (aTint marks the clothes).
export function villagerMaterial(uniforms, gradientMap) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;\n' + VILLAGER_POSE_GLSL)
      .replace('#include <color_vertex>', [
        '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )',
        '  vColor = vec3( 1.0 );',
        '#endif',
        '#ifdef USE_COLOR',
        '  vColor *= color;',
        '#endif',
        '#ifdef USE_INSTANCING_COLOR',
        '  vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, aTint );',
        '#endif',
      ].join('\n'))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  VPose vp = villagerPose(position);\n  objectNormal = vp.rot * objectNormal;')
      .replace('#include <begin_vertex>', 'vec3 transformed = vp.pos;');
  };
  mat.customProgramCacheKey = () => 'villager-toon-v1';
  return mat;
}

// The same pose for the villagers' ink outlines (toon.js inkMaterial).
export function villagerInkPose(uniforms) {
  return {
    key: 'villager', glsl: VILLAGER_POSE_GLSL, uniforms: { uTime: uniforms.uTime },
    begin: 'VPose vp = villagerPose( position );\nvec3 transformed = vp.pos;\nvec3 oN = vp.rot * oNormal;\nfloat inkFade = 1.0;',
  };
}
