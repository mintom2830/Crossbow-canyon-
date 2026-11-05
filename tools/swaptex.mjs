// Tool (run from a folder with @gltf-transform/core, extensions, meshoptimizer and
// sharp installed, like merge-anim.mjs).
// Put a retextured copy's PBR maps (same UV layout) onto an animated model:
// colour, normal and metal/roughness, resized to SIZE px WebP.
// usage: node swaptex.mjs anim.glb retextured.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [animF, texF, out] = process.argv.slice(2);
const SIZE = +(process.env.SIZE || 1024);
const doc = await io.read(animF), src = await io.read(texF);
const sm = src.getRoot().listMaterials()[0];
const conv = async (t) => sharp(Buffer.from(t.getImage())).resize(SIZE, SIZE).webp({ quality: 82 }).toBuffer();
const root = doc.getRoot();
root.listExtensionsUsed().find((e) => e.extensionName === 'EXT_texture_webp') || doc.createExtension(EXTTextureWebP).setRequired(true);
const mk = async (t, name) => doc.createTexture(name).setMimeType('image/webp').setImage(new Uint8Array(await conv(t)));
const base = await mk(sm.getBaseColorTexture(), 'base');
const nrm = sm.getNormalTexture() ? await mk(sm.getNormalTexture(), 'normal') : null;
const mr = sm.getMetallicRoughnessTexture() ? await mk(sm.getMetallicRoughnessTexture(), 'mr') : null;
for (const m of root.listMaterials()) {
  const old = m.getBaseColorTexture();
  m.setBaseColorTexture(base);
  if (nrm) m.setNormalTexture(nrm).setNormalScale(sm.getNormalScale());
  if (mr) m.setMetallicRoughnessTexture(mr).setMetallicFactor(sm.getMetallicFactor()).setRoughnessFactor(sm.getRoughnessFactor());
  if (old && old !== base) old.dispose();
}
await io.write(out, doc);
console.log(out.split('/').pop(), Math.round((await import('node:fs')).statSync(out).size / 1024) + ' KB', 'metal', sm.getMetallicFactor(), 'rough', sm.getRoughnessFactor());
