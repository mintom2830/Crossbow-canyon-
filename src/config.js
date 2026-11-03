// Crossbow Canyon — gameplay configuration.
// Every balance number lives here so the headless simulation and the
// browser build always agree.

export const CFG = {
  version: 1,
  fixedDt: 1 / 60,

  // ---------- Map ----------
  roadHalfWidth: 3.6,
  plateauHeight: 1.6,
  // The map fields below (roadPoints, plateaus, hills, slots, fortress, walk,
  // huts, town, ...) hold the level being played: Level 1 here, and setLevel()
  // in world.js swaps in another entry of MAPS (end of this file).
  level: 1,
  hills: [],     // smooth sand hills the road can climb (Level 2): centre, radii, height
  decor: null,   // a level's own landmarks (Level 2: the lone tree and the picnic)
  levelHp: 1,    // the level's own rat health multiplier (Level 2's longer road gives towers more time)
  // Road control points (x = east, z = south). Enemies walk from the first
  // point (canyon gap, bottom-right) to the last point (fortress gate).
  roadPoints: [
    [38, 41], [28, 33.5], [14, 30.3], [0, 30.4], [-12, 28.8], [-19.6, 22.5],
    [-21.2, 13], [-16, 5], [-4, 2.5], [8, 2.7], [17.5, 0.2], [22.6, -9.5],
    [19, -19.8], [8, -24], [-4, -24.2], [-12, -27.2], [-16, -33.5],
  ],
  plateaus: [
    { x: -1.8, z: 17, rx: 13.5, rz: 8.3, seed: 1.7 },
    { x: 3, z: -11, rx: 13, rz: 7.5, seed: 4.1 },
  ],
  fortress: { x: -18.5, z: -40.5, radius: 4.6 },
  // Hero walkable rectangle (canyon floor); everything beyond is cliff.
  walk: { minX: -30, maxX: 31, minZ: -48, maxZ: 37 },

  // ---------- Hero ----------
  hero: {
    start: [0, 18.5],
    speed: 7.6,
    accel: 40,
    radius: 0.45,
    magnetRadius: 3.7,
  },

  // ---------- Coins ----------
  coin: {
    max: 1100,
    gravity: -24,
    restitution: 0.42,
    attractDelay: 0.3,
    attractSpeed: 7,
    attractAccel: 55,
    collectDist: 0.6,
  },

  // ---------- Pads / construction ----------
  pad: {
    half: 1.25,          // pad is 2.5 x 2.5
    armDelay: 0.35,      // must stand still this long before coins flow
    fillTime: 1.05,      // seconds to pour the full price (minimum rate below)
    minRate: 24,         // coins per second, at least
    postBuildLock: 1.2,  // a new / just-used pad ignores the hero this long
  },

  // ---------- Tower slots ----------
  // Order = reveal order. The first slot starts with a crossbow already built.
  slots: [
    { id: 'A2', x: 3, z: 22.7, prebuilt: true },
    { id: 'A1', x: -10.3, z: 21.6 },
    { id: 'B1', x: -2, z: -5.6 },
    { id: 'A4', x: 2.5, z: 11.3 },
    { id: 'A3', x: -12, z: 12.8 },
    { id: 'B4', x: 13, z: -9.3 },
    { id: 'F1', x: -5.5, z: -31.2 },
    { id: 'B2', x: 7, z: -16.4 },
    { id: 'E1', x: 20.5, z: 24 },
    { id: 'B3', x: -5, z: -15.4 },
  ],
  buildCosts: [20, 35, 50, 70, 90, 110, 135, 160, 190, 220],
  visibleBuildPads: 2,

  // ---------- Crossbow towers (index = level) ----------
  // Fast, precise attacks. Abilities stack as the tower levels up.
  // L1 wood · L2 reinforced wood · L3 stone twin · L4 steel + magazine
  // L5 gold triple · L6 blue crystal · L7 purple crystal
  // pierce: rats one arrow can hit (giant rats always stop an arrow)
  // twin: extra arrows pick a second / third rat when there is one
  // armorPierce: share of a giant rat's armour the arrows ignore
  towers: [
    null,
    // 1 Single Shot: one arrow at one rat
    { range: 10.5, interval: 0.24, dmg: 5, pierce: 1, bolts: 1, lateral: 0, spread: 0, turn: 7 },
    // 2 Power Shot: fires faster and hits harder
    { range: 11, interval: 0.17, dmg: 8, pierce: 1, bolts: 1, lateral: 0, spread: 0, turn: 8 },
    // 3 Twin Shot: two arrows together, one rat twice or two different rats
    { range: 11.5, interval: 0.2, dmg: 8, pierce: 1, bolts: 2, lateral: 0.5, spread: 0.04, twin: true, turn: 9 },
    // 4 Armor Piercer: heavy magazine arrows ignore most armour and pass through up to two rats
    { range: 12, interval: 0.1, dmg: 11, pierce: 2, bolts: 1, lateral: 0, spread: 0, twin: true, armorPierce: 0.6, heavy: true, turn: 11 },
    // 5 Triple Barrage: three crossbows; every fifth attack fires a rapid burst
    { range: 12.5, interval: 0.24, dmg: 10, pierce: 2, bolts: 3, lateral: 0.7, spread: 0.06, twin: true, armorPierce: 0.6, burst: { every: 5, volleys: 2, gap: 0.07 }, turn: 11 },
    // 6 Frost Arrows: crystal arrows slow; three hits freeze a rat (the Rat King is only slowed)
    { range: 13, interval: 0.22, dmg: 12, pierce: 2, bolts: 3, lateral: 0.7, spread: 0.06, twin: true, armorPierce: 0.6, burst: { every: 5, volleys: 2, gap: 0.07 },
      frost: { slow: 0.3, t: 1.4, hits: 3, freeze: 0.8, giantFreeze: 0.55, immune: 1.5, decay: 2.5 }, turn: 12 },
    // 7 Crystal Storm: arrows bounce between nearby rats; every few seconds an arrow storm rains down
    { range: 14, interval: 0.2, dmg: 15, pierce: 2, bolts: 3, lateral: 0.7, spread: 0.07, twin: true, armorPierce: 0.6, burst: { every: 5, volleys: 2, gap: 0.07 },
      frost: { slow: 0.3, t: 1.4, hits: 3, freeze: 0.8, giantFreeze: 0.55, immune: 1.5, decay: 2.5 },
      bounce: { n: 2, range: 3.4, falloff: 0.7 },
      storm: { every: 4.5, arrows: 14, radius: 3.2, dmg: 35, hitR: 1.0, spawn: 0.7, height: 11, speed: 30 }, turn: 13 },
  ],
  upgradeCosts: [0, 0, 30, 50, 80, 120, 170, 240],
  maxTowerLevel: 7,
  towerRadii: [0, 1.1, 1.2, 1.28, 1.38, 1.44, 1.5, 1.58],
  boltSpeed: 40,
  boltExtra: 5,           // bolts keep flying this far past the aim point
  muzzleHeight: [0, 1.22, 1.32, 1.36, 1.46, 1.38, 1.42, 1.48],

  // ---------- Cannon tower (unlocked in the Armory for diamonds) ----------
  // Slower shots with explosive area damage. index = level.
  cannon: {
    buildCostMul: 1.25,                                 // gold, relative to a crossbow build
    upgradeCosts: [0, 0, 35, 60, 95, 140, 200, 280],
    radii: [0, 1.12, 1.22, 1.3, 1.4, 1.46, 1.52, 1.62],
    headY: [0, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.28],
    shellSpeed: 15,                                     // horizontal speed of a cannonball
    // levels 1-3 are shared; at level 4 the cannon takes one of two paths (below)
    levels: [
      null,
      // 1 Cannonball
      { range: 12, interval: 1.5, dmg: 10, radius: 1.8, shells: 1, lateral: 0, turn: 3.5 },
      // 2 Heavy Blast: bigger blast, pushes small rats back
      { range: 12.5, interval: 1.45, dmg: 15, radius: 2.2, shells: 1, lateral: 0, knock: 0.9, turn: 3.8 },
      // 3 Double Cannon: two balls in quick succession, can split between groups
      { range: 13, interval: 1.35, dmg: 15, radius: 2.2, shells: 2, gap: 0.22, lateral: 0.36, knock: 0.9, split: true, turn: 4 },
    ],
    branchLevel: 4,
    breakMul: 1.5,                                      // cracked armour: damage taken from every tower
    // Upgrade choice at level 4. Each path keeps its own levels 4-7.
    //   armor: damage multiplier against armoured rats, giants and bosses (<1: light shells glance off)
    //   retarget: pick a fresh group for every shot · cluster: bomblets scatter from each impact
    //   salvo: every few seconds a rocket salvo at the front of the crowd · crack: armour broken for t s
    paths: {
      rapid: {
        name: 'Rapid Launcher',
        blurb: 'Fast, light shells that shred swarms and fast rats. Weak against armour.',
        levels: [null, null, null, null,
          // 4 Rapid Launcher: four tubes, a light shell every 0.42 s at a fresh group each time
          { range: 14.5, interval: 0.34, dmg: 24, radius: 1.9, shells: 1, lateral: 0.22, retarget: true, knock: 0.35, armor: 0.55, turn: 7, light: true },
          // 5 Cluster Shells: each shell bursts into three bomblets
          { range: 15, interval: 0.33, dmg: 26, radius: 1.9, shells: 1, lateral: 0.24, retarget: true, knock: 0.35, armor: 0.55, turn: 7.5, light: true,
            cluster: { n: 3, r: 1.35, dmg: 16, spread: 1.75 } },
          // 6 Firestorm: faster, and every shell sets the ground on fire
          { range: 15.5, interval: 0.3, dmg: 30, radius: 2.0, shells: 1, lateral: 0.24, retarget: true, knock: 0.35, armor: 0.55, turn: 8, light: true,
            cluster: { n: 3, r: 1.4, dmg: 18, spread: 1.85 }, burn: { r: 1.4, t: 2.2, dps: 18 } },
          // 7 Rocket Barrage: a rocket pod; every 4 s a salvo of 12 rockets at the front of the crowd
          { range: 16, interval: 0.27, dmg: 34, radius: 2.0, shells: 1, lateral: 0.3, retarget: true, knock: 0.35, armor: 0.55, turn: 8.5, light: true,
            cluster: { n: 3, r: 1.4, dmg: 20, spread: 1.9 }, burn: { r: 1.45, t: 2.2, dps: 20 },
            salvo: { every: 4, n: 14, dmg: 60, r: 1.7, gap: 0.06 } },
        ],
      },
      blast: {
        name: 'Thunder Mortar',
        blurb: 'Slow, enormous blasts that crush crowds, giants and bosses. Fast rats can slip past.',
        levels: [null, null, null, null,
          // 4 Thunder Mortar: one huge shell every 2.5 s, double damage to armour, stuns and throws rats back
          { range: 13, interval: 2.6, dmg: 75, radius: 3.4, shells: 1, lateral: 0, knock: 1.5, stun: 1.2, armor: 2.3, turn: 3, heavy: true },
          // 5 Triple Thunder: all three barrels fire together, spread along the crowd
          { range: 13.5, interval: 2.7, dmg: 72, radius: 3.0, shells: 3, gap: 0.04, lateral: 0.64, spread: 2.4, knock: 1.5, stun: 1.3, armor: 2.3, turn: 3.2, heavy: true },
          // 6 Crystal Quake: twin crystal shells, a slowing shockwave, and cracked armour
          { range: 14, interval: 2.4, dmg: 95, radius: 3.4, shells: 2, gap: 0.12, lateral: 0.5, split: true, knock: 1.6, stun: 1.4, armor: 2.3, turn: 3.4, heavy: true,
            ring: { r: 5.2, dmg: 26, slow: 0.5, t: 2 }, crack: 4 },
          // 7 Doomsday Nova: a Nova every 2.2 s (huge, armour-breaking), side cannons in between
          { range: 14.5, interval: 1.1, dmg: 42, radius: 2.4, shells: 1, lateral: 1.0, sides: true, knock: 1.2, stun: 1.0, armor: 2.3, turn: 3.6, heavy: true,
            ring: { r: 5.0, dmg: 24, slow: 0.5, t: 2 }, crack: 4,
            nova: { charge: 2.2, dmg: 180, radius: 4.6, breakT: 5 } },
        ],
      },
    },
  },
  diamondsPerClear: 50,
  // Diamonds are paid as each wave is cleared (index = wave), so a run that
  // falls short still earns some. They add up to diamondsPerClear for a full clear.
  waveDiamonds: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 20],
  cannonUnlockCost: 100,
  // Rides, bought in the Shop with diamonds: the farmer rides into every game
  // on the one picked, and runs faster on it (speedMul). The cow's bell also
  // pulls coins in from further away (magnetMul).
  rides: {
    horse: { name: 'Horse', cost: 50, speedMul: 1.5, magnetMul: 1, blurb: 'The fastest ride: the farmer gallops 50% faster.' },
    cow: { name: 'Cow', cost: 50, speedMul: 1.35, magnetMul: 1.4, blurb: '35% faster, and her bell pulls coins in from 40% further away.' },
  },
  // Weapon skins, bought in the Shop: they recolour every crossbow and cannon,
  // their arrows and shells, and the farmer's pitchfork. colors: dark, mid and
  // light shades the skin paints the weapons in (the classic look keeps them).
  skins: {
    classic: { name: 'Classic', cost: 0, colors: null, blurb: 'Wood, iron and stone, as built.' },
    candy: { name: 'Candy', cost: 30, colors: [0xd23c7c, 0xff8fc0, 0xfff0f6], accent: 0x6fe0c4, blurb: 'Strawberry pink with mint trim.' },
    jungle: { name: 'Jungle', cost: 40, colors: [0x2c5a1c, 0x5f9a34, 0xc8ec7a], accent: 0xffd23a, blurb: 'Leafy green with sunny yellow.' },
    frost: { name: 'Frost', cost: 60, colors: [0x1e4f80, 0x5ab4e8, 0xeefcff], accent: 0xffffff, blurb: 'Ice blue and snow white.' },
    golden: { name: 'Golden', cost: 80, colors: [0x5a3203, 0xc27a0c, 0xe8a820], accent: 0xffe27a, blurb: 'Solid gold, top to bottom.' },
    lava: { name: 'Lava', cost: 100, colors: [0x1a1214, 0x4a2c26, 0xff5a10], accent: 0xffb020, blurb: 'Black rock with glowing orange.' },
  },

  // ---------- Difficulty ----------
  // Picked when a new game starts. hp scales the health of every rat, giant
  // rat and boss; diamonds scales each wave's diamond payout (rounded up), so
  // a full clear pays 30 on Easy, 50 on Normal and 100 on Hard.
  difficulties: {
    easy: { name: 'Easy', hp: 0.6, diamonds: 0.5, blurb: 'Rats have 40% less health' },
    normal: { name: 'Normal', hp: 1, diamonds: 1, blurb: 'The canyon as it was meant to be' },
    hard: { name: 'Hard', hp: 1.2, diamonds: 2, blurb: 'Rats have 20% more health' },
  },

  // ---------- Fortress (index = level) ----------
  fortressLevels: [
    null,
    { hp: 100 },
    { hp: 170, cost: 150, unlockAfterWave: 2 },
    { hp: 260, cost: 380, unlockAfterWave: 5 },
  ],
  fortressPad: { x: -26.5, z: -31.5 },
  // Town hall repair: while the hall is damaged and has no upgrade waiting, a
  // repair pad sits on the town hall pad. It restores all lost health for
  // goldPerHp gold per point (rounded up to 5, at least min).
  repair: { goldPerHp: 1, min: 10 },
  // Houses round the town hall (the keep). They upgrade with it.
  // style picks the wall and roof colours; the door faces +z turned by rot.
  huts: [
    { x: -28, z: -45, rot: 0.4, style: 0 }, { x: -9.5, z: -46, rot: -0.3, style: 1 },
    { x: -11.5, z: -39, rot: -0.9, style: 2 }, { x: -27.5, z: -38.5, rot: 1.2, style: 3 },
    { x: -20, z: -47.5, rot: 0.1, style: 1 }, { x: -14.5, z: -46.5, rot: 0.2, style: 3 },
    { x: -4, z: -41.5, rot: -0.6, style: 0 }, { x: 1.5, z: -45, rot: -0.3, style: 2 },
  ],
  // The rest of the town: the square in front of the town hall, a well and a
  // market stall, and two farms (north-east with a windmill, west with a barn).
  town: {
    square: { x: -17.5, z: -36 },
    well: { x: -24, z: -35.5 },
    market: { x: -8.8, z: -35.0, rot: -0.5 },
    windmill: { x: 26, z: -43.5 },
    barn: { x: -27, z: -16.5, rot: 0.25 },
    // crop fields: centre, size (w along x, d along z before turning), turn, crop
    fields: [
      { x: 9.5, z: -41.5, w: 8, d: 5.5, rot: 0.05, crop: 'wheat', scarecrow: true },
      { x: 19, z: -43, w: 7, d: 4.5, rot: -0.04, crop: 'cabbage' },
      { x: 12.5, z: -35.5, w: 9, d: 3.2, rot: 0.08, crop: 'pumpkin' },
      { x: -19.3, z: -19.8, w: 6, d: 4.5, rot: 0.1, crop: 'corn' },
      { x: -20.5, z: -12.5, w: 6, d: 5, rot: -0.06, crop: 'wheat' },
      { x: -25.5, z: -8.5, w: 5, d: 4, rot: 0.15, crop: 'cabbage' },
    ],
    // footpaths from the square out to the farms (way points)
    paths: [
      [[-12.8, -37.6], [-3, -38.9], [1.3, -40.0], [4.6, -40.6]],
      [[1.3, -40.0], [1.0, -43.0]],
      [[-22.5, -33.5], [-23.3, -24], [-23.4, -15], [-25.8, -13.4]],
    ],
    // solid things the farmer walks round (centre, radius)
    obstacles: [
      { x: 26, z: -43.5, r: 1.6 }, { x: -27, z: -16.5, r: 2.7 },
      { x: -24, z: -35.5, r: 0.9 }, { x: -8.8, z: -35.0, r: 1.2 },
    ],
  },

  // ---------- Enemies ----------
  // armor: share of arrow damage a giant rat's armour blocks (explosions ignore it)
  grunt: { radius: 0.42, speed: 2.55, gateDmg: 1, gateRate: 1.0, swings: 3, coins: 1 },
  // Small rat types (index = variant). hpMul scales the wave's rat HP.
  // pierceCost: how much of an arrow's pierce one rat soaks up (armour stops heavy arrows)
  ratTypes: [
    { name: 'Rat', speedMul: 1, hpMul: 1, gateDmg: 1, swings: 3, coins: 0, armor: 0, pierceCost: 1, knockMul: 1, scale: 1.1, radius: 0.42 },
    { name: 'Fast rat', speedMul: 1.75, hpMul: 0.45, gateDmg: 1, swings: 2, coins: 0, armor: 0, pierceCost: 1, knockMul: 1.2, scale: 0.98, radius: 0.38 },
    { name: 'Armored rat', speedMul: 0.62, hpMul: 2.2, gateDmg: 2, swings: 3, coins: 1, armor: 0.35, pierceCost: 2, knockMul: 0.4, scale: 1.24, radius: 0.5 },
    // 3 Shield rat: a big wooden shield soaks up arrows (shieldMul x its health) and stops
    //   piercing arrows dead. Cannon shells fly over it; Crystal Storm arrows fall from above.
    { name: 'Shield rat', speedMul: 0.85, hpMul: 1.2, gateDmg: 1, swings: 3, coins: 1, armor: 0, pierceCost: 1, knockMul: 0.6, scale: 1.15, radius: 0.46,
      shieldMul: 2.0, shieldPierce: 3 },
    // 4 Healer rat: every few seconds heals the rats around it. Stunned or frozen, it can't.
    { name: 'Healer rat', speedMul: 0.9, hpMul: 1.4, gateDmg: 1, swings: 2, coins: 2, armor: 0, pierceCost: 1, knockMul: 1, scale: 1.12, radius: 0.44,
      heal: { every: 3, r: 3.6, pct: 0.1, bigPct: 0.004, self: 0.5, max: 5 } },
    // 5 Brood rat: bursts into a litter of ratlings when it falls (not when it is spent at the gate)
    { name: 'Brood rat', speedMul: 0.72, hpMul: 1.6, gateDmg: 2, swings: 3, coins: 0, armor: 0, pierceCost: 2, knockMul: 0.5, scale: 1.45, radius: 0.56,
      split: { n: 4, v: 6, hpFrac: 0.12, spread: 1.1 } },
    // 6 Ratling: what comes out of a brood rat. Tiny, quick and weak.
    { name: 'Ratling', speedMul: 1.5, hpMul: 0.4, gateDmg: 1, swings: 1, coins: -1, armor: 0, pierceCost: 1, knockMul: 1.3, scale: 0.68, radius: 0.3 },
    // 7 Bomb rat: carries a lit bomb. Shot down, it blows up and hurts every rat within r
    //   (mul x its own health: enough for plain rats, and a wounded bomb rat goes off in turn;
    //   giants and bosses take bigMul of that). At the gate it blows a big hole in one go.
    { name: 'Bomb rat', speedMul: 0.85, hpMul: 1.3, gateDmg: 6, swings: 1, coins: 1, armor: 0, pierceCost: 1, knockMul: 0.8, scale: 1.15, radius: 0.46,
      bomb: { r: 1.5, mul: 0.8, bigMul: 0.4 } },
    // 8 Ninja rat: quick, and flips out of the way of one arrow every `every` seconds.
    //   Blasts, burning ground and Crystal Storm rain still hit it; stunned or frozen it cannot dodge.
    { name: 'Ninja rat', speedMul: 1.35, hpMul: 0.9, gateDmg: 1, swings: 2, coins: 1, armor: 0, pierceCost: 1, knockMul: 1.1, scale: 1.0, radius: 0.4,
      dodge: { every: 1.3 } },
    // 9 Jetpack rat: every `every` seconds its jetpack fires for t seconds and it rockets forward at speedMul.
    //   Stunned or frozen it cannot fire; frost still slows it.
    { name: 'Jetpack rat', speedMul: 1.0, hpMul: 0.85, gateDmg: 1, swings: 2, coins: 1, armor: 0, pierceCost: 1, knockMul: 1.1, scale: 1.05, radius: 0.42,
      jet: { every: 4.5, t: 0.9, speedMul: 3.2 } },
  ],
  // the rat types a player meets, in the order the Rat guide lists them
  ratGuide: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  giant: { radius: 1.05, speedMul: 0.93, gateDmg: 4, gateRate: 1.5, swings: 4, armor: 0.3 },
  boss: { radius: 1.5, speedMul: 0.8, gateDmg: 10, gateRate: 1.5, swings: 6, armor: 0.4 },
  // Bosses. Each overrides the boss defaults above. The three rat bosses are
  // big and armoured; the other three each have a trick that needs its own plan.
  bosses: {
    warlord: { name: 'Rat Warlord', speedMul: 0.86, armor: 0.3, gateDmg: 8, swings: 5 },
    baron: { name: 'Iron Rat Baron', speedMul: 0.7, armor: 0.55, gateDmg: 10, swings: 6 },
    king: { name: 'Rat King', speedMul: 0.8, armor: 0.4, gateDmg: 12, swings: 6 },
    // Sewer Slime: when it bursts it splits into n slimes (each hpFrac of its health),
    // and each of those splits once more. tiers: the sizes it splits into, biggest first.
    slime: { name: 'Sewer Slime', speedMul: 0.7, armor: 0, gateDmg: 8, swings: 5, radius: 1.55,
      split: { n: 2, hpFrac: 0.4, spread: 1.5,
        tiers: [
          { name: 'Slime', speedMul: 0.95, gateDmg: 4, swings: 3, radius: 1.05, coins: 12 },
          { name: 'Slimelet', speedMul: 1.2, gateDmg: 2, swings: 2, radius: 0.7, coins: 5 },
        ] } },
    // Tunnel Mole: digs in once it is `at` along the road, tunnels (out of reach) at
    // speedMul times its speed and bursts out at `exit`, near the town, with a band of rats.
    mole: { name: 'Tunnel Mole', speedMul: 0.85, armor: 0.35, gateDmg: 12, swings: 6,
      dig: { at: 36, exit: 150, speedMul: 2.6, down: 1.2, up: 1.6, rats: 8 } },
    // Canyon Buzzard: flies `h` high over the road, out of reach of cannon shells, and
    // drops n rats every `every` seconds (a share `fast` of them fast rats) until it is
    // `stop` from the gate; it glides down over the last `land` and lands to attack.
    buzzard: { name: 'Canyon Buzzard', speedMul: 0.85, armor: 0.1, gateDmg: 10, swings: 6, radius: 1.6,
      fly: { h: 5.4, every: 4, n: 4, fast: 0.3, stop: 26, land: 8 } },
  },
  airborne: 1.2,          // an enemy flying higher than this is out of reach of blasts and ground effects
  bossWarning: 5,         // seconds of warning before a boss climbs out of the burrow
  // Enemies that reach the keep swing at the gate a few times, then are spent.
  rowSpacing: 0.86,
  spawnS: 8,              // rats climb out of the burrow this far along the road
  hitFlinch: 0.24,        // seconds a hit rat flinches (animation only)

  // ---------- Waves ----------
  firstBuildTime: 25,
  buildTime: 16,
  autoSkipDelay: 3,       // auto skip: seconds between a cleared wave and the next
  skipBonus: 10,          // extra gold for sending the next wave mid-wave
  waveClearBonus: (w) => 10 + 5 * w,
  // giants: [hp, position in crowd 0..1, boss?] — the third value names a boss from `bosses`
  // (bosses: waves 5, 8, 10, 11, 13 and 15, and all six return in the final wave)
  // coins: gold coins each rat drops (later waves pay more)
  // title: optional banner text when the wave starts
  // mix: [fast, armored] share of rat rows that are fast rats / armored rats
  // mix: share of rows that are [fast, armored, shield, brood, bomb, ninja, jetpack] rats (the rest are plain rats)
  // healers: share of rows with a healer rat in the middle · intro: the rat type this wave introduces
  waves: [
    { coins: 1, grunts: 45, hp: 3, perRow: 6, giants: [[32, 0.0]] },
    { mix: [0.2, 0], coins: 1, grunts: 80, hp: 3, perRow: 6, title: 'Fast rats incoming!', intro: 1, giants: [[32, 0.05], [32, 0.6]] },
    { mix: [0.15, 0.1], coins: 1, grunts: 120, hp: 4, perRow: 7, title: 'Armored rats join the march!', intro: 2, giants: [[65, 0.0], [32, 0.4], [32, 0.75]] },
    { mix: [0.15, 0.12, 0.14, 0], coins: 1, grunts: 160, hp: 5, perRow: 7, intro: 3, title: 'Shield rats raise their shields!', giants: [[65, 0.0], [65, 0.04], [32, 0.5], [32, 0.85]] },
    { mix: [0.16, 0.14, 0.12, 0], coins: 2, grunts: 210, hp: 7, perRow: 7, title: 'Boss wave: the Rat Warlord!', giants: [[120, 0.0], [65, 0.3], [1000, 0.5, 'warlord'], [65, 0.85]] },
    { mix: [0.16, 0.14, 0.12, 0], healers: 0.12, coins: 2, grunts: 260, hp: 10, perRow: 7, intro: 4, title: 'Healer rats patch up the crowd!', giants: [[200, 0.0], [160, 0.05], [65, 0.4], [65, 0.55], [65, 0.85]] },
    { mix: [0.17, 0.15, 0.12, 0.06], healers: 0.12, coins: 2, grunts: 360, hp: 14, perRow: 8, intro: 5, title: 'Brood rats burst into ratlings!', giants: [[360, 0.0], [240, 0.3], [240, 0.36], [200, 0.7], [160, 0.9]] },
    { mix: [0.18, 0.15, 0.12, 0.07], healers: 0.14, coins: 2, grunts: 440, hp: 17, perRow: 8, title: 'Boss wave: the Sewer Slime!', giants: [[400, 0.0], [400, 0.05], [260, 0.3], [700, 0.5, 'slime'], [260, 0.85]] },
    // ---- second half: night falls, crowds and giants keep growing
    { mix: [0.17, 0.17, 0.11, 0.07, 0.06], healers: 0.1, coins: 1, grunts: 460, hp: 48, perRow: 8, intro: 7, title: 'Bomb rats carry lit bombs!', giants: [[1200, 0.0], [800, 0.25], [800, 0.5], [1200, 0.75]] },
    { mix: [0.17, 0.17, 0.11, 0.07, 0.06], healers: 0.1, coins: 1, grunts: 500, hp: 62, perRow: 8, title: 'Boss wave: the Iron Rat Baron!', giants: [[1600, 0.0], [1600, 0.04], [1000, 0.3], [9000, 0.5, 'baron'], [1600, 0.85]] },
    { mix: [0.17, 0.17, 0.11, 0.07, 0.06], healers: 0.1, coins: 1, grunts: 540, hp: 80, perRow: 8, title: 'Boss wave: the Tunnel Mole!', giants: [[2000, 0.0], [1300, 0.2], [1300, 0.4], [4500, 0.5, 'mole'], [1300, 0.9]] },
    { mix: [0.17, 0.17, 0.11, 0.07, 0.05, 0.07], healers: 0.1, coins: 1, grunts: 700, hp: 97, perRow: 8, intro: 8, title: 'The Great Swarm, with ninja rats!', giants: [[3000, 0.0], [3000, 0.5], [3000, 0.95]] },
    // waves 13-16 are tuned against fully upgraded crystal crossbows and cannons
    { mix: [0.17, 0.17, 0.11, 0.07, 0.05, 0.07], healers: 0.1, coins: 1, grunts: 560, hp: 153, perRow: 8, title: 'Boss wave: the Canyon Buzzard!', giants: [[4400, 0.0], [2900, 0.2], [2900, 0.35], [8000, 0.5, 'buzzard'], [2900, 0.8]] },
    { mix: [0.17, 0.17, 0.11, 0.07, 0.05, 0.06, 0.07], healers: 0.1, coins: 1, grunts: 520, hp: 247, perRow: 8, intro: 9, title: 'Giant rat stampede, with jetpack rats!', giants: [[6800, 0.0], [6800, 0.1], [5300, 0.25], [5300, 0.4], [6800, 0.55], [5300, 0.7], [6800, 0.85]] },
    { mix: [0.17, 0.17, 0.11, 0.07, 0.05, 0.06, 0.07], healers: 0.1, coins: 1, grunts: 640, hp: 350, perRow: 8, title: 'Boss wave: the Rat King!', giants: [[9800, 0.0], [9800, 0.05], [7700, 0.3], [14000, 0.5, 'king'], [9800, 0.9]] },
    { mix: [0.17, 0.12, 0.11, 0.07, 0.05, 0.06, 0.07], healers: 0.1, coins: 1, grunts: 760, hp: 362, perRow: 8, title: 'Final wave: every boss returns!', giants: [[10600, 0.0], [3000, 0.1, 'slime'], [5000, 0.25, 'warlord'], [5000, 0.38, 'buzzard'], [5500, 0.5, 'baron'], [5000, 0.62, 'mole'], [7500, 0.75, 'king']] },
  ],
};

