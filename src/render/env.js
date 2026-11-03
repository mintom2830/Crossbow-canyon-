// Static canyon battlefield: ground, winding road, raised plateaus, layered
// red-rock walls and props. Everything static is merged into a handful of
// meshes so the whole environment costs ~4 draw calls.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { road, plateauOutline, plateauSdf, makeRng, groundHeight } from '../world.js';
import { GB, P, orientTriangles } from './geo.js';
import { toon, addInk, INK_PX } from './toon.js';
import { PAL, windmillTowerGeometry, barnGeometry, wellGeometry, marketGeometry, scarecrowGeometry } from './models.js';
import { fieldPoint, turn } from '../town.js';

const W = CFG.walk;

function nearRoad(x, z, r) { return road.distanceTo(x, z) < r; }
function nearSlots(x, z, r) {
  for (const s of CFG.slots) { if (Math.hypot(s.x - x, s.z - z) < r) return true; }
  if (Math.hypot(CFG.fortressPad.x - x, CFG.fortressPad.z - z) < r) return true;
  return false;
}

function smoothNoise(rng) {
  // cheap value-noise sum of sines with random phases
  const ph = Array.from({ length: 6 }, () => rng() * 100);
  return (x, z) => (Math.sin(x * 0.11 + ph[0]) * Math.cos(z * 0.09 + ph[1]) + 0.5 * Math.sin(x * 0.27 + z * 0.19 + ph[2]) + 0.25 * Math.sin(x * 0.61 - z * 0.53 + ph[3])) / 1.75;
}

