// Tool (run from a folder with @gltf-transform/core, functions, extensions, meshoptimizer
// and sharp installed, like merge-anim.mjs).
// A plain copy of a model for Meshy to rig: the mesh in its rest pose with its
// textures (JPEG), no skeleton, animations, custom attributes or compression.
// usage: node plain.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune, clearNodeParent, clearNodeTransform, getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp), root = doc.getRoot();
for (const a of root.listAnimations()) a.dispose();
for (const n of root.listNodes()) if (n.getSkin()) n.setSkin(null);
for (const s of root.listSkins()) s.dispose();
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) for (const sem of p.listSemantics()) if (!/^(POSITION|NORMAL|TEXCOORD_0)$/.test(sem)) p.setAttribute(sem, null);
await doc.transform(dequantize());
// bake every transform into the mesh, stand it on the ground at H metres tall (env H, default 2)
const scene = root.listScenes()[0];
for (const n of root.listNodes()) if (n.getMesh()) { clearNodeParent(n); clearNodeTransform(n); }
for (const n of root.listNodes()) if (!n.getMesh()) n.dispose();
for (const n of root.listNodes()) if (n.getMesh() && !scene.listChildren().includes(n)) scene.addChild(n);
{
  const b = getBounds(scene), H = +(process.env.H || 2), k = H / (b.max[1] - b.min[1]);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  for (const n of root.listNodes()) if (n.getMesh()) { n.setScale([k, k, k]).setTranslation([-cx * k, -b.min[1] * k, -cz * k]); clearNodeTransform(n); }
}
await doc.transform(prune({ keepLeaves: false }));
for (const t of root.listTextures()) { t.setImage(new Uint8Array(await sharp(Buffer.from(t.getImage())).jpeg({ quality: 86 }).toBuffer())).setMimeType('image/jpeg'); }
for (const e of root.listExtensionsUsed()) if (/meshopt|quantization|texture_webp/.test(e.extensionName)) e.dispose();
await io.write(out, doc);
const fs = await import('node:fs');
console.log(out.split('/').pop(), Math.round(fs.statSync(out).size / 1024) + ' KB', 'nodes', root.listNodes().length, 'meshes', root.listMeshes().length);
