// The townsfolk: everyday life, reactions to the rats, and celebrations.
//
// Each villager has a job (farming a field, strolling between doors, chatting
// in pairs, or playing). When rats come near they stop and stare ("!"), then
// head home; if rats get really close, or the town hall is being hit, they run
// for their door and hide indoors until it is safe. After a wave they peek out
// with a "Phew!", and when you win everyone pours out to cheer on the square.
// All of this is cosmetic: the simulation never depends on it.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { groundHeight, makeRng } from '../world.js';
import {
  VILLAGERS, doorOf, fieldPoint, chatSpot, strollPoints, PLAYGROUND, cheerSpot, villagerAlarm, safeToComeOut,
} from '../town.js';
import { villagerGeometry } from './models.js';
import { villagerMaterial, villagerInkPose, VACT } from './villageranim.js';
import { toonGradient, inkInstanced, inkNormals, INK_PX } from './toon.js';

const TINTS = [0x2aa198, 0xd8433a, 0x3e6fb8, 0xe0a93a, 0x5f9a3a, 0x8a5fb0, 0xf27b2c, 0xe07a9a].map((c) => new THREE.Color(c));
const SPEED = { walk: 1.25, brisk: 2.4, run: 3.8, kid: 2.9 };
const SIZE = 1.15;   // villagers are a little smaller than the farmer hero
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CHEERS = ['Hooray!', 'Yay!', '★', 'We did it!', '♪'];
const angleTo = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class TownView {
  constructor(view) {
    this.view = view;
    this.rng = makeRng(4242);
    this.uniforms = { uTime: { value: 0 } };
    const mat = villagerMaterial(this.uniforms, toonGradient());
    const pose = villagerInkPose(this.uniforms);
    this.meshes = []; this.anims = [];
    this.villagers = VILLAGERS.map((def, i) => ({ def, i, slot: 0 }));
    for (let look = 0; look < 3; look++) {
      const group = this.villagers.filter((v) => v.def.look === look);
      group.forEach((v, k) => { v.slot = k; });
      const n = Math.max(1, group.length);
      const geo = inkNormals(villagerGeometry(look));
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iAnim', anim);
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = group.length;
      for (const v of group) mesh.setColorAt(v.slot, TINTS[v.def.tint % TINTS.length]);
      view.scene.add(mesh);
      inkInstanced(mesh, INK_PX.rat, { pose });
      this.meshes.push(mesh); this.anims.push(anim);
    }
    // speech bubbles over heads
    this.emotes = this.villagers.map(() => {
      const el = document.createElement('div');
      el.className = 'emote'; el.style.display = 'none';
      view.labels.appendChild(el);
      return el;
    });
    this.stroll = strollPoints();
    this.sounds = [];        // read and cleared by main.js: 'gasp', 'phew', 'cheer'
    this.mood = 'calm';      // the town as a whole: calm, alert, panic, cheer
    this.t = 0;
    this.reset();
  }

  // everyone back to their everyday routine (new game / restart)
  reset() {
    const r = this.rng;
    this.t = 0; this.mood = 'calm'; this.lastState = null; this.gaspT = 0; this.confettiT = 0; this.cheerSoundT = 0; this.relief = false;
    this.sounds.length = 0;
    for (const v of this.villagers) {
      const d = v.def;
      Object.assign(v, {
        x: 0, z: 0, yaw: r() * 6.28, y: 0, phase: r() * 6.28, act: VACT.idle, actT: r() * 3, head: 0,
        scale: 1, hidden: false, state: 'idle', tx: 0, tz: 0, timer: r() * 2, speed: SPEED.walk,
        mode: 'calm', checkT: v.i * 0.013, exitAt: 0, emote: '', emoteT: 0, calmT: 0, last: -1, threat: null, then: null,
        jumpSeed: r() * 6.28,
      });
      let p;
      if (d.job === 'farm') { const f = CFG.town.fields[d.fields[0]]; p = fieldPoint(f, r() * 0.8 - 0.4, r() * 0.7 - 0.35); }
      else if (d.job === 'chat') p = this._chatPos(v);
      else if (d.job === 'kid') p = { x: PLAYGROUND.x + (r() - 0.5) * PLAYGROUND.r, z: PLAYGROUND.z + (r() - 0.5) * PLAYGROUND.r };
      else { v.last = (v.i * 3) % this.stroll.length; p = this.stroll[v.last]; }
      v.x = p.x; v.z = p.z;
      this._planCalm(v);
    }
    for (const el of this.emotes) el.style.display = 'none';
  }

  // where a chatting villager stands: two to a spot, facing each other
  _chatPos(v) {
    const s = chatSpot(v.def.spot);
    const first = VILLAGERS.findIndex((d) => d.job === 'chat' && d.spot === v.def.spot) === v.i;
    return { x: s.x + (first ? -0.6 : 0.6), z: s.z };
  }

  _go(v, x, z, speed, then) { v.state = 'go'; v.tx = x; v.tz = z; v.speed = speed; v.then = then; }
  _say(v, text, secs = 1.6) { v.emote = text; v.emoteT = secs; }

  // the next everyday thing to do
  _planCalm(v) {
    const r = this.rng, d = v.def;
    v.mode = 'calm';
    if (d.job === 'farm') {
      const f = CFG.town.fields[d.fields[Math.floor(r() * d.fields.length)]];
      const p = fieldPoint(f, r() * 0.8 - 0.4, r() * 0.7 - 0.35);
      this._go(v, p.x, p.z, SPEED.walk, () => { v.state = 'work'; v.timer = 3 + r() * 5; v.actT = 0; v.yaw = f.rot + (r() < 0.5 ? 0 : Math.PI); });
    } else if (d.job === 'chat') {
      const p = this._chatPos(v);
      this._go(v, p.x, p.z, SPEED.walk, () => { v.state = 'talk'; v.timer = 6 + r() * 9; v.actT = r() * 5; });
    } else if (d.job === 'kid') {
      const a = r() * Math.PI * 2, rr = PLAYGROUND.r * Math.sqrt(r());
      this._go(v, PLAYGROUND.x + Math.cos(a) * rr, PLAYGROUND.z + Math.sin(a) * rr * 0.8, SPEED.kid, () => {
        if (r() < 0.35) { v.state = 'hop'; v.timer = 1 + r(); v.actT = 0; } else this._planCalm(v);
      });
    } else {
      let k = Math.floor(r() * this.stroll.length);
      if (k === v.last) k = (k + 1) % this.stroll.length;
      v.last = k;
      const p = this.stroll[k];
      this._go(v, p.x + (r() - 0.5) * 0.8, p.z + 0.4 + r() * 0.6, SPEED.walk, () => {
        v.state = 'idle'; v.timer = 1.5 + r() * 3.5;
        if (r() < 0.25) this._say(v, r() < 0.5 ? '♪' : 'Hello!', 1.4);
      });
    }
  }

  _flee(v, speed, threat) {
    const door = doorOf(v.def.home);
    v.mode = speed === SPEED.run ? 'panic' : 'alert';
    this._go(v, door.x, door.z, speed, () => { v.state = 'enter'; v.timer = 0.4; v.doorYaw = door.yaw; });
    if (speed === SPEED.run) {
      this._say(v, this.rng() < 0.3 ? 'Eek!' : '!!', 1.4);
      if (this.gaspT <= 0) { this.sounds.push('gasp'); this.gaspT = 0.7; }
    }
    if (threat) v.threat = threat;
  }

  _comeOut(v) {
    const door = doorOf(v.def.home);
    v.hidden = false; v.state = 'exit'; v.timer = 0.45; v.scale = 0;
    v.x = door.x; v.z = door.z; v.yaw = door.yaw;
  }

  _startCheer(v, k, nTown) {
    v.mode = 'cheer';
    if (v.hidden) { v.exitAt = this.t + 0.2 + this.rng() * 1.6; return; }
    v.scale = 1;
    const d = v.def;
    let p;
    if (d.job === 'farm') { const f = CFG.town.fields[d.fields[0]]; p = fieldPoint(f, (this.rng() - 0.5) * 0.6, 0.62); }
    else p = cheerSpot(k, nTown);
    this._go(v, p.x, p.z, SPEED.brisk, () => { v.state = 'cheer'; v.actT = this.rng() * 2; });
  }

  // nearest rat on its feet (position and distance)
  _nearest(sim, x, z) {
    let best = Infinity, bx = 0, bz = 0;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < best) { best = d; bx = e.x; bz = e.z; }
    }
    return { d: Math.sqrt(best), x: bx, z: bz };
  }

  update(dt, sim) {
    const r = this.rng;
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    this.gaspT -= dt;
    const won = sim.state === 'victory', lost = sim.state === 'defeat';
    // a wave just ended: hidden villagers will peek out with a "Phew!"
    if (this.lastState === 'wave' && sim.state === 'build') this.relief = true;
    if (won && this.lastState !== 'victory') { this.sounds.push('cheer'); this.cheerSoundT = 3.2; this.confettiT = 0.3; }
    this.lastState = sim.state;
    const townFolk = this.villagers.filter((v) => v.def.job !== 'farm');

    let worst = 0;
    for (const v of this.villagers) {
      // ---- how do I feel? (checked five times a second)
      v.checkT -= dt;
      if (v.checkT <= 0) {
        v.checkT = 0.2;
        if (won) {
          if (v.mode !== 'cheer') this._startCheer(v, townFolk.indexOf(v), townFolk.length);
        } else if (v.hidden || v.state === 'enter') {
          if (v.hidden && safeToComeOut(sim, v.x, v.z)) { if (!v.exitAt) v.exitAt = this.t + 0.3 + r() * 2.2; }
          else v.exitAt = 0;
        } else {
          const alarm = villagerAlarm(sim, v.x, v.z);
          const n = this._nearest(sim, v.x, v.z);
          if (alarm === 'panic' && v.mode !== 'panic') this._flee(v, SPEED.run, n);
          else if (alarm === 'alert' && v.mode === 'calm') {
            v.mode = 'alert'; v.state = 'watch'; v.timer = 0.8 + r() * 0.5; v.threat = n;
            this._say(v, '!', 1.3);
          } else if (alarm === 'calm' && v.mode === 'alert') {
            v.calmT += 0.2;
            if (v.calmT > 3) { v.calmT = 0; this._planCalm(v); }
          } else v.calmT = 0;
          if (v.mode === 'alert' || v.mode === 'panic') v.threat = n;
        }
      }
      if (v.hidden && v.exitAt && this.t >= v.exitAt) {
        v.exitAt = 0;
        this._comeOut(v);
      }
      worst = Math.max(worst, v.hidden ? 1 : v.mode === 'panic' ? 3 : v.mode === 'alert' ? 2 : 0);

      // ---- act
      v.actT += dt;
      v.emoteT -= dt;
      let act = VACT.idle, headTarget = 0;
      switch (v.state) {
        case 'go': {
          const dx = v.tx - v.x, dz = v.tz - v.z, d = Math.hypot(dx, dz);
          if (d < 0.12) { const then = v.then; v.then = null; v.state = 'idle'; v.timer = 0.5; if (then) then(); break; }
          const step = Math.min(d, v.speed * dt);
          v.x += (dx / d) * step; v.z += (dz / d) * step;
          this._avoid(v, sim, dx / d, dz / d);
          v.yaw += angleTo(v.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
          const run = v.speed > 2;
          v.phase += step * (Math.PI * 2) / (run ? 1.5 : 0.95);
          act = v.mode === 'panic' && run ? VACT.panic : run ? VACT.run : VACT.walk;
          if (v.mode === 'cheer' && run) act = VACT.run;
          break;
        }
        case 'work':
          act = VACT.work; v.timer -= dt;
          if (v.timer <= 0) this._planCalm(v);
          break;
        case 'talk': {
          act = VACT.talk; v.timer -= dt;
          // face the other person at this spot
          const s = chatSpot(v.def.spot);
          v.yaw += angleTo(v.yaw, Math.atan2(s.x - v.x, s.z - v.z)) * Math.min(1, dt * 6);
          if (r() < dt * 0.12) this._say(v, ['…', 'Ha ha!', '♪', 'Oh?'][Math.floor(r() * 4)], 1.5);
          if (v.timer <= 0) { if (r() < 0.3) { v.state = 'idle'; v.timer = 2 + r() * 2; } else v.timer = 5 + r() * 8; }
          break;
        }
        case 'hop':
          act = VACT.cheer; v.timer -= dt;
          v.y = Math.abs(Math.sin(v.actT * 6.5)) * 0.25;
          if (v.timer <= 0) { v.y = 0; this._planCalm(v); }
          break;
        case 'watch': {
          // stop and stare at the rats, then head home
          act = VACT.idle; v.timer -= dt;
          if (v.threat) v.yaw += angleTo(v.yaw, Math.atan2(v.threat.x - v.x, v.threat.z - v.z)) * Math.min(1, dt * 8);
          if (v.timer <= 0) this._flee(v, SPEED.brisk);
          break;
        }
        case 'enter': {
          // shrink into the doorway
          act = VACT.walk; v.timer -= dt;
          v.yaw += angleTo(v.yaw, (v.doorYaw || 0) + Math.PI) * Math.min(1, dt * 12);
          v.x -= Math.sin(v.doorYaw || 0) * dt * 1.2;
          v.z -= Math.cos(v.doorYaw || 0) * dt * 1.2;
          v.phase += dt * 9;
          v.scale = Math.max(0, v.timer / 0.4);
          if (v.timer <= 0) { v.hidden = true; v.scale = 0; v.state = 'hidden'; v.y = 0; }
          break;
        }
        case 'hidden':
          v.scale = 0;
          break;
        case 'exit': {
          act = VACT.walk; v.timer -= dt;
          v.x += Math.sin(v.yaw) * dt * 1.6; v.z += Math.cos(v.yaw) * dt * 1.6;
          v.phase += dt * 9;
          v.scale = Math.min(1, 1 - v.timer / 0.45);
          if (v.timer <= 0) {
            v.scale = 1;
            if (won) { v.mode = 'calm'; this._startCheer(v, townFolk.indexOf(v), townFolk.length); }
            else if (this.relief || sim.state === 'build') {
              v.state = 'relief'; v.timer = 1.5; v.actT = 0; v.mode = 'calm';
              this._say(v, r() < 0.5 ? 'Phew!' : 'Safe!', 1.6);
              this.sounds.push('phew');
            } else this._planCalm(v);
          }
          break;
        }
        case 'relief':
          act = VACT.cheer; v.timer -= dt;
          v.y = Math.abs(Math.sin(v.actT * 6)) * 0.2;
          if (v.timer <= 0) { v.y = 0; this._planCalm(v); }
          break;
        case 'cheer': {
          act = VACT.cheer;
          v.y = Math.abs(Math.sin(v.actT * (v.def.kid ? 8 : 6.5) + v.jumpSeed)) * (v.def.kid ? 0.42 : 0.32);
          // turn to face the town hall
          const f = CFG.fortress;
          v.yaw += angleTo(v.yaw, Math.atan2(f.x - v.x, f.z - v.z)) * Math.min(1, dt * 3);
          if (v.emoteT < -1.5 - (v.i % 4) && r() < dt * 1.2) this._say(v, CHEERS[Math.floor(r() * CHEERS.length)], 1.6);
          break;
        }
        default: // idle
          act = VACT.idle; v.timer -= dt;
          if (v.mode === 'calm' && v.timer <= 0) this._planCalm(v);
      }
      if (v.state !== 'cheer' && v.state !== 'hop' && v.state !== 'relief') v.y += (0 - v.y) * Math.min(1, dt * 10);
      // look toward the rats while worried
      if ((v.mode === 'alert' || v.mode === 'panic') && v.threat && !v.hidden) {
        headTarget = THREE.MathUtils.clamp(angleTo(v.yaw, Math.atan2(v.threat.x - v.x, v.threat.z - v.z)), -1.1, 1.1);
      }
      v.head += (headTarget - v.head) * Math.min(1, dt * 6);
      v.act = act;
    }
    this.mood = won ? 'cheer' : worst >= 3 ? 'panic' : worst >= 1 ? 'alert' : 'calm';
    if (sim.state === 'build' && this.villagers.every((v) => !v.hidden && v.state !== 'exit')) this.relief = false;

    // ---- celebrate: confetti over the square, more cheering
    if (won) {
      this.confettiT -= dt; this.cheerSoundT -= dt;
      if (this.confettiT <= 0) {
        const s = CFG.town.square, a = r() * Math.PI * 2, rr = 2 + r() * 5;
        this.view.fx.confetti(s.x + Math.cos(a) * rr, 3 + r() * 1.5, s.z + Math.sin(a) * rr, 18);
        this.confettiT = 0.45 + r() * 0.5;
      }
      if (this.cheerSoundT <= 0) { this.sounds.push('cheer'); this.cheerSoundT = 5 + r() * 3; }
    }
    this._write();
  }

  // slide round buildings, the town hall and towers instead of walking through them
  _avoid(v, sim, dx, dz) {
    const push = (cx, cz, rad) => {
      const ox = v.x - cx, oz = v.z - cz, d = Math.hypot(ox, oz);
      if (d >= rad || d < 1e-4) return;
      const nx = ox / d, nz = oz / d;
      v.x = cx + nx * rad; v.z = cz + nz * rad;
      // nudge along the wall so a head-on walker still gets round
      const side = (dx * nz - dz * nx) >= 0 ? 1 : -1;
      v.x += -nz * side * 0.03; v.z += nx * side * 0.03;
    };
    const f = CFG.fortress;
    push(f.x, f.z, 3.7);
    for (const h of CFG.huts) push(h.x, h.z, 1.6);
    const t = CFG.town;
    push(t.barn.x, t.barn.z, 2.7); push(t.windmill.x, t.windmill.z, 1.7); push(t.well.x, t.well.z, 1.0); push(t.market.x, t.market.z, 1.25);
    for (const tw of sim.towers) push(tw.x, tw.z, 1.3);
  }

  _write() {
    const anims = this.anims;
    for (const v of this.villagers) {
      const mesh = this.meshes[v.def.look], a = anims[v.def.look].array, k = v.slot;
      const s = SIZE * (v.def.kid ? 0.7 : 1) * v.scale;
      _p.set(v.x, groundHeight(v.x, v.z) + v.y, v.z);
      _q.setFromAxisAngle(UP, v.yaw);
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(k, _m);
      a[k * 4] = v.phase; a[k * 4 + 1] = v.act; a[k * 4 + 2] = v.actT; a[k * 4 + 3] = v.head;
    }
    for (let i = 0; i < 3; i++) { this.meshes[i].instanceMatrix.needsUpdate = true; anims[i].needsUpdate = true; }
  }

  // round shadows under visible villagers (shares the view's blob mesh)
  writeBlobs(bm, n, max) {
    for (const v of this.villagers) {
      if (n >= max) break;
      if (v.scale < 0.05) continue;
      const s = SIZE * (v.def.kid ? 0.7 : 1) * v.scale * Math.max(0.5, 1 - v.y);
      _p.set(v.x, groundHeight(v.x, v.z) + 0.06, v.z);
      _q.identity();
      _s.set(0.75 * s, 1, 0.75 * s);
      _m.compose(_p, _q, _s);
      bm.setMatrixAt(n++, _m);
    }
    return n;
  }

  // speech bubbles follow their villager
  placeEmotes() {
    for (const v of this.villagers) {
      const el = this.emotes[v.i];
      const show = v.emoteT > 0 && v.scale > 0.3;
      if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      if (el.style.display === 'none') el.style.display = '';
      if (el.textContent !== v.emote) {
        el.textContent = v.emote;
        el.className = 'emote' + (v.emote === '!' || v.emote === '!!' || v.emote === 'Eek!' ? ' alarm' : v.mode === 'cheer' ? ' cheer' : '');
      }
      const s = SIZE * (v.def.kid ? 0.7 : 1);
      this.view._placeLabel(el, v.x, groundHeight(v.x, v.z) + v.y + 1.75 * s, v.z);
    }
  }

  // counts for tests and the HUD
  stats() {
    const c = { total: this.villagers.length, hidden: 0, panic: 0, alert: 0, cheering: 0, working: 0, talking: 0, visible: 0 };
    for (const v of this.villagers) {
      if (v.hidden) c.hidden++; else c.visible++;
      if (!v.hidden && v.mode === 'panic') c.panic++;
      if (!v.hidden && v.mode === 'alert') c.alert++;
      if (v.state === 'cheer') c.cheering++;
      if (v.state === 'work') c.working++;
      if (v.state === 'talk') c.talking++;
    }
    c.mood = this.mood;
    return c;
  }
}
