// Original procedural models for Crossbow Canyon.
import * as THREE from 'three';
import { GB, P } from './geo.js';

export const PAL = {
  sand: 0xebbd5c, sandDark: 0xd9a748, sandLight: 0xf4d27f, olive: 0xa3a447,
  road: 0xf5e2b6, roadEdge: 0xd4ab62, roadInk: 0x8a5530,
  cliff: 0xbf5a3c, cliffDark: 0x8f3b2a, cliffLight: 0xdc8250, cliffTop: 0xe9a467,
  stone: 0x8e98a6, stoneDark: 0x66707e, stoneLight: 0xb4bdc8,
  wood: 0x9b6a3d, woodDark: 0x6e4527, woodLight: 0xc08b55, plank: 0xa87444,
  crimson: 0xe2282c, crimsonDark: 0xb31a22, mask: 0xf1dcb0, ink: 0x2a1d1a,
  teal: 0x23aa9c, tealDark: 0x167a70, orange: 0xf27b2c, straw: 0xf2d27e,
  skin: 0xf0b98a, mauve: 0x8a6f99, mauveDark: 0x5f4a6d, bronze: 0xb27d3a, iron: 0x5b6068,
  gold: 0xffc63a, goldDark: 0xe0961c, white: 0xf7f2e6, steel: 0xc3ccd6, roofTeal: 0x2f8f8a,
};

// ---------------------------------------------------------------- rat colours
const RAT = {
  fur: 0x6f6567, furDark: 0x544b4e, furLight: 0x9a8f90, belly: 0xc2b6b3,
  pink: 0xf2a0a6, pinkDark: 0xd9808a, eye: 0x1c1416, tooth: 0xfbf6e8,
};

