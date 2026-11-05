// More moving parts for the Meshy-rigged enemies. Meshy's auto-rig gives a 24-bone
// humanoid skeleton (hips, spine, neck, head, arms, legs, toes); everything else -
// ears, jaw, tail, cape, fingers, the crown on a head - rides along stiffly
// with the bone it sits on. This adds a bone for each of those parts, found from
// where the skin sits around the rig's own landmarks, and moves the skin onto it
// smoothly (each vertex keeps some of its old bone near the part's root), so every
// part can move on its own:
//   ears     two bones on top of the head: they flop back with speed, swing out of
//            turns on springs, bounce on every step and twitch now and then
//   jaw      a hinge at the back of the mouth: it drops open for a roar, a blow, a hit
//   tail     a chain of four bones from root to tip, traced along the surface (so a
//            curly tail works): a wave runs down it and it trails out of turns
//   cape     a chain of three bones down the back: it billows out behind as it walks
//            and swings from side to side as it turns
//   fingers  one bone per empty hand across the knuckles: a fist for a blow, spread
//            on a hit, a loose flex as it walks (a hand holding a weapon is left be)
//   hat      the crown, topknot or hood on top of the head: it wobbles on a spring
//            with every step, turn and hit
// Bones are added once to the loaded model, before it is cloned for each enemy.
// The enemies move as they did when the game began, so on them these bones are held
// still (they keep the skin re-hung where it belongs: the healer's cloak and the
// ratling's tail off the hand); only the farmer's hat moves on its spring.
import * as THREE from 'three';

// which parts each model has, and per-model tuning:
//   ears: how far they move (0..1+); earSide: [from, to] how far out from the
//   middle of the head the ears start (head-bone lengths); jawTop: how high the jaw
//   reaches (fraction of the head's height); capeBehind: [from, to] how far behind
//   the body the cape starts (fraction of height); capeAll: the cape's skin comes
//   off the arms too (Meshy weighted the healer's cloak to a hand); tailUp: how far
//   above the hips a tail may reach; tailX: how far out to the side (fraction of
//   width); tailBehind: how far behind the body it starts; tailBone: the bone Meshy
//   hung the tail on, if not the hips (the ratling's is on a hand); hat: how much
//   it moves; fingers: which hands are empty (Meshy's names; the others hold a
//   weapon, or are hidden in a sleeve); handR: how far a hand reaches (fraction of
//   the arm: the mole's claws are long)
export const ARTIC = {
  giant: { ears: 0.8, jaw: true, hat: 1 },
  warlord: { cape: true, jaw: true, jawTop: 0.22, fingers: ['Left'] },
  baron: { ears: 0.7, tail: true, fingers: ['Left'] },
  king: { ears: 0.9, cape: true, jaw: true, hat: 0.6 },
  mole: { fingers: ['Left', 'Right'], handR: 1.2 },
  // (the Meshy-7 healer wears her hood down: no hat)
  'rat-4': { ears: 1, cape: true, capeBehind: [0.025, 0.07], capeAll: true },
  'rat-6': { ears: 1.2, earSide: [0.6, 0.85], tail: true, tailUp: 0.12, tailX: 0.3, tailBehind: 0.1, tailBone: 'LeftHand' },
  farmer: { hat: 1 },
};

