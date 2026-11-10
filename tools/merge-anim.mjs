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
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
// (the decoder lets a clip come from one of the game's own compressed files)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [out, ...pairs] = process.argv.slice(2);
const clips = pairs.map((p) => p.split('='));
const base = await io.read(clips[0][1]);
const root = base.getRoot();
for (const a of root.listAnimations()) a.dispose();
const nodeByName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
// a clip may come from another character on Meshy's skeleton (the bones are named and
// oriented alike): its hips are moved to this one's height, scaled by leg length
const baseHips = nodeByName.get('Hips') ? nodeByName.get('Hips').getTranslation() : null;
for (const [name, file] of clips) {
  const doc = await io.read(file);
  const srcHipsNode = doc.getRoot().listNodes().find((n) => n.getName() === 'Hips');
  const srcHips = srcHipsNode ? srcHipsNode.getTranslation() : null;
  const rebase = baseHips && srcHips && Math.abs(srcHips[1] - baseHips[1]) > Math.abs(baseHips[1]) * 0.03 ? baseHips[1] / srcHips[1] : 0;
  if (rebase) console.log(`${name}: hips from another body, scaled ${rebase.toFixed(2)}`);
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
      if (path === 'translation' && tn.getName() === 'Hips') {
        if (rebase) { for (let i = 0; i < arr.length; i += 3) { arr[i + 1] = baseHips[1] + (arr[i + 1] - srcHips[1]) * rebase; } arr[0] = baseHips[0]; arr[2] = baseHips[2]; }
        for (let i = 0; i < arr.length; i += 3) { arr[i] = arr[0]; arr[i + 2] = arr[2]; }
      }
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
