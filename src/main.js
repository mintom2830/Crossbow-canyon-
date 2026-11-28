// ===================================================================== main loop
const demo = { m: null };
function newDemo() { demo.m = new Match({ mode: 'ffa', roster: botRoster(4, 'normal', '') }); demo.m.state = 'playing'; demo.m.t = 0; }
newDemo();
const pv = (p, x, y, z, W) => ({
  slot: p.slot, name: p.name, bot: p.bot, x, y, z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw, hp: p.hp, lives: p.lives, alive: p.alive, out: p.out, ground: p.ground,
  dash: p.dashT > 0, stun: p.stunT > 0, aim: p.aiming || p.aimT > 0, ax: p.ax, ay: p.ay, az: p.az, inv: p.inv > 0, shield: p.shield, pw: p.pw, pwT: p.pwT, emote: p.emote,
  kills: p.kills, score: p.score, dmg: p.dmg, respawnT: p.respawnT, place: p.place, floor: support(W, x, z, y + 0.05),
});
function matchView(m, alpha, localSlot) {
  const t = m.t + alpha * DT, W = App.W.update(t, m.crateFlags());
  const players = m.players.map((p, i) => {
    const q = App.prev[i];
    if (q && q.m === m && Math.hypot(q[0] - p.x, q[2] - p.z) < 3) return pv(p, lerp(q[0], p.x, alpha), lerp(q[1], p.y, alpha), lerp(q[2], p.z, alpha), W);
    return pv(p, p.x, p.y, p.z, W);
  });
  return { t, state: m.state, sd: m.sd, zone: W.zone, practice: m.mode === 'practice', players, localSlot, crates: m.crateFlags(), spawners: m.spawners.map(s => s.k), drops: m.drops, targets: m.targets.map(x => x.down), ranking: m.ranking, shotTime: t, ownShotTime: t };
}
function runMatch(m, dt, withLocal) {
  if (!App.paused) App.acc += dt;
  let n = 0;
  while (App.acc >= DT && n++ < 5) {
    App.prev = m.players.map(p => Object.assign([p.x, p.y, p.z], { m }));
    if (withLocal) { const me = m.players[App.localSlot]; if (me) m.setInput(App.localSlot, Input.build(me, DT)); }
    if (App.net && App.net.role === 'host' && m === App.match) App.net.hostInputs();
    m.step();
    const ev = m.drain(), v = App.lastView;
    if (v) for (const e of ev) { if (e[1] === 'reset') { GFX.clearShots(); } GFX.onEvent(e, v, m.t); if (withLocal) HUD.onEvent(e, v); }
    if (App.net && App.net.role === 'host' && m === App.match) App.net.hostTick(ev);
    App.acc -= DT;
  }
  if (n >= 5) App.acc = 0;
}
function clientView(net, dt) {
  const c = App.client, est = net.est(), rt = est - INTERP;
  App.acc += dt;
  let n = 0;
  while (App.acc >= DT && n++ < 5) {
    const me = net.pred && net.pred.alive ? net.pred : null;
    const inp = Input.build(me, DT);
    net.clientTick(inp, App.W.update(est, c.crates));
    App.acc -= DT;
  }
  if (n >= 5) App.acc = 0;
  const players = net.interpPlayers(rt);
  const W = App.W.update(est, c.crates);
  for (const p of players) p.floor = support(W, p.x, p.z, p.y + 0.05);
  const P = net.pred, ls = App.localSlot;
  if (P && ls >= 0 && players[ls]) {
    net.vOff.multiplyScalar(Math.exp(-dt * 12));
    const x = P.x + net.vOff.x, y = P.y + net.vOff.y, z = P.z + net.vOff.z, inp = Input.st;
    Object.assign(players[ls], { x, y, z, vx: P.vx, vy: P.vy, vz: P.vz, yaw: P.yaw, ground: P.ground, dash: P.dashT > 0, alive: P.alive && players[ls].alive, emote: P.emote, aim: !!(Input.st.mouseR || P.aimT > 0 || (inp.mouseL && Input.enabled)), ax: inp.aim.x, ay: inp.aim.y, az: inp.aim.z, floor: support(W, x, z, y + 0.05) });
  }
  return { t: est, state: c.state, sd: c.sd, zone: zoneRadius(est), practice: c.practice, players, localSlot: ls, crates: c.crates, spawners: c.spawners, drops: c.drops, targets: c.targets, ranking: c.ranking, shotTime: rt, ownShotTime: est };
}
const camGame = { dist: 7.5, pitch: 0.32 };
let last = performance.now(), lobbyRefresh = 0, lastFrame = performance.now();
// a host whose tab is in the background still has to run the match for everyone: browsers stop animation frames there, so a timer takes over
setInterval(() => {
  const now = performance.now();
  if (now - lastFrame < 250 || !GFX.ready || !App.match || App.mode !== 'online' || !App.net || App.net.role !== 'host') return;
  const m = App.match, dt = Math.min(1, (now - last) / 1000); last = now;
  App.acc += dt;
  let n = 0;
  while (App.acc >= DT && n++ < 70) {
    App.net.hostInputs(); m.step(); App.net.hostTick(m.drain()); App.acc -= DT;
  }
  App.net.checkHost();
}, 100);
function loop(now) {
  requestAnimationFrame(loop);
  lastFrame = now;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!GFX.ready) return;
  Input.poll();
  let view;
  const net = App.net;
  if (App.mode === 'online' && net && net.role === 'client') {
    net.checkHost();
    if (!App.client) { runMatch(demo.m, dt, false); view = matchView(demo.m, App.acc / DT, -1); }
    else view = clientView(net, dt);
  } else if (App.match) { runMatch(App.match, dt, cur === 'game'); view = matchView(App.match, App.acc / DT, App.localSlot); }
  else { runMatch(demo.m, dt, false); if (demo.m.state === 'ended') newDemo(); view = matchView(demo.m, App.acc / DT, -1); }
  App.lastView = view;
  // where you are, what you aim at, who the camera follows
  const meV = view.players[view.localSlot];
  const playing = App.mode !== 'menu' && meV;
  let focus = null, aim = null;
  if (playing && meV.alive) { focus = meV; Input.updateMouseAim(meV, view); aim = TOUCH ? null : Input.st.aim; view.spectating = 0; }
  else if (playing && !meV.out) { focus = meV; view.spectating = 0; }
  else if (App.mode !== 'menu' && view.players.length) {
    const alive = view.players.filter(p => p.alive && !p.out);
    if (!alive.some(p => p.slot === App.specSlot)) App.specSlot = alive.length ? alive[0].slot : -1;
    const sp = view.players[App.specSlot];
    focus = sp || { x: 0, y: 0, z: 0 }; view.spectating = sp ? sp.slot : 0;
    if (view.state === 'lobby' || view.state === 'ended') view.spectating = 0;
  }
  view.focus = focus;
  if (App.mode === 'menu' || !focus) {
    GFX.cam.yaw += dt * 0.05; GFX.cam.dist += (34 - GFX.cam.dist) * Math.min(1, dt * 2); GFX.cam.pitch += (0.48 - GFX.cam.pitch) * Math.min(1, dt * 2);
    focus = { x: 0, y: 0, z: 0 };
  } else if (GFX.cam.dist > 15.5) { GFX.cam.dist = camGame.dist; GFX.cam.pitch = camGame.pitch; GFX.cam.init = false; }
  GFX.frame(view, dt, now / 1000, focus, aim);
  if (App.mode !== 'menu') {
    HUD.update(view, dt);
    if (view.state === 'ended' && !App.resultsShown) { if (!App.endT) App.endT = now; if (now - App.endT > 2400) App.showResults(view); }
    if (view.state !== 'ended') App.endT = 0;
    if ((lobbyRefresh -= dt) <= 0) { lobbyRefresh = 0.25; if (cur === 'lobby') App.refreshLobby(); if (cur === 'results' && net && net.role === 'host') { const b = $('#resBtns button'); const ready = net.humans().filter(h => !h.sameTab && h.presence.rv === 1).length; if (b) b.textContent = ready ? `Rematch (${ready} ready)` : 'Rematch'; } }
    $('#netBadge').hidden = !(net && !net.connected);
  }
  if (DEBUG) $('#fps').textContent = `${GFX.fps.toFixed(0)} fps`;
}

