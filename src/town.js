// The town worth protecting: who lives where, where they work, and how they
// react when rats come near. Pure data and functions (no three.js), so the
// rules can be tested headless. The view (render/town.js) animates it.
import { CFG } from './config.js';

// how close a rat has to be before a villager notices (alert), runs for home
// (panic), and how far away every rat must be before a hidden villager peeks out
export const ALERT_RANGE = 16;
export const PANIC_RANGE = 8.5;
export const HALL_PANIC_RANGE = 22;   // everyone this near the town hall flees while it is under attack
export const CALM_RANGE = 24;

// a point given in a building's own frame (door faces +z), turned like three.js rotation.y
export function turn(lx, lz, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [lx * c + lz * s, -lx * s + lz * c];
}

// where a villager goes in and out of their home: a house index, 'barn' or 'hall'
export function doorOf(home) {
  if (home === 'barn') { const b = CFG.town.barn; const [dx, dz] = turn(0, 2.9, b.rot); return { x: b.x + dx, z: b.z + dz, yaw: b.rot }; }
  if (home === 'hall') { const f = CFG.fortress; const [dx, dz] = turn(0, 3.9, 0.34); return { x: f.x + dx, z: f.z + dz, yaw: 0.34 }; }
  const h = CFG.huts[home];
  const [dx, dz] = turn(0, 1.75, h.rot);
  return { x: h.x + dx, z: h.z + dz, yaw: h.rot };
}

// a point inside a crop field; u, v run from -0.5 to 0.5 across its width and depth
export function fieldPoint(f, u, v) {
  const [dx, dz] = turn(u * f.w, v * f.d, f.rot);
  return { x: f.x + dx, z: f.z + dz };
}

// Everyone in town. look: 0 farmer (straw hat and hoe), 1 villager woman,
// 2 townsman. tint picks their clothes colour. Farmers work the fields they
// list; strollers wander between doors, the well and the market; chatters
// stand in pairs at a spot; kids run and play round the square.
export const VILLAGERS = [
  // north-east farm
  { job: 'farm', fields: [0, 2], home: 7, look: 0, tint: 3 },
  { job: 'farm', fields: [0], home: 7, look: 0, tint: 0 },
  { job: 'farm', fields: [1], home: 6, look: 1, tint: 1 },
  { job: 'farm', fields: [2, 1], home: 7, look: 0, tint: 4 },
  // west farm
  { job: 'farm', fields: [3], home: 'barn', look: 0, tint: 2 },
  { job: 'farm', fields: [4], home: 'barn', look: 0, tint: 5 },
  { job: 'farm', fields: [5, 4], home: 'barn', look: 1, tint: 6 },
  // townsfolk
  { job: 'stroll', home: 0, look: 2, tint: 2 },
  { job: 'stroll', home: 1, look: 1, tint: 7 },
  { job: 'stroll', home: 2, look: 2, tint: 6 },
  { job: 'stroll', home: 4, look: 1, tint: 0 },
  { job: 'stroll', home: 5, look: 2, tint: 4 },
  { job: 'chat', spot: 0, home: 3, look: 1, tint: 5 },
  { job: 'chat', spot: 0, home: 3, look: 2, tint: 1 },
  { job: 'chat', spot: 1, home: 6, look: 2, tint: 3 },
  { job: 'chat', spot: 1, home: 1, look: 1, tint: 2 },
  // children
  { job: 'kid', home: 5, look: 2, tint: 7, kid: true },
  { job: 'kid', home: 4, look: 1, tint: 3, kid: true },
];

// where chatting pairs stand: by the well and by the market stall
export function chatSpot(i) {
  const t = CFG.town;
  return i === 0 ? { x: t.well.x + 1.9, z: t.well.z + 0.9 } : { x: t.market.x + 0.4, z: t.market.z - 1.8 };
}
// places strollers walk between
export function strollPoints() {
  const t = CFG.town, pts = [];
  for (let i = 0; i < CFG.huts.length; i++) pts.push(doorOf(i));
  const [mx, mz] = turn(0, 1.6, t.market.rot);
  pts.push({ x: t.well.x + 1.3, z: t.well.z + 1.3 }, { x: t.market.x + mx, z: t.market.z + mz });
  pts.push({ x: t.square.x - 3, z: t.square.z + 1 }, { x: t.square.x + 3.5, z: t.square.z - 0.5 }, { x: t.square.x - 6, z: t.square.z - 4 });
  return pts;
}
// where kids play
export const PLAYGROUND = { x: -13.2, z: -36.2, r: 2.4 };
// where everyone in town gathers to celebrate a win: a ring round the square
// (wide, so the crowd still shows on both sides of the victory card)
export function cheerSpot(i, n) {
  const s = CFG.town.square, a = (i / n) * Math.PI * 2 + 0.3, k = i % 3;
  return { x: s.x + Math.cos(a) * (6 + k * 1.5), z: s.z + 1.2 + Math.sin(a) * (2.6 + k * 0.7) };
}

// distance from a point to the nearest rat still on its feet
export function nearestEnemy(sim, x, z) {
  let best = Infinity;
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < best) best = d;
  }
  return best;
}

// How a villager standing at x, z feels right now:
// 'cheer' (you won), 'panic' (rats on top of them, or the town hall is being
// hit while they are near it; also when the town falls), 'alert' (rats close),
// or 'calm'.
export function villagerAlarm(sim, x, z) {
  if (sim.state === 'victory') return 'cheer';
  if (sim.state === 'defeat') return 'panic';
  const d = nearestEnemy(sim, x, z);
  const nearHall = Math.hypot(x - CFG.fortress.x, z - CFG.fortress.z) < HALL_PANIC_RANGE;
  if (d < PANIC_RANGE || (sim.fortress.underAttack > 0 && nearHall)) return 'panic';
  if (d < ALERT_RANGE) return 'alert';
  return 'calm';
}

// A villager hiding indoors comes back out once the wave is over, or when
// every rat is far away and the town hall is not under attack.
export function safeToComeOut(sim, x, z) {
  if (sim.state === 'defeat') return false;
  if (sim.state !== 'wave') return true;
  return !(sim.fortress.underAttack > 0) && nearestEnemy(sim, x, z) > CALM_RANGE;
}
