// Weapon skins (bought in the Shop): every crossbow and cannon, their arrows
// and the farmer's pitchfork are repainted in the skin's shades. The model's
// own light and dark tones are kept: each colour is mapped by its brightness
// onto the skin's dark → mid → light ramp, and strongly coloured trim (flags,
// gems, studs) takes the skin's accent colour. Lava's bright parts glow.
import * as THREE from 'three';
import { CFG } from '../config.js';

const _c = new THREE.Color(), _o = new THREE.Color(), _h = { h: 0, s: 0, l: 0 };
const ramps = new Map();
function ramp(id) {
  let r = ramps.get(id);
  if (!r) {
    const S = CFG.skins[id];
    r = S && S.colors ? { dark: new THREE.Color(S.colors[0]), mid: new THREE.Color(S.colors[1]), light: new THREE.Color(S.colors[2]), accent: new THREE.Color(S.accent ?? S.colors[2]), glow: id === 'lava' } : null;
    ramps.set(id, r);
  }
  return r;
}

// The colour a skin paints in place of r, g, b (linear 0..1). Returns out.
export function skinColor(id, r, g, b, out = new THREE.Color()) {
  const R = ramp(id);
  out.setRGB(r, g, b);
  if (!R) return out;
  _o.setRGB(r, g, b);
  _o.getHSL(_h);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const t = Math.min(0.9, Math.max(0, (L - 0.01) / 0.6) ** 0.8);   // the palest parts stop short of the lightest shade
  if (R.glow) {
    // Lava: grey stone and wood turn to black rock; coloured parts glow hot orange
    if (_h.s > 0.35 && _h.l > 0.2) return out.copy(R.light).lerp(R.accent, Math.min(1, t * 1.2));
    return out.copy(R.dark).lerp(R.mid, t);
  } else if (t < 0.5) out.copy(R.dark).lerp(R.mid, t * 2);
  else out.copy(R.mid).lerp(R.light, (t - 0.5) * 2);
  // vivid trim keeps standing out, in the accent colour
  if (_h.s > 0.55 && _h.l > 0.25 && _h.l < 0.8) out.lerp(R.accent, 0.65);
  return out.lerp(_o, 0.08);
}

// Repaint a geometry's vertex colours for a skin (the originals are kept, so
// skins can be swapped back and forth).
export function applySkin(geo, id) {
  const col = geo && geo.attributes.color;
  if (!col) return;
  if (!geo.userData.baseColors) geo.userData.baseColors = col.array.slice();
  const src = geo.userData.baseColors, dst = col.array;
  for (let i = 0; i < src.length; i += 3) {
    skinColor(id, src[i], src[i + 1], src[i + 2], _c);
    dst[i] = _c.r; dst[i + 1] = _c.g; dst[i + 2] = _c.b;
  }
  col.needsUpdate = true;
}
