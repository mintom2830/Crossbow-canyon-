// Models for the thirteen Arsenal towers (see src/arsenal.js), five levels
// each, after the user's "Weapon & Tower Arsenal" sheet. Every tower stands
// on one of two bases that grow with its level: a wooden frame (wood → iron
// plated → stone pillars → steel → gold) or a stone plinth. The head on top
// turns toward its target (+Z is forward). Glowing parts (crystals, orbs,
// lenses, gems) go into the unlit "glow" geometry.
//
// Returns the same shape as towerParts(): { base, head, baseGlow, headGlow,
// headY, crystal (where the glow sprite sits on the head, or null), glowColor }.
import { baseKind } from '../arsenal.js';
import { GB, P } from './geo.js';

const C = {
  wood: 0x9c5a31, woodDark: 0x7d4323, woodLight: 0xb36b3a,
  stone: 0xcfd2d6, stoneDark: 0xa9aeb5, stoneWarm: 0xc9c2b6,
  iron: 0x4d525a, ironLight: 0x6c727b, stud: 0xa3aab3, black: 0x2c2d33,
  steel: 0x454a53, plate: 0x5b616a,
  gold: 0xf3b733, goldDark: 0xc78a1b, brass: 0xd89a3a,
  grass: 0x79bd4a, white: 0xf6f0e2, ivory: 0xf0e2c0,
};
const TAU = Math.PI * 2;
// place n items around a ring; fn(x, z, ry, i) with local +Z facing outward
function around(n, r, fn, phase = 0) {
  for (let i = 0; i < n; i++) { const a = phase + (i / n) * TAU; fn(Math.cos(a) * r, Math.sin(a) * r, Math.PI / 2 - a, i); }
}
const FRAME_H = [0, 1.3, 1.38, 1.46, 1.54, 1.62];
const PLINTH_H = [0, 1.05, 1.12, 1.19, 1.26, 1.33];

// What each tower looks like: base style, banner colour, glow colour.
export const ARSENAL_LOOK = {
  spike: { base: 'plinth', banner: 0x5b616a, glow: null },
  mine: { base: 'frame', banner: 0xf2c230, glow: 0xff3b30 },
  ice: { base: 'plinth', banner: 0x3aa9d8, glow: 0x8ff4ff },
  poison: { base: 'plinth', banner: 0x5aa02a, glow: 0x9dff4a },
  flame: { base: 'frame', banner: 0xcc1f2a, glow: 0xff9a2a },
  sniper: { base: 'frame', banner: 0x3a3f4a, glow: 0xff7a2a },
  tesla: { base: 'frame', banner: 0x2f6fd0, glow: 0x7fd8ff },
  mortar: { base: 'frame', banner: 0xcc1f2a, glow: null },
  rocket: { base: 'frame', banner: 0xcc1f2a, glow: 0xff7a3a },
  summoner: { base: 'frame', banner: 0x7a3ad8, glow: 0xc07bff },
  crystal: { base: 'plinth', banner: 0x7a3ad8, glow: 0xc07bff },
  totem: { base: 'plinth', banner: 0xcc1f2a, glow: 0xff5a3a },
  warp: { base: 'plinth', banner: 0x2f6fd0, glow: 0x5ad8ff },
};

// A hanging banner on a base side: kind colour, a white emblem, gold trim from level 4.
function banner(b, x, y, z, ry, color, level, w = 0.46, h = 0.6) {
  const ox = Math.sin(ry) * 0.03, oz = Math.cos(ry) * 0.03;
  b.add(P.box(w + 0.08, 0.08, 0.08), level >= 4 ? C.gold : C.woodDark, { x, y: y + h / 2 + 0.03, z, ry });
  b.add(P.box(w, h, 0.05), color, { x, y, z, ry });
  b.add(P.cone(w / 2, 0.18, 3), color, { x, y: y - h / 2 - 0.08, z, ry, rx: Math.PI, sz: 0.12, order: 'YXZ' });
  b.add(P.box(w * 0.4, w * 0.4, 0.04), level >= 4 ? C.gold : C.white, { x: x + ox, y: y + 0.04, z: z + oz, ry, rz: Math.PI / 4, order: 'YXZ' });
}

