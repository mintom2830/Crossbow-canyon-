// The enemy animation controller: one small state machine per enemy, shared by
// every way an enemy is drawn (the GPU-instanced small rats, the crowd rats on
// baked skeletons, the rigged giants and bosses). It reads what the simulation
// says the enemy is doing and decides what it should look like it is doing:
//
//   locomotion  IDLE (breathing, looking left and right) · WALK_SLOW · WALK · RUN · SPRINT
//               START (pushing off) · STOP (braking, settling) · TURN (45°/90°/180°)
//   fighting    ATTACK (anticipation → strike → impact) · RECOVER (follow-through)
//   reactions   HURT (light, layered over anything) · HEAVY (a big hit) · STAGGER
//               (a critical hit: off balance) · KNOCKBACK (thrown by a blast) ·
//               FALL (dropped) · GETUP (scrambling back up after landing)
//   holds       STUNNED (dazed, swaying) · FROZEN (held in ice)
//   other       SPECIAL (a heal, a dodge, a jetpack burst, a fuse) · DYING
//
// Each state has a priority: a higher one interrupts a lower one, a timed one
// (stagger, get-up, a special) runs to its end unless something higher comes,
// and dying overrides everything and never plays twice. Stunned or frozen enemies
// cannot attack; frozen ones cannot use a special. The renderers ease every value
// they read from here (no snapping), which is what crossfades the states.
//
// Nothing here changes the game: damage still lands when the simulation says so
// (the attack phase comes from its swing timer), this only shapes how it looks.

export const ST = {
  IDLE: 'idle', WALK_SLOW: 'walkSlow', WALK: 'walk', RUN: 'run', SPRINT: 'sprint',
  START: 'start', STOP: 'stop', TURN: 'turn',
  ATTACK: 'attack', RECOVER: 'recover',
  HURT: 'hurt', HEAVY: 'heavy', STAGGER: 'stagger', KNOCKBACK: 'knockback', FALL: 'fall', GETUP: 'getup',
  STUNNED: 'stunned', FROZEN: 'frozen', SPECIAL: 'special', DYING: 'dying',
};
const PRIO = {
  idle: 0, walkSlow: 0, walk: 0, run: 0, sprint: 0, start: 1, stop: 1, turn: 2,
  attack: 30, recover: 30, special: 40, hurt: 45, heavy: 50, stagger: 60, getup: 65,
  knockback: 80, fall: 80, stunned: 85, frozen: 90, dying: 100,
};
// how long the timed states last (s)
const DUR = { start: 0.3, stop: 0.35, heavy: 0.4, stagger: 0.7, getup: 0.5, special: 0.6 };
// a hit this big (fraction of its full health) is heavy; this big, a critical stagger
export const HEAVY_HIT = 0.08, CRIT_HIT = 0.2;
const LOCO = new Set(['idle', 'walkSlow', 'walk', 'run', 'sprint', 'start', 'stop', 'turn']);

export class EnemyAnim {
  constructor(seed = 0) {
    this.state = ST.IDLE; this.prev = ST.IDLE; this.t = 0;   // time in this state
    this.lock = 0;                       // a timed state still running (s)
    this.speedK = 0;                     // pace against its normal walk: 0 still, 1 walking, 2+ sprinting
    this.lean = 0;                       // + leaning into a push-off, - sitting back to brake
    this.turnRate = 0; this.turnAcc = 0; // how fast and how far it is turning
    this.hurt = 0; this.heavy = 0; this.stagger = 0; this.getup = 0;   // reactions, 1 fading to 0
    this.look = 0; this.lookT = 2 + (seed % 7) * 0.4;                  // idle glances
    this.special = 0;                    // 0..1 through a special
    this._v = 0; this._yaw = null; this._hitT = 0; this._air = false; this.dead = false;
    this.seed = seed;
  }

