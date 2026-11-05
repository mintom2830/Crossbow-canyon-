// Draws what the Arsenal towers add to the battlefield: their models (cached
// per kind and level), homing rockets, planted mines, spike beds on the road,
// the Summoner's rat soldiers, flame jets, lightning, sniper tracers, gas
// clouds and the boosts of totems and time warps.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { isArsenal, arsenalSpec } from '../arsenal.js';
import { groundHeight } from '../world.js';
import { toon, INK_PX, inkGeometry, inkInstanced } from './toon.js';
import { applySkin } from './skins.js';
import { arsenalParts, rocketGeometry, mineGeometry, bedFrameGeometry, bedSpikesGeometry, allyGeometry } from './arsenal-models.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();
const FWD = new THREE.Vector3(0, 0, 1);
// towers that aim a barrel and tilt it down at their rat
const TILT = new Set(['ice', 'crystal', 'sniper', 'rocket', 'flame']);
// how hard each tower's shot kicks it back on its spring
const KICK = { mortar: 55, poison: 24, ice: 14, crystal: 12, rocket: 22, sniper: 42, tesla: 10, mine: 26 };

function instanced(geo, mat, max, ink = INK_PX.unit) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
  if (ink) inkInstanced(m, ink);
  return m;
}

export class ArsenalView {
  constructor(view) {
    this.view = view;
    const scene = view.scene;
    this.cache = new Map();
    this.skin = 'classic';
    const mat = toon();
    this.rocketMesh = instanced(rocketGeometry(), mat, 90, INK_PX.thin);
    this.mineMesh = instanced(mineGeometry(), mat, 160, INK_PX.thin);
    this.mineLight = instanced(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 160, 0);
    this.mineLight.setColorAt(0, _c.set(0xff3b30));
    const hw = CFG.roadHalfWidth - 0.35;
    this.bedMesh = instanced(bedFrameGeometry(hw), mat, 40, INK_PX.thin);
    this.spikeMesh = instanced(bedSpikesGeometry(hw), mat, 40, INK_PX.thin);
    this.allyMesh = instanced(allyGeometry(false), mat, 80, INK_PX.rat);
    this.knightMesh = instanced(allyGeometry(true), mat, 80, INK_PX.rat);
    // flame jets: additive blobs of fire that fly out of the nozzle and fade
    this.flameMesh = instanced(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 360, 0);
    this.flameMesh.setColorAt(0, _c.set(0xffffff));
    this.flames = [];
    // a soft ring on the ground for each boosting totem and time warp
    const rg = new THREE.RingGeometry(0.965, 1, 64); rg.rotateX(-Math.PI / 2);
    this.auraRing = instanced(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 30, 0);
    this.auraRing.setColorAt(0, _c.set(0xffffff));
    for (const m of [this.rocketMesh, this.mineMesh, this.mineLight, this.bedMesh, this.spikeMesh, this.allyMesh, this.knightMesh, this.flameMesh, this.auraRing]) scene.add(m);
    this.impale = new Map();   // slot → time its spikes shot up
    this.images = {};
  }

  // ---------------------------------------------------------------- models
  // Geometry and outline hulls for a kind at a level, built once (in the current skin).
  geo(kind, level) {
    const key = kind + level;
    let g = this.cache.get(key);
    if (!g) {
      const parts = arsenalParts(kind, level);
      if (this.skin !== 'classic') { applySkin(parts.base, this.skin); applySkin(parts.head, this.skin); }
      g = { geo: parts, ink: { base: inkGeometry(parts.base, parts.baseGlow), head: inkGeometry(parts.head, parts.headGlow), gun: null } };
      this.cache.set(key, g);
    }
    return g;
  }
  setSkin(id) {
    this.skin = id;
    for (const g of this.cache.values()) { applySkin(g.geo.base, id); applySkin(g.geo.head, id); }
  }

