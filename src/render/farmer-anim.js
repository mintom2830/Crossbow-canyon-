// The farmer's motion, built every frame on his skeleton (farmer.js):
//   feet       planted: the gait runs on distance walked, so a foot on the ground
//              stays put while the body passes over it; each foot is placed by
//              inverse kinematics on the ground under it (on a hillside too), rolls
//              from heel to toe, and lifts in an arc as it swings through
//   hips       bob (highest mid-step when walking, lowest when running), sway over
//              the foot that carries the weight, twist with the stride; they drop
//              when a foot has further to reach
//   torso      counter-twists against the hips, leans into speed, into
//              acceleration (and back when stopping), and into turns
//   head       steadied against the body's sway, leads into turns, looks about
//              when idle; blinks
//   arms       hang from the A-pose, swing against the legs, elbows bend more as
//              he runs
//   breathing  the chest rises and falls when he stands
//   springs    the hat wobbles, the pitchfork on his back swings, the belly
//              bounces, each lagging the body and settling (damped)
//   riding     seated astride, legs round the saddle, hands on the reins, bouncing
//              with the gallop
import * as THREE from 'three';
import { twoBoneIK, setWorldQuaternion, Spring } from './ik.js';
import { FARMER_JOINTS as J } from './farmer.js';

const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
const _m = new THREE.Matrix4();
const rot = (bone, x, y, z, order = 'YXZ') => bone.quaternion.setFromEuler(_e.set(x, y, z, order));
const mulRot = (bone, x, y, z, order = 'YXZ') => bone.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z, order)));

export class FarmerRig {
  constructor(F) {
    this.F = F; this.b = F.bones; this.rest = F.rest;
    this.phase = 0; this.v = 0; this.vSmooth = 0; this.amp = 0; this.lean = new Spring(40, 9); this.bank = new Spring(30, 8);
    this.hatP = new Spring(120, 10); this.hatR = new Spring(120, 10); this.forkP = new Spring(45, 4.2); this.forkR = new Spring(45, 4.2); this.belly = new Spring(140, 7);
    this.headLast = null; this.headVel = new THREE.Vector3(); this.chestLast = null; this.chestVel = new THREE.Vector3(); this.hipsLastY = null; this.hipsVy = 0;
    this.look = 0; this.lookT = 2; this.lookTarget = 0; this.blinkT = 2.5; this.blink = 0;
    this.legLen = J.upLegL.distanceTo(J.legL) + J.legL.distanceTo(J.footL);
  }

