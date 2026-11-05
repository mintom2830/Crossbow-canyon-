// Tool (run from a folder with @gltf-transform/core, extensions, meshoptimizer and
// sharp installed, like merge-anim.mjs). Gives a Meshy model the rest of a PBR
// material, derived from its colour texture, stored in the GLB:
//   normal map   relief from the fine detail of the texture's brightness (fur,
//                cloth weave, panel lines, scratches): a high-pass of the
//                luminance, turned into slopes
//   ORM map      R occlusion (the darkest creases a little darker), G roughness,
//                B metalness; metal is picked out by colour per model (steel:
//                bright and grey; gold: saturated yellow), everything else rough
// The game draws them with its stylized PBR toon material (src/render/toonpbr.js).
// usage: node pbr-maps.mjs model.glb metal=steel,gold [strength=2]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [file, ...opts] = process.argv.slice(2);
const opt = Object.fromEntries(opts.map((o) => o.split('=')));
const metals = (opt.metal || '').split(',').filter(Boolean), strength = +(opt.strength || 2);
const doc = await io.read(file);
const mats = doc.getRoot().listMaterials();
for (const mat of mats) {
  const tex = mat.getBaseColorTexture();
  if (!tex) continue;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const lum = new Float32Array(N), sat = new Float32Array(N), hue = new Float32Array(N), val = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b; val[i] = mx; sat[i] = mx > 0 ? d / mx : 0;
    let h = 0; if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue[i] = (h * 60 + 360) % 360;
  }
  // box blurs of the luminance (separable, clamped at the edges: UV islands have seams anyway)
  const blur = (src, r) => {
    const tmp = new Float32Array(N), out = new Float32Array(N);
    for (let y = 0; y < H; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = acc / (2 * r + 1); acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = acc / (2 * r + 1); acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
    return out;
  };
  const fine = blur(lum, 1), coarse = blur(lum, Math.max(3, Math.round(W / 128)));
  const height = new Float32Array(N);
  for (let i = 0; i < N; i++) height[i] = fine[i] - coarse[i];
  const nrm = Buffer.alloc(N * 3), orm = Buffer.alloc(N * 3);
  const Hh = (x, y) => height[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const isMetal = (i) => {
    let m = 0;
    // (pure white is cloth or fur, not steel)
    if (metals.includes('steel')) m = Math.max(m, smooth(0.22, 0.1, sat[i]) * smooth(0.32, 0.48, val[i]) * smooth(0.92, 0.8, val[i]));
    if (metals.includes('gold')) m = Math.max(m, smooth(0.38, 0.55, sat[i]) * smooth(0.5, 0.65, val[i]) * smooth(28, 38, hue[i]) * smooth(62, 52, hue[i]));
    return m;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const dx = (Hh(x + 1, y - 1) + 2 * Hh(x + 1, y) + Hh(x + 1, y + 1)) - (Hh(x - 1, y - 1) + 2 * Hh(x - 1, y) + Hh(x - 1, y + 1));
    const dy = (Hh(x - 1, y + 1) + 2 * Hh(x, y + 1) + Hh(x + 1, y + 1)) - (Hh(x - 1, y - 1) + 2 * Hh(x, y - 1) + Hh(x + 1, y - 1));
    // glTF normal maps: +x right, +y up (the image's rows run down)
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    nrm[i * 3] = Math.round((nx * 0.5 + 0.5) * 255); nrm[i * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255); nrm[i * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    const m = isMetal(i);
    // creases (well below their surroundings) a little darker
    const ao = 1 - 0.6 * Math.max(0, Math.min(1, (coarse[i] - fine[i]) * 4));
    const rough = 0.82 * (1 - m) + 0.32 * m + (fine[i] - coarse[i]) * 0.3;
    orm[i * 3] = Math.round(255 * ao); orm[i * 3 + 1] = Math.round(255 * Math.max(0.05, Math.min(1, rough))); orm[i * 3 + 2] = Math.round(255 * m);
  }
  const enc = (buf) => sharp(buf, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 82 }).toBuffer();
  const nt = doc.createTexture(tex.getName() + '-normal').setImage(await enc(nrm)).setMimeType('image/webp');
  const ot = doc.createTexture(tex.getName() + '-orm').setImage(await enc(orm)).setMimeType('image/webp');
  mat.setNormalTexture(nt).setNormalScale(1);
  mat.setMetallicRoughnessTexture(ot).setMetallicFactor(1).setRoughnessFactor(1);
  mat.setOcclusionTexture(ot).setOcclusionStrength(1);
  for (const t of ['normalTextureInfo', 'metallicRoughnessTextureInfo', 'occlusionTextureInfo']) { const ti = mat['get' + t[0].toUpperCase() + t.slice(1)](); const bi = mat.getBaseColorTextureInfo(); if (ti && bi) ti.setTexCoord(bi.getTexCoord()); }
  let metalShare = 0; for (let i = 0; i < N; i++) metalShare += isMetal(i);
  console.log(file.split('/').pop(), `${W}x${H}`, 'metal', (100 * metalShare / N).toFixed(1) + '%');
}
await io.write(file, doc);
function smooth(a, b, x) { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); }