const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// Adds the bones to a loaded scene's skinned mesh. Returns a list of what was added
// ({ name, kind, side, k, ax } per bone: k its place along a chain or how much it
// moves, ax its turning axes in its own space) for the movers below.
export function articulate(scene, name) {
  const want = ARTIC[name];
  let skin = null;
  scene.traverse((o) => { if (!skin && o.isSkinnedMesh) skin = o; });
  if (!want || !skin) return [];
  scene.updateMatrixWorld(true);
  const sk = skin.skeleton, bones = sk.bones;
  const byName = (n) => bones.find((b) => b.name === n);
  const head = byName('Head'), top = byName('head_end'), front = byName('headfront'), hips = byName('Hips');
  const spine = byName('Spine02') || byName('Spine01');
  if (!head || !hips) return [];
  const W = (b) => b.getWorldPosition(new THREE.Vector3());
  const geo = skin.geometry, pos = geo.attributes.position, n = pos.count;
  // skin weights as plain arrays (they may be stored quantized)
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) { idx[i * 4 + c] = si.getComponent(i, c); wts[i * 4 + c] = sw.getComponent(i, c); }
  // where every vertex sits in the model's rest pose, skinned as the graphics card
  // would (the optimiser stores positions quantised and folds the scale back in
  // through the bones' inverse bind matrices, so the raw positions are not it)
  const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]));
  const rest = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(skin.bindMatrix);
    let x = 0, y = 0, z = 0;
    for (let c = 0; c < 4; c++) { const w = wts[i * 4 + c]; if (w <= 0) continue; _w.copy(_v).applyMatrix4(bm[idx[i * 4 + c]]); x += _w.x * w; y += _w.y * w; z += _w.z * w; }
    rest[i * 3] = x; rest[i * 3 + 1] = y; rest[i * 3 + 2] = z;
  }
  const R = (i) => _v.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
  const box = new THREE.Box3(); for (let i = 0; i < n; i++) box.expandByPoint(R(i));
  const size = box.getSize(new THREE.Vector3()), H = size.y;
  const iHead = bones.indexOf(head), all = bones.map((_, i) => i);
  const weightOf = (i, b) => { let w = 0; for (let c = 0; c < 4; c++) if (idx[i * 4 + c] === b) w += wts[i * 4 + c]; return w; };
  const weightOn = (i, list) => { let w = 0; for (let c = 0; c < 4; c++) if (list.includes(idx[i * 4 + c])) w += wts[i * 4 + c]; return w; };
  const boneIs = (re) => bones.map((b, i) => (re.test(b.name) ? i : -1)).filter((q) => q >= 0);
  // move weight w (0..1 of what it had on the bones in `from`) onto bone b
  const give = (i, b, w, from) => {
    if (w <= 0.001) return;
    let moved = 0;
    for (let c = 0; c < 4; c++) if (from.includes(idx[i * 4 + c])) { const d = wts[i * 4 + c] * w; wts[i * 4 + c] -= d; moved += d; }
    if (moved <= 1e-5) return;
    let slot = -1;
    for (let c = 0; c < 4; c++) if (idx[i * 4 + c] === b) slot = c;
    if (slot < 0) { let lo = 9; for (let c = 0; c < 4; c++) if (wts[i * 4 + c] < lo) { lo = wts[i * 4 + c]; slot = c; } moved += wts[i * 4 + slot]; wts[i * 4 + slot] = 0; idx[i * 4 + slot] = b; }
    wts[i * 4 + slot] += moved;
  };
  // a chain of bones along a parameter t (0 at the root, 1 at the tip) over the given
  // vertices: bone k governs the k-th stretch, blended across each joint; the skin
  // nearest the root keeps some of its old bones so the part grows out of the body
  const chainWeights = (verts, tOf, chain, from, rootRamp = 0.12) => {
    const N = chain.length;
    for (const i of verts) {
      const t = tOf(i); if (t < 0) continue;
      const s = Math.min(N - 1, Math.max(0, t * N - 0.5)), a = Math.min(N - 1, Math.floor(s)), f = s - a;
      const root = sm(0, rootRamp, t);
      give(i, chain[a], root * (1 - f), from);
      if (a + 1 < N) give(i, chain[a + 1], (root * f) / Math.max(1e-6, 1 - root * (1 - f)), from);
    }
  };
  const added = [], newBones = [], newInv = [];
  // a bone at `world`, a child of `parent`, turning about the given frame (world
  // directions: side, up, forward). The frame is kept in the bone's own space so the
  // movers below turn it the same way on every model, however its bones face. Its
  // inverse bind matrix carries the same quantisation scale as its anchor's (one of
  // Meshy's bones), so skin moved onto it stays exactly where it was.
  const addBone = (bname, parent, world, info, frame, anchor) => {
    const b = new THREE.Bone(); b.name = bname;
    parent.updateMatrixWorld(true);
    b.position.copy(parent.worldToLocal(world.clone()));
    parent.add(b); b.updateMatrixWorld(true);
    newBones.push(b); newInv.push(b.matrixWorld.clone().invert().multiply(bm[bones.indexOf(anchor)]));
    const inv = b.getWorldQuaternion(new THREE.Quaternion()).invert();
    const ax = frame.map((d) => d.clone().applyQuaternion(inv).normalize().toArray());
    added.push({ name: bname, ...info, ax });
    return bones.length + newBones.length - 1;
  };
  // the head's own frame: up through the crown, forward through the face
  const H0 = W(head), up = top ? W(top).sub(H0) : new THREE.Vector3(0, 0.15 * H, 0);
  const hs = Math.max(0.05 * H, up.length()); up.normalize();
  const fwd = front ? W(front).sub(H0) : new THREE.Vector3(0, 0, 1);
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
  // frames: the head's (ears, jaw, hat) and the body's (tail, cape; the models face +z)
  const headF = [side, up, fwd], bodyF = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const local = (i) => { _w.set(rest[i * 3] - H0.x, rest[i * 3 + 1] - H0.y, rest[i * 3 + 2] - H0.z); return [_w.dot(up) / hs, _w.dot(fwd) / hs, _w.dot(side) / hs]; };
  // how far the head's skin reaches (in head-bone lengths): bottom, top, front, side
  let u0 = 9, u1 = -9, f1 = -9, s1 = 0;
  for (let i = 0; i < n; i++) if (weightOf(i, iHead) > 0.3) { const [u, f, sd] = local(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); f1 = Math.max(f1, f); s1 = Math.max(s1, Math.abs(sd)); }
  const uSpan = Math.max(1e-3, u1 - u0);

  if (want.ears) {
    const [e0, e1] = want.earSide || [0.2, 0.36], ib = [];
    for (const s of [-1, 1]) ib.push(addBone('Ear' + (s < 0 ? 'L' : 'R'), head, H0.clone().addScaledVector(up, 0.6 * hs).addScaledVector(side, s * (e0 + 0.15) * hs), { kind: 'ear', side: s, k: want.ears }, headF, head));
    for (let i = 0; i < n; i++) {
      if (weightOf(i, iHead) < 0.3) continue;
      const [u, f, sd] = local(i);
      const w = sm(0.4, 0.62, u) * sm(e0, e1, Math.abs(sd)) * sm(0.75, 0.45, f);
      if (w > 0) give(i, ib[sd < 0 ? 0 : 1], w, [iHead]);
    }
  }
  if (want.jaw) {
    // the jaw: the front of the lowest part of the head (the face may hang below the
    // head bone onto the neck's), hinged at the back of the mouth
    const neck = byName('neck'), from = [iHead, neck ? bones.indexOf(neck) : -1].filter((q) => q >= 0);
    const lo = u0 - 0.15 * uSpan, jawTop = u0 + (want.jawTop ?? 0.3) * uSpan;
    const jb = addBone('Jaw', head, H0.clone().addScaledVector(up, jawTop * hs).addScaledVector(fwd, 0.2 * f1 * hs), { kind: 'jaw', side: 0, k: 1 }, headF, head);
    for (let i = 0; i < n; i++) {
      if (weightOn(i, from) < 0.3) continue;
      const [u, f, sd] = local(i);
      if (u < lo) continue;
      const w = sm(jawTop, jawTop - 0.12 * uSpan, u) * sm(0.3 * f1, 0.5 * f1, f) * sm(0.55 * s1, 0.35 * s1, Math.abs(sd));
      if (w > 0) give(i, jb, w, from);
    }
  }
  if (want.hat) {
    // the top of the head, near the middle (a crown, topknot, helmet or hood tip)
    const from = u0 + 0.72 * uSpan, verts = [];
    for (let i = 0; i < n; i++) { if (weightOf(i, iHead) < 0.3) continue; const [u, , sd] = local(i); if (u > from && Math.abs(sd) < 0.6 * s1) verts.push(i); }
    if (verts.length > 12) {
      const base = new THREE.Vector3(); let m = 0;
      for (const i of verts) { const [u] = local(i); if (u < from + 0.08 * uSpan) { base.add(R(i)); m++; } }
      if (m) base.multiplyScalar(1 / m); else base.copy(H0).addScaledVector(up, from * hs);
      const hb = addBone('Hat', head, base, { kind: 'hat', side: 0, k: want.hat }, headF, head);
      for (const i of verts) { const [u, , sd] = local(i); give(i, hb, sm(from, from + 0.1 * uSpan, u) * sm(0.6 * s1, 0.4 * s1, Math.abs(sd)), [iHead]); }
    }
  }

  const P0 = W(hips);
  // the body's centre line seen from the side: how far forward the spine (above the
  // hips) or the legs (below) are at each height, so "behind the body" means behind
  // the bones there, not behind the hips (or a heel would count as a cape)
  const line = [];
  for (const nm of ['Hips', 'Spine01', 'Spine02', 'Spine', 'neck', 'Head']) { const b = byName(nm); if (b) line.push(W(b)); }
  for (const nm of ['UpLeg', 'Leg', 'Foot']) { const l = byName('Left' + nm), r = byName('Right' + nm); if (l && r) line.push(W(l).lerp(W(r), 0.5)); }
  line.sort((a, b) => a.y - b.y);
  const centreZ = (y) => {
    if (y <= line[0].y) return line[0].z;
    for (let k = 1; k < line.length; k++) if (y <= line[k].y) { const a = line[k - 1], b = line[k]; return a.z + ((y - a.y) / Math.max(1e-6, b.y - a.y)) * (b.z - a.z); }
    return line[line.length - 1].z;
  };
  const legL = byName('LeftUpLeg'), legR = byName('RightUpLeg');
  const hipW = legL && legR ? Math.abs(W(legL).x - W(legR).x) : 0.2 * size.x;

  if (want.tail) {
    // the tail: skin well behind the body below the hips (or a little above, for a
    // curly one), near the middle; traced along the surface from the rump, so its
    // parameter runs root to tip even where it curls back on itself
    const yTop = P0.y + (want.tailUp ?? 0.05) * H, cand = [], upper = boneIs(/Spine|neck|Head|Shoulder/);
    const tb = want.tailBone ? bones.indexOf(byName(want.tailBone)) : -1, TB = tb >= 0 ? W(bones[tb]) : null;
    for (let i = 0; i < n; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      if (y < yTop && centreZ(y) - z > (want.tailBehind ?? 0.07) * H && Math.abs(x - P0.x) < (want.tailX ? want.tailX * size.x : Math.max(0.11 * size.x, 0.5 * hipW)) && weightOn(i, upper) < 0.5) cand.push(i);
      // a tail Meshy hung on a hand: the skin on that hand that is far from it and
      // not in front of the body
      else if (tb >= 0 && weightOf(i, tb) > 0.5 && R(i).distanceTo(TB) > 0.18 * H && centreZ(y) - z > 0) cand.push(i);
    }
    const geoT = surfaceDistance(geo, rest, cand, P0, 0.03 * H);
    if (geoT) {
      const { t, reached } = geoT, N = 4, chain = [];
      let parent = hips;
      for (let k = 0; k < N; k++) {
        // each joint at the middle of the tail's cross-section where its stretch starts
        const c = new THREE.Vector3(); let m = 0;
        for (const i of reached) if (t[i] >= k / N && t[i] < k / N + 0.08) { c.add(R(i)); m++; }
        if (!m) break;
        c.multiplyScalar(1 / m);
        chain.push(addBone('Tail' + k, parent, c, { kind: 'tail', side: 0, k: k / (N - 1) }, bodyF, hips));
        parent = newBones[newBones.length - 1];
      }
      // the tail hangs from the hips alone first (Meshy hung the ratling's on a hand),
      // then spreads along the chain
      const iHips = bones.indexOf(hips), others = all.filter((q) => q !== iHips);
      for (const i of reached) give(i, iHips, 1, others);
      if (chain.length) chainWeights(reached, (i) => t[i], chain, [iHips]);
    }
  }
  if (want.cape && spine) {
    // the cape: the skin behind the back, from the shoulders down to the hem; it hangs
    // from the top and swings more the lower it reaches
    const [b0, b1] = want.capeBehind || [0.06, 0.13];
    const S0 = W(spine), topY = S0.y + 0.1 * H, botY = box.min.y + 0.03 * H, N = 3, chain = [];
    const backZ = (y) => { let zmin = 9; for (let i = 0; i < n; i++) if (Math.abs(rest[i * 3 + 1] - y) < 0.04 * H) zmin = Math.min(zmin, rest[i * 3 + 2]); return zmin; };
    let parent = spine;
    for (let k = 0; k < N; k++) {
      const y = topY - ((topY - botY) * k) / N, c = new THREE.Vector3(S0.x, y, backZ(y) + 0.05 * size.z);
      chain.push(addBone('Cape' + k, parent, c, { kind: 'cape', side: 0, k: k / (N - 1) }, bodyF, spine));
      parent = newBones[newBones.length - 1];
    }
    const from = boneIs(/Hips|Spine|UpLeg|Leg$|neck/), arms = boneIs(/Shoulder|Arm|Hand/), verts = [], tv = new Float32Array(n), wv = new Float32Array(n);
    const iSpine = bones.indexOf(spine);
    for (let i = 0; i < n; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      if (y > topY || Math.abs(x - S0.x) > 0.55 * size.x) continue;
      const behind = sm(b0 * H, b1 * H, centreZ(y) - z);
      if (behind <= 0) continue;
      const v = (topY - y) / Math.max(1e-6, topY - botY);
      verts.push(i); tv[i] = Math.min(0.999, v); wv[i] = behind * sm(0, 0.35, v);
      // a cloak Meshy hung on an arm hangs from the back instead, so it no longer
      // flies up with the hand
      if (want.capeAll) give(i, iSpine, behind, arms);
    }
    // the weight it takes is less where it is barely behind the body
    for (const i of verts) {
      const t = tv[i] * N - 0.5, s = Math.min(N - 1, Math.max(0, t)), a = Math.min(N - 1, Math.floor(s)), f = s - a, w = wv[i];
      give(i, chain[a], w * (1 - f), from);
      if (a + 1 < N) give(i, chain[a + 1], (w * f) / Math.max(1e-6, 1 - w * (1 - f)), from);
    }
  }
  if (want.fingers) {
    // the fingers: the far part of each empty hand, past the knuckles
    for (const sd of want.fingers) {
      const hand = byName(sd + 'Hand'), fore = byName(sd + 'ForeArm');
      if (!hand || !fore) continue;
      const upperArm = byName(sd + 'Arm'), ih = bones.indexOf(hand), Hp = W(hand), dir = Hp.clone().sub(W(fore));
      const arm = dir.length() + (upperArm ? W(fore).distanceTo(W(upperArm)) : dir.length()); dir.normalize();
      // the hand's skin near the hand (not a sleeve or a cloak Meshy also hung on it)
      const verts = [], ps = [];
      for (let i = 0; i < n; i++) if (weightOf(i, ih) > 0.3 && R(i).sub(Hp).length() < (want.handR ?? 0.6) * arm) { verts.push(i); ps.push(_v.dot(dir)); }
      if (verts.length < 12) continue;
      const pmax = ps.slice().sort((x, y) => x - y)[Math.floor(0.95 * (ps.length - 1))];
      if (pmax <= 0) continue;
      // the palm faces in toward the body (the fingers curl that way); the knuckles
      // are a little under halfway along the hand
      const inward = new THREE.Vector3(P0.x - Hp.x, 0, (centreZ(Hp.y) - Hp.z) * 0.3);
      if (inward.lengthSq() < 1e-8) inward.set(0, -1, 0);
      inward.addScaledVector(dir, -inward.dot(dir)).normalize();
      const curl = new THREE.Vector3().crossVectors(dir, inward).normalize();
      const k0 = 0.38 * pmax, k1 = 0.62 * pmax, knuckle = new THREE.Vector3(); let m = 0;
      for (const i of verts) { const p = R(i).sub(Hp).dot(dir); if (p > k0 - 0.08 * pmax && p < k0 + 0.08 * pmax) { knuckle.add(R(i)); m++; } }
      if (m) knuckle.multiplyScalar(1 / m); else knuckle.copy(Hp).addScaledVector(dir, k0);
      const fb = addBone('Fingers' + sd[0], hand, knuckle, { kind: 'fingers', side: sd === 'Left' ? 1 : -1, k: 1 }, [curl, dir, inward], hand);
      for (const i of verts) give(i, fb, sm(k0, k1, R(i).sub(Hp).dot(dir)), [ih]);
    }
  }
  if (!newBones.length) return [];
  // the skin weights back, normalised, and the mesh bound to the longer skeleton
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < 4; c++) s += wts[i * 4 + c]; if (s > 0) for (let c = 0; c < 4; c++) wts[i * 4 + c] /= s; }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  const skeleton = new THREE.Skeleton(bones.concat(newBones), sk.boneInverses.concat(newInv));
  skin.bind(skeleton, skin.bindMatrix);
  return added;
}