  // ---------------------------------------------------------------- towers
  // Per-frame animation of one Arsenal tower (called from the view's tower loop).
  animateTower(v, tw, dt, t, kick, ease) {
    const kind = v.kind, L = arsenalSpec(kind, tw.level);
    if (TILT.has(kind)) {
      let want = 0;
      const tg = tw.target;
      if (tg && tg.alive) {
        const d = Math.max(1, Math.hypot(tg.x - tw.x, tg.z - tw.z));
        const dy = tw.y + 1.75 + tw.level * 0.08 - (tg.gy || 0) - (tg.fly > 0 ? tg.fly + 0.9 : tg.type === 0 ? 0.55 : 1.8);
        want = Math.min(0.35, Math.max(-0.25, Math.atan2(dy, d)));
      }
      v.pitch += (want - v.pitch) * ease;
      v.head.rotation.x = v.pitch - kick * 0.1;
    } else v.head.rotation.x = 0;
    v.headMesh.position.z = v.headGlow.position.z = -kick * (kind === 'mortar' ? 0.12 : 0.2);
    const sq = 1 - 0.1 * kick, bulge = 1 + 0.06 * kick;
    v.headMesh.scale.set(bulge, kind === 'mortar' ? sq : bulge, kind === 'mortar' ? bulge : sq);
    v.headGlow.scale.copy(v.headMesh.scale);
    // glowing parts pulse: the tesla's orb crackles, the warp's rings spin, a roaring totem's eyes blaze
    if (v.aura.visible) {
      let k = 0.85 + Math.sin(t * 3 + tw.slotIndex) * 0.15, size = 1.6;
      if (kind === 'tesla') { k = 0.8 + Math.random() * 0.3 + (tw.target ? 0.3 : 0); size = 1.5; }
      else if (kind === 'warp') size = 2.6;
      else if (kind === 'totem') size = tw.roarT > 0 ? 2.4 + Math.sin(t * 22) * 0.4 : 0.9;
      else if (kind === 'flame') size = tw.firing ? 1.4 : 0.6;
      else if (kind === 'sniper') size = 0.8;
      else if (kind === 'mine') size = 1.2 + Math.max(0, Math.sin(t * 6)) * 0.6;
      v.aura.scale.set(size * k, size * k, 1);
      v.aura.material.opacity = 0.5 + 0.3 * k;
    }
    if (kind === 'warp') v.headGlow.rotation.y = t * 1.6;
    if (kind === 'totem') {
      // Battle Roar: the totem throbs (the Meshy model has no turning head, so the whole of it)
      const part = v.model ? v.base : v.head, k = v.model ? v.modelK || 1 : 1;
      const b = tw.roarT > 0 ? 1 + Math.abs(Math.sin(t * 18)) * 0.06 : 1;
      part.scale.setScalar(b * k);
    }
    // the flamethrower's jet
    if (kind === 'flame' && tw.firing && dt > 0) this._spray(tw, v, L, dt);
    // boosted towers glitter: red for a totem, blue for a time warp
    if (tw.buff && dt > 0 && Math.random() < dt * 3) this._buffSpark(tw, v);
  }
  // crossbows and cannons get boosts too (and glitter)
  animateBoost(tw, v, dt) { if (tw.buff && dt > 0 && Math.random() < dt * 3) this._buffSpark(tw, v); }
  _buffSpark(tw, v) {
    const fx = this.view.fx, a = Math.random() * 6.28, r = 0.9;
    const y = v.group.position.y + 0.6 + Math.random() * 1.6;
    if (tw.buff & 1) fx.twinkle(tw.x + Math.cos(a) * r, y, tw.z + Math.sin(a) * r, tw.buff & 4 ? 0.7 : 0.45, 0xff6a4a);
    if (tw.buff & 2) fx.twinkle(tw.x - Math.cos(a) * r, y, tw.z - Math.sin(a) * r, 0.45, 0x7fe8ff);
  }
  _spray(tw, v, L, dt) {
    const n = Math.min(4, Math.ceil(dt * 45));
    const yaw = tw.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const s = 0.9 + tw.level * 0.05, nl = 0.55 + tw.level * 0.07;
    const ox = tw.x + fx * (0.7 * s + nl), oz = tw.z + fz * (0.7 * s + nl), oy = v.group.position.y + v.head.position.y + 0.55 * s;
    const R = L.range * (tw.rangeMul || 1);
    for (let i = 0; i < n && this.flames.length < 360; i++) {
      const a = yaw + (Math.random() - 0.5) * L.arc * 1.6, sp = R / 0.42;
      this.flames.push({ x: ox, y: oy, z: oz, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: -0.6 + Math.random() * 0.9, t: 0, life: 0.38 + Math.random() * 0.08 });
    }
  }