// Wooden frame base: a stone slab, four legs with braces, a platform on top.
function frameBase(b, glow, level, look) {
  const H = FRAME_H[level];
  const slab = level >= 4 ? C.steel : level === 3 ? C.stoneDark : C.stone;
  b.add(P.box(2.0, 0.3, 2.0), slab, { y: 0.15 });
  b.add(P.box(2.06, 0.06, 2.06), level >= 5 ? C.gold : level >= 3 ? C.iron : C.stoneDark, { y: 0.3 });
  around(8, 1.0, (x, z, ry, i) => b.add(P.box(0.48, 0.26, 0.08), i % 2 ? C.stoneDark : C.stone, { x: x * 0.98, z: z * 0.98, y: 0.15, ry, flat: true }), Math.PI / 8);
  const legC = level >= 4 ? C.plate : level === 3 ? C.stone : C.wood;
  const legW = level === 3 ? 0.36 : level >= 4 ? 0.28 : 0.22;
  const L = H - 0.32, my = 0.32 + L / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(P.box(legW, L, legW), legC, { x: sx * 0.66, y: my, z: sz * 0.66 });
    if (level >= 2) b.add(P.box(legW + 0.06, 0.1, legW + 0.06), level >= 4 ? C.gold : C.iron, { x: sx * 0.66, y: 0.42, z: sz * 0.66 });
    if (level >= 2) b.add(P.box(legW + 0.06, 0.1, legW + 0.06), level >= 4 ? C.gold : C.iron, { x: sx * 0.66, y: H - 0.18, z: sz * 0.66 });
    if (level === 3) for (let k = 0; k < 3; k++) b.add(P.box(legW + 0.02, 0.05, legW + 0.02), C.stoneDark, { x: sx * 0.66, y: 0.55 + k * (L / 3.4), z: sz * 0.66 });
  }
  // cross braces on the two sides without banners
  const brace = level >= 4 ? C.iron : C.woodDark;
  const bl = Math.hypot(1.2, L * 0.8), ba = Math.atan2(L * 0.8, 1.2);
  for (const sx of [-1, 1]) {
    b.add(P.box(0.08, 0.1, bl), brace, { x: sx * 0.68, y: my, rx: ba });
    b.add(P.box(0.08, 0.1, bl), brace, { x: sx * 0.68, y: my, rx: -ba });
  }
  // the platform
  const top = level >= 4 ? C.steel : level === 3 ? C.stoneWarm : C.woodLight;
  b.add(P.box(1.72, 0.18, 1.72), top, { y: H - 0.05 });
  b.add(P.box(1.8, 0.07, 1.8), level >= 4 ? C.gold : level === 3 ? C.iron : C.woodDark, { y: H - 0.15 });
  if (level <= 2) for (let k = -2; k <= 2; k++) b.add(P.box(0.03, 0.02, 1.7), C.woodDark, { x: k * 0.32, y: H + 0.045 });
  if (level >= 2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(P.box(0.14, 0.1, 0.14), level >= 4 ? C.gold : C.stud, { x: sx * 0.78, y: H + 0.07, z: sz * 0.78 });
  // banners front and back
  for (const sz of [-1, 1]) banner(b, 0, H - 0.52, sz * 0.7, sz > 0 ? 0 : Math.PI, look.banner, level, 0.5, 0.56);
  if (level >= 5) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(P.cone(0.09, 0.32, 6), C.gold, { x: sx * 0.78, y: H + 0.27, z: sz * 0.78 });
    if (look.glow) around(4, 1.03, (x, z, ry) => glow.add(P.oct(0.09), look.glow, { x, z, y: 0.15, ry, sy: 1.4 }));
  }
  return H;
}

// Stone plinth base: a tapered square block with brick courses.
function plinthBase(b, glow, level, look) {
  const H = PLINTH_H[level];
  const body = level >= 4 ? C.steel : level === 3 ? C.stoneWarm : C.stone;
  b.add(P.box(2.0, 0.24, 2.0), level >= 4 ? C.plate : C.stoneDark, { y: 0.12 });
  b.add(P.cyl(0.78, 0.98, H - 0.24, 4), body, { y: 0.24 + (H - 0.24) / 2, ry: Math.PI / 4 });
  const rows = level >= 3 ? 3 : 2;
  for (let r = 0; r < rows; r++) {
    const y = 0.36 + r * ((H - 0.5) / rows), k = 0.94 - r * 0.06;
    around(4, 0.92 * k, (x, z, ry) => b.add(P.box(1.22 * k, 0.06, 0.06), level >= 4 ? C.iron : C.stoneDark, { x, z, y, ry }), Math.PI / 4 * 0 + 0);
  }
  b.add(P.box(1.68, 0.16, 1.68), level >= 4 ? C.steel : C.stone, { y: H - 0.02 });
  b.add(P.box(1.76, 0.06, 1.76), level >= 4 ? C.gold : level === 3 ? C.iron : C.stoneDark, { y: H - 0.12 });
  for (const sz of [-1, 1]) banner(b, 0, H * 0.55, sz * 0.86, sz > 0 ? 0 : Math.PI, look.banner, level, 0.46, Math.min(0.56, H * 0.55));
  if (level >= 2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(P.box(0.16, H - 0.2, 0.16), level >= 4 ? C.gold : C.iron, { x: sx * 0.8, y: 0.2 + (H - 0.2) / 2, z: sz * 0.8 });
  if (level >= 5) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(P.cone(0.09, 0.32, 6), C.gold, { x: sx * 0.8, y: H + 0.2, z: sz * 0.8 });
    if (look.glow) around(4, 0.99, (x, z, ry) => glow.add(P.oct(0.09), look.glow, { x, z, y: 0.12, ry, sy: 1.4 }));
  }
  return H;
}

