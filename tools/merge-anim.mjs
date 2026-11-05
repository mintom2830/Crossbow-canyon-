// Tool (run from a folder with @gltf-transform/core, extensions, functions, meshoptimizer and sharp installed).
// Merge Meshy animation GLBs (each: the same rigged character + one clip) into one
// GLB: the character once, every clip renamed to its state (idle, walk, ...).
// Root motion is removed (the game moves the character): the hips keep their
// height but not their travel. Then: simplify to TRIS, texture to SIZE px WebP,
// meshopt compression.
// usage: node merge-anim.mjs out.glb name=in.glb name=in.glb ...   (env TRIS, SIZE)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { resample, prune, dedup, weld, simplify, textureCompress, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [out, ...pairs] = process.argv.slice(2);
const clips = pairs.map((p) => p.split('='));
const base = await io.read(clips[0][1]);
const root = base.getRoot();
for (const a of root.listAnimations()) a.dispose();
const nodeByName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
for (const [name, file] of clips) {
  const doc = await io.read(file);
  for (const src of doc.getRoot().listAnimations()) {
    const anim = base.createAnimation(name);
    for (const ch of src.listChannels()) {
      const tn = ch.getTargetNode(), path = ch.getTargetPath();
      const dst = nodeByName.get(tn.getName());
      if (!dst) continue;
      const s = ch.getSampler();
      const inp = base.createAccessor().setType(s.getInput().getType()).setArray(s.getInput().getArray().slice()).setBuffer(buffer);
      let arr = s.getOutput().getArray().slice();
      // in place: the hips keep bobbing up and down but don't travel
      if (path === 'translation' && tn.getName() === 'Hips') { for (let i = 0; i < arr.length; i += 3) { arr[i] = arr[0]; arr[i + 2] = arr[2]; } }
      const outp = base.createAccessor().setType(s.getOutput().getType()).setArray(arr).setBuffer(buffer);
      const sampler = base.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(dst).setTargetPath(path).setSampler(sampler));
    }
  }
}
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const tris = +(process.env.TRIS || 0);
await base.transform(
  resample(), dedup(), prune(), weld(),
  ...(tris ? [simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, tris / count()), error: +(process.env.ERR || 0.01), lockBorder: false })] : []),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+(process.env.SIZE || 512), +(process.env.SIZE || 512)], quality: 82 }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }), prune(),
);
function count() { let n = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; return n; }
await io.write(out, base);
const fs = await import('node:fs');
console.log(out.split('/').pop(), 'tris', count(), 'clips', root.listAnimations().map((a) => a.getName()).join(','), Math.round(fs.statSync(out).size / 1024) + ' KB');
