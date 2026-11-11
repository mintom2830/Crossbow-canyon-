// Small motion kit shared by the farmer and the bosses: two-bone inverse kinematics
// (a leg reaching the ground, a hand reaching a grip) and damped springs (anything
// that should lag, overshoot and settle: a hat, a weapon, a strap).
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const _ac = new THREE.Vector3(), _ab = new THREE.Vector3(), _ba = new THREE.Vector3(), _bc = new THREE.Vector3(), _at = new THREE.Vector3();
const _ax0 = new THREE.Vector3(), _ax1 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _r = new THREE.Quaternion();
const _sa = new THREE.Quaternion(), _sb = new THREE.Quaternion();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const angle = (u, v) => Math.acos(clamp(u.dot(v), -1, 1));

// Turns `upper` and `lower` so the joint at the end of lower (`end`, a child of it)
// lands on `target` (world), the middle joint bending toward `pole` (world).
// weight 0..1 blends from the pose as it was. The skeleton's world matrices must be
// current; they are brought up to date for the chain afterwards.
export function twoBoneIK(upper, lower, end, target, pole, weight = 1) {
  if (weight <= 0) return;
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c); _t.copy(target);
  const lab = _b.distanceTo(_a), lcb = _c.distanceTo(_b);
  const lat = clamp(_t.distanceTo(_a), 1e-4, (lab + lcb) * 0.9995);
  _ac.subVectors(_c, _a).normalize(); _ab.subVectors(_b, _a).normalize();
  _ba.subVectors(_a, _b).normalize(); _bc.subVectors(_c, _b).normalize(); _at.subVectors(_t, _a).normalize();
  // the angles at the root and the middle joint, now and as they must be
  const ac_ab0 = angle(_ac, _ab), ba_bc0 = angle(_ba, _bc), ac_at0 = angle(_ac, _at);
  const ac_ab1 = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
  const ba_bc1 = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
  // bend in the plane that holds the chain and the pole
  _d.subVectors(pole, _a);
  _ax0.crossVectors(_ac, _d);
  if (_ax0.lengthSq() < 1e-10) _ax0.crossVectors(_ac, _ab);
  _ax0.normalize();
  _ax1.crossVectors(_ac, _at);
  const swing = _ax1.lengthSq() > 1e-12;
  if (swing) _ax1.normalize();
  upper.getWorldQuaternion(_qa); lower.getWorldQuaternion(_qb);
  _sa.copy(upper.quaternion); _sb.copy(lower.quaternion);
  // the middle joint opens or closes about the bend axis (in its own frame: q * (inv(qw) r qw))
  _r.setFromAxisAngle(_ax0, ba_bc1 - ba_bc0);
  _qi.copy(_qb).invert();
  lower.quaternion.multiply(_qi.multiply(_r).multiply(_qb));
  // the root turns by the bend about the same axis, then swings the whole chain onto the target:
  // world = swing * bend * old world
  _r.setFromAxisAngle(_ax0, ac_ab1 - ac_ab0);
  _qi.copy(_r).multiply(_qa);
  if (swing) _qi.premultiply(_r.setFromAxisAngle(_ax1, ac_at0));
  setWorldQuaternion(upper, _qi);
  if (weight < 1) { upper.quaternion.slerpQuaternions(_sa, upper.quaternion, weight); lower.quaternion.slerpQuaternions(_sb, lower.quaternion, weight); }
  upper.updateMatrixWorld(true);
}

// Sets a bone's world rotation (its parent's world matrix must be current).
const _pq = new THREE.Quaternion();
export function setWorldQuaternion(bone, q) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(q));
}

// A damped spring on a number: x chases the target, lags, overshoots a little and
// settles. k: stiffness (1/s^2), d: damping (1/s). Kicked by adding to v.
export class Spring {
  constructor(k = 60, d = 8, x = 0) { this.k = k; this.d = d; this.x = x; this.v = 0; }
  update(target, dt) {
    // a few small steps keep a stiff spring stable at a long frame
    const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += ((target - this.x) * this.k - this.v * this.d) * h; this.x += this.v * h; }
    return this.x;
  }
}
