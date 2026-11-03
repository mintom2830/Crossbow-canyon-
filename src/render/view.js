// Renders the simulation: camera, lights, units, structures, pads, labels.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { groundHeight, hillHeight, road } from '../world.js';
import { T_GRUNT, T_BOSS, SHIELD, BOMB, NINJA, JET } from '../sim.js';
import { buildEnvironment } from './env.js';
import { FX } from './fx.js';
import { radialTexture, GB, P } from './geo.js';
import { toon, toonGradient, INK_PX, inkUniforms, addInk, inkInstanced, inkGeometry, inkNormals, setInkedGeometry } from './toon.js';
import { ratMaterial, attackPhase } from './ratanim.js';
import { TownView } from './town.js';
import { Portraits } from './portraits.js';
import { turn } from '../town.js';
import {
  PAL, gruntGeometry, gruntInkGeometry, SHIELDLESS, giantParts, heroParts, towerParts, cannonParts, CANNON_REST_PITCH, fortressGeometry, houseParts, hallGlow,
  windmillSailsGeometry, WINDMILL_HUB,
  wallGeometry, coinGeometry, boltGeometry,
} from './models.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _dir = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
// how big a giant or boss is drawn (the slimes a Sewer Slime splits into get smaller each time)
const BOSS_SCALE = { warlord: 1.85, baron: 2.0, king: 2.1, slime: 1.95, mole: 1.75, buzzard: 1.3 };
const SLIME_SCALE = [1.95, 1.32, 0.9];
export function giantScale(e) {
  if (e.boss === 'slime') return SLIME_SCALE[e.tier] || 0.9;
  if (e.type === T_BOSS) return BOSS_SCALE[e.boss] || 2.1;
  return e.maxHp <= 40 ? 1.2 : e.maxHp <= 80 ? 1.3 : e.maxHp <= 170 ? 1.4 : e.maxHp <= 260 ? 1.5 : 1.6;
}
// events at an enemy: their effects are raised onto the ground (a hill) under it
const LIFTED = new Set(['death', 'poke', 'spent', 'hit', 'freeze', 'bossSpawn', 'clink', 'block', 'shieldBreak', 'split', 'slimeSplit', 'digDown', 'digUp', 'drop', 'heal', 'stormHit', 'explode', 'bomb', 'dodge', 'jet']);
const _road = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
// colour of the cartoon splat each kind of enemy leaves behind
const RAT_SPLAT = [0xb08fcc, 0xd2a8de, 0x9d93b5, 0xbfa2cf, 0x9fdcae, 0xd49ac6, 0xe6b4da, 0xc9b8a8, 0xa59ab8, 0xd8b49a];
const BOSS_SPLAT = { warlord: 0xd8907c, baron: 0x9fb6d8, king: 0xbd8ade, slime: 0x8ad85a, mole: 0xb8916c, buzzard: 0xc2a07e };
const splatOf = (e) => (e.kind === T_GRUNT ? RAT_SPLAT[e.v] || RAT_SPLAT[0] : BOSS_SPLAT[e.boss] || 0xa98ac2);
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const _zq = new THREE.Quaternion(), _ZAX = new THREE.Vector3(0, 0, 1);
const _e2q = (a) => _zq.setFromAxisAngle(_ZAX, a);   // a spin in the picture plane
// toon lighting: a clean, near-white key light so the flat colours read true;
// the hemisphere fills the shadow band with a cool sky / warm ground tint
const DAY = { sky: 0xfff6ea, gnd: 0x9a6a4a, hemi: 1.05, sun: 0xfff8ec, sunI: 2.3, bg: 0xeec088 };
const DUSK = { sky: 0xffc7a0, gnd: 0x86503f, hemi: 1.05, sun: 0xffbf86, sunI: 2.1, bg: 0xe8a470 };
const NIGHT = { sky: 0xc8b0c8, gnd: 0x4e3550, hemi: 1.0, sun: 0xffb68a, sunI: 1.65, bg: 0xbc7466 };

