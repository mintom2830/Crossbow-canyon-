// Cartoon look: banded toon shading and dark ink outlines.
//
// Shading: every lit surface uses MeshToonMaterial with a stepped gradient, so
// light falls into three flat bands (lit, mid, shadow) instead of a smooth ramp.
//
// Outlines ("ink"): the inverted-hull trick. Each outlined mesh gets a twin that
// draws only its back faces in a dark ink colour, pushed outward by a fixed
// number of screen pixels, so every silhouette gets an even line at any
// distance. The push direction comes from a smoothed normal (oNormal):
// low-poly models are flat shaded, and pushing along face normals would tear
// the hull apart at every hard edge.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAT_POSE_GLSL } from './ratanim.js';

export const INK = 0x2a1810;

// ------------------------------------------------------------- toon shading
// light band by how directly a face looks at the sun (dot of normal and light)
const BANDS = [[-0.08, 0.2], [0.4, 0.58], [2, 1.0]];   // [upper limit, brightness]
let gradientTex = null;
export function toonGradient() {
  if (gradientTex) return gradientTex;
  const n = 64, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n) * 2 - 1;   // the shader samples at dot * 0.5 + 0.5
    const v = BANDS.find((b) => d < b[0])[1];
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255); data[i * 4 + 3] = 255;
  }
  gradientTex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  gradientTex.minFilter = gradientTex.magFilter = THREE.NearestFilter;
  gradientTex.generateMipmaps = false;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

export const toon = (opts = {}) => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), ...opts });

// ------------------------------------------------------------------ outlines
// line widths in CSS pixels
export const INK_PX = { thin: 1.6, rat: 1.75, prop: 2.2, unit: 2.5, big: 3.1, terrain: 2.7 };

// shared by every ink material; the view updates them on resize
export const inkUniforms = {
  uRes: { value: new THREE.Vector2(1280, 800) },   // drawing-buffer size in device pixels
  uDpr: { value: 1 },                               // device pixels per CSS pixel
  uInkScale: { value: 1 },                          // global width multiplier (quality setting)
};

const INK_PROJECT = /* glsl */`
  vec4 mvPosition = vec4( transformed, 1.0 );
  vec3 inkN = oN;
  float inkK = inkFade;
  #ifdef USE_BATCHING
    mvPosition = batchingMatrix * mvPosition;
  #endif
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    inkN = mat3( instanceMatrix ) * inkN;
    inkK *= smoothstep( 0.0, 0.3, length( instanceMatrix[ 0 ].xyz ) );
  #endif
  inkK *= smoothstep( 0.0, 0.3, length( modelMatrix[ 0 ].xyz ) );
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  // push the hull out along its normal by a fixed number of screen pixels.
  // A normal pointing at (or away from) the camera barely moves, so the far
  // side of a model never pokes out as spikes; any normal with a real
  // sideways part gets the full width, so box edges seen from above get a
  // proper line too.
  vec3 inkV = normalize( normalMatrix * inkN );
  float inkSide = min( 1.0, length( inkV.xy ) * 2.5 );
  vec2 inkDir = ( projectionMatrix * vec4( inkV, 0.0 ) ).xy * uRes;
  float inkLen = length( inkDir );
  if ( inkLen > 1e-6 ) gl_Position.xy += inkDir / inkLen * ( uPx * uDpr * uInkScale * inkK * inkSide * 2.0 ) / uRes * gl_Position.w;
`;

const inkCache = new Map();
// px: line width in CSS pixels.
// pose: the outline follows a GPU-animated model: { key, glsl (declarations),
// begin (GLSL that defines transformed, oN and inkFade), uniforms }.
// rat: shorthand for the small rats' pose (ratanim.js), given their uniforms.
export function inkMaterial(px = INK_PX.unit, { color = INK, rat = null, pose = null } = {}) {
  if (rat) {
    pose = {
      key: 'rat', glsl: RAT_POSE_GLSL, uniforms: { uTime: rat.uTime },
      // a defeated rat shrinks away; its outline thins with it instead of leaving a dot
      begin: 'RatPose rp = ratPose( position );\nvec3 transformed = rp.pos;\nvec3 oN = rp.rot * oNormal;\nfloat inkFade = iAnim.w > 0.0 ? 1.0 - smoothstep( 0.45, 0.85, iAnim.w ) : ( iAnim.w < 0.0 ? 1.0 + iAnim.w : 1.0 );',
    };
  }
  const key = `${px}|${color}|${pose ? pose.key : ''}`;
  if (inkCache.has(key)) return inkCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRes = inkUniforms.uRes;
    sh.uniforms.uDpr = inkUniforms.uDpr;
    sh.uniforms.uInkScale = inkUniforms.uInkScale;
    sh.uniforms.uPx = { value: px };
    if (pose) Object.assign(sh.uniforms, pose.uniforms);
    const head = 'attribute vec3 oNormal;\nuniform vec2 uRes;\nuniform float uDpr;\nuniform float uPx;\nuniform float uInkScale;\n' + (pose ? pose.glsl : '');
    const begin = pose ? pose.begin : 'vec3 transformed = vec3( position );\nvec3 oN = oNormal;\nfloat inkFade = 1.0;';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + head)
      .replace('#include <begin_vertex>', begin)
      .replace('#include <project_vertex>', INK_PROJECT);
  };
  m.customProgramCacheKey = () => 'ink-v3' + (pose ? '-' + pose.key : '');
  inkCache.set(key, m);
  return m;
}

