// The Rat guide: every enemy, what makes it dangerous and how to beat it.
// Used by the Rat guide screen and the "New enemy" card when a type first
// marches in. Pure data (plus the wave each one first appears in).
import { CFG } from './config.js';

// key: 'rat:N' (CFG.ratTypes index), 'giant', or 'boss:NAME'
// abilities: the badges on its card; aura: the colour of its glow (the same as in a game)
export const RAT_GUIDE = [
  { key: 'rat:0', abilities: [], aura: '#b7a9b0', name: 'Rat', tag: 'Common',
    trait: 'Marches in big crowds and bites the town hall three times before it is spent.',
    counter: 'Any tower. Piercing arrows and cannon blasts hit several at once.' },
  { key: 'rat:1', abilities: ['Dash'], aura: '#ffb02e', name: 'Fast rat', tag: 'Runner',
    trait: 'Races ahead of the crowd at almost twice the speed, but falls to a single hit early on.',
    counter: 'Build towers near the burrow so they meet runners first. The Rapid Launcher and Frost Arrows catch them.' },
  { key: 'rat:2', abilities: ['Armour'], aura: '#7fb4ff', name: 'Armored rat', tag: 'Armored',
    trait: 'Slow and tough. Its iron armour shrugs off a third of every arrow and stops piercing arrows halfway.',
    counter: 'Armor Piercer crossbows (level 4) get through the armour; Thunder Mortar shells hit armour more than twice as hard.' },
  { key: 'rat:3', abilities: ['Shield block'], aura: '#ffd24a', name: 'Shield rat', tag: 'Shield carrier',
    trait: 'Holds a big wooden shield that soaks up arrows and stops piercing arrows dead. Once the shield splinters it is an ordinary rat.',
    counter: 'Cannon shells fly over the shield, and Crystal Storm arrows fall on it from above. Armor Piercer arrows split shields three times faster.' },
  { key: 'rat:4', abilities: ['Heal aura'], aura: '#5dff7a', name: 'Healer rat', tag: 'Healer',
    trait: 'Every 3 seconds its staff glows and mends the five most hurt rats around it.',
    counter: 'Twin Shot and better crossbows aim their extra arrows at healers. Freezing or stunning a healer stops the heal, and big blasts kill faster than it can mend.' },
  { key: 'rat:5', abilities: ['Splits on death'], aura: '#c77dff', name: 'Brood rat', tag: 'Splitter',
    trait: 'A fat rat with a sack on its back. When it falls, four quick ratlings burst out and run on.',
    counter: 'Area damage mops up the ratlings: cannon blasts, cluster bomblets and burning ground. Kill brood rats early, far from the town hall.' },
  { key: 'rat:7', abilities: ['Explodes (area)'], aura: '#ff3a1a', name: 'Bomb rat', tag: 'Explosive',
    trait: 'Carries a big black bomb with a fizzing fuse. Shot down, it blows up and knocks out the rats around it. If it reaches the gate it blows a big hole in one go.',
    counter: 'Pop it early, right in the middle of the crowd: its blast does your work for you, and a wounded bomb rat caught in it goes off too. Never let one reach the gate.' },
  { key: 'rat:8', abilities: ['Dodge', 'Backflip'], aura: '#b04aff', name: 'Ninja rat', tag: 'Dodger',
    trait: 'Quick and masked. Every second or so it backflips out of the way of an arrow, and the arrow flies on.',
    counter: 'Twin and triple crossbows fire more arrows than it can dodge. Cannon blasts, burning ground and Crystal Storm rain cannot be dodged, and a frozen or stunned ninja cannot dodge at all.' },
  { key: 'rat:9', abilities: ['Jet boost'], aura: '#ff8a24', name: 'Jetpack rat', tag: 'Rocket',
    trait: 'Every few seconds its jetpack fires and it rockets forward at three times its speed, leaping past your towers.',
    counter: 'Frost Arrows slow it even mid-boost, and a frozen or stunned rat cannot fire its jetpack. Keep strong towers near the end of the road.' },
  { key: 'rat:6', abilities: ['Comes in litters'], aura: '#ffb3c8', name: 'Ratling', tag: 'From a brood rat',
    trait: 'Tiny, quick and weak. It bites the town hall once, but they come in litters.',
    counter: 'Blasts and bouncing arrows hit several at once. Don\'t let a brood rat fall right at the gate.' },
  { key: 'giant', abilities: ['Club smash', 'Shoves rats aside'], aura: '#ff5a3a', name: 'Giant rat', tag: 'Giant',
    trait: 'A hulking rat with a nail-studded club and a lot of health. It shoves the small rats aside and hits the gate hard.',
    counter: 'Twin and triple crossbows focus every arrow on it; the Thunder Mortar crushes it.' },
  // bosses, in the order they first come
  { key: 'boss:warlord', abilities: ['Armour', 'Boss siren'], aura: '#ff4020', name: 'Rat Warlord', tag: 'Boss · armoured',
    trait: 'The first boss: horned helmet, war paint and a red cape. Armour blocks 30% of arrows.',
    counter: 'Get a few crossbows to level 3 before wave 5. A siren warns you 5 seconds before it climbs out.' },
  { key: 'boss:slime', abilities: ['Splits ×2, ×4'], aura: '#6dff4a', name: 'Sewer Slime', tag: 'Boss · splits',
    trait: 'A giant blob of sewer goo. When it bursts it splits into two slimes, and each of those splits into two slimelets that ooze on faster.',
    counter: 'Burst it early, far from the town hall, so the pieces have a long way to go. Cannon blasts and bouncing arrows hit the little slimes together, and Frost Arrows freeze the small ones solid.' },
  { key: 'boss:baron', abilities: ['Heavy armour'], aura: '#7fb8ff', name: 'Iron Rat Baron', tag: 'Boss · heavy armour',
    trait: 'Slow, in full steel armour that blocks 55% of arrows.',
    counter: 'Armor Piercer arrows, the Thunder Mortar, and cracked armour from Crystal Quake or a Nova.' },
  { key: 'boss:mole', abilities: ['Burrow', 'Surprise attack'], aura: '#ffc04a', name: 'Tunnel Mole', tag: 'Boss · tunnels',
    trait: 'Soon after it climbs out it digs under the canyon, where nothing can hit it, and bursts up near the town with a band of rats.',
    counter: 'Hit it hard before it digs in. Red cracks in the ground show where it will come up, so keep strong towers by the town hall and stand ready there.' },
  { key: 'boss:buzzard', abilities: ['Flies', 'Drops rats'], aura: '#9ad8ff', name: 'Canyon Buzzard', tag: 'Boss · flies',
    trait: 'Flies high over the road and drops rats from its net every few seconds. Cannon shells can\'t reach it until it lands at the town hall.',
    counter: 'Crossbows shoot it down, and every arrow of a twin or triple crossbow goes for it. Leave the rats it drops to your cannons.' },
  { key: 'boss:king', abilities: ['Royal armour', 'Frost-proof'], aura: '#ffd23a', name: 'Rat King', tag: 'Boss · biggest',
    trait: 'The biggest of them all, with a gold crown and 14,000 health. Frost only slows it.',
    counter: 'Everything you have. Cracked armour makes every tower hit 50% harder.' },
];

