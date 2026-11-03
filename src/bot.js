// A simple automated player used for balance checks and for the in-browser
// autoplay test. It walks to coins, and builds/upgrades whenever it can pay
// for a pad in full.
import { CFG } from './config.js';

// opts: prefer (pad kinds in order), focus, cannon (build cannons),
// cannonPath ('rapid' | 'blast': which way to take the cannon upgrade choice),
// repair (patch up a badly damaged town hall between waves)
export function makeBot(opts = {}) {
  const prefer = opts.prefer || ['build', 'fortress', 'upgrade'];
  let goal = null; // {x,z,padId}
  let lastPadDone = null;
  return function botStep(sim) {
    const h = sim.hero;
    // a cannon player still builds every third tower as a crossbow: only crossbows
    // can shoot down the Canyon Buzzard while it flies
    if (opts.cannon && sim.unlocked.cannon) {
      const kind = sim.builtOrder % 3 === 2 ? 'crossbow' : 'cannon';
      if (sim.buildKind !== kind) sim.setBuildKind(kind);
    }
    // finish the pad we are standing on
    if (goal && goal.away) {
      // stepping off a disarmed pad (the repeat-purchase safeguard), then come back
      if (Math.hypot(goal.x - h.x, goal.z - h.z) < 0.4) goal = goal.back;
    } else if (goal && goal.padId) {
      const p = sim.pads.find((q) => q.id === goal.padId);
      if (!p) { lastPadDone = goal.padId; goal = null; }
      else if (sim.gold <= 0 && p.paid < p.cost) goal = null;
      else if (p.heroOn && !p.armed) {
        const dx = p.x - (sim.slots[p.slot]?.x ?? p.x - 1), dz = p.z - (sim.slots[p.slot]?.z ?? p.z);
        const l = Math.hypot(dx, dz) || 1;
        goal = { x: p.x + dx / l * 2.4, z: p.z + dz / l * 2.4, away: true, back: goal };
      }
    }
    if (!goal || (!goal.padId && !goal.away)) {
      // choose an affordable pad
      let best = null, bestScore = -Infinity;
      // a sensible player saves up for the keep once it can be upgraded
      const keep = prefer.includes('fortress') ? sim.pads.find((p) => p.kind === 'fortress') : null;
      const reserve = keep ? keep.cost - keep.paid : 0;
      for (const p of sim.pads) {
        const need = p.cost - p.paid;
        if (need > sim.gold) continue;
        if (keep && p.kind === 'upgrade' && sim.gold - need < reserve) continue;
        // repairs come last, between waves, once the hall has lost a fair share of its health
        const repair = p.kind === 'repair' && opts.repair && sim.state === 'build' && sim.fortress.hp < sim.fortress.maxHp * 0.85;
        const pri = repair ? prefer.length : prefer.indexOf(p.kind);
        if (pri < 0) continue;
        // the cannon upgrade choice: stick to one path if told to
        if (p.choice && opts.cannonPath && p.path !== opts.cannonPath) continue;
        // spread upgrades: lower-level crossbows first
        const lv = (p.level || 0) * (opts.focus ? -10 : 6); // focus: pour everything into the strongest crossbow
        const score = -pri * 30 - lv - Math.hypot(p.x - h.x, p.z - h.z) * 0.3;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) goal = { x: best.x, z: best.z, padId: best.id };
    }
    if (!goal) {
      // nearest coin
      let bc = null, bd = Infinity;
      for (const c of sim.coins) {
        if (c.state !== 0 || c.age < 0.5) continue;
        const d = (c.x - h.x) ** 2 + (c.z - h.z) ** 2;
        if (d < bd) { bd = d; bc = c; }
      }
      if (bc) goal = { x: bc.x, z: bc.z, coin: true };
    }
    if (!goal) { sim.setInput(0, 0); return; }
    const dx = goal.x - h.x, dz = goal.z - h.z;
    const d = Math.hypot(dx, dz);
    if (goal.coin && d < CFG.hero.magnetRadius * 0.6) { goal = null; sim.setInput(0, 0); return; }
    if (d < 0.25) { sim.setInput(0, 0); return; }
    const s = Math.min(1, d / 1.2);
    sim.setInput((dx / d) * s, (dz / d) * s);
    if (goal.coin) goal = null; // re-pick next frame
  };
}
