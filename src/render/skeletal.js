// Skeletal animation for the enemies Meshy rigged: the giant rat, the four rat
// bosses (Warlord, Baron, King, Mole), the healer rat and the ratling.
//
// Each model (models/anim-<name>.glb) is the Meshy character on Meshy's 24-bone
// humanoid skeleton, with clips merged in by state: Meshy's standard walk, run and
// attack for every one, and from its animation library idle, hit, die, and roar
// (bosses) or cast (healer).
// Root motion was stripped when the file was made (the simulation moves them).
//
// Giants and bosses (a handful on screen) each get a cloned SkinnedMesh and an
// AnimationMixer that crossfades between states (see SkeletalRig). The healer
// rats and ratlings come in crowds, so their clips are baked into a texture of
// bone matrices and played on the graphics card (see bakeCrowd in crowdanim.js).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toon, inkMaterial, inkNormals, INK_PX } from './toon.js';
import { toonPBR } from './toonpbr.js';
import { articulate, PartMover } from './articulate.js';
import { twoBoneIK, Spring } from './ik.js';

// per model: top: its height in the game (before the boss's own scale, like the
// hand-built ones); impact: how far through the attack clip the blow lands (so it
// lands on the frame the gate is hit); run: ground speed (m/s) above which it runs
export const ANIM_FIT = {
  giant: { top: 2.9, impact: 0.5, run: 4.2 },
  warlord: { top: 3.0, impact: 0.5, run: 4 },
  baron: { top: 3.2, impact: 0.5, run: 3.6 },
  king: { top: 3.3, impact: 0.5, run: 4 },
  mole: { top: 2.8, impact: 0.5, run: 4 },
  'rat-4': { top: 1.45, impact: 0.5, run: 3.4 },
  'rat-6': { top: 0.95, impact: 0.5, run: 3.4 },
  // the farmer: in his own group's units (the view scales him like the code-built farmer)
  farmer: { top: 1.47, impact: 0.5, run: 1.9, pbr: true },
};

// A loaded model: its clips, how to fit it, how far it travels per walk/run loop.
export class AnimModel {
  constructor(gltf, name) {
    this.name = name;
    this.fit = ANIM_FIT[name] || ANIM_FIT.giant;
    this.scene = gltf.scene;
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = c;
    let map = null, src = null;
    this.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (!map && o.material && o.material.map) { map = o.material.map; src = o.material; } } });
    if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
    this.map = map;
    // the rest of its PBR material (tools/pbr-maps.mjs): relief, and occlusion/roughness/metal in one map
    this.normalMap = src && src.normalMap; this.normalScale = src && src.normalScale ? src.normalScale.clone() : null;
    this.ormMap = src && (src.roughnessMap || src.metalnessMap || src.aoMap);
    // occlusion only if the map really carries it (Meshy's own roughness/metal map leaves red unused)
    this.aoStrength = src && src.aoMap && src.aoMap === src.roughnessMap ? 1 : 0;
    // more bones than Meshy's rig: ears, a jaw, a tail, a cape, each its own part (see articulate.js)
    this.added = articulate(this.scene, name);
    // fit: its rest pose (the first frame of idle) stands on the ground, centred, top tall
    const mixer = new THREE.AnimationMixer(this.scene);
    if (this.clips.idle) { mixer.clipAction(this.clips.idle).play(); mixer.setTime(0); }
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.scene, true);
    const h = Math.max(1e-6, box.max.y - box.min.y);
    this.scale = this.fit.top / h;
    this.offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    // stride: metres per loop of walk and run at this scale, from how far a foot sweeps
    this.loop = {};
    for (const k of ['walk', 'run']) this.loop[k] = this._loopDistance(mixer, k);
    mixer.stopAllAction();
    mixer.uncacheRoot(this.scene);
  }

  // how far the ground moves under it during one loop of an in-place walk/run:
  // each step the planted foot sweeps back by its stride, a loop has n steps
  _loopDistance(mixer, name) {
    const clip = this.clips[name];
    const foot = this.scene.getObjectByName('LeftFoot') || this.scene.getObjectByName('LeftToeBase');
    if (!clip || !foot) return 2;
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    const N = 90, zs = [], p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      mixer.setTime((clip.duration * i) / N);
      this.scene.updateMatrixWorld(true);
      foot.getWorldPosition(p);
      zs.push(p.z);
    }
    mixer.stopAllAction();
    const lo = Math.min(...zs), hi = Math.max(...zs), mid = (lo + hi) / 2;
    let cycles = 0;
    for (let i = 0; i < N; i++) if (zs[i] < mid && zs[(i + 1) % N] >= mid) cycles++;
    return Math.max(0.3, (hi - lo) * 2 * Math.max(1, cycles) * this.scale);
  }

  // A posable copy: its own skeleton, toon material (one per copy, so a hit can
  // flash one boss white), a skinned outline on the same bones, and a mover for its
  // extra parts.
  instance(px = INK_PX.big) {
    const root = cloneSkinned(this.scene);
    // the farmer is drawn with his Meshy PBR maps (toonpbr.js); the enemies in the plain toon look
    const mat = this.fit.pbr
      ? toonPBR({ map: this.map, emissive: 0x000000, side: THREE.DoubleSide, ...(this.normalMap ? { normalMap: this.normalMap, normalScale: this.normalScale } : {}), ormMap: this.ormMap || null, aoStrength: this.aoStrength })
      : toon({ vertexColors: false, map: this.map, emissive: 0x000000, side: THREE.DoubleSide });
    const skins = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = mat; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
      if (o.isSkinnedMesh) skins.push(o);
    });
    for (const s of skins) {
      inkNormals(s.geometry);
      const ink = new THREE.SkinnedMesh(s.geometry, inkMaterial(px));
      ink.frustumCulled = false; ink.castShadow = ink.receiveShadow = false; ink.raycast = () => {}; ink.name = 'ink';
      s.add(ink);
      ink.bind(s.skeleton, s.bindMatrix);
      s.userData.ink = ink;
    }
    const holder = new THREE.Group();
    root.scale.setScalar(this.scale);
    root.position.copy(this.offset).multiplyScalar(this.scale);
    holder.add(root);
    return { holder, root, mat, rig: new SkeletalRig(this, root), mover: new PartMover(root, this.added), body: new BodyMotion(root) };
  }
}