export function buildEnvironment(scene, quality) {
  const rng = makeRng(99);
  const noise = smoothNoise(rng);
  const group = new THREE.Group();
  scene.add(group);

  // ---------------------------------------------------------- ground
  const gw = 170, gd = 190;
  const ground = new THREE.PlaneGeometry(gw, gd, 85, 95);
  ground.rotateX(-Math.PI / 2);
  ground.translate(2, 0, -4);
  {
    const pos = ground.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(PAL.sand), cDark = new THREE.Color(PAL.sandDark), cOlive = new THREE.Color(PAL.olive), cLight = new THREE.Color(PAL.sandLight);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = noise(x, z);
      c.copy(cSand).lerp(n > 0 ? cLight : cDark, Math.abs(n) * 0.55);
      // olive scrub near the canyon walls (as in the reference's green patches)
      const edge = Math.min(x - W.minX, W.maxX - x, z - W.minZ, W.maxZ - z);
      const o = THREE.MathUtils.clamp(1 - edge / 9, 0, 1) * THREE.MathUtils.clamp(0.6 + noise(x * 2.1, z * 1.7), 0, 1);
      c.lerp(cOlive, o * 0.75);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    ground.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const groundMesh = new THREE.Mesh(ground, toon());
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // ---------------------------------------------------------- road
  const roadGroup = new THREE.Group();
  // line > 0: instead of the full strip, just two thin edge lines of that width
  const ribbon = (halfW, y, color, wobble, sEnd, line = 0) => {
    const pts = [], cols = [];
    const out = { x: 0, z: 0, nx: 0, nz: 0 };
    const step = 0.6;
    const sStart = -12;
    const c = new THREE.Color(color);
    const positions = [];
    for (let s = sStart; s <= sEnd; s += step) {
      road.sample(Math.max(0, s), out);
      let x = out.x, z = out.z;
      if (s < 0) { x += out.tx * s; z += out.tz * s; }
      const wl = halfW + wobble * (Math.sin(s * 0.9) * 0.5 + Math.sin(s * 2.3 + 1) * 0.35 + Math.sin(s * 5.1) * 0.15);
      const wr = halfW + wobble * (Math.sin(s * 0.7 + 2) * 0.5 + Math.sin(s * 2.9) * 0.35 + Math.sin(s * 4.7 + 3) * 0.15);
      if (line) positions.push([x + out.nx * (wl + line), z + out.nz * (wl + line), x + out.nx * wl, z + out.nz * wl, x - out.nx * wr, z - out.nz * wr, x - out.nx * (wr + line), z - out.nz * (wr + line)]);
      else positions.push([x + out.nx * wl, z + out.nz * wl, x - out.nx * wr, z - out.nz * wr]);
    }
    const verts = [];
    const quad = (a, b, o) => {
      verts.push(a[o], y, a[o + 1], a[o + 2], y, a[o + 3], b[o], y, b[o + 1]);
      verts.push(a[o + 2], y, a[o + 3], b[o + 2], y, b[o + 3], b[o], y, b[o + 1]);
    };
    for (let i = 0; i < positions.length - 1; i++) {
      quad(positions[i], positions[i + 1], 0);
      if (line) quad(positions[i], positions[i + 1], 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const n = verts.length / 3;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    orientTriangles(g, () => [0, 1, 0]);
    const nr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) nr[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
    return g;
  };
  const L = road.length;
  const roadMat = toon({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const roadEdge = new THREE.Mesh(ribbon(CFG.roadHalfWidth + 0.45, 0.025, PAL.roadEdge, 0.35, L + 1.5), roadMat);
  const roadTop = new THREE.Mesh(ribbon(CFG.roadHalfWidth, 0.05, PAL.road, 0.3, L + 1.0), roadMat);
  // cartoon ink lines along both edges of the road
  const roadInk = new THREE.Mesh(ribbon(CFG.roadHalfWidth + 0.45, 0.03, PAL.roadInk, 0.35, L + 1.5, 0.09), roadMat);
  roadEdge.receiveShadow = roadTop.receiveShadow = roadInk.receiveShadow = true;
  roadGroup.add(roadEdge, roadTop, roadInk);
  // plaza at the fortress gate + footpaths to the huts
  const plaza = new GB();
  plaza.add(P.cyl(5.5, 5.5, 0.04, 28), PAL.roadEdge, { x: CFG.fortress.x + 1, y: 0.03, z: CFG.fortress.z + 4.5, sz: 0.8 });
  plaza.add(P.cyl(5.0, 5.0, 0.06, 28), PAL.road, { x: CFG.fortress.x + 1, y: 0.05, z: CFG.fortress.z + 4.5, sz: 0.8 });
  for (const h of CFG.huts) {
    const dx = h.x - CFG.fortress.x, dz = h.z - CFG.fortress.z, l = Math.hypot(dx, dz);
    plaza.add(P.box(0.9, 0.05, l), PAL.road, { x: CFG.fortress.x + dx / 2, y: 0.045, z: CFG.fortress.z + dz / 2, ry: Math.atan2(dx, dz) });
  }
  // footpaths from the square out to the farms
  for (const pts of CFG.town.paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
      plaza.add(P.box(1.0, 0.05, l + 0.9), PAL.road, { x: (x0 + x1) / 2, y: 0.045, z: (z0 + z1) / 2, ry: Math.atan2(dx, dz) });
    }
  }
  const plazaMesh = new THREE.Mesh(plaza.build(), roadMat);
  plazaMesh.receiveShadow = true;
  roadGroup.add(plazaMesh);
  group.add(roadGroup);

  // ---------------------------------------------------------- static merged
  const st = new GB();
  // plateaus
  for (const p of CFG.plateaus) {
    const outline = plateauOutline(p, 120);
    const H = CFG.plateauHeight;
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const top = new THREE.ShapeGeometry(shape, 1);
    top.rotateX(-Math.PI / 2);
    st.add(top, PAL.sand, { y: H });
    // rim lip and cliff face
    const face = [], n = outline.length;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[(i + 1) % n];
      const cx = p.x, cz = p.z;
      const o0 = [(x0 - cx), (z0 - cz)], o1 = [(x1 - cx), (z1 - cz)];
      const l0 = Math.hypot(...o0), l1 = Math.hypot(...o1);
      const flare = 0.35;
      const b0 = [x0 + o0[0] / l0 * flare, z0 + o0[1] / l0 * flare], b1 = [x1 + o1[0] / l1 * flare, z1 + o1[1] / l1 * flare];
      face.push(x0, H, z0, b0[0], 0, b0[1], x1, H, z1, b0[0], 0, b0[1], b1[0], 0, b1[1], x1, H, z1);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(face, 3));
    orientTriangles(fg, (x, y, z) => [x - p.x, 0, z - p.z]);
    fg.computeVertexNormals();
    st.add(fg, PAL.cliff, { shadeY: [0.62, 1.0] });
    // reddish rim band (the raised edge seen in the reference)
    const rim = [];
    for (let i = 0; i < n; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[(i + 1) % n];
      const k = 0.94;
      const i0 = [p.x + (x0 - p.x) * k, p.z + (z0 - p.z) * k], i1 = [p.x + (x1 - p.x) * k, p.z + (z1 - p.z) * k];
      rim.push(x0, H + 0.03, z0, x1, H + 0.03, z1, i0[0], H + 0.03, i0[1], x1, H + 0.03, z1, i1[0], H + 0.03, i1[1], i0[0], H + 0.03, i0[1]);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
    orientTriangles(rg, () => [0, 1, 0]);
    const rn = new Float32Array(rim.length); for (let i = 0; i < rn.length; i += 3) rn[i + 1] = 1;
    rg.setAttribute('normal', new THREE.BufferAttribute(rn, 3));
    st.add(rg, PAL.sandDark, {});
    // ink lines: along the lip of the plateau and where the cliff meets the ground
    const lip = [], foot = [];
    const inward = (x, z, d) => { const dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1; return [x + dx / l * d, z + dz / l * d]; };
    for (let i = 0; i < n; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[(i + 1) % n];
      const a0 = inward(x0, z0, 0.11), a1 = inward(x1, z1, 0.11);
      lip.push(x0, H + 0.045, z0, x1, H + 0.045, z1, a0[0], H + 0.045, a0[1], x1, H + 0.045, z1, a1[0], H + 0.045, a1[1], a0[0], H + 0.045, a0[1]);
      const f0 = inward(x0, z0, -0.35), f1 = inward(x1, z1, -0.35), g0 = inward(x0, z0, -0.5), g1 = inward(x1, z1, -0.5);
      foot.push(f0[0], 0.035, f0[1], g0[0], 0.035, g0[1], f1[0], 0.035, f1[1], g0[0], 0.035, g0[1], g1[0], 0.035, g1[1], f1[0], 0.035, f1[1]);
    }
    for (const pts of [lip, foot]) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      orientTriangles(lg, () => [0, 1, 0]);
      const ln = new Float32Array(pts.length); for (let i = 0; i < ln.length; i += 3) ln[i + 1] = 1;
      lg.setAttribute('normal', new THREE.BufferAttribute(ln, 3));
      st.add(lg, PAL.ink, {});
    }
  }

  // canyon walls: three terraced tiers of red rock around the floor
  const tiers = [
    { pad: 3.5, r: [3, 5], h: [2.2, 4.2], step: 4.2 },
    { pad: 9, r: [4.5, 7], h: [5, 8], step: 5.5 },
    { pad: 17, r: [6, 9], h: [9, 14], step: 7 },
  ];
  const cliffCols = [PAL.cliff, PAL.cliffLight, 0xc96842, PAL.cliffDark];
  const entry = (x, z) => {
    // keep the canyon gap open where enemies march in
    const out = { x: 0, z: 0 };
    for (let s = 0; s < 22; s += 1) { road.sample(s, out); if (Math.hypot(out.x - x, out.z - z) < 7.5) return true; }
    const ex = 38 + 10, ez = 41 + 9; // extend beyond spawn
    return Math.hypot(ex - x, ez - z) < 9 || (x > 30 && z > 33 && (x - 30) * 0.8 - (z - 33) < 6 && (z - 33) - (x - 30) * 1.2 < 6);
  };
  for (const t of tiers) {
    const x0 = W.minX - t.pad, x1 = W.maxX + t.pad, z0 = W.minZ - t.pad, z1 = W.maxZ + t.pad;
    const perim = [];
    for (let x = x0; x <= x1; x += t.step) { perim.push([x, z0]); perim.push([x, z1]); }
    for (let z = z0 + t.step; z < z1; z += t.step) { perim.push([x0, z]); perim.push([x1, z]); }
    for (const [px, pz] of perim) {
      const x = px + rng.range(-1.5, 1.5), z = pz + rng.range(-1.5, 1.5);
      if (entry(x, z)) continue;
      const r = rng.range(t.r[0], t.r[1]), h = rng.range(t.h[0], t.h[1]);
      // two or three stacked slabs = terraced mesa
      const slabs = 2 + (rng() < 0.5 ? 1 : 0);
      let y = 0, rr = r;
      for (let k = 0; k < slabs; k++) {
        const sh = h / slabs * rng.range(0.85, 1.15);
        const col = cliffCols[(k + (rng() * 3 | 0)) % 3];
        st.add(P.cyl(rr * 0.92, rr, sh, 7), col, { x, y: y + sh / 2, z, ry: rng() * 6, jitter: 0.6, jitterY: 0.25, rng, shadeY: [0.72, 1.06] });
        y += sh; rr *= rng.range(0.7, 0.85);
      }
      st.add(P.cyl(rr * 0.9, rr * 1.05, 0.35, 7), PAL.cliffTop, { x, y: y + 0.12, z, ry: rng() * 6, jitter: 0.3, jitterY: 0.1, rng });
    }
  }
  // the burrow: a dark hole in the road ringed with dug-up earth. Rats climb
  // out of it (CFG.spawnS) and march off toward the keep.
  {
    const o = { x: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
    road.sample(CFG.spawnS, o);
    const ry = Math.atan2(o.tx, o.tz);
    const brng = makeRng(77);
    st.add(P.tor(1, 0.34, 6, 18), 0x8a5a36, { x: o.x, y: 0.1, z: o.z, rx: Math.PI / 2, ry, order: 'YXZ', sx: 3.55, sy: 2.55, sz: 1.2, jitter: 0.32, jitterY: 0.4, rng: brng, shadeY: [0.75, 1.1] });
    st.add(P.cyl(1, 1, 0.05, 20), 0x2a1a10, { x: o.x, y: 0.08, z: o.z, ry, sx: 3.35, sz: 2.35 });
    st.add(P.cyl(1, 1, 0.05, 18), 0x0c0705, { x: o.x, y: 0.1, z: o.z, ry, sx: 2.6, sz: 1.7 });
    // dirt clods kicked out of the hole
    for (let i = 0; i < 14; i++) {
      const a = brng() * Math.PI * 2, r = brng.range(3.4, 4.6);
      const lx = Math.cos(a) * r * 1.15, lz = Math.sin(a) * r * 0.8;
      const x = o.x + o.nx * lx + o.tx * lz, z = o.z + o.nz * lx + o.tz * lz;
      if (Math.abs(lx) < CFG.roadHalfWidth + 0.6 && Math.abs(lz) > 2.6 && Math.abs(lz) < 4.4) continue;   // keep the rats' path clear
      st.add(P.ico(brng.range(0.18, 0.38), 0), i % 3 ? 0x7a4e2e : 0x9b6a42, { x, y: 0.12, z, ry: brng() * 6, sy: 0.7 });
    }
  }
  // spawn gate: rat-burrow palisade flanking the road where the rats pour in
  {
    const out = { x: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
    road.sample(CFG.spawnS + 4.5, out);
    for (const side of [-1, 1]) {
      const bx = out.x + out.nx * side * (CFG.roadHalfWidth + 1.4), bz = out.z + out.nz * side * (CFG.roadHalfWidth + 1.4);
      for (let i = 0; i < 4; i++) {
        const ox = out.nx * side * i * 0.55, oz = out.nz * side * i * 0.55;
        const hh = 2.6 + (i % 2) * 0.6;
        st.add(P.cyl(0.24, 0.28, hh, 6), PAL.woodDark, { x: bx + ox, y: hh / 2, z: bz + oz });
        st.add(P.cone(0.26, 0.5, 6), PAL.wood, { x: bx + ox, y: hh + 0.25, z: bz + oz });
      }
      st.add(P.box(0.06, 1.4, 0.9), 0x4a4245, { x: bx, y: 2.2, z: bz, ry: Math.atan2(out.tx, out.tz) + Math.PI / 2 });
      st.add(P.box(0.4, 0.4, 0.06), 0xf2a0a6, { x: bx, y: 2.3, z: bz + 0.06, ry: Math.atan2(out.tx, out.tz) + Math.PI / 2 });
    }
  }

  // the town's yards, fields and paths stay clear of random rocks and bushes
  const T = CFG.town;
  const townZones = [];
  for (const h of CFG.huts) townZones.push([h.x, h.z, 3.0]);
  for (const f of T.fields) townZones.push([f.x, f.z, Math.hypot(f.w, f.d) / 2 + 1.2]);
  townZones.push([T.windmill.x, T.windmill.z, 3.6], [T.barn.x, T.barn.z, 5], [T.well.x, T.well.z, 2.2], [T.market.x, T.market.z, 2.8], [T.square.x, T.square.z, 6.5]);
  for (const pts of T.paths) for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5);
    for (let k = 0; k <= n; k++) townZones.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, 1.6]);
  }
  const inTown = (x, z) => townZones.some(([zx, zz, zr]) => Math.hypot(zx - x, zz - z) < zr);

  // props
  const placeProp = (minRoad = 5, slotClear = 3.5) => {
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.range(W.minX + 1, W.maxX - 1), z = rng.range(W.minZ + 1, W.maxZ - 1);
      if (nearRoad(x, z, minRoad) || nearSlots(x, z, slotClear)) continue;
      if (Math.hypot(x - CFG.fortress.x, z - CFG.fortress.z) < 8) continue;
      if (CFG.plateaus.some((p) => plateauSdf(p, x, z) > -1.2)) continue; // keep build plateaus clean
      if (CFG.huts.some((h) => Math.hypot(h.x - x, h.z - z) < 3) || inTown(x, z)) continue;
      return [x, z, groundHeight(x, z)];
    }
    return null;
  };
  for (let i = 0; i < 46; i++) { // scrub bushes: little clusters
    const p = placeProp(4.6, 2.8); if (!p) continue;
    const col = rng() < 0.5 ? PAL.olive : 0x8f9a3e;
    const n = 2 + (rng() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const s = rng.range(0.25, 0.5);
      st.add(P.ico(s, 0), col, { x: p[0] + rng.range(-0.5, 0.5), y: p[2] + s * 0.45, z: p[1] + rng.range(-0.5, 0.5), sy: 0.75, jitter: 0.1, rng });
    }
  }
  for (let i = 0; i < 46; i++) { // rocks
    const p = placeProp(4.4, 2.6); if (!p) continue;
    const s = rng.range(0.3, 0.8);
    st.add(P.dod(s, 0), rng() < 0.6 ? 0xc77a52 : PAL.stone, { x: p[0], y: p[2] + s * 0.35, z: p[1], sy: 0.6, ry: rng() * 6, jitter: 0.12, rng });
  }
  for (let i = 0; i < 9; i++) { // desert cacti
    const p = placeProp(5.5, 4); if (!p) continue;
    const h = rng.range(1.4, 2.4), c = 0x6c9a49;
    st.add(P.cap(0.22, h, 3, 7), c, { x: p[0], y: p[2] + h / 2 + 0.2, z: p[1] });
    st.add(P.cap(0.14, 0.6, 3, 6), c, { x: p[0] + 0.38, y: p[2] + h * 0.7, z: p[1] });
    st.add(P.cap(0.13, 0.35, 3, 6), c, { x: p[0] + 0.2, y: p[2] + h * 0.5, z: p[1], rz: Math.PI / 2 });
  }
  // barrels & crates by the huts, torches along the plaza
  for (const h of CFG.huts) {
    const a = rng() * 6;
    st.add(P.cyl(0.33, 0.33, 0.8, 9), PAL.wood, { x: h.x + Math.cos(a) * 2, y: 0.4, z: h.z + Math.sin(a) * 2 });
    st.add(P.box(0.7, 0.7, 0.7), PAL.woodLight, { x: h.x + Math.cos(a + 1) * 2.1, y: 0.35, z: h.z + Math.sin(a + 1) * 2.1, ry: a });
  }
  const torches = [];
  for (const [tx, tz] of [[-13, -34], [-23, -34.5], [-8.5, -26], [-29.5, -28.5]]) {
    st.add(P.cyl(0.08, 0.1, 1.8, 6), PAL.woodDark, { x: tx, y: 0.9, z: tz });
    st.add(P.cyl(0.2, 0.12, 0.25, 8), PAL.iron, { x: tx, y: 1.85, z: tz });
    torches.push([tx, 2.1, tz]);
  }
  // cart near the keep
  st.add(P.box(1.8, 0.5, 1.1), PAL.plank, { x: -30, y: 0.75, z: -48, ry: 0.4 });
  st.add(P.cyl(0.45, 0.45, 0.12, 10), PAL.woodDark, { x: -30.2, y: 0.45, z: -47.3, ry: 0.4, rx: Math.PI / 2, rz: 0.4 });
  st.add(P.cyl(0.45, 0.45, 0.12, 10), PAL.woodDark, { x: -29.6, y: 0.45, z: -48.7, ry: 0.4, rx: Math.PI / 2, rz: 0.4 });
  // fence posts lining the last stretch of road
  for (let s = road.length - 26; s < road.length - 6; s += 2.2) {
    const o = { x: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 }; road.sample(s, o);
    for (const side of [1]) {
      const x = o.x + o.nx * side * (CFG.roadHalfWidth + 1.0), z = o.z + o.nz * side * (CFG.roadHalfWidth + 1.0);
      if (nearSlots(x, z, 2.5)) continue;
      st.add(P.box(0.16, 0.9, 0.16), PAL.wood, { x, y: 0.45, z });
      st.add(P.box(0.08, 0.1, 2.2), PAL.woodLight, { x, y: 0.7, z, ry: Math.atan2(o.tx, o.tz) });
    }
  }
  // ---------------------------------------------------------- farms, windmill, barn, well, market
  const place = (geo, x, z, ry) => st.add(geo, 0, { x, y: groundHeight(x, z), z, ry, keep: true });
  place(windmillTowerGeometry(), T.windmill.x, T.windmill.z, 0);
  place(barnGeometry(), T.barn.x, T.barn.z, T.barn.rot);
  place(wellGeometry(), T.well.x, T.well.z, 0.3);
  place(marketGeometry(), T.market.x, T.market.z, T.market.rot);
  const crops = new GB();
  const crop = (type, x, z, k) => {
    if (type === 'wheat') {
      for (let j = 0; j < 3; j++) {
        const a = j * 2.1 + k, rr = 0.07;
        crops.add(P.cone(0.055, 0.5, 5), j ? 0xe9c35a : 0xd2a443, { x: x + Math.cos(a) * rr, y: 0.37, z: z + Math.sin(a) * rr, rx: Math.sin(a) * 0.16, rz: -Math.cos(a) * 0.16 });
      }
    } else if (type === 'cabbage') {
      crops.add(P.ico(0.2, 0), 0x6faa3e, { x, y: 0.22, z, sy: 0.75, ry: k });
      crops.add(P.ico(0.12, 0), 0x9fd060, { x, y: 0.33, z, ry: k * 2 });
    } else if (type === 'pumpkin') {
      crops.add(P.sph(0.24, 7, 5), 0xf08a2a, { x, y: 0.27, z, sy: 0.72, flat: true });
      crops.add(P.cyl(0.03, 0.035, 0.14, 5), 0x5a7a2a, { x, y: 0.47, z });
      crops.add(P.box(0.3, 0.03, 0.2), 0x5f9a3a, { x: x + 0.24, y: 0.14, z: z + 0.06, ry: k });
    } else {   // corn
      crops.add(P.cyl(0.035, 0.05, 1.35, 5), 0x7aa53a, { x, y: 0.78, z });
      crops.add(P.box(0.05, 0.55, 0.16), 0x8fbf4a, { x: x + 0.1, y: 0.75, z, rz: -0.6, ry: k });
      crops.add(P.box(0.05, 0.5, 0.16), 0x8fbf4a, { x: x - 0.1, y: 1.0, z, rz: 0.6, ry: k });
      crops.add(P.cyl(0.065, 0.05, 0.26, 6), 0xf2cf4a, { x: x + 0.07, y: 0.9, z: z + 0.04, rz: -0.3 });
      crops.add(P.cone(0.05, 0.25, 5), 0xd8b45a, { x, y: 1.55, z });
    }
  };
  const SPACING = { wheat: 0.45, cabbage: 0.7, pumpkin: 0.95, corn: 0.7 };
  for (const f of T.fields) {
    st.add(P.box(f.w, 0.1, f.d), 0x8a5a36, { x: f.x, y: 0.03, z: f.z, ry: f.rot });
    const rows = Math.max(2, Math.floor(f.d / 0.8));
    for (let i = 0; i < rows; i++) {
      const v = (i + 0.5) / rows - 0.5;
      const c = fieldPoint(f, 0, v);
      st.add(P.box(f.w - 0.4, 0.07, 0.36), 0x6e4526, { x: c.x, y: 0.1, z: c.z, ry: f.rot });
      const sp = SPACING[f.crop], n = Math.floor((f.w - 0.6) / sp);
      for (let j = 0; j < n; j++) {
        const u = ((j + 0.5) / n - 0.5) * (f.w - 0.6) / f.w;
        if (f.scarecrow && Math.abs(u - 0.15) < 0.07 && Math.abs(v) < 0.2) continue;
        const p = fieldPoint(f, u, v);
        crop(f.crop, p.x, p.z, i * 7 + j * 3);
      }
    }
    // a low wooden fence with a gap in the front side
    const hw = f.w / 2 + 0.45, hd = f.d / 2 + 0.45;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (let e = 0; e < 4; e++) {
      const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.6));
      const ry = f.rot + (e % 2 ? Math.PI / 2 : 0);
      for (let k = 0; k <= n; k++) {
        const [dx, dz] = turn(ax + (bx - ax) * k / n, az + (bz - az) * k / n, f.rot);
        st.add(P.box(0.1, 0.6, 0.1), PAL.wood, { x: f.x + dx, y: 0.3, z: f.z + dz });
        if (k === n || (e === 2 && k === Math.floor(n / 2))) continue;   // the gate gap faces the front
        const [mx, mz] = turn(ax + (bx - ax) * (k + 0.5) / n, az + (bz - az) * (k + 0.5) / n, f.rot);
        for (const y of [0.24, 0.46]) st.add(P.box(len / n, 0.06, 0.05), PAL.woodLight, { x: f.x + mx, y, z: f.z + mz, ry });
      }
    }
    if (f.scarecrow) { const p = fieldPoint(f, 0.15, 0); place(scarecrowGeometry(), p.x, p.z, f.rot); }
  }
  // hay bales by the windmill
  for (const [dx, dz] of [[-2.2, 1.6], [-1.6, 2.5]]) st.add(P.cyl(0.45, 0.45, 0.95, 10), 0xe0c060, { x: T.windmill.x + dx, y: 0.45, z: T.windmill.z + dz, rz: Math.PI / 2, ry: 0.4 });
  const cropMesh = new THREE.Mesh(crops.build(), toon());
  cropMesh.receiveShadow = true;
  addInk(cropMesh, INK_PX.thin);
  group.add(cropMesh);

  const staticMesh = new THREE.Mesh(st.build(), toon());
  staticMesh.castShadow = quality !== 'low';
  staticMesh.receiveShadow = true;
  addInk(staticMesh, INK_PX.terrain);   // ink outlines round cliffs, plateaus and props
  group.add(staticMesh);

  return { group, torches, ground: groundMesh };
}