// Diamonds wave i pays on a difficulty ('easy' | 'normal' | 'hard'), and a full clear's total.
export const waveDiamonds = (i, diff = 'normal') => Math.ceil((CFG.waveDiamonds[i] || 0) * (CFG.difficulties[diff] || CFG.difficulties.normal).diamonds);
export const clearDiamonds = (diff = 'normal') => CFG.waveDiamonds.reduce((n, _, i) => n + waveDiamonds(i, diff), 0);

// Giant rats drop a coin shower that grows with their HP, capped so the
// late-wave brutes don't flood the economy.
export const giantCoins = (hp, boss) => (boss ? 50 : Math.round(7 + Math.min(hp, 600) / 12));

// Stats of a cannon at a level on its path ('rapid' or 'blast'; levels 1-3 have none).
export function cannonSpec(level, path) {
  if (level < CFG.cannon.branchLevel) return CFG.cannon.levels[level];
  return CFG.cannon.paths[path === 'rapid' ? 'rapid' : 'blast'].levels[level];
}
export const CANNON_PATHS = ['rapid', 'blast'];

// ---------- Maps ----------
// Every level shares the waves, towers and the town in the north; each map
// has its own road, cliffs, hills and tower spots. setLevel() in world.js
// copies one of these into CFG.
const SUNSTONE = {
  id: 1, name: 'Sunstone Canyon',
  roadPoints: CFG.roadPoints, plateaus: CFG.plateaus, hills: [], slots: CFG.slots,
  fortress: CFG.fortress, fortressPad: CFG.fortressPad, walk: CFG.walk, heroStart: CFG.hero.start,
  huts: CFG.huts, town: CFG.town, moleExit: 150, decor: null, hpMul: 1,
};

