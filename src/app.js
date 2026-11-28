// ===================================================================== sound: small synthesized effects, no files
const SFX = (() => {
  let ctx = null, master = null, on = true;
  const last = {};
  try { on = localStorage.getItem('dp.sound') !== 'off'; } catch { /* storage blocked */ }
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination); } catch { ctx = null; }
  }
  function tone(f0, f1, dur, type, vol, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, vol, f0, f1, delay = 0) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); f.Q.value = 1.2;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  const S = {
    shot: (v, p) => { tone(760 * p, 260 * p, 0.07, 'square', 0.09 * v); noise(0.05, 0.12 * v, 2400, 900); },
    hit: v => { tone(520, 880, 0.06, 'triangle', 0.18 * v); },
    hurt: v => { tone(300, 120, 0.16, 'sawtooth', 0.13 * v); noise(0.08, 0.15 * v, 900, 300); },
    kill: v => { [660, 880, 1320].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.17 * v, i * 0.06)); },
    down: v => { [520, 390, 260].forEach((f, i) => tone(f, f * 0.95, 0.16, 'triangle', 0.16 * v, i * 0.09)); },
    splash: v => { noise(0.45, 0.3 * v, 1800, 300); },
    jump: (v, p) => { tone(330 * p, 620 * p, 0.12, 'sine', 0.12 * v); },
    dash: v => { noise(0.16, 0.2 * v, 600, 2600); },
    boing: v => { tone(180, 720, 0.28, 'sine', 0.22 * v); },
    tp: v => { tone(300, 1500, 0.3, 'sine', 0.14 * v); tone(450, 1800, 0.3, 'triangle', 0.06 * v, 0.03); },
    pick: v => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.15 * v, i * 0.05)); },
    crate: v => { noise(0.22, 0.32 * v, 500, 120); tone(140, 70, 0.15, 'square', 0.08 * v); },
    bonk: v => { tone(240, 90, 0.2, 'square', 0.15 * v); },
    count: v => { tone(660, 660, 0.12, 'triangle', 0.16 * v); },
    go: v => { tone(990, 990, 0.25, 'triangle', 0.2 * v); },
    sd: v => { tone(220, 200, 0.5, 'sawtooth', 0.12 * v); tone(277, 250, 0.5, 'sawtooth', 0.09 * v, 0.05); },
    win: v => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.16 * v, i * 0.09)); },
    lose: v => { [392, 330, 262].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.15 * v, i * 0.12)); },
    click: v => { tone(800, 600, 0.04, 'triangle', 0.08 * v); },
    lock: v => { tone(880, 880, 0.06, 'square', 0.07 * v); tone(1320, 1320, 0.08, 'square', 0.07 * v, 0.07); },
  };
  return {
    unlock,
    play(name, vol = 1, pitch = 1) {
      if (!on || !ctx || !S[name]) return;
      const now = performance.now(); if (now - (last[name] || 0) < 45) return; last[name] = now;
      try { S[name](vol, pitch); } catch { /* audio not ready */ }
    },
    toggle() { on = !on; try { localStorage.setItem('dp.sound', on ? 'on' : 'off'); } catch { /* */ } return on; },
    get on() { return on; },
  };
})();