// One animated character's state machine: which clip plays, crossfades between
// them, and playback speed matched to its ground speed.
export class SkeletalRig {
  constructor(model, root) {
    this.model = model;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [k, c] of Object.entries(model.clips)) {
      const a = this.mixer.clipAction(c);
      if (k === 'die' || k === 'hit' || k === 'roar' || k === 'cast') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[k] = a;
    }
    this.state = null;
    this.oneShot = null;     // a clip that plays through once before going back (hit, roar, cast)
    this.go('idle', 0);
  }
  has(k) { return !!this.actions[k]; }
  // switch to a state, crossfading over fade seconds
  go(k, fade = 0.25) {
    if (!this.actions[k] || k === this.state) return this.actions[this.state];
    const next = this.actions[k], prev = this.actions[this.state];
    next.reset(); next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1); next.paused = false;
    next.play();
    if (prev && fade > 0) next.crossFadeFrom(prev, fade, false);
    else if (prev) prev.stop();
    this.state = k;
    return next;
  }
  // play a one-shot (hit reaction, roar, spell cast) over whatever it was doing
  play(k, fade = 0.15, speed = 1) {
    if (!this.actions[k]) return;
    this.go(k, fade).setEffectiveTimeScale(speed);
    this.oneShot = k;
  }
  // a one-shot still playing?
  busy() {
    if (!this.oneShot) return false;
    const a = this.actions[this.oneShot];
    if (a.isRunning() && a.time < a.getClip().duration * 0.92) return true;
    this.oneShot = null;
    return false;
  }
  // walking/running at ground speed v (m/s, after the character's own scale s)
  move(v, s) {
    const run = v > this.model.fit.run * s && this.has('run');
    const k = v < 0.15 ? 'idle' : run ? 'run' : 'walk';
    const a = this.go(k, 0.3);
    if (k !== 'idle' && a) {
      const loop = this.model.loop[k] * s, dur = a.getClip().duration;
      a.setEffectiveTimeScale(Math.min(3, Math.max(0.3, (v * dur) / loop)));
    } else if (a) a.setEffectiveTimeScale(1);
  }
  // the attack clip held at phase u (0..1 of the swing; the sim lands the blow at 0.65)
  attackAt(u) {
    const a = this.go('attack', 0.2);
    if (!a) return;
    const imp = this.model.fit.impact, d = a.getClip().duration;
    // piecewise: the wind-up fills the time before the blow, the follow-through the rest
    const t = u < 0.65 ? (u / 0.65) * imp : imp + ((u - 0.65) / 0.35) * (1 - imp);
    a.paused = true; a.time = Math.min(d - 1e-3, t * d);
  }
  // the death clip played so it has fallen by fraction `fallAt` of dur seconds
  die(dur) {
    const a = this.go('die', 0.15);
    if (a) a.setEffectiveTimeScale(Math.max(0.5, a.getClip().duration / Math.max(0.3, dur)));
    this.oneShot = null;
  }
  hold(on) { this.mixer.timeScale = on ? 0 : 1; }
  update(dt) { this.mixer.update(dt); }
}

