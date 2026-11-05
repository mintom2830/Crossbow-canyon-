// The farmer's materials, painted in code (see paintedMaps in toonpbr.js): each
// surface has its own base colour, relief (normal map) and roughness/metal, so
// the plaid shirt is woven cloth, the overalls are denim with orange seams, the
// boots and belt are grained leather, the hat is woven straw, the buttons and
// buckle are worn brass.
import { paintedMaps } from './toonpbr.js';

// a seeded random, so the textures are the same every load
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// soft noise blotches: n circles of radius r with alpha a
function blotches(x, S, n, r, color, a, seed) {
  const R = rng(seed);
  x.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const px = R() * S, py = R() * S, rr = r * (0.4 + R());
    x.globalAlpha = a * (0.4 + R() * 0.6);
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { x.beginPath(); x.arc(px + ox, py + oy, rr, 0, Math.PI * 2); x.fill(); }
  }
  x.globalAlpha = 1;
}

export function farmerMaps() {
  const M = {};
  // red-and-black buffalo plaid, woven: two crossing sets of dark bands over red,
  // a fine twill in the relief
  M.plaid = paintedMaps({
    size: 256, rough: 0.86, repeat: [3, 2],
    paint: (x, S) => {
      x.fillStyle = '#c3302a'; x.fillRect(0, 0, S, S);
      x.fillStyle = 'rgba(25,12,14,0.62)';
      x.fillRect(0, 0, S / 2, S); x.fillRect(0, 0, S, S / 2);
      x.fillStyle = 'rgba(255,190,170,0.10)';
      for (let i = 0; i < S; i += 4) { x.fillRect(i, 0, 1, S); x.fillRect(0, i, S, 1); }
      x.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = S / 4 - 2; i < S; i += S / 2) { x.fillRect(i, 0, 4, S); x.fillRect(0, i, S, 4); }
    },
    height: (x, S) => {
      for (let y = 0; y < S; y += 3) for (let i = 0; i < S; i += 3) { x.fillStyle = ((i + y) / 3) % 2 ? '#9a9a9a' : '#666'; x.fillRect((i + y) % S, y, 2, 2); }
    },
  });
  // blue denim: a diagonal twill, faded patches, an orange double seam
  M.denim = paintedMaps({
    size: 256, rough: 0.9, repeat: [2, 2],
    paint: (x, S) => {
      x.fillStyle = '#3b69ad'; x.fillRect(0, 0, S, S);
      blotches(x, S, 40, 22, '#5d8acb', 0.25, 7);
      blotches(x, S, 30, 18, '#2a4f89', 0.22, 9);
      x.strokeStyle = 'rgba(210,225,255,0.18)'; x.lineWidth = 1;
      for (let i = -S; i < S * 2; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); }
      // the seam down one side of the tile, with orange stitches each side
      x.fillStyle = 'rgba(20,40,80,0.45)'; x.fillRect(0, 0, 3, S);
      x.fillStyle = '#e8963a';
      for (let y = 2; y < S; y += 9) { x.fillRect(6, y, 2, 5); x.fillRect(S - 8, y, 2, 5); }
    },
    height: (x, S) => {
      x.strokeStyle = '#a8a8a8'; x.lineWidth = 1.4;
      for (let i = -S; i < S * 2; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); }
      x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, 3, S);
      x.fillStyle = '#d0d0d0'; for (let y = 2; y < S; y += 9) { x.fillRect(6, y, 2, 5); x.fillRect(S - 8, y, 2, 5); }
    },
  });
  // brown leather: a soft grain, darker creases, satin
  const leather = (base, seed) => paintedMaps({
    size: 256, rough: 0.5, repeat: [2, 2], normalStrength: 1.6,
    paint: (x, S) => { x.fillStyle = base; x.fillRect(0, 0, S, S); blotches(x, S, 90, 10, '#2c160b', 0.12, seed); blotches(x, S, 40, 14, '#a8704a', 0.12, seed + 1); },
    height: (x, S) => {
      blotches(x, S, 500, 2.2, '#b0b0b0', 0.5, seed + 2); blotches(x, S, 300, 2.2, '#505050', 0.5, seed + 3);
      x.strokeStyle = '#444'; x.lineWidth = 1.5; const R = rng(seed + 4);
      for (let i = 0; i < 14; i++) { const y = R() * S, x0 = R() * S; x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo(x0 + 20, y + (R() - 0.5) * 10, x0 + 40, y + (R() - 0.5) * 6); x.stroke(); }
    },
  });
  M.leather = leather('#6e4022', 21);
  M.boot = leather('#5f3a20', 31);
  M.sole = paintedMaps({ size: 64, rough: 0.75, paint: (x, S) => { x.fillStyle = '#2f1d12'; x.fillRect(0, 0, S, S); } });
  // woven straw: a basket weave of light and dark strands
  M.straw = paintedMaps({
    size: 256, rough: 0.82, repeat: [6, 2],
    paint: (x, S) => {
      x.fillStyle = '#ddb565'; x.fillRect(0, 0, S, S);
      const c = S / 8;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        x.fillStyle = (i + j) % 2 ? 'rgba(160,110,40,0.35)' : 'rgba(255,235,170,0.35)';
        for (let k = 0; k < 4; k++) { if ((i + j) % 2) x.fillRect(i * c + k * c / 4, j * c, c / 4 - 1, c); else x.fillRect(i * c, j * c + k * c / 4, c, c / 4 - 1); }
      }
    },
    height: (x, S) => {
      const c = S / 8;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) {
        x.fillStyle = (i + j) % 2 ? '#c8c8c8' : '#9a9a9a';
        if ((i + j) % 2) x.fillRect(i * c + k * c / 4, j * c, c / 4 - 1, c); else x.fillRect(i * c, j * c + k * c / 4, c, c / 4 - 1);
      }
    },
  });
  // the hat band: red cloth
  M.band = paintedMaps({
    size: 64, rough: 0.8, repeat: [8, 1],
    paint: (x, S) => { x.fillStyle = '#c63d2c'; x.fillRect(0, 0, S, S); x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < S; i += 3) x.fillRect(0, i, S, 1); },
    height: (x, S) => { x.fillStyle = '#aaa'; for (let i = 0; i < S; i += 3) x.fillRect(0, i, S, 1); },
  });
  // worn brass: scratches catch the light
  M.brass = paintedMaps({
    size: 64, rough: 0.3, metal: 1, normalStrength: 1.2,
    paint: (x, S) => { x.fillStyle = '#d2a548'; x.fillRect(0, 0, S, S); blotches(x, S, 20, 6, '#8a6420', 0.25, 41); },
    height: (x, S) => { x.strokeStyle = '#bbb'; x.lineWidth = 0.7; const R = rng(43); for (let i = 0; i < 30; i++) { const a = R() * S, b = R() * S; x.beginPath(); x.moveTo(a, b); x.lineTo(a + (R() - 0.5) * 30, b + (R() - 0.5) * 30); x.stroke(); } },
  });
  // skin: warm, with soft blotches and a fine pore relief
  M.skin = paintedMaps({
    size: 128, rough: 0.62, normalStrength: 0.8,
    paint: (x, S) => { x.fillStyle = '#f0b98f'; x.fillRect(0, 0, S, S); blotches(x, S, 30, 12, '#e79e78', 0.18, 51); },
    height: (x, S) => blotches(x, S, 300, 1.2, '#999', 0.4, 53),
  });
  // hair: dark brown strands
  M.hair = paintedMaps({
    size: 128, rough: 0.7, repeat: [4, 1],
    paint: (x, S) => { x.fillStyle = '#3a271d'; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(120,80,55,0.35)'; for (let i = 0; i < S; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 4, S); x.stroke(); } },
    height: (x, S) => { x.strokeStyle = '#bbb'; for (let i = 0; i < S; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 4, S); x.stroke(); } },
  });
  // the face, painted onto the head's skin (u around the head, the front at 0.5;
  // v up the head): eyes, brows, a smile and rosy cheeks. Two versions, eyes open
  // and closed, for blinking.
  const face = (closed) => paintedMaps({
    size: 512, rough: 0.6, normalStrength: 0.8,
    paint: (x, S) => {
      x.fillStyle = '#f0b98f'; x.fillRect(0, 0, S, S);
      blotches(x, S, 40, 16, '#e79e78', 0.14, 61);
      const U = (u) => u * S, V = (v) => (1 - v) * S;   // canvas y runs down, v up
      // cheeks
      x.fillStyle = 'rgba(232,110,100,0.35)';
      for (const s of [-1, 1]) { x.beginPath(); x.ellipse(U(0.5 + s * 0.085), V(0.43), S * 0.03, S * 0.035, 0, 0, Math.PI * 2); x.fill(); }
      // brows
      x.strokeStyle = '#3a271d'; x.lineWidth = S * 0.012; x.lineCap = 'round';
      for (const s of [-1, 1]) { x.beginPath(); x.moveTo(U(0.5 + s * 0.03), V(0.64)); x.quadraticCurveTo(U(0.5 + s * 0.058), V(0.675), U(0.5 + s * 0.085), V(0.645)); x.stroke(); }
      // eyes
      for (const s of [-1, 1]) {
        const cx = U(0.5 + s * 0.055), cy = V(0.555);
        if (closed) { x.strokeStyle = '#26170f'; x.lineWidth = S * 0.008; x.beginPath(); x.moveTo(cx - S * 0.014, cy); x.quadraticCurveTo(cx, cy + S * 0.012, cx + S * 0.014, cy); x.stroke(); continue; }
        x.fillStyle = '#26170f'; x.beginPath(); x.ellipse(cx, cy, S * 0.0135, S * 0.03, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx + S * 0.004, cy - S * 0.01, S * 0.004, S * 0.007, 0, 0, Math.PI * 2); x.fill();
      }
      // a broad smile
      x.strokeStyle = '#7a2d22'; x.lineWidth = S * 0.009;
      x.beginPath(); x.moveTo(U(0.47), V(0.4)); x.quadraticCurveTo(U(0.5), V(0.355), U(0.53), V(0.4)); x.stroke();
    },
    height: (x, S) => blotches(x, S, 600, 1.3, '#999', 0.35, 63),
  });
  M.face = face(false);
  M.faceClosed = face(true);
  return M;
}