// ===================================================================== input: keyboard + mouse, touch sticks, gamepad
const Input = (() => {
  const keys = {};
  const st = { jc: 0, dc: 0, ec: 0, et: 0, qc: 0, seq: 0, mouseL: false, mouseR: false, nx: 0, ny: 0, mouseSeen: false,
    stick: { x: 0, y: 0, id: null }, touchJump: false, touchFire: false, touchCam: null, rDrag: null,
    aim: new THREE.Vector3(0, 1, 0), override: null, overrideT: 0, pad: null, padPrev: {}, enabled: false, quickWanted: false, camDrag: null };
  const inField = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  addEventListener('keydown', e => {
    if (inField(e)) return;
    keys[e.code] = true;
    if (!st.enabled) return;
    if (!e.repeat) {
      if (e.code === 'Space') { st.jc++; if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }
      if (e.code === 'KeyK' || e.code === 'KeyE') st.dc++;
      if (e.code === 'KeyV') { st.ec++; st.et = 1; }
      if (e.code === 'KeyX') { st.ec++; st.et = 2; }
      if (e.code === 'KeyJ') st.quickWanted = true;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; st.mouseL = st.mouseR = false; });
  const canvas = $('#view');
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  let lastTouch = -1e9;
  addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') lastTouch = performance.now(); }, true);
  canvas.addEventListener('mousedown', e => {
    SFX.unlock();
    if (performance.now() - lastTouch < 1000) return;
    if (e.button === 0) st.mouseL = true;
    else if (e.button === 2) { st.mouseR = true; st.rDrag = { x: e.clientX, y: e.clientY, moved: 0, drag: false }; }
    else if (e.button === 1) { st.camDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); }
  });
  addEventListener('mouseup', e => { if (e.button === 0) st.mouseL = false; else if (e.button === 2) { st.mouseR = false; st.rDrag = null; } else if (e.button === 1) st.camDrag = null; });
  addEventListener('mousemove', e => {
    st.nx = e.clientX / innerWidth * 2 - 1; st.ny = -(e.clientY / innerHeight) * 2 + 1; st.mouseSeen = true;
    // right-drag turns the camera (a right-click held still is steady aim)
    const rd = st.rDrag;
    if (rd) { const dx = e.clientX - rd.x, dy = e.clientY - rd.y; rd.moved += Math.abs(dx) + Math.abs(dy); if (rd.moved > 8) rd.drag = true; if (rd.drag) { GFX.cam.manualT = performance.now(); GFX.cam.yaw -= dx * 0.006; GFX.cam.pitch = clamp(GFX.cam.pitch + dy * 0.004, 0.12, 1.2); } rd.x = e.clientX; rd.y = e.clientY; }
    if (st.camDrag) { GFX.cam.manualT = performance.now(); GFX.cam.yaw -= (e.clientX - st.camDrag.x) * 0.006; GFX.cam.pitch = clamp(GFX.cam.pitch + (e.clientY - st.camDrag.y) * 0.004, 0.12, 1.2); st.camDrag.x = e.clientX; st.camDrag.y = e.clientY; }
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); GFX.cam.dist = clamp(GFX.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 3.5, 15); }, { passive: false });
  // touch: the move stick on the left, buttons on the right; drag anywhere else to turn the camera
  const bindStick = (el, knob, S, onEnd) => {
    const move = e => { const r = el.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } S.x = dx / R; S.y = dy / R; if (l > R * 0.3) S.moved = true; knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    el.addEventListener('pointerdown', e => { SFX.unlock(); S.id = e.pointerId; S.t0 = performance.now(); S.moved = false; try { el.setPointerCapture(e.pointerId); } catch { /* the finger still drives the stick */ } move(e); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (e.pointerId === S.id) move(e); });
    const end = e => { if (e.pointerId !== S.id) return; if (onEnd) onEnd(); S.id = null; S.x = S.y = 0; knob.style.transform = ''; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  bindStick($('#stick'), $('#knob'), st.stick);
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' || st.touchCam) return; st.touchCam = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => { const c = st.touchCam; if (!c || c.id !== e.pointerId) return; GFX.cam.manualT = performance.now(); GFX.cam.yaw -= (e.clientX - c.x) * 0.008; GFX.cam.pitch = clamp(GFX.cam.pitch + (e.clientY - c.y) * 0.005, 0.12, 1.2); c.x = e.clientX; c.y = e.clientY; });
  const endCam = e => { if (st.touchCam && st.touchCam.id === e.pointerId) st.touchCam = null; };
  canvas.addEventListener('pointerup', endCam); canvas.addEventListener('pointercancel', endCam);
  const tap = (id, fn, up) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); SFX.unlock(); fn(); }); if (up) { el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); } };
  tap('#bJump', () => { st.jc++; st.touchJump = true; }, () => { st.touchJump = false; });
  tap('#bDash', () => { st.dc++; });
  tap('#bCheer', () => { st.ec++; st.et = 1; });
  tap('#bFlop', () => { st.ec++; st.et = 2; });
  tap('#bShoot', () => { st.touchFire = true; }, () => { st.touchFire = false; });
  tap('#bLock', () => { App.toggleLock(); });
  // gamepad (polled)
  function poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && [...pads].find(p => p && p.connected);
    st.pad = null;
    if (!g) return;
    const dz = v => Math.abs(v) < 0.18 ? 0 : v, b = i => !!(g.buttons[i] && g.buttons[i].pressed), pv = st.padPrev;
    const P = { lx: dz(g.axes[0] || 0), ly: dz(g.axes[1] || 0), rx: dz(g.axes[2] || 0), ry: dz(g.axes[3] || 0), a: b(0), b: b(1), x: b(2), y: b(3), lt: b(6), rt: b(7), start: b(9) };
    if (st.enabled) {
      if (P.a && !pv.a) st.jc++;
      if ((P.b || P.x) && !(pv.b || pv.x)) st.dc++;
      if (P.y && !pv.y) { st.ec++; st.et = 1; }
    }
    if (P.start && !pv.start) App.togglePause();
    st.padPrev = P; st.pad = P;
  }
  function camRel(x, z) { const s = Math.sin(GFX.cam.yaw), c = Math.cos(GFX.cam.yaw); return [x * c + z * s, -x * s + z * c]; }
  function build(me, dt) {
    let x = 0, z = 0;
    if (st.enabled) {
      if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1;
      if (keys.KeyW || keys.ArrowUp) z -= 1; if (keys.KeyS || keys.ArrowDown) z += 1;
      x += st.stick.x; z += st.stick.y;
      if (st.pad) { x += st.pad.lx; z += st.pad.ly; }
      if (keys.KeyZ || keys.KeyC) { GFX.cam.yaw += dt * 1.8 * (keys.KeyZ ? 1 : -1); GFX.cam.manualT = performance.now(); }
    }
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    const [mx, mz] = camRel(x, z);
    let fire = st.enabled && (st.mouseL || false), aimMode = st.enabled && st.mouseR && !(st.rDrag && st.rDrag.drag);
    const A = st.aim;
    if (me) {
      const pad = st.pad;
      if (st.overrideT > 0) { st.overrideT -= dt; A.copy(st.override); }
      else if (st.touchFire && st.enabled) {
        // the shoot button aims for you: the nearest rival in sight, or straight ahead
        if (!App.quickTarget(me, A)) A.set(me.x + Math.sin(me.yaw) * 10, me.y + 1.05, me.z + Math.cos(me.yaw) * 10);
        fire = true;
      } else if (pad && Math.hypot(pad.rx, pad.ry) > 0.3) {
        const [ax, az] = camRel(pad.rx, pad.ry), al = Math.hypot(ax, az) || 1; A.set(me.x + ax / al * 9, me.y + 1.05, me.z + az / al * 9);
        App.assist(A, me);
        fire = st.enabled && (pad.rt || Math.hypot(pad.rx, pad.ry) > 0.85);
      } else if (pad && pad.rt) fire = st.enabled;
      if (pad && pad.lt) aimMode = st.enabled;
    }
    // locked on: every shot aims at that rival, leading where they're running
    let lock = false;
    const L = App.lock, tp = L && me && App.lastView ? App.lastView.players[L.slot] : null;
    if (tp && tp.alive && !tp.out && st.enabled) {
      // lead where they're running (a dash is too short to lead, so cap it at running speed)
      const d = Math.hypot(tp.x - me.x, tp.z - me.z), lead = d / BULLET_V, sp = Math.hypot(tp.vx, tp.vz), k = sp > RUN ? RUN / sp : 1;
      A.set(tp.x + tp.vx * k * lead, tp.y + 1.0, tp.z + tp.vz * k * lead); lock = true; st.overrideT = 0;
      if (st.touchFire) fire = true;
    }
    if (st.quickWanted) { st.quickWanted = false; if (!lock && me && App.quickTarget(me, A)) { st.override = A.clone(); st.overrideT = 0.35; } st.qc++; }
    return {
      mx, mz, walk: !!(st.enabled && (keys.ShiftLeft || keys.ShiftRight)), aim: !!aimMode, lock, fire: !!fire,
      jh: !!(st.enabled && (keys.Space || st.touchJump || (st.pad && st.pad.a))),
      ax: A.x, ay: A.y, az: A.z, jc: st.jc, dc: st.dc, ec: st.ec, et: st.et, qc: st.qc, seq: ++st.seq,
    };
  }
  function updateMouseAim(me, view) { if (!App.lock && st.mouseSeen && !TOUCH && st.overrideT <= 0 && !st.touchFire && !(st.pad && Math.hypot(st.pad.rx, st.pad.ry) > 0.3)) GFX.aimAt(st.nx, st.ny, me, view, st.aim); }
  return { st, keys, build, poll, updateMouseAim, set enabled(v) { st.enabled = v; if (!v) { st.mouseL = st.mouseR = false; } }, get enabled() { return st.enabled; } };
})();