// Hard-edged round shadow for the cartoon look (soft only at the very rim).
function discTexture(fill, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = fill; x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class View {
  // renderer: an existing renderer to draw with (a new map reuses the old one)
  constructor(canvas, labelLayer, quality = 'high', renderer = null) {
    this.canvas = canvas;
    this.labels = labelLayer;
    this.quality = quality;
    const r = renderer || new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = quality !== 'low';
    r.shadowMap.type = THREE.PCFShadowMap;   // crisp cartoon shadows
    r.shadowMap.autoUpdate = false;
    this.renderer = r;
    this.ink = inkUniforms;   // outline width controls (tests / settings)
    this.applyPixelRatio();

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(DAY.bg);
    scene.fog = new THREE.Fog(DAY.bg, 95, 175);
    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 320);
    this.camTarget = new THREE.Vector3(...[CFG.hero.start[0], 0, CFG.hero.start[1]]);
    this.camDist = 50;
    this.shake = 0;
    // players who ask their system for reduced motion get only a faint screen shake
    this.calmMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.pitch = THREE.MathUtils.degToRad(54);

    // lights
    this.hemi = new THREE.HemisphereLight(DAY.sky, DAY.gnd, DAY.hemi);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI);
    sun.position.set(-30, 62, 24);   // key light from the upper left, in front: lit tops, mid fronts, shaded right sides
    sun.target.position.set(0, 0, -4);
    sun.castShadow = quality !== 'low';
    const sz = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 170;
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;

    const env = buildEnvironment(scene, quality);
    this.env = env;
    // torch flames
    const flameGeo = new GB().add(P.cone(0.17, 0.42, 6), 0xffa21f, { y: 0.15 }).add(P.cone(0.09, 0.28, 6), 0xffef8a, { y: 0.12 }).build();
    this.flameMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    inkNormals(flameGeo);
    this.flames = env.torches.map(([x, y, z]) => { const m = new THREE.Mesh(flameGeo, this.flameMat); m.position.set(x, y, z); addInk(m, INK_PX.thin); scene.add(m); return m; });

    this.fx = new FX(scene, this.camera);
    // ---- cartoon reactions: dizzy stars circling stunned rats, arrows stuck in giants
    {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.055 : 0.13; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const starGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }); starGeo.translate(0, 0, -0.02);
      this.dizzyMesh = new THREE.InstancedMesh(starGeo, toon({ vertexColors: false, color: 0xffd93a, emissive: 0x6a4a00 }), 320);
      this.dizzyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.dizzyMesh.frustumCulled = false; this.dizzyMesh.count = 0;
      scene.add(this.dizzyMesh);
      inkInstanced(this.dizzyMesh, INK_PX.thin);
    }
    this.stuck = [];        // arrows stuck in giants and bosses: they quiver, then drop off
    this.pokeBudget = 0;    // impact bursts per second on small rats (a crowd takes hundreds of hits)
    this.sparkBudget = 0;   // coin twinkles
    // ---- small rats: one instanced draw call per rat type (normal, fast, armored)
    // rats are animated on the GPU: walk cycle, flinch, gate attack, defeat (ratanim.js)
    this.ratUniforms = { uTime: { value: 0 } };
    const ratMat = ratMaterial(this.ratUniforms, toonGradient());
    this.ratMat = ratMat;
    this.ratMeshes = []; this.ratAnims = [];
    // one mesh per rat type, plus one for shield rats whose shield has broken (SHIELDLESS)
    for (let v = 0; v <= SHIELDLESS; v++) {
      const geo = gruntGeometry(v);
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(1400 * 4), 4);
      anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iAnim', anim);
      const mesh = new THREE.InstancedMesh(geo, ratMat, 1400);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(mesh);
      // ink outline: a cheaper hull that shares the instances and the animation state
      const inkGeo = inkNormals(gruntInkGeometry(v));
      inkGeo.setAttribute('iAnim', anim);
      inkInstanced(mesh, INK_PX.rat, { geo: inkGeo, rat: this.ratUniforms });
      this.ratMeshes.push(mesh); this.ratAnims.push(anim);
    }
    this.gruntMesh = this.ratMeshes[0]; this.ratAnim = this.ratAnims[0];
    this.ratDying = [];   // defeated / spent rats still playing their last animation
    this.tint = { healed: new THREE.Color(0.78, 1.4, 0.78), normal: new THREE.Color(1, 1, 1), stun: new THREE.Color(1.3, 1.18, 0.55), slow: new THREE.Color(0.62, 0.86, 1.4), both: new THREE.Color(0.9, 1.0, 1.1), frozen: new THREE.Color(1.05, 1.4, 1.85) };
    // Frost Arrows: frozen rats sit inside a translucent block of ice
    this.iceMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.62, 0), toon({ vertexColors: false, color: 0x8fe4ff, emissive: 0x1a6a80, transparent: true, opacity: 0.45, depthWrite: false }), 600);
    this.iceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.iceMesh.frustumCulled = false; this.iceMesh.count = 0; this.iceMesh.renderOrder = 2;
    scene.add(this.iceMesh);
    // ---- cannonballs: dark iron, plus glowing crystal / nova shells
    this.shellMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), toon({ vertexColors: false, color: 0x3a3a44, emissive: 0x151518 }), 120);
    this.shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.shellMesh.frustumCulled = false; this.shellMesh.count = 0;
    scene.add(this.shellMesh);
    inkInstanced(this.shellMesh, INK_PX.unit);
    this.glowShellMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 60);
    this.glowShellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.glowShellMesh.frustumCulled = false; this.glowShellMesh.count = 0;
    this.glowShellMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.glowShellMesh);
    inkInstanced(this.glowShellMesh, INK_PX.prop);
    // where each cannonball will land: a ring the size of its blast
    {
      const rg = new THREE.RingGeometry(0.86, 1, 40); rg.rotateX(-Math.PI / 2);
      this.impactMesh = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 120);
      this.impactMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.impactMesh.frustumCulled = false; this.impactMesh.count = 0;
      this.impactMesh.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(this.impactMesh);
    }
    // ---- burning ground left by Firestorm shells
    const zoneGeo = new THREE.CircleGeometry(1, 24); zoneGeo.rotateX(-Math.PI / 2);
    this.zoneMesh = new THREE.InstancedMesh(zoneGeo, new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,140,40,1)', 'rgba(255,90,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 60);
    this.zoneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.zoneMesh.frustumCulled = false; this.zoneMesh.count = 0;
    this.zoneMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.zoneMesh);
    // ---- blob shadows under every unit
    const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
    this.blobMesh = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ map: discTexture('rgba(70,32,30,0.34)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 1500);
    this.blobMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobMesh.frustumCulled = false;
    this.blobMesh.count = 0;
    scene.add(this.blobMesh);
    // ---- coins
    this.coinMesh = new THREE.InstancedMesh(coinGeometry(), toon({ emissive: 0x6a4400 }), CFG.coin.max + 10);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    scene.add(this.coinMesh);
    inkInstanced(this.coinMesh, INK_PX.prop);
    // ---- bolts + white streak trails
    this.boltMesh = new THREE.InstancedMesh(boltGeometry(), toon({ emissive: 0x333333 }), 260);
    this.boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.boltMesh.frustumCulled = false; this.boltMesh.count = 0;
    this.boltMesh.setColorAt(0, new THREE.Color(0xffffff));
    scene.add(this.boltMesh);
    inkInstanced(this.boltMesh, INK_PX.thin);
    const trailGeo = new THREE.BoxGeometry(0.09, 0.09, 1); trailGeo.translate(0, 0, -0.5);
    this.trailMesh = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }), 260);
    this.trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trailMesh.frustumCulled = false; this.trailMesh.count = 0;
    this.trailMesh.setColorAt(0, new THREE.Color(0xffffff));
    this.boltColors = [0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xfff1c9, 0x8ff4ff, 0xd29bff].map((c) => new THREE.Color(c));
    scene.add(this.trailMesh);

    // ---- giants (pooled groups)
    this.giantGeo = { normal: giantParts(false) };
    for (const b of Object.keys(CFG.bosses)) this.giantGeo[b] = giantParts(b);
    this.giantPool = [];
    this.giantViews = new Map();
    this.labelPool = [];
    // ---- Tunnel Mole: the hump of earth that moves along while it tunnels, and
    // a red cracked circle where it is going to burst out
    {
      const mound = new GB()
        .add(P.sph(1.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a6240, { sy: 0.55, sz: 1.35 })
        .add(P.sph(0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x6e4a2e, { x: 0.45, z: -0.6, sy: 0.6 })
        .add(P.dod(0.28), 0x8e98a6, { x: -0.55, y: 0.35, z: 0.5 })
        .add(P.dod(0.2), 0x66707e, { x: 0.6, y: 0.3, z: 0.7 })
        .build();
      this.mound = new THREE.Mesh(mound, toon());
      addInk(this.mound, INK_PX.unit);
      this.mound.visible = false;
      scene.add(this.mound);
      const mark = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(2.6, 3.1, 40); ringGeo.rotateX(-Math.PI / 2);
      const redMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      mark.add(new THREE.Mesh(ringGeo, redMat));
      for (let i = 0; i < 6; i++) {   // cracks in the ground
        const c = new THREE.PlaneGeometry(0.22, 2.1); c.rotateX(-Math.PI / 2); c.translate(0, 0, 1.15); c.rotateY(i / 6 * Math.PI * 2 + 0.3);
        mark.add(new THREE.Mesh(c, redMat));
      }
      mark.visible = false;
      scene.add(mark);
      this.exitMark = mark; this.exitMat = redMat;
      this.moundPuff = 0;
    }

    // ---- hero
    this.hero = this._makeHero();
    scene.add(this.hero.group);
    this.focus = null;   // { x, z, zoom }: point the camera somewhere other than the farmer (victory)

    // ---- structures
    this.towerGeo = [null];
    for (let lv = 1; lv <= 7; lv++) this.towerGeo.push(towerParts(lv));
    this.cannonGeo = [null];   // levels 1-3, then the Thunder Mortar path
    for (let lv = 1; lv <= 7; lv++) this.cannonGeo.push(cannonParts(lv, 'blast'));
    this.rapidGeo = [null, null, null, null];   // the Rapid Launcher path (levels 4-7)
    for (let lv = 4; lv <= 7; lv++) this.rapidGeo.push(cannonParts(lv, 'rapid'));
    this.structMat = toon();
    // outline hulls per tower level: base, head and barrel each with their glowing parts
    const towerInk = (g) => ({ base: inkGeometry(g.base, g.baseGlow), head: inkGeometry(g.head, g.headGlow), gun: g.gun ? inkGeometry(g.gun, g.gunGlow) : null });
    this.towerInk = this.towerGeo.map((g) => g && towerInk(g));
    this.cannonInk = this.cannonGeo.map((g) => g && towerInk(g));
    this.rapidInk = this.rapidGeo.map((g) => g && towerInk(g));
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.crystalTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    this.towerViews = new Map();
    this.fortressGeo = [null, fortressGeometry(1), fortressGeometry(2), fortressGeometry(3)];
    const F = CFG.fortress;
    this.fortress = new THREE.Mesh(this.fortressGeo[1], this.structMat);
    this.fortress.position.set(F.x, 0, F.z);
    this.fortress.rotation.y = 0.34;
    this.fortress.castShadow = this.fortress.receiveShadow = true;
    addInk(this.fortress, INK_PX.big);
    scene.add(this.fortress);
    this.fortressLevel = 1;
    this.fortressPop = 1;
    // ---- the town: all houses merged into one mesh per town hall level, with
    // window panes that light up after dark, and chimneys that smoke
    this.houseGeo = [null]; this.houseGlowGeo = [null]; this.chimneys = [null];
    for (let lv = 1; lv <= 3; lv++) {
      const b = new GB(), g = new GB(), ch = [];
      CFG.huts.forEach((h, i) => {
        const hp = houseParts(lv, h.style ?? i);
        b.add(hp.geo, 0, { x: h.x, z: h.z, ry: h.rot, keep: true });
        if (hp.glow.attributes.position) g.add(hp.glow, 0, { x: h.x, z: h.z, ry: h.rot, keep: true });
        const [cx, cz] = turn(hp.chimney[0], hp.chimney[2], h.rot);
        ch.push([h.x + cx, hp.chimney[1], h.z + cz]);
      });
      this.houseGeo.push(b.build()); this.houseGlowGeo.push(g.build()); this.chimneys.push(ch);
    }
    this.houses = new THREE.Mesh(this.houseGeo[1], this.structMat);
    this.houses.castShadow = this.houses.receiveShadow = true;
    addInk(this.houses, INK_PX.unit);
    scene.add(this.houses);
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0x3a3550 });
    this.houseGlow = new THREE.Mesh(this.houseGlowGeo[1], this.windowMat);
    scene.add(this.houseGlow);
    this.hallGlowGeo = [null, hallGlow(1), hallGlow(2), hallGlow(3)];
    this.hallGlow = new THREE.Mesh(this.hallGlowGeo[1], this.windowMat);
    this.fortress.add(this.hallGlow);
    this.smokeT = 0;
    // windmill sails turn slowly (faster when the wind of a victory blows)
    {
      const W = CFG.town.windmill;
      this.sails = new THREE.Mesh(windmillSailsGeometry(), this.structMat);
      this.sails.position.set(W.x + WINDMILL_HUB[0], WINDMILL_HUB[1], W.z + WINDMILL_HUB[2]);
      addInk(this.sails, INK_PX.unit);
      scene.add(this.sails);
    }
    this.walls = [];
    const wallDefs = [[-31.5, -44, 1.57, 9], [-25, -52.5, 0.0, 11], [-12.5, -52.5, 0.0, 11], [-5.5, -47.5, 1.57, 8]];
    for (const [x, z, ry, len] of wallDefs) {
      const g2 = wallGeometry(len, 2), g3 = wallGeometry(len, 3);
      const m = new THREE.Mesh(g2, this.structMat);
      m.position.set(x, 0, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; m.visible = false;
      m.userData.geo = [null, null, g2, g3];
      addInk(m, INK_PX.unit);
      scene.add(m); this.walls.push(m);
    }

    // ---- pads
    this.padViews = new Map();
    this.padBaseTex = this._padBaseTexture();

    // ---- tutorial arrow
    const arrow = new GB().add(P.cone(0.45, 0.7, 4), PAL.gold, { y: 0.35, rx: Math.PI }).add(P.box(0.32, 0.7, 0.32), PAL.gold, { y: 1.0 }).build();
    this.arrow = new THREE.Mesh(arrow, toon({ emissive: 0x7a4a00 }));
    addInk(this.arrow, INK_PX.unit);
    this.arrow.visible = false;
    scene.add(this.arrow);
    this.arrowTarget = null;

    // ---- DOM labels
    this.fortBar = document.createElement('div');
    this.fortBar.className = 'world-bar';
    this.fortBar.innerHTML = '<div class="fill"></div>';
    labelLayer.appendChild(this.fortBar);
    this.fortBarFill = this.fortBar.firstChild;
    this.stepHint = document.createElement('div');
    this.stepHint.className = 'step-hint';
    this.stepHint.textContent = 'Step off, then back on to buy';
    this.stepHint.style.display = 'none';
    labelLayer.appendChild(this.stepHint);
    this.offArrow = document.createElement('div');
    this.offArrow.className = 'off-arrow';
    this.offArrow.innerHTML = '<span>!</span>';
    labelLayer.appendChild(this.offArrow);
    // points at a boss (or the burrow it is about to climb out of) when off screen
    this.bossArrow = document.createElement('div');
    this.bossArrow.className = 'off-arrow boss';
    this.bossArrow.innerHTML = '<span>☠</span>';
    this.bossArrow.style.display = 'none';
    labelLayer.appendChild(this.bossArrow);
    this.bossAlarm = 0; this.alarmTick = 0;

    // ---- townsfolk (render/town.js)
    this.town = new TownView(this);
    // ---- enemy portraits for the Rat guide (render/portraits.js)
    this.portraits = new Portraits(this);

    this.time = 0;
    this.lastNight = -1;
    this.shadowDirty = true;
    this.resize();
  }

  applyPixelRatio() {
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  setQuality(q) {
    // pixel ratio and shadows can change live; antialias needs a reload (handled by main)
    this.quality = q;
    this.applyPixelRatio();
    const sh = q !== 'low';
    this.renderer.shadowMap.enabled = sh;
    this.sun.castShadow = sh;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.shadowDirty = true;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    inkUniforms.uRes.value.set(Math.max(1, Math.round(w * pr)), Math.max(1, Math.round(h * pr)));
    inkUniforms.uDpr.value = pr;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------- hero
  _makeHero() {
    const parts = heroParts();
    const mat = toon();
    const group = new THREE.Group();
    const body = new THREE.Mesh(parts.body, mat);
    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.add(new THREE.Mesh(parts.leg, mat)); legR.add(new THREE.Mesh(parts.leg, mat));
    legL.position.set(-0.12, 0.38, 0); legR.position.set(0.12, 0.38, 0);
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.add(new THREE.Mesh(parts.arm, mat)); armR.add(new THREE.Mesh(parts.arm, mat));
    armL.position.set(-0.33, 0.86, 0); armR.position.set(0.33, 0.86, 0);
    const inner = new THREE.Group();
    inner.add(body, legL, legR, armL, armR);
    inner.scale.setScalar(1.35);
    for (const m of [body, legL.children[0], legR.children[0], armL.children[0], armR.children[0]]) addInk(m, INK_PX.unit);
    group.add(inner);
    group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // magnet ring hint on the ground
    const ringGeo = new THREE.RingGeometry(CFG.hero.magnetRadius - 0.08, CFG.hero.magnetRadius, 48); ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    ring.position.y = 0.09;
    group.add(ring);
    return { group, inner, legL, legR, armL, armR, ring, phase: 0 };
  }

  // -------------------------------------------------------------- giants
  _getGiant(style) {
    const boss = style || false;   // false = plain giant rat, otherwise the boss style
    let v = this.giantPool.find((g) => !g.inUse && g.boss === boss);
    if (!v) {
      const geo = this.giantGeo[boss || 'normal'];
      const piv = geo.pivots || { armL: [-1.12, 2.05, 0.05], armR: [1.12, 2.05, 0.05], legL: [-0.45, 0.95, 0], legR: [0.45, 0.95, 0] };
      const mat = toon({ emissive: 0x000000 });
      const group = new THREE.Group();
      const torso = new THREE.Mesh(geo.torso, mat);
      const armL = new THREE.Group(), armR = new THREE.Group(), legL = new THREE.Group(), legR = new THREE.Group();
      // the slime has no limbs (empty joints keep every animation simple)
      if (geo.armL) armL.add(new THREE.Mesh(geo.armL, mat));
      if (geo.armR) armR.add(new THREE.Mesh(geo.armR, mat));
      if (geo.leg) { legL.add(new THREE.Mesh(geo.leg, mat)); legR.add(new THREE.Mesh(geo.leg, mat)); }
      armL.position.set(...piv.armL); armR.position.set(...piv.armR);
      legL.position.set(...piv.legL); legR.position.set(...piv.legR);
      const body = new THREE.Group();
      body.add(torso, armL, armR);
      group.add(body, legL, legR);
      group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      const px = boss ? INK_PX.big : INK_PX.unit;
      for (const m of [torso, ...armL.children, ...armR.children, ...legL.children, ...legR.children]) addInk(m, px);
      this.scene.add(group);
      const label = document.createElement('div');
      label.className = 'hp-num';
      this.labels.appendChild(label);
      v = { group, body, armL, armR, legL, legR, mat, boss, label, inUse: false, lastHp: -1, top: geo.top || 3.55 };
      this.giantPool.push(v);
    }
    v.inUse = true;
    v.group.visible = true;
    v.group.rotation.set(0, 0, 0, 'YXZ');   // yaw, then local pitch for falling over
    v.group.position.y = 0;
    v.body.rotation.set(0, 0, 0); v.body.position.set(0, 0, 0); v.body.scale.set(1, 1, 1);
    v.hidden = false; v.fallFrom = 0;
    v.armL.rotation.set(0, 0, 0); v.armR.rotation.set(0, 0, 0); v.legL.rotation.set(0, 0, 0); v.legR.rotation.set(0, 0, 0);
    v.dying = undefined; v.downed = false; v.vanished = false;
    v.label.style.display = '';
    return v;
  }

  // -------------------------------------------------------------- pads
  _padBaseTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(95,58,30,0.82)';
    const r = 14; x.beginPath(); x.roundRect(10, 10, 108, 108, r); x.fill();
    x.lineWidth = 5; x.strokeStyle = 'rgba(42,24,16,0.9)'; x.stroke();   // ink rim
    x.strokeStyle = '#fffaf0'; x.lineWidth = 7; x.lineCap = 'round';
    const L = 26;
    for (const [px, py, dx, dy] of [[8, 8, 1, 1], [120, 8, -1, 1], [8, 120, 1, -1], [120, 120, -1, -1]]) {
      x.beginPath(); x.moveTo(px + dx * L, py); x.lineTo(px, py); x.lineTo(px, py + dy * L); x.stroke();
    }
    x.setLineDash([9, 9]); x.lineWidth = 4;
    x.beginPath(); x.moveTo(44, 8); x.lineTo(84, 8); x.moveTo(44, 120); x.lineTo(84, 120); x.moveTo(8, 44); x.lineTo(8, 84); x.moveTo(120, 44); x.lineTo(120, 84); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  // Little tower glyphs painted on pads so you can see what a pad builds.
  _glyph(x, cx, cy, tower, size = 1) {
    x.save();
    x.translate(cx, cy); x.scale(size, size);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = 'rgba(40,20,10,0.95)'; x.lineWidth = 12;
    if (tower === 'rapid' || tower === 'blast') {
      // the upgrade choice: a rack of four launch tubes, or one fat mortar
      x.lineWidth = 9; x.strokeStyle = 'rgba(40,20,10,0.95)';
      if (tower === 'rapid') {
        for (const [ox, oy] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) { x.beginPath(); x.arc(ox, oy, 12, 0, Math.PI * 2); x.fillStyle = '#ffab6e'; x.fill(); x.stroke(); x.beginPath(); x.arc(ox, oy, 5, 0, Math.PI * 2); x.fillStyle = '#3a1d12'; x.fill(); }
      } else {
        x.beginPath(); x.moveTo(-26, 32); x.lineTo(26, 32); x.lineTo(18, 10); x.lineTo(-18, 10); x.closePath(); x.fillStyle = '#a9b8ff'; x.fill(); x.stroke();
        x.beginPath(); x.arc(0, -6, 22, 0, Math.PI * 2); x.fill(); x.stroke();
        x.beginPath(); x.arc(0, -6, 10, 0, Math.PI * 2); x.fillStyle = '#3a1d12'; x.fill();
      }
      x.restore();
      return;
    }
    const draw = (stroke) => {
      if (tower === 'cannon') {
        x.beginPath(); x.roundRect(-30, -16, 50, 26, 10); stroke ? x.stroke() : x.fill();
        x.beginPath(); x.arc(18, -3, 15, 0, Math.PI * 2); stroke ? x.stroke() : x.fill();
        x.beginPath(); x.arc(-8, 16, 13, 0, Math.PI * 2); stroke ? x.stroke() : x.fill();
      } else {
        x.beginPath(); x.arc(0, 18, 34, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
        x.beginPath(); x.moveTo(0, 26); x.lineTo(0, -30); x.stroke();
        x.beginPath(); x.moveTo(-10, -20); x.lineTo(0, -32); x.lineTo(10, -20); x.stroke();
      }
    };
    if (tower === 'cannon') { draw(true); x.fillStyle = '#ffd36a'; draw(false); x.fillStyle = '#3a3a42'; x.beginPath(); x.arc(-8, 16, 6, 0, Math.PI * 2); x.fill(); }
    else { draw(true); x.strokeStyle = '#ffd36a'; x.lineWidth = 6; draw(true); }
    x.restore();
  }

  // path: set on the cannon's upgrade-choice pads ('rapid' or 'blast')
  _drawPadLabel(v, remaining, kind, level, broke, wait, tower, path = null) {
    const c = v.canvas, x = v.ctx;
    x.clearRect(0, 0, c.width, c.height);
    const font = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
    // icon row for upgrades / fortress
    if (kind !== 'build' || wait) {
      x.fillStyle = wait ? '#ffe9a8' : kind === 'fortress' ? '#ffd45a' : kind === 'repair' ? '#9ff0a6' : path === 'rapid' ? '#ffab6e' : path === 'blast' ? '#a9b8ff' : '#7fe0d4';
      x.font = `${wait ? 44 : path ? 42 : 52}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.strokeStyle = 'rgba(40,20,10,0.9)'; x.lineWidth = 9;
      const lbl = wait ? 'STEP OFF & ON' : kind === 'fortress' ? `HALL ${'I'.repeat(level)}` : kind === 'repair' ? '✚ REPAIR' : path === 'rapid' ? 'RAPID' : path === 'blast' ? 'MORTAR' : `▲ LV${level}`;
      const gx = kind === 'upgrade' && !wait ? (path ? 30 : 22) : 0;
      x.strokeText(lbl, 128 + gx, 46); x.fillText(lbl, 128 + gx, 46);
      if (gx) this._glyph(x, path ? 34 : 40, 46, path || tower, path ? 0.62 : 0.7);
    }
    if (kind === 'build' && !wait) this._glyph(x, 128, 44, tower, 0.85);
    const y = kind === 'build' && !wait ? 140 : 150;
    x.font = `92px ${font}`; x.textAlign = 'right'; x.textBaseline = 'middle';
    x.lineWidth = 12; x.strokeStyle = 'rgba(40,20,10,0.9)';
    const txt = String(remaining);
    x.strokeText(txt, 160, y); x.fillStyle = broke ? '#ffb3a8' : '#ffffff'; x.fillText(txt, 160, y);
    // coin icon
    x.beginPath(); x.arc(200, y, 30, 0, Math.PI * 2); x.fillStyle = '#ffc63a'; x.fill();
    x.lineWidth = 6; x.strokeStyle = '#a5620f'; x.stroke();
    x.beginPath(); x.arc(200, y, 16, 0, Math.PI * 2); x.strokeStyle = '#e0961c'; x.lineWidth = 5; x.stroke();
    v.tex.needsUpdate = true;
  }

  _makePad(p) {
    const g = new THREE.Group();
    const big = p.kind === 'fortress' || p.kind === 'repair' ? 1.35 : 1;
    const size = CFG.pad.half * 2 * big;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.padBaseTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const fillGeo = new THREE.PlaneGeometry(size * 0.84, size * 0.84).rotateX(-Math.PI / 2);
    fillGeo.translate(0, 0, -size * 0.42); // anchor at the near edge so it grows away from camera
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x2f9bff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.set(0, 0.01, size * 0.42);
    fill.scale.z = 0.0001;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.9, size * 0.9 * 200 / 256).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    label.position.y = 0.02;
    const glowGeo = new THREE.RingGeometry(size * 0.62, size * 0.72, 4, 1); glowGeo.rotateX(-Math.PI / 2); glowGeo.rotateY(Math.PI / 4);
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 0.03;
    g.add(base, fill, label, glow);
    g.position.set(p.x, p.y + 0.07, p.z);
    if (CFG.hills.length) {
      // on a hill the pad lies on the slope
      const e = 0.6, dx = (groundHeight(p.x + e, p.z) - groundHeight(p.x - e, p.z)) / (2 * e), dz = (groundHeight(p.x, p.z + e) - groundHeight(p.x, p.z - e)) / (2 * e);
      g.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-dx, 1, -dz).normalize());
    }
    this.scene.add(g);
    const v = { group: g, base, fill, label, glow, canvas, ctx, tex, shown: -1, broke: null, pop: 0 };
    return v;
  }

  // -------------------------------------------------------------- towers
  _makeTower(t) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(undefined, this.structMat);
    base.castShadow = base.receiveShadow = true;
    const baseGlow = new THREE.Mesh(undefined, this.glowMat);
    const head = new THREE.Group();
    const headMesh = new THREE.Mesh(undefined, this.structMat);
    headMesh.castShadow = true;
    const headGlow = new THREE.Mesh(undefined, this.glowMat);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.crystalTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.scale.set(1.8, 1.8, 1);
    const charge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.crystalTex, color: 0xc07bff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    charge.visible = false;
    // cannon barrels sit on a trunnion and elevate toward the target
    const gun = new THREE.Group();
    const gunMesh = new THREE.Mesh(undefined, this.structMat);
    gunMesh.castShadow = true;
    const gunGlow = new THREE.Mesh(undefined, this.glowMat);
    gun.add(gunMesh, gunGlow, charge);
    head.add(headMesh, headGlow, aura, gun);
    addInk(base, INK_PX.unit, new THREE.BufferGeometry()); addInk(headMesh, INK_PX.unit, new THREE.BufferGeometry()); addInk(gunMesh, INK_PX.unit, new THREE.BufferGeometry());
    head.rotation.order = 'YXZ';   // turn (yaw), then tilt (pitch) toward the target
    group.add(base, baseGlow, head);
    group.position.set(t.x, t.y, t.z);
    this.scene.add(group);
    const v = { group, base, baseGlow, head, headMesh, headGlow, gun, gunMesh, gunGlow, aura, charge, level: 0, pop: 1, kind: t.kind || 'crossbow', pitch: 0, elev: CANNON_REST_PITCH };
    this._setTowerLevel(v, t.level, t.path);
    v.pop = t.builtAt > -5 ? 0 : 1;
    return v;
  }

  _setTowerLevel(v, level, path = null) {
    const rapid = v.kind === 'cannon' && path === 'rapid' && level >= CFG.cannon.branchLevel;
    const geo = (rapid ? this.rapidGeo : v.kind === 'cannon' ? this.cannonGeo : this.towerGeo)[level];
    const ink = (rapid ? this.rapidInk : v.kind === 'cannon' ? this.cannonInk : this.towerInk)[level];
    v.path = path;
    v.charge.visible = !!geo.muzzle;
    if (geo.muzzle) v.charge.position.set(...geo.muzzle);
    setInkedGeometry(v.base, geo.base, ink.base);
    v.baseGlow.geometry = geo.baseGlow;
    v.baseGlow.visible = !!geo.baseGlow.attributes.position;
    setInkedGeometry(v.headMesh, geo.head, ink.head);
    v.headGlow.geometry = geo.headGlow;
    v.headGlow.visible = !!geo.headGlow.attributes.position;
    v.gun.visible = !!geo.gun;
    if (geo.gun) {
      setInkedGeometry(v.gunMesh, geo.gun, ink.gun);
      v.gunGlow.geometry = geo.gunGlow;
      v.gunGlow.visible = !!geo.gunGlow.attributes.position;
    }
    v.head.position.y = geo.headY;
    v.aura.visible = !!geo.crystal;
    if (geo.crystal) { v.aura.position.set(...geo.crystal); v.aura.material.color.set(geo.glowColor); }
    v.level = level;
    v.pop = 0;
    this.shadowDirty = true;
  }

  // ------------------------------------------------------ defeat animations
  _ratDies(e, spent) {
    if (this.ratDying.length >= 400) return;
    const v = e.v === SHIELD && !e.sh ? SHIELDLESS : e.v || 0;
    this.ratDying.push({ x: e.x, z: e.z, gy: this._gy(e.x, e.z), yaw: e.yaw || 0, dir: e.dir || 1, v, k: 0, dur: spent ? 0.45 : 0.72, spent, puffed: spent });
  }
  _giantDies(e, spent) {
    const v = this.giantViews.get(e.id);
    if (!v) return;
    v.dying = 0; v.spent = spent; v.dieDir = e.dir || 1;
    v.gy = this._gy(v.group.position.x, v.group.position.z);
    v.dieDur = spent ? 0.6 : v.boss === 'slime' ? 0.5 : v.boss === 'buzzard' && v.group.position.y - v.gy > 0.5 ? 2.0 : v.boss ? 1.8 : 1.2;
    v.downed = spent; v.vanished = false;
    v.fallFrom = v.group.position.y - v.gy;   // a buzzard shot down falls out of the sky
    v.label.style.display = 'none';
    v.mat.emissive.setScalar(spent ? 0.3 : 0.9);
  }
  // ground under a point: a hill on Level 2, 0 on a flat road
  _gy(x, z) { return CFG.hills.length ? hillHeight(x, z) : 0; }
  // raise the effects of the next fx calls onto the ground at x, z (reset with fx.lift = 0)
  _lift(x, z) { this.fx.lift = this._gy(x, z); return this.fx; }

  _animateGiantDeath(v, dt, t) {
    this.fx.lift = v.gy || 0;
    this._giantDeathPose(v, dt, t);
    v.group.position.y += v.gy || 0;
    this.fx.lift = 0;
  }
  // Giant rat defeat: topples backwards, bounces, lies still, sinks in a puff.
  _giantDeathPose(v, dt, t) {
    v.dying = Math.min(1, v.dying + dt / v.dieDur);
    const k = v.dying, sc = v.baseScale || 1.4, g = v.group;
    v.mat.emissive.setScalar(Math.max(0, (v.spent ? 0.3 : 0.9) * (1 - k / 0.15)));
    if (v.spent) {
      g.rotation.y += dt * 12;
      g.scale.setScalar(sc * (1 - k * 0.9));
      g.position.y = k * 1.2;
      return;
    }
    if (v.boss === 'slime') {
      // a slime goes splat: flattens into a puddle, then is gone in a green puff
      const f = Math.min(1, k / 0.55);
      v.body.scale.set(1 + 0.55 * f, Math.max(0.08, 1 - 0.92 * f * f), 1 + 0.55 * f);
      v.body.position.z = 0;
      if (k >= 0.6 && !v.vanished) { v.vanished = true; this.fx.splat(g.position.x, g.position.z, sc * 0.9); }
      g.scale.setScalar(sc * (k < 0.6 ? 1 : Math.max(0.01, 1 - (k - 0.6) / 0.4)));
      return;
    }
    // a flier shot down: it drops out of the sky as it topples, wings flailing
    const drop = v.fallFrom > 0.5 ? v.fallFrom * Math.max(0, 1 - (k / 0.36) ** 2) : 0;
    if (v.boss === 'buzzard') { const fl = Math.sin(t * 26) * 0.6 * (1 - k); v.armL.rotation.z = 0.3 + fl; v.armR.rotation.z = -0.3 - fl; }
    const f = Math.min(1, k / 0.38);
    const fall = f * f;                                                 // accelerating topple
    const bounce = k > 0.38 && k < 0.55 ? Math.sin((k - 0.38) / 0.17 * Math.PI) * 0.14 : 0;
    g.rotation.x = -1.42 * fall + bounce;
    g.rotation.z = v.dieDir * 0.28 * fall;
    v.armL.rotation.x = -2.6 * fall; v.armR.rotation.x = -2.2 * fall;
    const kick = Math.sin(t * 22) * 0.35 * Math.max(0, 1 - k * 1.6);
    v.legL.rotation.x = -0.7 * fall + kick; v.legR.rotation.x = -0.5 * fall - kick;
    if (!v.downed && k >= 0.38) {
      v.downed = true;
      const x = g.position.x - Math.sin(g.rotation.y) * 1.6 * sc, z = g.position.z - Math.cos(g.rotation.y) * 1.6 * sc;
      this.fx.puff(x, 0, z, 0xd9c7a8, 2.4);
      this.fx.ring(x, 0, z, 1.6 * sc, 0xf2deb8, 0.5);
      this.shake = Math.max(this.shake, v.boss ? 0.8 : 0.3);
    }
    const sink = Math.max(0, (k - 0.72) / 0.28);
    if (sink > 0 && !v.vanished) {
      v.vanished = true;
      const x = g.position.x - Math.sin(g.rotation.y) * 1.4 * sc, z = g.position.z - Math.cos(g.rotation.y) * 1.4 * sc;
      this.fx.puff(x, 0.2, z, 0xffffff, v.boss ? 3.4 : 2.4);
    }
    g.position.y = drop - sink * sink * 1.1 * sc;
    g.scale.setScalar(sc * (1 - 0.85 * sink));
  }

  // ---- poses for the bosses with special abilities (called every frame)
  // Sewer Slime: oozes along with a squash-and-stretch wobble, rears up and
  // slams down on the gate; new slimes are flung out of a splat in an arc.
  _poseSlime(v, e, sc, fighting) {
    const ph = e.s * 2.6 + e.phase;
    let sq = Math.sin(ph * 2) * 0.09, lunge = 0;
    if (e.atGate && fighting) {
      const a = attackPhase(e.attackT, CFG.giant.gateRate);
      const up = smooth(0.1, 0.55, a) * (1 - smooth(0.6, 0.68, a)), down = smooth(0.6, 0.68, a) * (1 - smooth(0.75, 1, a));
      sq = 0.22 * up - 0.3 * down; lunge = 0.5 * down;
    }
    if (e.stun > 0) sq = 0;
    if (e.hitT > 0) sq -= 0.12 * Math.sin(e.hitT / CFG.hitFlinch * Math.PI);
    v.body.scale.set(1 - sq * 0.6, 1 + sq, 1 - sq * 0.6);
    v.body.position.z = lunge;
    v.body.rotation.set(0, 0, Math.sin(ph) * 0.06);
    if (e.born > 0) {
      const u = e.born / 0.5;
      v.group.position.y += Math.sin(u * Math.PI) * 1.5;
      v.body.rotation.x = -u * 0.9;
    }
  }

  // Canyon Buzzard: flaps high over the road (bobbing with each wingbeat),
  // glides down to land at the gate, folds its wings and pecks at it.
  _poseBuzzard(v, e, sc, t, fighting) {
    const air = Math.min(1, e.fly / 1.5);
    const flap = Math.sin(t * 6.5 + e.phase);
    v.group.position.y = Math.min(0, v.group.position.y) + e.fly + Math.sin(t * 2.1 + e.phase) * 0.22 * air;   // (below 0: still climbing out of the burrow)
    v.armL.rotation.set(0, 0, (-0.2 - flap * 0.7) * air + 1.2 * (1 - air));
    v.armR.rotation.set(0, 0, (0.2 + flap * 0.7) * air - 1.2 * (1 - air));
    v.body.position.y = -flap * 0.12 * air;
    v.legL.rotation.x = v.legR.rotation.x = -0.55 * air;   // legs trail behind in flight
    let lean = 0.12 * air;
    if (e.atGate && fighting) {
      const a = attackPhase(e.attackT, CFG.giant.gateRate);
      const up = smooth(0.05, 0.5, a) * (1 - smooth(0.58, 0.66, a)), down = smooth(0.58, 0.66, a) * (1 - smooth(0.74, 1, a));
      lean += -0.3 * up + 0.75 * down;
      v.armL.rotation.z = 1.2 - 0.9 * up; v.armR.rotation.z = -1.2 + 0.9 * up;   // wings flare as it rears back
    }
    if (e.hitT > 0) lean -= 0.12 * Math.sin(e.hitT / CFG.hitFlinch * Math.PI);
    v.body.rotation.set(lean, 0, Math.sin(t * 1.3 + e.phase) * 0.08 * air);
  }

  // An arrow that hits a giant or boss stays stuck in it for a moment,
  // quivering, kept in the giant's own frame so it moves with it.
  _stickArrow(e, radius) {
    const v = this.giantViews.get(e.id);
    if (!v || v.dying !== undefined || !v.group.visible || this.stuck.length >= 60) return;
    let mine = 0;
    for (const a of this.stuck) if (a.id === e.id && !a.falling) mine++;
    if (mine >= 10) return;
    const g = v.group, yaw = g.rotation.y, sc = v.baseScale || 1.4;
    // world offset of the impact from the giant's feet, then into its own (unrotated, unscaled) frame
    const ox = -e.dx * radius * 0.78, oz = -e.dz * radius * 0.78, oy = e.y + this._gy(e.x, e.z) - g.position.y + (Math.random() - 0.5) * 0.7;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.stuck.push({
      id: e.id, lx: (ox * c - oz * s) / sc, ly: oy / sc, lz: (ox * s + oz * c) / sc,
      ay: Math.atan2(e.dx, e.dz) - yaw, tilt: 0.12 + Math.random() * 0.2, age: 0, level: e.level || 1,
      falling: false, x: 0, y: 0, z: 0, wy: 0, vy: 0,
    });
  }
  // the giant is down: its arrows drop to the ground
  _dropStuck(id) {
    for (const a of this.stuck) if (a.id === id && !a.falling) { a.falling = true; a.vy = 1.5; a.age = Math.min(a.age, 2); }
  }
  // writes stuck arrows into the arrow mesh after the flying ones; returns the new count
  _drawStuck(dt, bo, bc) {
    let j = 0;
    for (const a of this.stuck) {
      a.age += dt;
      if (!a.falling) {
        const v = this.giantViews.get(a.id);
        if (!v || v.dying !== undefined || a.age > 2.6) {   // its giant is down, or it has hung there long enough: it drops off
          if (a.x === 0 && a.z === 0) continue;
          a.falling = true; a.vy = 1.5;
        } else {
          const g = v.group, yaw = g.rotation.y, sc = v.baseScale || 1.4, c = Math.cos(yaw), s = Math.sin(yaw);
          a.x = g.position.x + (a.lx * c + a.lz * s) * sc;
          a.z = g.position.z + (-a.lx * s + a.lz * c) * sc;
          a.y = g.position.y + a.ly * sc;
          a.wy = yaw + a.ay;
          if (!g.visible) { a.falling = true; a.vy = 0; }
        }
      }
      if (a.falling) {   // tumbling down, then lying on the ground for a moment
        a.vy -= 22 * dt; a.y = Math.max(0.06, a.y + a.vy * dt);
        a.tilt += (Math.PI / 2 - 0.05 - a.tilt) * Math.min(1, dt * 6);
        a.fall = (a.fall || 0) + dt;
        if (a.fall > 0.9) continue;
      }
      this.stuck[j++] = a;
      if (bc >= 260) continue;
      // quiver right after it sticks
      const q = a.falling ? 0 : Math.sin(a.age * 46) * 0.32 * Math.exp(-a.age * 7);
      _dir.set(Math.sin(a.wy + q) * Math.cos(a.tilt), -Math.sin(a.tilt + q * 0.5), Math.cos(a.wy + q) * Math.cos(a.tilt));
      _q.setFromUnitVectors(FWD, _dir);
      const k = a.falling && a.fall > 0.6 ? Math.max(0.01, 1 - (a.fall - 0.6) / 0.3) : 1;
      _p.set(a.x - _dir.x * 0.3, a.y - _dir.y * 0.3, a.z - _dir.z * 0.3); _s.set(k, k, k);
      _m.compose(_p, _q, _s); bo.setMatrixAt(bc, _m); bo.setColorAt(bc, this.boltColors[a.level] || this.boltColors[1]);
      bc++;
    }
    this.stuck.length = j;
    return bc;
  }

  // Tunnel Mole: digging in (claws churning, nose first into the ground),
  // tunnelling (hidden: the hump of earth shows where it is), climbing out.
  _poseMole(v, e, sc, t) {
    const D = CFG.bosses.mole.dig, deep = 3.9 * sc;
    if (e.dig === 1) {
      const k = 1 - Math.max(0, e.digT) / D.down;
      v.group.position.y = -k * k * deep;
      v.body.rotation.x = 0.55 * k;
      const c = Math.sin(t * 22) * 0.9;
      v.armL.rotation.x = -1.3 + c; v.armR.rotation.x = -1.3 - c;
      if (Math.random() < 0.5) { this._lift(e.x, e.z).puff(e.x + (Math.random() - 0.5) * 3, 0, e.z + (Math.random() - 0.5) * 3, 0x9b7650, 1.3); this.fx.lift = 0; }
    } else if (e.dig === 3) {
      const k = 1 - Math.max(0, e.digT) / D.up;
      v.group.position.y = -(1 - k) * (1 - k) * deep;
      v.armL.rotation.x = v.armR.rotation.x = -2.5 * (1 - k * 0.6);   // claws thrown up as it bursts out
      v.body.rotation.x = -0.2 * (1 - k);
    }
  }

  // Drops effects and finishing defeat animations (used when time is skipped).
  clearTransient() {
    this.fx.clear();
    this.ratDying.length = 0;
    this.stuck.length = 0;
    for (const v of this.giantViews.values()) if (v.dying !== undefined) v.dying = 1;
  }

  // -------------------------------------------------------------- reset
  reset(sim) {
    for (const v of this.towerViews.values()) this.scene.remove(v.group);
    this.towerViews.clear();
    for (const v of this.padViews.values()) this.scene.remove(v.group);
    this.padViews.clear();
    for (const g of this.giantPool) { g.inUse = false; g.group.visible = false; g.label.style.display = 'none'; g.dying = undefined; }
    this.giantViews.clear();
    this.ratDying.length = 0;
    this.stuck.length = 0;
    this.fx.clear();
    this.town.reset();
    this.focus = null;
    this._setFortressLevel(sim.fortress.level, true);
    this.camTarget.set(sim.hero.x, 0, sim.hero.z - 2);
    this.shadowDirty = true;
    this.sync(sim, 0);
  }

  _setFortressLevel(level, instant) {
    this.fortressLevel = level;
    setInkedGeometry(this.fortress, this.fortressGeo[level]);
    setInkedGeometry(this.houses, this.houseGeo[level]);
    this.houseGlow.geometry = this.houseGlowGeo[level];
    this.hallGlow.geometry = this.hallGlowGeo[level];
    for (const w of this.walls) { w.visible = level >= 2; if (level >= 2) setInkedGeometry(w, w.userData.geo[level]); }
    this.fortressPop = instant ? 1 : 0;
    this.shadowDirty = true;
  }

  // -------------------------------------------------------------- events
  handleEvent(e, sim) {
    const fx = this.fx;
    fx.lift = LIFTED.has(e.type) ? this._gy(e.x, e.z) : 0;
    switch (e.type) {
      case 'death': {
        // the body plays a defeat animation; the white puff comes when it vanishes
        const big = e.kind === T_GRUNT ? 1 : e.kind === T_BOSS ? 3.2 : 2.2;
        // a little cartoon splash where it fell (a slime makes its own green splat)
        if (e.boss !== 'slime') {
          const size = e.kind === T_GRUNT ? CFG.ratTypes[e.v].scale * 0.8 : e.kind === T_BOSS ? 2.8 : 1.9;
          fx.splash(e.x, e.z, size, splatOf(e), e.kind === T_GRUNT ? 3 : e.kind === T_BOSS ? 12 : 7);
        }
        fx.glow(e.x, e.kind === T_GRUNT ? 0.5 : 2, e.z, big * 1.3, 0xffffff, 0.12);
        if (e.kind === T_GRUNT) this._ratDies(e, false);
        else {
          this.shake = Math.max(this.shake, e.kind === T_BOSS ? 0.9 : 0.35);
          fx.confetti(e.x, 1.5, e.z, 10, [PAL.gold, PAL.goldDark]);
          fx.star(e.x, 1.8 + (e.fly || 0), e.z, e.kind === T_BOSS ? 3.2 : 2.2, 0xffffff, 0.26, 1.2);
          if (e.boss === 'buzzard') fx.confetti(e.x, 1.5 + (e.fly || 0), e.z, 16, [0x4a3328, 0x7d5c46, 0xf3ead8]);   // a cloud of feathers
          this._giantDies(e, false);
          this._dropStuck(e.id);
        }
        break;
      }
      case 'poke':   // an arrow strikes a rat: a little comic burst (a crowd takes hundreds, so they are rationed)
        if (this.pokeBudget >= 1) { this.pokeBudget--; fx.star(e.x, e.y, e.z, 0.5 + Math.random() * 0.2, 0xfff6d0, 0.15, 0.45); }
        break;
      case 'spent':
        fx.puff(e.x, 0, e.z, 0xcfc4d6, e.kind === T_GRUNT ? 0.8 : 1.6);
        if (e.kind === T_GRUNT && e.v === BOMB) { fx.explosion(e.x, e.z, 2.2, 'fire'); this.shake = Math.max(this.shake, 0.35); }   // a bomb rat blows a hole in the gate
        if (e.kind === T_GRUNT) this._ratDies(e, true); else this._giantDies(e, true);
        break;
      case 'hit': {
        // a giant or boss struck: a burst on the side the hit came from; arrows stay stuck in it
        const r = e.dx === undefined ? 0 : sim.enemies.find((q) => q.id === e.id)?.radius || 1;
        fx.star(e.x - (e.dx || 0) * r * 0.8, e.y, e.z - (e.dz || 0) * r * 0.8, e.dx === undefined ? 1.1 : 0.85, e.dx === undefined ? 0xffe0a0 : 0xfff2c4, 0.17, 0.6);
        fx.glow(e.x, e.y, e.z, 1.3, 0xcfe6ff, 0.14);
        if (e.dx !== undefined) this._stickArrow(e, r);
        break;
      }
      case 'freeze': if (e.giant || Math.random() < 0.7) fx.frost(e.x, e.z, e.giant); break;
      case 'bossWarning': this.bossAlarm = CFG.bossWarning + 0.3; this.alarmTick = 0; break;
      case 'bossSpawn': {
        // the ground erupts as the boss heaves itself out of the burrow
        this.bossAlarm = 0;
        fx.puff(e.x, 0, e.z, 0x9b7650, 3.2); fx.ring(e.x, 0.1, e.z, 3.2, 0xffb08a, 0.6);
        this.shake = Math.max(this.shake, 0.7);
        break;
      }
      case 'clink': if (Math.random() < 0.6) fx.glow(e.x, 0.75, e.z, 0.9, 0xfff0b0, 0.1); break;   // arrow glancing off an armored rat
      // a bomb rat goes off: a cartoon blast that knocks over the rats round it
      case 'bomb': fx.explosion(e.x, e.z, e.r * 0.85, 'fire'); this.shake = Math.max(this.shake, 0.18); break;
      // a ninja rat flips clear of an arrow in a puff of smoke
      case 'dodge': fx.puff(e.x, 0.1, e.z, 0x6a6078, 0.7); fx.star(e.x, 0.7, e.z, 0.45, 0xdcd4ee, 0.12, 0.4); break;
      // a jetpack rat fires its jetpack
      case 'jet': fx.glow(e.x, 0.4, e.z, 1.6, 0xffa040, 0.2); fx.puff(e.x, 0, e.z, 0xd9d0c8, 0.6); break;
      case 'block': if (Math.random() < 0.5) { fx.glow(e.x, 0.6, e.z, 0.8, 0xffe6b0, 0.09); fx.star(e.x, 0.6, e.z, 0.5, 0xe8b878, 0.13, 0.5); } break;   // arrow thuds into a shield
      case 'shieldBreak': fx.shieldBreak(e.x, e.z); break;
      case 'split': fx.burst(e.x, e.z); this.shake = Math.max(this.shake, 0.06); break;
      case 'slimeSplit': fx.splat(e.x, e.z, e.tier === 1 ? 1.6 : 1.1); this.shake = Math.max(this.shake, e.tier === 1 ? 0.35 : 0.15); break;
      case 'digDown': fx.dirt(e.x, e.z, 1.6); this.shake = Math.max(this.shake, 0.4); break;
      case 'digUp': fx.dirt(e.x, e.z, 2.1); fx.ring(e.x, 0.1, e.z, 3.4, 0xffb08a, 0.6); this.shake = Math.max(this.shake, 0.9); break;
      case 'drop': fx.glow(e.x, e.y + 0.4, e.z, 1.8, 0xffe2b0, 0.2); break;
      case 'heal': {
        fx.heal(e.x, e.z, e.r);
        // plus signs over a few of the rats it mended
        let k = 0;
        for (const r of sim.enemies) {
          if (k >= 5) break;
          if (r.alive && r.healed > 0.65 && (r.x - e.x) ** 2 + (r.z - e.z) ** 2 < e.r * e.r) { fx.plus(r.x, r.type === T_GRUNT ? 0.9 : 3, r.z); k++; }
        }
        break;
      }
      case 'bounce': fx.glow(e.x, e.y, e.z, 1.1, 0xd29bff, 0.14); if (this.pokeBudget >= 1) { this.pokeBudget--; fx.star(e.x, e.y, e.z, 0.55, 0xeed4ff, 0.15, 0.45); } break;
      case 'storm': {
        // the target area lights up, the tower's crystal flares
        fx.ring(e.x, groundHeight(e.x, e.z), e.z, e.r / 1.5, 0xc07bff, e.time);   // (not lifted: y is the ground already)
        fx.glow(e.x, 0.4 + groundHeight(e.x, e.z), e.z, e.r * 1.6, 0x9b5cff, e.time * 0.8);
        const tv = this.towerViews.get(e.slot);
        if (tv) fx.glow(e.tx, tv.group.position.y + 2.4, e.tz, 3.2, 0xd29bff, 0.45);
        break;
      }
      case 'stormHit': fx.glow(e.x, 0.45, e.z, 1.5, 0xc07bff, 0.2); if (Math.random() < 0.6) fx.puff(e.x, 0, e.z, 0xe2c8ff, 0.7); if (e.hits && Math.random() < 0.5) fx.star(e.x, 0.5, e.z, 0.65, 0xe6ccff, 0.15, 0.4); break;
      case 'coin':   // a coin collected: a twinkle by the farmer's hat
        if (this.sparkBudget >= 1) { this.sparkBudget--; const h = sim.hero; fx.twinkle(h.x + (Math.random() - 0.5) * 0.6, h.y + 1.7 + Math.random() * 0.4, h.z, 0.55, 0xfff1a0); }
        break;
      case 'burst': {
        const tv = this.towerViews.get(e.slot);
        if (tv) fx.glow(e.x, tv.group.position.y + 1.6, e.z, 2.4, 0xffe08a, 0.25);
        break;
      }
      case 'fire': {
        const tv = this.towerViews.get(e.slot);
        if (tv) {
          // the shot kicks the tower back on its spring: heavy shells hardest, rockets least
          const heavyShot = e.tower === 'cannon' && e.path === 'blast' && e.level >= CFG.cannon.branchLevel;
          // (an impulse of about 33 kicks it back by 1 unit of "kick" at the peak)
          const kick = e.tower !== 'cannon' ? (e.burst ? 18 : e.level === 4 ? 22 : 32)
            : e.kind === 'nova' ? 78 : e.kind === 'rocket' ? 8 : e.kind === 'side' ? 28 : e.path === 'rapid' && e.level >= CFG.cannon.branchLevel ? 18 : heavyShot ? 60 : 42;
          tv.kickV = (tv.kickV || 0) + kick;
          if (e.tower === 'cannon') {
            const yaw = tv.head.rotation.y, hy = tv.group.position.y + tv.head.position.y + 0.3;
            const mx = e.x + Math.sin(yaw) * 1.3, mz = e.z + Math.cos(yaw) * 1.3;
            const rapid = e.path === 'rapid' && e.level >= CFG.cannon.branchLevel, heavy = e.path === 'blast' && e.level >= CFG.cannon.branchLevel;
            if (e.kind === 'rocket') { fx.glow(mx, hy, mz, 0.9, 0xff7a3a, 0.12); if (Math.random() < 0.5) fx.trail(mx, hy, mz, 0.3, 0xd8d0c6); }
            else if (rapid) { fx.glow(mx, hy, mz, 0.8, 0xffb35a, 0.08); if (Math.random() < 0.4) fx.trail(mx, hy - 0.2, mz, 0.28, 0xcfc8be); if (Math.random() < 0.35) fx.star(mx, hy, mz, 0.7, 0xffc870, 0.1, 0.3); }
            else {
              fx.star(mx, hy, mz, e.kind === 'nova' ? 2.6 : heavy ? 2.0 : 1.3, e.kind === 'nova' ? 0xe6ccff : 0xffc45a, 0.13, 0.4);   // comic muzzle blast
              fx.glow(mx, hy, mz, e.kind === 'nova' ? 3 : heavy ? 2.4 : 1.4, e.kind === 'nova' ? 0xc07bff : 0xffd27a, heavy ? 0.2 : 0.14);
              fx.puff(mx, hy - 0.6, mz, 0xcfc8be, e.kind === 'nova' ? 1.6 : heavy ? 1.7 : 0.8);
              if (heavy) this.shake = Math.max(this.shake, 0.12);
            }
          }
        }
        break;
      }
      case 'explode': {
        const blastPath = e.path !== 'rapid';
        const style = e.kind === 'nova' ? 'nova' : blastPath && e.level >= 7 ? 'nova' : blastPath && e.level === 6 ? 'crystal' : 'fire';
        fx.explosion(e.x, e.z, e.r, e.kind === 'side' && e.level === 7 ? 'fire' : style);
        if (e.ring) fx.shockRing(e.x, e.z, e.ring, e.level === 6 ? 0x6fe9ff : 0xb87cff);
        const small = e.kind === 'bomblet' || e.kind === 'rocket' || e.path === 'rapid';
        this.shake = Math.max(this.shake, e.kind === 'nova' ? 0.8 : small ? 0.04 : Math.min(0.45, e.r * 0.11));
        break;
      }
      case 'salvo': {
        const tv = this.towerViews.get(e.slot);
        if (tv) fx.glow(e.x, tv.group.position.y + 2, e.z, 3, 0xff7a3a, 0.3);
        break;
      }
      case 'pay': {
        const h = sim.hero;
        if (Math.random() < 0.8) fx.flyCoin(h.x, h.y + 1.0, h.z, e.x, e.y + 0.2, e.z);
        const pv = this.padViews.get(e.id); if (pv) pv.pop = 1;
        break;
      }
      case 'built': {
        const scale = e.kind === 'fortress' ? 2.6 : e.kind === 'repair' ? 2 : 1;
        fx.buildFlash(e.x, e.y, e.z, scale);
        if (e.kind === 'repair') fx.ring(e.x, 0.2, e.z, 6, 0x7fe08a, 0.7);
        if (e.kind === 'fortress') { this._setFortressLevel(e.level, false); this.shake = 0.5; }
        this.shadowDirty = true;
        break;
      }
      case 'padAppear': fx.ring(e.x, groundHeight(e.x, e.z), e.z, 1.5, 0xffffff, 0.5); break;
      case 'fortressHit': this.fortHitFlash = 0.25; break;
      case 'loaded': this.reset(sim); break;
      default: break;
    }
    fx.lift = 0;
  }

  // ------------------------------------------------------------- per frame
  sync(sim, dt) {
    this.time += dt;
    const t = this.time;
    this._syncLighting(sim, dt);
    this._updateCamera(sim, dt);
    this.camera.updateMatrixWorld();
    // ---- grunts + blobs + giants
    const bm = this.blobMesh, im = this.iceMesh, RM = this.ratMeshes, RA = this.ratAnims;
    const rn = this._rn || (this._rn = new Int32Array(RM.length)); rn.fill(0);
    let bn = 0, icn = 0, dzn = 0;
    const dzm = this.dizzyMesh;
    this.pokeBudget = Math.min(6, this.pokeBudget + dt * 60);
    this.jetBudget = Math.min(6, (this.jetBudget || 0) + dt * 40);
    this.sparkBudget = Math.min(3, this.sparkBudget + dt * 10);
    this.dustBudget = Math.min(4, (this.dustBudget || 0) + dt * 14);
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    this.ratUniforms.uTime.value = t;
    const fighting = sim.state === 'wave';
    const spawnS = CFG.spawnS;
    for (const e of sim.enemies) {
      if (e.type === T_GRUNT) {
        const vt = e.v === SHIELD && !(e.shield > 0) ? SHIELDLESS : e.v || 0, gm = RM[vt], ra = RA[vt].array, gn = rn[vt];
        if (gn >= 1400) continue;
        const RT = CFG.ratTypes[e.v || 0], sc = RT.scale;
        // climbing out of the burrow: rise from below ground, nose first
        const em = Math.min(1, (e.s - spawnS) / 1.4);
        let y = 0, pitch = 0;
        if (em < 1) {
          const u = 1 - Math.max(0, em);
          y = -u * u * 0.75; pitch = -u * 0.7;
          if (em < 0.15 && Math.random() < 0.08) this.fx.puff(e.x, 0, e.z, 0x9b7650, 0.55);
        }
        if (e.born > 0) { const u = e.born / 0.45; y += Math.sin(u * Math.PI) * 0.7; pitch -= u * 0.6; }   // a ratling tumbling out of its sack
        if (e.fall > 0) {   // dropped from the buzzard's net: falls, tumbling, and lands in a puff
          const u = 1 - e.fall / e.fallT;
          y += e.fallH * (1 - u * u); pitch += Math.sin(u * 9 + e.phase) * 0.8;
          if (e.fall < 0.05 && Math.random() < 0.35) { this._lift(e.x, e.z).puff(e.x, 0, e.z, 0xd9c7a8, 0.7); this.fx.lift = 0; }
        }
        // the new rats' tricks: a ninja backflips out of an arrow's way, a jetpack rat
        // hops forward on two jets of flame, a bomb's fuse fizzes
        let trick = 0;
        if (e.v === NINJA && e.dodgeT > 0) {
          const k = 1 - (e.dodgeT - (CFG.ratTypes[NINJA].dodge.every - 0.42)) / 0.42;
          if (k < 1) { y += Math.sin(k * Math.PI) * 0.75; pitch -= k * Math.PI * 2; }
        } else if (e.v === JET && e.boost > 0) {
          const k = 1 - e.boost / CFG.ratTypes[JET].jet.t;
          y += Math.sin(k * Math.PI) * 0.55; pitch += 0.28 * Math.sin(k * Math.PI);
          trick = 1;
        } else if (e.v === BOMB && this.sparkBudget >= 1 && Math.random() < 0.05) trick = 2;
        // thrown back by a blast: the simulation moves the rat at once; it is drawn flying
        // back along the road in a hop (a big blast flips it head over heels)
        let ex = e.x, ez = e.z;
        if (e._vs === undefined || e.s >= e._vs - 0.02 || dt === 0) { e._vs = e.s; e._kb = 0; }
        else {
          e._kb = Math.max(e._kb || 0, e._vs - e.s);
          e._vs = Math.max(e.s, e._vs - 10 * dt);
          const prog = 1 - (e._vs - e.s) / e._kb;
          y += Math.sin(prog * Math.PI) * Math.min(0.9, 0.3 + e._kb * 0.3);
          pitch -= e._kb > 1.1 ? prog * Math.PI * 2 : Math.sin(prog * Math.PI) * 0.7;
          road.sample(e._vs, _road); ex = _road.x + _road.nx * e.lat; ez = _road.z + _road.nz * e.lat;
        }
        const gy = this._gy(ex, ez);
        y += gy;
        if (trick === 1 && this.jetBudget >= 1) {   // flames and smoke out of the jetpack
          this.jetBudget--;
          const bx = ex - Math.sin(e.yaw) * 0.45 * sc, bz = ez - Math.cos(e.yaw) * 0.45 * sc;
          this.fx.glow(bx, y + 0.35 * sc, bz, 0.9, 0xff8a24, 0.14);
          if (Math.random() < 0.5) this.fx.trail(bx, y + 0.3 * sc, bz, 0.26, 0xd9d0c8);
        } else if (trick === 2) {   // sparks fizzing off the bomb's fuse
          this.sparkBudget -= 0.5;
          this.fx.glow(ex + Math.sin(e.yaw) * 0.1, y + 1.45 * sc, ez + Math.cos(e.yaw) * 0.1, 0.5, 0xffd23a, 0.12);
        }
        _p.set(ex, y, ez);
        _e.set(pitch, e.yaw, 0, 'YXZ'); _q.setFromEuler(_e);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        gm.setColorAt(gn, e.frozen > 0 ? this.tint.frozen : e.stun > 0 ? (e.slow > 0 ? this.tint.both : this.tint.stun) : e.slow > 0 ? this.tint.slow : e.healed > 0 ? this.tint.healed : this.tint.normal);
        const o = gn * 4;
        ra[o] = e.s * 11 * (1.1 / sc) + e.phase;                               // walk cycle follows the ground covered
        ra[o + 1] = e.stun > 0 ? -1 : Math.max(0, e.hitT / CFG.hitFlinch);
        ra[o + 2] = e.atGate && fighting ? attackPhase(e.attackT, CFG.grunt.gateRate) : -1;
        ra[o + 3] = 0;
        gm.setMatrixAt(gn, _m); rn[vt] = gn + 1;
        const k = sc / 1.1;
        if (e.frozen > 0 && icn < 600) {
          _p.set(ex, gy + 0.34 * k, ez); _s.set(0.9 * k, 0.8 * k, 1.15 * k); _m.compose(_p, _q, _s); im.setMatrixAt(icn++, _m);
        } else if (e.stun > 0 && dzn < 318) {
          // dazed by a blast: little stars circle its head
          for (let d = 0; d < 3; d++) {
            const a = t * 6.5 + e.phase + d * 2.094;
            _p.set(ex + Math.cos(a) * 0.34 * k, y + (0.86 + Math.sin(t * 9 + d * 2) * 0.05) * k, ez + Math.sin(a) * 0.34 * k);
            _q.copy(this.camera.quaternion).multiply(_e2q(t * 4 + d));
            _s.set(k, k, k); _m.compose(_p, _q, _s); dzm.setMatrixAt(dzn++, _m);
          }
        }
        if (em > 0.3) { _p.set(ex, gy + 0.06, ez); _s.set(0.85 * k, 1, 1.6 * k); _q.setFromAxisAngle(UP, e.yaw); _m.compose(_p, _q, _s); bm.setMatrixAt(bn++, _m); }
      } else {
        seen.add(e.id);
        let v = this.giantViews.get(e.id);
        const style = e.type === T_BOSS ? e.boss || 'king' : e.boss || false;   // the slimes a Sewer Slime splits into keep its look
        if (!v) { v = this._getGiant(style); this.giantViews.set(e.id, v); v.lastHp = -1; }
        const sc = giantScale(e);
        v.baseScale = sc;
        const ph = e.s * 3.2 + e.phase;                                         // stride follows the ground covered
        const em = Math.min(1, (e.s - spawnS) / 2.2);
        const u = 1 - Math.max(0, em);
        v.group.position.set(e.x, -u * u * 2.6 * sc, e.z);
        const ggy = this._gy(e.x, e.z);   // the ground under it (a hill on Level 2), added once the pose is set
        v.group.rotation.y = e.yaw;
        v.group.rotation.x = -u * 0.5;
        v.group.scale.setScalar(sc);
        if (em < 0.2 && Math.random() < 0.3) this.fx.puff(e.x + (Math.random() - 0.5) * 2, 0, e.z + (Math.random() - 0.5) * 2, 0x9b7650, 1.2);
        const fl = e.hitT > 0 ? Math.sin(e.hitT / CFG.hitFlinch * Math.PI) : 0;  // flinch from a hit
        let lean = -0.16 * fl;
        if (style === 'slime') this._poseSlime(v, e, sc, fighting);
        else if (style === 'buzzard') this._poseBuzzard(v, e, sc, t, fighting);
        else if (e.stun > 0) {
          // stunned or frozen: hold the pose
        } else if (!e.atGate) {
          const sw = Math.sin(ph);
          v.legL.rotation.x = sw * 0.55; v.legR.rotation.x = -sw * 0.55;
          v.armL.rotation.x = -sw * 0.35; v.armR.rotation.x = sw * 0.25 - 0.1;
          v.body.position.y = Math.abs(Math.cos(ph)) * 0.12;
          v.body.rotation.z = sw * 0.05;
          lean += 0.06;                                                         // heavy forward stomp
        } else {
          // club smash on the gate, landing exactly when the gate takes the hit
          const a = fighting ? attackPhase(e.attackT, CFG.giant.gateRate) : 0;
          const up = smooth(0.05, 0.55, a) * (1 - smooth(0.58, 0.66, a));
          const down = smooth(0.58, 0.66, a) * (1 - smooth(0.74, 1, a));
          v.armR.rotation.x = -2.7 * up + 0.7 * down;
          v.armL.rotation.x = -0.8 * up + 0.2 * down;
          v.legL.rotation.x = 0.25; v.legR.rotation.x = -0.25;
          v.body.position.y = 0.1 * up;
          v.body.rotation.z = 0;
          lean += -0.14 * up + 0.3 * down;
          if (down > 0.9 && !v.smashed) { v.smashed = true; this._lift(e.x, e.z).puff(e.x + Math.sin(e.yaw) * 2 * sc, 0, e.z + Math.cos(e.yaw) * 2 * sc, 0xd9c7a8, 1.3); this.fx.lift = 0; }
          if (a < 0.3) v.smashed = false;
        }
        if (style !== 'slime' && style !== 'buzzard') {
          v.body.rotation.x = lean;
          v.body.position.z = -0.14 * fl;
          v.body.scale.set(1 + 0.08 * fl, 1 - 0.1 * fl, 1 + 0.08 * fl);   // squashed by the hit
          if (style === 'mole') this._poseMole(v, e, sc, t);
        }
        // a tunnelling mole is out of sight (its hump of earth shows instead)
        v.group.position.y += ggy;
        if (e.under !== v.hidden) { v.hidden = e.under; v.group.visible = !e.under; v.label.style.display = e.under ? 'none' : ''; }
        if (e.flash > 0) v.mat.emissive.setScalar(0.85);
        else if (e.broken > 0) v.mat.emissive.setRGB(0.32 + Math.sin(t * 10) * 0.12, 0.06, 0.45);   // armour cracked (Crystal Quake / Doomsday Nova)
        else v.mat.emissive.setScalar(0);
        if (e.frozen > 0) { v.mat.color.setRGB(0.85, 1.2, 1.7); if (!(e.flash > 0)) v.mat.emissive.setRGB(0.1, 0.22, 0.3); }
        else if (e.slow > 0) v.mat.color.setRGB(0.66, 0.86, 1.3); else if (e.stun > 0) v.mat.color.setRGB(1.25, 1.15, 0.6); else v.mat.color.setRGB(1, 1, 1);
        if (e.frozen > 0 && icn < 600) {
          if (style === 'slime') { _p.set(e.x, ggy + 0.75 * sc, e.z); _s.set(3.4 * sc, 2.4 * sc, 3.4 * sc); }
          else { _p.set(e.x, ggy + 1.35 * sc, e.z); _s.set(1.6 * sc, 2.4 * sc, 1.6 * sc); }
          _m.compose(_p, _q.setFromAxisAngle(UP, e.yaw), _s); im.setMatrixAt(icn++, _m);
        }
        if (em > 0.3 && !e.under) {
          // a flier's shadow shrinks the higher it flies
          const bs = style === 'buzzard' ? 2.4 * sc * (1 - Math.min(0.55, e.fly / 10)) : style === 'slime' ? 2.4 * sc : 2.6 * sc;
          _p.set(e.x, ggy + 0.06, e.z); _s.set(bs, 1, bs); _m.compose(_p, _q.identity(), _s); bm.setMatrixAt(bn++, _m);
        }
        // HP number above the head
        const hp = Math.max(0, Math.ceil(e.hp));
        if (hp !== v.lastHp) { v.label.textContent = hp; v.lastHp = hp; v.label.classList.toggle('boss', e.type === T_BOSS); }
        this._placeLabel(v.label, e.x, v.top * sc + 0.3 + v.group.position.y, e.z);
      }
    }
    // defeated / spent small rats finish their animation
    {
      const list = this.ratDying;
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        d.k += dt / d.dur;
        if (d.k >= 1) { list[i] = list[list.length - 1]; list.pop(); continue; }
        if (!d.puffed && d.k >= 0.58) { d.puffed = true; this.fx.puff(d.x, 0, d.z, 0xffffff, 1); }
        const vt = d.v || 0, gm = RM[vt], ra = RA[vt].array, gn = rn[vt];
        if (gn >= 1400) continue;
        const sc = CFG.ratTypes[vt === SHIELDLESS ? SHIELD : vt].scale;
        _p.set(d.x, d.gy || 0, d.z); _q.setFromAxisAngle(UP, d.yaw); _s.set(sc, sc, sc); _m.compose(_p, _q, _s);
        gm.setColorAt(gn, this.tint.normal);
        const o = gn * 4;
        ra[o] = d.dir; ra[o + 1] = 0; ra[o + 2] = -1; ra[o + 3] = d.spent ? -Math.max(d.k, 0.001) : Math.max(d.k, 0.001);
        gm.setMatrixAt(gn, _m); rn[vt] = gn + 1;
        const b = (1 - d.k) * sc / 1.1;
        _p.set(d.x, (d.gy || 0) + 0.06, d.z); _s.set(0.85 * b, 1, 1.6 * b); _m.compose(_p, _q, _s); bm.setMatrixAt(bn++, _m);
      }
    }
    // ---- Tunnel Mole: a hump of earth races along while it tunnels, and red
    // cracks mark the spot near the town where it will burst out
    {
      let mole = null;
      for (const e of sim.enemies) if (e.boss === 'mole' && (e.dig === 1 || e.dig === 2)) { mole = e; break; }
      const under = !!(mole && mole.under);
      this.mound.visible = under;
      if (under) {
        const w = Math.sin(t * 18) * 0.08;
        this.mound.position.set(mole.x, this._gy(mole.x, mole.z), mole.z);
        this.mound.rotation.y = mole.yaw;
        this.mound.scale.set(1.6 + w, 1.4 - w, 1.6 + w);
        this.moundPuff -= dt;
        if (this.moundPuff <= 0) {
          this.moundPuff = 0.07;
          this._lift(mole.x, mole.z).puff(mole.x - Math.sin(mole.yaw) * 1.8 + (Math.random() - 0.5) * 1.5, 0, mole.z - Math.cos(mole.yaw) * 1.8 + (Math.random() - 0.5) * 1.5, 0x9b7650, 1.1);
          this.fx.lift = 0;
        }
        this.shake = Math.max(this.shake, 0.05);   // the ground rumbles
      }
      this.exitMark.visible = !!mole;
      if (mole) {
        road.sample(CFG.bosses.mole.dig.exit, _road);
        const pulse = 0.5 + 0.5 * Math.sin(t * 9);
        this.exitMark.position.set(_road.x + _road.nx * mole.lat, 0.1 + this._gy(_road.x, _road.z), _road.z + _road.nz * mole.lat);
        this.exitMark.rotation.y = t * 0.6;
        this.exitMark.scale.setScalar(1 + pulse * 0.12);
        this.exitMat.opacity = 0.45 + pulse * 0.45;
      }
    }
    for (const [id, v] of this.giantViews) {
      if (seen.has(id)) continue;
      if (v.dying !== undefined && v.dying < 1) { this._animateGiantDeath(v, dt, t); continue; }
      v.inUse = false; v.group.visible = false; v.label.style.display = 'none'; v.dying = undefined; this.giantViews.delete(id);
    }
    for (let i = 0; i < RM.length; i++) {
      const gm = RM[i];
      gm.count = rn[i]; gm.instanceMatrix.needsUpdate = true;
      if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
      RA[i].needsUpdate = true;
    }
    im.count = icn; im.instanceMatrix.needsUpdate = true;
    dzm.count = dzn; dzm.instanceMatrix.needsUpdate = true;
    // ---- hero
    const h = sim.hero, hv = this.hero;
    hv.group.position.set(h.x, h.y, h.z);
    const targetYaw = h.facing;
    let dy = targetYaw - hv.inner.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    hv.inner.rotation.y += dy * Math.min(1, dt * 14);
    const speed = Math.hypot(h.vx, h.vz);
    hv.phase += dt * (6 + speed * 1.6);
    const sw = h.moving ? Math.sin(hv.phase) : 0;
    hv.legL.rotation.x = sw * 0.7; hv.legR.rotation.x = -sw * 0.7;
    hv.armL.rotation.x = -sw * 0.6; hv.armR.rotation.x = sw * 0.6;
    hv.inner.position.y = h.moving ? Math.abs(Math.cos(hv.phase)) * 0.1 : Math.sin(t * 2) * 0.02;
    hv.ring.material.opacity = 0.1 + (h.collect > 0 ? 0.25 : 0) + (sim.coins.length ? 0.06 : 0);
    hv.ring.position.y = groundHeight(h.x, h.z) - h.y + 0.09;
    _p.set(h.x, h.y + 0.06, h.z); _s.set(1.3, 1, 1.3); _m.compose(_p, _q.identity(), _s); bm.setMatrixAt(bn++, _m);
    // ---- townsfolk go about their day (and react to the rats)
    this.town.update(dt, sim);
    bn = this.town.writeBlobs(bm, bn, 1500);
    bm.count = bn; bm.instanceMatrix.needsUpdate = true;

    // ---- coins
    const cm = this.coinMesh;
    let cn = 0;
    for (const c of sim.coins) {
      const spin = c.spin + c.age * (c.state ? 14 : 2.6);
      _p.set(c.x, c.y + (c.rest ? 0.12 + Math.sin(t * 3 + c.spin) * 0.04 : 0.1), c.z);
      const s = c.value > 1 ? Math.min(1.8, 1 + Math.log2(c.value) * 0.2) : 1;
      let sx = s, sy = s;
      if (c.state === 0 && !c.rest) {
        // in the air: flipping end over end, stretched along its fall
        _e.set(c.age * 15 + c.spin, c.spin, 0, 'YXZ'); _q.setFromEuler(_e);
        sy *= 1 + Math.min(0.25, Math.abs(c.vy) * 0.02);
      } else _q.setFromAxisAngle(UP, spin);
      if (c.bt < 0.22) {   // squashed flat by each bounce, the harder the flatter
        const f = 1 - c.bt / 0.22, a = Math.min(0.55, 0.12 + (c.bv || 0) * 0.045) * f * f;
        sy *= 1 - a; sx *= 1 + a * 0.7;
      }
      // a puff of dust where it lands hard
      if (c.bt < (c._bt ?? 9) && c.bv > 5 && this.dustBudget >= 1) { this.dustBudget--; this.fx.puff(c.x, c.y - 0.2, c.z, 0xeadbb8, 0.42); }
      c._bt = c.bt;
      _s.set(sx, sy, sx);
      _m.compose(_p, _q, _s); cm.setMatrixAt(cn++, _m);
    }
    cm.count = cn; cm.instanceMatrix.needsUpdate = true;
    // now and then a coin on the ground glints
    if (cn && Math.random() < dt * 3) {
      const c = sim.coins[(Math.random() * cn) | 0];
      if (c && c.rest && c.state === 0) this.fx.twinkle(c.x + (Math.random() - 0.5) * 0.3, c.y + 0.45, c.z, 0.5);
    }

    // ---- bolts
    const bo = this.boltMesh, tr = this.trailMesh;
    let bc = 0;
    for (const b of sim.bolts) {
      if (bc >= 260) break;
      if (b.fall) _dir.set(b.dx * 0.28, -1, b.dz * 0.28).normalize();   // Crystal Storm arrows drop from the sky
      else { const slope = b.d < b.aim ? (b.y1 - b.y0) / b.aim : 0; _dir.set(b.dx, slope, b.dz).normalize(); }
      _q.setFromUnitVectors(FWD, _dir);
      const k = b.fall ? 1.5 : b.level === 4 ? 1.3 : 1;                 // heavy Armor Piercer arrows are chunkier
      _p.set(b.x, b.y, b.z); _s.set(k, k, k);
      _m.compose(_p, _q, _s); bo.setMatrixAt(bc, _m);
      _s.set(k, k, Math.min(b.d, b.fall ? 5 : b.level >= 6 ? 4.2 : 3.2)); _m.compose(_p, _q, _s); tr.setMatrixAt(bc, _m);
      const bcol = this.boltColors[b.level] || this.boltColors[1];
      bo.setColorAt(bc, bcol); tr.setColorAt(bc, bcol);
      bc++;
    }
    const flying = bc;
    bc = this._drawStuck(dt, bo, bc);   // arrows stuck in giants and bosses
    bo.count = bc; tr.count = flying; bo.instanceMatrix.needsUpdate = true; tr.instanceMatrix.needsUpdate = true;
    if (bo.instanceColor) bo.instanceColor.needsUpdate = true;
    if (tr.instanceColor) tr.instanceColor.needsUpdate = true;

    // ---- cannonballs
    {
      const sm = this.shellMesh, gsm = this.glowShellMesh;
      let n = 0, g = 0;
      const imp = this.impactMesh; let ic = 0;
      for (const sh of sim.shells) {
        // shadow on the ground under the ball sells the arc
        const gy = groundHeight(sh.x, sh.z);
        const hgt = Math.max(0, sh.y - gy);
        const bs = Math.max(0.25, 0.9 - hgt * 0.07) * (sh.kind === 'nova' ? 2 : 1);
        if (bm.count < 1500) { _p.set(sh.x, gy + 0.07, sh.z); _s.set(bs, 1, bs); _m.compose(_p, _q.identity(), _s); bm.setMatrixAt(bm.count++, _m); }
        // a ring marks where it will land, as wide as the blast
        if (ic < 120) {
          const k = Math.min(1, sh.t / sh.T);
          const r = (sh.r || 2) * (1.25 - 0.25 * k);
          _p.set(sh.tx, groundHeight(sh.tx, sh.tz) + 0.1, sh.tz); _s.set(r, 1, r); _m.compose(_p, _q.identity(), _s);
          imp.setMatrixAt(ic, _m);
          const rp = sh.path === 'rapid' && sh.level >= 4;
          const c = rp ? (sh.kind === 'rocket' ? [1, 0.45, 0.1] : [0.95, 0.6, 0.15]) : sh.kind === 'nova' || sh.level === 7 ? [0.62, 0.25, 0.95] : sh.level === 6 ? [0.1, 0.7, 0.9] : [0.92, 0.28, 0.12];
          imp.instanceColor.setXYZ(ic, c[0], c[1], c[2]);
          ic++;
        }
        // smoke (or crystal sparkle) trailing behind
        const rapidShell = sh.path === 'rapid' && sh.level >= 4;
        if (Math.random() < dt * (sh.kind === 'rocket' ? 40 : rapidShell ? 14 : 22)) {
          this.fx.trail(sh.x, sh.y, sh.z, sh.kind === 'nova' ? 0.7 : sh.kind === 'bomblet' ? 0.18 : rapidShell ? 0.24 : sh.level >= 4 ? 0.45 : 0.32,
            rapidShell ? (sh.level >= 6 || sh.kind === 'rocket' ? 0xffc890 : 0xd8d0c6) : sh.level >= 6 ? (sh.level === 6 ? 0xc8f6ff : 0xe4ccff) : 0xd8d0c6);
        }
        // fire shells and rockets glow orange; crystal and Nova shells glow blue and purple
        const glow = rapidShell ? sh.level >= 6 || sh.kind === 'rocket' : sh.level >= 6;
        const scale = sh.kind === 'nova' ? 2.3 : sh.kind === 'bomblet' ? 0.5 : sh.kind === 'rocket' ? 0.62 : rapidShell ? 0.72 : sh.kind === 'side' ? 0.85 : sh.level >= 4 ? 1.6 : 1;
        _p.set(sh.x, sh.y, sh.z); _s.set(scale, scale, scale); _m.compose(_p, _q.identity(), _s);
        if (glow) {
          gsm.setMatrixAt(g, _m); gsm.setColorAt(g, this._shellColor || (this._shellColor = new THREE.Color()));
          gsm.instanceColor.setXYZ(g, ...(rapidShell ? (sh.kind === 'rocket' ? [1, 0.42, 0.12] : [1, 0.62, 0.2]) : sh.level === 6 ? [0.55, 1.0, 1.0] : [0.85, 0.55, 1.0]));
          g++;
          if (Math.random() < (rapidShell ? 0.35 : 0.7)) this.fx.glow(sh.x, sh.y, sh.z, sh.kind === 'nova' ? 2.2 : rapidShell ? 0.6 : 0.9, rapidShell ? 0xff8a3a : sh.level === 6 ? 0x7ff3ff : 0xc07bff, 0.22);
        } else { sm.setMatrixAt(n++, _m); }
      }
      sm.count = n; sm.instanceMatrix.needsUpdate = true;
      imp.count = ic; imp.instanceMatrix.needsUpdate = true; if (imp.instanceColor) imp.instanceColor.needsUpdate = true;
      bm.instanceMatrix.needsUpdate = true;
      gsm.count = g; gsm.instanceMatrix.needsUpdate = true; if (gsm.instanceColor) gsm.instanceColor.needsUpdate = true;
    }
    // ---- burning ground
    {
      const zm = this.zoneMesh; let n = 0;
      for (const zn of sim.zones) {
        const k = zn.t / zn.max;
        const fl = 0.85 + Math.sin(t * 17 + zn.x) * 0.1 + Math.sin(t * 29 + zn.z) * 0.05;
        _p.set(zn.x, 0.09 + groundHeight(zn.x, zn.z), zn.z); _s.set(zn.r * 1.25 * fl, 1, zn.r * 1.25 * fl); _m.compose(_p, _q.identity(), _s);
        zm.setMatrixAt(n, _m); zm.instanceColor.setXYZ(n, Math.min(1, k * 2), Math.min(1, k * 2) * 0.9, Math.min(1, k * 2) * 0.8); n++;
        if (Math.random() < dt * 9) { const a = Math.random() * 6.28, d = Math.random() * zn.r; this._lift(zn.x, zn.z).glow(zn.x + Math.cos(a) * d, 0.5, zn.z + Math.sin(a) * d, 0.9, 0xff8a24, 0.4); this.fx.lift = 0; }
      }
      zm.count = n; zm.instanceMatrix.needsUpdate = true; if (zm.instanceColor) zm.instanceColor.needsUpdate = true;
    }

    // ---- towers
    if (this.towerViews.size > sim.towers.length) {
      const live = new Set(sim.towers.map((t) => t.slotIndex));
      for (const [k, v] of this.towerViews) if (!live.has(k)) { this.scene.remove(v.group); this.towerViews.delete(k); this.shadowDirty = true; }
    }
    for (const tw of sim.towers) {
      let v = this.towerViews.get(tw.slotIndex);
      if (v && v.kind !== (tw.kind || 'crossbow')) { this.scene.remove(v.group); this.towerViews.delete(tw.slotIndex); v = null; }
      if (!v) { v = this._makeTower(tw); this.towerViews.set(tw.slotIndex, v); this.shadowDirty = true; }
      if (v.level !== tw.level || (v.path || null) !== (tw.path || null)) this._setTowerLevel(v, tw.level, tw.path);
      v.head.rotation.y = tw.yaw;
      // recoil spring: each shot kicks the tower back; it springs forward past rest and settles
      {
        const steps = dt > 1 / 50 ? 3 : 1, h = Math.min(dt, 0.1) / steps;
        v.kick = v.kick || 0; v.kickV = v.kickV || 0;
        for (let i = 0; i < steps; i++) { v.kickV += (-300 * v.kick - 19 * v.kickV) * h; v.kick += v.kickV * h; }
        v.kick = clampN(v.kick, -0.6, 1.6);
        v.recoil = Math.max(0, v.kick);
      }
      const kick = v.kick;
      const ease = 1 - Math.exp(-dt * 8);
      if (v.kind === 'cannon') {
        // raise the barrels to the angle the cannonball will leave at
        let want = CANNON_REST_PITCH;
        const a = tw.aim;
        if (a && a.e && a.e.alive) {
          const d = Math.max(1, Math.hypot(a.x - tw.x, a.z - tw.z));
          const oy = tw.y + CFG.cannon.headY[tw.level] + 0.35;
          want = Math.min(1.0, Math.max(0.08, Math.atan(((0.3 - oy) + 4 * (1.4 + d * 0.12)) / d)));
        }
        v.elev += (want - v.elev) * ease;
        v.gun.rotation.x = -v.elev;
        v.gunMesh.position.z = v.gunGlow.position.z = -kick * 0.42;   // the barrel slides back on its carriage
        v.headMesh.position.z = v.headGlow.position.z = -kick * 0.08;
        v.gun.scale.set(1 + 0.09 * kick, 1 + 0.09 * kick, 1 - 0.16 * kick);   // squashes as it fires, stretches as it springs back
      } else {
        // tilt the crossbow down at the rat it is tracking
        let want = 0;
        const tg = tw.target;
        if (tg && tg.alive) {
          const d = Math.max(1, Math.hypot(tg.x - tw.x, tg.z - tw.z));
          const dy = tw.y + CFG.muzzleHeight[tw.level] - (tg.type === T_GRUNT ? 0.55 : tg.type === T_BOSS ? 2.2 : 1.6);
          want = Math.min(0.45, Math.max(-0.2, Math.atan2(dy, d)));
        }
        v.pitch += (want - v.pitch) * ease;
        v.head.rotation.x = v.pitch - kick * 0.12;   // the bow jerks up a touch as it looses
        v.headMesh.position.z = v.headGlow.position.z = -kick * 0.26;
        const sq = 1 - 0.13 * kick, bulge = 1 + 0.07 * kick;
        v.headMesh.scale.set(bulge, bulge, sq); v.headGlow.scale.set(bulge, bulge, sq);
      }
      if (v.pop >= 1) { const th = Math.max(0, kick); v.group.scale.set(1 + 0.015 * th, 1 - 0.03 * th, 1 + 0.015 * th); }   // the whole tower thumps
      if (v.charge.visible) {
        // Doomsday Nova charging: a purple glow swells in the main barrel
        const L7 = CFG.cannon.paths.blast.levels[7].nova.charge;
        const k = Math.min(1, (tw.charge || 0) / L7);
        const s = 0.4 + k * 1.8 + (k >= 1 ? Math.sin(t * 14) * 0.25 : 0);
        v.charge.scale.set(s, s, 1);
        v.charge.material.opacity = 0.3 + k * 0.7;
      }
      if (v.aura.visible) { const k = 0.85 + Math.sin(t * 3 + tw.slotIndex) * 0.15; v.aura.scale.set(1.9 * k, 2.6 * k, 1); v.aura.material.opacity = 0.55 + 0.25 * k; }
      if (v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt * 2.4);
        const k = v.pop;
        const s = k < 1 ? 1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.35 : 1;
        v.group.scale.set(s, k < 0.25 ? k / 0.25 * s : s, s);
        if (v.pop >= 1) this.shadowDirty = true;
      }
    }

    // ---- fortress pop + damage flash + bar
    const f = sim.fortress;
    if (this.fortressLevel !== f.level) this._setFortressLevel(f.level, true);
    if (this.fortressPop < 1) {
      this.fortressPop = Math.min(1, this.fortressPop + dt * 1.6);
      const k = this.fortressPop;
      const s = 1 + Math.sin(k * Math.PI * 2) * (1 - k) * 0.12;
      this.fortress.scale.set(s, Math.min(1, 0.3 + k * 1.4) * s, s);
      if (k >= 1) this.shadowDirty = true;
    }
    const hpFrac = f.hp / f.maxHp;
    const showBar = hpFrac < 0.999 || f.underAttack > 0;
    this.fortBar.style.display = showBar ? '' : 'none';
    if (showBar) {
      this.fortBarFill.style.width = (hpFrac * 100).toFixed(1) + '%';
      this.fortBar.classList.toggle('hit', f.flash > 0);
      this._placeLabel(this.fortBar, f.x, 8 + f.level * 2, f.z);
    }
    this._offscreenIndicator(f);
    this.town.placeEmotes();
    // ---- windmill and chimney smoke
    this.sails.rotation.z -= dt * (sim.state === 'victory' ? 2.2 : 0.55);
    this.smokeT -= dt;
    if (this.smokeT <= 0 && dt > 0) {
      this.smokeT = 0.35;
      const ch = this.chimneys[this.fortressLevel];
      const c = ch[Math.floor(Math.random() * ch.length)];
      this.fx.trail(c[0] + (Math.random() - 0.5) * 0.1, c[1] + 0.2, c[2], 0.32, 0xe8e2da);
    }
    // ---- boss alarm: the burrow flashes red before a boss climbs out; an arrow tracks the boss
    {
      const burrow = this._burrow || (this._burrow = (() => { const o = { x: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 }; road.sample(CFG.spawnS, o); return { x: o.x, z: o.z }; })());
      if (this.bossAlarm > 0) {
        this.bossAlarm -= dt; this.alarmTick -= dt;
        if (this.alarmTick <= 0) {
          this.alarmTick = 0.5;
          this.fx.ring(burrow.x, 0.1, burrow.z, 2.6, 0xff3b30, 0.5);
          this.fx.glow(burrow.x, 0.6, burrow.z, 6, 0xff3b30, 0.4);
        }
      }
      let boss = null;
      for (const e of sim.enemies) if (e.type === T_BOSS && (!boss || e.s > boss.s)) boss = e;
      if (boss) this._edgeArrow(this.bossArrow, boss.x, boss.z, true);
      else this._edgeArrow(this.bossArrow, burrow.x, burrow.z, this.bossAlarm > 0);
    }

    // ---- pads
    const seenPads = this._seenPads || (this._seenPads = new Set());
    seenPads.clear();
    for (const p of sim.pads) {
      seenPads.add(p.id);
      let v = this.padViews.get(p.id);
      if (!v) { v = this._makePad(p); this.padViews.set(p.id, v); v.appear = 0; }
      const remaining = p.cost - p.paid;
      const broke = sim.gold <= 0 && remaining > 0;
      const wait = p.heroOn && !p.armed;
      if (remaining !== v.shown || broke !== v.broke || wait !== v.wait || p.tower !== v.tower) { this._drawPadLabel(v, remaining, p.kind, p.level || 1, broke, wait, p.tower || 'crossbow', p.choice ? p.path : null); v.shown = remaining; v.broke = broke; v.wait = wait; v.tower = p.tower; }
      v.fill.scale.z = Math.max(0.0001, p.paid / p.cost);
      const active = p.heroOn && p.armed && p.lock <= 0;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      v.glow.material.opacity = active ? 0.9 : p.heroOn ? 0.15 : 0.1 + pulse * 0.2;
      v.base.material.opacity = p.heroOn && !active ? 0.6 : 1;
      v.appear = Math.min(1, (v.appear ?? 1) + dt * 3);
      v.pop = Math.max(0, v.pop - dt * 5);
      const s = (v.appear < 1 ? 0.4 + v.appear * 0.6 + Math.sin(v.appear * Math.PI) * 0.25 : 1) * (1 + v.pop * 0.06);
      v.group.scale.set(s, 1, s);
    }
    for (const [id, v] of this.padViews) if (!seenPads.has(id)) { this.scene.remove(v.group); v.tex.dispose(); this.padViews.delete(id); }

    // ---- "step off and back on" reminder above the hero (repeat-purchase safeguard)
    const waiting = sim.pads.some((p) => p.heroOn && !p.armed);
    this.stepWait = waiting ? (this.stepWait || 0) + dt : 0;
    const showStep = this.stepWait > 0.35 && sim.state !== 'victory' && sim.state !== 'defeat';
    this.stepHint.style.display = showStep ? '' : 'none';
    if (showStep) this._placeLabel(this.stepHint, h.x, h.y + 2.6, h.z);

    // ---- tutorial arrow
    if (this.arrowTarget) {
      const p = sim.pads.find((q) => q.id === this.arrowTarget);
      this.arrow.visible = !!p;
      if (p) { this.arrow.position.set(p.x, p.y + 2.2 + Math.abs(Math.sin(t * 4)) * 0.6, p.z); this.arrow.rotation.y = t * 2; }
    } else this.arrow.visible = false;

    // ---- torches flicker
    for (let i = 0; i < this.flames.length; i++) {
      const fl = this.flames[i];
      const k = 0.85 + Math.sin(t * 13 + i * 2.1) * 0.12 + Math.sin(t * 23 + i) * 0.06;
      fl.scale.set(k, k * (1 + this.night * 0.3), k);
    }
    // ---- Level 3: rings of ripples spread across the oasis pool and fade
    const ripples = this.env.ripples;
    if (ripples) for (const r of ripples) {
      r.t += dt / 2.6;
      if (r.t >= 1 || !r.placed) { r.t %= 1; const [x, z] = r.pick(); r.mesh.position.x = x; r.mesh.position.z = z; r.placed = true; }
      const k = 1 + r.t * 4.5;
      r.mesh.scale.set(k, k, 1);
      r.mesh.material.opacity = 0.55 * (1 - r.t) * Math.min(1, r.t * 6);
    }
    // ---- Level 2: the kite drifts and bobs on the breeze above the hill
    const kite = this.env.kite;
    if (kite) {
      const m = kite.mesh;
      m.position.set(kite.x + Math.sin(t * 0.45) * 1.6, kite.h + Math.sin(t * 0.8) * 0.7 + Math.sin(t * 2.3) * 0.15, kite.z + Math.cos(t * 0.37) * 0.9);
      m.rotation.set(-0.35, 0.25 * Math.sin(t * 0.5), 0.22 * Math.sin(t * 1.1));
      const p = kite.string.geometry.attributes.position;
      p.setXYZ(1, m.position.x, m.position.y - 0.4, m.position.z); p.needsUpdate = true;
    }

    this.fx.update(dt);
  }

  // Frees this map's meshes, materials and textures (a new map is about to replace it).
  // The renderer itself stays: the next View draws with it.
  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    this.labels.textContent = '';
  }

  _syncLighting(sim, dt) {
    const target = sim.nightFactor;
    if (this.night === undefined) this.night = target;
    this.night += (target - this.night) * Math.min(1, dt * 0.6 + (dt === 0 ? 1 : 0));
    if (Math.abs(this.night - this.lastNight) < 0.002) return;
    this.lastNight = this.night;
    const n = this.night;
    const a = n < 0.5 ? DAY : DUSK, b = n < 0.5 ? DUSK : NIGHT, k = n < 0.5 ? n * 2 : (n - 0.5) * 2;
    const c1 = new THREE.Color(), c2 = new THREE.Color();
    this.hemi.color.copy(c1.set(a.sky)).lerp(c2.set(b.sky), k);
    this.hemi.groundColor.copy(c1.set(a.gnd)).lerp(c2.set(b.gnd), k);
    this.hemi.intensity = a.hemi + (b.hemi - a.hemi) * k;
    this.sun.color.copy(c1.set(a.sun)).lerp(c2.set(b.sun), k);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * k;
    this.scene.background.copy(c1.set(a.bg)).lerp(c2.set(b.bg), k);
    this.scene.fog.color.copy(this.scene.background);
    // windows light up as the evening comes in
    this.windowMat.color.copy(c1.set(0x3a3550)).lerp(c2.set(0xffc865), THREE.MathUtils.smoothstep(n, 0.25, 0.75));
  }

  _placeLabel(el, x, y, z) {
    _v.set(x, y, z).project(this.camera);
    if (_v.z > 1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = '';
    const sx = (_v.x * 0.5 + 0.5) * this.width, sy = (-_v.y * 0.5 + 0.5) * this.height;
    el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  _offscreenIndicator(f) { this._edgeArrow(this.offArrow, f.x, f.z, f.underAttack > 0); }
  _edgeArrow(el, px, pz, active) {
    if (!active) { el.style.display = 'none'; return; }
    _v.set(px, 3, pz).project(this.camera);
    const on = Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.95 && _v.z < 1;
    if (on) { el.style.display = 'none'; return; }
    el.style.display = '';
    let x = _v.x, y = _v.y;
    if (_v.z > 1) { x = -x; y = -y; }
    const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
    x /= m; y /= m;
    const pad = 46;
    const sx = (x * 0.5 + 0.5) * (this.width - pad * 2) + pad, sy = (-y * 0.5 + 0.5) * (this.height - pad * 2) + pad;
    const ang = Math.atan2(-y, x);
    el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%) rotate(${ang}rad)`;
  }

  _updateCamera(sim, dt) {
    const cam = this.camera;
    const aspect = this.width / this.height;
    // portrait screens look a little more top-down so the road stays readable
    const pitchDeg = aspect < 0.8 ? 52 : aspect < 1.2 ? 51 : 50;
    this.pitch += (THREE.MathUtils.degToRad(pitchDeg) - this.pitch) * (dt === 0 ? 1 : Math.min(1, dt * 3));
    const halfF = THREE.MathUtils.degToRad(cam.fov / 2);
    const tanF = Math.tan(halfF);
    const sinP = Math.sin(this.pitch), cosP = Math.cos(this.pitch);
    // portrait: keep ~19 units of canyon across; landscape: ~30 units of depth
    const dW = 19 / (2 * tanF * aspect);
    const dH = (30 * sinP) / (2 * tanF);
    const want = this.zoomOverride || (this.focus && this.focus.zoom) || THREE.MathUtils.clamp(Math.max(dW, dH), 26, 72);
    this.camDist += (want - this.camDist) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
    const d = this.camDist;
    // keep the view inside the canyon: how far the screen edges reach from the target
    const H = d * sinP;
    const below = d * cosP - H / Math.tan(this.pitch + halfF);
    const above = H / Math.tan(this.pitch - halfF) - d * cosP;
    const halfW = d * tanF * aspect;
    const W = CFG.walk;
    const clampRange = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : THREE.MathUtils.clamp(v, lo, hi));
    const h = this.focus ? { x: this.focus.x, z: this.focus.z + 1.5, y: 0 } : sim.hero;
    const tx = clampRange(h.x, W.minX - 3 + halfW, W.maxX + 3 - halfW);
    const tz = clampRange(h.z - 1.5, W.minZ - 4 + above * 0.55, W.maxZ + 3 - below);
    const k = dt === 0 ? 1 : 1 - Math.exp(-5 * dt);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    this.camTarget.y += (h.y * 0.5 - this.camTarget.y) * k;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake * (this.calmMotion && this.calmMotion.matches ? 0.08 : 0.6);
    cam.position.set(this.camTarget.x + (Math.random() - 0.5) * sh, this.camTarget.y + d * sinP, this.camTarget.z + d * cosP + (Math.random() - 0.5) * sh);
    cam.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z);
  }

  render() {
    if (this.shadowDirty && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Debug info for tests
  stats() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
}