// How far along the surface each of `verts` is from the ones nearest `from` (within
// `slack` of the nearest), as a fraction of the farthest (t, -1 where not reached).
// Vertices split at texture seams are joined by position.
function surfaceDistance(geo, rest, verts, from, slack) {
  if (verts.length < 20 || !geo.index) return null;
  const n = rest.length / 3, inSet = new Int32Array(n).fill(-1);
  verts.forEach((v, k) => { inSet[v] = k; });
  const adj = verts.map(() => []);
  const dist = (a, b) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);
  const link = (a, b) => { const ka = inSet[a], kb = inSet[b]; if (ka >= 0 && kb >= 0 && a !== b) { const d = dist(a, b); adj[ka].push(kb, d); adj[kb].push(ka, d); } };
  const ix = geo.index.array;
  for (let f = 0; f < ix.length; f += 3) { link(ix[f], ix[f + 1]); link(ix[f + 1], ix[f + 2]); link(ix[f + 2], ix[f]); }
  const byPos = new Map(), key = (v) => `${Math.round(rest[v * 3] * 1e4)},${Math.round(rest[v * 3 + 1] * 1e4)},${Math.round(rest[v * 3 + 2] * 1e4)}`;
  for (const v of verts) { const k = key(v), o = byPos.get(k); if (o !== undefined) link(o, v); else byPos.set(k, v); }
  // start: the ones nearest `from`
  const d0 = verts.map((v) => Math.hypot(rest[v * 3] - from.x, rest[v * 3 + 1] - from.y, rest[v * 3 + 2] - from.z));
  const near = Math.min(...d0), g = new Float64Array(verts.length).fill(Infinity), done = new Uint8Array(verts.length);
  const heap = [];
  const push = (k, d) => { heap.push([d, k]); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let m = j; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
  verts.forEach((v, k) => { if (d0[k] <= near + slack) { g[k] = 0; push(k, 0); } });
  while (heap.length) {
    const [d, k] = pop();
    if (done[k]) continue; done[k] = 1;
    const a = adj[k];
    for (let j = 0; j < a.length; j += 2) { const nk = a[j], nd = d + a[j + 1]; if (nd < g[nk]) { g[nk] = nd; push(nk, nd); } }
  }
  let gmax = 0; for (let k = 0; k < verts.length; k++) if (g[k] < Infinity) gmax = Math.max(gmax, g[k]);
  if (gmax <= 0) return null;
  const t = new Float32Array(n).fill(-1), reached = [];
  verts.forEach((v, k) => { if (g[k] < Infinity) { t[v] = g[k] / gmax; reached.push(v); } });
  return reached.length >= 20 ? { t, reached } : null;
}