// A crystal cluster (glow): one big crystal and a ring of smaller ones.
function crystals(glow, color, n, big, y0 = 0.1) {
  glow.add(P.oct(0.34 * big, 0), color, { y: y0 + 0.55 * big, sy: 2.2 });
  around(n, 0.3 * big, (x, z, ry, i) => glow.add(P.oct((0.2 + (i % 2) * 0.05) * big, 0), color, { x, z, y: y0 + 0.36 * big + (i % 2) * 0.08, sy: 2.1, rz: -0.55 * Math.sin(Math.PI / 2 - ry) * 0 - 0.55 * Math.cos(ry), rx: 0.55 * Math.sin(ry), order: 'XZY' }), 0.4);
}

function headFor(kind, level, head, glow, look) {
  const s = 0.9 + level * 0.05;            // heads grow a little with every level
  const gold = level >= 4, trim = gold ? C.gold : C.iron;
  let crystal = null;
  switch (kind) {
    case 'mortar': {
      // a short, fat barrel pointing up at the sky on a wooden carriage
      head.add(P.box(1.0 * s, 0.14, 1.0 * s), level >= 3 ? C.iron : C.woodDark, { y: 0.07 });
      for (const sx of [-1, 1]) head.add(P.box(0.16, 0.5 * s, 0.86 * s), level >= 4 ? C.steel : C.wood, { x: sx * 0.46 * s, y: 0.32 * s });
      const tilt = 0.72, len = 0.95 * s, r = 0.4 * s;
      const by = 0.5 * s, cy = Math.cos(tilt) * len / 2, cz = Math.sin(tilt) * len / 2;
      const barrel = (x, k) => {
        head.add(P.cyl(r * k, r * 0.86 * k, len * k, 14), C.black, { x, y: by + cy * k, z: cz * k, rx: tilt });
        head.add(P.tor(r * k, 0.07 * k, 6, 16), level >= 3 ? C.gold : C.ironLight, { x, y: by + 2 * cy * k, z: 2 * cz * k, rx: tilt - Math.PI / 2 });
        head.add(P.cyl(r * 0.78 * k, r * 0.78 * k, 0.04, 14), 0x15161a, { x, y: by + 2 * cy * k + 0.01, z: 2 * cz * k, rx: tilt });
        if (level >= 2) head.add(P.tor(r * 0.95 * k, 0.05 * k, 5, 16), trim, { x, y: by + cy * k, z: cz * k, rx: tilt - Math.PI / 2 });
        head.add(P.cyl(0.1, 0.1, 1.05 * s, 8), C.iron, { x, y: by, rz: Math.PI / 2 });
      };
      barrel(0, 1);
      if (level >= 5) { barrel(-0.62 * s, 0.55); barrel(0.62 * s, 0.55); }
      break;
    }
    case 'crystal': case 'ice': {
      // a cluster of glowing crystals in a stone cup (Crystal Storm purple, Ice blue)
      const col = look.glow, big = 0.82 + level * 0.1;
      head.add(P.cyl(0.42 * s, 0.32 * s, 0.22, 8), kind === 'ice' ? 0xd8f2ff : C.stoneDark, { y: 0.11 });
      head.add(P.tor(0.42 * s, 0.05, 5, 16), trim, { y: 0.22, rx: Math.PI / 2 });
      crystals(glow, col, 4 + Math.min(level, 4), big, 0.15);
      if (kind === 'ice') {
        // icicles round the cup, frost on the rim
        around(8, 0.42 * s, (x, z) => head.add(P.cone(0.05, 0.26, 5), 0xe8faff, { x, z, y: -0.02, rx: Math.PI }), 0.2);
      }
      if (level >= 3) around(level >= 5 ? 6 : 4, 0.55 * s, (x, z, ry) => head.add(P.box(0.08, 0.5 + level * 0.06, 0.08), trim, { x, z, y: 0.35, ry, rz: 0.25 * Math.cos(ry + Math.PI / 2), rx: -0.25 * Math.sin(ry + Math.PI / 2) }), Math.PI / 4);
      crystal = [0, 0.15 + 0.6 * big, 0];
      break;
    }
    case 'tesla': {
      // a coil spire with a glowing orb on top, and prongs that throw sparks
      head.add(P.cyl(0.36 * s, 0.44 * s, 0.24, 10), C.iron, { y: 0.12 });
      const H = 0.9 + level * 0.1;
      head.add(P.cyl(0.11, 0.15, H, 8), C.ironLight, { y: 0.2 + H / 2 });
      const rings = 2 + level;
      for (let i = 0; i < rings; i++) head.add(P.tor(0.24 - i * 0.012, 0.055, 5, 14), i % 2 ? C.brass : 0xc8743a, { y: 0.32 + i * (H * 0.8 / rings), rx: Math.PI / 2 });
      glow.add(P.sph(0.2 + level * 0.025, 12, 10), look.glow, { y: 0.32 + H });
      head.add(P.tor(0.24 + level * 0.02, 0.04, 5, 16), trim, { y: 0.32 + H, rx: Math.PI / 2 });
      crystal = [0, 0.32 + H, 0];
      if (level >= 2) {
        const n = level >= 4 ? 4 : 2;
        around(n, 0.5 * s, (x, z, ry) => {
          head.add(P.box(0.07, 0.6, 0.07), C.iron, { x: x * 0.8, z: z * 0.8, y: 0.5, ry, rz: 0.4 * Math.cos(ry + Math.PI / 2), rx: -0.4 * Math.sin(ry + Math.PI / 2) });
          glow.add(P.sph(0.08, 8, 6), look.glow, { x: x * 1.15, z: z * 1.15, y: 0.78 });
        }, Math.PI / 4);
      }
      break;
    }
    case 'flame': {
      // a red fuel drum on its side with a black nozzle; a pilot flame at the tip
      head.add(P.box(0.7 * s, 0.16, 0.8 * s), C.iron, { y: 0.08 });
      head.add(P.cyl(0.4 * s, 0.4 * s, 0.85 * s, 14), 0xc8262a, { y: 0.55 * s, rx: Math.PI / 2 });
      for (const zz of [-0.32, 0.32]) head.add(P.tor(0.4 * s, 0.05, 5, 16), level >= 4 ? C.gold : C.black, { y: 0.55 * s, z: zz * s });
      head.add(P.cyl(0.24 * s, 0.26 * s, 0.2, 12), C.black, { y: 0.55 * s, z: 0.5 * s, rx: Math.PI / 2 });
      const nl = 0.55 + level * 0.07;
      head.add(P.cyl(0.11 * s, 0.13 * s, nl, 10), C.black, { y: 0.55 * s, z: 0.55 * s + nl / 2, rx: Math.PI / 2 });
      head.add(P.cyl(0.19 * s, 0.13 * s, 0.14, 10), level >= 3 ? C.gold : C.ironLight, { y: 0.55 * s, z: 0.6 * s + nl, rx: Math.PI / 2 });
      // fuel tank on the back
      head.add(P.cap(0.17 * s, 0.4 * s, 4, 10), level >= 4 ? C.gold : 0xe0a63a, { y: 0.66 * s, z: -0.62 * s, rz: Math.PI / 2 });
      head.add(P.cyl(0.04, 0.04, 0.5 * s, 6), C.brass, { y: 0.92 * s, z: -0.3 * s, rx: Math.PI / 2 });
      glow.add(P.sph(0.12 * s, 8, 6), look.glow, { y: 0.55 * s, z: 0.68 * s + nl });
      crystal = [0, 0.55 * s, 0.7 * s + nl];
      break;
    }
    case 'sniper': {
      // a long rifle on a swivel with a big scope; its lens glows orange
      head.add(P.cyl(0.24 * s, 0.3 * s, 0.22, 10), C.iron, { y: 0.11 });
      const L = 1.5 + level * 0.12, y = 0.46 * s;
      const s0 = s; { const s = s0 * 1.25;
      head.add(P.box(0.24 * s, 0.26 * s, 0.9 * s), C.wood, { y, z: -0.45 * s });                 // stock
      head.add(P.box(0.2 * s, 0.22 * s, 0.4 * s), C.black, { y, z: 0.1 * s });
      head.add(P.cyl(0.07 * s, 0.08 * s, L, 10), C.black, { y, z: 0.25 * s + L / 2, rx: Math.PI / 2 });
      head.add(P.cyl(0.11 * s, 0.11 * s, 0.18, 10), level >= 3 ? C.gold : C.ironLight, { y, z: 0.3 * s + L, rx: Math.PI / 2 });   // muzzle brake
      // scope
      head.add(P.cyl(0.12 * s, 0.12 * s, 0.8 * s, 12), C.black, { y: y + 0.27 * s, z: 0.05 * s, rx: Math.PI / 2 });
      head.add(P.cyl(0.17 * s, 0.13 * s, 0.16, 12), C.black, { y: y + 0.27 * s, z: 0.5 * s, rx: Math.PI / 2 });
      glow.add(P.cyl(0.14 * s, 0.14 * s, 0.04, 12), look.glow, { y: y + 0.27 * s, z: 0.59 * s, rx: Math.PI / 2 });
      for (const zz of [-0.15, 0.25]) head.add(P.box(0.06, 0.16 * s, 0.06), trim, { y: y + 0.15 * s, z: zz * s });
      if (level >= 2) for (const sx of [-1, 1]) head.add(P.box(0.05, 0.5, 0.05), C.iron, { x: sx * 0.12, y: y - 0.2, z: 0.25 * s + L * 0.6, rz: sx * 0.35 });   // bipod
      if (level >= 4) for (let i = 0; i < 3; i++) head.add(P.tor(0.09 * s, 0.025, 4, 10), C.gold, { y, z: 0.6 + i * 0.4 });
      crystal = [0, y + 0.27 * s, 0.62 * s]; }
      break;
    }
    case 'rocket': {
      // a launcher rack: side plates and a back plate holding red-tipped rockets, angled up
      head.add(P.box(0.9 * s, 0.16, 0.9 * s), C.iron, { y: 0.08 });
      const pitch = 0.3, n = level >= 5 ? 5 : level >= 3 ? 4 : 3;
      const dy = Math.sin(pitch), dz = Math.cos(pitch);
      for (const sx of [-1, 1]) head.add(P.box(0.1, 0.62 * s, 0.9 * s), level >= 4 ? C.steel : C.plate, { x: sx * 0.58 * s, y: 0.45 * s, rx: -pitch });
      head.add(P.box(1.2 * s, 0.62 * s, 0.1), level >= 4 ? C.steel : C.plate, { y: 0.4 * s, z: -0.45 * s, rx: -pitch });
      head.add(P.box(1.26 * s, 0.08, 0.96 * s), trim, { y: 0.16 * s, rx: -pitch });
      for (const sx of [-1, 1]) head.add(P.box(0.14, 0.12, 0.14), trim, { x: sx * 0.58 * s, y: 0.8 * s, z: 0.32 * s });
      const slots = n === 5 ? [[-0.34, 0], [0, 0], [0.34, 0], [-0.17, 0.27], [0.17, 0.27]] : n === 4 ? [[-0.2, 0], [0.2, 0], [-0.2, 0.27], [0.2, 0.27]] : [[-0.3, 0], [0, 0.04], [0.3, 0]];
      for (const [x, yy] of slots) {
        const y = 0.36 * s + yy * s, cx = x * s;
        // body along the launch direction, nose cone poking out of the front, fins at the back
        head.add(P.cyl(0.12 * s, 0.12 * s, 1.0 * s, 10), C.white, { x: cx, y: y + dy * 0.15, z: dz * 0.15, rx: Math.PI / 2 - pitch });
        head.add(P.cone(0.12 * s, 0.34 * s, 10), 0xd8262d, { x: cx, y: y + dy * (0.65 + 0.17) * s, z: dz * (0.65 + 0.17) * s, rx: Math.PI / 2 - pitch });
        head.add(P.tor(0.12 * s, 0.025, 4, 10), level >= 4 ? C.gold : 0xd8262d, { x: cx, y: y + dy * 0.45 * s, z: dz * 0.45 * s, rx: -pitch });
        for (const fx of [-1, 1]) head.add(P.box(0.03, 0.2 * s, 0.2 * s), 0xd8262d, { x: cx + fx * 0.12 * s, y: y - dy * 0.3 * s, z: -dz * 0.3 * s, rx: -pitch });
      }
      break;
    }
    case 'mine': {
      // a big black spiked bomb with a glowing band, on hazard stripes
      around(8, 0.66 * s, (x, z, ry, i) => head.add(P.box(0.5 * s, 0.14, 0.08), i % 2 ? C.black : 0xf2c230, { x, z, y: 0.07, ry }), Math.PI / 8);
      head.add(P.cyl(0.58 * s, 0.62 * s, 0.14, 12), C.iron, { y: 0.07 });
      const r = 0.5 * s;
      head.add(P.sph(r, 14, 10), C.black, { y: 0.15 + r });
      (level >= 3 ? glow : head).add(P.cyl(r * 1.03, r * 1.03, 0.14 * s, 16), level >= 3 ? look.glow : 0xc8262a, { y: 0.15 + r });
      // spikes all over it, pointing outward (spread evenly over the upper sphere)
      const spikes = 8 + level * 2;
      for (let i = 0; i < spikes; i++) {
        const dy = 0.95 - (i / (spikes - 1)) * 1.45, rr = Math.sqrt(1 - dy * dy), a = i * 2.4;
        const dx = Math.cos(a) * rr, dz = Math.sin(a) * rr;
        if (Math.abs(dy) < 0.16) continue;   // leave the band clear
        head.add(P.cone(0.07 * s, 0.26 * s, 5), level >= 4 ? C.gold : C.ironLight, { x: dx * (r + 0.1), y: 0.15 + r + dy * (r + 0.1), z: dz * (r + 0.1), rx: Math.acos(dy), ry: Math.atan2(dx, dz), order: 'YXZ' });
      }
      head.add(P.cyl(0.08, 0.08, 0.2, 6), C.iron, { y: 0.15 + 2 * r + 0.08 });
      if (level >= 3) crystal = [0, 0.15 + r, 0];
      break;
    }
    case 'spike': {
      // a wooden crate bristling with steel spikes (a bed of them lies on the road)
      const w = 1.2 * s;
      head.add(P.box(w, 0.42, w), level >= 4 ? C.steel : C.wood, { y: 0.21 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) head.add(P.box(0.1, 0.46, 0.1), trim, { x: sx * w / 2, y: 0.23, z: sz * w / 2 });
      head.add(P.box(w + 0.06, 0.07, w + 0.06), trim, { y: 0.42 });
      const n = level >= 4 ? 4 : 3, sp = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = -w / 2 + sp * (i + 0.5), z = -w / 2 + sp * (j + 0.5), h = 0.36 + ((i + j) % 2) * 0.12 + level * 0.03;
        head.add(P.cone(0.09, h, 6), C.ironLight, { x, z, y: 0.45 + h / 2 });
      }
      if (level >= 3) {
        // spiked iron balls on the corners
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          head.add(P.sph(0.16, 10, 8), C.black, { x: sx * w * 0.5, y: 0.62, z: sz * w * 0.5 });
          around(5, 0.16, (x, z) => head.add(P.cone(0.05, 0.14, 4), C.ironLight, { x: sx * w * 0.5 + x, y: 0.62, z: sz * w * 0.5 + z, rz: Math.PI / 2 }));
        }
      }
      break;
    }
    case 'summoner': {
      // a little wooden shrine-cage with a purple rat banner and a glowing orb
      const w = 0.9 * s, h = 1.0 + level * 0.06;
      head.add(P.box(w + 0.1, 0.12, w + 0.1), C.woodDark, { y: 0.06 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) head.add(P.box(0.1, h, 0.1), level >= 4 ? C.gold : C.wood, { x: sx * w / 2, y: h / 2, z: sz * w / 2 });
      for (let k = 1; k <= 2; k++) around(4, w / 2, (x, z, ry) => head.add(P.box(w, 0.06, 0.06), C.woodDark, { x, z, y: k * h / 3, ry: ry + Math.PI / 2 }), Math.PI / 4 * 0);
      head.add(P.cone(w * 0.85, 0.5, 4), level >= 3 ? 0x5a2a8a : C.woodDark, { y: h + 0.25, ry: Math.PI / 4 });
      head.add(P.sph(0.07, 6, 4), C.gold, { y: h + 0.52 });
      banner(head, 0, h * 0.55, w / 2 + 0.04, 0, look.banner, level, 0.5, 0.62);
      // a white rat face on the banner
      head.add(P.sph(0.1, 8, 6), C.white, { y: h * 0.58, z: w / 2 + 0.09, sz: 0.4 });
      for (const sx of [-1, 1]) head.add(P.sph(0.06, 6, 4), C.white, { x: sx * 0.09, y: h * 0.58 + 0.1, z: w / 2 + 0.09, sz: 0.4 });
      glow.add(P.sph(0.16 + level * 0.02, 12, 10), look.glow, { y: h * 0.45 });
      crystal = [0, h * 0.45, 0];
      break;
    }
    case 'totem': {
      // a carved war pole with bull horns, gold bands and red war banners
      const H = 1.5 + level * 0.15, r = 0.3 + level * 0.02;
      head.add(P.cyl(r, r * 1.1, H, 10), C.wood, { y: H / 2 });
      for (let i = 0; i < 3; i++) head.add(P.tor(r * 1.05, 0.05, 5, 14), level >= 3 ? C.gold : C.woodDark, { y: 0.25 + i * H * 0.32, rx: Math.PI / 2 });
      // a carved face (eyes, brow, mouth)
      for (const sx of [-1, 1]) head.add(P.box(0.1, 0.08, 0.06), level >= 5 ? 0xff5a3a : 0x2a1a12, { x: sx * 0.11, y: H * 0.72, z: r * 0.98 });
      head.add(P.box(0.32, 0.06, 0.08), C.woodDark, { y: H * 0.78, z: r });
      head.add(P.box(0.22, 0.08, 0.06), 0x2a1a12, { y: H * 0.6, z: r * 0.98 });
      // the horns
      for (const sx of [-1, 1]) head.add(P.taper([[sx * r * 0.8, H - 0.1, 0], [sx * (r + 0.35), H + 0.05, 0], [sx * (r + 0.55), H + 0.4, 0], [sx * (r + 0.5), H + 0.7, 0.05]], 0.12, 0, 10, 6), C.ivory);
      head.add(P.cyl(r * 1.05, r * 1.05, 0.12, 10), level >= 4 ? C.gold : C.woodDark, { y: H });
      // cross-arm with banners
      head.add(P.box(1.4 + level * 0.06, 0.1, 0.1), C.woodDark, { y: H * 0.55 });
      for (const sx of [-1, 1]) banner(head, sx * (0.6 + level * 0.03), H * 0.55 - 0.36, 0, 0, look.banner, level, 0.3, 0.55);
      if (level >= 5) { glow.add(P.sph(0.07, 6, 4), look.glow, { x: -0.11, y: H * 0.72, z: r + 0.03 }); glow.add(P.sph(0.07, 6, 4), look.glow, { x: 0.11, y: H * 0.72, z: r + 0.03 }); crystal = [0, H * 0.72, r]; }
      break;
    }
    case 'warp': {
      // a big golden pocket watch on a brass stand, wrapped in glowing time rings
      const R = 0.48 + level * 0.04, y = 0.75 + level * 0.05;
      head.add(P.cyl(0.32, 0.42, 0.24, 12), C.brass, { y: 0.12 });
      head.add(P.cyl(0.12, 0.16, y - 0.2, 8), C.goldDark, { y: 0.2 + (y - 0.2) / 2 });
      head.add(P.cyl(R, R, 0.26, 24), C.gold, { y, rx: Math.PI / 2 });
      head.add(P.cyl(R * 0.84, R * 0.84, 0.28, 24), C.white, { y, rx: Math.PI / 2 });
      head.add(P.tor(R, 0.06, 6, 24), C.goldDark, { y, z: 0.14 });
      around(12, R * 0.72, (x, z) => head.add(P.box(0.04, 0.09, 0.04), 0x3a3030, { x, y: y + z, z: 0.15 }));
      head.add(P.box(0.05, R * 0.6, 0.04), 0x3a3030, { y: y + R * 0.27, z: 0.16 });
      head.add(P.box(0.05, R * 0.42, 0.04), 0x3a3030, { x: R * 0.17, y: y - R * 0.1, z: 0.16, rz: 2.2 });
      around(10, R + 0.06, (x, z) => head.add(P.box(0.1, 0.1, 0.18), C.goldDark, { x, y: y + z }));
      head.add(P.cyl(0.1, 0.1, 0.16, 8), C.gold, { y: y + R + 0.1 });
      head.add(P.tor(0.1, 0.03, 4, 10), C.gold, { y: y + R + 0.24 });
      const rings = level >= 4 ? 3 : level >= 2 ? 2 : 1;
      for (let i = 0; i < rings; i++) glow.add(P.tor(R + 0.3 + i * 0.14, 0.035, 4, 32), look.glow, { y, rx: Math.PI / 2 + 0.5 - i * 0.5, rz: i * 0.9 });
      crystal = [0, y, 0];
      break;
    }
    case 'poison': {
      // a green glass canister with a biohazard badge and a brass nozzle puffing gas
      const r = 0.36 * s, h = 0.75 * s;
      head.add(P.cyl(r + 0.06, r + 0.08, 0.14, 14), level >= 4 ? C.gold : C.iron, { y: 0.07 });
      glow.add(P.cyl(r, r, h, 14), look.glow, { y: 0.14 + h / 2 });
      head.add(P.cyl(r + 0.06, r + 0.06, 0.12, 14), level >= 4 ? C.gold : C.iron, { y: 0.2 + h });
      around(4, r + 0.03, (x, z) => head.add(P.box(0.06, h, 0.06), C.iron, { x, z, y: 0.14 + h / 2 }), Math.PI / 4);
      // biohazard badge on the front
      head.add(P.cyl(0.17, 0.17, 0.04, 12), 0xf2c230, { y: 0.14 + h / 2, z: r + 0.02, rx: Math.PI / 2 });
      around(3, 0.07, (x, z) => head.add(P.sph(0.05, 6, 4), C.black, { x, y: 0.14 + h / 2 + z, z: r + 0.05, sz: 0.4 }), Math.PI / 2);
      // pipe over the top to a nozzle pointing forward
      head.add(P.taper([[0, 0.26 + h, 0], [0, 0.5 + h, 0.05], [0, 0.48 + h, 0.4], [0, 0.32 + h, 0.62]], 0.06, 0.06, 12, 6), C.brass);
      head.add(P.cyl(0.11, 0.08, 0.2, 8), C.brass, { y: 0.27 + h, z: 0.66, rx: Math.PI / 2 + 0.6 });
      if (level >= 3) head.add(P.cyl(0.08, 0.08, 0.3, 8), C.brass, { x: -r - 0.1, y: 0.14 + h * 0.6, rz: 0.2 });
      crystal = [0, 0.14 + h / 2, 0];
      break;
    }
    default: break;
  }
  return crystal;
}