// Level 2: the road winds back and forth up a big sand hill, past a lone
// flowering desert tree and a picnic blanket on the summit, then down to the town.
const LONETREE = {
  id: 2, name: 'Lonetree Hill',
  roadPoints: [
    [-40, 46], [-29, 38.5], [-16, 34.5], [-2, 33.6], [11, 33], [20.5, 29], [23.5, 21.5],
    [18.5, 14.8], [7, 12.6], [-5, 11.4], [-13.5, 8.6], [-18, 2.5],
    [-15.5, -3.8], [-6, -7.4], [6, -8.4], [16.5, -11.4], [20.5, -18.4],
    [14.5, -24.6], [3, -26.2], [-5, -26], [-12, -27.6], [-16, -33.5],
  ],
  plateaus: [
    { x: -26, z: 25.8, rx: 4.7, rz: 5.4, seed: 5.3 },
    { x: 27.5, z: 3.5, rx: 3.4, rz: 5.2, seed: 2.6 },
  ],
  // the hill: centre, radii and height (a smooth sand dome, a little uneven)
  hills: [{ x: -0.5, z: 2.5, rx: 23, rz: 19, h: 5, seed: 1.3 }],
  slots: [
    { id: 'H1', x: -7, z: 25.5, prebuilt: true },
    { id: 'H2', x: 8, z: 25.5 },
    { id: 'H3', x: -8, z: 2 },
    { id: 'E1', x: 16.5, z: 21.5 },
    { id: 'H4', x: 7.5, z: 3.6 },
    { id: 'H5', x: -3, z: -17 },
    { id: 'F1', x: -5.5, z: -33.5 },
    { id: 'H6', x: 11.5, z: -17.5 },
    { id: 'H7', x: -17, z: 26.5 },
    { id: 'W1', x: -25.8, z: 29 },
  ],
  fortress: CFG.fortress, fortressPad: CFG.fortressPad, walk: CFG.walk,
  heroStart: [0, 23],
  huts: CFG.huts, town: CFG.town,
  moleExit: 0,   // set by setLevel: about 30 from the gate, like Level 1
  hpMul: 1.3,   // tougher rats: the long switchback road gives the towers more time
  decor: {
    tree: { x: 0.6, z: 0.6, rot: 0.6 },
    picnic: { x: -2, z: 5, rot: -0.25 },
    kite: { x: 5, z: -2, h: 13 },
    flowers: 80,
  },
};