// The first wave (1-based) a guide entry marches in, or 0 for bosses (fixed waves).
export function firstWave(key) {
  if (!key.startsWith('rat:')) {
    if (key === 'giant') return 1;
    const boss = key.slice(5);
    const i = CFG.waves.findIndex((w) => w.giants.some((g) => g[2] === boss));
    return i + 1;
  }
  const v = +key.slice(4);
  if (v === 0) return 1;
  if (v === 6) return firstWave('rat:5');   // ratlings come with the brood rats
  const row = { 1: 0, 2: 1, 3: 2, 5: 3, 7: 4, 8: 5, 9: 6 }[v];
  for (let i = 0; i < CFG.waves.length; i++) {
    const w = CFG.waves[i];
    if (w.intro === v) return i + 1;
    if (v === 4 ? w.healers > 0 : w.mix && w.mix[row] > 0) return i + 1;
  }
  return 0;
}

export const guideEntry = (key) => RAT_GUIDE.find((g) => g.key === key);

// The Quick Counter Guide at the end of the Rat guide: which towers beat which kind of enemy.
export const QUICK_COUNTERS = [
  { icon: 'crowd', kind: 'Crowds', who: 'rats, brood rats, ratlings', beat: 'Cannon blasts, bouncing arrows' },
  { icon: 'fast', kind: 'Fast', who: 'fast, ninja and jetpack rats', beat: 'Frost Arrows, twin and triple crossbows' },
  { icon: 'armour', kind: 'Armour', who: 'armored rats, Warlord, Baron, King', beat: 'Armor Piercer, Thunder Mortar' },
  { icon: 'shield', kind: 'Shields', who: 'shield rats', beat: 'Cannons, Crystal Storm, Armor Piercer' },
  { icon: 'heal', kind: 'Healers', who: 'healer rats', beat: 'Twin Shot focus, freeze or stun' },
  { icon: 'fly', kind: 'Flying', who: 'Canyon Buzzard', beat: 'Crossbows (twin and triple)' },
  { icon: 'boom', kind: 'Explosive', who: 'bomb rats', beat: 'Pop them early, in the crowd' },
  { icon: 'split', kind: 'Splitters', who: 'Sewer Slime, brood rats', beat: 'Cannons, bouncing arrows, Frost' },
];
