// Tool (run from a folder with @gltf-transform/core, extensions, meshoptimizer installed).
// keep one named clip of a merged model: node oneclip.mjs in.glb clip out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, name, out] = process.argv.slice(2);
const doc = await io.read(inp);
for (const a of doc.getRoot().listAnimations()) if (a.getName() !== name) a.dispose();
await doc.transform(prune());
await io.write(out, doc);
