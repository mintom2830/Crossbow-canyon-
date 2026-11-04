// GPU animation for the instanced small rats.
// Every rat is one instance of one mesh, so hundreds of rats still cost a
// single draw call. Each vertex knows which body part it belongs to (aPart)
// and where that part's joint is (aPivot); each instance gets an animation
// state (iAnim) every frame:
//   x  walk phase in radians (driven by distance walked, so feet don't slide)
//      while dying: the side it rolls over to (+1 / -1)
//   y  hit flinch, 1 -> 0 after a hit; -1 while stunned or frozen (hold still)
//   z  gate attack phase 0..1 (the bite lands at 0.65); -1 when not attacking
//   w  0 alive; 0..1 defeat progress; -1..0 "spent" poof progress
// aGait (per model, see RAT_GAIT in models.js): how that kind of rat moves:
//   0 trot · 1 gallop · 2 heavy stomp · 3 waddle · 4 sneak · 5 hop
import * as THREE from 'three';

export const RAT_POSE_GLSL = [
  "attribute float aPart;",
  "attribute vec3 aPivot;",
  "attribute vec4 iAnim;",
  "attribute float aGait;",
  "uniform float uTime;",
  "varying float vFlash;",
  "mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }",
  "mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }",
  "mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }",
  "struct RatPose { mat3 rot; vec3 pos; float flash; };",
  "RatPose ratPose(vec3 p) {",
  "float ph = iAnim.x;",
  "float hit = iAnim.y;",
  "float atk = iAnim.z;",
  "float die = iAnim.w;",
  "bool still = hit < 0.0;",
  "hit = max(hit, 0.0);",
  "bool alive = die == 0.0;",
  "bool attacking = atk >= 0.0 && alive;",
  "if (!alive || still) ph = 0.6;",
  "int part = int(aPart + 0.5);",
  "int G = int(aGait + 0.5);",
  // quicker little steps when sneaking, slower heavy ones when stomping or waddling
  "if (alive && !still) ph *= G == 4 ? 1.45 : G == 2 ? 0.8 : G == 3 ? 0.85 : G == 5 ? 0.75 : 1.0;",
  "float jit = fract(iAnim.x * 0.137);",
  "float swing = sin(ph);",
  "float foot = 1.0 - abs(sin(ph));",
  "mat3 R = mat3(1.0);",
  "if (part >= 1 && part <= 4) {",
  "float off = (part == 1 || part == 4) ? 0.0 : 3.14159;",
  "float amp = 0.8;",
  "if (G == 1) { off = part <= 2 ? (part == 1 ? 0.0 : 0.35) : (part == 3 ? 2.6 : 2.95); amp = 1.05; }",
  "else if (G == 5) { off = part <= 2 ? 0.0 : 0.5; amp = 0.9; }",
  "else if (G == 2) amp = 0.6;",
  "else if (G == 3) amp = 0.55;",
  "else if (G == 4) amp = 0.7;",
  "float a = sin(ph + off) * amp;",
  "if (attacking) {",
  "if (part <= 2) {",
  "float ak = part == 2 ? fract(atk + 0.9) : atk;",
  "float up = smoothstep(0.05, 0.5, ak) * (1.0 - smoothstep(0.58, 0.68, ak));",
  "float rake = smoothstep(0.58, 0.68, ak) * (1.0 - smoothstep(0.75, 1.0, ak));",
  "a = -1.5 * up + 0.5 * rake + (part == 1 ? 0.0 : 0.2) * up;",
  "} else a = 0.25;",
  "}",
  "if (die > 0.0) a = -0.4 + sin(uTime * 34.0 + float(part) * 1.7) * 0.55 * (1.0 - smoothstep(0.3, 0.6, die));",
  "R = rX(a);",
  "} else if (part == 5) {",
  "float wag = still ? 0.0 : sin(uTime * 7.0 + ph * 0.5) * 0.3 + sin(ph) * 0.12;",
  "float lift = attacking ? -0.35 : G == 1 ? -0.3 - 0.15 * swing : G == 4 ? 0.15 : G == 5 ? -0.25 * abs(swing) : 0.0;",
  "if (G == 4) wag *= 0.3;",
  "if (G == 3) wag += sin(ph) * 0.25;",
  "wag += sin(hit * 18.0) * 0.5 * hit;",
  "R = rY(wag) * rX(lift);",
  "} else if (part == 6) {",
  "float pitch = sin(ph * 2.0) * 0.07 - 0.04 * foot;",
  "float look = still ? 0.0 : sin(uTime * 1.3 + jit * 40.0) * 0.16 * smoothstep(0.4, 1.0, sin(uTime * 0.7 + jit * 23.0));",
  "if (G == 1) pitch -= 0.12;",
  "if (G == 4) { pitch += 0.12; look = still ? 0.0 : sin(uTime * 4.0 + jit * 40.0) * 0.3 * step(0.6, sin(uTime * 1.1 + jit * 9.0)); }",
  "if (attacking) pitch += -0.35 * smoothstep(0.1, 0.55, atk) * (1.0 - smoothstep(0.58, 0.64, atk)) + 0.55 * smoothstep(0.58, 0.64, atk) * (1.0 - smoothstep(0.72, 0.9, atk));",
  "pitch -= 0.5 * sin(hit * 3.14159);",
  "if (attacking) look = 0.0;",
  "R = rY(look) * rX(pitch);",
  "}",
  "vec3 q = R * (p - aPivot) + aPivot;",
  "float bob = abs(sin(ph)) * 0.05;",
  "float pitchB = sin(ph * 2.0) * 0.04;",
  "float rollB = sin(ph) * 0.05;",
  "vec3 off = vec3(0.0);",
  "vec3 sc = vec3(1.0, 1.0 - 0.06 * foot, 1.0 + 0.03 * foot);",
  "if (G == 1) { bob = abs(sin(ph + 0.5)) * 0.1; pitchB = sin(ph) * 0.16; rollB = 0.0; sc = vec3(1.0, 1.0 - 0.05 * foot, 1.0 + 0.12 * sin(ph)); }",
  "else if (G == 2) { bob = abs(sin(ph)) * 0.035; rollB = sin(ph) * 0.09; sc = vec3(1.0 + 0.05 * foot, 1.0 - 0.09 * foot, 1.0); }",
  "else if (G == 3) { bob = abs(sin(ph)) * 0.03; rollB = sin(ph) * 0.17; pitchB *= 0.5; }",
  "else if (G == 4) { bob = abs(sin(ph)) * 0.015; rollB *= 0.3; pitchB = 0.07; off.y = -0.07; }",
  "else if (G == 5) { bob = abs(sin(ph)) * 0.16; pitchB = -sin(ph) * 0.12; sc = vec3(1.0 + 0.08 * foot, 0.86 + 0.24 * abs(sin(ph)), 1.0 - 0.05 * foot); }",
  "if (still) { bob = 0.0; pitchB = 0.0; rollB = 0.0; sc = vec3(1.0); off.y = 0.0; }",
  "off.y += bob;",
  "float fl = sin(hit * 3.14159);",
  "pitchB -= 0.4 * fl;",
  "off.z -= 0.16 * fl;",
  "sc *= vec3(1.0 + 0.14 * fl, 1.0 - 0.2 * fl, 1.0 + 0.08 * fl);",
  "if (attacking) {",
  "float rear = smoothstep(0.05, 0.55, atk) * (1.0 - smoothstep(0.58, 0.66, atk));",
  "float lunge = smoothstep(0.58, 0.66, atk) * (1.0 - smoothstep(0.76, 1.0, atk));",
  "pitchB += -0.8 * rear + 0.32 * lunge;",
  "off.z += -0.06 * rear + 0.38 * lunge;",
  "off.y += 0.05 * rear;",
  "rollB = 0.0;",
  "}",
  "mat3 B = rZ(rollB) * rX(pitchB);",
  "vec3 hip = vec3(0.0, 0.12, -0.3);",
  "vec3 r = B * ((q - hip) * sc) + hip + off;",
  "mat3 Rt = B * R;",
  "float flash = still ? 0.0 : smoothstep(0.6, 1.0, hit) * 0.75;",
  "if (die > 0.0) {",
  "float side = iAnim.x;",
  "float flip = smoothstep(0.0, 0.32, die);",
  "float hop = sin(clamp(die / 0.32, 0.0, 1.0) * 3.14159) * 0.42;",
  "mat3 D = rZ(3.14159 * flip * side);",
  "vec3 c = vec3(0.0, 0.3, 0.0);",
  "r = D * (r - c) + c + vec3(0.0, hop, -0.25 * flip);",
  "float gone = smoothstep(0.58, 0.95, die);",
  "r = r * (1.0 - gone) + vec3(0.0, 0.1, -0.25) * gone;",
  "Rt = D * Rt;",
  "flash = (1.0 - smoothstep(0.0, 0.18, die)) * 0.9;",
  "} else if (die < 0.0) {",
  "float k = -die;",
  "mat3 S = rY(k * 10.0);",
  "r = S * r * (1.0 - smoothstep(0.15, 1.0, k)) + vec3(0.0, k * 0.5, 0.0);",
  "Rt = S * Rt;",
  "flash = 0.4 * (1.0 - k);",
  "}",
  "return RatPose(Rt, r, flash);",
  "}",
].join('\n');

// Toon-shaded rat material (gradientMap: the banded light ramp from toon.js).
export function ratMaterial(uniforms, gradientMap) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + RAT_POSE_GLSL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  RatPose rp = ratPose(position);\n  objectNormal = rp.rot * objectNormal;\n  vFlash = rp.flash;')
      .replace('#include <begin_vertex>', 'vec3 transformed = rp.pos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.96, 0.92) * vFlash;');
  };
  mat.customProgramCacheKey = () => 'rat-anim-toon-v2';
  return mat;
}

// Gate attack phase (0..1, bite at 0.65) from the simulation's swing timer.
export function attackPhase(attackT, rate) {
  const a = 1 - attackT / rate + 0.65;
  return a - Math.floor(a);
}
