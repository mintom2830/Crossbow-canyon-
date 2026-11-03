// Original synthesized sound effects and a light procedural music loop.
// Everything is generated with WebAudio at runtime — no audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.limits = new Map();
    this.coinCombo = 0;
    this.lastCoin = 0;
    this.musicIntensity = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 0.9 : 0; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.32 : 0; this.music.connect(this.master);
    // shared noise buffer
    const len = c.sampleRate * 1;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._startMusic();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 0.9 : 0; }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1); }

  _ok(name, perSec) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    const last = this.limits.get(name) || 0;
    if (now - last < 1 / perSec) return false;
    this.limits.set(name, now);
    return true;
  }

  _env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  _osc(type, f0, f1, t, dur, vol, dest = this.sfx) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this._env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, vol, type, freq, q = 1, dest = this.sfx) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = 1;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    this._env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---- effects
  fire(level) {
    if (!this._ok('fire', 14)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, 0.16, 'bandpass', 2600 + Math.random() * 600, 1.4);
    this._osc('triangle', 420 + level * 40, 150, t, 0.07, 0.12);
  }
  // Frost Arrows freezing a rat: a short icy chime
  freeze(giant) {
    if (!this._ok('freeze', 7)) return;
    const t = this.ctx.currentTime;
    this._osc('triangle', giant ? 1500 : 2100, giant ? 2300 : 3000, t, 0.12, 0.07);
    this._osc('sine', giant ? 2600 : 3400, giant ? 3000 : 3900, t + 0.03, 0.16, 0.05);
    this._noise(t, 0.09, 0.06, 'highpass', 6000, 0.8);
  }
  // Crystal Storm: a rising whoosh and a chime when the storm is called
  storm() {
    if (!this._ok('storm', 3)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.5, 0.12, 'bandpass', 1200, 0.9);
    this._osc('sine', 600, 1500, t, 0.45, 0.06);
    this._osc('triangle', 1800, 2600, t + 0.15, 0.3, 0.05);
  }
  stormHit() {
    if (!this._ok('stormHit', 16)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, 0.08, 'bandpass', 3800 + Math.random() * 900, 2);
  }
  // an arrow glancing off an armored rat's plates
  clink() {
    if (!this._ok('clink', 8)) return;
    const t = this.ctx.currentTime;
    this._osc('square', 2400 + Math.random() * 500, 1700, t, 0.05, 0.03);
    this._noise(t, 0.04, 0.05, 'highpass', 5000, 1);
  }
  // an arrow thudding into a wooden shield
  shieldBlock() {
    if (!this._ok('block', 9)) return;
    const t = this.ctx.currentTime;
    this._osc('triangle', 420 + Math.random() * 80, 180, t, 0.07, 0.07);
    this._noise(t, 0.05, 0.07, 'bandpass', 900, 1.5);
  }
  // a shield splintering apart
  shieldBreak() {
    if (!this._ok('shieldBreak', 6)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.22, 0.2, 'bandpass', 1400, 0.8);
    for (let i = 0; i < 3; i++) this._osc('square', 320 - i * 60, 120, t + i * 0.03, 0.08, 0.04);
  }
  // a healer's pulse: a soft rising chime
  heal() {
    if (!this._ok('heal', 3)) return;
    const t = this.ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => this._osc('sine', f, f * 1.05, t + i * 0.06, 0.28, 0.035));
  }
  // a brood rat bursting into ratlings: a wet pop and squeaks
  broodSplit() {
    if (!this._ok('split', 5)) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 300, 70, t, 0.14, 0.18);
    this._noise(t, 0.1, 0.1, 'lowpass', 900);
    for (let i = 0; i < 3; i++) { const f = 1400 + Math.random() * 600; this._osc('triangle', f, f * 1.3, t + 0.08 + i * 0.05, 0.07, 0.025); }
  }
  // a Sewer Slime bursting: a big wet squelch (smaller slimes squelch higher)
  slimeSplit(tier = 1) {
    if (!this._ok('slime', 4)) return;
    const t = this.ctx.currentTime, k = tier === 1 ? 1 : 1.6;
    this._osc('sine', 220 * k, 50 * k, t, 0.28, 0.22);
    this._noise(t, 0.22, 0.16, 'lowpass', 700 * k, 2);
    this._osc('triangle', 160 * k, 420 * k, t + 0.1, 0.16, 0.06);
  }
  // the Tunnel Mole digging in: a scraping rumble
  digDown() {
    if (!this._ok('dig', 0.5)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 1.1, 0.2, 'lowpass', 380, 0.8);
    for (let i = 0; i < 6; i++) this._noise(t + i * 0.14, 0.08, 0.1, 'bandpass', 900 + Math.random() * 500, 3);
    this._osc('sawtooth', 70, 40, t, 1.0, 0.08);
  }
  // ...and bursting out of the ground near the town
  digUp() {
    if (!this._ok('digUp', 0.5)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.7, 0.3, 'lowpass', 600, 0.7);
    this._osc('sine', 110, 35, t, 0.6, 0.28);
    this._osc('sawtooth', 140, 60, t + 0.05, 0.5, 0.08);
  }
  // a ninja rat flipping clear of an arrow: a quick whoosh
  dodge() {
    if (!this._ok('dodge', 6)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.12, 0.08, 'bandpass', 2400, 1.2);
    this._osc('sine', 900, 1600, t, 0.1, 0.03);
  }
  // a jetpack rat firing its jetpack: a short roar
  jet() {
    if (!this._ok('jet', 4)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.5, 0.12, 'lowpass', 1400, 0.8);
    this._osc('sawtooth', 160, 320, t, 0.4, 0.04);
  }
  // the Canyon Buzzard letting go of rats: a falling whistle
  drop() {
    if (!this._ok('drop', 1)) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 1600, 500, t, 0.45, 0.04);
    this._osc('triangle', 380, 300, t, 0.2, 0.04);
  }
  // boss warning: a falling two-tone siren, three times
  bossWarning() {
    if (!this._ok('bossWarn', 0.5)) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this._osc('sawtooth', 620, 380, t + i * 0.42, 0.34, 0.06);
      this._osc('square', 310, 190, t + i * 0.42, 0.34, 0.04);
    }
  }
  // boss climbing out: a deep growl and rumble
  bossRoar() {
    if (!this._ok('bossRoar', 0.5)) return;
    const t = this.ctx.currentTime;
    this._osc('sawtooth', 120, 55, t, 0.9, 0.12);
    this._osc('triangle', 90, 40, t + 0.05, 1.0, 0.1);
    this._noise(t, 0.8, 0.14, 'lowpass', 300, 0.7);
  }
  // townsfolk: a startled little "eek!" (rising squeak)
  villagerGasp() {
    if (!this._ok('gasp', 1.5)) return;
    const t = this.ctx.currentTime, f = 520 + Math.random() * 260;
    this._osc('triangle', f, f * 1.9, t, 0.16, 0.06);
    this._osc('sine', f * 1.5, f * 2.4, t + 0.03, 0.14, 0.04);
  }
  // relieved "phew": a soft falling whistle
  villagerPhew() {
    if (!this._ok('phew', 0.5)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.35, 0.05, 'bandpass', 1400, 2);
    this._osc('sine', 900, 420, t + 0.02, 0.35, 0.035);
  }
  // the whole town cheering: a crowd "hooray" with whistles and claps
  villagerCheer() {
    if (!this._ok('cheer', 0.2)) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const s = t + i * 0.07, f = 300 + Math.random() * 300;
      this._osc('triangle', f, f * 1.35, s, 0.5, 0.025);
    }
    this._noise(t, 1.1, 0.06, 'bandpass', 1100, 0.6);
    for (let i = 0; i < 8; i++) this._noise(t + 0.15 + i * 0.11 + Math.random() * 0.04, 0.04, 0.09, 'highpass', 1800);
    this._osc('sine', 1500, 2600, t + 0.2, 0.25, 0.03);
    this._osc('sine', 1700, 2900, t + 0.55, 0.22, 0.025);
  }
  hitGiant() {
    if (!this._ok('hit', 12)) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 170, 70, t, 0.1, 0.25);
    this._noise(t, 0.06, 0.12, 'lowpass', 900);
  }
  pop() {
    if (!this._ok('pop', 22)) return;
    const t = this.ctx.currentTime;
    this._osc('triangle', 600 + Math.random() * 200, 180, t, 0.06, 0.07);
  }
  bigDeath(boss) {
    if (!this._ok('big', 4)) return;
    const t = this.ctx.currentTime;
    this._osc('sawtooth', boss ? 140 : 200, 40, t, boss ? 0.7 : 0.4, 0.22);
    this._noise(t, boss ? 0.6 : 0.35, 0.3, 'lowpass', 600);
  }
  coin() {
    if (!this._ok('coin', 28)) return;
    const t = this.ctx.currentTime;
    if (t - this.lastCoin > 0.5) this.coinCombo = 0;
    this.lastCoin = t;
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const n = steps[Math.min(steps.length - 1, this.coinCombo++ >> 1)];
    const f = 1046 * Math.pow(2, n / 12);
    this._osc('sine', f, f, t, 0.09, 0.09);
    this._osc('sine', f * 1.5, f * 1.5, t + 0.02, 0.07, 0.04);
  }
  pay(frac) {
    if (!this._ok('pay', 16)) return;
    const t = this.ctx.currentTime;
    const f = 500 + frac * 700;
    this._osc('square', f, f * 1.02, t, 0.035, 0.035);
  }
  build(kind) {
    if (!this._ok('build', 3)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.12, 0.3, 'lowpass', 500);
    this._osc('sine', 110, 55, t, 0.18, 0.35);
    const notes = kind === 'fortress' ? [523, 659, 784, 1046, 1318] : [523, 659, 784, 1046];
    notes.forEach((f, i) => this._osc('triangle', f, f, t + 0.08 + i * 0.07, 0.22, 0.12));
  }
  // style: 'rapid' (a light thunk from a launch tube), 'heavy' (the Thunder Mortar's deep boom)
  cannon(kind, style = '') {
    if (kind === 'rocket') {
      if (!this._ok('rocket', 14)) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.22, 0.12, 'bandpass', 1700, 1.2);
      this._osc('sawtooth', 320, 900, t, 0.18, 0.04);
      return;
    }
    if (style === 'rapid') {
      if (!this._ok('cannonRapid', 12)) return;
      const t = this.ctx.currentTime;
      this._osc('sine', 260, 90, t, 0.1, 0.22);
      this._noise(t, 0.07, 0.14, 'lowpass', 1800);
      return;
    }
    if (!this._ok('cannon', 9)) return;
    const t = this.ctx.currentTime, nova = kind === 'nova', heavy = style === 'heavy';
    this._osc('sine', nova ? 95 : heavy ? 110 : 150, heavy ? 30 : 38, t, nova ? 0.55 : heavy ? 0.45 : 0.26, nova ? 0.5 : heavy ? 0.48 : 0.34);
    this._noise(t, nova ? 0.3 : heavy ? 0.26 : 0.16, nova ? 0.32 : heavy ? 0.3 : 0.24, 'lowpass', nova ? 700 : heavy ? 800 : 1100);
  }
  explosion(kind, level) {
    if (kind === 'bomblet') {
      if (!this._ok('pop', 22)) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.1, 0.1, 'lowpass', 2000);
      return;
    }
    if (!this._ok('boom', 10)) return;
    const t = this.ctx.currentTime, nova = kind === 'nova';
    this._noise(t, nova ? 0.9 : 0.42, nova ? 0.5 : 0.3, 'lowpass', nova ? 450 : 1300);
    this._osc('sine', nova ? 70 : 95, 28, t, nova ? 0.7 : 0.32, nova ? 0.45 : 0.28);
    if (level === 6 || nova) [1320, 1760, 2640].forEach((f, i) => this._osc('triangle', f, f * 1.2, t + 0.03 * i, 0.3, 0.035));
  }
  denied() {
    if (!this._ok('deny', 2)) return;
    const t = this.ctx.currentTime;
    this._osc('square', 220, 160, t, 0.12, 0.06);
    this._osc('square', 180, 130, t + 0.12, 0.14, 0.06);
  }
  fortressHit() {
    if (!this._ok('fhit', 4)) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 90, 45, t, 0.25, 0.3);
    this._noise(t, 0.15, 0.18, 'lowpass', 300);
  }
  horn() {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx, t = c.currentTime;
    for (const [f, det] of [[110, 0], [110, 6], [165, -4]]) {
      const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.linearRampToValueAtTime(f, t + 0.25); o.detune.value = det;
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(400, t); fl.frequency.linearRampToValueAtTime(1100, t + 0.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.15); g.gain.setValueAtTime(0.09, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(fl); fl.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1.5);
    }
  }
  jingle(win) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const seq = win ? [523, 659, 784, 1046, 784, 1046, 1318] : [392, 349, 311, 262];
    seq.forEach((f, i) => this._osc(win ? 'triangle' : 'sawtooth', f, f, t + i * (win ? 0.11 : 0.22), win ? 0.25 : 0.35, win ? 0.14 : 0.08));
  }
  // a hoof on hard sand: a short knock and a woody tick (riding the horse or cow)
  clop(hi) {
    if (!this._ok('clop', 60)) return;
    const t = this.ctx.currentTime;
    this._osc('triangle', hi ? 520 : 430, hi ? 300 : 250, t, 0.05, 0.05);
    this._noise(t, 0.03, 0.04, 'bandpass', hi ? 2400 : 1900, 3);
  }
  click() {
    if (!this._ok('click', 20)) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 880, 660, t, 0.05, 0.08);
  }

  // ---- music: a simple pentatonic pluck + drum loop scheduled ahead
  _startMusic() {
    const c = this.ctx;
    const bpm = 100, step = 60 / bpm / 2; // eighth notes
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const root = 196; // G3
    let next = c.currentTime + 0.1, i = 0;
    const melody = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 2, 4];
    const bass = [0, 0, 3, 3, 4, 4, 2, 2];
    const tick = () => {
      if (!this.ctx) return;
      while (next < c.currentTime + 0.25) {
        const b = i % 16;
        const inten = this.musicIntensity;
        if (b % 4 === 0) this._kick(next, 0.22 + inten * 0.1);
        if (inten > 0.3 && b % 4 === 2) this._hat(next, 0.05);
        if (inten > 0.6 && b % 2 === 1) this._hat(next, 0.03);
        if (b % 2 === 0 && (b !== 14 || inten > 0.3)) {
          const f = root * 2 * Math.pow(2, scale[melody[b] % scale.length] / 12);
          this._pluck(next, f, 0.07);
        }
        if (b % 4 === 0) {
          const f = root / 2 * Math.pow(2, scale[bass[(i >> 2) % 8]] / 12);
          this._pluck(next, f, 0.1, 0.5);
        }
        next += step; i++;
      }
    };
    this._musicTimer = setInterval(tick, 60);
  }
  _pluck(t, f, vol, dur = 0.3) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(2400, t); fl.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + 0.05);
  }
  _kick(t, vol) { this._osc('sine', 130, 45, t, 0.16, vol, this.music); }
  _hat(t, vol) { this._noise(t, 0.04, vol, 'highpass', 7000, 0.7, this.music); }
}
