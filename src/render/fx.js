// Instanced effect pools: puffs, ground smudges, hit sparks, flying coins,
// build flashes. Every pool is one InstancedMesh (one draw call).
import * as THREE from 'three';
import { radialTexture } from './geo.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, inkInstanced, INK_PX } from './toon.js';
import { coinGeometry, PAL } from './models.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color(), _v = new THREE.Vector3(), _qz = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const INK_CSS = '#4a3326';   // the same soft brown as the 3D outlines (toon.js)

// ---- cartoon sprites, drawn once on canvases with an ink outline. The fill is
// white (a touch greyer at the rim), so each instance's colour tints it.
function canvasTexture(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.lineJoin = 'round'; x.lineCap = 'round';
  draw(x, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rimFill = (x, c, r) => { const g = x.createRadialGradient(c, c, 0, c, c, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#ffffff'); g.addColorStop(1, '#cfcfcf'); return g; };
// a spiky comic "pow" burst: where an arrow strikes, a cannonball lands or a giant falls
function burstTexture() {
  return canvasTexture((x, S) => {
    const c = S / 2, n = 9;
    x.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = (i % 2 ? 0.25 : i % 4 === 0 ? 0.46 : 0.38) * S;
      x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    x.closePath();
    x.fillStyle = rimFill(x, c, S * 0.46); x.fill();
    x.lineWidth = S * 0.022; x.strokeStyle = INK_CSS; x.stroke();
  });
}
// a four-point twinkle: coins glinting, coins collected
function twinkleTexture() {
  return canvasTexture((x, S) => {
    const c = S / 2, r = S * 0.44, w = S * 0.07;
    x.beginPath();
    x.moveTo(c, c - r);
    x.quadraticCurveTo(c + w, c - w, c + r, c); x.quadraticCurveTo(c + w, c + w, c, c + r);
    x.quadraticCurveTo(c - w, c + w, c - r, c); x.quadraticCurveTo(c - w, c - w, c, c - r);
    x.closePath();
    x.fillStyle = '#ffffff'; x.fill();
    x.lineWidth = S * 0.018; x.strokeStyle = INK_CSS; x.stroke();
  });
}
// a cartoon splat: a lumpy blob with a few droplets around it, inked
function splatTexture() {
  return canvasTexture((x, S) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const c = S / 2, n = 11, pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const r = S * (0.26 + rnd() * 0.13); pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]); }
    const blob = () => {
      x.beginPath();
      const mid = (i) => { const a = pts[i % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      const m0 = mid(n - 1); x.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) { const m = mid(i); x.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
      x.closePath();
    };
    const drops = [];
    for (let i = 0; i < 6; i++) { const a = rnd() * Math.PI * 2, r = S * (0.4 + rnd() * 0.06); drops.push([c + Math.cos(a) * r, c + Math.sin(a) * r, S * (0.025 + rnd() * 0.035)]); }
    x.lineWidth = S * 0.02; x.strokeStyle = INK_CSS;
    blob(); x.fillStyle = '#e4e4e4'; x.fill(); x.stroke();
    for (const [dx, dy, r] of drops) { x.beginPath(); x.arc(dx, dy, r, 0, Math.PI * 2); x.fill(); x.stroke(); }
    x.fillStyle = '#ffffff';   // a shiny highlight
    x.beginPath(); x.ellipse(c - S * 0.08, c - S * 0.09, S * 0.09, S * 0.05, -0.6, 0, Math.PI * 2); x.fill();
  });
}
const easeBack = (k) => { const c1 = 2.2, c3 = c1 + 1, u = k - 1; return 1 + c3 * u * u * u + c1 * u * u; };

class Pool {
  constructor(mesh, max, fx = null) {
    this.mesh = mesh; this.max = max; this.fx = fx;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
  }
  // fx.lift raises an effect onto the ground under it (a hill on Level 2); g remembers that ground
  spawn(o) {
    const lift = this.fx ? this.fx.lift : 0;
    o.g = lift;
    if (lift && o.y !== undefined) o.y += lift;
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(o);
    return o;
  }
}

export class FX {
  constructor(scene, camera) {
    this.lift = 0;   // set around a call to raise its effects onto the ground (a hill) under them
    this.scene = scene; this.camera = camera;
    // ---- puffs (death clouds)
    const puffGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const puffMat = toon({ vertexColors: false, color: 0xffffff, emissive: 0x6a6460 });
    this.puffs = new Pool(new THREE.InstancedMesh(puffGeo, puffMat, 420), 420, this);
    this.puffs.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.puffs.mesh);
    inkInstanced(this.puffs.mesh, INK_PX.thin);   // cartoon smoke puffs with an ink rim
    // ---- cartoon splats left on the ground by defeated monsters (tinted per kind)
    const splatGeo = new THREE.PlaneGeometry(1.5, 1.5); splatGeo.rotateX(-Math.PI / 2);
    const splatMat = new THREE.MeshBasicMaterial({ map: splatTexture(), transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.dust = new Pool(new THREE.InstancedMesh(splatGeo, splatMat, 560), 560, this);
    this.dust.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.dust.mesh);
    // ---- droplets flung out of a splat: they arc, land and leave a little splat each
    this.drops = new Pool(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), toon({ vertexColors: false, color: 0xffffff }), 260), 260, this);
    this.drops.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.drops.mesh);
    inkInstanced(this.drops.mesh, INK_PX.thin);
    // ---- inked comic bursts (impacts) and twinkles (coins), always facing the camera
    const quad = new THREE.PlaneGeometry(1, 1);
    const spriteMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.05, depthWrite: false });
    this.bursts = new Pool(new THREE.InstancedMesh(quad, spriteMat(burstTexture()), 160), 160, this);
    this.bursts.mesh.setColorAt(0, _c.set(0xffffff)); this.bursts.mesh.renderOrder = 4;
    scene.add(this.bursts.mesh);
    this.twinkles = new Pool(new THREE.InstancedMesh(quad, spriteMat(twinkleTexture()), 60), 60, this);
    this.twinkles.mesh.setColorAt(0, _c.set(0xffffff)); this.twinkles.mesh.renderOrder = 4;
    scene.add(this.twinkles.mesh);
    // ---- scorch marks left by cannon blasts
    const scorchGeo = new THREE.CircleGeometry(1, 14); scorchGeo.rotateX(-Math.PI / 2);
    const scorchMat = new THREE.MeshBasicMaterial({ color: 0x3b2a1f, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.scorch = new Pool(new THREE.InstancedMesh(scorchGeo, scorchMat, 80), 80, this);
    scene.add(this.scorch.mesh);
    // ---- additive glow sprites (hit sparks, build glow, muzzle flash)
    const glowTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: false });
    this.glows = new Pool(new THREE.InstancedMesh(glowGeo, glowMat, 160), 160, this);
    this.glows.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.glows.mesh);
    // ---- expanding rings (construction complete, pad appear)
    const ringGeo = new THREE.RingGeometry(0.82, 1, 32); ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.rings = new Pool(new THREE.InstancedMesh(ringGeo, ringMat, 64), 64, this);
    this.rings.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.rings.mesh);
    // ---- flying coins (paid into pads)
    const coinMat = toon({ emissive: 0x6a4400 });
    this.fly = new Pool(new THREE.InstancedMesh(coinGeometry(), coinMat, 80), 80, this);
    scene.add(this.fly.mesh);
    inkInstanced(this.fly.mesh, INK_PX.prop);
    // ---- confetti chips
    const chipGeo = new THREE.BoxGeometry(0.16, 0.16, 0.04);
    const chipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.chips = new Pool(new THREE.InstancedMesh(chipGeo, chipMat, 220), 220, this);
    this.chips.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.chips.mesh);
    // ---- green plus signs floating up from healed rats (camera-facing, ink outlined)
    const plusGeo = mergeGeometries([new THREE.BoxGeometry(0.42, 0.13, 0.05), new THREE.BoxGeometry(0.13, 0.42, 0.05)]);
    this.plusses = new Pool(new THREE.InstancedMesh(plusGeo, new THREE.MeshBasicMaterial({ color: 0x5cf27a }), 90), 90, this);
    scene.add(this.plusses.mesh);
    inkInstanced(this.plusses.mesh, INK_PX.thin);
    // ---- glowing beams between two points (lightning, sniper tracers)
    const beamGeo = new THREE.BoxGeometry(1, 1, 1); beamGeo.translate(0, 0, 0.5);
    this.beams = new Pool(new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 420), 420, null);
    this.beams.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.beams.mesh);
  }

  // a straight glowing beam from (x0,y0,z0) to (x1,y1,z1), w wide, fading over life
  beam(x0, y0, z0, x1, y1, z1, w, color, life = 0.15) {
    this.beams.spawn({ x0, y0, z0, x1, y1, z1, w, color, t: 0, life });
  }
  // a crackling lightning bolt along pts ([x,y,z,...] flat list), jagged between each pair
  lightning(pts, color = 0x8fd8ff, w = 0.14, life = 0.16) {
    for (let i = 0; i + 5 < pts.length; i += 3) {
      let ax = pts[i], ay = pts[i + 1], az = pts[i + 2];
      const bx = pts[i + 3], by = pts[i + 4], bz = pts[i + 5];
      const n = 4, len = Math.hypot(bx - ax, by - ay, bz - az), j = Math.min(0.6, len * 0.12);
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const x = k === n ? bx : ax + (bx - ax) / (n - k + 1) + (Math.random() - 0.5) * j;
        const y = k === n ? by : ay + (by - ay) / (n - k + 1) + (Math.random() - 0.5) * j;
        const z = k === n ? bz : az + (bz - az) / (n - k + 1) + (Math.random() - 0.5) * j;
        this.beam(ax, ay, az, x, y, z, w, color, life);
        this.beam(ax, ay, az, x, y, z, w * 0.4, 0xffffff, life * 0.8);
        ax = x; ay = y; az = z;
        void f;
      }
      this.glow(bx, by, bz, 1.3, color, life * 1.4);
    }
  }

  puff(x, y, z, color = 0xffffff, big = 1) {
    const n = big > 1.5 ? 6 : 2;
    for (let i = 0; i < n; i++) {
      this.puffs.spawn({ x: x + (Math.random() - 0.5) * 0.5 * big, y: y + 0.3 + Math.random() * 0.4 * big, z: z + (Math.random() - 0.5) * 0.5 * big, t: 0, life: 0.42 + Math.random() * 0.2, s: (0.6 + Math.random() * 0.5) * big, color, vy: 0.8 + Math.random() });
    }
  }
  // one small smoke puff left hanging in the air (cannonball trails)
  trail(x, y, z, size = 0.35, color = 0xd8d0c6) {
    this.puffs.spawn({ x, y, z, t: 0, life: 0.5 + Math.random() * 0.2, s: size * (0.8 + Math.random() * 0.4), color, vy: 0.25 });
  }
  // a cartoon splat on the ground (pops in, lingers, shrinks away)
  smudge(x, y, z, big = 1, color = 0xb79ac4, life = 4) {
    this.dust.spawn({ x, y: y + 0.07, z, t: 0, life: life * (0.85 + Math.random() * 0.3), s: (0.85 + Math.random() * 0.3) * big, r: Math.random() * 6, sq: 0.8 + Math.random() * 0.4, color });
  }
  // a defeated monster's splash: a splat, plus droplets that fly out and land in little splats
  splash(x, z, big = 1, color = 0xb79ac4, drops = 3) {
    this.smudge(x, 0, z, big, color);
    const busy = this.dust.items.length > this.dust.max * 0.8;
    const n = busy ? Math.min(1, drops) : drops;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (1.4 + Math.random() * 1.8) * Math.sqrt(big);
      this.drops.spawn({ x, y: 0.3 + 0.25 * big, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 3 + Math.random() * 2.5, t: 0, s: (0.8 + Math.random() * 0.6) * Math.min(1.8, 0.7 + big * 0.35), color, mark: !busy });
    }
  }
  // an inked comic burst, nudged towards the camera so it isn't hidden inside what it hit
  star(x, y, z, size = 1, color = 0xfff3c0, life = 0.2, lift = 0.5) {
    this.bursts.spawn({ x, y, z, t: 0, life, s: size, color, r: Math.random() * 6.28, lift });
  }
  twinkle(x, y, z, size = 0.5, color = 0xffffff) {
    this.twinkles.spawn({ x, y, z, t: 0, life: 0.45, s: size, color, r: Math.random() * 0.6 - 0.3 });
  }
  glow(x, y, z, size, color, life = 0.25) {
    this.glows.spawn({ x, y, z, t: 0, life, s: size, color });
  }
  ring(x, y, z, size, color, life = 0.6) {
    this.rings.spawn({ x, y: y + 0.12, z, t: 0, life, s: size, color });
  }
  flyCoin(fx, fy, fz, tx, ty, tz) {
    this.fly.spawn({ fx, fy, fz, tx, ty, tz, t: 0, life: 0.32 + Math.random() * 0.1 });
  }
  confetti(x, y, z, n = 24, colors = [PAL.gold, 0xffffff, PAL.teal, PAL.orange]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      this.chips.spawn({ x, y, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 5 + Math.random() * 5, t: 0, life: 1 + Math.random() * 0.5, r: Math.random() * 6, rs: (Math.random() - 0.5) * 20, color: colors[i % colors.length] });
    }
  }
  // Cannon blast. style: 'fire' (levels 1-5), 'crystal' (6), 'nova' (7)
  explosion(x, z, r, style = 'fire') {
    const big = r / 2;
    const col = style === 'nova' ? 0xc07bff : style === 'crystal' ? 0x7ff3ff : 0xffa23a;
    this.star(x, 0.9, z, r * 1.05, style === 'nova' ? 0xe6ccff : style === 'crystal' ? 0xcffaff : 0xffd47a, 0.2, 0.9);   // comic "pow"
    this.glow(x, 1.0, z, r * 2.6, col, style === 'nova' ? 0.6 : 0.32);
    this.glow(x, 0.8, z, r * 1.3, 0xffffff, 0.16);
    this.ring(x, 0, z, r / 1.7, col, 0.42);
    const n = Math.min(14, Math.round(3 + r * 2.2));
    const smoke = style === 'fire' ? [0xd8cfc4, 0xffc27a, 0xb9afa5] : style === 'crystal' ? [0xcff8ff, 0x8ef0ff, 0xffffff] : [0xe2c8ff, 0xb57cff, 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.65;
      this.puffs.spawn({ x: x + Math.cos(a) * d, y: 0.3 + Math.random() * 0.6, z: z + Math.sin(a) * d, t: 0, life: 0.5 + Math.random() * 0.35, s: (0.7 + Math.random() * 0.7) * big, color: smoke[i % 3], vy: 1.2 + Math.random() * 1.2 });
    }
    this.confetti(x, 0.6, z, Math.round(6 + r * 2), style === 'fire' ? [0x3a3330, 0xff8a2a, 0x5a4a40] : style === 'crystal' ? [0x7ff3ff, 0xffffff, 0x3aa9d8] : [0xc07bff, 0xffffff, 0x7a3ad8]);
    this.scorch.spawn({ x, y: 0.075, z, t: 0, life: 5, s: r * 0.85, r: Math.random() * 6 });
  }
  // Frost Arrows freeze: an icy flash and a few ice chips
  frost(x, z, giant) {
    const s = giant ? 1.7 : 0.8;
    this.glow(x, giant ? 1.7 : 0.6, z, 1.6 * s, 0xbff8ff, 0.32);
    this.ring(x, 0, z, 0.9 * s, 0x9ff3ff, 0.45);
    for (let i = 0; i < (giant ? 10 : 3); i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2 * s;
      this.chips.spawn({ x, y: 0.5 * s, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 3 + Math.random() * 3, t: 0, life: 0.6 + Math.random() * 0.3, r: Math.random() * 6, rs: (Math.random() - 0.5) * 16, color: i % 2 ? 0xffffff : 0x9ff3ff });
    }
  }
  // a green plus sign rising from a healed rat
  plus(x, y, z) {
    this.plusses.spawn({ x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.3, t: 0, life: 0.8 + Math.random() * 0.2 });
  }
  // a healer's pulse: a green ring and glow
  heal(x, z, r) {
    this.ring(x, 0, z, r / 1.6, 0x5cf27a, 0.6);
    this.glow(x, 1.0, z, 2.4, 0x8dff9a, 0.35);
    this.plus(x, 1.3, z);
  }
  // a shield splinters: wood chips, a puff
  shieldBreak(x, z) {
    this.confetti(x, 0.6, z, 12, [0xa8733f, 0x8a5a30, 0x5b6068, 0xd8262d]);
    this.puff(x, 0, z, 0xe0d0b0, 1);
    this.glow(x, 0.6, z, 1.6, 0xffe6b0, 0.15);
  }
  // a brood rat bursts open: burlap scraps and a dusty puff
  burst(x, z) {
    this.puff(x, 0, z, 0xd8c09a, 1.8);
    this.confetti(x, 0.7, z, 14, [0xc9a46a, 0x8a6a3a, 0xa08c94, 0xf2a0a6]);
    this.glow(x, 0.8, z, 2.4, 0xffe2c0, 0.2);
  }
  // a slime bursts: green goo puffs and blobs, a splash ring
  splat(x, z, big = 1) {
    this.puff(x, 0, z, 0x8ad85a, 1.6 * big);
    this.confetti(x, 0.8, z, Math.round(10 + 8 * big), [0x7ccf4e, 0x4c9a32, 0xc4f58a]);
    this.ring(x, 0, z, 1.5 * big, 0x9cf06a, 0.5);
    this.glow(x, 0.8, z, 2.6 * big, 0xc4f58a, 0.2);
    this.splash(x, z, 1.5 * big, 0x8ad85a, Math.round(4 + 3 * big));
  }
  // the ground bursts open (the Tunnel Mole digging in or climbing out)
  dirt(x, z, big = 1) {
    for (let i = 0; i < 3; i++) this.puff(x + (Math.random() - 0.5) * big * 2, 0, z + (Math.random() - 0.5) * big * 2, i % 2 ? 0x9b7650 : 0xc9a676, 1.7 * big);
    this.confetti(x, 0.6, z, Math.round(10 + 8 * big), [0x8a6240, 0x6e4a2e, 0x8e98a6, 0xc9a676]);
    this.ring(x, 0, z, 1.6 * big, 0xd9b48a, 0.55);
    this.scorch.spawn({ x, y: 0.075, z, t: 0, life: 6, s: 1.3 * big, r: Math.random() * 6 });
  }
  shockRing(x, z, r, color) {
    this.rings.spawn({ x, y: 0.2, z, t: 0, life: 0.55, s: r / 1.7, color });
    this.rings.spawn({ x, y: 0.25, z, t: -0.08, life: 0.6, s: r / 1.9, color: 0xffffff });
  }

  buildFlash(x, y, z, scale = 1) {
    this.glow(x, y + 1.2 * scale, z, 4.5 * scale, 0xffd25a, 0.55);
    this.glow(x, y + 0.6, z, 2.6 * scale, 0xffffff, 0.3);
    this.ring(x, y, z, 1.4 * scale, 0xffd25a, 0.55);
    this.ring(x, y, z, 1.0 * scale, 0xffffff, 0.4);
    this.confetti(x, y + 1, z, Math.round(26 * scale));
  }

  update(dt) {
    const camQ = this.camera.quaternion;
    // puffs
    {
      const P = this.puffs, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life;
        const s = o.s * (k < 0.35 ? 0.5 + k / 0.35 * 0.5 : 1 - (k - 0.35) / 0.65 * 0.95);
        _p.set(o.x, o.y + o.vy * o.t, o.z); _s.set(s, s, s);
        _m.compose(_p, _q.identity(), _s);
        mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(o.color)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // scorch marks
    {
      const P = this.scorch, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life;
        const s = o.s * (k < 0.05 ? k / 0.05 : 1 - Math.max(0, (k - 0.6) / 0.4));
        _p.set(o.x, o.y, o.z); _s.set(s, 1, s * 0.85); _q.setFromAxisAngle(UP, o.r);
        _m.compose(_p, _q, _s); mesh.setMatrixAt(n++, _m);
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }
    // cartoon splats: pop in with an overshoot, linger, then shrink away
    {
      const P = this.dust, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life, pop = Math.min(1, o.t / 0.16);
        const s = o.s * (pop < 1 ? Math.max(0.01, easeBack(pop)) : 1) * (1 - Math.max(0, (k - 0.75) / 0.25));
        _p.set(o.x, o.y, o.z); _s.set(s, 1, s * (o.sq || 0.8)); _q.setFromAxisAngle(UP, o.r);
        _m.compose(_p, _q, _s); mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(o.color || 0xb79ac4)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // droplets: arc out, land, leave a small splat
    {
      const P = this.drops, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt;
        o.vy -= 20 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        if (o.y <= o.g + 0.08 || o.t > 2) { if (o.mark && o.t <= 2) this.smudge(o.x, o.g + 0.005, o.z, 0.2 + o.s * 0.12, o.color, 2.6); continue; }
        P.items[j++] = o;
        const st = 1 + Math.min(0.6, Math.abs(o.vy) * 0.05);   // stretched by its speed
        _p.set(o.x, o.y, o.z); _s.set(o.s, o.s * st, o.s);
        _m.compose(_p, _q.identity(), _s); mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(o.color)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // comic bursts and twinkles: snap open, then shrink (camera-facing)
    for (const P of [this.bursts, this.twinkles]) {
      const mesh = P.mesh, burst = P === this.bursts; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life;
        const s = o.s * (burst ? (k < 0.25 ? 0.5 + 2.6 * k : 1.15 * (1 - (k - 0.25) / 0.75 * 0.85)) : Math.sin(k * Math.PI));
        _p.set(o.x, o.y, o.z);
        if (o.lift) { _v.copy(this.camera.position).sub(_p).normalize().multiplyScalar(o.lift); _p.add(_v); }
        _qz.setFromAxisAngle(ZAX, o.r + (burst ? k * 0.5 : k * 1.2));
        _q.copy(camQ).multiply(_qz); _s.set(s, s, s);
        _m.compose(_p, _q, _s); mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(o.color)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // beams
    {
      const P = this.beams, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life;
        _v.set(o.x1 - o.x0, o.y1 - o.y0, o.z1 - o.z0);
        const len = _v.length() || 0.001;
        _q.setFromUnitVectors(ZAX, _v.multiplyScalar(1 / len));
        const w = o.w * (1 - k * 0.6);
        _p.set(o.x0, o.y0, o.z0); _s.set(w, w, len);
        _m.compose(_p, _q, _s); mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(o.color).multiplyScalar(1 - k * k)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // glows (camera-facing)
    {
      const P = this.glows, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life;
        const s = o.s * (k < 0.2 ? 0.4 + k / 0.2 * 0.6 : 1 - (k - 0.2) / 0.8);
        _p.set(o.x, o.y, o.z); _s.set(s, s, s);
        _m.compose(_p, camQ, _s); mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(o.color)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // rings
    {
      const P = this.rings, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = Math.max(0, o.t) / o.life;
        const s = o.s * (0.3 + k * 1.4);
        _p.set(o.x, o.y, o.z); _s.set(s, 1, s);
        _m.compose(_p, _q.identity(), _s); mesh.setMatrixAt(n, _m);
        mesh.setColorAt(n, _c.set(o.color).multiplyScalar(1 - k)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // flying coins (arc from hero to pad)
    {
      const P = this.fly, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life;
        _p.set(o.fx + (o.tx - o.fx) * k, o.fy + (o.ty - o.fy) * k + Math.sin(k * Math.PI) * 1.6, o.fz + (o.tz - o.fz) * k);
        _q.setFromAxisAngle(UP, o.t * 18); _s.set(1, 1, 1);
        _m.compose(_p, _q, _s); mesh.setMatrixAt(n++, _m);
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }
    // confetti
    {
      const P = this.chips, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        o.vy -= 18 * dt; o.x += o.vx * dt; o.y = Math.max(o.g + 0.1, o.y + o.vy * dt); o.z += o.vz * dt; o.r += o.rs * dt;
        if (o.y <= o.g + 0.1) { o.vx *= 0.8; o.vz *= 0.8; }
        const s = 1 - Math.max(0, (o.t / o.life - 0.7) / 0.3);
        _p.set(o.x, o.y, o.z); _e.set(o.r, o.r * 0.7, 0); _q.setFromEuler(_e); _s.set(s, s, s);
        _m.compose(_p, _q, _s); mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(o.color)); n++;
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // plus signs: rise, grow in, shrink out
    {
      const P = this.plusses, mesh = P.mesh; let n = 0, j = 0;
      for (const o of P.items) {
        o.t += dt; if (o.t >= o.life) continue; P.items[j++] = o;
        const k = o.t / o.life;
        const s = k < 0.2 ? k / 0.2 : 1 - Math.max(0, (k - 0.6) / 0.4);
        _p.set(o.x, o.y + k * 1.1, o.z); _s.set(s, s, s);
        _m.compose(_p, camQ, _s); mesh.setMatrixAt(n++, _m);
      }
      P.items.length = j; mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear() { for (const p of [this.puffs, this.dust, this.drops, this.bursts, this.twinkles, this.glows, this.rings, this.fly, this.chips, this.scorch, this.plusses, this.beams]) { p.items.length = 0; p.mesh.count = 0; } }
}