// Smoothed normals for the outline hull: the average normal of every vertex
// that shares a position. Written as the oNormal attribute (in place).
export function inkNormals(geo) {
  if (geo.attributes.oNormal || !geo.attributes.position) return geo;
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const n = pos.count;
  const keyOf = new Int32Array(n);
  const map = new Map();
  const sums = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    let id = map.get(k);
    if (id === undefined) { id = sums.length / 3; map.set(k, id); sums.push(0, 0, 0); }
    keyOf[i] = id;
    sums[id * 3] += nor.getX(i); sums[id * 3 + 1] += nor.getY(i); sums[id * 3 + 2] += nor.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const id = keyOf[i];
    let x = sums[id * 3], y = sums[id * 3 + 1], z = sums[id * 3 + 2];
    let l = Math.hypot(x, y, z);
    if (l < 1e-4) { x = nor.getX(i); y = nor.getY(i); z = nor.getZ(i); l = Math.hypot(x, y, z) || 1; }
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  geo.setAttribute('oNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

// One outline hull for several geometries that move together (a tower head and
// its glowing crystals): positions only, with normals smoothed across all of them.
export function inkGeometry(...geos) {
  const parts = [];
  for (const g of geos) {
    if (!g || !g.attributes.position || !g.attributes.position.count) continue;
    const src = g.index ? g.toNonIndexed() : g;
    const p = new THREE.BufferGeometry();
    p.setAttribute('position', src.attributes.position.clone());
    if (src.attributes.normal) p.setAttribute('normal', src.attributes.normal.clone());
    else p.computeVertexNormals();
    parts.push(p);
  }
  if (!parts.length) return new THREE.BufferGeometry();
  const g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  inkNormals(g);
  g.deleteAttribute('normal');
  g.computeBoundingSphere();
  return g;
}

// Adds an ink outline to a mesh, as a child so it follows every move.
export function addInk(mesh, px = INK_PX.unit, geo = null) {
  const g = geo || inkNormals(mesh.geometry);
  const ink = new THREE.Mesh(g, inkMaterial(px));
  ink.castShadow = ink.receiveShadow = false;
  ink.raycast = () => {};
  ink.frustumCulled = mesh.frustumCulled;
  ink.renderOrder = mesh.renderOrder;
  ink.visible = !!(g.attributes.position && g.attributes.position.count);
  ink.name = 'ink';
  mesh.add(ink);
  mesh.userData.ink = ink;
  return ink;
}

// Swaps the geometry of a mesh and of its outline together.
export function setInkedGeometry(mesh, geo, inkGeo = null) {
  mesh.geometry = geo;
  const ink = mesh.userData.ink;
  if (!ink) return;
  const g = inkGeo || (geo && geo.attributes.position ? inkNormals(geo) : null);
  ink.visible = !!(g && g.attributes.position && g.attributes.position.count);
  if (g) ink.geometry = g;
}

// Outline for an InstancedMesh: a twin InstancedMesh that shares its instance
// matrices and always draws as many instances. geo may be a cheaper hull with
// the same per-instance attributes.
export function inkInstanced(mesh, px = INK_PX.unit, { geo = null, rat = null, pose = null } = {}) {
  const g = geo || inkNormals(mesh.geometry);
  const ink = new THREE.InstancedMesh(g, inkMaterial(px, { rat, pose }), 1);
  ink.instanceMatrix = mesh.instanceMatrix;
  Object.defineProperty(ink, 'count', { get: () => mesh.count, set: () => {}, configurable: true });
  ink.frustumCulled = false;
  ink.castShadow = ink.receiveShadow = false;
  ink.raycast = () => {};
  ink.renderOrder = mesh.renderOrder;
  ink.name = 'ink';
  mesh.userData.ink = ink;
  mesh.add(ink);   // instanced meshes sit at the origin, so the twin can be a child
  return ink;
}
