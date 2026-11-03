// What the tower card in the HUD shows: the tower (or pad) next to the
// farmer, its level and ability, and what the next upgrade costs and adds.
// Pure data in, data out, so it can be tested without a browser.
import { CFG, cannonSpec } from './config.js';

export const CROSSBOW_ABILITIES = [null,
  ['Single Shot', 'One arrow at one rat.'],
  ['Power Shot', 'Fires faster and hits harder.'],
  ['Twin Shot', 'Two arrows: two different rats, or one giant twice.'],
  ['Armor Piercer', 'Heavy arrows ignore most armour and pass through two rats.'],
  ['Triple Barrage', 'Three arrows at once; every fifth attack adds a rapid burst.'],
  ['Frost Arrows', 'Hits slow rats, and three hits freeze them. Bosses only slow.'],
  ['Crystal Storm', 'Arrows bounce to nearby rats, and an arrow storm rains down every few seconds.'],
];
// Cannon levels 1-3 are shared; at level 4 the cannon takes one of two paths.
export const CANNON_ABILITIES = [null,
  ['Cannonball', 'An explosive ball that hurts every rat near the impact.'],
  ['Heavy Blast', 'Bigger blasts that knock small rats back.'],
  ['Double Cannon', 'Two cannonballs, at one group or two.'],
];
export const CANNON_PATH_ABILITIES = {
  rapid: [null, null, null, null,
    ['Rapid Launcher', 'Four tubes fire a light shell every third of a second, each at a fresh group.'],
    ['Cluster Shells', 'Every shell bursts into three bomblets that scatter over the crowd.'],
    ['Firestorm', 'Fires even faster, and every shell sets the ground on fire.'],
    ['Rocket Barrage', 'A rocket pod: every 4 seconds a salvo of 14 rockets hits the front of the crowd.'],
  ],
  blast: [null, null, null, null,
    ['Thunder Mortar', 'One enormous shell every few seconds: double damage to armour, stuns and throws rats back.'],
    ['Triple Thunder', 'All three barrels fire together, flattening a long stretch of the road.'],
    ['Crystal Quake', 'Twin crystal shells send out a slowing shockwave and crack armour for 4 seconds.'],
    ['Doomsday Nova', 'A huge armour-breaking Nova every 2 seconds, with side cannons firing in between.'],
  ],
};
// [name, description] of a cannon level on its path
export function cannonAbility(level, path) {
  return level < CFG.cannon.branchLevel ? CANNON_ABILITIES[level] : CANNON_PATH_ABILITIES[path === 'rapid' ? 'rapid' : 'blast'][level];
}
const KEEP_LEVELS = [null, ['Wooden town hall', ''], ['Stone town hall', 'Stone walls and plaster houses.'], ['Grand town hall', 'Twin towers and two-storey houses.']];

const r1 = (v) => Math.round(v * 10) / 10;

// Stat rows [label, value] for one tower level (cannons: on a path from level 4).
export function towerStats(kind, level, path) {
  if (kind === 'cannon') {
    const L = cannonSpec(level, path);
    const dmg = L.nova ? L.nova.dmg : L.dmg, blast = L.nova ? L.nova.radius : L.radius;
    const shots = L.nova ? 'Nova + side guns' : L.salvo ? `1 + ${L.salvo.n} rockets` : L.cluster ? `1 + ${L.cluster.n} bomblets` : `${L.shells}`;
    const every = L.nova ? L.nova.charge : L.interval;
    const ivl = every < 1 ? `${Math.round(every * 100) / 100}s` : `${r1(every)}s`;
    return [['Damage', dmg], ['Blast', r1(blast)], ['Shells', shots], ['Every', ivl], ['Range', r1(L.range)]];
  }
  const L = CFG.towers[level];
  const burst = L.burst ? (L.burst.every + L.burst.volleys) / L.burst.every : 1;
  return [['Damage', L.dmg], ['Arrows/s', r1((L.bolts / L.interval) * burst)], ['Pierce', L.pierce], ['Range', r1(L.range)]];
}

const ability = (kind, level, path) => (kind === 'cannon' ? cannonAbility(level, path) : CROSSBOW_ABILITIES[level]);
const pathName = (path) => CFG.cannon.paths[path].name;