// Turns an added bone from its rest by pitch (about its first axis: + tips an ear's
// top forward, the jaw and a cape's hem down and back, a tail up, the fingers into
// the palm), yaw (about the second: + swings a tail's tip to the right) and roll
// (about the third: + leans it right).
const _q = new THREE.Quaternion(), _a = new THREE.Vector3();
function turn(bone, rest, ax, pitch, yaw, roll) {
  bone.quaternion.copy(rest);
  if (pitch) bone.quaternion.multiply(_q.setFromAxisAngle(_a.fromArray(ax[0]), pitch));
  if (yaw) bone.quaternion.multiply(_q.setFromAxisAngle(_a.fromArray(ax[1]), yaw));
  if (roll) bone.quaternion.multiply(_q.setFromAxisAngle(_a.fromArray(ax[2]), roll));
}

// Moves the added bones of one enemy every frame: springs for the ears, cape and
// hat (they lag behind its moves, overshoot and settle), a wave down the tail,
// the jaw and fingers closing as asked. st: { speed (m/s at its own scale),
// turn (rad/s, + to its left), step (0..1 through a walk loop, two footfalls), jaw
// (0..1 open), grip (-1 spread .. 1 a fist), t (seconds) }.
export class PartMover {
  constructor(root, added) {
    this.parts = [];
    for (const a of added) {
      const b = root.getObjectByName(a.name);
      if (b) this.parts.push({ ...a, bone: b, rest: b.quaternion.clone(), x: 0, vx: 0, y: 0, vy: 0, z: 0, vz: 0, seed: Math.random() * 10 });
    }
    this.lastStep = 0;
  }
  // a jolt: everything on springs is knocked back by `amt` (a hit, a fall)
  kick(amt) {
    for (const p of this.parts) {
      if (p.kind === 'ear') p.vx -= amt * 9 * p.k;
      else if (p.kind === 'cape') p.vx += amt * 5;
      else if (p.kind === 'tail') p.vx += amt * 6;
      else if (p.kind === 'hat') { p.vx -= amt * 5 * p.k; p.vz += (Math.random() - 0.5) * amt * 4 * p.k; }
    }
  }
  update(dt, st) {
    if (!this.parts.length || dt <= 0) return;
    const k = Math.min(dt, 0.05);
    const bob = Math.abs(Math.sin(st.step * Math.PI * 2)), sp = st.speed, tr = Math.max(-2, Math.min(2, st.turn));
    // a footfall: the step crosses a half of the loop
    const foot = Math.floor(st.step * 2) !== Math.floor(this.lastStep * 2) && sp > 0.1; this.lastStep = st.step;
    for (const p of this.parts) {
      let tx = 0, ty = 0, tz = 0, stiff = 55, damp = 6;
      if (p.kind === 'ear') {
        // back with speed, out of turns, a flick on each footfall, a twitch now and then
        const twitch = Math.pow(Math.max(0, Math.sin(st.t * 1.7 + p.seed)), 24) * 0.6;
        tx = (-Math.min(0.55, sp * 0.3) - bob * 0.18 * Math.min(1, sp * 2) - twitch) * p.k;
        tz = (-p.side * (0.12 + twitch * 0.5) + tr * 0.22) * p.k;
      } else if (p.kind === 'cape') {
        // billows out behind with speed, flaps with the stride, swings out of turns;
        // each link bends a little, so the hem swings most
        tx = Math.min(0.22, sp * 0.12) + bob * 0.04 * Math.min(1, sp * 2) + Math.sin(st.t * 2.3 + p.k * 1.5) * 0.02;
        tz = -tr * 0.07;
        stiff = 30 + 20 * (1 - p.k); damp = 4.5;
      } else if (p.kind === 'tail') {
        // a wave runs from root to tip, faster as it hurries; it trails out of turns
        const wave = Math.sin(st.t * (4 + sp * 3) - p.k * 2.4);
        ty = wave * (0.12 + 0.12 * p.k) - tr * 0.12;
        tx = 0.04 + Math.min(0.12, sp * 0.06) * p.k;
      } else if (p.kind === 'hat') {
        // wobbles: tipped back by speed, out of turns, jolted by each footfall
        if (foot) p.vx += 1.2 * p.k;
        tx = -Math.min(0.12, sp * 0.06) * p.k; tz = tr * 0.06 * p.k;
        stiff = 70; damp = 3.5;
      } else if (p.kind === 'jaw') {
        // no spring on the open: it snaps, with a little chatter while it roars
        const open = Math.max(0, Math.min(1, st.jaw || 0));
        p.x += (0.5 * open + (open > 0.6 ? Math.sin(st.t * 30) * 0.04 : 0) - p.x) * Math.min(1, k * 18);
        turn(p.bone, p.rest, p.ax, p.x, 0, 0);
        continue;
      } else if (p.kind === 'fingers') {
        // a fist (grip 1), spread (grip -1), or a loose flex in time with the stride
        const g = st.grip ?? 0;
        tx = g >= 0 ? 0.15 + 0.12 * Math.sin(st.step * Math.PI * 4 + p.side) * Math.min(1, sp * 2) + g * 1.05 : 0.15 + g * 0.5;
        stiff = 120; damp = 12;
      }
      // a soft spring toward the target: it lags, overshoots and settles
      p.vx += ((tx - p.x) * stiff - p.vx * damp) * k; p.x += p.vx * k;
      p.vy += ((ty - p.y) * stiff - p.vy * damp) * k; p.y += p.vy * k;
      p.vz += ((tz - p.z) * stiff - p.vz * damp) * k; p.z += p.vz * k;
      turn(p.bone, p.rest, p.ax, p.x, p.y, p.z);
    }
  }
}