// ===================================================================== HUD and screens
const HUD = (() => {
  const board = $('#board'), rows = [];
  for (let i = 0; i < 4; i++) {
    const r = document.createElement('div'); r.className = 'row';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = COLORS[i].hex;
    const name = document.createElement('span'); name.className = 'nm';
    const lives = document.createElement('span'); lives.className = 'lives';
    const k = document.createElement('span'); k.className = 'k';
    r.append(dot, name, lives, k); board.appendChild(r); rows.push({ r, name, lives, k, key: '' });
  }
  const hpRow = document.createElement('div'); hpRow.className = 'hp';
  const hpBar = document.createElement('i'), hpShield = document.createElement('b'), hpTxt = document.createElement('span');
  hpRow.append(hpBar, hpShield, hpTxt); board.appendChild(hpRow);
  let hpKey = '';
  // the minimap: the whole page, turned so that up is where the camera looks
  const mm = $('#minimap'), mg = mm.getContext('2d');
  let mmT = 0;
  const KIND_FILL = { tower: '#ffffff', notebook: '#ffffff', cup: '#b9dbf8', book: '#9fc1f5', bridge: '#ffe680', eraser: '#f7a8bb', pbox: '#7fa6ef', book2: '#b5ea9f', book3: '#ffc7a8', pad: '#f7a8bb' };
  function drawMap(v) {
    const W = mm.width, S = W / (HALF * 2 + 6), c = W / 2, cs = Math.cos(GFX.cam.yaw), sn = Math.sin(GFX.cam.yaw);
    const P = (x, z) => [c + (x * cs - z * sn) * S, c + (x * sn + z * cs) * S];
    const poly = (b, fill) => { const pts = [P(b.minX, b.minZ), P(b.maxX, b.minZ), P(b.maxX, b.maxZ), P(b.minX, b.maxZ)]; mg.beginPath(); pts.forEach(([x, y], i) => i ? mg.lineTo(x, y) : mg.moveTo(x, y)); mg.closePath(); mg.fillStyle = fill; mg.fill(); mg.stroke(); };
    mg.clearRect(0, 0, W, W); mg.lineWidth = 2; mg.strokeStyle = '#1e1d2b';
    poly({ minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF }, '#fbf8ee');
    mg.lineWidth = 1.5;
    for (const b of MAP.boxes) if (KIND_FILL[b.kind]) poly(b, KIND_FILL[b.kind]);
    for (const l of MAP.lifts) poly(l, '#ffe45c');
    MAP.crates.forEach((b, i) => { if (!v.crates || v.crates[i]) poly(b, '#c98b4b'); });
    for (const t of MAP.tps) { const [x, y] = P(t.x, t.z); mg.fillStyle = TP_COLOR(t); mg.beginPath(); mg.arc(x, y, 5, 0, TAU); mg.fill(); }
    (v.spawners || []).forEach((k, i) => { if (!k) return; const S2 = MAP.spawners[i], [x, y] = P(S2.x, S2.z); mg.fillStyle = ({ h: '#ff6b81', s: '#5b8def', b: '#6fd3ff', t: '#ffc23d', p: '#ff8a1f' })[k]; mg.beginPath(); mg.arc(x, y, 5, 0, TAU); mg.fill(); mg.stroke(); });
    if (v.sd) { const [x, y] = P(0, 0); mg.strokeStyle = 'rgba(160, 40, 120, 0.9)'; mg.lineWidth = 3; mg.beginPath(); mg.arc(x, y, Math.min(v.zone, 60) * S, 0, TAU); mg.stroke(); mg.strokeStyle = '#1e1d2b'; }
    mg.lineWidth = 2.5;
    for (const p of v.players) {
      if (!p.alive || p.out) continue;
      const [x, y] = P(p.x, p.z), me = p.slot === v.localSlot;
      mg.fillStyle = COLORS[p.slot].hex; mg.beginPath(); mg.arc(x, y, me ? 9 : 7, 0, TAU); mg.fill(); mg.stroke();
      if (me) { const [fx, fy] = P(p.x + Math.sin(p.yaw) * 4, p.z + Math.cos(p.yaw) * 4); mg.beginPath(); mg.moveTo(x, y); mg.lineTo(fx, fy); mg.stroke(); }
    }
  }
  const lockChip = $('#lockChip');
  const timer = $('#timer'), feedEl = $('#feed'), noteEl = $('#note'), bigEl = $('#big'), powerEl = $('#power'), specEl = $('#spec'), flashEl = $('#flash');
  let view = null, noteT = 0, bigT = 0, lastCount = -1;
  const nameOf = s => view && view.players[s] ? view.players[s].name : 'Someone';
  function update(v, dt) {
    view = v;
    const local = v.localSlot;
    if ((mmT -= dt) <= 0) { mmT = 1 / 15; drawMap(v); }
    v.players.forEach((p, i) => {
      const R = rows[i], key = `${p.name}|${p.bot}|${p.lives}|${p.kills}|${p.out}|${i === local}|${v.practice}|${p.score}`;
      R.r.hidden = false;
      if (key === R.key) return; R.key = key;
      R.name.textContent = p.name + (i === local ? ' (you)' : '');
      if (p.bot) { const t = document.createElement('small'); t.textContent = ' bot'; R.name.appendChild(t); }
      R.lives.textContent = v.practice ? '' : '♥'.repeat(Math.max(0, p.lives)) + '♡'.repeat(Math.max(0, LIVES - p.lives));
      R.k.textContent = v.practice ? `${p.score} pts` : `${p.kills} KO`;
      R.r.classList.toggle('me', i === local); R.r.classList.toggle('out', !!p.out);
    });
    for (let i = v.players.length; i < 4; i++) rows[i].r.hidden = true;
    const mine = v.players[local];
    hpRow.hidden = !mine || !mine.alive;
    if (mine && mine.alive) {
      const key = `${Math.ceil(mine.hp)}|${Math.ceil(mine.shield)}`;
      if (key !== hpKey) { hpKey = key; const f = clamp(mine.hp / MAXHP, 0, 1); hpBar.style.width = `${f * 100}%`; hpBar.style.background = f > 0.5 ? '#3bc45c' : f > 0.25 ? '#ffc23d' : '#ff4d5e'; hpShield.style.width = `${clamp(mine.shield / 50, 0, 1) * 100}%`; hpTxt.textContent = mine.shield > 0 ? `${Math.ceil(mine.hp)} + ${Math.ceil(mine.shield)} shield` : `${Math.ceil(mine.hp)} health`; }
    }
    // clock
    let txt;
    if (v.practice) txt = 'Practice';
    else if (v.state === 'lobby') txt = 'Warm-up';
    else if (v.state === 'countdown') txt = '3:00';
    else { const left = Math.max(0, END_T - v.t), m = Math.floor(left / 60), s = Math.floor(left % 60); txt = `${m}:${String(s).padStart(2, '0')}`; }
    if (timer.textContent !== txt) timer.textContent = txt;
    timer.classList.toggle('sd', !!v.sd);
    // the big countdown
    if (v.state === 'countdown') { const n = Math.ceil(-v.t); if (n !== lastCount && n > 0) { lastCount = n; big(String(n), 0.9); SFX.play('count'); } }
    else lastCount = -1;
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) bigEl.hidden = true; }
    if (noteT > 0) { noteT -= dt; if (noteT <= 0) noteEl.hidden = true; }
    // your power-up and respawn timer
    const me = v.players[local];
    if (me && me.pw && me.alive) { powerEl.hidden = false; const t = `${POWERS[me.pw].name} ${Math.ceil(me.pwT)}s`; if (powerEl.textContent !== t) powerEl.textContent = t; powerEl.style.borderColor = ({ s: '#5b8def', t: '#e0a800', p: '#ff7b00' })[me.pw]; }
    else if (me && me.shield > 0 && me.alive) { powerEl.hidden = false; const t = `Bubble shield ${Math.ceil(me.shield)}`; if (powerEl.textContent !== t) powerEl.textContent = t; powerEl.style.borderColor = '#3aa6d9'; }
    else if (me && !me.alive && !me.out && v.state === 'playing') { powerEl.hidden = false; const t = `Back in ${Math.max(1, Math.ceil(me.respawnT))}…`; if (powerEl.textContent !== t) powerEl.textContent = t; powerEl.style.borderColor = '#1e1d2b'; }
    else powerEl.hidden = true;
    // locked on
    const L = App.lock, lp = L ? v.players[L.slot] : null;
    lockChip.hidden = !lp;
    if (lp) { const t = TOUCH ? `Locked on ${lp.name}` : `Locked on ${lp.name} · Q lets go`; if (lockChip.textContent !== t) lockChip.textContent = t; lockChip.style.borderColor = COLORS[L.slot].hex; }
    $('#bLock').classList.toggle('on', !!lp);
    // spectating
    const spec = v.spectating;
    specEl.hidden = !spec;
    if (spec) { const t = `Spectating ${nameOf(spec)}`; if ($('#specName').textContent !== t) $('#specName').textContent = t; }
    // the feed
    for (const el of [...feedEl.children]) { el._t -= dt; if (el._t <= 0) el.remove(); else if (el._t < 0.6) el.style.opacity = el._t / 0.6; }
  }
  function feed(v, by, cause) {
    const row = document.createElement('div'); row.className = 'f'; row._t = 5;
    const vn = document.createElement('b'); vn.textContent = nameOf(v); vn.style.color = COLORS[v].hex;
    if (by >= 0) { const kn = document.createElement('b'); kn.textContent = nameOf(by); kn.style.color = COLORS[by].hex; row.append(kn, document.createTextNode(cause === 1 ? ' pushed ' : cause === 2 ? ' bonked ' : ' erased '), vn, document.createTextNode(cause === 1 ? ' off the page' : '')); }
    else row.append(vn, document.createTextNode(cause === 1 ? ' fell off the page' : cause === 2 ? ' got bonked by the pencil' : cause === 3 ? ' got inked by the zone' : ' was erased'));
    feedEl.prepend(row); while (feedEl.children.length > 5) feedEl.lastChild.remove();
  }
  function note(text, t = 1.6) { noteEl.textContent = text; noteEl.hidden = false; noteT = t; }
  function big(text, t = 1) { bigEl.textContent = text; bigEl.hidden = false; bigT = t; bigEl.classList.remove('pop'); void bigEl.offsetWidth; bigEl.classList.add('pop'); }
  function flash() { if (REDUCED) return; flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); }
  function onEvent(e, v) {
    const [, type] = e, a = e.slice(2), local = v.localSlot;
    if (type === 'hit') { const [vv, by] = a; if (vv === local && by >= 0 && by !== local) App.lockOn(by); else if (by === local && vv !== local) App.lockOn(vv); }
    if (type === 'spawn' && a[0] === local && v.state === 'playing') App.reorient = true;
    if (type === 'go') { big('GO!', 0.8); SFX.play('go'); }
    else if (type === 'sd') { big('Sudden death!', 1.6); note('The ink is closing in. Get to the middle!', 3); SFX.play('sd'); }
    else if (type === 'kill') {
      const [vv, by] = a;
      if (by === local && vv !== local) note(`You erased ${nameOf(vv)}!`, 1.4);
      else if (vv === local) note(by >= 0 ? `Erased by ${nameOf(by)}` : 'Oops! Erased.', 1.8);
    } else if (type === 'out') {
      const [s, place] = a;
      if (s === local) { big('Out!', 1.2); note(`You finished ${['', '1st', '2nd', '3rd', '4th'][place]}. Now spectating.`, 3); }
      else note(`${nameOf(s)} is out!`, 1.5);
    } else if (type === 'end') { const w = a[0]; big(w === local ? 'You win!' : `${nameOf(w)} wins!`, 2); SFX.play(w === local ? 'win' : 'lose'); }
  }
  return { update, feed, note, big, flash, onEvent, clearFeed() { feedEl.textContent = ''; } };
})();