// ---------------------------------------------------------------- small rat
// One low-poly scurrying rat (instanced by the hundred). Faces +Z.
// Parts are tagged for the GPU walk cycle (see ratShader in view.js):
// 0 body, 1-4 legs (front-left, front-right, back-left, back-right), 5 tail, 6 head.
export const RAT_PART = { body: 0, legFL: 1, legFR: 2, legBL: 3, legBR: 4, tail: 5, head: 6 };
// variant 0: normal rat · 1: fast rat (slim, sandy, red bandana) · 2: armored rat (helmet, back plates)
// 3: shield rat (leather cap, big round shield) · 4: healer rat (green hood, staff with a glowing orb)
// 5: brood rat (fat, mottled, a sack of ratlings on its back) · 6: ratling (tiny pink-grey baby rat)
// 7: bomb rat (a big black bomb with a sparking fuse strapped on its back, goggles)
// 8: ninja rat (black, masked, red headband, a sword on its back) · 9: jetpack rat (aviator cap, goggles, jetpack)
// 10: a shield rat whose shield has broken (drawn without it)
const RAT_LOOKS = [
  { fur: 0x8a7c94, dark: 0x6c5e76, light: 0xb4a6bc, belly: 0xd8cad4, body: [0.98, 0.88, 1.45] },   // lavender-grey, like the portrait
  { fur: 0xa8784c, dark: 0x86603a, light: 0xd2ac80, belly: 0xeedcbc, body: [0.8, 0.76, 1.55] },
  { fur: 0x3e3a44, dark: 0x2c2832, light: 0x625c6a, belly: 0x8a8290, body: [1.05, 0.95, 1.45] },     // armored rat: dark fur under iron
  { fur: 0x86705c, dark: 0x6a5646, light: 0xaa917a, belly: 0xd2bfa8, body: [1.0, 0.88, 1.45] },
  { fur: 0xb8b0b4, dark: 0x948b90, light: 0xd8d2d4, belly: 0xece6e4, body: [0.92, 0.85, 1.4] },
  { fur: 0x7c6478, dark: 0x5e4a5c, light: 0x9f879b, belly: 0xd9b0bc, body: [1.3, 1.12, 1.55] },
  { fur: 0xdcb4c4, dark: 0xc298aa, light: 0xf2d8e2, belly: 0xfcecf2, body: [0.92, 0.85, 1.3] },     // ratling: pink
  { fur: 0x7d6e62, dark: 0x5e5148, light: 0xa09080, belly: 0xcbb9a6, body: [1.02, 0.9, 1.45] },
  { fur: 0x34303c, dark: 0x24202c, light: 0x4c4658, belly: 0x5e5868, body: [0.86, 0.8, 1.5] },
  { fur: 0xf09a44, dark: 0xc87632, light: 0xffc07a, belly: 0xffe4c0, body: [0.95, 0.86, 1.45] },     // jetpack rat: bright ginger
];
export const SHIELDLESS = 10;
// How each kind of rat moves (read by the walk cycle in ratanim.js):
// 0 trot · 1 gallop (fast rat) · 2 heavy stomp (armored, shield) · 3 waddle (brood, bomb)
// 4 sneak (ninja) · 5 hop (ratling)
export const RAT_GAIT = [0, 1, 2, 2, 0, 3, 5, 3, 4, 0, 2];
function withGait(g, variant) {
  g.setAttribute('aGait', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(RAT_GAIT[variant] || 0), 1));
  return g;
}
const HC = [0, 0.41, 0.41];   // the rats' head centre; headK: how much bigger the head is than it once was (a ratling's biggest, like a baby's)
const headK = (v) => (v === 6 ? 1.55 : 1.36);
RAT_LOOKS[SHIELDLESS] = RAT_LOOKS[3];
export function gruntGeometry(variant = 0) {
  const L = RAT_LOOKS[variant];
  const b = new GB({ parts: true });
  const head = { part: RAT_PART.head, pivot: [0, 0.38, 0.2] };
  // the head is a size bigger than it used to be (like the bestiary portraits):
  // parts designed round the old head are scaled about its centre onto the new one
  const HK = headK(variant);
  const hadd = (geo, col, o) => b.add(geo, col, { ...o, x: (o.x || 0) * HK, y: HC[1] + ((o.y || 0) - 0.38) * HK, z: HC[2] + ((o.z || 0) - 0.38) * HK, s: (o.s ?? 1) * HK, ...head });
  const body = L.body;
  b.add(P.sph(0.3, 8, 6), L.fur, { y: 0.32, z: -0.05, sx: body[0], sy: body[1], sz: body[2] });   // body
  b.add(P.sph(0.26, 7, 5), L.dark, { y: 0.38, z: -0.12, sx: body[0] * 0.9, sy: 0.6, sz: 1.2 });    // back
  b.add(P.sph(0.19, 7, 5), L.belly, { y: 0.24, z: 0.05, sx: 0.8, sy: 0.55, sz: 1.2 });            // belly
  hadd(P.sph(0.2, 8, 6), L.fur, { y: 0.38, z: 0.38, sz: 1.2 });                         // head
  hadd(P.sph(0.12, 5, 3), L.light, { y: 0.31, z: 0.5, sx: 1.2, sy: 0.7, sz: 0.9 });     // cheeks
  hadd(P.cone(0.13, 0.26, 6), L.light, { y: 0.35, z: 0.6, rx: Math.PI / 2 });           // snout
  hadd(P.sph(0.05, 5, 4), RAT.pink, { y: 0.35, z: 0.74 });                              // nose
  hadd(P.box(0.08, 0.05, 0.03), RAT.tooth, { y: 0.28, z: 0.66 });                       // teeth
  for (const sx of [-1, 1]) {
    const earUp = variant === 1 ? 0.06 : 0;
    // big round ears: a fur rim with pink inside, like the bestiary portraits
    const ear = { x: sx * 0.15, y: 0.6 + earUp, z: 0.3, rz: -sx * 0.25, sy: variant === 1 ? 1.25 : 1 };
    hadd(P.sph(0.15, 6, 4), L.dark, { ...ear, sz: 0.3 });
    hadd(P.sph(0.115, 6, 4), variant === 8 ? L.dark : RAT.pink, { ...ear, z: ear.z + 0.025, sz: 0.25 });
    // shiny eyes with a white glint (armored rats' glow yellow, brood rats' red)
    const eyeCol = variant === 2 ? 0xffd23a : variant === 5 ? 0xd8262d : RAT.eye;
    hadd(P.sph(0.056, 5, 4), eyeCol, { x: sx * 0.098, y: 0.455, z: 0.51, sz: 0.7 });
    hadd(P.box(0.03, 0.03, 0.02), 0xffffff, { x: sx * 0.082, y: 0.478, z: 0.545 });
    // legs hang from hip joints so they can swing; the foot is part of the leg
    const fl = { part: sx < 0 ? RAT_PART.legFL : RAT_PART.legFR, pivot: [sx * 0.15, 0.26, 0.2] };
    const bl = { part: sx < 0 ? RAT_PART.legBL : RAT_PART.legBR, pivot: [sx * 0.17, 0.26, -0.3] };
    b.add(P.cyl(0.04, 0.035, 0.2, 5), L.dark, { x: sx * 0.15, y: 0.16, z: 0.2, ...fl });
    b.add(P.box(0.09, 0.07, 0.15), RAT.pink, { x: sx * 0.15, y: 0.04, z: 0.23, ...fl });         // front feet
    b.add(P.cyl(0.05, 0.04, 0.2, 5), L.dark, { x: sx * 0.17, y: 0.16, z: -0.3, ...bl });
    b.add(P.box(0.1, 0.07, 0.19), RAT.pink, { x: sx * 0.17, y: 0.04, z: -0.27, ...bl });         // back feet
  }
  if (variant === 3 || variant === SHIELDLESS) {
    // shield rat: a leather cap with a red feather, and (until it breaks) a round shield held out front
    hadd(P.sph(0.215, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x6e4527, { y: 0.45, z: 0.37, sz: 1.1 });
    hadd(P.box(0.03, 0.2, 0.06), 0xd8262d, { x: 0.1, y: 0.62, z: 0.28, rx: -0.5 });
    b.add(P.cyl(0.2, 0.24, 0.08, 10), 0x5a3a24, { y: 0.33, z: 0.08 });                         // belt
    if (variant === 3) {
      // a big round wooden shield (planks, an iron rim with rivets, a gold boss), held up in front
      const sh = { y: 0.5, z: 0.9 };
      b.add(P.cyl(0.46, 0.46, 0.08, 14), 0xb07a42, { ...sh, rx: Math.PI / 2 - 0.12 });              // planks
      for (const px of [-0.17, 0, 0.17]) b.add(P.box(0.035, 0.86, 0.085), 0x7e5028, { x: px, ...sh, rx: -0.12 });
      b.add(P.tor(0.45, 0.05, 4, 18), 0x5b6068, { ...sh, z: sh.z + 0.01, rx: -0.12 });              // iron rim
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.5; b.add(P.box(0.05, 0.05, 0.04), 0xc3ccd6, { x: Math.cos(a) * 0.45, y: sh.y + Math.sin(a) * 0.44, z: sh.z + 0.05 }); }
      b.add(P.sph(0.13, 8, 6), PAL.gold, { ...sh, z: sh.z + 0.06, sz: 0.55 });                    // gold boss
      b.add(P.sph(0.05, 6, 4), 0xfff1a0, { x: -0.04, y: sh.y + 0.05, z: sh.z + 0.12 });           // its shine
    }
  } else if (variant === 4) {
    // healer rat: a green hooded cape, a white cross on the back and a staff with a glowing orb
    b.add(P.sph(0.33, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), 0x3f9a5a, { y: 0.32, z: -0.08, sx: 0.98, sy: 0.92, sz: 1.42 });
    b.add(P.box(0.06, 0.03, 0.2), 0xf7f2e6, { y: 0.62, z: -0.12 });
    b.add(P.box(0.2, 0.03, 0.06), 0xf7f2e6, { y: 0.62, z: -0.1 });
    hadd(P.sph(0.225, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x3f9a5a, { y: 0.4, z: 0.33, sz: 1.15 });   // hood
    b.add(P.cyl(0.028, 0.034, 1.12, 5), 0x8a5a30, { x: 0.27, y: 0.58, z: 0.3, rz: -0.08 });                     // staff
    b.add(P.tor(0.1, 0.026, 4, 12), PAL.gold, { x: 0.315, y: 1.16, z: 0.3 });
    for (const a of [0.6, 2.2]) b.add(P.cone(0.025, 0.12, 4), PAL.gold, { x: 0.315 + Math.cos(a) * 0.1, y: 1.24, z: 0.3 + Math.sin(a) * 0.05 });
    b.add(P.ico(0.13, 1), 0x9dff7a, { x: 0.315, y: 1.2, z: 0.3 });                                         // glowing orb
    b.add(P.ico(0.06, 0), 0xeaffd8, { x: 0.29, y: 1.24, z: 0.36 });
  } else if (variant === 5) {
    // brood rat: mottled spots and a bulging sack on its back with ratlings peeking out
    for (const [sx, sz] of [[-0.18, 0.1], [0.2, -0.15], [-0.1, -0.35], [0.12, 0.3]]) b.add(P.sph(0.08, 6, 4), L.dark, { x: sx * 1.2, y: 0.55, z: sz, sy: 0.4 });
    b.add(P.sph(0.34, 9, 7), 0xc9a46a, { y: 0.7, z: -0.22, sx: 1.05, sy: 0.85, sz: 1.0 });                 // sack
    b.add(P.box(0.5, 0.05, 0.04), 0x8a6a3a, { y: 0.7, z: 0.08, rx: 0.3 });                                    // a patch stitched on
    b.add(P.cyl(0.14, 0.18, 0.08, 8), 0x8a6a3a, { y: 0.93, z: -0.2 });                                        // drawstring
    for (const [x, z, ry] of [[-0.12, -0.08, -0.4], [0.13, -0.14, 0.5], [0, -0.38, 3.1]]) {
      b.add(P.sph(0.075, 6, 5), 0xa08c94, { x, y: 0.96, z });
      b.add(P.cone(0.04, 0.08, 5), 0xc4b0b8, { x: x + Math.sin(ry) * 0.07, y: 0.95, z: z + Math.cos(ry) * 0.07, rx: Math.PI / 2, ry });
      for (const ex of [-1, 1]) b.add(P.sph(0.035, 5, 3), RAT.pink, { x: x + ex * 0.05, y: 1.03, z, sz: 0.4, ry });
    }
  } else if (variant === 6) {
    // ratling: oversized ears and a stubby tail
    for (const sx of [-1, 1]) hadd(P.sph(0.15, 6, 4), RAT.pink, { x: sx * 0.15, y: 0.6, z: 0.28, sz: 0.3 });
  }
  if (variant === 1) {
    // fast rat: a red bandana knotted at the neck, its ends streaming behind
    hadd(P.tor(0.17, 0.045, 5, 12), 0xd8262d, { y: 0.4, z: 0.2, rx: Math.PI / 2 - 0.3, sx: 1.1 });
    b.add(P.box(0.08, 0.03, 0.34), 0xd8262d, { x: 0.06, y: 0.52, z: -0.04, rx: -0.45, ry: 0.22 });
    b.add(P.box(0.07, 0.03, 0.28), 0xb31a22, { x: -0.05, y: 0.5, z: -0.04, rx: -0.35, ry: -0.28 });
  } else if (variant === 2) {
    // armored rat: iron helmet with a crest, plated back and shoulder guards
    const iron = 0x8c949f, ironDark = 0x5f6670, rivet = 0xd9a441;
    hadd(P.sph(0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), iron, { y: 0.44, z: 0.36, sz: 1.15 });
    hadd(P.box(0.05, 0.08, 0.32), ironDark, { y: 0.66, z: 0.34 });                     // crest
    hadd(P.box(0.34, 0.05, 0.06), ironDark, { y: 0.47, z: 0.56 });                     // brim
    for (let i = 0; i < 3; i++) {
      b.add(P.sph(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? ironDark : iron, { y: 0.4 - i * 0.015, z: 0.12 - i * 0.24, sx: 1.05, sy: 0.7, sz: 0.55 });
    }
    // iron spikes along the back plates and on the helmet's crest
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) b.add(P.cone(0.05, 0.2, 4), 0xc3ccd6, { x: sx * 0.17, y: 0.6 - i * 0.02, z: 0.12 - i * 0.24, rz: -sx * 0.35 });
    for (const zz of [0.24, 0.38]) hadd(P.cone(0.04, 0.14, 4), 0xc3ccd6, { y: 0.72, z: zz });
    for (const sx of [-1, 1]) {
      b.add(P.cone(0.045, 0.16, 4), 0xc3ccd6, { x: sx * 0.33, y: 0.46, z: 0.2, rz: -sx * 1.1 });
      b.add(P.sph(0.12, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), iron, { x: sx * 0.24, y: 0.38, z: 0.2, sx: 0.8, rz: -sx * 0.6 });
      b.add(P.sph(0.03, 4, 3), rivet, { x: sx * 0.2, y: 0.55, z: 0.0 });
      b.add(P.sph(0.03, 4, 3), rivet, { x: sx * 0.2, y: 0.53, z: -0.3 });
    }
  } else if (variant === 7) {
    // bomb rat: a big round black bomb strapped on its back, the fuse fizzing with sparks
    b.add(P.sph(0.37, 10, 7), 0x2a2830, { y: 0.9, z: -0.16 });
    b.add(P.sph(0.1, 6, 4), 0x9a98a4, { x: -0.16, y: 1.08, z: 0.0, sy: 0.7 });   // shine
    b.add(P.cyl(0.11, 0.12, 0.1, 8), 0x9a9aa4, { y: 1.29, z: -0.16 });
    b.add(P.cyl(0.026, 0.026, 0.26, 5), 0xd8c08a, { x: 0.05, y: 1.43, z: -0.16, rz: -0.45 });
    b.add(P.ico(0.1, 0), 0xffd23a, { x: 0.11, y: 1.56, z: -0.16 });
    for (let k = 0; k < 5; k++) b.add(P.cone(0.035, 0.16, 4), k % 2 ? 0xff7a2a : 0xfff1a0, { x: 0.11 + Math.cos(k * 1.3) * 0.1, y: 1.58 + Math.sin(k * 1.3) * 0.08, z: -0.16 + Math.sin(k * 2.1) * 0.06, rz: k * 1.3 - Math.PI / 2 });
    for (const sx of [-1, 1]) b.add(P.box(0.06, 0.34, 0.07), 0x7a4a26, { x: sx * 0.21, y: 0.6, z: -0.12, rz: -sx * 0.4 });   // straps
    // welding goggles pushed up on its forehead
    hadd(P.box(0.3, 0.045, 0.05), 0x5a3a20, { y: 0.55, z: 0.44 });
    for (const sx of [-1, 1]) {
      hadd(P.tor(0.062, 0.024, 4, 10), 0x3a3a40, { x: sx * 0.075, y: 0.56, z: 0.47, rx: -0.3 });
      hadd(P.ico(0.052, 0), 0x6fd0e0, { x: sx * 0.075, y: 0.56, z: 0.47, sz: 0.5 });
    }
  } else if (variant === 8) {
    // ninja rat: a black hood and face mask, a red headband with trailing ties, a sword on its back
    hadd(P.sph(0.215, 8, 6), 0x24202c, { y: 0.39, z: 0.37, sz: 1.22 });
    hadd(P.cone(0.145, 0.24, 6), 0x24202c, { y: 0.34, z: 0.58, rx: Math.PI / 2 });
    hadd(P.box(0.3, 0.075, 0.05), 0xf2f0f4, { y: 0.46, z: 0.555 });   // eye slit
    for (const sx of [-1, 1]) hadd(P.box(0.05, 0.05, 0.03), RAT.eye, { x: sx * 0.08, y: 0.46, z: 0.585 });
    hadd(P.tor(0.205, 0.035, 4, 14), 0xd8262d, { y: 0.52, z: 0.36, rx: Math.PI / 2 - 0.25, sz: 1.15 });
    hadd(P.box(0.05, 0.03, 0.3), 0xd8262d, { x: 0.06, y: 0.56, z: 0.08, rx: -0.4, ry: 0.35 });
    hadd(P.box(0.05, 0.03, 0.26), 0xb31a22, { x: -0.05, y: 0.54, z: 0.1, rx: -0.25, ry: -0.3 });
    // the sword slung across its back: blade, gold guard and red-wrapped hilt
    b.add(P.box(0.045, 0.03, 0.82), 0xdce4ec, { x: 0.04, y: 0.62, z: -0.26, rx: 0.55, ry: 0.35 });
    b.add(P.box(0.15, 0.04, 0.05), 0xffc63a, { x: 0.13, y: 0.83, z: 0.07, rx: 0.55, ry: 0.35 });
    b.add(P.box(0.055, 0.055, 0.24), 0x8a1a20, { x: 0.18, y: 0.92, z: 0.18, rx: 0.55, ry: 0.35 });
    b.add(P.tor(0.27, 0.04, 4, 14), 0xd8262d, { y: 0.33, z: 0.06, sy: 0.85 });   // sash
  } else if (variant === 9) {
    // jetpack rat: aviator cap and goggles, a red scarf, a twin-tank jetpack with little flames
    hadd(P.sph(0.222, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x7a4a26, { y: 0.44, z: 0.36, sz: 1.15 });
    for (const sx of [-1, 1]) {
      hadd(P.box(0.05, 0.16, 0.12), 0x7a4a26, { x: sx * 0.19, y: 0.37, z: 0.34 });   // ear flaps
      hadd(P.tor(0.064, 0.026, 4, 10), 0x3a3a40, { x: sx * 0.078, y: 0.53, z: 0.5, rx: -0.35 });
      hadd(P.ico(0.054, 0), 0xffb84a, { x: sx * 0.078, y: 0.53, z: 0.5, sz: 0.5 });
    }
    hadd(P.tor(0.17, 0.045, 5, 12), 0xffe9b8, { y: 0.4, z: 0.2, rx: Math.PI / 2 - 0.3, sx: 1.1 });   // a white flying scarf
    b.add(P.box(0.07, 0.03, 0.3), 0xffe9b8, { x: -0.08, y: 0.5, z: -0.02, rx: -0.3, ry: -0.3 });
    b.add(P.box(0.34, 0.3, 0.1), 0x5a5f6a, { y: 0.64, z: -0.2 });   // back plate
    for (const sx of [-1, 1]) {
      const rx = sx * 0.15, rz = -0.33;
      b.add(P.cyl(0.12, 0.12, 0.54, 8), 0xe0302a, { x: rx, y: 0.72, z: rz });
      b.add(P.cyl(0.125, 0.125, 0.06, 8), 0xe8eaf0, { x: rx, y: 0.84, z: rz });
      b.add(P.cyl(0.125, 0.125, 0.05, 8), 0xe8eaf0, { x: rx, y: 0.6, z: rz });
      b.add(P.cone(0.12, 0.2, 8), 0xe0302a, { x: rx, y: 1.09, z: rz });
      b.add(P.cone(0.06, 0.1, 6), 0xffc63a, { x: rx, y: 1.17, z: rz });
      for (const a of [0, 2.1, 4.2]) b.add(P.box(0.02, 0.16, 0.1), 0xb31a22, { x: rx + Math.cos(a) * 0.12, y: 0.5, z: rz + Math.sin(a) * 0.12, ry: -a });   // fins
      b.add(P.cyl(0.07, 0.1, 0.09, 8), 0x3a3a40, { x: rx, y: 0.42, z: rz });
      b.add(P.cone(0.1, 0.34, 6), 0xff8a24, { x: rx, y: 0.22, z: rz, rx: Math.PI });   // flames
      b.add(P.cone(0.055, 0.2, 6), 0xffe27a, { x: rx, y: 0.28, z: rz, rx: Math.PI });
    }
  }
  // pink tail curling behind
  const tail = { part: RAT_PART.tail, pivot: [0, 0.28, -0.46] };
  const tl = variant === 1 ? 1.25 : 1;
  b.add(P.cyl(0.03, 0.045, 0.45 * tl, 5), RAT.pinkDark, { y: 0.28, z: -0.46 - 0.22 * tl, rx: Math.PI / 2 + 0.25, ...tail });
  b.add(P.cyl(0.015, 0.03, 0.4 * tl, 5), RAT.pinkDark, { x: 0.06, y: 0.36 + 0.02 * tl, z: -0.6 - 0.45 * tl, rx: Math.PI / 2 - 0.35, rz: 0.3, ...tail });
  return withGait(b.build(), variant);
}

// Outline hull for the small rats: only the parts that make the silhouette, at
// lower detail (hundreds of rats are drawn twice: once lit, once as ink).
// Same part tags and joints as gruntGeometry, so it follows the same animation.
export function gruntInkGeometry(variant = 0) {
  const L = RAT_LOOKS[variant];
  const b = new GB({ parts: true });
  const head = { part: RAT_PART.head, pivot: [0, 0.38, 0.2] };
  // the head is a size bigger than it used to be (like the bestiary portraits):
  // parts designed round the old head are scaled about its centre onto the new one
  const HK = headK(variant);
  const hadd = (geo, col, o) => b.add(geo, col, { ...o, x: (o.x || 0) * HK, y: HC[1] + ((o.y || 0) - 0.38) * HK, z: HC[2] + ((o.z || 0) - 0.38) * HK, s: (o.s ?? 1) * HK, ...head });
  const body = L.body;
  b.add(P.sph(0.3, 8, 6), 0, { y: 0.32, z: -0.05, sx: body[0], sy: body[1], sz: body[2] });
  hadd(P.sph(0.206, 6, 4), 0, { y: 0.38, z: 0.38, sz: 1.25 });
  hadd(P.cone(0.13, 0.26, 6), 0, { y: 0.35, z: 0.6, rx: Math.PI / 2 });
  hadd(P.sph(0.05, 4, 3), 0, { y: 0.35, z: 0.74 });
  for (const sx of [-1, 1]) {
    const earUp = variant === 1 ? 0.06 : 0;
    hadd(P.sph(0.15, 6, 4), 0, { x: sx * 0.15, y: 0.6 + earUp, z: 0.3, rz: -sx * 0.25, sz: 0.3, sy: variant === 1 ? 1.25 : 1 });
    const fl = { part: sx < 0 ? RAT_PART.legFL : RAT_PART.legFR, pivot: [sx * 0.15, 0.26, 0.2] };
    const bl = { part: sx < 0 ? RAT_PART.legBL : RAT_PART.legBR, pivot: [sx * 0.17, 0.26, -0.3] };
    b.add(P.cyl(0.04, 0.035, 0.2, 4, 1, true), 0, { x: sx * 0.15, y: 0.16, z: 0.2, ...fl });
    b.add(P.box(0.09, 0.07, 0.15), 0, { x: sx * 0.15, y: 0.04, z: 0.23, ...fl });
    b.add(P.cyl(0.05, 0.04, 0.2, 4, 1, true), 0, { x: sx * 0.17, y: 0.16, z: -0.3, ...bl });
    b.add(P.box(0.1, 0.07, 0.19), 0, { x: sx * 0.17, y: 0.04, z: -0.27, ...bl });
  }
  if (variant === 3 || variant === SHIELDLESS) {
    hadd(P.sph(0.215, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, { y: 0.45, z: 0.37, sz: 1.1 });
    if (variant === 3) b.add(P.cyl(0.49, 0.49, 0.1, 14), 0, { y: 0.5, z: 0.9, rx: Math.PI / 2 - 0.12 });
  } else if (variant === 4) {
    b.add(P.sph(0.33, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, { y: 0.32, z: -0.08, sx: 0.98, sy: 0.92, sz: 1.42 });
    hadd(P.sph(0.225, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, { y: 0.4, z: 0.33, sz: 1.15 });
    b.add(P.cyl(0.028, 0.034, 1.12, 4), 0, { x: 0.27, y: 0.58, z: 0.3, rz: -0.08 });
    b.add(P.ico(0.13, 0), 0, { x: 0.315, y: 1.2, z: 0.3 });
  } else if (variant === 5) {
    b.add(P.sph(0.34, 8, 5), 0, { y: 0.7, z: -0.22, sx: 1.05, sy: 0.85, sz: 1.0 });
    for (const [x, z] of [[-0.12, -0.08], [0.13, -0.14], [0, -0.38]]) b.add(P.sph(0.075, 5, 3), 0, { x, y: 0.96, z });
  } else if (variant === 6) {
    for (const sx of [-1, 1]) hadd(P.sph(0.15, 5, 3), 0, { x: sx * 0.15, y: 0.6, z: 0.28, sz: 0.3 });
  }
  if (variant === 1) {
    hadd(P.tor(0.17, 0.045, 3, 8), 0, { y: 0.4, z: 0.2, rx: Math.PI / 2 - 0.3, sx: 1.1 });
    b.add(P.box(0.06, 0.03, 0.22), 0, { x: 0.05, y: 0.5, z: 0.02, rx: -0.5, ry: 0.2 });
    b.add(P.box(0.06, 0.03, 0.18), 0, { x: -0.04, y: 0.48, z: 0.0, rx: -0.4, ry: -0.25 });
  } else if (variant === 2) {
    hadd(P.sph(0.22, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, { y: 0.44, z: 0.36, sz: 1.15 });
    hadd(P.box(0.05, 0.08, 0.32), 0, { y: 0.66, z: 0.34 });
    hadd(P.box(0.34, 0.05, 0.06), 0, { y: 0.47, z: 0.56 });
    for (let i = 0; i < 3; i++) b.add(P.sph(0.3, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, { y: 0.4 - i * 0.015, z: 0.12 - i * 0.24, sx: 1.05, sy: 0.7, sz: 0.55 });
    for (const sx of [-1, 1]) b.add(P.sph(0.12, 5, 2, 0, Math.PI * 2, 0, Math.PI / 2), 0, { x: sx * 0.24, y: 0.38, z: 0.2, sx: 0.8, rz: -sx * 0.6 });
  } else if (variant === 7) {
    b.add(P.sph(0.37, 9, 7), 0, { y: 0.9, z: -0.16 });
    b.add(P.cyl(0.11, 0.12, 0.1, 6), 0, { y: 1.29, z: -0.16 });
  } else if (variant === 8) {
    hadd(P.sph(0.215, 6, 4), 0, { y: 0.39, z: 0.37, sz: 1.22 });
    b.add(P.box(0.045, 0.03, 0.82), 0, { x: 0.04, y: 0.62, z: -0.26, rx: 0.55, ry: 0.35 });
    b.add(P.box(0.055, 0.055, 0.24), 0, { x: 0.18, y: 0.92, z: 0.18, rx: 0.55, ry: 0.35 });
  } else if (variant === 9) {
    hadd(P.sph(0.222, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, { y: 0.44, z: 0.36, sz: 1.15 });
    b.add(P.box(0.34, 0.3, 0.1), 0, { y: 0.64, z: -0.2 });
    for (const sx of [-1, 1]) {
      b.add(P.cyl(0.12, 0.12, 0.54, 6), 0, { x: sx * 0.15, y: 0.72, z: -0.33 });
      b.add(P.cone(0.12, 0.2, 6), 0, { x: sx * 0.15, y: 1.09, z: -0.33 });
    }
  }
  const tail = { part: RAT_PART.tail, pivot: [0, 0.28, -0.46] };
  const tl = variant === 1 ? 1.25 : 1;
  b.add(P.cyl(0.03, 0.045, 0.45 * tl, 4, 1, true), 0, { y: 0.28, z: -0.46 - 0.22 * tl, rx: Math.PI / 2 + 0.25, ...tail });
  b.add(P.cyl(0.015, 0.03, 0.4 * tl, 4, 1, true), 0, { x: 0.06, y: 0.36 + 0.02 * tl, z: -0.6 - 0.45 * tl, rx: Math.PI / 2 - 0.35, rz: 0.3, ...tail });
  const g = b.build();
  g.deleteAttribute('color');
  return withGait(g, variant);
}

// ---------------------------------------------------------------- giant rat
// Hulking upright rat with a nail-studded club. Bosses share the body with
// their own fur, eyes, cape and headgear. Returns separate geometries so
// limbs can animate (arms pivot at the shoulder, legs at the hip).
// style: false (giant rat) or a boss: 'warlord' (horned helmet, red cape),
// 'baron' (steel armour, visor, blue cape) or 'king' (gold crown, purple cape).
const BOSS_LOOKS = {
  warlord: { fur: 0x6b4a3d, furLight: 0x9a7564, sash: 0xb31a22, eye: 0xff7a1a, cape: 0xb31a22, trim: 0x2a1d1a, weapon: 'mace' },
  baron: { fur: 0x55505a, furLight: 0x847c86, sash: 0x23527a, eye: 0x7fd8ff, cape: 0x23527a, trim: 0xc9a23a, weapon: 'mace', steel: true },
  king: { fur: 0x4d4447, furLight: 0x80777a, sash: 0x5a1a8a, eye: 0xd8262d, cape: 0x6a24a8, trim: 0xf6f0e6, weapon: 'sceptre' },
};
export function giantParts(style = false) {
  if (style === true) style = 'king';
  if (style === 'slime') return slimeParts();
  if (style === 'mole') return moleParts();
  if (style === 'buzzard') return buzzardParts();
  const boss = !!style;
  const look = BOSS_LOOKS[style] || null;
  const fur = look ? look.fur : RAT.fur;
  const furLight = look ? look.furLight : RAT.furLight;
  const sash = look ? look.sash : PAL.crimson;
  const t = new GB()
    .add(P.sph(0.95, 12, 10), fur, { y: 1.62, sx: 1.05, sy: 1.08, sz: 0.9 })                  // body
    .add(P.sph(0.72, 10, 8), RAT.belly, { y: 1.5, z: 0.42, sx: 0.9, sy: 1.0, sz: 0.5 })       // belly
    .add(P.sph(0.5, 9, 7), fur, { x: -0.78, y: 2.12, z: 0.05, sy: 0.85 })                      // big shoulders
    .add(P.sph(0.5, 9, 7), fur, { x: 0.78, y: 2.12, z: 0.05, sy: 0.85 })
    .add(P.sph(0.42, 9, 7), furLight, { x: -0.36, y: 2.0, z: 0.55, sz: 0.55 })                 // chest muscles
    .add(P.sph(0.42, 9, 7), furLight, { x: 0.36, y: 2.0, z: 0.55, sz: 0.55 })
    .add(P.cyl(0.99, 0.99, 0.18, 12), PAL.woodDark, { y: 1.08, sz: 0.9 })                      // belt
    .add(P.box(0.3, 0.26, 0.1), boss ? PAL.gold : PAL.bronze, { y: 1.08, z: 0.84 })             // buckle
    .add(P.box(0.16, 1.5, 0.1), sash, { y: 1.75, z: 0.78, rz: 0.55 })                           // sash
    .add(P.sph(0.5, 10, 8), fur, { y: 2.6, z: 0.18, sx: 0.95, sy: 0.85, sz: 1.15 })            // head
    .add(P.cone(0.32, 0.72, 8), furLight, { y: 2.5, z: 0.88, rx: Math.PI / 2 })                // snout
    .add(P.sph(0.12, 6, 5), RAT.pink, { y: 2.5, z: 1.25 })                                     // nose
    .add(P.box(0.2, 0.18, 0.06), RAT.tooth, { y: 2.28, z: 1.02 })                               // buck teeth
    .add(P.box(0.02, 0.18, 0.06), RAT.eye, { y: 2.28, z: 1.06 });
  for (const sx of [-1, 1]) {
    t.add(P.sph(0.36, 8, 6), fur, { x: sx * 0.44, y: 3.02, z: 0.02, sz: 0.28 });              // ear rim
    t.add(P.sph(0.27, 8, 6), RAT.pink, { x: sx * 0.44, y: 3.02, z: 0.08, sz: 0.25 });         // inner ear
    // fierce eyes like the bestiary's: white, a glowing iris and a glint, under a heavy angry brow
    t.add(P.sph(0.14, 8, 6), 0xfff6e8, { x: sx * 0.23, y: 2.72, z: 0.56, sz: 0.6 });
    t.add(P.sph(0.085, 7, 5), look ? look.eye : 0xd8262d, { x: sx * 0.23, y: 2.71, z: 0.62, sz: 0.5 });
    t.add(P.sph(0.03, 4, 3), 0xffffff, { x: sx * 0.2, y: 2.75, z: 0.66 });
    t.add(P.box(0.36, 0.11, 0.12), 0x2a1d1a, { x: sx * 0.24, y: 2.88, z: 0.6, rz: sx * 0.42 });
    t.add(P.box(0.5, 0.02, 0.02), 0xe9e2d8, { x: sx * 0.38, y: 2.48, z: 1.0, ry: sx * 0.35 }); // whiskers
  }
  // one long pink tail: out from the rump, low along the ground, curling up at the tip
  t.add(P.taper([[0, 1.05, -0.6], [0, 0.82, -1.3], [0.08, 0.86, -1.95], [0.18, 1.2, -2.4], [0.22, 1.72, -2.55]], 0.16, 0, 16), RAT.pinkDark);
  if (boss) {
    // a flowing cape: a middle panel and two side panels wrapping round the back, flaring at the hem
    t.add(P.box(1.2, 2.3, 0.1), look.cape, { y: 1.5, z: -0.86, rx: 0.14 });
    for (const sx of [-1, 1]) t.add(P.box(0.75, 2.2, 0.1), look.cape, { x: sx * 0.86, y: 1.52, z: -0.6, ry: sx * 0.75, rx: 0.12 });
    t.add(P.box(1.24, 0.12, 0.13), look.trim, { y: 0.4, z: -1.02, rx: 0.14 });
    for (const sx of [-1, 1]) t.add(P.box(0.78, 0.12, 0.13), look.trim, { x: sx * 0.9, y: 0.44, z: -0.74, ry: sx * 0.75, rx: 0.12 });
  } else {
    // the plain giant: a red headband knotted at the back and a leather strap across its chest
    t.add(P.tor(0.5, 0.07, 5, 16), PAL.crimson, { y: 2.84, z: 0.16, rx: Math.PI / 2, sz: 1.15 });
    for (const sx of [-1, 1]) t.add(P.box(0.1, 0.36, 0.06), PAL.crimsonDark, { x: sx * 0.12, y: 2.62, z: -0.42, rz: sx * 0.35, rx: 0.4 });
    t.add(P.box(0.2, 1.9, 0.12), PAL.woodDark, { y: 1.75, z: 0.8, rz: -0.6 });
  }
  if (style === 'king') {
    t.add(P.cyl(0.46, 0.4, 0.3, 12), PAL.gold, { y: 3.1, z: 0.12 });                           // crown
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      t.add(P.cone(0.1, 0.34, 4), PAL.gold, { x: Math.cos(a) * 0.4, y: 3.42, z: 0.12 + Math.sin(a) * 0.36 });
      t.add(P.ico(0.06, 0), PAL.gold, { x: Math.cos(a) * 0.4, y: 3.62, z: 0.12 + Math.sin(a) * 0.36 });
      t.add(P.ico(0.07, 0), i % 2 ? 0xd8262d : 0x3a7ad8, { x: Math.cos(a) * 0.45, y: 3.1, z: 0.12 + Math.sin(a) * 0.41 });   // gems
    }
    t.add(P.tor(0.8, 0.3, 8, 18), 0xf6f0e6, { y: 2.22, z: -0.05, rx: Math.PI / 2 + 0.15, sz: 0.85 });                  // white fur collar
    for (let i = 0; i < 8; i++) t.add(P.sph(0.06, 4, 3), 0x2a1d1a, { x: Math.cos(i * 0.785) * 0.98, y: 2.3 + Math.sin(i * 2.3) * 0.05, z: -0.05 + Math.sin(i * 0.785) * 0.84 });
  } else if (style === 'warlord') {
    // iron war helmet with two curved horns, a scar of war paint and spiked shoulder
    t.add(P.sph(0.46, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x6e7480, { y: 2.78, z: 0.14, sz: 1.1 });
    t.add(P.cyl(0.47, 0.47, 0.1, 12), 0x4a4f58, { y: 2.8, z: 0.14, sz: 1.1 });
    for (const sx of [-1, 1]) {
      t.add(P.cone(0.12, 0.6, 6), 0xefe3c8, { x: sx * 0.5, y: 3.1, z: 0.12, rz: -sx * 0.9 });
      t.add(P.cone(0.07, 0.32, 6), 0xefe3c8, { x: sx * 0.78, y: 3.42, z: 0.12, rz: -sx * 0.2 });
      t.add(P.box(0.06, 0.32, 0.02), 0xd8262d, { x: sx * 0.24, y: 2.55, z: 0.78, rz: sx * 0.3 });
    }
    for (const sx of [-1, 1]) {                                                                   // spiked pauldrons
      t.add(P.sph(0.44, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a5f68, { x: sx * 0.95, y: 2.22, z: 0.0, sy: 0.8 });
      t.add(P.tor(0.42, 0.05, 4, 14), 0xb08a3a, { x: sx * 0.95, y: 2.22, z: 0.0, rx: Math.PI / 2 });
      for (let i = 0; i < 3; i++) t.add(P.cone(0.09, 0.36, 4), 0xc9ced6, { x: sx * (0.95 + (i - 1) * 0.22), y: 2.6, z: 0.0, rz: -sx * (i - 1) * 0.35 });
    }
    t.add(P.sph(0.2, 8, 6), 0xefe3c8, { y: 1.1, z: 0.9, sz: 0.5 });                              // a skull on its belt
    for (const sx of [-1, 1]) t.add(P.sph(0.05, 4, 3), 0x2a1d1a, { x: sx * 0.07, y: 1.13, z: 1.0 });
  } else if (style === 'baron') {
    // full steel armour: chest plate, pauldrons, visored great helm with a plume
    const steel = 0xa9b1bc, dark = 0x6b737e;
    t.add(P.sph(0.82, 12, 8), steel, { y: 1.75, z: 0.28, sx: 1.08, sy: 0.95, sz: 0.62 });
    t.add(P.box(0.12, 1.1, 0.1), dark, { y: 1.75, z: 0.8 });
    t.add(P.cyl(0.5, 0.52, 0.62, 12), steel, { y: 2.7, z: 0.2, sz: 1.15 });
    t.add(P.sph(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, { y: 3.0, z: 0.2, sz: 1.15 });
    t.add(P.box(0.62, 0.06, 0.06), 0x1c1f24, { y: 2.78, z: 0.78 });                           // visor slit
    t.add(P.box(0.12, 0.42, 0.7), 0x23527a, { y: 3.45, z: 0.05 });                            // plume
    for (const sx of [-1, 1]) {
      t.add(P.sph(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, { x: sx * 1.0, y: 2.18, z: 0.02, sy: 0.8 });
      t.add(P.sph(0.05, 4, 3), PAL.gold, { x: sx * 1.0, y: 2.5, z: 0.25 });
    }
  }
  const steel = look && look.steel;
  const weapon = look ? look.weapon : 'club';
  const arm = (armed) => {
    const a = new GB()
      .add(P.cap(0.32, 0.68, 3, 8), steel ? 0xa9b1bc : fur, { y: -0.48 })
      .add(P.sph(0.28, 8, 6), steel ? 0x6b737e : RAT.pink, { y: -1.02 })                     // paw (or gauntlet)
      .add(P.cyl(0.31, 0.31, 0.18, 8), sash, { y: -0.7 })                                       // wrap
      .add(P.cyl(0.3, 0.3, 0.14, 8), sash, { y: -0.2 });                                        // armband
    if (!armed) return a.build();
    if (weapon === 'club') {
      // a big wooden club studded with iron nails
      a.add(P.cyl(0.3, 0.11, 1.8, 9), PAL.wood, { y: -1.15, z: 0.8, rx: Math.PI / 2 - 0.35 });
      for (let i = 0; i < 9; i++) {
        const ang = (i / 3 | 0) * 2.1 + (i % 3) * 0.7, along = 0.95 + (i % 3) * 0.24;
        a.add(P.cone(0.06, 0.22, 4), PAL.stoneLight, { x: Math.cos(ang) * 0.27, y: -1.15 + Math.sin(0.35) * along + Math.sin(ang) * 0.2, z: 0.8 + Math.cos(0.35) * along * 0.6, rz: ang - Math.PI / 2 });
      }
    } else if (weapon === 'mace') {
      // a spiked steel mace on an iron-bound handle
      a.add(P.cyl(0.08, 0.08, 1.5, 6), PAL.woodDark, { y: -1.12, z: 0.62, rx: Math.PI / 2 - 0.35 });
      a.add(P.sph(0.36, 10, 8), 0x8c949f, { y: -0.9, z: 1.38 });
      for (let i = 0; i < 10; i++) {
        const u = (i + 0.5) / 10, th = Math.acos(1 - 2 * u), ph = i * 2.4;
        const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
        a.add(P.cone(0.08, 0.3, 4), 0xc9ced6, { x: dx * 0.42, y: -0.9 + dy * 0.42, z: 1.38 + dz * 0.42, rx: Math.atan2(dz, dy), rz: -Math.atan2(dx, Math.hypot(dy, dz)) });
      }
    } else {
      // the Rat King's gold sceptre with a ruby
      a.add(P.cyl(0.07, 0.07, 1.7, 8), PAL.gold, { y: -1.1, z: 0.66, rx: Math.PI / 2 - 0.35 });
      a.add(P.sph(0.22, 10, 8), PAL.gold, { y: -0.82, z: 1.42 });
      a.add(P.ico(0.17, 1), 0xd8262d, { y: -0.68, z: 1.56 });
      for (let i = 0; i < 4; i++) a.add(P.cone(0.06, 0.22, 4), PAL.gold, { x: Math.cos(i * 1.57) * 0.2, y: -0.62, z: 1.42 + Math.sin(i * 1.57) * 0.2 });
    }
    return a.build();
  };
  const leg = new GB()
    .add(P.cap(0.29, 0.35, 3, 8), steel ? 0xa9b1bc : fur, { y: -0.3 })
    .add(P.box(0.44, 0.2, 0.72), steel ? 0x6b737e : RAT.pink, { y: -0.7, z: 0.14 })            // long rat foot (or sabaton)
    .build();
  return { torso: t.build(), armL: arm(false), armR: arm(true), leg, top: style === 'king' ? 3.75 : 3.55 };
}

// ---------------------------------------------------------------- special bosses
// Same contract as giantParts: torso (+ arms and legs, any of which may be
// missing), where each limb hangs from (pivots), and how tall it is (top).
const TAU2 = Math.PI * 2;

// Sewer Slime: a wobbly green blob with angry eyes, a toothy grin, a bone and a
// swallowed rat helmet stuck in it. No limbs: it oozes. Also used, smaller, for
// the slimes it splits into.
const SLIME = { body: 0x7ccf4e, dark: 0x4c9a32, light: 0xc4f58a, mouth: 0x4a1424, pink: 0xf07a8a };
function slimeParts() {
  const t = new GB();
  t.add(P.sph(1.0, 18, 12), SLIME.body, { y: 0.82, sx: 1.06, sy: 0.82, sz: 1.0 });                    // the blob
  t.add(P.sph(1.0, 18, 8), SLIME.dark, { y: 0.24, sx: 1.22, sy: 0.3, sz: 1.16 });                     // puddle it sits in
  for (let i = 0; i < 7; i++) {                                                                          // drips round the rim
    const a = (i / 7) * TAU2 + 0.3;
    t.add(P.sph(0.2, 8, 6), SLIME.body, { x: Math.cos(a) * 1.02, y: 0.42, z: Math.sin(a) * 0.96, sy: 1.25 });
  }
  t.add(P.sph(0.24, 9, 7), SLIME.light, { x: -0.48, y: 1.32, z: 0.38, sy: 0.55 });                    // shine
  t.add(P.sph(0.1, 6, 5), SLIME.light, { x: -0.2, y: 1.46, z: 0.5, sy: 0.6 });
  for (const [x, y, z, r] of [[0.55, 1.2, -0.55, 0.13], [-0.35, 0.95, -0.85, 0.1], [0.75, 0.7, 0.55, 0.08]]) t.add(P.sph(r, 7, 5), SLIME.light, { x, y, z });   // bubbles
  for (const sx of [-1, 1]) {
    t.add(P.sph(0.27, 12, 9), 0xfbf6e8, { x: sx * 0.34, y: 1.06, z: 0.74, sz: 0.62 });                   // eyes
    t.add(P.sph(0.12, 8, 6), 0x1c1416, { x: sx * 0.3, y: 1.02, z: 0.92, sz: 0.5 });
    t.add(P.box(0.38, 0.1, 0.08), 0x2f6a1e, { x: sx * 0.34, y: 1.36, z: 0.78, rz: sx * 0.38 });          // angry brows
  }
  t.add(P.sph(0.36, 12, 6), SLIME.mouth, { y: 0.6, z: 0.86, sx: 1.35, sy: 0.42, sz: 0.42 });           // grin
  t.add(P.sph(0.14, 8, 5), SLIME.pink, { y: 0.52, z: 0.96, sx: 1.3, sy: 0.5 });                        // tongue
  for (let k = 0; k < 6; k++) t.add(P.cone(0.06, 0.18, 4), 0xfbf6e8, { x: (k - 2.5) * 0.13, y: 0.7, z: 0.99, rx: Math.PI });   // a row of fangs
  for (let k = 0; k < 4; k++) t.add(P.cone(0.05, 0.14, 4), 0xfbf6e8, { x: (k - 1.5) * 0.15, y: 0.5, z: 0.98 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU2 + 0.8; t.add(P.cap(0.08, 0.3, 3, 6), SLIME.body, { x: Math.cos(a) * 0.82, y: 0.62, z: Math.sin(a) * 0.78 }); }   // long drips
  // a bone stuck in its side
  t.add(P.cyl(0.07, 0.07, 0.95, 6), 0xf3ead2, { x: 0.95, y: 0.95, z: -0.15, rz: 1.05, ry: 0.4 });
  for (const k of [-1, 1]) t.add(P.sph(0.11, 6, 5), 0xf3ead2, { x: 0.95 + k * 0.41, y: 0.95 + k * 0.23, z: -0.15 - k * 0.15 });
  // a swallowed armored rat's helmet, worn like a crown
  t.add(P.sph(0.34, 10, 5, 0, TAU2, 0, Math.PI / 2), 0x8c949f, { x: 0.12, y: 1.42, z: -0.05, rz: -0.18 });
  t.add(P.box(0.06, 0.12, 0.5), 0x5f6670, { x: 0.18, y: 1.75, z: -0.05, rz: -0.18 });
  return { torso: t.build(), top: 1.85 };
}

// Tunnel Mole: a big velvety mole with a pink star nose, miner's goggles, a hard
// hat with a lamp, a pickaxe on its back and two huge spade claws for digging.
const MOLE = { fur: 0x4a3f48, furLight: 0x75676f, belly: 0x9a8a8e, pink: 0xf2a0a6, claw: 0xf4ecd8, hat: 0xf2c230, hatDark: 0xc9961c, lens: 0xffb43a };
function moleParts() {
  const t = new GB();
  t.add(P.sph(1.0, 14, 10), MOLE.fur, { y: 1.5, sx: 1.12, sy: 1.15, sz: 1.0 });                       // pear-shaped body
  t.add(P.sph(0.85, 12, 8), MOLE.fur, { y: 0.95, sx: 1.22, sy: 0.82, sz: 1.08 });
  t.add(P.sph(0.7, 12, 8), MOLE.belly, { y: 1.3, z: 0.5, sx: 1.0, sy: 1.15, sz: 0.55 });               // belly
  t.add(P.sph(0.62, 12, 9), MOLE.fur, { y: 2.38, z: 0.35, sy: 0.9, sz: 1.05 });                        // head
  t.add(P.cone(0.3, 0.75, 10), MOLE.furLight, { y: 2.22, z: 1.05, rx: Math.PI / 2 });                  // snout
  t.add(P.sph(0.13, 8, 6), MOLE.pink, { y: 2.22, z: 1.44 });                                           // star nose
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU2;
    t.add(P.cone(0.065, 0.26, 5), MOLE.pink, { x: Math.cos(a) * 0.2, y: 2.22 + Math.sin(a) * 0.2, z: 1.46, rz: a - Math.PI / 2 });
  }
  for (const sx of [-1, 1]) {
    t.add(P.box(0.1, 0.17, 0.05), 0xfbf6e8, { x: sx * 0.06, y: 1.98, z: 1.12 });                       // buck teeth
    t.add(P.tor(0.15, 0.05, 6, 12), 0x2e2a2c, { x: sx * 0.24, y: 2.58, z: 0.86, ry: sx * 0.25 });      // goggles
    t.add(P.sph(0.13, 10, 6), MOLE.lens, { x: sx * 0.24, y: 2.58, z: 0.84, sz: 0.45, ry: sx * 0.25 });
    t.add(P.box(0.55, 0.02, 0.02), 0xe9e2d8, { x: sx * 0.42, y: 2.12, z: 1.12, ry: sx * 0.3 });        // whiskers
  }
  t.add(P.tor(0.62, 0.04, 5, 18), 0x2e2a2c, { y: 2.58, z: 0.32, rx: Math.PI / 2, sz: 1.05 });         // goggle strap
  t.add(P.sph(0.56, 12, 6, 0, TAU2, 0, Math.PI / 2), MOLE.hat, { y: 2.76, z: 0.3, sz: 1.1 });          // hard hat
  t.add(P.cyl(0.7, 0.7, 0.07, 14), MOLE.hatDark, { y: 2.77, z: 0.36, sz: 1.08 });
  t.add(P.box(0.08, 0.1, 0.9), MOLE.hatDark, { y: 3.28, z: 0.3 });
  t.add(P.cyl(0.13, 0.16, 0.2, 10), 0x5b6068, { y: 3.0, z: 0.86, rx: Math.PI / 2 - 0.3 });            // lamp
  t.add(P.cyl(0.11, 0.11, 0.04, 10), 0xfff3a0, { y: 3.03, z: 0.97, rx: Math.PI / 2 - 0.3 });
  // a pickaxe strapped to its back
  t.add(P.cyl(0.055, 0.055, 2.0, 6), PAL.wood, { x: 0.1, y: 1.75, z: -1.0, rz: 0.62 });
  t.add(P.box(1.0, 0.13, 0.13), 0x6b737e, { x: -0.43, y: 2.55, z: -1.0, rz: 0.62 - 1.35 });
  t.add(P.cone(0.07, 0.28, 4), 0x6b737e, { x: -0.92, y: 2.42, z: -1.0, rz: 2.4 });
  t.add(P.cyl(0.1, 0.04, 0.45, 6), MOLE.pink, { y: 0.75, z: -1.05, rx: -2.1 });                        // stubby tail
  const arm = (sx) => {
    const a = new GB()
      .add(P.cap(0.3, 0.45, 3, 8), MOLE.fur, { y: -0.35, rz: sx * 0.25 })
      .add(P.sph(0.44, 10, 8), MOLE.pink, { x: sx * 0.16, y: -0.86, z: 0.12, sx: 1.08, sy: 0.55, sz: 1.0, rz: sx * 0.3 });   // spade paw
    for (let i = 0; i < 5; i++) a.add(P.cone(0.075, 0.46, 5), MOLE.claw, { x: sx * 0.16 + (i - 2) * 0.17, y: -1.08, z: 0.5, rx: 2.1 });
    return a.build();
  };
  const leg = new GB()
    .add(P.cap(0.3, 0.2, 3, 8), MOLE.fur, { y: -0.25 })
    .add(P.box(0.48, 0.16, 0.65), MOLE.pink, { y: -0.6, z: 0.16 })
    .build();
  return { torso: t.build(), armL: arm(-1), armR: arm(1), leg, top: 3.4,
    pivots: { armL: [-1.08, 1.8, 0.45], armR: [1.08, 1.8, 0.45], legL: [-0.55, 0.68, 0], legR: [0.55, 0.68, 0] } };
}

// Canyon Buzzard: a huge bald-headed vulture with a white ruff, a hooked beak,
// broad wings (the "arms", which flap) and a net full of rats hanging below.
const BUZZ = { feather: 0x4a3328, dark: 0x30211a, light: 0x7d5c46, ruff: 0xf3ead8, head: 0xe2737c, beak: 0xf2c84a, beakDark: 0xc99a2a, leg: 0xe8b84a, net: 0xb8955a, netDark: 0x7a5a30 };
function buzzardParts() {
  const t = new GB();
  t.add(P.sph(0.9, 14, 10), BUZZ.feather, { y: 1.7, sz: 1.3, rx: 0.25 });                              // body
  t.add(P.sph(0.62, 12, 8), BUZZ.light, { y: 1.5, z: 0.45, sx: 0.85, sy: 0.9, sz: 0.6, rx: 0.25 });     // chest
  t.add(P.tor(0.4, 0.2, 8, 14), BUZZ.ruff, { y: 2.22, z: 0.78, rx: Math.PI / 2 - 0.75 });              // white ruff
  t.add(P.cyl(0.15, 0.2, 0.55, 8), BUZZ.head, { y: 2.38, z: 0.9, rx: 0.6 });                           // bare neck
  t.add(P.sph(0.36, 12, 9), BUZZ.head, { y: 2.68, z: 1.08, sz: 1.1 });                                 // bald head
  t.add(P.cone(0.15, 0.58, 8), BUZZ.beak, { y: 2.6, z: 1.55, rx: Math.PI / 2 + 0.25 });                // hooked beak
  t.add(P.cone(0.08, 0.24, 6), BUZZ.beakDark, { y: 2.42, z: 1.78, rx: Math.PI });
  for (const sx of [-1, 1]) {
    t.add(P.sph(0.095, 8, 6), 0xfbf6e8, { x: sx * 0.2, y: 2.8, z: 1.32 });                              // eyes
    t.add(P.sph(0.05, 6, 4), 0x1c1416, { x: sx * 0.21, y: 2.8, z: 1.4 });
    t.add(P.box(0.24, 0.05, 0.05), BUZZ.dark, { x: sx * 0.2, y: 2.94, z: 1.32, rz: sx * 0.4 });        // scowl
  }
  for (let i = -2; i <= 2; i++) t.add(P.box(0.22, 0.06, 0.95), i % 2 ? BUZZ.dark : BUZZ.feather, { x: i * 0.17, y: 1.55, z: -1.3, ry: i * 0.22, rx: -0.3 });   // tail fan
  // the net of rats hanging under it
  t.add(P.sph(0.6, 10, 8), BUZZ.net, { y: 0.62, z: 0.1, sy: 0.9 });
  for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2], [0.8, 0.6]]) t.add(P.tor(0.6, 0.025, 4, 18), BUZZ.netDark, { y: 0.62, z: 0.1, rx, rz, sy: 0.9 });
  for (const sx of [-1, 1]) t.add(P.cyl(0.025, 0.025, 0.75, 4), BUZZ.netDark, { x: sx * 0.22, y: 1.1, z: 0.12, rz: -sx * 0.35 });   // ropes to the talons
  for (const [x, y, z] of [[-0.3, 1.0, 0.45], [0.32, 0.95, 0.4], [0.05, 1.12, -0.2]]) {                   // rats peeking out
    t.add(P.sph(0.15, 8, 6), RAT.fur, { x, y, z });
    t.add(P.cone(0.07, 0.16, 6), RAT.furLight, { x, y: y - 0.02, z: z + 0.16, rx: Math.PI / 2 });
    for (const ex of [-1, 1]) t.add(P.sph(0.07, 6, 4), RAT.pink, { x: x + ex * 0.1, y: y + 0.13, z, sz: 0.4 });
  }
  // rounded wing panels, with long primary feathers fanned out at the tip like fingers
  const wing = (sx) => {
    const w = new GB()
      .add(P.sph(1, 14, 6), BUZZ.feather, { x: sx * 0.6, sx: 0.72, sy: 0.13, sz: 0.56 })                    // inner wing
      .add(P.sph(1, 14, 6), BUZZ.light, { x: sx * 0.72, y: 0.05, z: 0.3, sx: 0.8, sy: 0.1, sz: 0.2 })        // pale coverts along the front edge
      .add(P.sph(1, 12, 6), BUZZ.dark, { x: sx * 1.42, y: 0.02, z: -0.05, sx: 0.6, sy: 0.11, sz: 0.46 });   // outer wing
    for (let i = 0; i < 5; i++) {
      const a = -0.45 + i * 0.22;
      w.add(P.sph(1, 8, 4), i % 2 ? BUZZ.dark : BUZZ.feather, { x: sx * (1.85 + Math.cos(a) * 0.42), y: 0.02 - i * 0.004, z: -Math.sin(a) * 0.42 - 0.04, sx: 0.48, sy: 0.05, sz: 0.09, ry: sx * a });
    }
    return w.build();
  };
  const leg = new GB()
    .add(P.sph(0.2, 8, 6), BUZZ.dark, { y: -0.05, sy: 1.2 })
    .add(P.cyl(0.07, 0.06, 0.75, 6), BUZZ.leg, { y: -0.45 })
    .add(P.cone(0.05, 0.22, 4), BUZZ.dark, { y: -0.84, z: 0.14, rx: 1.9 })
    .add(P.cone(0.05, 0.22, 4), BUZZ.dark, { x: 0.1, y: -0.84, z: 0.1, rx: 1.9, rz: -0.4 })
    .add(P.cone(0.05, 0.22, 4), BUZZ.dark, { x: -0.1, y: -0.84, z: 0.1, rx: 1.9, rz: 0.4 })
    .build();
  return { torso: t.build(), armL: wing(-1), armR: wing(1), leg, top: 3.15,
    pivots: { armL: [-0.72, 2.0, 0.1], armR: [0.72, 2.0, 0.1], legL: [-0.32, 0.98, 0.15], legR: [0.32, 0.98, 0.15] } };
}

// ---------------------------------------------------------------- farmer
// The farmer: straw hat with a red band, red shirt, blue denim overalls,
// boots, and a pitchfork slung across the back.
export function heroParts() {
  const shirt = 0xd8433a, denim = 0x3e6fb8, denimDark = 0x2f568f, boot = 0x6b4126;
  const body = new GB()
    .add(P.cyl(0.25, 0.3, 0.32, 10), shirt, { y: 0.8 })                                         // shirt
    .add(P.cyl(0.31, 0.32, 0.36, 10), denim, { y: 0.52 })                                       // overalls
    .add(P.box(0.32, 0.26, 0.08), denim, { y: 0.76, z: 0.23 })                                  // bib
    .add(P.box(0.2, 0.12, 0.09), denimDark, { y: 0.74, z: 0.25 })                               // pocket
    .add(P.box(0.07, 0.36, 0.05), denim, { x: -0.13, y: 0.86, z: 0.2, rx: -0.15 })              // straps
    .add(P.box(0.07, 0.36, 0.05), denim, { x: 0.13, y: 0.86, z: 0.2, rx: -0.15 })
    .add(P.box(0.07, 0.36, 0.05), denim, { x: -0.13, y: 0.86, z: -0.2, rx: 0.15 })
    .add(P.box(0.07, 0.36, 0.05), denim, { x: 0.13, y: 0.86, z: -0.2, rx: 0.15 })
    .add(P.sph(0.035, 6, 4), PAL.gold, { x: -0.13, y: 0.86, z: 0.25 })                          // buttons
    .add(P.sph(0.035, 6, 4), PAL.gold, { x: 0.13, y: 0.86, z: 0.25 })
    .add(P.sph(0.25, 10, 8), PAL.skin, { y: 1.1 })                                              // head
    .add(P.box(0.06, 0.08, 0.04), PAL.ink, { x: -0.08, y: 1.12, z: 0.23 })                      // eyes
    .add(P.box(0.06, 0.08, 0.04), PAL.ink, { x: 0.08, y: 1.12, z: 0.23 })
    .add(P.sph(0.05, 6, 4), 0xf08a7a, { x: -0.15, y: 1.04, z: 0.18 })                           // cheeks
    .add(P.sph(0.05, 6, 4), 0xf08a7a, { x: 0.15, y: 1.04, z: 0.18 })
    .add(P.sph(0.06, 6, 4), 0xe7a074, { y: 1.07, z: 0.25 })                                     // nose
    .add(P.cyl(0.56, 0.56, 0.05, 16), PAL.straw, { y: 1.28 })                                   // hat brim
    .add(P.cyl(0.22, 0.28, 0.26, 12), PAL.straw, { y: 1.43 })
    .add(P.cyl(0.285, 0.285, 0.07, 12), 0xc8402f, { y: 1.34 })                                  // hat band
    .build();
  // pitchfork across the back (its own mesh, so a weapon skin can recolour it)
  const fork = new GB()
    .add(P.cyl(0.035, 0.035, 1.5, 6), PAL.woodLight, { y: 0.95, z: -0.3, rz: 0.55 })
    .add(P.box(0.32, 0.05, 0.05), PAL.iron, { x: -0.4, y: 1.58, z: -0.3, rz: 0.55 })
    .add(P.cyl(0.02, 0.01, 0.3, 4), PAL.stoneLight, { x: -0.43, y: 1.78, z: -0.3, rz: 0.55 })
    .add(P.cyl(0.02, 0.01, 0.3, 4), PAL.stoneLight, { x: -0.31, y: 1.72, z: -0.3, rz: 0.55 })
    .add(P.cyl(0.02, 0.01, 0.3, 4), PAL.stoneLight, { x: -0.55, y: 1.84, z: -0.3, rz: 0.55 })
    .build();
  const leg = new GB()
    .add(P.cyl(0.085, 0.085, 0.3, 6), denim, { y: -0.15 })
    .add(P.box(0.15, 0.12, 0.24), boot, { y: -0.33, z: 0.04 })
    .build();
  const arm = new GB()
    .add(P.cyl(0.07, 0.065, 0.34, 6), shirt, { y: -0.17 })
    .add(P.sph(0.08, 6, 5), PAL.skin, { y: -0.36 })
    .build();
  return { body, leg, arm, fork };
}

// ---------------------------------------------------------------- rides
// A horse or a cow for the farmer to ride (Shop), at the farmer's own scale,
// facing +Z. body carries the saddle; head turns about headPivot; one leg
// geometry (hanging from its hip at the origin) is used at the four hips;
// the tail swings about tailPivot; seat is the height of the saddle's top.
export function mountParts(kind) {
  const ink = PAL.ink;
  if (kind === 'cow') {
    const coat = 0xf6f1e8, spot = 0x2e2629, pink = 0xf2a6a6, horn = 0xf0e2c0, hoof = 0x3a302a;
    const body = new GB()
      .add(P.sph(1, 14, 10), coat, { y: 0.78, sx: 0.37, sy: 0.33, sz: 0.62 })
      .add(P.sph(0.3, 10, 8), coat, { y: 0.8, z: -0.38 })
      .add(P.sph(0.28, 10, 8), coat, { y: 0.8, z: 0.36 });
    // black patches on both flanks and the back
    for (const [x, y, z, r] of [[0.33, 0.82, 0.12, 0.17], [0.31, 0.7, -0.3, 0.13], [-0.33, 0.85, -0.12, 0.18], [-0.3, 0.68, 0.3, 0.12], [0.1, 1.08, -0.38, 0.13]]) {
      body.add(P.sph(r, 9, 7), spot, { x, y, z, sx: x ? 0.45 : 1, sy: x ? 1 : 0.35, sz: 1.3 });
    }
    body
      .add(P.sph(0.11, 8, 6), pink, { y: 0.47, z: -0.24, sy: 0.7 })                            // udder
      .add(P.box(0.62, 0.05, 0.56), 0xc8402f, { y: 1.09, z: 0.04 })                             // saddle blanket
      .add(P.box(0.5, 0.05, 0.44), 0xfff1d6, { y: 1.11, z: 0.04 })
      .add(P.box(0.42, 0.08, 0.38), 0x7a4a26, { y: 1.15, z: 0.04 })                            // saddle
      .add(P.cyl(0.04, 0.05, 0.12, 6), 0x5e3a1e, { y: 1.22, z: 0.2 });
    const head = new GB()
      .add(P.cyl(0.16, 0.2, 0.28, 8), coat, { y: 0.02, z: 0.06, rx: 0.9 })                      // neck
      .add(P.box(0.3, 0.3, 0.36), coat, { y: 0.12, z: 0.28 })
      .add(P.box(0.16, 0.16, 0.06), spot, { x: 0.08, y: 0.18, z: 0.45 })                       // patch round one eye
      .add(P.box(0.32, 0.17, 0.16), pink, { y: 0.0, z: 0.47 })                                  // muzzle
      .add(P.sph(0.025, 5, 4), ink, { x: -0.06, y: 0.02, z: 0.555 })
      .add(P.sph(0.025, 5, 4), ink, { x: 0.06, y: 0.02, z: 0.555 })
      .add(P.sph(0.035, 6, 4), ink, { x: -0.09, y: 0.19, z: 0.465 })                           // eyes
      .add(P.sph(0.035, 6, 4), ink, { x: 0.09, y: 0.19, z: 0.465 })
      .add(P.cone(0.04, 0.16, 6), horn, { x: -0.13, y: 0.33, z: 0.2, rz: 0.7 })                 // horns
      .add(P.cone(0.04, 0.16, 6), horn, { x: 0.13, y: 0.33, z: 0.2, rz: -0.7 })
      .add(P.box(0.14, 0.05, 0.08), coat, { x: -0.22, y: 0.2, z: 0.2, rz: 0.25 })               // ears
      .add(P.box(0.14, 0.05, 0.08), coat, { x: 0.22, y: 0.2, z: 0.2, rz: -0.25 })
      .add(P.box(0.06, 0.04, 0.06), pink, { x: -0.27, y: 0.21, z: 0.21 })
      .add(P.box(0.06, 0.04, 0.06), pink, { x: 0.27, y: 0.21, z: 0.21 })
      .add(P.tor(0.17, 0.03, 5, 14), 0xc8402f, { y: -0.08, z: 0.06, rx: Math.PI / 2 + 0.9 })   // collar and bell
      .add(P.sph(0.07, 8, 6), PAL.gold, { y: -0.24, z: 0.18 })
      .add(P.cyl(0.02, 0.02, 0.03, 5), PAL.goldDark, { y: -0.3, z: 0.18 });
    const leg = new GB()
      .add(P.cyl(0.085, 0.07, 0.44, 7), coat, { y: -0.22 })
      .add(P.cyl(0.075, 0.085, 0.1, 7), hoof, { y: -0.49 })
      .build();
    const tail = new GB()
      .add(P.cyl(0.025, 0.03, 0.5, 5), coat, { y: -0.24, z: -0.06, rx: -0.25 })
      .add(P.sph(0.07, 7, 5), spot, { y: -0.5, z: -0.12, sy: 1.4 })
      .build();
    return { body: body.build(), head: head.build(), headPivot: [0, 0.94, 0.56], leg, legs: [[-0.19, 0.54, 0.36], [0.19, 0.54, 0.36], [-0.19, 0.54, -0.38], [0.19, 0.54, -0.38]], tail, tailPivot: [0, 0.98, -0.6], seat: 1.19 };
  }
  // the horse: chestnut with a dark mane, a white blaze and a blue saddle cloth
  const coat = 0x9a6236, dark = 0x4a2a18, muzzle = 0xc89a72, hoof = 0x2e2420;
  const body = new GB()
    .add(P.sph(1, 14, 10), coat, { y: 0.8, sx: 0.3, sy: 0.3, sz: 0.62 })
    .add(P.sph(0.28, 10, 8), coat, { y: 0.82, z: 0.42 })
    .add(P.sph(0.3, 10, 8), coat, { y: 0.84, z: -0.42 })
    .add(P.box(0.6, 0.04, 0.62), 0x2f6fb8, { y: 1.07, z: 0.02 })                               // saddle cloth with a gold edge
    .add(P.box(0.64, 0.03, 0.66), PAL.gold, { y: 1.055, z: 0.02 })
    .add(P.box(0.44, 0.09, 0.46), 0x7a3a22, { y: 1.12, z: 0.02 })                              // saddle
    .add(P.box(0.4, 0.06, 0.12), 0x5e2a16, { y: 1.18, z: -0.18 })
    .add(P.cyl(0.04, 0.05, 0.14, 6), 0x5e2a16, { y: 1.22, z: 0.22 })                           // horn
    .add(P.box(0.03, 0.34, 0.03), 0x3a2416, { x: -0.31, y: 0.92, z: 0.02 })                    // stirrups
    .add(P.box(0.03, 0.34, 0.03), 0x3a2416, { x: 0.31, y: 0.92, z: 0.02 })
    .add(P.box(0.08, 0.03, 0.12), PAL.iron, { x: -0.31, y: 0.75, z: 0.02 })
    .add(P.box(0.08, 0.03, 0.12), PAL.iron, { x: 0.31, y: 0.75, z: 0.02 });
  const head = new GB()
    .add(P.cyl(0.12, 0.19, 0.62, 8), coat, { y: 0.22, z: 0.1, rx: 0.55 })                     // neck
    .add(P.cap(0.13, 0.3, 4, 8), coat, { y: 0.5, z: 0.36, rx: 1.15 })                          // head
    .add(P.sph(0.13, 8, 6), muzzle, { y: 0.4, z: 0.55, sz: 1.15 })
    .add(P.box(0.05, 0.03, 0.3), 0xfff6e8, { y: 0.56, z: 0.42, rx: 1.15 })                     // blaze
    .add(P.sph(0.025, 5, 4), ink, { x: -0.05, y: 0.42, z: 0.67 })                              // nostrils
    .add(P.sph(0.025, 5, 4), ink, { x: 0.05, y: 0.42, z: 0.67 })
    .add(P.sph(0.035, 6, 4), ink, { x: -0.11, y: 0.58, z: 0.38 })                              // eyes
    .add(P.sph(0.035, 6, 4), ink, { x: 0.11, y: 0.58, z: 0.38 })
    .add(P.cone(0.05, 0.16, 6), coat, { x: -0.07, y: 0.74, z: 0.24, rx: -0.2 })                // ears
    .add(P.cone(0.05, 0.16, 6), coat, { x: 0.07, y: 0.74, z: 0.24, rx: -0.2 })
    .add(P.box(0.27, 0.04, 0.04), 0x3a2416, { y: 0.47, z: 0.48 })                               // bridle
    .add(P.box(0.03, 0.03, 0.42), 0x3a2416, { x: -0.14, y: 0.42, z: 0.24, rx: -0.5 })         // reins
    .add(P.box(0.03, 0.03, 0.42), 0x3a2416, { x: 0.14, y: 0.42, z: 0.24, rx: -0.5 });
  for (let i = 0; i < 6; i++) head.add(P.box(0.06, 0.16, 0.12), dark, { y: 0.06 + i * 0.12, z: -0.06 + i * 0.07, rx: 0.55 });   // mane
  head.add(P.box(0.08, 0.1, 0.1), dark, { y: 0.72, z: 0.33, rx: 0.9 });                         // forelock
  const leg = new GB()
    .add(P.cyl(0.075, 0.058, 0.54, 7), coat, { y: -0.27 })
    .add(P.cyl(0.07, 0.082, 0.1, 7), hoof, { y: -0.56 })
    .build();
  const tail = new GB()
    .add(P.cyl(0.05, 0.11, 0.62, 6), dark, { y: -0.26, z: -0.12, rx: -0.42 })
    .add(P.cone(0.1, 0.22, 6), dark, { y: -0.62, z: -0.27, rx: Math.PI - 0.42 })
    .build();
  return { body: body.build(), head: head.build(), headPivot: [0, 0.98, 0.52], leg, legs: [[-0.16, 0.62, 0.42], [0.16, 0.62, 0.42], [-0.16, 0.62, -0.42], [0.16, 0.62, -0.42]], tail, tailPivot: [0, 0.98, -0.62], seat: 1.17 };
}

// ---------------------------------------------------------------- towers
// Seven crossbow tower levels, following the user's concept sheet:
// 1 wood · 2 reinforced wood · 3 stone twin · 4 steel + magazine ·
// 5 gold triple · 6 blue crystal · 7 purple crystal with gold spikes.
// Each level returns lit geometry (base/head), unlit "glow" geometry for
// crystals and gems, the head height and where the crystal glow sits.
const TP = {
  plank: 0x9c5a31, plankDark: 0x7d4323, plankLight: 0xb36b3a,
  iron: 0x4d525a, ironLight: 0x6c727b, stud: 0xa3aab3,
  top: 0xbfc3c8, topDark: 0x8f949c,
  brick: 0xcfd2d6, brickDark: 0xa9aeb5,
  steel: 0x454a53, plate: 0x5b616a,
  gold: 0xf3b733, goldDark: 0xc78a1b,
  red: 0xcc1f2a, cyan: 0x63eeff, purple: 0xb067ff, violetStone: 0x3d3848,
  limb: 0xe3762a, stock: 0x8e5b33, stockDark: 0x6b4126, bolt: 0xf4f0e3,
};
const TAU = Math.PI * 2;
// place n items around a ring; fn(x, z, ry) with local +Z facing outward
function around(n, r, fn, phase = 0) {
  for (let i = 0; i < n; i++) { const a = phase + (i / n) * TAU; fn(Math.cos(a) * r, Math.sin(a) * r, Math.PI / 2 - a, i); }
}
function stud(b, x, y, z, ry, color = TP.stud, s = 1) {
  b.add(P.cone(0.075 * s, 0.09 * s, 4), color, { x, y, z, rx: Math.PI / 2, ry, order: 'YXZ' });
}
function topDisc(b, r, y, inner = true) {
  b.add(P.cyl(r, r, 0.1, 20), TP.top, { y: y + 0.05 });
  if (inner) b.add(P.cyl(r * 0.74, r * 0.74, 0.11, 20), TP.topDark, { y: y + 0.06 });
}
function goldFrame(b, glow, x, y, z, ry, w, h, gem, gemColor) {
  // gold panel frame with a coloured inset (red enamel or a glowing gem)
  b.add(P.box(w, h, 0.1), TP.gold, { x, y, z, ry });
  const ox = Math.sin(ry) * 0.04, oz = Math.cos(ry) * 0.04;
  if (gem === 'red') b.add(P.box(w * 0.66, h * 0.72, 0.1), TP.red, { x: x + ox, y, z: z + oz, ry });
  else {
    b.add(P.box(w * 0.7, h * 0.76, 0.1), TP.steel, { x: x + ox, y, z: z + oz, ry });
    glow.add(P.oct(0.13, 0), gemColor, { x: x + ox * 2, y, z: z + oz * 2, ry, sy: 1.5, sz: 0.5 });
  }
}

// One crossbow. Tip colour goes to the glow builder for crystal levels.
function crossbow(b, glow, { x = 0, z = 0, s = 1, tip = null, mount = TP.iron, bands = false }) {
  const R = 0.82 * s, a = Math.PI * 0.6, apexZ = z + 0.78 * s;
  b.add(P.box(0.5 * s, 0.26 * s, 0.62 * s), mount, { x, y: -0.2 * s, z: z - 0.05 * s });        // mount
  b.add(P.box(0.28 * s, 0.22 * s, 1.62 * s), TP.stock, { x, z: z + 0.05 * s });                 // stock
  b.add(P.box(0.32 * s, 0.08 * s, 0.5 * s), TP.iron, { x, y: 0.1 * s, z: z - 0.45 * s });       // trigger plate
  b.add(P.tor(R, 0.11 * s, 6, 14, a), TP.limb, { x, z: apexZ - R, rz: -Math.PI / 2 - a / 2, rx: -Math.PI / 2 });
  const tz = apexZ - R + R * Math.cos(a / 2), hw = R * Math.sin(a / 2);
  for (const sx of [-1, 1]) b.add(P.box(0.2 * s, 0.24 * s, 0.22 * s), TP.iron, { x: x + sx * hw, z: tz });
  b.add(P.box(hw * 2, 0.035 * s, 0.035 * s), 0xfdf9ee, { x, y: 0.02 * s, z: tz - 0.02 * s });   // string
  b.add(P.box(0.34 * s, 0.3 * s, 0.3 * s), TP.iron, { x, z: apexZ - 0.05 * s });               // nose block
  b.add(P.box(0.09 * s, 0.09 * s, 1.3 * s), TP.bolt, { x, y: 0.17 * s, z: z + 0.3 * s });       // loaded bolt
  const tipO = { x, y: 0.17 * s, z: z + 1.02 * s, rx: Math.PI / 2 };
  if (tip) glow.add(P.cone(0.12 * s, 0.32 * s, 4), tip, tipO); else b.add(P.cone(0.11 * s, 0.28 * s, 4), TP.iron, tipO);
  if (bands) for (const bz of [0.45, 0.05]) b.add(P.box(0.36 * s, 0.26 * s, 0.1 * s), TP.gold, { x, z: z + bz * s });
}
function magazine(b, glow, x, z, tip, w = 0.72) {
  b.add(P.box(w, 0.42, 0.42), TP.plank, { x, y: 0.02, z });
  b.add(P.box(w + 0.06, 0.08, 0.46), TP.iron, { x, y: 0.2, z });
  const n = Math.round(w / 0.16);
  for (let i = 0; i < n; i++) {
    const bx = x - w / 2 + 0.1 + i * ((w - 0.2) / Math.max(1, n - 1));
    b.add(P.box(0.06, 0.4, 0.06), TP.bolt, { x: bx, y: 0.38, z });
    if (tip) glow.add(P.cone(0.07, 0.18, 4), tip, { x: bx, y: 0.66, z }); else b.add(P.cone(0.06, 0.16, 4), TP.stud, { x: bx, y: 0.65, z });
  }
}

export function towerParts(level) {
  const base = new GB(), head = new GB(), baseGlow = new GB(), headGlow = new GB();
  let headY = 1, crystal = null, glowColor = 0xffffff;
  if (level === 1) {
    // plain wooden drum, small crossbow on a stump
    base.add(P.cyl(0.98, 0.98, 0.46, 14), TP.plankDark, { y: 0.23 });
    around(16, 1.04, (x, z, ry, i) => base.add(P.box(0.38, 0.5, 0.1), i % 2 ? TP.plank : TP.plankLight, { x, z, y: 0.25, ry }));
    base.add(P.cyl(1.08, 1.08, 0.07, 18), TP.iron, { y: 0.42 });
    topDisc(base, 0.92, 0.46, false);
    base.add(P.cyl(0.4, 0.46, 0.34, 10), TP.stockDark, { y: 0.72 });
    headY = 1.05;
    crossbow(head, headGlow, { s: 1.05, mount: TP.stockDark });
  } else if (level === 2) {
    // reinforced wood: iron-plated plank drum, bigger crossbow
    base.add(P.cyl(1.1, 1.12, 0.58, 16), TP.plankDark, { y: 0.29 });
    around(20, 1.15, (x, z, ry, i) => base.add(P.box(0.36, 0.6, 0.11), i % 3 === 0 ? TP.plankLight : TP.plank, { x, z, y: 0.3, ry }));
    around(6, 1.2, (x, z, ry) => { base.add(P.box(0.4, 0.64, 0.1), TP.iron, { x, z, y: 0.31, ry }); stud(base, x * 1.05, 0.31, z * 1.05, ry); }, 0.26);
    topDisc(base, 1.02, 0.58);
    base.add(P.cyl(0.46, 0.52, 0.3, 8), TP.iron, { y: 0.83, flat: true });
    headY = 1.1;
    crossbow(head, headGlow, { s: 1.45 });
  } else if (level === 3) {
    // stone base, twin crossbows
    base.add(P.cyl(1.18, 1.2, 0.64, 16), TP.brickDark, { y: 0.32 });
    for (let row = 0; row < 2; row++) {
      around(14, 1.24, (x, z, ry, i) => base.add(P.box(0.5, 0.28, 0.2), (i + row) % 3 === 0 ? TP.brickDark : TP.brick, { x, z, y: 0.17 + row * 0.31, ry, flat: true }), row * 0.22);
    }
    around(6, 1.31, (x, z, ry) => { base.add(P.box(0.36, 0.7, 0.1), TP.iron, { x, z, y: 0.34, ry }); stud(base, x * 1.05, 0.34, z * 1.05, ry); }, 0.26);
    topDisc(base, 1.1, 0.64);
    base.add(P.cyl(0.62, 0.66, 0.26, 10), TP.iron, { y: 0.86 });
    headY = 1.14;
    crossbow(head, headGlow, { x: -0.5, s: 1.12 });
    crossbow(head, headGlow, { x: 0.5, s: 1.12 });
    head.add(P.box(1.0, 0.12, 0.2), TP.iron, { y: -0.08, z: -0.2 });
  } else if (level === 4) {
    // heavy steel armour and an arrow magazine
    base.add(P.cyl(1.4, 1.44, 0.2, 20), TP.steel, { y: 0.1 });
    base.add(P.cyl(1.3, 1.32, 0.6, 20), TP.steel, { y: 0.32 });
    around(12, 1.37, (x, z, ry) => { base.add(P.box(0.56, 0.44, 0.12), TP.plate, { x, z, y: 0.36, ry, flat: true }); stud(base, x * 1.04, 0.36, z * 1.04, ry, TP.stud, 1.1); });
    base.add(P.cyl(1.16, 1.2, 0.16, 20), TP.steel, { y: 0.68 });
    topDisc(base, 1.04, 0.74);
    base.add(P.box(0.9, 0.24, 0.9), TP.iron, { y: 0.92, flat: true });
    headY = 1.22;
    crossbow(head, headGlow, { s: 1.62, bands: true });
    magazine(head, headGlow, 0.62, -0.5, null, 0.62);
    head.add(P.box(0.24, 0.5, 0.24), TP.gold, { x: -0.1, y: 0.1, z: -0.25 });
  } else {
    // gold-armoured triple crossbow family (5, 6, 7)
    const r = level === 5 ? 1.42 : level === 6 ? 1.48 : 1.56;
    const drum = level === 7 ? TP.violetStone : TP.steel;
    const gem = level === 5 ? 'red' : 'gem';
    const gc = level === 6 ? TP.cyan : TP.purple;
    glowColor = gc;
    base.add(P.cyl(r, r + 0.04, 0.66, 22), drum, { y: 0.33 });
    base.add(P.cyl(r + 0.06, r + 0.06, 0.09, 22), TP.gold, { y: 0.66 });
    base.add(P.cyl(r + 0.06, r + 0.08, 0.09, 22), TP.gold, { y: 0.05 });
    around(6, r + 0.04, (x, z, ry) => goldFrame(base, baseGlow, x, 0.36, z, ry, 0.5, level === 7 ? 0.62 : 0.5, gem, gc));
    around(6, r + 0.04, (x, z, ry) => {
      base.add(P.box(0.16, 0.16, 0.08), TP.gold, { x, z, y: 0.36, ry, rz: Math.PI / 4, order: 'YXZ' });
      if (level !== 5) baseGlow.add(P.box(0.08, 0.08, 0.1), gc, { x: x * 1.01, z: z * 1.01, y: 0.36, ry, rz: Math.PI / 4, order: 'YXZ' });
    }, Math.PI / 6);
    topDisc(base, r - 0.22, 0.7);
    if (level === 5) around(6, r - 0.1, (x, z) => base.add(P.cone(0.1, 0.3, 6), TP.gold, { x, z, y: 0.92 }), Math.PI / 6);
    if (level === 6) around(6, r - 0.1, (x, z) => { base.add(P.box(0.18, 0.12, 0.18), TP.gold, { x, z, y: 0.8 }); baseGlow.add(P.oct(0.1), gc, { x, z, y: 0.95, sy: 1.6 }); }, Math.PI / 6);
    if (level === 7) {
      around(8, r - 0.05, (x, z) => { base.add(P.cyl(0.2, 0.24, 0.14, 8), TP.goldDark, { x, z, y: 0.78 }); base.add(P.cone(0.17, 0.7, 8), TP.gold, { x, z, y: 1.18 }); }, Math.PI / 8);
      baseGlow.add(P.tor(r - 0.32, 0.045, 5, 40), gc, { y: 0.8, rx: Math.PI / 2 });
    }
    base.add(P.box(1.0, 0.22, 0.9), TP.iron, { y: 0.9, flat: true });
    headY = level === 5 ? 1.2 : level === 6 ? 1.24 : 1.3;
    const tip = level === 5 ? null : gc;
    const xs = [-0.7, 0, 0.7];
    for (const x of xs) {
      if (level === 5) head.add(P.box(0.42, 0.14, 0.5), TP.red, { x, y: -0.36, z: -0.05 });
      crossbow(head, headGlow, { x, s: 0.98, tip, mount: level === 5 ? TP.stockDark : TP.iron });
    }
    head.add(P.box(1.7, 0.12, 0.22), TP.gold, { y: -0.12, z: -0.3 });
    if (level === 5) {
      magazine(head, headGlow, 0, -0.78, null, 0.66);
      for (const sx of [-1, 1]) { head.add(P.box(0.18, 0.56, 0.18), TP.gold, { x: sx * 0.62, y: 0.1, z: -0.8 }); head.add(P.cone(0.1, 0.22, 4), TP.gold, { x: sx * 0.62, y: 0.48, z: -0.8 }); }
    } else {
      // crystal shrine behind the crossbows, with racks of glowing bolts
      const cz = -0.86, big = level === 7 ? 1.18 : 1;
      head.add(P.box(0.66 * big, 0.5, 0.46), level === 7 ? TP.violetStone : TP.steel, { y: 0.06, z: cz, flat: true });
      head.add(P.box(0.74 * big, 0.1, 0.54), TP.gold, { y: 0.32, z: cz });
      for (const sx of [-1, 1]) head.add(P.box(0.12, 0.62, 0.5), TP.gold, { x: sx * 0.38 * big, y: 0.22, z: cz });
      headGlow.add(P.oct(0.3 * big, 0), gc, { y: 0.92, z: cz, sy: 2.3 });
      headGlow.add(P.oct(0.13 * big, 0), gc, { x: -0.22 * big, y: 0.56, z: cz + 0.05, sy: 1.8, rz: 0.3 });
      headGlow.add(P.oct(0.13 * big, 0), gc, { x: 0.22 * big, y: 0.56, z: cz + 0.05, sy: 1.8, rz: -0.3 });
      crystal = [0, 0.95, cz];
      magazine(head, headGlow, -0.82, -0.7, gc, 0.42);
      magazine(head, headGlow, 0.82, -0.7, gc, 0.42);
      if (level === 7) for (const sx of [-1, 1]) { head.add(P.box(0.2, 0.3, 0.2), TP.goldDark, { x: sx * 0.62, y: 0.38, z: cz }); head.add(P.cone(0.12, 0.5, 6), TP.gold, { x: sx * 0.62, y: 0.78, z: cz }); }
    }
  }
  return { base: base.build(), head: head.build(), baseGlow: baseGlow.build(), headGlow: headGlow.build(), headY, crystal, glowColor };
}

// ---------------------------------------------------------------- cannons
// Cannon tower levels follow the user's cannon concept sheet. The bases share
// the crossbow family's materials (wood → reinforced wood → stone → steel →
// gold/red → gold/cyan → gold/purple); the heads carry cannon barrels tilted
// up a little. +Z is forward.
const PITCH = 0.22;
// Barrels are built level (pitch 0) around the trunnion so the view can
// raise them toward each target; PITCH is their resting elevation.
function barrel(b, glow, o) {
  const { x = 0, y = 0, z = 0, r, len, body = TP.iron, band = TP.ironLight, rim = TP.ironLight, bands = 2, bore = null, rivets = false, pitch = 0 } = o;
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const at = (d) => ({ x, y: y + d * sp, z: z + d * cp });
  const rx = Math.PI / 2 - pitch;
  const back = -0.32 * len, front = 0.68 * len;
  b.add(P.cyl(r, r * 1.08, len, 8), body, { ...at((back + front) / 2), rx, flat: true });            // octagonal tube
  b.add(P.sph(r * 1.04, 8, 6), body, { ...at(back), rx, sy: 0.6, flat: true });                      // breech
  b.add(P.sph(r * 0.32, 6, 4), body, { ...at(back - r * 0.62), rx });                               // cascabel knob
  for (let i = 0; i < bands; i++) b.add(P.cyl(r * 1.15, r * 1.15, len * 0.09, 8), band, { ...at(back + len * (0.16 + i * 0.26)), rx, flat: true });
  b.add(P.cyl(r * 1.32, r * 1.22, len * 0.15, 10), rim, { ...at(front - len * 0.06), rx, flat: true }); // muzzle rim
  if (rivets) for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const p = at(front - len * 0.06);
    b.add(P.box(0.07, 0.07, 0.07), TP.stud, { x: p.x + Math.cos(a) * r * 1.33, y: p.y + Math.sin(a) * r * 1.33 * cp, z: p.z - Math.sin(a) * r * 1.33 * sp });
  }
  const boreO = { ...at(front + 0.01), rx };
  if (bore) {
    glow.add(P.cyl(r * 0.82, r * 0.82, 0.06, 12), bore, boreO);
    glow.add(P.tor(r * 0.95, r * 0.08, 4, 16), bore, { ...at(front), rx: rx + Math.PI / 2 });
  } else b.add(P.cyl(r * 0.74, r * 0.74, 0.06, 12), 0x141416, boreO);
  return at(front + 0.05);
}
function carriage(b, { x = 0, w, h, d, wood = TP.plank, plate = TP.iron, red = false }) {
  for (const sx of [-1, 1]) {
    b.add(P.box(0.14, h, d), wood, { x: x + sx * w / 2, y: -h / 2 + 0.08, z: -0.05, flat: true });     // cheek
    b.add(P.box(0.15, h * 0.38, d * 0.42), plate, { x: x + sx * (w / 2 + 0.01), y: -0.02, z: 0.02 });  // iron bracket
    stud(b, x + sx * (w / 2 + 0.09), -0.02, 0.02, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  b.add(P.box(w + 0.14, 0.14, d), red ? TP.red : wood, { x, y: -h + 0.1, z: -0.05 });                // bed
  b.add(P.cyl(0.06, 0.06, w + 0.32, 6), plate, { x, rz: Math.PI / 2 });                              // trunnion
}
// Shared base styles (level 1-7) used by the cannon line.
function cannonBase(level, base, baseGlow, opt = {}) {
  if (level === 1) {
    base.add(P.cyl(0.98, 0.98, 0.46, 14), TP.plankDark, { y: 0.23 });
    around(16, 1.04, (x, z, ry, i) => base.add(P.box(0.38, 0.5, 0.1), i % 2 ? TP.plank : TP.plankLight, { x, z, y: 0.25, ry }));
    base.add(P.cyl(1.08, 1.08, 0.07, 18), TP.iron, { y: 0.42 });
    topDisc(base, 0.92, 0.46, false);
    return 0.5;
  }
  if (level === 2) {
    base.add(P.cyl(1.1, 1.12, 0.58, 16), TP.plankDark, { y: 0.29 });
    around(20, 1.15, (x, z, ry, i) => base.add(P.box(0.36, 0.6, 0.11), i % 3 === 0 ? TP.plankLight : TP.plank, { x, z, y: 0.3, ry }));
    around(6, 1.2, (x, z, ry) => { base.add(P.box(0.4, 0.64, 0.1), TP.iron, { x, z, y: 0.31, ry }); stud(base, x * 1.05, 0.31, z * 1.05, ry); }, 0.26);
    topDisc(base, 1.02, 0.58);
    return 0.62;
  }
  if (level === 3) {
    base.add(P.cyl(1.18, 1.2, 0.64, 16), TP.brickDark, { y: 0.32 });
    for (let row = 0; row < 2; row++) around(14, 1.24, (x, z, ry, i) => base.add(P.box(0.5, 0.28, 0.2), (i + row) % 3 === 0 ? TP.brickDark : TP.brick, { x, z, y: 0.17 + row * 0.31, ry, flat: true }), row * 0.22);
    around(6, 1.31, (x, z, ry) => { base.add(P.box(0.36, 0.7, 0.1), TP.iron, { x, z, y: 0.34, ry }); stud(base, x * 1.05, 0.34, z * 1.05, ry); }, 0.26);
    topDisc(base, 1.1, 0.64);
    return 0.68;
  }
  if (level === 4) {
    base.add(P.cyl(1.42, 1.46, 0.2, 20), TP.steel, { y: 0.1 });
    base.add(P.cyl(1.32, 1.34, 0.6, 20), TP.steel, { y: 0.32 });
    around(12, 1.39, (x, z, ry) => { base.add(P.box(0.58, 0.46, 0.12), TP.plate, { x, z, y: 0.36, ry, flat: true }); stud(base, x * 1.04, 0.36, z * 1.04, ry, TP.stud, 1.15); });
    base.add(P.cyl(1.18, 1.22, 0.16, 20), TP.steel, { y: 0.68 });
    topDisc(base, 1.06, 0.74);
    return 0.78;
  }
  const r = level === 5 ? 1.44 : level === 6 ? 1.5 : 1.6;
  const drum = opt.drum ?? (level === 7 ? TP.violetStone : TP.steel);
  const gc = opt.glow ?? (level === 6 ? TP.cyan : TP.purple);
  base.add(P.cyl(r, r + 0.04, 0.66, 22), drum, { y: 0.33 });
  base.add(P.cyl(r + 0.06, r + 0.06, 0.09, 22), TP.gold, { y: 0.66 });
  base.add(P.cyl(r + 0.06, r + 0.08, 0.09, 22), TP.gold, { y: 0.05 });
  around(6, r + 0.04, (x, z, ry) => goldFrame(base, baseGlow, x, 0.36, z, ry, 0.5, level === 7 ? 0.64 : 0.52, level === 5 ? 'red' : 'gem', gc));
  around(6, r + 0.04, (x, z, ry) => {
    base.add(P.box(0.16, 0.16, 0.08), TP.gold, { x, z, y: 0.36, ry, rz: Math.PI / 4, order: 'YXZ' });
    if (level !== 5) baseGlow.add(P.box(0.08, 0.08, 0.1), gc, { x: x * 1.01, z: z * 1.01, y: 0.36, ry, rz: Math.PI / 4, order: 'YXZ' });
  }, Math.PI / 6);
  topDisc(base, r - 0.22, 0.7);
  if (level === 5) around(6, r - 0.1, (x, z) => base.add(P.cone(0.1, 0.3, 6), TP.gold, { x, z, y: 0.92 }), Math.PI / 6);
  if (level === 6) around(6, r - 0.1, (x, z) => { base.add(P.box(0.18, 0.12, 0.18), TP.gold, { x, z, y: 0.8 }); baseGlow.add(P.oct(0.1), gc, { x, z, y: 0.95, sy: 1.6 }); }, Math.PI / 6);
  if (level === 7) {
    around(8, r - 0.05, (x, z) => { base.add(P.cyl(0.2, 0.24, 0.14, 8), TP.goldDark, { x, z, y: 0.78 }); base.add(P.cone(0.17, 0.72, 8), TP.gold, { x, z, y: 1.2 }); }, Math.PI / 8);
    baseGlow.add(P.tor(r - 0.32, 0.045, 5, 40), gc, { y: 0.8, rx: Math.PI / 2 });
  }
  return 0.76;
}

export const CANNON_REST_PITCH = PITCH;

// A rack of launch tubes for the Rapid Launcher path, built level around the trunnion.
const FIRE = 0xff8a2a;
function tubeRack(gun, gunGlow, { cols, rows, r, len, sp, x0 = 0, y0 = 0, body = TP.iron, rim = TP.ironLight, glow = null, rockets = false }) {
  const back = -0.3 * len, front = 0.7 * len;
  gun.add(P.box(cols * sp - 0.06, rows * sp * 0.95 - 0.06, len * 0.3), TP.plate, { x: x0, y: y0, z: back + len * 0.12, flat: true });   // breech block
  for (let c = 0; c < cols; c++) for (let w = 0; w < rows; w++) {
    const x = x0 + (c - (cols - 1) / 2) * sp, y = y0 + (w - (rows - 1) / 2) * sp * 0.95;
    gun.add(P.cyl(r, r, len, 8), body, { x, y, z: (back + front) / 2, rx: Math.PI / 2, flat: true });
    gun.add(P.cyl(r * 1.2, r * 1.2, len * 0.12, 8), rim, { x, y, z: front - len * 0.06, rx: Math.PI / 2, flat: true });
    if (rockets) gun.add(P.cone(r * 0.75, r * 1.6, 8), TP.red, { x, y, z: front + r * 0.4, rx: Math.PI / 2 });           // rocket noses
    else gun.add(P.cyl(r * 0.72, r * 0.72, 0.05, 10), 0x141416, { x, y, z: front + 0.01, rx: Math.PI / 2 });
    if (glow) gunGlow.add(P.tor(r * 1.05, r * 0.12, 4, 12), glow, { x, y, z: front + 0.01 });
  }
  // two thin bands hold the tubes together (the tube tops stay visible from above)
  for (const k of [0.15, 0.55]) gun.add(P.box(cols * sp + 0.06, rows * sp * 0.95 + 0.06, 0.07), rim, { x: x0, y: y0, z: back + len * k });
}
// Rapid Launcher path, levels 4-7
function rapidParts(level) {
  const base = new GB(), head = new GB(), baseGlow = new GB(), headGlow = new GB(), gun = new GB(), gunGlow = new GB();
  const top = cannonBase(level, base, baseGlow, level >= 6 ? { glow: FIRE, drum: level === 7 ? 0x3a3236 : TP.steel } : {});
  const headY = [0, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.28][level];
  base.add(P.cyl(0.62, 0.7, headY - top - 0.25, 12), TP.steel, { y: top + (headY - top - 0.25) / 2, flat: true });
  // turning mount with two arms holding the rack
  const mount = level >= 6 ? 0x3a3236 : TP.steel;
  head.add(P.box(1.0, 0.3, 1.0), mount, { y: -0.33, flat: true });
  for (const sx of [-1, 1]) {
    head.add(P.box(0.12, 0.62, 0.52), level === 5 ? TP.red : TP.plate, { x: sx * (level === 7 ? 0.78 : 0.62), y: -0.08, z: -0.05, flat: true });
    stud(head, sx * (level === 7 ? 0.85 : 0.69), -0.02, -0.05, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  head.add(P.cyl(0.06, 0.06, level === 7 ? 1.7 : 1.4, 6), TP.plate, { rz: Math.PI / 2 });
  if (level === 4) {
    tubeRack(gun, gunGlow, { cols: 2, rows: 2, r: 0.17, len: 1.25, sp: 0.42 });
    head.add(P.box(0.55, 0.32, 0.42), TP.plankDark, { y: -0.04, z: -0.72, flat: true });                    // ammo crate
    head.add(P.box(0.57, 0.08, 0.44), TP.gold, { y: 0.0, z: -0.72 });
  } else if (level === 5) {
    tubeRack(gun, gunGlow, { cols: 3, rows: 2, r: 0.16, len: 1.3, sp: 0.38, body: TP.steel, rim: TP.gold });
    head.add(P.cyl(0.26, 0.26, 0.5, 10), TP.red, { x: -0.62, y: -0.12, z: -0.62, rz: Math.PI / 2 });          // shell drum
    head.add(P.cyl(0.28, 0.28, 0.06, 10), TP.gold, { x: -0.62, y: -0.12, z: -0.62, rz: Math.PI / 2 });
  } else if (level === 6) {
    tubeRack(gun, gunGlow, { cols: 3, rows: 2, r: 0.17, len: 1.35, sp: 0.4, body: 0x3a3236, rim: TP.gold, glow: FIRE });
    for (const sx of [-1, 1]) {
      head.add(P.cap(0.17, 0.42, 3, 8), TP.red, { x: sx * 0.32, y: 0.0, z: -0.78, rx: Math.PI / 2 });         // fuel tanks
      head.add(P.cyl(0.18, 0.18, 0.06, 8), TP.gold, { x: sx * 0.32, y: 0.0, z: -0.78, rx: Math.PI / 2 });
      headGlow.add(P.oct(0.08, 0), FIRE, { x: sx * 0.32, y: 0.24, z: -0.78, sy: 1.6 });
    }
  } else {
    // Rocket Barrage: a 3x3 pod with red rocket noses, and a small pod on each side
    tubeRack(gun, gunGlow, { cols: 3, rows: 3, r: 0.15, len: 1.25, sp: 0.35, body: 0x3a3236, rim: TP.gold, glow: FIRE, rockets: true });
    for (const sx of [-1, 1]) tubeRack(gun, gunGlow, { cols: 1, rows: 2, r: 0.13, len: 0.95, sp: 0.3, x0: sx * 0.95, y0: -0.05, body: 0x3a3236, rim: TP.gold, glow: FIRE, rockets: true });
    head.add(P.box(0.7, 0.4, 0.5), 0x3a3236, { y: -0.02, z: -0.82, flat: true });
    head.add(P.box(0.74, 0.08, 0.54), TP.gold, { y: 0.2, z: -0.82 });
    headGlow.add(P.oct(0.12, 0), FIRE, { y: 0.42, z: -0.82, sy: 1.8 });
  }
  return { base: base.build(), head: head.build(), baseGlow: baseGlow.build(), headGlow: headGlow.build(), gun: gun.build(), gunGlow: gunGlow.build(), headY, crystal: null, glowColor: FIRE, muzzle: null };
}

// path: from level 4 the cannon is either a Rapid Launcher ('rapid') or a Thunder Mortar ('blast')
export function cannonParts(level, path = 'blast') {
  if (path === 'rapid' && level >= 4) return rapidParts(level);
  const base = new GB(), head = new GB(), baseGlow = new GB(), headGlow = new GB();
  const gun = new GB(), gunGlow = new GB();   // barrels: elevate separately from the carriage
  const top = cannonBase(level, base, baseGlow);
  const headY = [0, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.28][level];
  // turntable between base and head
  base.add(P.cyl(0.62, 0.7, headY - top - 0.25, 12), level >= 4 ? TP.steel : TP.iron, { y: top + (headY - top - 0.25) / 2, flat: true });
  let crystal = null, glowColor = 0xffffff, muzzle = null;
  if (level === 1) {
    carriage(head, { w: 0.62, h: 0.46, d: 0.9 });
    barrel(gun, gunGlow, { r: 0.26, len: 1.15, bands: 1 });
  } else if (level === 2) {
    carriage(head, { w: 0.78, h: 0.52, d: 1.05 });
    barrel(gun, gunGlow, { r: 0.35, len: 1.5, bands: 2, band: TP.stud, rim: TP.stud });
  } else if (level === 3) {
    for (const x of [-0.4, 0.4]) carriage(head, { x, w: 0.56, h: 0.5, d: 1.0 });
    for (const x of [-0.4, 0.4]) barrel(gun, gunGlow, { x, r: 0.3, len: 1.38, bands: 2, band: TP.stud, rim: TP.stud });
  } else if (level === 4) {
    carriage(head, { w: 1.0, h: 0.6, d: 1.25, wood: TP.plankDark });
    barrel(gun, gunGlow, { r: 0.5, len: 1.6, bands: 2, band: TP.stud, rim: TP.ironLight, rivets: true });
  } else if (level === 5) {
    for (const x of [-0.64, 0, 0.64]) {
      carriage(head, { x, w: 0.46, h: 0.46, d: 0.95, wood: TP.plankDark, red: true });
      barrel(gun, gunGlow, { x, r: 0.26, len: 1.3, bands: 2, band: TP.gold, rim: TP.gold });
    }
    for (const sx of [-1, 1]) { head.add(P.box(0.18, 0.62, 0.18), TP.gold, { x: sx * 0.95, y: 0.05, z: -0.6 }); head.add(P.cone(0.1, 0.24, 4), TP.gold, { x: sx * 0.95, y: 0.48, z: -0.6 }); }
  } else if (level === 6) {
    glowColor = TP.cyan;
    for (const x of [-0.5, 0.5]) {
      carriage(head, { x, w: 0.64, h: 0.56, d: 1.1, wood: TP.steel, plate: TP.gold });
      barrel(gun, gunGlow, { x, r: 0.38, len: 1.42, bands: 2, body: TP.steel, band: TP.gold, rim: TP.gold, bore: TP.cyan });
    }
    const cz = -0.95;
    head.add(P.box(0.62, 0.5, 0.44), TP.steel, { y: 0.06, z: cz, flat: true });
    head.add(P.box(0.7, 0.1, 0.52), TP.gold, { y: 0.32, z: cz });
    headGlow.add(P.oct(0.28, 0), TP.cyan, { y: 0.9, z: cz, sy: 2.3 });
    for (const sx of [-1, 1]) {
      headGlow.add(P.oct(0.12, 0), TP.cyan, { x: sx * 0.24, y: 0.55, z: cz + 0.05, sy: 1.8, rz: -sx * 0.3 });
      head.add(P.box(0.2, 0.3, 0.2), TP.gold, { x: sx * 0.95, y: 0.0, z: -0.55 });
      headGlow.add(P.oct(0.1, 0), TP.cyan, { x: sx * 0.95, y: 0.3, z: -0.55, sy: 1.7 });
    }
    crystal = [0, 0.95, cz];
  } else {
    glowColor = TP.purple;
    const purple = 0x5c2f8f;
    carriage(head, { w: 1.2, h: 0.64, d: 1.4, wood: TP.violetStone, plate: TP.gold });
    muzzle = barrel(gun, gunGlow, { r: 0.6, len: 1.85, bands: 2, body: purple, band: TP.gold, rim: TP.gold, bore: TP.purple });
    for (const sx of [-1, 1]) {
      carriage(head, { x: sx * 1.02, w: 0.36, h: 0.4, d: 0.75, wood: TP.violetStone, plate: TP.gold });
      barrel(gun, gunGlow, { x: sx * 1.02, y: -0.05, r: 0.22, len: 0.95, bands: 1, body: purple, band: TP.gold, rim: TP.gold, bore: TP.purple });
    }
    const cz = -1.05;
    head.add(P.box(0.72, 0.56, 0.5), TP.violetStone, { y: 0.1, z: cz, flat: true });
    head.add(P.box(0.8, 0.1, 0.58), TP.gold, { y: 0.4, z: cz });
    headGlow.add(P.oct(0.34, 0), TP.purple, { y: 1.08, z: cz, sy: 2.3 });
    for (const sx of [-1, 1]) {
      headGlow.add(P.oct(0.14, 0), TP.purple, { x: sx * 0.28, y: 0.68, z: cz + 0.05, sy: 1.8, rz: -sx * 0.3 });
      head.add(P.box(0.22, 0.3, 0.22), TP.goldDark, { x: sx * 0.62, y: 0.42, z: cz });
      head.add(P.cone(0.13, 0.55, 6), TP.gold, { x: sx * 0.62, y: 0.84, z: cz });
    }
    crystal = [0, 1.1, cz];
  }
  return { base: base.build(), head: head.build(), baseGlow: baseGlow.build(), headGlow: headGlow.build(), gun: gun.build(), gunGlow: gunGlow.build(), headY, crystal, glowColor, muzzle: muzzle ? [muzzle.x, muzzle.y, muzzle.z] : null };
}

// ---------------------------------------------------------------- fortress
function flag(b, x, y, z, color, h = 2.2) {
  b.add(P.cyl(0.05, 0.05, h, 5), PAL.woodDark, { x, y: y + h / 2, z });
  b.add(P.box(0.04, 0.55, 0.95), color, { x, y: y + h - 0.32, z: z + 0.5 });
  b.add(P.cyl(0.14, 0.14, 0.05, 10), PAL.orange, { x: x + 0.03, y: y + h - 0.32, z: z + 0.5, rz: Math.PI / 2 }); // sun emblem
}

export function fortressGeometry(level) {
  const b = new GB();
  if (level === 1) {
    // adobe-and-timber trading keep on a stone footing
    b.add(P.box(6.2, 0.6, 5.2), PAL.stoneDark, { y: 0.3, flat: true });
    b.add(P.box(5.6, 2.4, 4.6), 0xd9a066, { y: 1.8, flat: true, shadeY: [0.85, 1.05] });          // adobe
    b.add(P.box(1.4, 1.7, 0.2), PAL.woodDark, { y: 1.45, z: 2.35 });                               // gate
    b.add(P.box(1.6, 0.2, 0.3), PAL.wood, { y: 2.35, z: 2.38 });
    for (const x of [-2.9, 2.9]) for (const z of [-2.4, 2.4]) b.add(P.box(0.35, 5.2, 0.35), PAL.woodDark, { x, y: 2.6, z });
    b.add(P.box(6.0, 1.9, 4.9), PAL.plank, { y: 4.0, flat: true, shadeY: [0.85, 1.05] });          // timber floor
    for (let i = -2; i <= 2; i++) b.add(P.box(0.1, 1.9, 0.08), PAL.woodDark, { x: i * 1.2, y: 4.0, z: 2.47 });
    b.add(P.box(0.8, 0.7, 0.1), PAL.ink, { x: -1.6, y: 4.1, z: 2.5 });
    b.add(P.box(0.8, 0.7, 0.1), PAL.ink, { x: 1.6, y: 4.1, z: 2.5 });
    b.add(P.roof(6.9, 2.3, 5.6), PAL.woodDark, { y: 4.95, ry: 0, flat: true });
    clock(b, 0, 5.85, 2.84, 0.5);                                                                    // town clock
    // little belfry on the ridge with the town bell
    b.add(P.box(1.0, 0.1, 1.0), PAL.wood, { y: 7.15 });
    for (const bx of [-0.4, 0.4]) for (const bz of [-0.4, 0.4]) b.add(P.box(0.1, 0.95, 0.1), PAL.woodDark, { x: bx, y: 7.65, z: bz });
    b.add(P.cyl(0.09, 0.3, 0.42, 8), PAL.gold, { y: 7.55 });
    b.add(P.cone(0.8, 0.72, 4), 0xc8402f, { y: 8.45, ry: Math.PI / 4, flat: true });
    b.add(P.box(1.0, 0.25, 2.0), PAL.wood, { x: 3.4, y: 1.5, z: 1.6, rx: 0.5 });                     // stairs
    b.add(P.box(1.6, 0.25, 1.6), PAL.wood, { x: 3.4, y: 3.1, z: 0.4 });
    b.add(P.box(0.6, 1.5, 0.6), PAL.stoneDark, { x: -1.8, y: 6.6, z: -1, flat: true });             // chimney
    flag(b, 1.5, 6.0, -0.5, PAL.teal, 2.6);
  } else if (level === 2) {
    // stone keep with teal roofs, a side tower and a proper gatehouse
    b.add(P.box(7.0, 0.7, 6.0), PAL.stoneDark, { y: 0.35, flat: true });
    b.add(P.box(6.4, 4.0, 5.2), PAL.stone, { y: 2.6, flat: true, shadeY: [0.8, 1.05] });
    b.add(P.box(6.6, 0.3, 5.4), PAL.stoneLight, { y: 4.7 });
    for (let i = 0; i < 6; i++) { b.add(P.box(0.55, 0.55, 0.4), PAL.stoneLight, { x: -2.9 + i * 1.16, y: 5.1, z: 2.55 }); }
    b.add(P.box(1.8, 2.4, 0.3), PAL.ink, { y: 1.8, z: 2.62 });
    b.add(P.cyl(0.9, 0.9, 0.3, 12, 1, false, 0, Math.PI), PAL.stoneLight, { y: 3.0, z: 2.62, rx: Math.PI / 2, rz: Math.PI / 2 });
    b.add(P.box(5.2, 2.2, 4.2), PAL.stoneLight, { y: 6.0, flat: true });
    b.add(P.cone(4.0, 2.8, 4), PAL.roofTeal, { y: 8.5, ry: Math.PI / 4, sx: 1.05, flat: true });
    b.add(P.cyl(1.25, 1.35, 7.5, 10), PAL.stone, { x: -3.6, y: 3.75, z: 1.6, flat: true, shadeY: [0.8, 1.05] });
    b.add(P.cone(1.65, 2.4, 10), PAL.roofTeal, { x: -3.6, y: 8.7, z: 1.6, flat: true });
    for (const x of [-1.5, 1.5]) b.add(P.box(0.6, 0.9, 0.1), 0x3a3550, { x, y: 6.1, z: 2.12 });
    clock(b, 0, 6.15, 2.14, 0.62);                                                                    // town clock
    b.add(P.box(0.8, 0.8, 0.2), PAL.gold, { y: 4.0, z: 2.75, rz: 0.785 });
    flag(b, 0, 9.6, 0, PAL.teal, 2.4);
    flag(b, -3.6, 9.8, 1.6, PAL.orange, 1.8);
  } else {
    // grand citadel: twin towers, gold trims, banners
    b.add(P.box(8.0, 0.8, 6.8), PAL.stoneDark, { y: 0.4, flat: true });
    b.add(P.box(7.2, 4.8, 5.8), PAL.stoneLight, { y: 3.2, flat: true, shadeY: [0.8, 1.05] });
    b.add(P.box(7.5, 0.35, 6.1), PAL.gold, { y: 5.7 });
    for (let i = 0; i < 7; i++) b.add(P.box(0.55, 0.6, 0.45), PAL.stoneLight, { x: -3.3 + i * 1.1, y: 6.15, z: 2.9 });
    b.add(P.box(2.0, 2.8, 0.3), PAL.ink, { y: 2.0, z: 2.95 });
    b.add(P.box(2.4, 0.35, 0.4), PAL.gold, { y: 3.55, z: 3.0 });
    b.add(P.box(5.6, 2.6, 4.6), PAL.stone, { y: 7.2, flat: true });
    clock(b, 0, 7.3, 2.34, 0.85);                                                                     // town clock
    b.add(P.cone(4.3, 3.2, 4), PAL.roofTeal, { y: 10.1, ry: Math.PI / 4, flat: true });
    b.add(P.cone(0.3, 0.8, 6), PAL.gold, { y: 12.0 });
    for (const x of [-4.1, 4.1]) {
      b.add(P.cyl(1.35, 1.5, 9.0, 12), PAL.stone, { x, y: 4.5, z: 1.9, flat: true, shadeY: [0.8, 1.05] });
      b.add(P.cyl(1.55, 1.55, 0.3, 12), PAL.gold, { x, y: 8.9, z: 1.9 });
      b.add(P.cone(1.8, 2.8, 12), PAL.roofTeal, { x, y: 10.5, z: 1.9, flat: true });
      b.add(P.box(0.5, 0.9, 0.1), 0x3a3550, { x, y: 6.5, z: 3.35 });
      b.add(P.box(0.9, 2.2, 0.06), PAL.teal, { x, y: 4.2, z: 3.42 });
      b.add(P.cyl(0.2, 0.2, 0.05, 10), PAL.orange, { x, y: 4.6, z: 3.47, rx: Math.PI / 2 });
    }
    b.add(P.box(1.0, 1.0, 0.2), PAL.gold, { y: 4.6, z: 3.05, rz: 0.785 });
    flag(b, 0, 12.3, 0, PAL.teal, 2.2);
    flag(b, -4.1, 11.8, 1.9, PAL.orange, 1.6);
    flag(b, 4.1, 11.8, 1.9, PAL.orange, 1.6);
  }
  return b.build();
}

// Town clock: a white face with a gold rim and two hands, facing +z.
function clock(b, x, y, z, r) {
  b.add(P.cyl(r, r, 0.08, 16), 0xfaf3e0, { x, y, z, rx: Math.PI / 2 });
  b.add(P.tor(r, r * 0.13, 4, 16), PAL.gold, { x, y, z: z + 0.04 });
  b.add(P.box(r * 0.12, r * 0.72, 0.04), PAL.ink, { x, y: y + r * 0.3, z: z + 0.07 });          // minute hand
  b.add(P.box(r * 0.5, r * 0.14, 0.04), PAL.ink, { x: x + r * 0.22, y, z: z + 0.07 });          // hour hand
  b.add(P.sph(r * 0.11, 6, 4), PAL.gold, { x, y, z: z + 0.09 });
}

// Window panes of the town hall that light up at night (its own frame).
export function hallGlow(level) {
  const g = new GB();
  if (level === 1) for (const x of [-1.6, 1.6]) g.add(P.box(0.7, 0.6, 0.04), 0xffffff, { x, y: 4.1, z: 2.57 });
  else if (level === 2) for (const x of [-1.5, 1.5]) g.add(P.box(0.5, 0.8, 0.04), 0xffffff, { x, y: 6.1, z: 2.19 });
  else for (const x of [-4.1, 4.1]) g.add(P.box(0.42, 0.8, 0.04), 0xffffff, { x, y: 6.5, z: 3.42 });
  return g.build();
}

// ---------------------------------------------------------------- houses
// Cottages round the town hall; they grow with it. style: wall and roof colours.
// Returns the house, its window panes (lit at night) and the chimney top.
const HOUSE_STYLES = [
  { wall: 0xf1dcb0, roof: 0xc8402f, trim: 0x8a4a26 },
  { wall: 0xe0b77e, roof: PAL.roofTeal, trim: 0x6e4527 },
  { wall: 0xc9dbe0, roof: 0x7a4a2e, trim: 0x5a3a24 },
  { wall: 0xf7f2e6, roof: 0xd8742f, trim: 0x7a4a26 },
];
export function houseParts(level, style = 0) {
  const S = HOUSE_STYLES[style % HOUSE_STYLES.length];
  const b = new GB(), glow = new GB();
  // a window on a wall: (x, y, z) is the wall surface, ry turns it to face that wall
  const win = (x, y, z, ry = 0, w = 0.42, h = 0.46) => {
    const ox = Math.sin(ry), oz = Math.cos(ry);
    b.add(P.box(w + 0.14, h + 0.14, 0.06), PAL.white, { x, y, z, ry });
    b.add(P.box(w, h, 0.05), 0x3a3550, { x: x + ox * 0.02, y, z: z + oz * 0.02, ry });
    b.add(P.box(0.04, h, 0.03), PAL.white, { x: x + ox * 0.05, y, z: z + oz * 0.05, ry });
    glow.add(P.box(w * 0.92, h * 0.92, 0.02), 0xffffff, { x: x + ox * 0.045, y, z: z + oz * 0.045, ry });
  };
  let chimney;
  if (level === 1) {
    // humble wooden cottage with a straw roof
    b.add(P.box(2.6, 0.2, 2.2), PAL.stoneDark, { y: 0.1, flat: true });
    b.add(P.box(2.4, 1.45, 2.0), PAL.plank, { y: 0.92, flat: true, shadeY: [0.8, 1.05] });
    for (const x of [-1.17, 1.17]) for (const z of [-0.97, 0.97]) b.add(P.box(0.14, 1.5, 0.14), PAL.woodDark, { x, y: 0.95, z });
    b.add(P.roof(2.95, 1.15, 2.45), 0xd9b45a, { y: 1.62, flat: true });
    b.add(P.box(0.2, 0.14, 2.5), 0xb08a3e, { y: 2.74 });
    b.add(P.box(0.55, 0.9, 0.06), PAL.woodDark, { x: -0.45, y: 0.65, z: 1.02 });
    b.add(P.sph(0.04, 5, 4), PAL.gold, { x: -0.27, y: 0.65, z: 1.07 });
    win(0.5, 1.05, 1.01);
    b.add(P.box(0.4, 0.8, 0.4), PAL.stoneDark, { x: 0.75, y: 2.4, z: -0.4 });
    chimney = [0.75, 2.85, -0.4];
  } else if (level === 2) {
    // plaster and timber house on a stone footing, with a flower box
    b.add(P.box(2.7, 0.5, 2.3), PAL.stone, { y: 0.25, flat: true });
    b.add(P.box(2.55, 1.6, 2.15), S.wall, { y: 1.3, flat: true, shadeY: [0.85, 1.05] });
    b.add(P.box(2.62, 0.12, 2.22), S.trim, { y: 1.3 });
    for (const x of [-1.22, -0.05, 1.22]) b.add(P.box(0.1, 1.6, 0.05), S.trim, { x, y: 1.3, z: 1.08 });
    b.add(P.roof(3.1, 1.35, 2.65), S.roof, { y: 2.1, flat: true });
    b.add(P.box(0.6, 1.0, 0.06), S.trim, { x: -0.62, y: 1.0, z: 1.09 });
    b.add(P.sph(0.045, 5, 4), PAL.gold, { x: -0.42, y: 1.0, z: 1.14 });
    win(0.62, 1.45, 1.09);
    win(1.29, 1.45, 0, Math.PI / 2);
    b.add(P.box(0.62, 0.12, 0.16), PAL.wood, { x: 0.62, y: 1.13, z: 1.18 });
    for (const [fx, c] of [[0.42, 0xe2282c], [0.62, 0xf27ba2], [0.82, 0xffc63a]]) b.add(P.sph(0.07, 5, 4), c, { x: fx, y: 1.23, z: 1.18 });
    b.add(P.box(0.42, 1.0, 0.42), PAL.stone, { x: 0.8, y: 2.95, z: -0.45 });
    chimney = [0.8, 3.5, -0.45];
  } else {
    // two-storey town house: stone below, plaster above, gold trim
    b.add(P.box(2.9, 0.6, 2.5), PAL.stoneLight, { y: 0.3, flat: true });
    b.add(P.box(2.75, 1.4, 2.35), PAL.stone, { y: 1.3, flat: true, shadeY: [0.85, 1.05] });
    b.add(P.box(3.0, 1.2, 2.6), S.wall, { y: 2.6, flat: true, shadeY: [0.9, 1.05] });
    b.add(P.box(3.06, 0.14, 2.66), PAL.gold, { y: 2.0 });
    for (const x of [-1.45, 0, 1.45]) b.add(P.box(0.1, 1.2, 0.05), S.trim, { x, y: 2.6, z: 1.31 });
    b.add(P.roof(3.45, 1.5, 3.0), S.roof, { y: 3.2, flat: true });
    b.add(P.cone(0.1, 0.35, 6), PAL.gold, { y: 4.85, z: 1.4 });
    b.add(P.box(0.65, 1.1, 0.06), PAL.woodDark, { x: -0.6, y: 1.15, z: 1.2 });
    b.add(P.sph(0.05, 5, 4), PAL.gold, { x: -0.38, y: 1.15, z: 1.25 });
    win(0.62, 1.4, 1.19);
    win(-0.7, 2.62, 1.31); win(0.7, 2.62, 1.31);
    win(1.51, 2.62, 0, Math.PI / 2);
    b.add(P.box(0.06, 0.9, 0.45), PAL.teal, { x: 1.52, y: 1.3, z: -0.4 });
    b.add(P.box(0.45, 1.2, 0.45), PAL.stoneDark, { x: 0.85, y: 4.2, z: -0.5 });
    chimney = [0.85, 4.85, -0.5];
  }
  return { geo: b.build(), glow: glow.build(), chimney };
}

export function wallGeometry(len, level) {
  const b = new GB();
  const col = level === 3 ? PAL.stoneLight : PAL.stone;
  b.add(P.box(len, 2.0, 1.0), col, { y: 1.0, flat: true, shadeY: [0.8, 1.05] });
  const n = Math.floor(len / 1.1);
  for (let i = 0; i < n; i++) b.add(P.box(0.55, 0.5, 1.05), PAL.stoneLight, { x: -len / 2 + 0.55 + i * 1.1, y: 2.25 });
  if (level === 3) b.add(P.box(len, 0.12, 1.05), PAL.gold, { y: 1.95 });
  return b.build();
}

// ---------------------------------------------------------------- props
export const coinGeometry = () => new GB()
  .add(P.cyl(0.3, 0.3, 0.08, 14), PAL.gold, { rx: Math.PI / 2 })
  .add(P.cyl(0.2, 0.2, 0.09, 10), PAL.goldDark, { rx: Math.PI / 2 })
  .build();

export const boltGeometry = () => new GB()
  .add(P.box(0.06, 0.06, 1.1), PAL.white, { z: -0.2 })
  .add(P.cone(0.07, 0.22, 4), PAL.iron, { z: 0.45, rx: Math.PI / 2 })
  .add(P.box(0.02, 0.16, 0.24), 0xffffff, { z: -0.68 })
  .add(P.box(0.16, 0.02, 0.24), 0xffffff, { z: -0.68 })
  .build();

// ---------------------------------------------------------------- villagers
// Little townsfolk, instanced and animated on the GPU (villageranim.js).
// Parts: 0 body, 1-2 legs (left, right), 3-4 arms (left, right), 5 head.
// Clothes are white with aTint = 1, so each villager's own colour shows there.
// look: 0 farmer (straw hat, hoe), 1 villager woman (dress, headscarf), 2 townsman (cap).
export const VILLAGER_PART = { body: 0, legL: 1, legR: 2, armL: 3, armR: 4, head: 5 };
export function villagerGeometry(look = 0) {
  const b = new GB({ parts: true, tint: true });
  const head = { part: VILLAGER_PART.head, pivot: [0, 1.06, 0] };
  const skin = look === 1 ? 0xf2c39c : PAL.skin;
  const hair = [0x6b4126, 0x4a2e1e, 0x2e2420][look];
  for (const sx of [-1, 1]) {
    const leg = { part: sx < 0 ? VILLAGER_PART.legL : VILLAGER_PART.legR, pivot: [sx * 0.1, 0.5, 0] };
    b.add(P.cyl(0.075, 0.065, 0.44, 6), look === 1 ? 0x6a5444 : look === 0 ? 0x7a6040 : 0x4a4a58, { x: sx * 0.1, y: 0.28, ...leg });
    b.add(P.box(0.13, 0.09, 0.21), 0x4a3020, { x: sx * 0.1, y: 0.05, z: 0.03, ...leg });
  }
  if (look === 1) {
    b.add(P.cyl(0.17, 0.31, 0.56, 10), 0xffffff, { y: 0.52, tint: 1 });                    // dress
    b.add(P.cyl(0.15, 0.18, 0.32, 10), 0xffffff, { y: 0.92, tint: 1 });                    // bodice
    b.add(P.box(0.27, 0.44, 0.04), PAL.white, { y: 0.6, z: 0.25, rx: -0.22 });             // apron
    b.add(P.cyl(0.185, 0.185, 0.05, 10), PAL.white, { y: 0.79 });                           // apron waist
  } else {
    b.add(P.cyl(0.17, 0.2, 0.5, 10), 0xffffff, { y: 0.8, tint: 1 });                        // tunic
    b.add(P.cyl(0.205, 0.205, 0.07, 10), 0x5a3a24, { y: 0.6 });                             // belt
    b.add(P.box(0.06, 0.06, 0.03), PAL.gold, { y: 0.6, z: 0.2 });                           // buckle
    b.add(P.cyl(0.19, 0.17, 0.12, 10), look === 0 ? 0x7a6040 : 0x4a4a58, { y: 0.52 });       // trousers top
    if (look === 2) b.add(P.box(0.3, 0.32, 0.05), 0x5a3a24, { y: 0.84, z: 0.18 });          // waistcoat front
  }
  for (const sx of [-1, 1]) {
    const arm = { part: sx < 0 ? VILLAGER_PART.armL : VILLAGER_PART.armR, pivot: [sx * 0.22, 1.0, 0] };
    b.add(P.cap(0.055, 0.3, 3, 6), 0xffffff, { x: sx * 0.25, y: 0.82, rz: sx * 0.12, tint: 1, ...arm });
    b.add(P.sph(0.06, 6, 4), skin, { x: sx * 0.28, y: 0.6, ...arm });
  }
  if (look === 0) {
    // a hoe held upright in the right hand, blade at the bottom
    const arm = { part: VILLAGER_PART.armR, pivot: [0.22, 1.0, 0] };
    b.add(P.cyl(0.022, 0.022, 0.95, 5), PAL.woodLight, { x: 0.3, y: 0.62, z: 0.04, ...arm });
    b.add(P.box(0.13, 0.05, 0.22), PAL.iron, { x: 0.3, y: 0.16, z: 0.12, ...arm });
  }
  b.add(P.sph(0.17, 10, 8), skin, { y: 1.22, ...head });
  b.add(P.sph(0.035, 5, 4), 0xe7a074, { y: 1.2, z: 0.165, ...head });
  for (const sx of [-1, 1]) {
    b.add(P.box(0.032, 0.05, 0.02), PAL.ink, { x: sx * 0.06, y: 1.25, z: 0.155, ...head });
    b.add(P.sph(0.03, 5, 4), 0xf08a7a, { x: sx * 0.1, y: 1.17, z: 0.13, ...head });
  }
  if (look === 0) {
    b.add(P.cyl(0.32, 0.32, 0.035, 14), PAL.straw, { y: 1.36, ...head });
    b.add(P.cyl(0.13, 0.16, 0.15, 10), PAL.straw, { y: 1.44, ...head });
    b.add(P.cyl(0.165, 0.165, 0.045, 10), 0xc8402f, { y: 1.39, ...head });
    b.add(P.box(0.3, 0.06, 0.1), hair, { y: 1.13, z: 0.1, ...head });                       // beard
  } else if (look === 1) {
    b.add(P.sph(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8433a, { y: 1.24, ...head }); // headscarf
    b.add(P.sph(0.07, 6, 5), 0xd8433a, { y: 1.27, z: -0.18, ...head });
    b.add(P.sph(0.09, 6, 5), hair, { y: 1.2, z: -0.16, ...head });                         // hair bun
  } else {
    b.add(P.cyl(0.18, 0.18, 0.07, 12), 0x3e3e4c, { y: 1.35, ...head });                   // flat cap
    b.add(P.box(0.22, 0.025, 0.14), 0x3e3e4c, { y: 1.33, z: 0.18, ...head });
    b.add(P.box(0.13, 0.03, 0.03), hair, { y: 1.16, z: 0.165, ...head });                  // moustache
  }
  return b.build();
}

// ---------------------------------------------------------------- farm and town props
// Each returns one vertex-coloured geometry in its own frame (front faces +z).
export function windmillTowerGeometry() {
  const b = new GB();
  b.add(P.cyl(1.6, 1.7, 0.5, 8), PAL.stone, { y: 0.25, flat: true });
  b.add(P.cyl(1.05, 1.45, 4.4, 8), 0xf1e4c8, { y: 2.6, flat: true, shadeY: [0.8, 1.05] });
  b.add(P.cyl(1.25, 1.25, 0.25, 8), PAL.woodDark, { y: 4.85 });
  b.add(P.cone(1.45, 1.6, 8), 0xc8402f, { y: 5.75, flat: true });
  b.add(P.box(0.6, 1.0, 0.1), PAL.woodDark, { y: 1.0, z: 1.42, rx: -0.09 });
  b.add(P.box(0.4, 0.45, 0.08), 0x3a3550, { y: 3.0, z: 1.2, rx: -0.09 });
  b.add(P.cyl(0.18, 0.18, 0.7, 8), PAL.woodDark, { y: 4.85, z: 1.3, rx: Math.PI / 2 });
  return b.build();
}
// sails turn round the hub (their own z axis)
export const WINDMILL_HUB = [0, 4.85, 1.7];
export function windmillSailsGeometry() {
  const b = new GB();
  b.add(P.sph(0.26, 8, 6), PAL.wood, {});
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const at = (along, side) => ({ x: -sa * along + ca * side, y: ca * along + sa * side });
    b.add(P.box(0.12, 3.3, 0.1), PAL.woodDark, { ...at(1.7, 0), rz: a });
    b.add(P.box(0.78, 2.4, 0.05), 0xf3e6c8, { ...at(2.0, 0.45), z: 0.04, rz: a });
    for (const t of [1.1, 2.0, 2.9]) b.add(P.box(0.8, 0.05, 0.08), PAL.wood, { ...at(t, 0.45), z: 0.07, rz: a });
  }
  return b.build();
}
export function barnGeometry() {
  const b = new GB();
  const red = 0xb8433a, white = PAL.white;
  b.add(P.box(5.0, 2.6, 4.0), red, { y: 1.3, flat: true, shadeY: [0.8, 1.05] });
  for (const x of [-2.5, 2.5]) for (const z of [-2.0, 2.0]) b.add(P.box(0.16, 2.6, 0.16), white, { x, y: 1.3, z });
  b.add(P.roof(5.7, 2.0, 4.5), 0x6e2e26, { y: 2.6, flat: true });
  b.add(P.box(1.9, 2.0, 0.08), 0x8f2f28, { y: 1.0, z: 2.03 });
  b.add(P.box(2.1, 0.12, 0.1), white, { y: 2.05, z: 2.05 });
  for (const x of [-1.0, 1.0]) b.add(P.box(0.12, 2.0, 0.1), white, { x, y: 1.0, z: 2.06 });
  for (const r of [0.78, -0.78]) b.add(P.box(0.1, 2.5, 0.06), white, { y: 1.0, z: 2.09, rz: r });
  b.add(P.box(0.9, 0.8, 0.08), 0x8f2f28, { y: 3.25, z: 2.24 });
  b.add(P.box(1.06, 0.96, 0.06), white, { y: 3.25, z: 2.21 });
  for (const [x, y, z] of [[3.0, 0.45, 1.5], [3.15, 0.45, 0.4], [3.05, 1.3, 0.95]]) b.add(P.cyl(0.45, 0.45, 0.95, 10), 0xe0c060, { x, y, z, rz: Math.PI / 2 });
  b.add(P.box(1.3, 0.38, 0.55), PAL.wood, { x: -3.0, y: 0.19, z: 1.4 });
  b.add(P.box(1.1, 0.06, 0.4), 0x4a7aa8, { x: -3.0, y: 0.36, z: 1.4 });
  return b.build();
}
export function wellGeometry() {
  const b = new GB();
  b.add(P.cyl(0.75, 0.8, 0.7, 12), PAL.stone, { y: 0.35, flat: true });
  b.add(P.cyl(0.6, 0.6, 0.05, 12), 0x2f5a80, { y: 0.66 });
  for (const x of [-0.68, 0.68]) b.add(P.box(0.12, 1.4, 0.12), PAL.woodDark, { x, y: 1.05 });
  b.add(P.cyl(0.05, 0.05, 1.45, 6), PAL.wood, { y: 1.4, rz: Math.PI / 2 });
  b.add(P.roof(1.9, 0.62, 1.2), 0xc8402f, { y: 1.72, flat: true });
  b.add(P.cyl(0.02, 0.02, 0.4, 4), 0xd8c8a0, { y: 1.18 });
  b.add(P.cyl(0.15, 0.12, 0.22, 8), PAL.woodLight, { y: 0.92 });
  return b.build();
}
export function marketGeometry() {
  const b = new GB();
  b.add(P.box(2.3, 0.1, 1.1), PAL.wood, { y: 0.82 });
  b.add(P.box(2.3, 0.75, 0.08), PAL.plank, { y: 0.45, z: 0.52 });
  for (const x of [-1.1, 1.1]) for (const z of [-0.5, 0.5]) b.add(P.box(0.08, 2.0, 0.08), PAL.woodDark, { x, y: 1.0, z });
  for (let i = 0; i < 5; i++) b.add(P.box(0.48, 0.06, 1.5), i % 2 ? PAL.white : 0xd8433a, { x: -0.96 + i * 0.48, y: 2.02, z: 0.1, rx: 0.22 });
  const crate = (x, fill, n = 4) => {
    b.add(P.box(0.5, 0.2, 0.38), PAL.woodLight, { x, y: 0.97 });
    for (let k = 0; k < n; k++) b.add(P.sph(0.09, 6, 4), fill, { x: x - 0.15 + (k % 2) * 0.3, y: 1.1, z: -0.08 + (k >> 1) * 0.16 });
  };
  crate(-0.65, 0xe2282c); crate(0, 0x8fc04a); crate(0.65, 0xf08a2a);
  return b.build();
}
export function scarecrowGeometry() {
  const b = new GB();
  b.add(P.cyl(0.05, 0.06, 1.7, 6), PAL.wood, { y: 0.85 });
  b.add(P.box(1.1, 0.07, 0.07), PAL.wood, { y: 1.3 });
  b.add(P.box(0.44, 0.5, 0.26), 0x3e6fb8, { y: 1.15 });
  b.add(P.box(0.95, 0.15, 0.17), 0x3e6fb8, { y: 1.31 });
  b.add(P.box(0.14, 0.12, 0.03), 0xd8433a, { x: 0.1, y: 1.05, z: 0.14 });
  for (const sx of [-1, 1]) b.add(P.cone(0.07, 0.18, 5), 0xd9b45a, { x: sx * 0.55, y: 1.31, rz: sx * Math.PI / 2 });
  b.add(P.sph(0.18, 8, 6), 0xd9b45a, { y: 1.62 });
  for (const sx of [-1, 1]) b.add(P.box(0.06, 0.06, 0.02), PAL.ink, { x: sx * 0.07, y: 1.66, z: 0.17 });
  b.add(P.cyl(0.32, 0.32, 0.03, 12), 0x6b4126, { y: 1.75 });
  b.add(P.cone(0.2, 0.34, 8), 0x6b4126, { y: 1.92 });
  return b.build();
}
