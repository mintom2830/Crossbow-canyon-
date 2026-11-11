// The Arsenal: sixteen more towers on top of the Crossbow and the Cannon,
// following the user's "Weapon & Tower Arsenal" sheet. Each one is unlocked
// in the Shop with diamonds and has five levels.
//
// The stronger the tower, the harder it is to get: it costs more diamonds to
// unlock (cost), more gold to build (buildMul: times the crossbow's price for
// that pad) and more gold to upgrade (upMul: times UPGRADE_BASE).
//
// Every level lists its stats and ab: [ability name, what it does].
// Shared fields: range (how far it reaches), interval (seconds between
// attacks), dmg (damage per hit), turn (how fast the head turns, rad/s).

export const UPGRADE_BASE = [0, 0, 40, 70, 110, 160];
export const ARSENAL_MAX_LEVEL = 5;
export const WEAK_MUL = 1.3;   // poisoned or scorched rats take 30% more damage from everything

export const ARSENAL = {
  // ---- Spike Trap: a bed of spikes on the road beside it. Everything that
  // walks over it is hurt and slowed. r: half the length of each bed along the road (it covers the road's whole width),
  // dps: damage per second to every rat on it, fields: how many beds.
  spike: {
    name: 'Spike Trap', cost: 60, buildMul: 0.9, upMul: 0.9, type: 'Physical', color: '#b9bec8',
    blurb: 'A bed of spikes on the road: hurts and slows every rat that walks over it.',
    levels: [null,
      { range: 7, r: 1.6, dps: 10, slow: 0.3, fields: 1, ab: ['Spike Bed', 'Spikes on the road hurt and slow every rat on them.'] },
      { range: 7, r: 1.8, dps: 15, slow: 0.4, fields: 1, ab: ['Sharper Spikes', 'More damage and a stronger slow.'] },
      { range: 8, r: 1.9, dps: 21, slow: 0.5, fields: 2, ab: ['Twin Beds', 'A second spike bed further along the road.'] },
      { range: 8, r: 2.1, dps: 30, slow: 0.55, fields: 2, ab: ['Steel Spikes', 'Bigger beds that hit much harder.'] },
      { range: 8.5, r: 2.3, dps: 40, slow: 0.6, fields: 2, impale: { every: 3, dmg: 70, stun: 0.6 }, ab: ['Spike Field', 'Slows by 60%, and every 3 seconds the spikes shoot up, stunning every rat on them.'] },
    ],
  },
  // ---- Mine Tower: plants mines on the road that blow up under rats.
  mine: {
    name: 'Mine Tower', cost: 80, buildMul: 1.0, upMul: 1.0, type: 'Explosive', color: '#ffcf3a',
    blurb: 'Plants mines on the road that blow up when rats walk over them.',
    levels: [null,
      { range: 9, interval: 3.0, max: 3, dmg: 60, r: 1.8, ab: ['Land Mines', 'Plants up to 3 mines on the road that explode under rats.'] },
      { range: 9.5, interval: 2.7, max: 4, dmg: 85, r: 1.9, ab: ['Bigger Mines', 'Up to 4 mines, with bigger bangs.'] },
      { range: 10, interval: 2.4, max: 5, dmg: 115, r: 2.0, stun: 0.5, ab: ['Stun Mines', 'Up to 5 mines; survivors are dazed for a moment.'] },
      { range: 10.5, interval: 2.1, max: 6, dmg: 150, r: 2.1, stun: 0.6, ab: ['Heavy Mines', 'Up to 6 mines that plant faster.'] },
      { range: 11, interval: 1.5, max: 8, dmg: 210, r: 2.3, stun: 0.7, chain: 4, ab: ['Chain Mine', 'Up to 8 mines, and each blast sets off the mines near it.'] },
    ],
  },
  // ---- Ice Tower: freezing bolts that slow, then freeze a rat solid.
  // frost: slow (share of speed taken), t (seconds), hits (in a row to
  // freeze), freeze / giantFreeze (seconds frozen). Bosses are only slowed.
  ice: {
    name: 'Ice Tower', cost: 100, buildMul: 1.05, upMul: 1.05, type: 'Ice', color: '#7fdcff',
    blurb: 'Shoots freezing bolts that slow rats, then freeze them solid.',
    levels: [null,
      { range: 12, interval: 0.7, dmg: 10, bolts: 1, frost: { slow: 0.3, t: 1.5, hits: 4, freeze: 0.8, giantFreeze: 0.4, immune: 1.5, decay: 2.5 }, turn: 7, ab: ['Frost Bolt', 'Icy bolts slow rats; four hits in a row freeze one.'] },
      { range: 12.5, interval: 0.6, dmg: 15, bolts: 1, frost: { slow: 0.35, t: 1.6, hits: 4, freeze: 1.0, giantFreeze: 0.5, immune: 1.5, decay: 2.5 }, turn: 8, ab: ['Colder Bolts', 'Fires faster, slows more.'] },
      { range: 13, interval: 0.6, dmg: 20, bolts: 2, twin: true, lateral: 0.4, frost: { slow: 0.4, t: 1.8, hits: 3, freeze: 1.3, giantFreeze: 0.6, immune: 1.5, decay: 2.5 }, turn: 9, ab: ['Twin Frost', 'Two bolts at a time; three hits freeze.'] },
      { range: 13.5, interval: 0.5, dmg: 28, bolts: 2, twin: true, lateral: 0.4, frost: { slow: 0.45, t: 2, hits: 3, freeze: 1.7, giantFreeze: 0.8, immune: 1.5, decay: 2.5 }, turn: 10, ab: ['Deep Freeze', 'Frozen rats stay frozen longer.'] },
      { range: 14, interval: 0.45, dmg: 40, bolts: 2, twin: true, lateral: 0.4, frost: { slow: 0.5, t: 2.2, hits: 3, freeze: 2.5, giantFreeze: 1.0, immune: 1.5, decay: 2.5 },
        blizzard: { every: 6, r: 4, freeze: 1.0 }, turn: 11, ab: ['Freeze', 'Freezes rats for 2.5 s, and every 6 s a blizzard freezes the whole crowd around its target.'] },
    ],
  },
  // ---- Poison Gas Tower: lobs gas canisters. The toxic cloud hurts every
  // rat inside it; from level 3 they also take more damage from everything.
  poison: {
    name: 'Poison Gas Tower', cost: 120, buildMul: 1.1, upMul: 1.1, type: 'Poison', color: '#8fe34a',
    blurb: 'Lobs gas canisters: toxic clouds that eat away at every rat inside.',
    levels: [null,
      { range: 12, interval: 2.4, cloud: { r: 2.0, t: 3.5, dps: 10 }, turn: 4, ab: ['Gas Canister', 'A toxic cloud that hurts every rat inside.'] },
      { range: 12.5, interval: 2.2, cloud: { r: 2.2, t: 4, dps: 15 }, turn: 4.5, ab: ['Thicker Gas', 'Bigger clouds that last longer.'] },
      { range: 13, interval: 2.2, cloud: { r: 2.4, t: 4, dps: 22, weak: true }, turn: 5, ab: ['Corrosion', 'Rats in the gas take 30% more damage from every tower.'] },
      { range: 13.5, interval: 2.0, cloud: { r: 2.6, t: 4.5, dps: 30, weak: true }, turn: 5.5, ab: ['Acid Gas', 'Stronger gas, thrown faster.'] },
      { range: 14, interval: 1.8, cloud: { r: 3.0, t: 5, dps: 40, weak: true, slow: 0.3 }, turn: 6, ab: ['Toxic Cloud', 'Huge clouds that also slow rats down by 30%.'] },
    ],
  },
  // ---- Flamethrower Tower: a cone of fire that hits every rat in front of
  // it, leaves them burning and (from level 3) scorches their armour.
  // arc: half-width of the cone (radians), burn: damage over time after.
  flame: {
    name: 'Flamethrower Tower', cost: 150, buildMul: 1.15, upMul: 1.15, type: 'Fire', color: '#ff8a2a',
    blurb: 'Sprays a cone of fire that burns every rat in front of it.',
    levels: [null,
      { range: 8.5, arc: 0.42, dps: 26, burn: { dps: 6, t: 2 }, turn: 5, ab: ['Fire Spray', 'A cone of fire hits every rat in front of it and sets them burning.'] },
      { range: 9, arc: 0.44, dps: 38, burn: { dps: 9, t: 2.5 }, turn: 5.5, ab: ['Hotter Flames', 'More damage and longer burns.'] },
      { range: 9.5, arc: 0.46, dps: 52, burn: { dps: 14, t: 3 }, weak: true, turn: 6, ab: ['Scorch', 'Burnt rats take 30% more damage from every tower.'] },
      { range: 10, arc: 0.48, dps: 70, burn: { dps: 18, t: 3 }, weak: true, turn: 6.5, ab: ['Blue Flame', 'A longer, fiercer cone.'] },
      { range: 10.5, arc: 0.5, dps: 90, burn: { dps: 24, t: 3.5 }, weak: true, inferno: { every: 4, r: 2.2, t: 3, dps: 40 }, turn: 7, ab: ['Inferno Zone', 'Every 4 seconds it sets the road on fire where the crowd is thickest.'] },
    ],
  },
  // ---- Sniper Tower: very long range, one huge shot at the toughest rat in
  // reach. head: chance of a headshot and what it multiplies the damage by.
  sniper: {
    name: 'Sniper Tower', cost: 180, buildMul: 1.2, upMul: 1.2, type: 'Pierce', color: '#ff7a3a',
    blurb: 'Very long range: one massive shot at the toughest rat in reach.',
    levels: [null,
      { range: 18, interval: 2.6, dmg: 70, armorPierce: 0.6, head: { chance: 0.15, mul: 2 }, turn: 4, ab: ['Long Shot', 'Huge damage to the rat with the most health.'] },
      { range: 19, interval: 2.4, dmg: 110, armorPierce: 0.7, head: { chance: 0.15, mul: 2 }, turn: 4.5, ab: ['Steady Aim', 'Hits harder and reaches further.'] },
      { range: 20, interval: 2.2, dmg: 160, armorPierce: 0.8, head: { chance: 0.25, mul: 2 }, turn: 5, ab: ['Headshot', 'A 25% chance of a headshot for double damage.'] },
      { range: 21, interval: 2.0, dmg: 230, armorPierce: 0.9, head: { chance: 0.25, mul: 2 }, through: 1, turn: 5.5, ab: ['Penetrator', 'The bullet goes through and hits the rat behind too.'] },
      { range: 23, interval: 1.8, dmg: 320, armorPierce: 1, head: { chance: 0.35, mul: 2.5 }, through: 2, mark: 3, turn: 6, ab: ['Deadeye', 'More headshots (×2.5); a hit rat takes 30% more damage from every tower for 3 s.'] },
    ],
  },
  // ---- Tesla Tower: lightning that jumps from rat to rat (chain: how many
  // rats one bolt hits, jump: how far it jumps, falloff: damage kept per jump).
  tesla: {
    name: 'Tesla Tower', cost: 220, buildMul: 1.3, upMul: 1.3, type: 'Electric', color: '#7fc8ff',
    blurb: 'Strikes rats with lightning that jumps from rat to rat.',
    levels: [null,
      { range: 11, interval: 1.0, dmg: 22, chain: 2, jump: 3.2, falloff: 0.8, ab: ['Spark', 'Lightning hits a rat and jumps to one more.'] },
      { range: 11.5, interval: 0.9, dmg: 30, chain: 3, jump: 3.4, falloff: 0.8, ab: ['Arc', 'Jumps to three rats.'] },
      { range: 12, interval: 0.85, dmg: 40, chain: 4, jump: 3.6, falloff: 0.82, stun: 0.25, ab: ['Shock', 'Four rats, each stunned for a moment.'] },
      { range: 12.5, interval: 0.8, dmg: 55, chain: 5, jump: 3.8, falloff: 0.84, stun: 0.3, ab: ['Chain Lightning', 'Hits up to five rats.'] },
      { range: 13, interval: 0.7, dmg: 75, chain: 6, jump: 4, falloff: 0.86, stun: 0.35, overload: { every: 5, dmg: 120, stun: 0.8 }, ab: ['Overload', 'Six rats per bolt, and every 5 s a blast of lightning hits every rat in range.'] },
    ],
  },
  // ---- Mortar Tower: lobs heavy shells high over the walls (can't reach
  // fliers). radius: size of the blast, shells: how many fall each time.
  mortar: {
    name: 'Mortar Tower', cost: 260, buildMul: 1.35, upMul: 1.35, type: 'Explosive', color: '#ffb340',
    blurb: 'Lobs heavy shells from very far away that crush whole crowds.',
    levels: [null,
      { range: 15, interval: 2.4, dmg: 26, radius: 2.4, shells: 1, armor: 1.5, turn: 3, ab: ['Mortar Shell', 'A heavy shell from far away; extra damage to armour.'] },
      { range: 16, interval: 2.3, dmg: 40, radius: 2.6, shells: 1, armor: 1.5, knock: 0.6, turn: 3.2, ab: ['Big Bang', 'Bigger blasts that knock small rats back.'] },
      { range: 17, interval: 2.2, dmg: 60, radius: 2.8, shells: 1, armor: 1.6, knock: 0.8, stun: 0.5, turn: 3.4, ab: ['Concussion', 'Rats that survive a blast are stunned.'] },
      { range: 18, interval: 2.1, dmg: 95, radius: 3.0, shells: 1, armor: 1.8, knock: 1, stun: 0.7, turn: 3.6, ab: ['Siege Mortar', 'Much more damage, from even further away.'] },
      { range: 19, interval: 2.2, dmg: 130, radius: 3.0, shells: 3, spread: 2.6, gap: 0.18, armor: 2, knock: 1, stun: 0.8, turn: 3.8, ab: ['Shell Rain', 'Three shells at once, raining down along the crowd.'] },
    ],
  },
  // ---- Rocket Tower: homing rockets that chase their rat (fliers too) and
  // explode. rockets: how many per volley (each picks its own rat).
  rocket: {
    name: 'Rocket Tower', cost: 300, buildMul: 1.4, upMul: 1.4, type: 'Explosive', color: '#ff4a3a',
    blurb: 'Fires homing rockets that chase rats down, fliers too.',
    levels: [null,
      { range: 14, interval: 2.6, dmg: 50, r: 1.6, rockets: 1, speed: 13, turn: 5, ab: ['Homing Rocket', 'A rocket that follows its rat and explodes.'] },
      { range: 15, interval: 2.4, dmg: 70, r: 1.7, rockets: 1, speed: 14, turn: 5.5, ab: ['Bigger Warhead', 'More damage, bigger blasts.'] },
      { range: 16, interval: 2.3, dmg: 90, r: 1.8, rockets: 2, speed: 15, turn: 6, ab: ['Twin Rockets', 'Two rockets per volley, at two rats.'] },
      { range: 17, interval: 2.2, dmg: 120, r: 2.0, rockets: 2, speed: 16, turn: 6.5, ab: ['Heavy Rockets', 'Hits much harder.'] },
      { range: 18, interval: 2.4, dmg: 160, r: 2.2, rockets: 3, speed: 17, turn: 7, ab: ['Missile Barrage', 'Three rockets per volley at the toughest rats.'] },
    ],
  },
  // ---- Summoner Tower: friendly rat soldiers march out and stand on the
  // road, holding rats back (block: rats each soldier holds) and fighting
  // them. A fallen soldier comes back after respawn seconds.
  summoner: {
    name: 'Summoner Tower', cost: 350, buildMul: 1.5, upMul: 1.5, type: 'Magic', color: '#c47bff',
    blurb: 'Summons friendly rat soldiers that hold enemies back and fight them.',
    levels: [null,
      { range: 9, allies: 2, hp: 70, dps: 12, block: 2, respawn: 8, ab: ['Rat Guards', 'Two friendly rats stand on the road and hold rats back.'] },
      { range: 9, allies: 2, hp: 120, dps: 18, block: 2, respawn: 7, ab: ['Tougher Guards', 'More health, harder hits.'] },
      { range: 9.5, allies: 3, hp: 170, dps: 26, block: 3, respawn: 7, ab: ['Rat Squad', 'Three soldiers, each holding up to three rats.'] },
      { range: 9.5, allies: 3, hp: 260, dps: 38, block: 3, respawn: 6, ab: ['Veterans', 'Much tougher soldiers.'] },
      { range: 10, allies: 4, hp: 380, dps: 55, block: 3, respawn: 5, armor: 0.4, stun: 0.3, ab: ['Rat Knights', 'Four armoured knights whose blows stun.'] },
    ],
  },
  // ---- Crystal Storm Tower: piercing crystal arrows that slow, and from
  // level 3 a storm of crystal arrows rains down on the crowd.
  crystal: {
    name: 'Crystal Storm Tower', cost: 400, buildMul: 1.6, upMul: 1.6, type: 'Magic', color: '#b067ff',
    blurb: 'Crystal arrows that pierce and slow, and crystal storms from the sky.',
    levels: [null,
      { range: 13, interval: 0.55, dmg: 14, bolts: 1, pierce: 3, frost: { slow: 0.25, t: 1.2, hits: 99 }, turn: 8, ab: ['Crystal Arrow', 'Arrows pierce three rats and slow them.'] },
      { range: 13.5, interval: 0.5, dmg: 20, bolts: 1, pierce: 3, frost: { slow: 0.3, t: 1.3, hits: 99 }, turn: 9, ab: ['Sharper Crystals', 'Faster, harder-hitting arrows.'] },
      { range: 14, interval: 0.5, dmg: 24, bolts: 2, twin: true, lateral: 0.45, pierce: 4, frost: { slow: 0.3, t: 1.4, hits: 99 },
        storm: { every: 6, arrows: 10, radius: 3, dmg: 30, hitR: 1.0, spawn: 0.7, height: 11, speed: 30 }, turn: 10, ab: ['Frost Storm', 'Two arrows, and every 6 s a crystal storm rains down.'] },
      { range: 14.5, interval: 0.45, dmg: 30, bolts: 2, twin: true, lateral: 0.45, pierce: 4, frost: { slow: 0.35, t: 1.5, hits: 99 },
        storm: { every: 5, arrows: 14, radius: 3.2, dmg: 45, hitR: 1.0, spawn: 0.7, height: 11, speed: 30 }, turn: 11, ab: ['Crystal Rain', 'Bigger storms, more often.'] },
      { range: 15, interval: 0.4, dmg: 40, bolts: 3, twin: true, lateral: 0.55, pierce: 5, frost: { slow: 0.4, t: 1.6, hits: 99 },
        storm: { every: 4, arrows: 18, radius: 3.4, dmg: 60, hitR: 1.1, spawn: 0.7, height: 11, speed: 30 }, turn: 12, ab: ['Crystal Tempest', 'Three arrows piercing five rats, and a storm every 4 s.'] },
    ],
  },
  // ---- Berserker Totem: no attack of its own; every tower near it attacks
  // harder (dmg), faster (rate) and further (range). Battle Roar doubles that
  // for a few seconds. r: how far the totem's drums reach.
  totem: {
    name: 'Berserker Totem', cost: 450, buildMul: 1.7, upMul: 1.7, type: 'Magic', color: '#ff5a3a',
    blurb: 'Beats war drums that make every tower near it hit harder and faster.',
    levels: [null,
      { range: 9, r: 9, dmg: 0.12, rate: 0.1, reach: 0.03, ab: ['War Totem', 'Towers near it deal 12% more damage and attack 10% faster.'] },
      { range: 9.5, r: 9.5, dmg: 0.18, rate: 0.14, reach: 0.05, ab: ['War Drums', 'Bigger boosts.'] },
      { range: 10, r: 10, dmg: 0.25, rate: 0.18, reach: 0.06, ab: ['Battle Fury', '+25% damage, +18% speed, +6% range.'] },
      { range: 10.5, r: 10.5, dmg: 0.32, rate: 0.24, reach: 0.08, ab: ['Blood Rage', '+32% damage, +24% speed, +8% range.'] },
      { range: 11, r: 11, dmg: 0.4, rate: 0.3, reach: 0.1, roar: { every: 15, t: 5 }, ab: ['Battle Roar', '+40% damage, +30% speed, +10% range, doubled for 5 s every 15 s.'] },
    ],
  },
  // ---- Time Warp Tower: slows every rat in its area (slow) and speeds up
  // the towers there (haste). Rewind sends rats back along the road; Time
  // Loop stops time for them altogether.
  warp: {
    name: 'Time Warp Tower', cost: 500, buildMul: 1.8, upMul: 1.8, type: 'Magic', color: '#5ad8ff',
    blurb: 'Bends time: rats near it crawl, and towers near it speed up.',
    levels: [null,
      { range: 8, r: 8, slow: 0.25, haste: 0.15, ab: ['Slow Time', 'Rats in its area move 25% slower; towers there attack 15% faster.'] },
      { range: 8.5, r: 8.5, slow: 0.32, haste: 0.22, ab: ['Time Bubble', 'A bigger, stronger bubble.'] },
      { range: 9, r: 9, slow: 0.4, haste: 0.3, rewind: { every: 10, dist: 3 }, ab: ['Rewind', 'Every 10 s it sends the rats in its area back along the road.'] },
      { range: 9.5, r: 9.5, slow: 0.5, haste: 0.4, rewind: { every: 9, dist: 3.5 }, ab: ['Slow Motion', 'Rats move at half speed; towers there +40% faster.'] },
      { range: 10, r: 10, slow: 0.6, haste: 0.5, rewind: { every: 8, dist: 4 }, stop: { every: 8, t: 1.5, boss: 0.5 }, ab: ['Time Loop', 'Slows by 60%, hastes towers by 50%, and every 8 s stops time for the rats in its area.'] },
    ],
  },
  // ---- Three more towers. Each works like one of the towers above (like:
  // its attack, model and sounds) with its own stats and its own colours (tint:
  // dark, middle, light, trim), so it plays and looks like a tower of its own.
  // ---- Ballista: a giant crossbow. One heavy bolt that goes straight through a
  // line of rats; quicker than the Sniper, shorter reach, no headshots.
  ballista: {
    name: 'Ballista', cost: 140, buildMul: 1.15, upMul: 1.15, type: 'Pierce', color: '#d9a05a', like: 'sniper',
    tint: [0x4a2c14, 0x9a6230, 0xe8c88a, 0xc8ccd4],
    blurb: 'A giant crossbow: one heavy bolt that flies straight through a line of rats.',
    levels: [null,
      { range: 14, interval: 1.5, dmg: 40, armorPierce: 0.5, head: { chance: 0, mul: 1 }, through: 1, turn: 5, ab: ['Heavy Bolt', 'A big bolt that goes through the rat it hits and the one behind.'] },
      { range: 14.5, interval: 1.4, dmg: 60, armorPierce: 0.6, head: { chance: 0, mul: 1 }, through: 2, turn: 5.5, ab: ['Barbed Bolt', 'Hits harder and goes through two more rats.'] },
      { range: 15, interval: 1.3, dmg: 85, armorPierce: 0.7, head: { chance: 0, mul: 1 }, through: 3, turn: 6, ab: ['Windlass', 'Winds faster; the bolt goes through three more rats.'] },
      { range: 16, interval: 1.15, dmg: 120, armorPierce: 0.8, head: { chance: 0, mul: 1 }, through: 4, turn: 6.5, ab: ['Steel Bolt', 'Much more damage, through four more rats.'] },
      { range: 17, interval: 1.0, dmg: 165, armorPierce: 1, head: { chance: 0.2, mul: 2 }, through: 6, mark: 2, turn: 7, ab: ['Siege Bolt', 'Through six more rats, ignores armour, and one bolt in five strikes for double.'] },
    ],
  },
  // ---- Storm Coil: weak, very fast lightning that jumps a long way down the
  // crowd. Clears swarms of small rats; poor against one big one.
  storm: {
    name: 'Storm Coil', cost: 320, buildMul: 1.45, upMul: 1.45, type: 'Electric', color: '#c8a0ff', like: 'tesla',
    tint: [0x2a1c50, 0x6a48c8, 0xd8c8ff, 0xffe45a],
    blurb: 'A crackling storm: quick, weak lightning that leaps far down the whole crowd.',
    levels: [null,
      { range: 11, interval: 0.5, dmg: 9, chain: 4, jump: 4, falloff: 0.92, ab: ['Static', 'Quick sparks that jump to four rats.'] },
      { range: 11.5, interval: 0.45, dmg: 13, chain: 5, jump: 4.2, falloff: 0.92, ab: ['Crackle', 'Faster, and five rats a spark.'] },
      { range: 12, interval: 0.4, dmg: 18, chain: 6, jump: 4.4, falloff: 0.93, ab: ['Forked Lightning', 'Six rats a spark.'] },
      { range: 12.5, interval: 0.36, dmg: 24, chain: 8, jump: 4.7, falloff: 0.94, stun: 0.12, ab: ['Thunderhead', 'Eight rats a spark, each jolted for an instant.'] },
      { range: 13.5, interval: 0.3, dmg: 32, chain: 10, jump: 5, falloff: 0.95, stun: 0.15, overload: { every: 4, dmg: 90, stun: 0.6 }, ab: ['Tempest', 'Ten rats a spark, and every 4 s lightning strikes every rat in range.'] },
    ],
  },
  // ---- Swarm Launcher: volleys of many small homing rockets, each after its own rat.
  swarm: {
    name: 'Swarm Launcher', cost: 380, buildMul: 1.55, upMul: 1.55, type: 'Explosive', color: '#ffd24a', like: 'rocket',
    tint: [0x2c3a1c, 0x6a8a3a, 0xd8e8a0, 0xffb020],
    blurb: 'Fires a swarm of small homing rockets, every one after a rat of its own.',
    levels: [null,
      { range: 13, interval: 2.2, dmg: 22, r: 1.2, rockets: 3, speed: 16, turn: 6, ab: ['Rocket Swarm', 'Three small rockets, each chasing its own rat.'] },
      { range: 13.5, interval: 2.1, dmg: 30, r: 1.25, rockets: 4, speed: 17, turn: 6.5, ab: ['Fourth Tube', 'Four rockets a volley.'] },
      { range: 14, interval: 2.0, dmg: 40, r: 1.3, rockets: 5, speed: 18, turn: 7, ab: ['Fifth Tube', 'Five rockets a volley.'] },
      { range: 15, interval: 1.9, dmg: 52, r: 1.4, rockets: 6, speed: 19, turn: 7.5, ab: ['Hornet Rockets', 'Six rockets that hit harder.'] },
      { range: 16, interval: 1.7, dmg: 68, r: 1.5, rockets: 8, speed: 20, turn: 8, ab: ['Sky Full of Rockets', 'Eight rockets a volley, faster.'] },
    ],
  },
};


// Every tower in the Shop's order: the two classics, then by price.
export const TOWER_KINDS = ['crossbow', 'cannon', ...Object.keys(ARSENAL).sort((a, b) => ARSENAL[a].cost - ARSENAL[b].cost)];
// the tower a tower works like (its own kind, for all but the three that borrow another's attack and model)
export const baseKind = (kind) => (ARSENAL[kind] && ARSENAL[kind].like) || kind;
export const isArsenal = (kind) => Object.prototype.hasOwnProperty.call(ARSENAL, kind);
export const arsenalSpec = (kind, level) => ARSENAL[kind].levels[level];
export const arsenalUpgradeCost = (kind, level) => Math.round((UPGRADE_BASE[level] * ARSENAL[kind].upMul) / 5) * 5;