// ===================================================================== networking: one host is the authority, everyone else sends input
const INTERP = 0.12;
const encInput = i => [i.seq, Math.round(i.mx * 100), Math.round(i.mz * 100), (i.walk ? 1 : 0) | (i.aim ? 2 : 0) | (i.fire ? 4 : 0) | (i.jh ? 8 : 0) | (i.lock ? 16 : 0), Math.round(i.ax * 10), Math.round(i.ay * 10), Math.round(i.az * 10), i.jc, i.dc, i.ec, i.et, i.qc];
const decInput = a => {
  if (!Array.isArray(a)) return IDLE;
  const n = k => num(a[k]);
  return { seq: n(0) | 0, mx: clamp(n(1) / 100, -1, 1), mz: clamp(n(2) / 100, -1, 1), walk: !!(n(3) & 1), aim: !!(n(3) & 2), fire: !!(n(3) & 4), jh: !!(n(3) & 8), lock: !!(n(3) & 16), ax: n(4) / 10, ay: n(5) / 10, az: n(6) / 10, jc: n(7) | 0, dc: n(8) | 0, ec: n(9) | 0, et: clamp(n(10) | 0, 0, 2), qc: n(11) | 0 };
};
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const newCode = () => Array.from({ length: 4 }, () => CODE_ABC[(Math.random() * CODE_ABC.length) | 0]).join('');
const decodePlayers = s => (s.p || []).map((a, i) => {
  const r = (s.ro || [])[i] || [];
  const f = num(a[9]) | 0;
  return { slot: i, name: cleanName(r[0]) || 'Doodler', bot: !!r[1], peer: typeof r[2] === 'string' ? r[2] : '', x: num(a[0]), y: num(a[1]), z: num(a[2]), vx: num(a[3]), vy: num(a[4]), vz: num(a[5]), yaw: num(a[6]), hp: num(a[7]), lives: num(a[8]),
    alive: !!(f & 1), ground: !!(f & 2), out: !!(f & 4), dash: !!(f & 8), stun: !!(f & 16), aim: !!(f & 32), inv: !!(f & 64), emote: f & 128 ? 1 : f & 256 ? 2 : 0, aiming: !!(f & 1024),
    pw: PW_CODES[num(a[10]) | 0] || '', pwT: num(a[11]), shield: num(a[12]), kills: num(a[13]) | 0, score: num(a[14]) | 0, ack: num(a[15]) | 0, ax: num(a[16]), ay: num(a[17]), az: num(a[18]), respawnT: num(a[19]), place: num(a[20]) | 0, dmg: num(a[21]) | 0, emoteT: num(a[22]), stunT: num(a[23]), dashCd: num(a[24]), airJumps: num(a[25], 1) };
});