  // s: { dt, t, speed (world units/s), accel (forward, world units/s^2), yawRate
  // (rad/s), ground(x, z) -> height, rootY (the ground height the model stands
  // on), scale (world units per model unit), ride: null | { phase, amount } }
  update(s) {
    const { dt, t } = s, b = this.b, F = this.F;
    if (dt <= 0) return;
    // ---- from rest
    for (const [n, p] of Object.entries(this.rest)) { b[n].position.copy(p); b[n].quaternion.identity(); }
    // the gait: cadence rises with speed; the stride is what one cycle covers
    this.vSmooth += (s.speed - this.vSmooth) * Math.min(1, dt * 10);
    const v = this.vSmooth, moving = sm(0.05, 0.7, v), run = sm(2.6, 5.6, v);
    const cad = 1.05 + 0.27 * v;                       // cycles a second
    const stride = v / cad;                             // world units a cycle
    this.phase = (this.phase + cad * dt * (v > 0.02 ? 1 : 0)) % 1;
    const S = 0.6 - 0.24 * run;                         // the part of a cycle each foot is down
    const A = S * stride;                               // how far a planted foot travels back
    const lift = (0.06 + 0.1 * run) * moving;
    const ph = this.phase;

    if (s.ride) { this._ride(s); return this._finish(s, 0); }

    // ---- hips: bob, sway, twist, lean
    const mid = Math.cos(4 * Math.PI * (ph - S / 2));
    const bob = (0.012 * (1 - run) * mid - 0.03 * run * mid + 0.015 * run) * moving;
    const sway = 0.012 * Math.sin(2 * Math.PI * (ph - S / 2)) * moving * (1 - 0.5 * run);
    const twist = 0.14 * Math.sin(2 * Math.PI * ph) * moving * (0.6 + 0.4 * run);
    // leaning: into speed, into acceleration (back when braking), into turns
    const leanT = 0.05 * moving + 0.17 * run + clamp(s.accel * 0.006, -0.2, 0.2);
    const lean = this.lean.update(leanT, dt);
    const bank = this.bank.update(clamp(-s.yawRate * v * 0.012, -0.3, 0.3), dt);
    const breathe = Math.sin(t * 2.1) * (1 - moving);
    b.hips.position.x += sway; b.hips.position.y += bob / s.scale - 0.012 * run;
    rot(b.hips, lean * 0.35, twist, bank * 0.6 + sway * 2);
    // ---- torso: counter-twist, lean, breathing
    rot(b.spine, lean * 0.3 + breathe * 0.01, -twist * 0.5, bank * 0.2);
    rot(b.chest, lean * 0.25 - breathe * 0.025, -twist * 0.9, -sway * 2);
    b.chest.position.y += breathe * 0.004;
    // ---- head: steady, leads into turns, looks about when idle
    this.lookT -= dt;
    if (this.lookT < 0) { this.lookT = 1.5 + Math.random() * 3.5; this.lookTarget = moving > 0.5 ? 0 : (Math.random() - 0.5) * 1.1; }
    this.look += (this.lookTarget - this.look) * Math.min(1, dt * 3);
    rot(b.neck, -lean * 0.45, twist * 0.5 + clamp(s.yawRate * 0.12, -0.4, 0.4) * 0.5, -bank * 0.4);
    rot(b.head, -lean * 0.25 + 0.02 * breathe, twist * 0.4 + this.look + clamp(s.yawRate * 0.12, -0.4, 0.4) * 0.5, 0);
    // ---- arms: down from the A-pose, swinging against the legs
    for (const [sd, k, o] of [[1, 'L', 0], [-1, 'R', 0.5]]) {
      const p = (ph + o) % 1;
      // the arm swings with the opposite foot: forward as this side's foot goes back
      const footZ = p < S ? 0.5 - p / S : -0.5 + 0.5 - 0.5 * Math.cos(Math.PI * (p - S) / (1 - S));
      const swing = (0.38 + 0.4 * run) * footZ * 2 * moving;   // + swings the arm back
      rot(b['shoulder' + k], 0, 0, sd * (0.04 * breathe));
      const arm = b['arm' + k];
      arm.quaternion.setFromEuler(_e.set(swing + 0.08 * moving, 0, -sd * (0.62 + 0.04 * run), 'XYZ'));
      rot(b['foreArm' + k], -(0.18 + 1.05 * run) * moving - 0.12 - Math.max(0, swing) * 0.4, 0, -sd * 0.08);
      rot(b['hand' + k], -0.15, 0, sd * 0.1);
    }
    // ---- legs: planted feet by IK
    this._finish(s, 1, { ph, S, A, lift, run, moving });
  }