export function arsenalParts(kind, level) {
  kind = baseKind(kind);
  const look = ARSENAL_LOOK[kind];
  const base = new GB(), head = new GB(), baseGlow = new GB(), headGlow = new GB();
  const H = look.base === 'frame' ? frameBase(base, baseGlow, level, look) : plinthBase(base, baseGlow, level, look);
  const crystal = headFor(kind, level, head, headGlow, look);
  return { base: base.build(), head: head.build(), baseGlow: baseGlow.build(), headGlow: headGlow.build(), headY: H + 0.04, crystal, glowColor: look.glow || 0xffffff };
}

// ---------------------------------------------------------------- props
// A homing rocket in flight (+Z forward).
export function rocketGeometry() {
  return new GB()
    .add(P.cyl(0.1, 0.1, 0.5, 8), C.white, { z: 0, rx: Math.PI / 2 })
    .add(P.cone(0.1, 0.24, 8), 0xd8262d, { z: 0.37, rx: Math.PI / 2 })
    .add(P.box(0.03, 0.2, 0.14), 0xd8262d, { z: -0.2 })
    .add(P.box(0.2, 0.03, 0.14), 0xd8262d, { z: -0.2 })
    .add(P.cyl(0.07, 0.09, 0.08, 8), C.iron, { z: -0.28, rx: Math.PI / 2 })
    .build();
}
// A land mine: a black dome with spikes and a red band (its blinking light is separate).
export function mineGeometry() {
  const b = new GB()
    .add(P.cyl(0.38, 0.42, 0.1, 12), C.iron, { y: 0.05 })
    .add(P.sph(0.32, 12, 6, 0, TAU, 0, Math.PI / 2), C.black, { y: 0.08 })
    .add(P.cyl(0.33, 0.33, 0.07, 12), 0xc8262a, { y: 0.12 });
  around(6, 0.3, (x, z, ry) => b.add(P.cone(0.05, 0.16, 4), C.ironLight, { x, z, y: 0.2, rx: 0.9, ry, order: 'YXZ' }));
  return b.build();
}
// A spike bed lying across the road: a wooden frame hw wide either side of
// the road's centre (x) and ±1 along it (z; the view stretches z to the bed's length).
export function bedFrameGeometry(hw) {
  const b = new GB();
  b.add(P.box(hw * 2, 0.06, 2), 0x8a5a36, { y: 0.03 });
  for (const sx of [-1, 1]) b.add(P.box(0.14, 0.16, 2.04), C.woodDark, { x: sx * hw, y: 0.08 });
  for (const sz of [-1, 1]) b.add(P.box(hw * 2 + 0.1, 0.16, 0.07), C.woodDark, { z: sz, y: 0.08 });
  for (let i = 1; i < 6; i++) b.add(P.box(0.06, 0.1, 1.95), C.iron, { x: -hw + (i * hw * 2) / 6, y: 0.07 });
  return b.build();
}
// The bed's spikes (the view moves them up and down as they stab). zs: the
// bed's usual stretch along the road, so the cones stay round after it.
export function bedSpikesGeometry(hw, zs = 2.1) {
  const b = new GB();
  const nx = Math.round(hw * 2 / 0.42), nz = 5;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = -hw + 0.25 + i * ((hw * 2 - 0.5) / (nx - 1)) + (j % 2 ? 0.1 : -0.1), z = -0.8 + j * 0.4;
    b.add(P.cone(0.08, 0.5, 5), j % 2 ? C.ironLight : C.stud, { x, z, y: 0.25, sz: 1 / zs });
  }
  return b.build();
}
// A friendly rat soldier from the Summoner Tower (knight: the level 5 Rat Knights).
export function allyGeometry(knight = false) {
  const fur = 0xc9a27a, furD = 0xa8825e, pink = 0xf2a0a6, tab = knight ? 0xf3b733 : 0x7a3ad8;
  const b = new GB();
  b.add(P.cap(0.24, 0.3, 4, 8), fur, { y: 0.5 });                                // body
  b.add(P.cyl(0.25, 0.27, 0.36, 8), tab, { y: 0.5 });                              // tabard
  b.add(P.box(0.12, 0.12, 0.05), knight ? 0x7a3ad8 : 0xf3b733, { y: 0.55, z: 0.26 });
  b.add(P.sph(0.22, 10, 8), fur, { y: 0.92, z: 0.04 });                            // head
  b.add(P.cone(0.12, 0.26, 8), fur, { y: 0.9, z: 0.28, rx: Math.PI / 2 });         // snout
  b.add(P.sph(0.045, 6, 4), pink, { y: 0.9, z: 0.42 });
  for (const sx of [-1, 1]) {
    b.add(P.sph(0.11, 8, 6), furD, { x: sx * 0.17, y: 1.1, z: -0.02, sz: 0.4 });  // ears
    b.add(P.sph(0.035, 6, 4), 0x1a1210, { x: sx * 0.09, y: 0.97, z: 0.2 });       // eyes
    b.add(P.cap(0.06, 0.22, 3, 6), furD, { x: sx * 0.12, y: 0.17 });               // legs
  }
  // helmet with a plume
  b.add(P.sph(0.235, 10, 6, 0, TAU, 0, Math.PI / 2), knight ? C.gold : C.ironLight, { y: 0.98, z: 0.02 });
  b.add(P.box(0.06, 0.16, 0.26), knight ? 0xcc1f2a : 0x9a5aff, { y: 1.24, z: -0.02 });
  // shield on the left arm, sword in the right
  b.add(P.cyl(0.2, 0.2, 0.05, 12), knight ? C.gold : C.wood, { x: -0.3, y: 0.55, z: 0.12, rz: Math.PI / 2 });
  b.add(P.cyl(0.08, 0.08, 0.06, 8), knight ? 0x7a3ad8 : C.ironLight, { x: -0.33, y: 0.55, z: 0.12, rz: Math.PI / 2 });
  b.add(P.box(0.05, 0.05, 0.5), 0xe8eef2, { x: 0.3, y: 0.6, z: 0.3 });
  b.add(P.box(0.18, 0.04, 0.04), C.gold, { x: 0.3, y: 0.6, z: 0.06 });
  b.add(P.taper([[0, 0.3, -0.2], [0, 0.22, -0.45], [0, 0.35, -0.65]], 0.04, 0.01, 8, 5), pink);   // tail
  return b.build();
}
