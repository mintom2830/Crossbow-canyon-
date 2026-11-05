// Stylized PBR on top of the cartoon look. The diffuse light still falls into the
// three flat toon bands (toon.js), but each surface also has:
//   normal map   fine relief: weave, stitching, grain, scratches, fur
//   ORM map      one texture, three channels (the glTF convention):
//                R ambient occlusion (creases and folds darken)
//                G roughness (a smooth surface gets a small sharp highlight, a rough
//                  one a broad faint one or none)
//                B metalness (metal loses its diffuse, takes its colour into the
//                  highlight and reflects a two-tone sky and ground)
// The highlight is drawn as a crisp toon band from the scene's sun, so metal reads
// as polished and worn, leather as satin, cloth as matte, without leaving the
// cartoon style. Everything is in one shader pass: no environment maps, no extra
// lights, cheap enough for phones.
import * as THREE from 'three';
import { toonGradient } from './toon.js';

// GLSL added after the toon lighting: AO, the sun highlight, metal reflections
const PBR_GLSL = /* glsl */`
  {
    vec3 orm = texture2D( uORM, vOrmUv ).rgb;
    float ao = mix( 1.0, orm.r, uAOStrength ), rough = clamp( orm.g * uRough, 0.04, 1.0 ), metal = orm.b * uMetal;
    vec3 V = normalize( vViewPosition );
    vec3 alb = diffuseColor.rgb;
    // metal has almost no diffuse of its own
    outgoingLight *= mix( 1.0, 0.42, metal );
    #if NUM_DIR_LIGHTS > 0
      vec3 L = directionalLights[ 0 ].direction;
      vec3 H = normalize( L + V );
      float nh = max( dot( normal, H ), 0.0 ), nl = dot( normal, L );
      float shin = mix( 160.0, 6.0, rough );
      float s = pow( nh, shin ) * step( 0.0, nl );
      // a crisp toon band, softer on rough surfaces; strength falls with roughness
      float band = smoothstep( 0.5 - 0.06 * rough, 0.5 + 0.06 * rough, s ) + 0.35 * smoothstep( 0.12, 0.2, s ) * ( 1.0 - rough );
      float k = mix( 0.06, 1.0, metal ) * ( 1.0 - 0.9 * rough ) * uSpec;
      outgoingLight += band * k * mix( vec3( 1.0 ), alb * 1.6, metal ) * directionalLights[ 0 ].color;
    #endif
    #if NUM_HEMI_LIGHTS > 0
      // metal reflects a two-tone world: bright sky above, warm ground below,
      // split by a soft toon edge, brighter at grazing angles
      vec3 Rw = reflect( -V, normal );
      Rw = ( vec4( Rw, 0.0 ) * viewMatrix ).xyz;
      float up = smoothstep( -0.08, 0.08, Rw.y );
      vec3 env = mix( hemisphereLights[ 0 ].groundColor * 0.55, hemisphereLights[ 0 ].skyColor * 1.1, up );
      float fres = 0.35 + 0.65 * pow( 1.0 - max( dot( normal, V ), 0.0 ), 3.0 );
      outgoingLight += env * alb * metal * fres * ( 1.0 - 0.6 * rough ) * 0.9;
    #endif
    outgoingLight *= ao;
  }
`;

// opts: the usual MeshToonMaterial options (map, normalMap, normalScale, color,
// side, ...) plus ormMap (the packed AO/roughness/metal map; without it the
// surface is treated as rough, non-metal cloth), rough and metal (multipliers),
// spec (highlight strength), aoStrength, and extend(shader) to add more GLSL.
export function toonPBR(opts = {}) {
  const { ormMap = null, rough = 1, metal = 1, spec = 1, aoStrength = 1, extend = null, key = '', ...rest } = opts;
  const mat = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...rest });
  const orm = ormMap || flatORM();
  mat.userData.pbr = { uORM: { value: orm }, uRough: { value: rough }, uMetal: { value: metal }, uSpec: { value: spec }, uAOStrength: { value: aoStrength } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.pbr);
    // the ORM map shares the colour map's UVs
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vOrmUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvOrmUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uORM;\nuniform float uRough, uMetal, uSpec, uAOStrength;\nvarying vec2 vOrmUv;')
      .replace('#include <opaque_fragment>', PBR_GLSL + '\n#include <opaque_fragment>');
    if (extend) extend(sh, mat);
  };
  mat.customProgramCacheKey = () => 'toonpbr-v1' + key;
  return mat;
}

// a 1x1 ORM: no occlusion, rough, not metal
let flat = null;
function flatORM() {
  if (flat) return flat;
  flat = new THREE.DataTexture(new Uint8Array([255, 230, 0, 255]), 1, 1, THREE.RGBAFormat);
  flat.needsUpdate = true;
  return flat;
}

// ------------------------------------------------------------- painted maps
// A material's maps painted in code, so every surface has its own base colour,
// relief and roughness without shipping images. paint(x, S) draws the base colour;
// height(x, S) draws a grey relief (white is high) that becomes the normal map;
// orm(x, S) draws the packed AO/roughness/metal map (or give rough and metal as
// constants, and ao from the relief: crevices darken). Textures repeat.
export function paintedMaps({ size = 256, paint, height = null, orm = null, rough = 0.8, metal = 0, aoFromHeight = 0.5, normalStrength = 2.5, repeat = [1, 1] }) {
  const can = (w = size) => { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, w) : Object.assign(document.createElement('canvas'), { width: w, height: w }); return c; };
  const base = can(), bx = base.getContext('2d');
  paint(bx, size);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const out = { map: tex(base, true) };
  let hd = null;
  if (height) {
    const hc = can(), hx = hc.getContext('2d');
    hx.fillStyle = '#808080'; hx.fillRect(0, 0, size, size);
    height(hx, size);
    hd = hx.getImageData(0, 0, size, size).data;
    const nc = can(), nx = nc.getContext('2d'), img = nx.createImageData(size, size), d = img.data;
    const H = (x, y) => hd[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      // Sobel on the wrapped relief: the normal leans away from the slope
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx_ = -dx * normalStrength, ny_ = dy * normalStrength, nz = 1;
      const l = Math.hypot(nx_, ny_, nz); nx_ /= l; ny_ /= l; nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx_ * 0.5 + 0.5) * 255; d[i + 1] = (ny_ * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    nx.putImageData(img, 0, 0);
    out.normalMap = tex(nc, false);
  }
  const oc = can(), ox = oc.getContext('2d');
  if (orm) orm(ox, size);
  else {
    const img = ox.createImageData(size, size), d = img.data;
    for (let i = 0; i < size * size; i++) {
      const h = hd ? hd[i * 4] / 255 : 0.5;
      d[i * 4] = 255 * (1 - aoFromHeight * Math.max(0, 0.5 - h) * 2);   // the low parts of the relief are in shadow
      d[i * 4 + 1] = 255 * Math.min(1, Math.max(0, rough + (hd ? (0.5 - h) * 0.15 : 0)));
      d[i * 4 + 2] = 255 * metal; d[i * 4 + 3] = 255;
    }
    ox.putImageData(img, 0, 0);
  }
  out.ormMap = tex(oc, false);
  return out;
}