// Level 3: the road loops right round a palm-fringed oasis pool, crosses the
// stream that runs out of it on a wooden bridge, passes under a sandstone arch
// and winds through the dunes up to the town.
const OASIS = {
  id: 3, name: 'Mirage Oasis',
  roadPoints: [
    [44, 4], [31, 2.5], [22.5, 6], [18.5, 15.5], [19, 26], [11, 32.5], [-1, 33.8], [-13, 32.2],
    [-23, 26], [-25, 15], [-20, 5.5], [-9, 1.8], [-1, -5], [5.5, -10.5], [14, -15.5],
    [13, -23.5], [3, -26.5], [-5, -26], [-12, -27.6], [-16, -33.5],
  ],
  plateaus: [{ x: 29.5, z: 14, rx: 4.4, rz: 5.6, seed: 3.7 }],
  hills: [],
  slots: [
    { id: 'O1', x: 26.5, z: -5, prebuilt: true },
    { id: 'O2', x: 12, z: 12 },
    { id: 'M1', x: 28, z: 11.5 },
    { id: 'O3', x: 11, z: 23.5 },
    { id: 'O4', x: -15, z: 11 },
    { id: 'O5', x: 6, z: -1 },
    { id: 'O6', x: 2.5, z: -18 },
    { id: 'F1', x: -5.5, z: -33.5 },
    { id: 'O7', x: -17, z: 22.5 },
    { id: 'O8', x: 22, z: -18 },
  ],
  fortress: CFG.fortress, fortressPad: CFG.fortressPad, walk: CFG.walk,
  heroStart: [22, -2],
  huts: CFG.huts, town: CFG.town,
  moleExit: 0,   // set by setLevel: about 30 from the gate
  hpMul: 1.2,   // a shorter road than Level 2 (rats reach the town sooner), so the hardest map with a little less rat health
  decor: {
    pond: { x: -2, z: 18, rx: 8.8, rz: 5.6, seed: 2.2 },
    stream: [[-1.5, 23.5], [0.5, 28], [-0.5, 33.5], [1.5, 39], [0.5, 46]],
    arch: { x: -24.9, z: 16 },
    palms: 8,
    camels: [{ x: -9, z: 7.5, rot: 0.5 }, { x: 15.5, z: 2, rot: -2.2 }],
  },
};

export const MAPS = [SUNSTONE, LONETREE, OASIS];
