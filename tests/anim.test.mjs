// Unit tests for the enemy animation controller (src/render/enemyanim.js):
// which state it picks, priorities and interruptions, and the rules (stunned
// enemies cannot attack, frozen ones cannot use a special, dying overrides all).
import { EnemyAnim, ST, HEAVY_HIT, CRIT_HIT } from '../src/render/enemyanim.js';

let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (err) { fail++; console.log('  ✗ ' + name + '\n      ' + err.message); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const DT = 1 / 60;
const rat = (o = {}) => ({ vs: 0, speed: 2, yaw: 0, hitT: 0, hitAmt: 0, hy: 0, kv: 0, stun: 0, frozen: 0, held: 0, fall: 0, ...o });
// run the controller for t seconds with the enemy as given (fn may change it each step)
const run = (A, e, t, fn = null, atk = -1, special = -1) => { for (let i = 0; i < Math.round(t / DT); i++) { if (fn) fn(e, i); A.update(e, DT, e.speed, atk, special); } return A.state; };

test('pace picks idle, slow walk, walk, run and sprint', () => {
  const A = new EnemyAnim(1), e = rat();
  assert(run(A, e, 0.5) === ST.IDLE, 'standing should be idle');
  e.vs = 1.0; assert(run(A, e, 1) === ST.WALK_SLOW, 'half pace should be a slow walk: ' + A.state);
  e.vs = 2.0; assert(run(A, e, 1) === ST.WALK, 'normal pace should walk: ' + A.state);
  e.vs = 3.6; assert(run(A, e, 1) === ST.RUN, '1.8x pace should run: ' + A.state);
  e.vs = 6.4; assert(run(A, e, 1) === ST.SPRINT, '3.2x pace (a jetpack burst) should sprint: ' + A.state);
});

test('pushing off from standing starts with START and leans forward; stopping brakes with STOP', () => {
  const A = new EnemyAnim(2), e = rat();
  run(A, e, 0.3);
  let saw = false, lean = 0;
  run(A, e, 0.3, (q, i) => { q.vs = Math.min(2, i * 0.4); if (A.state === ST.START) { saw = true; lean = Math.max(lean, A.lean); } });
  assert(saw && lean > 0.05, 'no START with a forward lean: ' + lean);
  run(A, e, 1, (q) => { q.vs = 2; });
  let stop = false, back = 0;
  run(A, e, 0.4, (q, i) => { q.vs = Math.max(0, 2 - i * 0.5); if (A.state === ST.STOP) { stop = true; back = Math.min(back, A.lean); } });
  assert(stop && back < -0.05, 'no STOP with a backward lean: ' + back);
  assert(run(A, e, 0.6) === ST.IDLE, 'should settle into idle');
});

test('a sharp turn while walking is a TURN; quarter turns are counted', () => {
  const A = new EnemyAnim(3), e = rat({ vs: 2 });
  run(A, e, 0.5);
  let turned = false;
  run(A, e, 0.6, (q) => { q.yaw += 2.6 * DT; if (A.state === ST.TURN) turned = true; });
  assert(turned && A.turnQuarters > 0.5, 'no turn: ' + A.turnQuarters);
});

test('hits react by size: light flinch, heavy hit, critical stagger', () => {
  const A = new EnemyAnim(4), e = rat({ vs: 2 });
  run(A, e, 0.5);
  e.hitT = 0.2; e.hitAmt = HEAVY_HIT * 0.5; A.update(e, DT, 2);
  assert(A.state === ST.WALK && A.hurt > 0.9, 'a light hit should only flinch: ' + A.state);
  e.hitT = 0.25; e.hitAmt = HEAVY_HIT * 1.5; A.update(e, DT, 2);
  assert(A.state === ST.HEAVY, 'a heavy hit: ' + A.state);
  e.hitT = 0.3; e.hitAmt = CRIT_HIT * 1.2; A.update(e, DT, 2);
  assert(A.state === ST.STAGGER && A.stagger > 0.9, 'a critical hit should stagger: ' + A.state);
  // the stagger runs to its end, then it walks on
  assert(run(A, e, 0.3) === ST.STAGGER, 'the stagger should hold');
  assert(run(A, e, 0.8) === ST.WALK, 'then walk on: ' + A.state);
});

test('a blast throws it (KNOCKBACK) and it gets back up after landing (GETUP)', () => {
  const A = new EnemyAnim(5), e = rat({ vs: 2 });
  run(A, e, 0.3);
  e.hitT = 0.2; e.hitAmt = 0.3; e.hy = 0.5; e.kv = -8; A.update(e, DT, 2);
  assert(A.state === ST.KNOCKBACK, 'thrown: ' + A.state);
  assert(run(A, e, 0.3) === ST.KNOCKBACK, 'stays thrown while in the air');
  e.hy = 0; e.kv = 0; A.update(e, DT, 2);
  assert(A.state === ST.GETUP && A.getup > 0.9, 'lands and scrambles up: ' + A.state);
  assert(run(A, e, 0.8) === ST.WALK, 'then walks on: ' + A.state);
});

test('stunned enemies cannot attack; frozen ones hold and cannot use a special', () => {
  const A = new EnemyAnim(6), e = rat();
  run(A, e, 0.2, null, 0.3);
  assert(A.state === ST.ATTACK, 'at the gate it attacks: ' + A.state);
  e.stun = 1; run(A, e, 0.2, null, 0.4);
  assert(A.state === ST.STUNNED, 'stunned, it cannot attack: ' + A.state);
  e.stun = 0; e.frozen = 1; run(A, e, 0.2, null, -1, 0.5);
  assert(A.state === ST.FROZEN && A.special === 0, 'frozen: no special: ' + A.state);
  e.frozen = 0; run(A, e, 0.1, null, -1, 0.5);
  assert(A.state === ST.SPECIAL, 'thawed, the special plays: ' + A.state);
  run(A, e, 0.1, null, 0.8);
  assert(A.state === ST.RECOVER, 'late in the swing it recovers: ' + A.state);
});

test('dying overrides everything and never plays twice', () => {
  const A = new EnemyAnim(7), e = rat({ vs: 2 });
  run(A, e, 0.2);
  A.die();
  assert(A.state === ST.DYING, 'dying');
  e.hitT = 0.2; e.hitAmt = 1; e.frozen = 1; e.stun = 1; run(A, e, 0.5, null, 0.5, 0.5);
  assert(A.state === ST.DYING && A.dead, 'nothing interrupts dying: ' + A.state);
  const t0 = A.t; A.die();
  assert(A.state === ST.DYING && A.t === t0, 'dying again does not restart it');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
