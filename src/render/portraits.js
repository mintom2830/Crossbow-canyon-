// 3D portraits of every enemy for the Rat guide and the "New enemy" card.
// Each one is rendered once, on demand, with the game's own toon materials
// and ink outlines: the model is posed far off the map, a small camera looks
// at it, and the frame is read back into an image (data URL).
import * as THREE from 'three';
import { CFG } from '../config.js';
import { gruntGeometry, gruntInkGeometry } from './models.js';
import { inkInstanced, inkNormals, inkUniforms, INK_PX } from './toon.js';

const SIZE = 192;          // CSS pixels of the portrait image
const SS = 2;              // rendered at twice the size, then scaled down (smooth edges)
const AWAY = new THREE.Vector3(900, 0, 900);   // far outside the canyon
const DAYLIGHT = { sky: 0xfff6ea, gnd: 0x9a6a4a, hemi: 1.05, sun: 0xfff8ec, sunI: 2.3 };
const BACKDROP = new THREE.Color(0xf2d39a);   // warm sand behind every portrait

export class Portraits {
  constructor(view) {
    this.view = view;
    this.cache = new Map();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
  }

  // data URL of the portrait for a Rat guide key ('rat:N', 'giant', 'boss:NAME').
  // redraw false: leave repainting the game to a later flush() (when drawing several).
  get(key, redraw = true) {
    if (this.cache.has(key)) return this.cache.get(key);
    let url = '';
    try { url = this._render(key); } catch (err) { url = ''; }
    this.cache.set(key, url);
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
  _render(key) {
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
    v.scene.background = BACKDROP;
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