// ===================================================================== menus and buttons
(() => {
  const nameIn = $('#nameIn');
  let saved = ''; try { saved = localStorage.getItem('dp.name') || ''; } catch { /* */ }
  App.name = cleanName(saved) || 'Doodler' + Math.floor(10 + Math.random() * 89);
  nameIn.value = App.name;
  nameIn.addEventListener('input', () => { App.name = cleanName(nameIn.value) || 'Doodler'; try { localStorage.setItem('dp.name', App.name); } catch { /* */ } });
  const seg = (el, get, set) => { for (const b of el.querySelectorAll('button')) b.onclick = () => { SFX.unlock(); SFX.play('click'); set(b.dataset.v); paint(); }; const paint = () => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === get())); }; paint(); return paint; };
  try { const d = localStorage.getItem('dp.diff'); if (BOT[d]) App.diff = d; } catch { /* */ }
  const paints = [];
  const setDiff = v => { App.diff = v; try { localStorage.setItem('dp.diff', v); } catch { /* */ } if (App.match && App.mode === 'online') App.match.players.forEach(p => { p.diff = v; }); paints.forEach(f => f()); };
  paints.push(seg($('#diffSeg'), () => App.diff, setDiff), seg($('#lobDiff'), () => App.diff, setDiff));
  const click = fn => () => { SFX.unlock(); SFX.play('click'); fn(); };
  $('#bBots').onclick = click(() => App.startOffline());
  $('#bPractice').onclick = click(() => App.startPractice());
  $('#bQuick').onclick = click(() => App.online('quick'));
  $('#bCreate').onclick = click(() => App.online('create'));
  $('#joinForm').addEventListener('submit', e => {
    e.preventDefault(); SFX.unlock();
    const code = $('#codeIn').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { $('#netHint').textContent = 'A room code is 4 letters, like KQWP.'; return; }
    App.online('join', code);
  });
  $('#codeIn').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
  $('#bStart').onclick = click(() => App.startMatch());
  $('#bLeave').onclick = click(() => App.toMenu());
  $('#bCancel').onclick = click(() => App.toMenu());
  $('#bCopy').onclick = () => {
    const code = App.net ? App.net.code : '';
    const done = () => { $('#bCopy').textContent = 'Copied!'; setTimeout(() => { $('#bCopy').textContent = 'Copy code'; }, 1500); };
    try { navigator.clipboard.writeText(code).then(done, () => { const r = document.createRange(); r.selectNodeContents($('#lobCode')); getSelection().removeAllRanges(); getSelection().addRange(r); }); } catch { /* */ }
  };
  $('#bPause').onclick = click(() => App.togglePause());
  $('#bResume').onclick = click(() => App.togglePause());
  $('#bQuit').onclick = click(() => App.toMenu());
  $('#bHelp').onclick = click(() => { $('#keys').hidden = !$('#keys').hidden; });
  const mute = () => { const on = SFX.toggle(); $('#bMute').setAttribute('aria-pressed', String(!on)); $('#bMute').textContent = on ? '♪' : '♪̸'; };
  $('#bMute').onclick = () => { SFX.unlock(); mute(); };
  if (!SFX.on) { $('#bMute').setAttribute('aria-pressed', 'true'); $('#bMute').textContent = '♪̸'; }
  const spec = d => { const v = App.lastView; if (!v) return; const alive = v.players.filter(p => p.alive && !p.out); if (!alive.length) return; const i = alive.findIndex(p => p.slot === App.specSlot); App.specSlot = alive[(i + d + alive.length) % alive.length].slot; };
  $('#specPrev').onclick = () => spec(-1); $('#specNext').onclick = () => spec(1);
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { if (cur === 'game' || cur === 'pause') App.togglePause(); }
    if (e.code === 'Tab' && cur === 'game') { e.preventDefault(); spec(e.shiftKey ? -1 : 1); }
    if (e.code === 'KeyH' && cur === 'game') $('#keys').hidden = !$('#keys').hidden;
    if (e.code === 'KeyM' && !e.repeat) mute();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && cur === 'game' && App.mode !== 'online') App.togglePause(); });
  if (TOUCH) $('#keys').hidden = true;
  // online play needs the page's room feature, which the claude.ai viewer provides
  const onlineBtns = ['#bQuick', '#bCreate', '#joinBtn', '#codeIn'].map(s => $(s));
  const setOnline = (ok, msg) => { onlineBtns.forEach(b => { b.disabled = !ok; }); $('#netHint').textContent = msg; App.roomReady = ok; };
  setOnline(false, 'Checking online play…');
  if (!window.claude || typeof window.claude.use !== 'function') setOnline(false, 'Online play works when this page is opened on claude.ai. Bots and practice work anywhere.');
  else window.claude.use('room').then(room => {
    if (!room) { setOnline(false, 'Online play is not available in this view. Bots and practice still work.'); return; }
    App.room = room;
    room.onPeers(() => {}, () => {});
    setOnline(true, 'Quick match finds an open room or opens a new one. Bots fill every empty seat.');
  }, () => setOnline(false, 'Online play is not available in this view.'));
})();

// ===================================================================== load the model, then start
(() => {
  const bytes = (() => { const s = atob(MODEL_B64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; })();
  new THREE.GLTFLoader().parse(bytes, '', gltf => {
    GFX.setupModel(gltf); GFX.buildRigs(); GFX.ready = true;
    $('#loading').hidden = true;
    for (const b of ['#bBots', '#bPractice']) $(b).disabled = false;
    show('menu');
  }, err => { $('#loading').textContent = 'The doodle model could not load: ' + (err && err.message || err); });
  requestAnimationFrame(loop);
})();
if (DEBUG) window.DP = { App, Match, MAP, GFX, Input, HUD, Net, demo, get view() { return App.lastView; } };