class Net {
  constructor(room) {
    this.room = room; this.r = null; this.role = ''; this.code = ''; this.pub = false; this.myPeer = null; this.j = Date.now();
    this.seats = [null, null, null, null]; this.hostPeer = null; this.noHostSince = 0; this.hadHost = false;
    this.lastSnap = null; this.lastSnapK = -1; this.lastEv = 0; this.evWindow = []; this.snapTick = 0; this.snaps = []; this.offset = null;
    this.pred = null; this.hist = []; this.vOff = new THREE.Vector3(); this.lobbyT = 0; this.joinedAt = performance.now(); this.connected = true; this.discT = 0;
    this.fireCd = 0; this.adT = 0; this.waitHost = 0; this.unsub = [];
  }
  async open(code, asHost, pub) {
    this.code = code; this.pub = pub;
    this.r = await this.room.join('dra-' + code.toLowerCase());
    this.unsub.push(this.r.onPeers(ch => this.onPeers(ch), e => this.lost(e)));
    this.unsub.push(this.r.onConnection(c => { this.connected = c; }, () => {}));
    await this.r.presence({ nm: App.name, j: this.j, ...(asHost ? { host: 1, pub: pub ? 1 : 0 } : {}) });
    if (asHost) this.becomeHost(null); else { this.role = 'client'; this.waitHost = performance.now(); }
  }
  meIn(peers) { const m = peers.find(p => p.sameTab); if (m) this.myPeer = m.peer; return this.myPeer; }
  humans() { return this.r.peers().filter(p => p.kind === 'viewer' && p.presence && typeof p.presence.j === 'number'); }
  onPeers(ch) {
    this.meIn(ch.peers);
    const hosts = ch.peers.filter(p => !p.sameTab && p.presence && p.presence.host === 1).sort((a, b) => num(a.presence.j) - num(b.presence.j) || (a.peer < b.peer ? -1 : 1));
    if (this.role === 'host') {
      // two hosts in one room (rare race): the earlier one keeps it
      if (hosts.length && num(hosts[0].presence.j) < this.j) { this.role = 'client'; this.r.presence({ host: null, snap: null }); App.toClient(); }
      else this.assignSeats();
      return;
    }
    const host = hosts[0];
    if (host) {
      if (this.hostPeer && this.hostPeer !== host.peer) { this.lastEv = 0; this.offset = null; this.snaps = []; }
      this.hostPeer = host.peer; this.hadHost = true; this.noHostSince = 0;
      const s = host.presence.snap;
      if (s && typeof s === 'object' && s !== this.lastSnapObj) { this.lastSnapObj = s; this.onSnap(s); }
    } else if (!this.noHostSince) this.noHostSince = performance.now();
  }
  checkHost() {
    if (this.role !== 'client') return;
    if (this.noHostSince && performance.now() - this.noHostSince > 2000) {
      if (!this.hadHost) { if (performance.now() - this.waitHost > 6000) App.netError(`No room with code ${this.code} is open right now.`); return; }
      // the host left: the earliest remaining player takes over from the last snapshot
      const cand = this.humans().sort((a, b) => num(a.presence.j) - num(b.presence.j) || (a.peer < b.peer ? -1 : 1))[0];
      if (cand && cand.sameTab) { this.becomeHost(this.lastSnap); HUD.note('The host left. You are hosting now.', 2.5); }
    }
  }
  becomeHost(snap) {
    this.role = 'host';
    this.r.presence({ host: 1, pub: this.pub ? 1 : 0 });
    if (snap) {
      const ps = decodePlayers(snap);
      const roster = ps.map(p => ({ name: p.name, bot: true, diff: (snap.ro[p.slot] || [])[3] || 'normal' }));
      App.match = Match.fromSnapshot(snap, roster);
      App.match.evId = Math.max(1, ...((snap.ev || []).map(e => num(e[0])))) + 1000;
      this.seats = [null, null, null, null];
      ps.forEach(p => { if (p.peer) this.seats[p.slot] = { peer: p.peer }; });
      App.match.players.forEach((p, i) => { if (this.seats[i]) { p.bot = false; p.peer = this.seats[i].peer; } });
    } else {
      App.match = new Match({ mode: 'ffa', lobby: true, roster: [{ name: App.name }, ...botRoster(3, App.diff, App.name)] });
      this.seats = [{ peer: 'me' }, null, null, null];
      this.lobbyT = this.pub ? 15 : 0;
    }
    App.toHost();
    this.assignSeats();
  }
  assignSeats() {
    const m = App.match; if (!m || !this.r) return;
    const me = this.myPeer;
    this.seats.forEach(s => { if (s && s.peer === 'me' && me) s.peer = me; });
    const humans = this.humans(), present = new Set(humans.map(h => h.peer));
    let changed = false;
    this.seats.forEach((s, i) => {
      if (!s || s.peer === me || s.peer === 'me' || present.has(s.peer)) return;
      const p = m.players[i]; p.bot = true; p.peer = ''; p.name = BOT_NAMES[(i * 3 + m.tick) % BOT_NAMES.length]; p.brain = null; this.seats[i] = null; changed = true;
      HUD.note('A player left. A bot took their seat.', 2);
    });
    for (const h of humans.sort((a, b) => num(a.presence.j) - num(b.presence.j))) {
      if (h.sameTab || this.seats.some(s => s && s.peer === h.peer)) continue;
      let slot = -1;
      for (let i = 0; i < 4; i++) { if (this.seats[i]) continue; const p = m.players[i]; if (m.state === 'lobby' || m.state === 'ended' || !p.out) { slot = i; break; } }
      if (slot < 0) continue; // the match is full: they watch
      const p = m.players[slot], inp = decInput(h.presence.in);
      this.seats[slot] = { peer: h.peer }; p.bot = false; p.peer = h.peer; p.brain = null;
      p.ljc = inp.jc; p.ldc = inp.dc; p.lec = inp.ec; p.lqc = inp.qc;
      changed = true;
      if (this.pub && m.state === 'lobby') this.lobbyT = Math.max(this.lobbyT, 8);
    }
    // keep names in step with what people typed
    this.seats.forEach((s, i) => { if (!s) return; const h = humans.find(x => x.peer === s.peer) || (s.peer === me ? { presence: { nm: App.name } } : null); if (h) { const nm = cleanName(h.presence.nm) || 'Doodler'; if (m.players[i].name !== nm) { m.players[i].name = nm; changed = true; } } });
    if (changed) App.refreshLobby();
  }
  hostInputs() {
    const m = App.match, peers = this.r.peers();
    this.seats.forEach((s, i) => {
      if (!s || s.peer === this.myPeer || s.peer === 'me') return;
      const h = peers.find(p => p.peer === s.peer);
      m.setInput(i, h ? decInput(h.presence.in) : IDLE);
    });
  }
  hostTick(events) {
    for (const e of events) this.evWindow.push(e);
    if (this.evWindow.length > 90) this.evWindow.splice(0, this.evWindow.length - 90);
    const m = App.match;
    if (m.state === 'lobby' && this.pub && this.lobbyT > 0) { this.lobbyT -= DT; const hum = this.seats.filter(Boolean).length; if (this.lobbyT <= 0 || hum >= 4) { this.lobbyT = 0; App.startMatch(); } }
    if (++this.snapTick % 3) return;
    const snap = m.snapshot({ lob: { pub: this.pub ? 1 : 0, cd: Math.ceil(this.lobbyT), code: this.code } });
    let ev = this.evWindow.slice(-60);
    snap.ev = ev;
    let txt = JSON.stringify(snap);
    while (txt.length > 3500 && ev.length) { ev = ev.slice(Math.ceil(ev.length / 4)); snap.ev = ev; txt = JSON.stringify(snap); }
    this.lastSnap = snap;
    this.r.presence({ snap }).catch(() => {});
    if ((this.adT -= DT * 3) <= 0) { this.adT = 2; this.advertise(); }
  }
  advertise() {
    if (!this.pub || this.role !== 'host') return;
    const m = App.match, h = this.seats.filter(Boolean).length;
    this.room.presence({ ad: { c: this.code, h, s: m.state === 'lobby' ? 'l' : m.state === 'ended' ? 'e' : 'p', v: 1 } }).catch(() => {});
  }
  onSnap(s) {
    if (num(s.v) !== 1 || !Array.isArray(s.p)) return;
    const k = num(s.k), t = num(s.t), now = performance.now() / 1000;
    if (this.lastSnap && t < num(this.lastSnap.t) - 0.5) { this.offset = null; this.snaps = []; }
    if (this.lastSnap && k <= this.lastSnapK && t >= num(this.lastSnap.t)) return;
    this.lastSnapK = k; this.lastSnap = s;
    const sample = t - now;
    if (this.offset === null || sample > this.offset) this.offset = sample; else this.offset += (sample - this.offset) * 0.03;
    const players = decodePlayers(s);
    this.snaps.push({ t, players });
    if (this.snaps.length > 30) this.snaps.shift();
    const mySlot = players.findIndex(p => p.peer && p.peer === this.myPeer);
    App.localSlot = mySlot;
    App.client = { state: ['lobby', 'countdown', 'playing', 'ended'][s.st] || 'lobby', t, sd: !!s.sd, practice: !!s.m, crates: MAP.crates.map((_, i) => !!(num(s.cr) & (1 << i))), spawners: String(s.sp || '').split('').map(c => c === '.' || !POWERS[c] ? '' : c),
      drops: Array.isArray(s.dr) ? s.dr.map(d => ({ id: num(d[0]), x: num(d[1]), z: num(d[2]) })) : [], targets: MAP.targets.map((_, i) => !!(num(s.tg) & (1 << i))), ranking: Array.isArray(s.rk) ? s.rk.map(x => num(x)) : [], players, lob: s.lob || {} };
    // events since the last snapshot
    const evs = Array.isArray(s.ev) ? s.ev : [];
    const view = App.lastView;
    for (const e of evs) {
      if (!Array.isArray(e) || num(e[0]) <= this.lastEv) continue;
      this.lastEv = num(e[0]);
      if (typeof e[1] !== 'string') continue;
      // your own jumps, flips, dashes, pads and teleports already played when you pressed the button
      if (mySlot >= 0 && (['jump', 'jump2', 'land', 'dash'].includes(e[1]) && e[2] === mySlot || e[1] === 'boing' && e[3] === mySlot || e[1] === 'tp' && e[4] === mySlot)) continue;
      if (e[1] === 'reset') { GFX.clearShots(); HUD.clearFeed(); App.resultsShown = false; App.hideResults(); }
      if (view) { GFX.onEvent(e, view, t); HUD.onEvent(e, view); }
    }
    // reconcile your predicted doodle with the host's
    if (mySlot >= 0) {
      const sv = players[mySlot];
      if (!this.pred || this.pred.slot !== mySlot) { this.pred = newPlayer(mySlot, { name: sv.name }); this.hist = []; this.adopt(sv, true); }
      else this.adopt(sv, false);
    } else this.pred = null;
    App.onClientSnap();
  }
  adopt(sv, hard) {
    const P = this.pred;
    const wasAlive = P.alive;
    Object.assign(P, { hp: sv.hp, lives: sv.lives, out: sv.out, shield: sv.shield, pw: sv.pw, pwT: sv.pwT, kills: sv.kills, score: sv.score, inv: sv.inv ? Math.max(P.inv, 0.1) : 0, name: sv.name });
    if (sv.stun) P.stunT = Math.max(P.stunT, Math.min(0.2, sv.stunT));
    if (!sv.alive) { P.alive = false; Object.assign(P, { x: sv.x, y: sv.y, z: sv.z, vx: 0, vy: 0, vz: 0, respawnT: sv.respawnT }); this.hist = []; return; }
    if (hard || !wasAlive) { P.alive = true; Object.assign(P, { x: sv.x, y: sv.y, z: sv.z, vx: sv.vx, vy: sv.vy, vz: sv.vz, yaw: sv.yaw, ground: sv.ground, airJumps: sv.airJumps }); this.hist = []; this.vOff.set(0, 0, 0); return; }
    const h = this.hist.find(e => e.seq === sv.ack);
    if (!h) return;
    const dx = sv.x - h.x, dy = sv.y - h.y, dz = sv.z - h.z, d = Math.hypot(dx, dy, dz);
    if (d > 2.5) { Object.assign(P, { x: sv.x, y: sv.y, z: sv.z, vx: sv.vx, vy: sv.vy, vz: sv.vz }); this.hist = []; this.vOff.set(0, 0, 0); return; }
    if (d > 0.02) {
      P.x += dx; P.y += dy; P.z += dz; this.vOff.x -= dx; this.vOff.y -= dy; this.vOff.z -= dz;
      for (const e of this.hist) if (e.seq > sv.ack) { e.x += dx; e.y += dy; e.z += dz; }
    }
    const dvx = sv.vx - h.vx, dvz = sv.vz - h.vz;
    if (Math.hypot(dvx, dvz) > 0.6) { P.vx += dvx; P.vz += dvz; for (const e of this.hist) if (e.seq > sv.ack) { e.vx += dvx; e.vz += dvz; } }
    this.hist = this.hist.filter(e => e.seq >= sv.ack);
  }
  est() { return performance.now() / 1000 + (this.offset ?? 0); }
  // one client tick: predict your doodle with your own input, then send the input to the host
  clientTick(inp, W) {
    const P = this.pred;
    if (P && P.alive && App.client && App.client.state !== 'ended') {
      const st = App.client.state;
      const e = { ...inp, jumpE: inp.jc !== P.ljc, dashE: inp.dc !== P.ldc };
      P.ljc = inp.jc; P.ldc = inp.dc;
      if (st === 'countdown') { e.mx = e.mz = 0; e.dashE = false; }
      if (inp.ec !== P.lec) { P.lec = inp.ec; if (P.ground && !P.emote) { P.emote = inp.et; P.emoteT = inp.et === 1 ? 1.6 : 1.5; } }
      // the shot itself is the host's; here only the facing, the recoil and the arm kick, so it feels instant
      if (this.fireCd > 0) this.fireCd -= DT;
      if ((inp.fire || inp.qc !== P.lqc) && this.fireCd <= 0 && st !== 'countdown' && P.emote !== 2) {
        const dx0 = inp.ax - P.x, dz0 = inp.az - P.z, l = Math.hypot(dx0, inp.ay - P.y - 1.1, dz0) || 1;
        const rk = inp.aim ? 0.8 : 1.8; P.vx -= dx0 / l * rk; P.vz -= dz0 / l * rk; P.aimT = 0.6;
        this.fireCd = P.pw === 't' ? 0.26 : FIRE_EVERY; const r = GFX.rigs()[P.slot]; if (r) r.kick = 1;
      }
      P.lqc = inp.qc;
      const fx = (type, ...a) => { if (App.lastView) GFX.onEvent([0, type, ...a], App.lastView, 0); };
      stepPlayer(P, e, W, fx);
      this.hist.push({ seq: inp.seq, x: P.x, y: P.y, z: P.z, vx: P.vx, vy: P.vy, vz: P.vz });
      if (this.hist.length > 240) this.hist.shift();
    }
    this.r.presence({ in: encInput(inp) }).catch(() => {});
  }
  // remote doodles are shown a little in the past, smoothly between two snapshots
  interpPlayers(rt) {
    const S = this.snaps; if (!S.length) return [];
    let a = S[S.length - 1], b = a;
    for (let i = S.length - 1; i > 0; i--) { if (S[i - 1].t <= rt) { a = S[i - 1]; b = S[i]; break; } }
    if (rt < S[0].t) { a = b = S[0]; }
    const f = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
    return b.players.map((pb, i) => {
      const pa = a.players[i] || pb;
      if (!pa.alive || !pb.alive || Math.hypot(pa.x - pb.x, pa.z - pb.z) > 3) return { ...pb };
      return { ...pb, x: lerp(pa.x, pb.x, f), y: lerp(pa.y, pb.y, f), z: lerp(pa.z, pb.z, f), vx: lerp(pa.vx, pb.vx, f), vz: lerp(pa.vz, pb.vz, f), vy: lerp(pa.vy, pb.vy, f), yaw: pa.yaw + angDiff(pa.yaw, pb.yaw) * f, ax: lerp(pa.ax, pb.ax, f), ay: lerp(pa.ay, pb.ay, f), az: lerp(pa.az, pb.az, f) };
    });
  }
  lost() { if (App.net === this) App.netError('Lost the connection to the room.'); }
  async leave() {
    for (const u of this.unsub) try { u(); } catch { /* */ }
    this.unsub = [];
    if (this.pub) this.room.presence({ ad: null }).catch(() => {});
    if (this.r) { const r = this.r; this.r = null; try { await r.leave(); } catch { /* */ } }
  }
}
function botRoster(n, diff, avoid) {
  const names = BOT_NAMES.filter(x => x !== avoid).sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => ({ name: names[i], bot: true, diff }));
}