// Motion layered over the farmer's clips every frame (the bosses play their clips
// as they are): breathing when standing, a lean into acceleration (and back when
// braking) and into turns, and the feet on the ground on a hillside (each leg
// reaches by inverse kinematics for the ground under its foot; the body comes down
// when a foot has further to go).
export class BodyMotion {
  constructor(root) {
    const by = (n) => root.getObjectByName(n);
    this.b = { hips: by('Hips'), spine: by('Spine'), spine1: by('Spine01'), spine2: by('Spine02') };
    this.legs = ['Left', 'Right'].map((s) => ({ up: by(s + 'UpLeg'), lo: by(s + 'Leg'), ft: by(s + 'Foot') })).filter((l) => l.up && l.lo && l.ft);
    this.lean = new Spring(30, 8); this.bank = new Spring(25, 7); this.t = Math.random() * 10; this.drop = 0;
  }
  // st: { speed, accel, turn } in the character's own size; ground(x, z); baseY:
  // the ground under its centre; holder: the object to lower; scale: world per holder unit
  update(dt, st, ground, baseY, holder, scale) {
    if (dt <= 0) return;
    this.t += dt;
    const idle = 1 - Math.min(1, (st.speed || 0) * 4), b = this.b;
    const lean = this.lean.update(Math.max(-0.12, Math.min(0.12, (st.accel || 0) * 0.04)), dt);
    const bank = this.bank.update(Math.max(-0.1, Math.min(0.1, -(st.turn || 0) * (st.speed || 0) * 0.05)), dt);
    const breathe = Math.sin(this.t * 1.9) * idle;
    if (b.spine) b.spine.quaternion.multiply(_q.setFromEuler(_e.set(lean * 0.5, 0, bank * 0.6)));
    if (b.spine1) b.spine1.quaternion.multiply(_q.setFromEuler(_e.set(lean * 0.3 - breathe * 0.015, 0, bank * 0.4)));
    if (b.spine2) b.spine2.quaternion.multiply(_q.setFromEuler(_e.set(-breathe * 0.025, 0, 0)));
    // feet on a hillside
    if (!ground || !this.legs.length) return;
    holder.updateMatrixWorld(true);
    const offs = this.legs.map((l) => { l.ft.getWorldPosition(_p); return { l, p: _p.clone(), d: ground(_p.x, _p.z) - baseY }; });
    const want = Math.max(0, -Math.min(...offs.map((o) => o.d)));
    this.drop += (want - this.drop) * Math.min(1, dt * 10);
    holder.position.y = -this.drop / scale;
    if (offs.every((o) => Math.abs(o.d) < 0.02) && this.drop < 0.01) return;
    holder.updateMatrixWorld(true);
    for (const o of offs) {
      _t.copy(o.p); _t.y += o.d;
      o.l.lo.getWorldPosition(_k); o.l.up.getWorldPosition(_p);
      // the knee keeps bending the way the clip bends it
      _k.multiplyScalar(2).sub(_p.add(_t).multiplyScalar(0.5));
      twoBoneIK(o.l.up, o.l.lo, o.l.ft, _t, _k);
    }
  }
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _k = new THREE.Vector3();
