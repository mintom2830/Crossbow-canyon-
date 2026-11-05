// Shrinks Meshy's image-to-3D towers for the game (see src/render/tower-models.js).
// Needs: npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp
// (in a scratch folder; they are not game dependencies).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, quantize, reorder, flatten, join, getSceneVertexCount, VertexCountMethod } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const [inp, out, trisArg = '7000', sizeArg = '512'] = process.argv.slice(2);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const root = doc.getRoot();
// base colour only: drop normal / metal-rough / occlusion / emissive maps
for (const m of root.listMaterials()) {
  m.setNormalTexture(null); m.setOcclusionTexture(null); m.setMetallicRoughnessTexture(null); m.setEmissiveTexture(null);
  m.setMetallicFactor(0); m.setRoughnessFactor(1);
}
const tris = () => { let n = 0; for (const me of root.listMeshes()) for (const p of me.listPrimitives()) n += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; return Math.round(n); };
await doc.transform(dedup(), flatten(), join(), weld(), prune());
const before = tris(), want = +trisArg;
if (before > want) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: want / before, error: 0.01, lockBorder: false }));
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+sizeArg, +sizeArg], quality: 82 }),
  reorder({ encoder: MeshoptEncoder }), quantize(), prune(),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(out, doc);
const { statSync } = await import('node:fs');
console.log(`${inp.split('/').pop()}: ${before} → ${tris()} triangles, ${(statSync(out).size / 1024).toFixed(0)} KB`);