  // e: the simulation's enemy; dt: frame time; base: its normal walking pace (m/s);
  // atk: its gate attack phase 0..1 (or -1); special: a special is playing (0..1, or -1)
  update(e, dt, base, atk = -1, special = -1) {
    if (this.dead) return this.state;
    if (dt <= 0) return this.state;
    const k = Math.min(1, dt * 8);
    // pace and acceleration, smoothed (the simulation moves at 60 steps a second)
    const v = Math.max(0, e.vs || 0), a = (v - this._v) / dt; this._v = v;
    const ratio = base > 0 ? v / base : 0;
    this.moveT = ratio > 0.06 ? (this.moveT || 0) + dt : 0;   // how long it has been on the move
    this.speedK += (ratio - this.speedK) * Math.min(1, dt * 10);
    this.lean += (clamp(a / Math.max(0.5, base) * 0.25, -1, 1) - this.lean) * k;
    // turning
    const yaw = e.yaw || 0;
    if (this._yaw === null) this._yaw = yaw;
    let dy = yaw - this._yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this._yaw = yaw;
    this.turnRate += (dy / dt - this.turnRate) * k;
    this.turnAcc = Math.abs(this.turnRate) > 0.6 ? this.turnAcc + Math.abs(dy) : Math.max(0, this.turnAcc - dt * 3);
    // reactions to a new hit: how big it was decides how hard it lands
    const hit = (e.hitT || 0) > this._hitT + 1e-4; this._hitT = e.hitT || 0;
    const air = (e.hy || 0) > 0.05;
    let want = null;
    if (hit) {
      const amt = e.hitAmt || 0;
      this.hurt = 1;
      if (air || (e.kv || 0) < -1) want = ST.KNOCKBACK;
      else if (amt >= CRIT_HIT) { want = ST.STAGGER; this.stagger = 1; }
      else if (amt >= HEAVY_HIT) { want = ST.HEAVY; this.heavy = 1; }
    }
    if (air && !this._air) want = e.fall > 0 ? ST.FALL : ST.KNOCKBACK;
    if (!air && this._air) { want = ST.GETUP; this.getup = 1; }   // landed: scramble back up
    this._air = air;
    if (e.fall > 0) want = ST.FALL;
    // holds
    if (e.frozen > 0) want = ST.FROZEN;
    else if (e.stun > 0 || e.held > 0) want = higher(want, ST.STUNNED);
    // a special (not while frozen; stunned ones can't start one)
    if (special >= 0 && !(e.frozen > 0) && !(e.stun > 0)) { want = higher(want, ST.SPECIAL); this.special = special; }
    else this.special = 0;
    // fading reactions
    this.hurt = Math.max(0, this.hurt - dt / 0.3);
    this.heavy = Math.max(0, this.heavy - dt / DUR.heavy);
    this.stagger = Math.max(0, this.stagger - dt / DUR.stagger);
    this.getup = Math.max(0, this.getup - dt / DUR.getup);
    // the current state ends, or something more important takes over
    this.t += dt; this.lock = Math.max(0, this.lock - dt);
    const cur = this.state;
    const held = cur === ST.FROZEN ? e.frozen > 0 : cur === ST.STUNNED ? (e.stun > 0 || e.held > 0) : cur === ST.KNOCKBACK || cur === ST.FALL ? air || e.fall > 0 : cur === ST.SPECIAL ? special >= 0 : this.lock > 0;
    if (want && (PRIO[want] > PRIO[cur] || !held)) this._go(want);
    else if (!held) {
      // locomotion, or the gate attack (never while stunned or frozen)
      let next;
      if (atk >= 0 && !(e.stun > 0) && !(e.frozen > 0)) next = atk < 0.75 ? ST.ATTACK : ST.RECOVER;
      else next = this._loco(ratio, a, base);
      if (next !== cur) this._go(next);
    }
    // idle glances left and right
    if (this.state === ST.IDLE || this.state === ST.STOP) {
      this.lookT -= dt;
      if (this.lookT < 0) { this.lookT = 2.5 + ((this.seed * 7919 + Math.floor(this.t * 10)) % 9) * 0.35; this._lookTo = this._lookTo > 0 ? -0.5 : 0.5; }
      this.look += ((this._lookTo || 0) * (this.lookT > 1.2 ? 1 : 0) - this.look) * Math.min(1, dt * 4);
    } else this.look += (0 - this.look) * Math.min(1, dt * 6);
    return this.state;
  }

  _loco(ratio, a, base) {
    const cur = this.state;
    if (ratio < 0.06) {
      // just stopped after walking a while: a braking settle first
      if (LOCO.has(cur) && cur !== ST.IDLE && cur !== ST.STOP && this._moved > 0.3) { this._moved = 0; return ST.STOP; }
      this._moved = 0;
      return ST.IDLE;
    }
    this._moved = this.moveT;
    if ((cur === ST.IDLE || cur === ST.STOP) && a > base * 0.8) { this.lock = DUR.start; return ST.START; }
    if (this.turnAcc > Math.PI / 4 && Math.abs(this.turnRate) > 0.9) return ST.TURN;
    return ratio < 0.7 ? ST.WALK_SLOW : ratio < 1.35 ? ST.WALK : ratio < 2.2 ? ST.RUN : ST.SPRINT;
  }

  _go(s) {
    this.prev = this.state; this.state = s; this.t = 0;
    this.lock = DUR[s] || 0;
  }

  // the enemy was defeated: dying overrides everything, once
  die() { if (!this.dead) { this.prev = this.state; this.state = ST.DYING; this.t = 0; this.dead = true; } }

  // how far through a turn (in quarter turns: 0.5 = 45°, 1 = 90°, 2 = 180°)
  get turnQuarters() { return this.turnAcc / (Math.PI / 2); }
  get locomotion() { return LOCO.has(this.state); }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function higher(a, b) { return !a || PRIO[b] > PRIO[a] ? b : a; }