// What the next level brings. path: the cannon's path (or the path a choice pad leads to).
function nextLevel(kind, level, path, pad, stats) {
  const nl = level + 1;
  const [name, desc] = ability(kind, nl, path);
  const nextStats = towerStats(kind, nl, path);
  return {
    level: nl, ability: name, desc, path: kind === 'cannon' && nl >= CFG.cannon.branchLevel ? path : null,
    pathName: kind === 'cannon' && nl === CFG.cannon.branchLevel ? pathName(path) : null,
    cost: pad ? pad.cost : (kind === 'cannon' ? CFG.cannon.upgradeCosts[nl] : CFG.upgradeCosts[nl]),
    paid: pad ? pad.paid : 0,
    // stats that change, as [label, from, to]
    changes: nextStats.map(([k, v], i) => [k, stats ? stats[i][1] : null, v]).filter(([, a, b]) => a !== b),
  };
}

// pads: the upgrade pad(s) of this tower. A cannon at level 3 has two (one per path):
// then the card offers the choice, or just one path while the farmer stands on its pad.
function towerInfo(kind, level, pads = [], path = null, onPath = null) {
  const max = level >= CFG.maxTowerLevel;
  const [name, desc] = level ? ability(kind, level, path) : ['', ''];
  const out = {
    kind, level, title: kind === 'cannon' ? 'Cannon' : 'Crossbow', path,
    pathName: kind === 'cannon' && path ? pathName(path) : null,
    ability: name, desc, stats: level ? towerStats(kind, level, path) : null, next: null, choice: null, max,
  };
  if (max) return out;
  if (kind === 'cannon' && level + 1 === CFG.cannon.branchLevel) {
    const opt = (p) => ({ ...nextLevel(kind, level, p, pads.find((q) => q.path === p), out.stats), blurb: CFG.cannon.paths[p].blurb });
    if (onPath) out.next = opt(onPath);
    else out.choice = ['rapid', 'blast'].map(opt);
    return out;
  }
  out.next = nextLevel(kind, level, path, pads[0], out.stats);
  return out;
}

// The thing the farmer is standing on or next to, or null. onPad marks a pad
// underfoot (the full card); walking past a tower gives just its name tag.
export function describeFocus(sim, near = 3.6) {
  const h = sim.hero;
  const pad = sim.pads.find((p) => p.heroOn);
  if (pad) {
    if (pad.kind === 'build') {
      const info = towerInfo(pad.tower, 0, []);
      info.build = true; info.onPad = true;
      info.next.cost = pad.cost; info.next.paid = pad.paid;
      info.next.changes = towerStats(pad.tower, 1).map(([k, v]) => [k, null, v]);
      return info;
    }
    if (pad.kind === 'fortress') {
      const f = sim.fortress, nl = pad.level;
      return {
        kind: 'keep', title: 'Town hall', level: f.level, ability: KEEP_LEVELS[f.level][0], desc: `Health ${f.maxHp}.`, stats: null, max: false, onPad: true,
        next: { level: nl, ability: KEEP_LEVELS[nl][0], desc: `${KEEP_LEVELS[nl][1]} Health ${f.maxHp} → ${CFG.fortressLevels[nl].hp}, fully repaired.`, cost: pad.cost, paid: pad.paid, changes: [['Health', f.maxHp, CFG.fortressLevels[nl].hp]] },
      };
    }
    if (pad.kind === 'repair') {
      const f = sim.fortress, hp = Math.ceil(f.hp);
      return {
        kind: 'keep', title: 'Town hall', level: f.level, ability: KEEP_LEVELS[f.level][0], desc: `Damaged: health ${hp} of ${f.maxHp}.`, stats: null, max: false, onPad: true,
        next: { repair: true, level: f.level, ability: 'Repair', desc: 'Patches up the walls and restores all lost health.', cost: pad.cost, paid: pad.paid, changes: [['Health', hp, f.maxHp]] },
      };
    }
    const t = sim.slots[pad.slot].tower;
    if (t) return { ...towerInfo(t.kind, t.level, [pad], t.path, pad.choice ? pad.path : null), slot: pad.slot, onPad: true };
  }
  let best = null, bd = near;
  for (const t of sim.towers) {
    const d = Math.hypot(t.x - h.x, t.z - h.z) - 1.4;
    if (d < bd) { bd = d; best = t; }
  }
  if (!best) return null;
  const ups = sim.pads.filter((p) => p.kind === 'upgrade' && p.slot === best.slotIndex);
  return { ...towerInfo(best.kind, best.level, ups, best.path), slot: best.slotIndex };
}
