// 3D portraits of every enemy for the Rat guide and the "New enemy" card.
// Each one is rendered once, on demand, with the game's own toon materials
// and ink outlines: the model is posed far off the map, a small camera looks
// at it, and the frame is read back into an image (data URL).
import * as THREE from 'three';
import { CFG } from '../config.js';
import { gruntGeometry, gruntInkGeometry, heroParts, mountParts, towerParts } from './models.js';
import { inkInstanced, inkNormals, inkUniforms, INK_PX, toon, addInk } from './toon.js';
import { applySkin } from './skins.js';

const SIZE = 192;          // CSS pixels of the portrait image
const SS = 2;              // rendered at twice the size, then scaled down (smooth edges)
const AWAY = new THREE.Vector3(900, 0, 900);   // far outside the canyon
const DAYLIGHT = { sky: 0xfff6ea, gnd: 0x9a6a4a, hemi: 1.05, sun: 0xfff8ec, sunI: 2.3 };
const BACKDROP = new THREE.Color(0xf2d39a);   // warm sand behind every portrait
const KEY = new THREE.Color(0xff00ff);        // backdrop keyed out for a see-through picture

export class Portraits {
  constructor(view) {
    this.view = view;
    this.cache = new Map();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
  }

  // data URL of the portrait for a Rat guide key ('rat:N', 'giant', 'boss:NAME').
  // redraw false: leave repainting the game to a later flush() (when drawing several).
  // opts.clear: a see-through background instead of the sand backdrop
  get(key, redraw = true, opts = {}) {
    const ck = key + (opts.clear ? '|clear' : '');
    if (this.cache.has(ck)) return this.cache.get(ck);
    let url = '';
    try { url = this._render(key, opts); } catch (err) { url = ''; }
    this.cache.set(ck, url);
    this.dirty = true;
    if (redraw) this.flush();
    return url;
  }
  // paint the game back over the corner the portraits were drawn in
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.view.render();
  }

  _subject(key) {
    const v = this.view;
    // the farmer, on foot or riding the horse or the cow (Shop, title screen)
    if (key.startsWith('ride:')) {
      const kind = key.slice(5), mat = toon(), group = new THREE.Group(), geos = [];
      const add = (geo, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); addInk(m, INK_PX.unit); parent.add(m); geos.push(geo); return m; };
      const hp = heroParts(), fb = new THREE.Group();
      add(hp.body, fb); add(hp.fork, fb);
      const legL = add(hp.leg, fb, -0.12, 0.38, 0), legR = add(hp.leg, fb, 0.12, 0.38, 0);
      const armL = add(hp.arm, fb, -0.33, 0.86, 0), armR = add(hp.arm, fb, 0.33, 0.86, 0);
      group.add(fb);
      let frame = { size: 1.5, h: 1.05 };
      if (kind === 'horse' || kind === 'cow') {
        const mp = mountParts(kind);
        add(mp.body, group); add(mp.tail, group, ...mp.tailPivot).rotation.x = 0.3;
        const head = add(mp.head, group, ...mp.headPivot); head.rotation.x = -0.08;
        mp.legs.forEach((p, i) => { add(mp.leg, group, ...p).rotation.x = [0.35, -0.15, -0.3, 0.2][i]; });
        fb.position.y = mp.seat - 0.4;
        legL.rotation.set(-0.35, 0, -0.55); legR.rotation.set(-0.35, 0, 0.55);
        armL.rotation.x = armR.rotation.x = -0.95;
        frame = { size: 1.55, h: 1.05 };
      } else { armR.rotation.x = -0.5; armL.rotation.z = -0.25; }
      group.scale.setScalar(1.35);
      group.position.copy(AWAY);
      group.rotation.y = kind === 'none' ? 0.95 : 1.65;   // a rider side-on, nose to the right
      return { obj: group, size: frame.size * 1.35, h: frame.h * 1.35, dx: 0, dz: 0, done: () => { for (const g of new Set(geos)) g.dispose(); } };
    }
    // a level 5 crossbow tower painted in a weapon skin (Shop)
    if (key.startsWith('skin:')) {
      const id = key.slice(5), g = towerParts(5), mat = toon(), glow = new THREE.MeshBasicMaterial({ vertexColors: true });
      applySkin(g.base, id); applySkin(g.head, id);
      const group = new THREE.Group();
      const base = new THREE.Mesh(g.base, mat), head = new THREE.Mesh(g.head, mat);
      head.position.y = g.headY; head.rotation.y = 0.5;
      addInk(base, INK_PX.unit); addInk(head, INK_PX.unit);
      group.add(base, head);
      if (g.baseGlow.attributes.position) group.add(new THREE.Mesh(g.baseGlow, glow));
      if (g.headGlow.attributes.position) { const hg = new THREE.Mesh(g.headGlow, glow); hg.position.y = g.headY; hg.rotation.y = 0.5; group.add(hg); }
      group.position.copy(AWAY);
      g.base.computeBoundingBox();
      const top = g.headY + 1.4;
      return { obj: group, size: top * 0.52, h: top * 0.5, dx: 0, dz: 0, done: () => { for (const x of [g.base, g.head, g.baseGlow, g.headGlow]) x.dispose(); } };
    }
    if (key.startsWith('rat:')) {
      const t = +key.slice(4);
      const geo = gruntGeometry(t);
      const anim = new THREE.InstancedBufferAttribute(new Float32Array([0.9, 0, -1, 0]), 4);   // mid-stride
      geo.setAttribute('iAnim', anim);
      const mesh = new THREE.InstancedMesh(geo, v.ratMat, 1);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.frustumCulled = false;
      const inkGeo = inkNormals(gruntInkGeometry(t));
      inkGeo.setAttribute('iAnim', anim);
      inkInstanced(mesh, INK_PX.rat, { geo: inkGeo, rat: v.ratUniforms });
      const s = CFG.ratTypes[t].scale;
      const yaw = t === 3 ? 0.25 : -0.45;   // side-on, nose to the left (the shield rat turns to show its shield)
      mesh.setMatrixAt(0, new THREE.Matrix4().compose(AWAY, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)));
      // frame the whole model, shield and tail included
      geo.computeBoundingBox();
      const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3()).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(s);
      const ext = bb.getSize(new THREE.Vector3());
      return { obj: mesh, size: Math.max(ext.x, ext.z) * s * 0.66, h: c.y, dx: c.x, dz: c.z, done: () => { geo.dispose(); inkGeo.dispose(); } };
    }
    // giants and bosses: borrow a pooled body from the view
    const style = key === 'giant' ? false : key.slice(5);
    const g = v._getGiant(style);
    g.label.style.display = 'none';
    g.group.position.copy(AWAY);
    g.group.rotation.set(0, 0.55, 0);
    g.group.scale.setScalar(1);
    g.armR.rotation.x = -0.35; g.armL.rotation.x = 0.15;
    g.mat.emissive.setScalar(0); g.mat.color.setRGB(1, 1, 1);
    // framing (size across, height to look at) and a pose that shows off each boss
    let frame = { size: 2.7, h: 1.7 };
    if (style === 'slime') frame = { size: 2.0, h: 0.85 };
    else if (style === 'mole') { frame = { size: 2.6, h: 1.75 }; g.armL.rotation.x = -0.7; g.armR.rotation.x = -1.1; }
    else if (style === 'buzzard') { frame = { size: 3.9, h: 1.8 }; g.group.rotation.y = 0.35; g.armL.rotation.set(0, 0, -0.32); g.armR.rotation.set(0, 0, 0.32); }
    return { obj: g.group, ...frame, dx: 0, dz: 0, pooled: true, done: () => { g.inUse = false; g.group.visible = false; g.group.scale.setScalar(1); v.scene.add(g.group); } };
  }

  // Drawn straight into a corner of the game canvas (so every material keeps
  // the shader it already has), copied out, then the game frame is redrawn
  // over it in the same moment, so the portrait never shows on screen.
  _render(key, opts = {}) {
    const v = this.view, r = v.renderer, canvas = r.domElement, pr = r.getPixelRatio();
    const W = Math.min(SIZE * SS, canvas.width, canvas.height);
    const sub = this._subject(key);
    if (!sub.pooled) v.scene.add(sub.obj);
    sub.obj.visible = true;
    // a three-quarter view from the front, a little above
    const cam = this.camera, d = sub.size * 3.4;
    cam.position.set(AWAY.x + sub.dx + d * 0.62, AWAY.y + sub.h + d * 0.42, AWAY.z + sub.dz + d * 0.72);
    cam.lookAt(AWAY.x + sub.dx, AWAY.y + sub.h, AWAY.z + sub.dz);
    cam.updateMatrixWorld();
    // daylight colours, a plain backdrop, ink widths for this image size
    const saved = {
      bg: v.scene.background, hemi: v.hemi.color.getHex(), gnd: v.hemi.groundColor.getHex(), hi: v.hemi.intensity,
      sun: v.sun.color.getHex(), si: v.sun.intensity, res: inkUniforms.uRes.value.clone(), dpr: inkUniforms.uDpr.value,
    };
    v.scene.background = opts.clear ? KEY : BACKDROP;
    v.hemi.color.set(DAYLIGHT.sky); v.hemi.groundColor.set(DAYLIGHT.gnd); v.hemi.intensity = DAYLIGHT.hemi;
    v.sun.color.set(DAYLIGHT.sun); v.sun.intensity = DAYLIGHT.sunI;
    inkUniforms.uRes.value.set(W, W); inkUniforms.uDpr.value = (W / SIZE) * 1.1;
    // only the lights and the subject: everything else in the scene sits out this frame
    const hidden = [];
    for (const o of v.scene.children) if (o.visible && o !== sub.obj && o !== v.hemi && o !== v.sun && o !== v.sun.target) { o.visible = false; hidden.push(o); }
    const out = document.createElement('canvas'); out.width = out.height = SIZE;
    try {
      r.setViewport(0, 0, W / pr, W / pr);
      r.setScissor(0, 0, W / pr, W / pr);
      r.setScissorTest(true);
      r.render(v.scene, cam);
      const ox = out.getContext('2d');
      ox.imageSmoothingQuality = 'high';
      ox.drawImage(canvas, 0, canvas.height - W, W, W, 0, 0, SIZE, SIZE);
      if (opts.clear) keyOut(ox);
    } finally {
      for (const o of hidden) o.visible = true;
      r.setScissorTest(false);
      r.setViewport(0, 0, v.width, v.height);
      v.scene.background = saved.bg;
      v.hemi.color.setHex(saved.hemi); v.hemi.groundColor.setHex(saved.gnd); v.hemi.intensity = saved.hi;
      v.sun.color.setHex(saved.sun); v.sun.intensity = saved.si;
      inkUniforms.uRes.value.copy(saved.res); inkUniforms.uDpr.value = saved.dpr;
      if (!sub.pooled) v.scene.remove(sub.obj);
      sub.done();
    }
    return out.toDataURL('image/png');
  }
}

// Turn the magenta backdrop see-through, with soft edges: how magenta a pixel
// is sets its transparency, and the magenta mixed into its edge is taken out.
function keyOut(ctx) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const m = Math.min(r, b) - g;                 // 255 on the backdrop, about 0 on the model
    const a = Math.max(0, Math.min(1, 1 - (m - 70) / 150));
    if (a >= 1) continue;
    if (a <= 0.02) { d[i + 3] = 0; continue; }
    d[i] = Math.max(0, Math.min(255, (r - (1 - a) * 255) / a));
    d[i + 2] = Math.max(0, Math.min(255, (b - (1 - a) * 255) / a));
    d[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
}
