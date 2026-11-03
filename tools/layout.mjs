import { CFG } from '../src/config.js';
import { road, plateauOutline, plateauSdf } from '../src/world.js';
const pts = []; for (let i = 0; i < road.count; i += 4) pts.push([road.px[i], road.pz[i]]);
const out = { road: pts, half: CFG.roadHalfWidth, plateaus: CFG.plateaus.map(p => plateauOutline(p)), slots: CFG.slots, fortress: CFG.fortress, fpad: CFG.fortressPad, walk: CFG.walk, len: road.length };
// clearance check: min distance from road centre to each plateau edge
for (const p of CFG.plateaus) { let m = 1e9; for (let i = 0; i < road.count; i++) { const d = -plateauSdf(p, road.px[i], road.pz[i]); if (d < m) m = d; } console.error('plateau clearance', p.x, p.z, m.toFixed(2)); }
for (const s of CFG.slots) console.error('slot', s.id, 'roadDist', road.distanceTo(s.x, s.z).toFixed(2), 'onPlateau', CFG.plateaus.some(p => plateauSdf(p, s.x, s.z) > 1.3));
console.error('fpad roadDist', road.distanceTo(CFG.fortressPad.x, CFG.fortressPad.z).toFixed(2));
console.error('road length', road.length.toFixed(1));
console.log(JSON.stringify(out));