  // ---------------------------------------------------------------- frame
  update(sim, dt, t) {
    const fx = this.view.fx;
    // rockets
    {
      const m = this.rocketMesh; let n = 0;
      for (const r of sim.rockets) {
        if (r.delay > 0 || n >= 90) continue;
        _v.set(r.vx, r.vy, r.vz).normalize();
        _q.setFromUnitVectors(FWD, _v);
        _p.set(r.x, r.y, r.z); _s.set(1, 1, 1);
        _m.compose(_p, _q, _s); m.setMatrixAt(n++, _m);
        if (dt > 0 && Math.random() < dt * 30) fx.trail(r.x - _v.x * 0.35, r.y - _v.y * 0.35, r.z - _v.z * 0.35, 0.3, 0xe0d8ce);
        if (dt > 0 && Math.random() < dt * 20) fx.glow(r.x - _v.x * 0.35, r.y - _v.y * 0.35, r.z - _v.z * 0.35, 0.7, 0xff8a3a, 0.08);
      }
      m.count = n; m.instanceMatrix.needsUpdate = true;
    }
    // mines: they arc out of the tower, then sit on the road blinking
    {
      const m = this.mineMesh, l = this.mineLight; let n = 0;
      for (const mi of sim.mines) {
        if (n >= 160) break;
        let x = mi.x, z = mi.z, y = groundHeight(mi.x, mi.z) + 0.02;
        if (mi.fly > 0) {
          const k = 1 - mi.fly / 0.7;
          x = mi.sx + (mi.x - mi.sx) * k; z = mi.sz + (mi.z - mi.sz) * k;
          y = mi.sy + (y - mi.sy) * k + 4 * 1.6 * k * (1 - k);
        }
        _p.set(x, y, z); _q.setFromEuler(_e.set(0, mi.id, 0)); _s.set(1, 1, 1);
        _m.compose(_p, _q, _s); m.setMatrixAt(n, _m);
        const blink = mi.fuse >= 0 || Math.sin(t * 7 + mi.id) > 0.3;
        _p.y += 0.42; _s.setScalar(blink ? 1.2 : 0.6); _m.compose(_p, _q, _s); l.setMatrixAt(n, _m);
        l.setColorAt(n, _c.set(blink ? 0xff3b30 : 0x6a1410));
        n++;
      }
      m.count = l.count = n; m.instanceMatrix.needsUpdate = true; l.instanceMatrix.needsUpdate = true; if (l.instanceColor) l.instanceColor.needsUpdate = true;
    }
    // spike beds, totem and warp rings
    {
      const bm = this.bedMesh, sm = this.spikeMesh, ar = this.auraRing; let n = 0, a = 0;
      for (const tw of sim.towers) {
        if ((tw.kind === 'totem' || tw.kind === 'warp') && a < 30) {
          const L = arsenalSpec(tw.kind, tw.level), pulse = 1 + Math.sin(t * 2 + tw.slotIndex) * 0.015;
          _p.set(tw.x, tw.y + 0.08, tw.z); _s.set(L.r * pulse, 1, L.r * pulse); _m.compose(_p, _q.identity(), _s);
          ar.setMatrixAt(a, _m); ar.setColorAt(a, _c.set(tw.kind === 'totem' ? (tw.roarT > 0 ? 0xff4020 : 0xff7a5a) : 0x5ad8ff)); a++;
        }
        if (tw.kind !== 'spike' || !tw.fields) continue;
        const L = arsenalSpec('spike', tw.level);
        const hit = this.impale.get(tw.slotIndex) || -9, since = t - hit;
        // the spikes stab while rats cross, and shoot right up on Impale
        let up = tw.firing ? 0.85 + Math.abs(Math.sin(t * 9 + tw.slotIndex)) * 0.3 : 0.75;
        if (since < 0.45) up = 1.1 + Math.sin(Math.min(1, since / 0.45) * Math.PI) * 1.0;
        for (const f of tw.fields) {
          if (n >= 40) break;
          const gy = groundHeight(f.x, f.z);
          _q.setFromEuler(_e.set(0, f.yaw, 0));
          _p.set(f.x, gy + 0.03, f.z); _s.set(1, 1, L.r); _m.compose(_p, _q, _s); bm.setMatrixAt(n, _m);
          _s.set(1, up, L.r); _m.compose(_p, _q, _s); sm.setMatrixAt(n, _m);
          n++;
        }
      }
      bm.count = sm.count = n; bm.instanceMatrix.needsUpdate = true; sm.instanceMatrix.needsUpdate = true;
      ar.count = a; ar.instanceMatrix.needsUpdate = true; if (ar.instanceColor) ar.instanceColor.needsUpdate = true;
    }
    // the Summoner's rat soldiers
    {
      const am = this.allyMesh, km = this.knightMesh; let n = 0, k = 0;
      for (const a of sim.allies) {
        if (a.state === 'dead') continue;
        const tw = sim.slots[a.slot].tower;
        const knight = tw && tw.level >= 5;
        const walk = a.state === 'walk';
        const bob = walk ? Math.abs(Math.sin(t * 12 + a.id)) * 0.12 : Math.sin(t * 3 + a.id) * 0.02;
        const lean = a.swing > 0 ? Math.sin(a.swing * Math.PI) * 0.45 : 0;
        _q.setFromEuler(_e.set(lean, a.yaw, walk ? Math.sin(t * 12 + a.id) * 0.08 : 0, 'YXZ'));
        _p.set(a.x, groundHeight(a.x, a.z) + bob, a.z); _s.setScalar(knight ? 1.15 : 1);
        _m.compose(_p, _q, _s);
        if (knight && k < 80) km.setMatrixAt(k++, _m); else if (n < 80) am.setMatrixAt(n++, _m);
        if (a.swing > 0.9 && dt > 0 && Math.random() < 0.5) fx.star(a.x + Math.sin(a.yaw) * 0.6, groundHeight(a.x, a.z) + 0.7, a.z + Math.cos(a.yaw) * 0.6, 0.5, 0xeed4ff, 0.1, 0.3);
      }
      am.count = n; km.count = k; am.instanceMatrix.needsUpdate = true; km.instanceMatrix.needsUpdate = true;
    }
    // flame blobs
    {
      const m = this.flameMesh; let n = 0, j = 0;
      for (const f of this.flames) {
        f.t += dt; if (f.t >= f.life) continue; this.flames[j++] = f;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        f.vx *= 1 - dt * 1.5; f.vz *= 1 - dt * 1.5; f.vy += dt * 2.5;
        const k = f.t / f.life, s = 0.35 + k * 1.6;
        _p.set(f.x, f.y, f.z); _s.setScalar(s); _m.compose(_p, _q.identity(), _s); m.setMatrixAt(n, _m);
        // white-yellow at the nozzle, orange, then dark red as it fades
        if (k < 0.25) _c.setRGB(1, 0.92, 0.55); else if (k < 0.6) _c.setRGB(1, 0.55, 0.12); else _c.setRGB(0.7, 0.18, 0.05);
        m.setColorAt(n, _c.multiplyScalar(1 - k * 0.7)); n++;
      }
      this.flames.length = j;
      m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  reset() { this.flames.length = 0; this.impale.clear(); }

  // ---------------------------------------------------------------- events
  // Returns true when it has handled the event.
  event(e, sim) {
    const view = this.view, fx = view.fx;
    const lift = (x, z) => { fx.lift = view._gy(x, z); return fx; };
    switch (e.type) {
      case 'fire': {
        if (!isArsenal(e.tower)) return false;
        const tv = view.towerViews.get(e.slot);
        if (!tv) return true;
        tv.kickV = (tv.kickV || 0) + (KICK[e.tower] || 15);
        const yaw = tv.head.rotation.y, hy = tv.group.position.y + tv.head.position.y + 0.7;
        const mx = e.x + Math.sin(yaw) * 1.0, mz = e.z + Math.cos(yaw) * 1.0;
        fx.lift = 0;
        if (e.tower === 'mortar') {
          fx.star(e.x, hy + 1.1, e.z, 1.8, 0xffc45a, 0.14, 0.5); fx.glow(e.x, hy + 1.0, e.z, 2.2, 0xffd27a, 0.18); fx.puff(e.x, hy + 0.6, e.z, 0xcfc8be, 1.7);
          view.shake = Math.max(view.shake, 0.1);
        } else if (e.tower === 'poison') { fx.puff(mx, hy, mz, 0xa8e070, 0.9); fx.glow(mx, hy, mz, 1.2, 0x9dff4a, 0.15); }
        else if (e.tower === 'ice') fx.glow(e.x, hy + 0.5, e.z, 1.4, 0x9ff3ff, 0.12);
        else if (e.tower === 'crystal') fx.glow(e.x, hy + 0.6, e.z, 1.6, 0xd29bff, 0.14);
        else if (e.tower === 'rocket') { fx.glow(mx, hy, mz, 1.3, 0xff8a3a, 0.14); fx.puff(e.x - Math.sin(yaw) * 0.6, hy - 0.2, e.z - Math.cos(yaw) * 0.6, 0xd8d0c6, 0.9); }
        return true;
      }
      case 'zap': {
        fx.lift = 0;
        fx.lightning(e.pts, e.level >= 5 ? 0xb8e8ff : 0x8fd8ff, 0.12 + e.level * 0.01);
        const tv = view.towerViews.get(e.slot);
        if (tv) tv.kickV = (tv.kickV || 0) + KICK.tesla;
        return true;
      }
      case 'overload': {
        lift(e.x, e.z).shockRing(e.x, e.z, e.r, 0x8fd8ff);
        fx.lift = 0;
        fx.glow(e.x, e.y, e.z, 4, 0xb8e8ff, 0.35);
        const pts = e.pts;
        for (let i = 0; i + 2 < pts.length && i < 36; i += 3) fx.lightning([e.x, e.y, e.z, pts[i], pts[i + 1], pts[i + 2]], 0xb8e8ff, 0.1, 0.22);
        view.shake = Math.max(view.shake, 0.15);
        return true;
      }
      case 'snipe': {
        fx.lift = 0;
        fx.beam(e.x, e.y, e.z, e.tx, e.ty, e.tz, e.head ? 0.16 : 0.1, e.head ? 0xffc46a : 0xffe8c8, 0.18);
        fx.star(e.x, e.y, e.z, 0.9, 0xffc45a, 0.1, 0.3);
        fx.glow(e.tx, e.ty, e.tz, e.head ? 2.4 : 1.4, e.head ? 0xffb030 : 0xffe0a0, 0.2);
        if (e.head) fx.star(e.tx, e.ty + 0.6, e.tz, 1.5, 0xffd23a, 0.22, 0.8);
        const tv = view.towerViews.get(e.slot);
        if (tv) tv.kickV = (tv.kickV || 0) + KICK.sniper;
        return true;
      }
      case 'explode': {
        if (e.tower !== 'rocket' || !(e.y > 0)) return false;
        // a rocket bursting on a flier, up in the air
        fx.lift = view._gy(e.x, e.z);
        fx.star(e.x, e.y, e.z, 1.6, 0xffd47a, 0.18, 0.4); fx.glow(e.x, e.y, e.z, 3, 0xffa23a, 0.25); fx.puff(e.x, e.y - 0.4, e.z, 0xd8cfc4, 1.2);
        fx.lift = 0;
        return true;
      }
      case 'gas': lift(e.x, e.z).ring(e.x, 0, e.z, e.r / 1.6, 0x9dff4a, 0.6); for (let i = 0; i < 3; i++) fx.puff(e.x + (Math.random() - 0.5) * e.r, 0.1, e.z + (Math.random() - 0.5) * e.r, 0xa8e070, 1.8); fx.lift = 0; return true;
      case 'blizzard': lift(e.x, e.z).shockRing(e.x, e.z, e.r, 0x9ff3ff); fx.frost(e.x, e.z, true); fx.glow(e.x, 1.4, e.z, e.r * 1.6, 0xd8fbff, 0.35); fx.lift = 0; return true;
      case 'inferno': lift(e.x, e.z).ring(e.x, 0, e.z, e.r / 1.4, 0xff8a24, 0.6); fx.glow(e.x, 0.8, e.z, e.r * 2, 0xff8a24, 0.35); fx.puff(e.x, 0.2, e.z, 0x8a6a5a, 1.6); fx.lift = 0; return true;
      case 'impale': {
        this.impale.set(e.slot, view.time || 0);
        for (const [x, z] of e.fields) { lift(x, z).star(x, 0.8, z, 1.4, 0xe8eef2, 0.16, 0.5); fx.puff(x, 0, z, 0xd9c7a8, 1.2); }
        fx.lift = 0;
        view.shake = Math.max(view.shake, 0.08);
        return true;
      }
      case 'roar': {
        const tv = view.towerViews.get(e.slot);
        lift(e.x, e.z).shockRing(e.x, e.z, e.r, 0xff5a3a);
        fx.lift = 0;
        if (tv) { fx.glow(e.x, tv.group.position.y + 3, e.z, 4.5, 0xff5a3a, 0.5); fx.star(e.x, tv.group.position.y + 3.4, e.z, 2.2, 0xffb08a, 0.25, 0.8); }
        view.shake = Math.max(view.shake, 0.18);
        return true;
      }
      case 'warp': {
        lift(e.x, e.z).shockRing(e.x, e.z, e.r, e.kind === 'stop' ? 0xffffff : 0x5ad8ff);
        fx.lift = 0;
        const tv = view.towerViews.get(e.slot);
        if (tv) fx.glow(e.x, tv.group.position.y + 2.2, e.z, e.kind === 'stop' ? 6 : 3.5, e.kind === 'stop' ? 0xe8fbff : 0x5ad8ff, 0.5);
        return true;
      }
      case 'plant': { const tv = view.towerViews.get(e.slot); if (tv) tv.kickV = (tv.kickV || 0) + KICK.mine; lift(e.x, e.z).puff(e.x, 1.4, e.z, 0xd8d0c6, 0.7); fx.lift = 0; return true; }
      case 'allyUp': lift(e.x, e.z).glow(e.x, 1.0, e.z, 2.2, 0xc07bff, 0.3); fx.ring(e.x, 0, e.z, 1.0, 0xc07bff, 0.5); fx.lift = 0; return true;
      case 'allyDown': lift(e.x, e.z).puff(e.x, 0, e.z, 0xd8c8f0, 1.2); fx.confetti(e.x, 0.6, e.z, 8, [0x7a3ad8, 0xc9a27a, 0xd8dee6]); fx.lift = 0; return true;
      default: return false;
    }
  }
}