  // feet (by IK, on the ground), springs, blinking; legs only when walking (legs 1)
  _finish(s, legs, g) {
    const b = this.b, F = this.F, dt = s.dt;
    F.root.updateMatrixWorld(true);
    if (legs) {
      const targets = [];
      for (const [sd, k, o] of [[1, 'L', 0], [-1, 'R', 0.5]]) {
        const p = (g.ph + o) % 1;
        let z, h, pitch;
        if (p < g.S) { const u = p / g.S; z = g.A / 2 - u * g.A; h = 0; pitch = 0.22 * sm(0.18, 0, u) * g.moving - 0.55 * sm(0.62, 1, u) * g.moving; }
        else { const u = (p - g.S) / (1 - g.S); z = -g.A / 2 + g.A * (0.5 - 0.5 * Math.cos(Math.PI * u)); h = g.lift * Math.sin(Math.PI * u); pitch = -0.35 * Math.sin(Math.PI * u * 0.8) * g.moving + 0.25 * sm(0.7, 1, u) * g.moving; }
        // in the model's own space, then to the world, then onto the ground under the foot
        _p.set(sd * 0.105, J.footL.y, (z / s.scale) + 0.01 * g.run);
        F.root.localToWorld(_p);
        const gy = s.ground(_p.x, _p.z) - s.rootY;
        _p.y += gy + h;
        targets.push({ k, p: _p.clone(), pitch, gy });
      }
      // the hips come down if a foot has further to reach (downhill, a long stride)
      let drop = 0;
      for (const T of targets) { b['upLeg' + T.k].getWorldPosition(_w); const need = _w.distanceTo(T.p) - this.legLen * s.scale * 0.985; if (need > drop) drop = need; }
      if (drop > 0) { b.hips.position.y -= Math.min(0.12, drop / s.scale); F.root.updateMatrixWorld(true); }
      for (const T of targets) {
        const up = b['upLeg' + T.k], lo = b['leg' + T.k], ft = b['foot' + T.k];
        // the knee points forward (and a little out)
        _t.set((T.k === 'L' ? 1 : -1) * 0.16, 0.3, 0.7); F.root.localToWorld(_t);
        twoBoneIK(up, lo, ft, T.p, _t);
        // the foot: level with the root's facing, rolled heel to toe; the toe stays down as the heel lifts
        F.root.getWorldQuaternion(_q2);
        _q2.multiply(_q.setFromEuler(_e.set(-T.pitch, 0, 0)));
        setWorldQuaternion(ft, _q2);
        rot(b['toe' + T.k], Math.max(0, T.pitch) * 0.9, 0, 0);
      }
    }
    F.root.updateMatrixWorld(true);
    // ---- springs: from how the head and chest are being thrown about
    const hv = this._accel('head', b.head, dt), cv = this._accel('chest', b.chest, dt);
    // in the body's frame: forward and sideways
    F.root.getWorldQuaternion(_q2); _q2.invert();
    hv.applyQuaternion(_q2); cv.applyQuaternion(_q2);
    const hp = this.hatP.update(clamp(-hv.z * 0.005, -0.14, 0.14), dt), hr = this.hatR.update(clamp(hv.x * 0.005, -0.14, 0.14), dt);
    rot(b.hat, clamp(hp + clamp(-hv.y * 0.003, -0.05, 0.05), -0.18, 0.18), 0, clamp(hr, -0.18, 0.18));
    const fp = this.forkP.update(clamp(cv.z * 0.02, -0.4, 0.4), dt), fr = this.forkR.update(clamp(-cv.x * 0.02, -0.4, 0.4), dt);
    rot(b.fork, fp, 0, fr);
    const by = this.belly.update(clamp(-cv.y * 0.0012, -0.02, 0.02), dt);
    b.belly.position.y = this.rest.belly.y + by; b.belly.position.z = this.rest.belly.z + Math.abs(by) * 0.3;
    // ---- blinking
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = 2 + Math.random() * 3.5; }
    if (this.blink > 0) this.blink -= dt;
    const want = this.blink > 0 ? F.maps.faceClosed.map : F.maps.face.map;
    if (F.faceMat.map !== want) F.faceMat.map = want;
    F.root.updateMatrixWorld(true);
  }

  // how a bone is being accelerated (world units/s^2, smoothed)
  _accel(key, bone, dt) {
    bone.getWorldPosition(_v);
    const last = this[key + 'Last'], vel = this[key + 'Vel'];
    const out = new THREE.Vector3();
    if (last) {
      _w.subVectors(_v, last).divideScalar(dt);
      out.subVectors(_w, vel).divideScalar(dt);
      vel.lerp(_w, Math.min(1, dt * 25));
      last.copy(_v);
    } else this[key + 'Last'] = _v.clone();
    if (out.length() > 400) out.setLength(400);
    return out;
  }

  // seated astride the horse or cow: thighs round the saddle, shins down its
  // flanks, hands forward on the reins, bouncing with the gallop
  _ride(s) {
    const b = this.b, R = s.ride, p = R.phase, a = R.amount;
    rot(b.hips, 0.12 * a + Math.sin(p) * 0.05 * a, 0, 0);
    b.hips.position.y -= 0.06;
    rot(b.spine, 0.06 * a, 0, 0); rot(b.chest, -0.04 + Math.sin(p + 0.6) * 0.04 * a, 0, 0);
    rot(b.neck, -0.08 * a, 0, 0);
    for (const [sd, k] of [[1, 'L'], [-1, 'R']]) {
      rot(b['upLeg' + k], -1.15, 0, sd * 0.62, 'XYZ');
      rot(b['leg' + k], 1.35, 0, -sd * 0.15);
      rot(b['foot' + k], -0.25, 0, 0);
      b['arm' + k].quaternion.setFromEuler(_e.set(-0.95 + Math.sin(p) * 0.06 * a, 0, -sd * 0.5, 'XYZ'));
      rot(b['foreArm' + k], -0.75, 0, sd * 0.2);
    }
  }
}
