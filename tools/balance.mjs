// Runs full-level simulations headlessly and prints a per-wave report.
//   node tools/balance.mjs [bot|idle|lazy|noup|focus|cannon|cannonlazy][+auto][+skip][+rapid|+blast] [seed]
//   +auto turns on Auto skip; +skip also presses Skip wave whenever it can.
//   +rapid / +blast: which way cannon bots take the level 4 upgrade choice.
//   +easy / +hard: play on that difficulty (Normal otherwise). +repair: the bot repairs the town hall.
//   +l2 ... +l7: play that level instead of Level 1.
import { Sim } from '../src/sim.js';
import { CFG } from '../src/config.js';
import { makeBot } from '../src/bot.js';
import { setLevel } from '../src/world.js';

export function runLevel(fullMode = 'bot', seed = 7, verbose = false) {
  const [mode, ...flags] = fullMode.split('+');
  const skipper = flags.includes('skip');
  const lv = flags.find((f) => /^l\d$/.test(f));
  setLevel(lv ? +lv.slice(1) : 1);
  const difficulty = flags.includes('easy') ? 'easy' : flags.includes('hard') ? 'hard' : 'normal';
  const sim = new Sim({ seed, cannon: mode.startsWith('cannon'), autoSkip: flags.includes('auto') || skipper, difficulty });
  const cannonPath = flags.includes('rapid') ? 'rapid' : flags.includes('blast') ? 'blast' : undefined;
  const repair = flags.includes('repair');
  const bot = makeBot(mode === 'noup' ? { prefer: ['build'] } : mode === 'focus' ? { focus: true, repair } : mode === 'cannon' || mode === 'cannonlazy' ? { cannon: true, cannonPath, repair } : { repair });
  const dt = CFG.fixedDt;
  const report = [];
  let lastWave = -1, peakEnemies = 0, stepMs = 0, steps = 0, peakBolts = 0, peakCoins = 0;
  const t0 = Date.now();
  let lazyTick = 0;
  while (sim.state !== 'victory' && sim.state !== 'defeat' && sim.time < 3600) {
    if (mode === 'bot' || mode === 'noup' || mode === 'focus' || mode === 'cannon') bot(sim);
    else if (mode === 'lazy' || mode === 'cannonlazy') { // only acts every other second: a distracted player
      lazyTick += dt;
      if (lazyTick % 2 < 1) bot(sim); else sim.setInput(0, 0);
    } else sim.setInput(0, 0);
    if (skipper && sim.state === 'wave' && sim.canSkip) sim.skipWave();
    const a = performance.now();
    sim.step(dt);
    stepMs += performance.now() - a; steps++;
    peakEnemies = Math.max(peakEnemies, sim.enemies.length);
    peakBolts = Math.max(peakBolts, sim.bolts.length);
    peakCoins = Math.max(peakCoins, sim.coins.length);
    for (const e of sim.events) {
      if (e.type === 'waveCleared' || e.type === 'skipped') {
        report.push({ wave: e.index + 1, hp: sim.fortress.hp, maxHp: sim.fortress.maxHp, gold: sim.gold, towers: sim.towers.map((t) => t.level).join(''), fort: sim.fortress.level, t: Math.round(sim.time) });
      }
    }
    sim.events.length = 0;
    if (sim.waveIndex !== lastWave) lastWave = sim.waveIndex;
  }
  return {
    mode: fullMode, seed, result: sim.state, wave: sim.waveIndex + (sim.state === 'victory' ? 0 : 1), stars: sim.stars,
    fortress: `${sim.fortress.hp}/${sim.fortress.maxHp}`, time: Math.round(sim.time), report,
    peakEnemies, peakBolts, peakCoins, avgStepMs: +(stepMs / steps).toFixed(3), wallMs: Date.now() - t0, stats: sim.stats,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || 'bot';
  const seeds = process.argv[3] ? [Number(process.argv[3])] : [1, 2, 3];
  for (const seed of seeds) {
    const r = runLevel(mode, seed);
    console.log(`${mode} seed=${seed}: ${r.result} wave=${r.wave} stars=${r.stars} fortress=${r.fortress} time=${r.time}s peakEnemies=${r.peakEnemies} peakBolts=${r.peakBolts} peakCoins=${r.peakCoins} avgStep=${r.avgStepMs}ms`);
    for (const w of r.report) console.log(`   wave ${w.wave}: hp ${w.hp}/${w.maxHp} gold ${w.gold} towers [${w.towers}] fort L${w.fort} t=${w.t}s`);
    console.log('   stats', JSON.stringify(r.stats));
  }
}