// ===================================================================== the app: menus, modes and the main loop
const App = {
  mode: 'menu', match: null, net: null, room: null, localSlot: 0, acc: 0, paused: false, diff: 'normal', name: 'Doodler',
  lastView: null, client: null, resultsShown: false, endT: 0, prev: [], specSlot: -1, roomReady: false, W: new World(),
  assist(A, me) {
    // touch and gamepad aiming snaps to a rival close to where you point
    const v = this.lastView; if (!v) return;
    const dx = A.x - me.x, dz = A.z - me.z, da = Math.atan2(dx, dz);
    let best = null, bd = 0.42;
    for (const p of v.players) {
      if (p.slot === v.localSlot || !p.alive || p.out) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z); if (d > 20) continue;
      const off = Math.abs(angDiff(da, Math.atan2(p.x - me.x, p.z - me.z)));
      if (off < bd && !segBlocked(this.W, me.x, me.y + 1.1, me.z, p.x, p.y + 1, p.z)) { bd = off; best = p; }
    }
    if (best) A.set(best.x + best.vx * 0.12, best.y + 1, best.z + best.vz * 0.12);
  },
  quickTarget(me, A) {
    const v = this.lastView; if (!v) return false;
    let best = null, bd = 20;
    for (const p of v.players) { if (p.slot === v.localSlot || !p.alive || p.out) continue; const d = Math.hypot(p.x - me.x, p.z - me.z); if (d < bd && !segBlocked(this.W, me.x, me.y + 1.1, me.z, p.x, p.y + 1, p.z)) { bd = d; best = p; } }
    if (v.practice) MAP.targets.forEach((T, i) => { if (v.targets && v.targets[i]) return; const d = Math.hypot(T.x - me.x, T.z - me.z); if (d < bd) { bd = d; best = { x: T.x, y: T.y + 0.35, z: T.z, vx: 0, vz: 0 }; } });
    if (!best) return false;
    const lead = bd / BULLET_V; A.set(best.x + (best.vx || 0) * lead, best.y + 1, best.z + (best.vz || 0) * lead);
    return true;
  },
  // ---- lock-on: a rival who hits you, or whom you hit, gets locked (Q or the lock button to lock or let go yourself)
  lock: null,
  lockOn(slot, manual) {
    const v = this.lastView; if (!v || slot < 0 || slot === v.localSlot) return;
    if (!manual && this.letGo && this.letGo.slot === slot && performance.now() - this.letGo.at < 3000) return; // you just let go of them
    const p = v.players[slot], me = v.players[v.localSlot]; if (!p || !p.alive || p.out || !me || !me.alive) return;
    if (this.lock && this.lock.slot === slot) { this.lock.t = 8; return; }
    this.lock = { slot, t: 8, unseen: 0 }; SFX.play('lock');
  },
  unlock() { this.lock = null; },
  toggleLock() {
    if (this.lock) { this.letGo = { slot: this.lock.slot, at: performance.now() }; this.unlock(); return; }
    const v = this.lastView, me = v && v.players[v.localSlot]; if (!me || !me.alive) return;
    let best = -1, bd = 32;
    for (const p of v.players) { if (p.slot === v.localSlot || !p.alive || p.out) continue; const d = Math.hypot(p.x - me.x, p.z - me.z); if (d < bd && !segBlocked(this.W, me.x, me.y + 1.1, me.z, p.x, p.y + 1, p.z)) { bd = d; best = p.slot; } }
    if (best >= 0) this.lockOn(best, true); else HUD.note('No rival in sight to lock on to.', 1.2);
  },
  updateLock(dt) {
    const L = this.lock; if (!L) return;
    const v = this.lastView, me = v && v.players[v.localSlot], p = v && v.players[L.slot];
    if (!me || !me.alive || !p || !p.alive || p.out || v.state === 'ended' || v.state === 'lobby') { this.unlock(); return; }
    const vis = !segBlocked(this.W, me.x, me.y + 1.1, me.z, p.x, p.y + 1, p.z);
    L.unseen = vis ? 0 : L.unseen + dt;
    if (vis && (Input.st.mouseL || Input.st.touchFire)) L.t = Math.max(L.t, 4); // still shooting at them: keep the lock
    L.t -= dt;
    if (L.t <= 0 || L.unseen > 2.5 || Math.hypot(p.x - me.x, p.z - me.z) > 42) this.unlock();
  },
  // ---- starting things
  startOffline() { this.leaveAll(); this.mode = 'offline'; this.match = new Match({ mode: 'ffa', roster: [{ name: this.name }, ...botRoster(3, this.diff, this.name)] }); this.localSlot = 0; this.enterGame(); },
  startPractice() { this.leaveAll(); this.mode = 'practice'; this.match = new Match({ mode: 'practice', roster: [{ name: this.name }] }); this.localSlot = 0; this.enterGame(); HUD.note('Shoot the bullseyes, try the pads, teleporters and lifts.', 3); },
  async online(kind, code) {
    if (!this.room) return;
    this.leaveAll();
    const net = this.net = new Net(this.room);
    this.mode = 'online';
    show('connecting');
    try {
      if (kind === 'quick') {
        // matchmaking: an open public room with a free seat, else a new one
        const ads = this.room.peers().filter(p => !p.sameTab && p.presence && p.presence.ad && /^[A-Z]{4}$/.test(p.presence.ad.c) && num(p.presence.ad.h) < 4 && ['l', 'p', 'e'].includes(p.presence.ad.s))
          .sort((a, b) => (a.presence.ad.s === 'l' ? 0 : 1) - (b.presence.ad.s === 'l' ? 0 : 1) || num(b.presence.ad.h) - num(a.presence.ad.h));
        if (ads.length) await net.open(ads[0].presence.ad.c, false, true);
        else await net.open(newCode(), true, true);
      } else if (kind === 'create') await net.open(newCode(), true, false);
      else await net.open(code, false, false);
    } catch (e) { this.netError(e && e.code === 'not_permitted' ? 'Online rooms are not available to you on this page.' : 'Could not reach the room. Try again in a moment.'); return; }
    if (net.role === 'client') { show('lobby'); this.refreshLobby(); }
  },
  toHost() { this.localSlot = this.net.seats.findIndex(s => s && (s.peer === 'me' || s.peer === this.net.myPeer)); if (this.localSlot < 0) this.localSlot = 0; if (this.match.state === 'lobby') { show('lobby'); this.refreshLobby(); } else this.enterGame(); },
  toClient() { this.match = null; show('lobby'); },
  startMatch() { if (!this.match) return; this.match.reset(); this.resultsShown = false; this.hideResults(); this.enterGame(); },
  enterGame() {
    show('game'); this.unlock(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); Input.enabled = true; this.paused = false; this.acc = 0; this.resultsShown = false; this.endT = 0; this.specSlot = -1;
    GFX.clearShots(); HUD.clearFeed(); GFX.cam.init = false;
    const me = this.match ? this.match.players[this.localSlot] : null;
    const s = MAP.spawns[Math.max(0, this.localSlot)] || MAP.spawns[0];
    // the controls card shows for the first seconds of each match (H brings it back)
    clearTimeout(this.keysT); $('#keys').hidden = TOUCH; this.keysT = setTimeout(() => { $('#keys').hidden = true; }, 12000);
    GFX.cam.yaw = Math.atan2(s.x, s.z);
    SFX.unlock();
  },
  leaveAll() { this.unlock(); if (this.net) { this.net.leave(); this.net = null; } this.match = null; this.client = null; this.mode = 'menu'; this.paused = false; Input.enabled = false; },
  toMenu() { this.leaveAll(); show('menu'); },
  netError(msg) { if (this.net) { this.net.leave(); this.net = null; } this.match = null; this.client = null; this.mode = 'menu'; Input.enabled = false; show('menu'); $('#netHint').textContent = msg; },
  togglePause() {
    if (this.mode === 'menu') return;
    if (!$('#pause').hidden) { show('game'); this.paused = false; Input.enabled = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return; }
    if (cur !== 'game') return;
    this.paused = this.mode !== 'online'; Input.enabled = false; $('#pauseNote').hidden = this.mode !== 'online'; show('pause');
  },
  // ---- lobby screen
  refreshLobby() {
    if (this.mode !== 'online') return;
    const net = this.net, host = net && net.role === 'host';
    let players, lob, state;
    if (host) { players = this.match.players.map(p => ({ name: p.name, bot: p.bot, slot: p.slot })); lob = { code: net.code, pub: net.pub, cd: Math.ceil(net.lobbyT) }; state = this.match.state; }
    else if (this.client) { players = this.client.players; lob = this.client.lob || {}; state = this.client.state; }
    else { players = []; lob = { code: net ? net.code : '' }; state = 'lobby'; }
    $('#lobCode').textContent = net ? net.code : '----';
    const ol = $('#slots'); ol.textContent = '';
    players.forEach((p, i) => {
      const li = document.createElement('li'); const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = COLORS[i].hex;
      const nm = document.createElement('span'); nm.textContent = p.bot ? `${p.name} (bot fills this seat)` : p.name + (i === this.localSlot ? ' (you)' : '');
      li.append(dot, nm); if (p.bot) li.className = 'bot'; ol.appendChild(li);
    });
    if (!players.length) { const li = document.createElement('li'); li.textContent = 'Connecting to the host…'; ol.appendChild(li); }
    $('#hostTools').hidden = !host;
    $('#lobWait').hidden = host;
    $('#lobWait').textContent = state !== 'lobby' ? 'A match is on. You join it in a moment…' : lob.pub && lob.cd > 0 ? `Starting in ${lob.cd}s. More players can still join.` : 'Waiting for the host to start the match…';
    $('#lobHint').textContent = (lob.pub ? 'Public room: anyone using Quick match can join. ' : 'Private room: share the code with friends. ') + 'Bots fill every empty seat.';
    $('#bStart').textContent = host && lob.pub && lob.cd > 0 ? `Start now (auto in ${lob.cd}s)` : 'Start match';
  },
  onClientSnap() {
    const c = this.client;
    if (cur === 'lobby' || cur === 'connecting') { if (c.state === 'lobby') { if (cur !== 'lobby') show('lobby'); this.refreshLobby(); } else this.enterGame(); }
    else if (cur === 'game' && c.state === 'lobby') { show('lobby'); this.refreshLobby(); }
    if (cur === 'results' && c.state !== 'ended') { if (c.state === 'lobby') show('lobby'); else this.enterGame(); }
  },
  // ---- results
  showResults(v) {
    this.resultsShown = true; Input.enabled = false;
    const rk = v.ranking && v.ranking.length ? v.ranking : v.players.slice().sort((a, b) => a.place - b.place).map(p => p.slot);
    const win = rk[0], me = v.localSlot;
    $('#resTitle').textContent = win === me ? 'You win!' : `${v.players[win] ? v.players[win].name : 'Someone'} wins!`;
    const mine = v.players[me];
    $('#resSub').textContent = mine ? `You finished ${['', '1st', '2nd', '3rd', '4th'][mine.place] || '—'} with ${mine.kills} elimination${mine.kills === 1 ? '' : 's'}.` : 'Thanks for watching!';
    const tb = $('#resTable tbody'); tb.textContent = '';
    rk.forEach((s, i) => {
      const p = v.players[s]; if (!p) return;
      const tr = document.createElement('tr'); if (s === me) tr.className = 'me';
      const cells = [i === 0 ? '🏆' : String(i + 1), null, String(p.kills), String(Math.max(0, p.lives)), String(p.dmg | 0), String(p.score)];
      cells.forEach((c, k) => { const td = document.createElement('td'); if (k === 1) { const d = document.createElement('span'); d.className = 'dot'; d.style.background = COLORS[s].hex; td.append(d, document.createTextNode(p.name + (p.bot ? ' (bot)' : ''))); } else td.textContent = c; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    const row = $('#resBtns'); row.textContent = '';
    const add = (label, fn, cls = 'btn') => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.onclick = () => { SFX.play('click'); fn(); }; row.appendChild(b); return b; };
    if (this.mode === 'offline') { add('Rematch', () => this.startMatch(), 'btn primary'); add('Main menu', () => this.toMenu()); }
    else if (this.mode === 'online' && this.net.role === 'host') {
      const ready = this.net.humans().filter(h => !h.sameTab && h.presence.rv === 1).length;
      add(ready ? `Rematch (${ready} ready)` : 'Rematch', () => this.startMatch(), 'btn primary');
      add('Back to lobby', () => { this.match.reset('lobby'); this.net.lobbyT = this.net.pub ? 15 : 0; show('lobby'); this.refreshLobby(); });
      add('Leave room', () => this.toMenu(), 'btn ghost');
    } else if (this.mode === 'online') {
      const b = add('Ready for a rematch', () => { this.net.r.presence({ rv: 1 }).catch(() => {}); b.textContent = 'Ready! Waiting for the host…'; b.disabled = true; }, 'btn primary');
      add('Leave room', () => this.toMenu(), 'btn ghost');
    }
    show('results');
  },
  hideResults() { if (cur === 'results') show('game'); },
};

// ---- screens
let cur = 'menu';
function show(name) {
  cur = name;
  for (const id of ['menu', 'lobby', 'results', 'pause', 'connecting']) $('#' + id).hidden = id !== name;
  const inGame = name === 'game' || name === 'pause' || name === 'results';
  $('#hud').hidden = !inGame;
  $('#touch').hidden = !(name === 'game' && TOUCH);
  document.body.dataset.screen = name;
  if (name === 'lobby' && App.net) App.net.r && App.net.r.presence({ rv: null }).catch(() => {});
}
