// ===================================================================== graphics: Doodle Island in toon shading
const GFX = (() => {
  const canvas = $('#view');
  const LOW = TOUCH || (navigator.hardwareConcurrency || 8) <= 4;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 320);
  const timeU = { value: 0 };
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- light: one sun with soft shadows around wherever the camera looks, a warm paper-coloured fill
  scene.add(new THREE.HemisphereLight('#ffffff', '#d9cdb0', 0.66));
  const sun = new THREE.DirectionalLight('#fff1d8', 0.85);
  sun.position.set(13, 26, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 4, far: 90 });  // follows the camera's focus
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ---- toon materials and ink outlines
  const ramp = (() => { const d = new Uint8Array([92, 160, 222, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.LuminanceFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
  const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...o });
  const hullMat = new THREE.MeshBasicMaterial({ color: '#1e1d2b', side: THREE.BackSide });
  function inked(mesh, w = 0.035) {
    mesh.geometry.computeBoundingBox();
    const s = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    const o = new THREE.Mesh(mesh.geometry, hullMat);
    o.scale.set(1 + w * 2 / Math.max(s.x, 0.01), 1 + w * 2 / Math.max(s.y, 0.01), 1 + w * 2 / Math.max(s.z, 0.01));
    o.raycast = () => {};
    mesh.add(o); return mesh;
  }
  function outlineMat(thick = 0.025, sway = 0) {
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: thick }, uSway: { value: sway } }]),
      vertexShader: `uniform float uT; uniform float uTime; uniform float uSway;
        #include <fog_pars_vertex>
        void main() {
          vec3 p = position + normal * uT;
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
          #else
          float ph = 0.0;
          #endif
          p.x += sin(uTime * 1.7 + ph) * uSway * (position.y + 1.0);
          p.z += cos(uTime * 1.3 + ph) * uSway * 0.8 * (position.y + 1.0);
          vec4 w = vec4(p, 1.0);
          #ifdef USE_INSTANCING
          w = instanceMatrix * w;
          #endif
          vec4 mvPosition = modelViewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `#include <fog_pars_fragment>
        void main() { gl_FragColor = vec4(0.118, 0.114, 0.169, 1.0);
        #include <fog_fragment>
        }`,
      side: THREE.BackSide, fog: true,
    });
    m.uniforms.uTime = timeU;
    return m;
  }
  function swayToon(mat, amount) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
        float ph = 0.0;
        #endif
        transformed.x += sin(uTime * 1.7 + ph) * ${amount.toFixed(3)} * (position.y + 1.0);
        transformed.z += cos(uTime * 1.3 + ph) * ${(amount * 0.8).toFixed(3)} * (position.y + 1.0);`);
    };
    return mat;
  }

  // ---- canvas textures (each object gets its own)
  const ctex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } t.anisotropy = 4; return t; };
  scene.background = new THREE.Color('#f4efe0');
  scene.fog = new THREE.Fog('#f4efe0', 50, 175);
  const paperSide = ctex(256, 128, (g, w, h) => { g.fillStyle = '#fbf8ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a9c9ee'; g.lineWidth = 3; for (let y = 18; y < h; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.strokeStyle = '#e8838a'; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 0); g.lineTo(30, h); g.stroke(); }, [2, 1]);
  const paperTop = ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#fbf8ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a9c9ee'; g.lineWidth = 3; for (let y = 32; y < h; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#e8838a'; g.lineWidth = 5; g.beginPath(); g.moveTo(70, 0); g.lineTo(70, h); g.stroke();
    g.strokeStyle = '#2b2d4a'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2, b = a + TAU * 2 / 5; g.moveTo(256 + Math.cos(a) * 90, 256 + Math.sin(a) * 90); g.lineTo(256 + Math.cos(b) * 90, 256 + Math.sin(b) * 90); } g.stroke();
  });
  const rulerTex = ctex(512, 64, (g) => {
    g.fillStyle = '#ffe680'; g.fillRect(0, 0, 512, 64); g.strokeStyle = '#1e1d2b'; g.fillStyle = '#1e1d2b'; g.font = '16px sans-serif';
    for (let i = 0; i <= 64; i++) { const x = 8 + i * 7.5; g.lineWidth = i % 8 ? 1 : 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, i % 8 ? 12 : 24); g.stroke(); if (!(i % 8)) g.fillText(String(i / 8), x + 2, 42); }
  });
  const woodTex = ctex(128, 128, (g, w, h) => {
    g.fillStyle = '#c98b4b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = y % 64 ? '#b97a3d' : '#d59a5a'; g.fillRect(0, y + 2, w, 28); }
    g.strokeStyle = '#7a4a22'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10); g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke();
    g.fillStyle = '#5b3517'; for (const [x, y] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12]]) { g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
  });
  const pagesTex = ctex(128, 64, (g, w, h) => { g.fillStyle = '#fffdf2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8d2c0'; g.lineWidth = 1; for (let y = 3; y < h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
  const arrowTex = ctex(128, 128, (g, w, h) => { g.fillStyle = '#7fb3ff'; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill(); g.fillStyle = '#ffffff'; g.strokeStyle = '#1e1d2b'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 18); g.lineTo(100, 60); g.lineTo(78, 60); g.lineTo(78, 104); g.lineTo(50, 104); g.lineTo(50, 60); g.lineTo(28, 60); g.closePath(); g.fill(); g.stroke(); });
  const dotTex = ctex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const swirlTex = ctex(128, 128, (g) => { g.translate(64, 64); for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 7; g.beginPath(); for (let a = 0; a < 4.5; a += 0.1) { const r = 6 + a * 11; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); } });

  const add = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); scene.add(o); return o; };
  const shadowy = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

  // ---- the page: one big sheet of lined notebook paper lying on a wooden desk (fall off it and you lose a life)
  const PAGE = HALF * 2;
  const pageTex = ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#fbf8ee'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9fc1ea'; g.lineWidth = 4; for (let y = 32; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(226,112,122,0.85)'; g.lineWidth = 5; g.beginPath(); g.moveTo(96, 0); g.lineTo(96, h); g.stroke();
  }, [PAGE / (8 * SC), PAGE / (8 * SC)]);
  const edgeMat = toon('#f1ece0');
  add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(PAGE, 0.3, PAGE), [edgeMat, edgeMat, toon('#fff', { map: pageTex }), edgeMat, edgeMat, edgeMat]), 0.05), false, true), 0, -0.15, 0);
  const deskTex = ctex(256, 256, (g, w, h) => { g.fillStyle = '#b98552'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.strokeStyle = i % 3 ? 'rgba(120,75,40,0.35)' : 'rgba(225,175,120,0.3)'; g.lineWidth = rand(1, 4); g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rand(-12, 12), w * 0.7, y + rand(-12, 12), w, y); g.stroke(); } }, [40, 40]);
  const deskG = new THREE.Group(); deskG.scale.setScalar(SC); scene.add(deskG);
  const addD = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); deskG.add(o); return o; };
  const desk = addD(new THREE.Mesh(new THREE.PlaneGeometry(500, 500), toon('#fff', { map: deskTex })), 0, -7, 0); desk.rotation.x = -Math.PI / 2;
  // things on the desk around the page, for scale
  {
    const giantPencil = (x, z, ry, color) => {
      const g = new THREE.Group(); g.position.set(x, -7 + 1.6, z); g.rotation.set(0, ry, Math.PI / 2); deskG.add(g);
      const body = inked(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 6), toon(color)), 0.15);
      const wood = inked(new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 6), toon('#f2d2a6')), 0.15); wood.position.y = -15; wood.rotation.z = Math.PI;
      const rub = inked(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12), toon('#f7a8bb')), 0.15); rub.position.y = 14.2;
      g.add(body, wood, rub);
    };
    const f = HALF / SC / 30; // (laid out for a 60-unit page; spread out to fit this one)
    giantPencil(-58 * f, 18 * f, 0.4, '#ffcf3a'); giantPencil(52 * f, -44 * f, -0.9, '#5b8def'); giantPencil(20 * f, 60 * f, 1.4, '#e63946');
    const er = addD(inked(new THREE.Mesh(new THREE.BoxGeometry(16, 6, 9), toon('#f7a8bb')), 0.15), 56 * f, -4, 24 * f); er.rotation.y = 0.5;
    const mug = addD(inked(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 16, 24), toon('#7fb3ff')), 0.15), -50 * f, 1, -52 * f);
    const sharp = addD(inked(new THREE.Mesh(new THREE.BoxGeometry(7, 6, 6), toon('#ffcf3a')), 0.15), -64 * f, -4, -6 * f); sharp.rotation.y = 1.1;
  }
  const playerU = { value: [new THREE.Vector4(0, -99, 0, 0), new THREE.Vector4(0, -99, 0, 0), new THREE.Vector4(0, -99, 0, 0), new THREE.Vector4(0, -99, 0, 0)] };

  // ---- trees (cover inside the page and along its edges) with little bushes, instanced, swaying
  {
    const T = MAP.trees;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.3, 8); trunkGeo.translate(0, 1.15, 0);
    const blobGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, toon('#8a5a32'), T.length), trunkOl = new THREE.InstancedMesh(trunkGeo, outlineMat(0.035), T.length);
    const NB = T.length * 3, leaves = new THREE.InstancedMesh(blobGeo, swayToon(toon('#ffffff'), 0.035), NB), leafOl = new THREE.InstancedMesh(blobGeo, outlineMat(0.05, 0.035), NB);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    T.forEach((t, i) => {
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q.identity(), new THREE.Vector3(t.s, t.s, t.s)); trunks.setMatrixAt(i, m4); trunkOl.setMatrixAt(i, m4);
      [[0, 2.7, 0, 1.25], [0.55, 2.25, 0.35, 0.85], [-0.5, 2.35, -0.3, 0.9]].forEach(([ox, oy, oz, s], j) => {
        m4.compose(new THREE.Vector3(t.x + ox * t.s, oy * t.s, t.z + oz * t.s), q.identity(), new THREE.Vector3(s * t.s, s * t.s * 0.9, s * t.s));
        leaves.setMatrixAt(i * 3 + j, m4); leafOl.setMatrixAt(i * 3 + j, m4); leaves.setColorAt(i * 3 + j, col.setHSL(0.27 + j * 0.02, 0.62, 0.42 + j * 0.05));
      });
    });
    for (const m of [trunks, leaves]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    scene.add(trunkOl, leafOl);
    const BN = T.length * 2, bush = new THREE.InstancedMesh(blobGeo, swayToon(toon('#ffffff'), 0.02), BN), bushOl = new THREE.InstancedMesh(blobGeo, outlineMat(0.05, 0.02), BN);
    T.forEach((t, i) => {
      for (let j = 0; j < 2; j++) {
        const a = i * 2.3 + j * 2.6, x = t.x + Math.cos(a) * 1.1 * SC, z = t.z + Math.sin(a) * 1.1 * SC, sc = (0.3 + 0.08 * j) * SC;
        m4.compose(new THREE.Vector3(x, sc * 0.35, z), q.identity(), new THREE.Vector3(sc, sc * 0.75, sc)); bush.setMatrixAt(i * 2 + j, m4); bushOl.setMatrixAt(i * 2 + j, m4); bush.setColorAt(i * 2 + j, col.setHSL(0.27 + j * 0.03, 0.6, 0.44));
      }
    });
    bush.castShadow = true; scene.add(bush, bushOl);
  }

  // ---- the stationery: notebook tower, books, ruler bridges, sticky-note lifts, eraser pads, teleporters, crates
  const TW = MAP.boxes[0];
  paperSide.repeat.set(3, 1.5);
  const tower = add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(TW.w, TW.top, TW.d), [toon('#fff', { map: paperSide }), toon('#fff', { map: paperSide }), toon('#fff', { map: paperTop }), toon('#fff'), toon('#fff', { map: paperSide }), toon('#fff', { map: paperSide })]), 0.05)), 0, TW.top / 2, 0);
  {
    const N = 15, ring = new THREE.TorusGeometry(0.3 * SC, 0.06 * SC, 6, 14), rings = new THREE.InstancedMesh(ring, toon('#c3c9d4'), N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    for (let i = 0; i < N; i++) { m4.compose(new THREE.Vector3(-TW.w / 2, TW.top, -TW.d / 2 + 0.6 + i * (TW.d - 1.2) / (N - 1)), q, new THREE.Vector3(1, 1, 1)); rings.setMatrixAt(i, m4); }
    rings.castShadow = true; scene.add(rings);
  }
  const COVER = ['#5b8def', '#e63946', '#2fbf5f', '#ffb02e'], NOTE = ['#ffe45c', '#ff9ec4', '#9fd8ff', '#b5ea9f'];
  const padMeshes = [];
  for (const b of MAP.boxes) {
    if (b.kind === 'book') {
      const cover = toon(COVER[b.q]), pages = toon('#fff', { map: pagesTex }), spine = toon(new THREE.Color(COVER[b.q]).multiplyScalar(0.8));
      const longX = b.w > b.d, mats = longX ? [pages, pages, cover, cover, pages, spine] : [pages, spine, cover, cover, pages, pages];
      add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.top, b.d), mats))), b.cx, b.top / 2, b.cz);
      const band = add(new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.004, 0.08, b.d * 1.004), toon('#fffdf4')), b.cx, b.top - 0.12, b.cz);
    } else if (b.kind === 'notebook') {
      // a spiral notebook: cover on top, wire rings down one long side
      const cover = toon(['#ffffff', '#ffe45c', '#b9dbf8', '#ffc7d4'][b.q]), pages = toon('#fff', { map: pagesTex });
      add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.top, b.d), [pages, pages, cover, cover, pages, pages]))), b.cx, b.top / 2, b.cz);
      const long = b.d > b.w, n = 11, ring = new THREE.TorusGeometry(0.34, 0.07, 6, 14), rings = new THREE.InstancedMesh(ring, toon('#c3c9d4'), n), m4 = new THREE.Matrix4();
      const qr = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, long ? 0 : Math.PI / 2, 0)), side = Math.sign(b.cx + b.cz) || 1;
      for (let i = 0; i < n; i++) { const f = -0.42 + i * 0.84 / (n - 1); m4.compose(new THREE.Vector3(long ? b.cx - side * b.w / 2 : b.cx + f * b.w, b.top, long ? b.cz + f * b.d : b.cz - side * b.d / 2), qr, new THREE.Vector3(1, 1, 1)); rings.setMatrixAt(i, m4); }
      scene.add(rings);
    } else if (b.kind === 'cup') {
      // a tall pencil cup with pencils standing in it (the pencils are scenery; you stand on the rim)
      const c = ['#7fb3ff', '#ff9ec4', '#b5ea9f', '#ffd93d'][b.q];
      add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.top, b.d), toon(c)))), b.cx, b.top / 2, b.cz);
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.01, 0.18, b.d * 1.01), toon(new THREE.Color(c).multiplyScalar(0.8))), b.cx, b.top * 0.2, b.cz);
      for (const [ox, oz, h, pc] of [[-0.3, -0.3, 2.6, '#ffcf3a'], [0.32, -0.25, 3.2, '#e63946'], [-0.28, 0.3, 2.2, '#5b8def']]) {
        const pen = inked(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h, 6), toon(pc)), 0.03);
        pen.rotation.set(oz * 0.25, 0, -ox * 0.25); add(pen, b.cx + ox * b.w, b.top + h / 2 - 0.2, b.cz + oz * b.d);
        const tip = inked(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), toon('#f2d2a6')), 0.03); tip.position.y = h / 2 + 0.2; pen.add(tip);
      }
    } else if (b.kind === 'book2' || b.kind === 'book3') {
      const c = b.kind === 'book2' ? ['#2fbf5f', '#a05cff', '#ff9a1f', '#3ad1c4'][b.q] : ['#ff8fb1', '#ffd93d', '#7fb3ff', '#e63946'][b.q];
      const cover = toon(c), pages = toon('#fff', { map: pagesTex }), h = b.top - b.bottom;
      add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(b.w, h, b.d), [pages, toon(new THREE.Color(c).multiplyScalar(0.8)), cover, cover, pages, pages]))), b.cx, b.bottom + h / 2, b.cz);
    } else if (b.kind === 'eraser') {
      const long = b.w > b.d, h = b.top, L = long ? b.w : b.d, S = long ? b.d : b.w;
      const pk = add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(long ? L * 0.68 : S, h, long ? S : L * 0.68), toon('#f7a8bb')))), 0, h / 2, 0);
      const bl = add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(long ? L * 0.32 : S, h, long ? S : L * 0.32), toon('#7fb3ff')))), 0, h / 2, 0);
      const ox = long ? L * 0.16 : 0, oz = long ? 0 : L * 0.16;
      pk.position.set(b.cx - ox, h / 2, b.cz - oz); bl.position.set(b.cx + (long ? L * 0.34 : 0), h / 2, b.cz + (long ? 0 : L * 0.34));
    } else if (b.kind === 'pbox') {
      const h = b.top;
      add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(b.w, h, b.d), toon('#5b8def')))), b.cx, h / 2, b.cz);
      add(new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.01, 0.1, b.d * 1.01), toon('#2f5fbf')), b.cx, h * 0.72, b.cz);
      // two pencils lying on the lid (scenery)
      const long = b.d > b.w;
      for (const [o, c] of [[-0.35, '#ffcf3a'], [0.35, '#e63946']]) {
        const pc = inked(new THREE.Mesh(new THREE.CylinderGeometry(0.09 * SC, 0.09 * SC, (long ? b.d : b.w) * 0.8, 6), toon(c)), 0.02);
        pc.rotation.set(long ? Math.PI / 2 : 0, 0, long ? 0 : Math.PI / 2); add(pc, b.cx + (long ? o * SC : 0), h + 0.09 * SC, b.cz + (long ? 0 : o * SC));
      }
    } else if (b.kind === 'bridge') {
      const tex = rulerTex.clone(); tex.needsUpdate = true; if (b.w < b.d) { tex.center.set(0.5, 0.5); tex.rotation = Math.PI / 2; }
      const m = toon('#fff', { map: tex });
      add(shadowy(inked(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.top - b.bottom, b.d), [toon('#ffe680'), toon('#ffe680'), m, toon('#e8c94a'), toon('#ffe680'), toon('#ffe680')]))), b.cx, (b.top + b.bottom) / 2, b.cz);
      // two legs so it reads as a bridge
      // legs only on the outer half, so the sweeping pencil passes under cleanly
      const ol = Math.hypot(b.cx, b.cz) || 1, ux = b.cx / ol, uz = b.cz / ol;
      for (const k of [1.3 * SC, 4.5 * SC]) add(inked(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, b.bottom, 8), toon('#c3c9d4')), 0.025), b.cx + ux * k, b.bottom / 2, b.cz + uz * k);
    } else if (b.kind === 'pad') {
      const g = new THREE.Group(); g.position.set(b.cx, 0, b.cz); scene.add(g);
      const pr = b.w / 2;
      const base = shadowy(inked(new THREE.Mesh(new THREE.CylinderGeometry(pr * 1.01, pr * 1.06, 0.14, 28), toon('#f7a8bb')), 0.03)); base.position.y = 0.07;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.87, pr * 0.92, 0.07, 28), [toon('#7fb3ff'), toon('#fff', { map: arrowTex }), toon('#7fb3ff')]); top.position.y = 0.17;
      top.rotation.y = Math.atan2(-b.cx, -b.cz) + Math.PI;
      g.add(base, top); padMeshes.push({ g, top, t: 0, q: b.q });
    }
  }
  const liftMeshes = MAP.lifts.map((l, i) => {
    const geo = new THREE.BoxGeometry(l.w, 1, l.d); geo.translate(0, 0.5, 0);
    const m = add(shadowy(inked(new THREE.Mesh(geo, toon(NOTE[i])), 0.03)), l.cx, 0, l.cz);
    const lines = new THREE.Mesh(new THREE.BoxGeometry(l.w * 1.006, 0.02, l.d * 1.006), toon(new THREE.Color(NOTE[i]).multiplyScalar(0.85)));
    m.add(lines); m.userData.lines = lines;
    return m;
  });
  const tpMeshes = MAP.tps.map(tp => {
    const g = new THREE.Group(); g.position.set(tp.x, 0, tp.z); g.scale.setScalar(tp.r / 0.75); scene.add(g);
    const color = TP_COLOR(tp); // each pair has its own colour
    g.add(shadowy(inked(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.1, 28), toon('#2b2d4a')), 0.025)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.08, 8, 32), toon(color, { emissive: new THREE.Color(color).multiplyScalar(0.35) })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 28), new THREE.MeshBasicMaterial({ map: swirlTex, color, transparent: true, opacity: 0.85, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.11; g.add(disc);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.62, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 1.15; g.add(beam);
    return { g, disc, ring, color, x: tp.x, z: tp.z };
  });
  MAP.spawns.forEach((s, i) => {
    const r = add(new THREE.Mesh(new THREE.RingGeometry(0.75 * SC, 1.0 * SC, 32), new THREE.MeshBasicMaterial({ color: COLORS[i].hex, transparent: true, opacity: 0.85, depthWrite: false })), s.x, 0.02, s.z); r.rotation.x = -Math.PI / 2;
  });
  // all crates in one instanced draw (plus one for their ink outline)
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crateInst = shadowy(new THREE.InstancedMesh(crateGeo, toon('#fff', { map: woodTex }), MAP.crates.length)), crateHull = new THREE.InstancedMesh(crateGeo, hullMat, MAP.crates.length);
  crateInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); crateHull.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(crateInst, crateHull);
  const crateState = MAP.crates.map(() => ({ pop: 1, wob: 0 }));

  // ---- the sweeping pencil (a hazard: jump it)
  const arm = new THREE.Group(); scene.add(arm);
  {
    // eraser end toward the tower, the point outward: it reaches from ARM_IN to ARM_OUT
    const L = ARM_OUT - ARM_IN, R = 0.42;
    const p = new THREE.Group(); p.position.set((ARM_IN + ARM_OUT) / 2, 0.45, 0); p.rotation.z = Math.PI / 2; arm.add(p);
    const body = shadowy(inked(new THREE.Mesh(new THREE.CylinderGeometry(R, R, L * 0.72, 6), toon('#ffcf3a')), 0.035));
    const wood = shadowy(inked(new THREE.Mesh(new THREE.ConeGeometry(R, L * 0.16, 6), toon('#f2d2a6')), 0.035)); wood.position.y = -L * 0.44; wood.rotation.z = Math.PI;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(R * 0.33, L * 0.05, 6), toon('#2b2d4a')); lead.position.y = -L * 0.53; lead.rotation.z = Math.PI;
    const band = shadowy(inked(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.03, R * 1.03, L * 0.04, 12), toon('#c3c9d4')), 0.02)); band.position.y = L * 0.38;
    const rub = shadowy(inked(new THREE.Mesh(new THREE.CylinderGeometry(R, R, L * 0.08, 12), toon('#f7a8bb')), 0.035)); rub.position.y = L * 0.44;
    p.add(body, wood, lead, band, rub);
  }
  // ---- sudden death: the ink wall
  const zoneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main() { float s = step(0.5, fract(vUv.x * 60.0 + vUv.y * 3.0 - uTime * 0.8)); float a = (0.25 + 0.35 * s) * (1.0 - vUv.y * 0.7); gl_FragColor = vec4(mix(vec3(0.42, 0.18, 0.62), vec3(0.85, 0.2, 0.4), s), a); }`,
  });
  zoneMat.uniforms = { uTime: timeU };
  const zone = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 10, 96, 1, true), zoneMat), 0, 4.6, 0); zone.visible = false;

  // ---- items: plinths with the item floating above
  function itemMesh(k) {
    const g = new THREE.Group();
    if (k === 'h') { g.add(inked(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.12), toon('#f7c6a8')), 0.03)); const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.14), toon('#fff')); g.add(pad); const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.15), toon('#e63946')), c2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.15), toon('#e63946')); g.add(c1, c2); }
    else if (k === 's') { const shoe = inked(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.26), toon('#5b8def')), 0.03); const toe = inked(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), toon('#5b8def')), 0.03); toe.position.x = 0.22; toe.scale.set(1, 0.7, 0.9); const sole = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.28), toon('#fff')); sole.position.y = -0.12; sole.position.x = 0.05; g.add(shoe, toe, sole); }
    else if (k === 'b') { g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.55, depthWrite: false }))); const hi = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff' })); hi.position.set(-0.12, 0.13, 0.2); g.add(hi); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 24), hullMat)); }
    else if (k === 't') { for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const d = inked(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), toon('#2b2d4a')), 0.025); d.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0); g.add(d); } const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 24), toon('#ffd93d')); g.add(ring); }
    else if (k === 'p') { g.add(inked(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), toon('#ffcf3a')), 0.03)); const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 10), toon('#2b2d4a')); hole.rotation.z = Math.PI / 2; g.add(hole); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.32), toon('#c3c9d4')); blade.position.y = 0.17; g.add(blade); }
    g.traverse(o => { if (o.isMesh && o.material !== hullMat) o.castShadow = true; });
    return g;
  }
  const ITEM_COLOR = { h: '#ff8fa3', s: '#7fb3ff', b: '#9fe6ff', t: '#ffd93d', p: '#ff9a1f' };
  const spawnerViews = MAP.spawners.map(S => {
    const g = new THREE.Group(); g.position.set(S.x, S.y, S.z); scene.add(g);
    const plinth = shadowy(inked(new THREE.Mesh(new THREE.CylinderGeometry(S.big ? 0.6 : 0.42, S.big ? 0.66 : 0.48, 0.12, 20), toon('#fffdf4')), 0.025)); plinth.position.y = 0.06; g.add(plinth);
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.13; g.add(glow);
    const holder = new THREE.Group(); holder.position.y = 0.85; g.add(holder);
    return { g, holder, glow, k: '', mesh: null, S };
  });
  const dropMeshes = new Map();

  // ---- practice targets
  const eyeTex = ctex(128, 128, (g) => { ['#e63946', '#fffdf4', '#e63946', '#fffdf4', '#e63946'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(64, 64, 62 - i * 12, 0, TAU); g.fill(); }); g.strokeStyle = '#1e1d2b'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 61, 0, TAU); g.stroke(); });
  const targetViews = MAP.targets.map(T => {
    const g = new THREE.Group(); g.position.set(T.x, T.y, T.z); g.rotation.y = Math.atan2(-T.x, -T.z); g.visible = false; scene.add(g);
    const hinge = new THREE.Group(); g.add(hinge);
    const stick = shadowy(inked(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), toon('#c9a26b')), 0.015)); stick.position.y = 0.55;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 28), [toon('#fffdf4'), toon('#fff', { map: eyeTex }), toon('#fff', { map: eyeTex })]); disc.rotation.x = Math.PI / 2; disc.position.y = 1.35; disc.castShadow = true;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 28), hullMat); ring.rotation.x = Math.PI / 2; ring.position.y = 1.35;
    hinge.add(stick, disc, ring);
    return { g, hinge };
  });

  // ---- sky life: drifting clouds and floating pollen
  const CN = 9, PUFFS = 5, cloudGeo = new THREE.IcosahedronGeometry(1, 1), clouds = new THREE.InstancedMesh(cloudGeo, toon('#ffffff', { emissive: new THREE.Color('#9ab6d6') }), CN * PUFFS), cloudOl = new THREE.InstancedMesh(cloudGeo, outlineMat(0.04), CN * PUFFS);
  const cloudData = Array.from({ length: CN }, (_, i) => ({ a: i / CN * TAU, r: rand(60, 110), y: rand(22, 34), s: rand(3, 5), v: rand(0.006, 0.014), p: Array.from({ length: PUFFS }, (_, j) => [rand(-1.6, 1.6), rand(-0.3, 0.5), rand(-0.8, 0.8), rand(0.7, 1.2)]) }));
  scene.add(clouds, cloudOl); clouds.frustumCulled = cloudOl.frustumCulled = false;
  const pollen = (() => {
    const N = LOW ? 120 : 260, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * HALF * 1.05; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rand(0.3, 6); pos[i * 3 + 2] = Math.sin(a) * r; seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: timeU, uMap: { value: dotTex }, uScale: { value: 1 } },
      vertexShader: `uniform float uTime; uniform float uScale; attribute float seed; void main() { vec3 p = position; p.x += sin(uTime * 0.3 + seed) * 1.5; p.y += mod(uTime * 0.25 + seed, 6.0) - 3.0; p.z += cos(uTime * 0.27 + seed * 1.3) * 1.5; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uScale * 110.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; void main() { gl_FragColor = vec4(1.0, 0.97, 0.75, 0.55) * texture2D(uMap, gl_PointCoord); }` });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); return m;
  })();

  // ---- pooled effects: puffs, sparks and debris in two instanced draws, ink shots in a third
  const FX_N = 320, fxMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#fff' }), FX_N);
  const DEB_N = 120, debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon('#ffffff'), DEB_N);
  const SHOT_N = 96, shotMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#23243a' }), SHOT_N);
  for (const m of [fxMesh, debMesh, shotMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
  debMesh.castShadow = true;
  const fxPool = Array.from({ length: FX_N }, () => ({ on: false })), debPool = Array.from({ length: DEB_N }, () => ({ on: false }));
  let fxNext = 0, debNext = 0;
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < FX_N; i++) fxMesh.setMatrixAt(i, hide);
  for (let i = 0; i < DEB_N; i++) debMesh.setMatrixAt(i, hide);
  for (let i = 0; i < SHOT_N; i++) shotMesh.setMatrixAt(i, hide);
  fxMesh.setColorAt(0, _c.set('#fff')); debMesh.setColorAt(0, _c);
  function puff(x, y, z, o = {}) {
    const p = fxPool[fxNext]; fxNext = (fxNext + 1) % FX_N;
    Object.assign(p, { on: true, x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g || 0, t: 0, life: o.life || 0.4, s0: o.s0 ?? 0.12, s1: o.s1 ?? 0.35, drag: o.drag ?? 2 });
    fxMesh.setColorAt(fxPool.indexOf(p), _c.set(o.c || '#ffffff')); fxMesh.instanceColor.needsUpdate = true;
  }
  function debris(x, y, z, color, n = 8, sz = 0.18, spd = 5) {
    for (let k = 0; k < n; k++) {
      const p = debPool[debNext], idx = debNext; debNext = (debNext + 1) % DEB_N;
      const a = Math.random() * TAU, s = rand(0.4, 1) * spd;
      Object.assign(p, { on: true, x: x + rand(-0.3, 0.3), y: y + rand(-0.2, 0.3), z: z + rand(-0.3, 0.3), vx: Math.cos(a) * s, vy: rand(3, 7), vz: Math.sin(a) * s, rx: rand(0, 3), ry: rand(0, 3), wr: rand(-8, 8), t: 0, life: rand(1.2, 1.8), s: sz * rand(0.6, 1.3) });
      debMesh.setColorAt(idx, _c.set(color)); debMesh.instanceColor.needsUpdate = true;
    }
  }
  function updateFx(dt) {
    for (let i = 0; i < FX_N; i++) {
      const p = fxPool[i]; if (!p.on) continue;
      p.t += dt; const u = p.t / p.life;
      if (u >= 1) { p.on = false; fxMesh.setMatrixAt(i, hide); continue; }
      const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = lerp(p.s0, p.s1, Math.sqrt(u)) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      _m4.makeScale(s, s, s).setPosition(p.x, p.y, p.z); fxMesh.setMatrixAt(i, _m4);
    }
    fxMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < DEB_N; i++) {
      const p = debPool[i]; if (!p.on) continue;
      p.t += dt; if (p.t > p.life) { p.on = false; debMesh.setMatrixAt(i, hide); continue; }
      p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wr * dt; p.ry += p.wr * 0.7 * dt;
      const fl = onPage(p.x, p.z) ? p.s / 2 : -7 * SC + 0.1;
      if (p.y < fl) { p.y = fl; p.vy = -p.vy * 0.35; p.vx *= 0.6; p.vz *= 0.6; p.wr *= 0.5; }
      const s = p.s * (p.t > p.life - 0.3 ? (p.life - p.t) / 0.3 : 1);
      _q.setFromEuler(_e.set(p.rx, p.ry, 0)); _m4.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s, s)); debMesh.setMatrixAt(i, _m4);
    }
    debMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- doodles: four copies of your model, one colour each, with their own animation mixers
  let TEMPLATE = null, CLIPS = [], H_K = 1;
  const slotMats = [];
  function mergeParts(group) {
    const meshes = group.children.filter(c => c.isMesh);
    if (meshes.length < 2) return;
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), pos = [], nor = [], uv = [], idx = [];
    let base = 0;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (const m of meshes) {
      const g = m.geometry, mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(mat);
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mat); pos.push(v.x, v.y, v.z); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); if (U) uv.push(U.getX(i), U.getY(i)); else uv.push(0, 0); }
      if (g.index) for (let j = 0; j < g.index.count; j++) idx.push(base + g.index.getX(j)); else for (let j = 0; j < P.count; j++) idx.push(base + j);
      base += P.count; group.remove(m);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, meshes[0].material); mesh.name = group.name + '_body'; group.add(mesh);
  }
  function tintTexture(img, hue) {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.drawImage(img, 0, 0, S, S);
    if (hue != null) {
      const d = g.getImageData(0, 0, S, S), a = d.data;
      for (let i = 0; i < a.length; i += 4) {
        const r = a[i] / 255, gg = a[i + 1] / 255, b = a[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, dd = mx - mn;
        if (dd < 0.18) continue;
        const s = dd / (1 - Math.abs(2 * l - 1));
        let h = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4; h *= 60; if (h < 0) h += 360;
        if (h < 195 || h > 260) continue;
        const nh = hue, nl = hue > 20 && hue < 70 ? Math.min(0.75, l * 1.35 + 0.08) : l * 1.05, C2 = (1 - Math.abs(2 * nl - 1)) * Math.min(1, s * 1.05), X = C2 * (1 - Math.abs((nh / 60) % 2 - 1)), m0 = nl - C2 / 2;
        const [r1_, g1_, b1_] = nh < 60 ? [C2, X, 0] : nh < 120 ? [X, C2, 0] : nh < 180 ? [0, C2, X] : nh < 240 ? [0, X, C2] : nh < 300 ? [X, 0, C2] : [C2, 0, X];
        a[i] = (r1_ + m0) * 255; a[i + 1] = (g1_ + m0) * 255; a[i + 2] = (b1_ + m0) * 255;
      }
      g.putImageData(d, 0, 0);
    }
    const t = new THREE.CanvasTexture(c); t.flipY = false; return t;
  }
  function setupModel(gltf) {
    const model = gltf.scene;
    for (const n of ['Hips', 'Head', 'ArmR', 'ArmL', 'LegR', 'LegL']) { const g = model.getObjectByName(n); if (g) mergeParts(g); }
    const bb = new THREE.Box3().setFromObject(model), size = bb.getSize(new THREE.Vector3());
    H_K = H / size.y; model.scale.setScalar(H_K); model.position.y = -bb.min.y * H_K - H / 2;
    let img = null; model.traverse(o => { if (o.isMesh && o.material.map && !img) img = o.material.map.image; });
    for (let i = 0; i < 4; i++) slotMats.push(toon('#ffffff', { map: img ? tintTexture(img, COLORS[i].hue) : null, side: THREE.DoubleSide }));
    const ol = outlineMat(0.014);
    const meshes = []; model.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) { o.castShadow = true; const om = new THREE.Mesh(o.geometry, ol); om.userData.outline = true; om.raycast = () => {}; o.add(om); }
    TEMPLATE = model; CLIPS = gltf.animations;
  }
  const blobGeo = new THREE.CircleGeometry(0.42, 20), bubbleGeo = new THREE.SphereGeometry(0.95, 20, 14);
  class Rig {
    constructor(slot) {
      this.slot = slot; this.root = new THREE.Group(); this.tip = new THREE.Group(); this.spin = new THREE.Group();
      this.root.add(this.tip); this.tip.add(this.spin); this.spin.position.y = H / 2; scene.add(this.root);
      this.model = TEMPLATE.clone(true);
      this.model.traverse(o => { if (o.isMesh && !o.userData.outline) { o.material = slotMats[slot]; o.castShadow = true; } });
      this.spin.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model); this.acts = {}; this.current = '';
      for (const c of CLIPS) this.acts[c.name] = this.mixer.clipAction(c);
      if (this.acts.hurt) { this.acts.hurt.setLoop(THREE.LoopOnce); this.acts.hurt.clampWhenFinished = true; }
      this.armR = this.model.getObjectByName('ArmR'); this.handR = this.model.getObjectByName('HandR');
      this.blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#1e1d2b', transparent: true, opacity: 0.2, depthWrite: false })); this.blob.rotation.x = -Math.PI / 2; scene.add(this.blob);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), new THREE.MeshBasicMaterial({ color: COLORS[slot].hex, transparent: true, opacity: 0.9, depthWrite: false })); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.root.add(this.ring);
      this.bubble = new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.28, depthWrite: false })); this.bubble.position.y = 0.8; this.root.add(this.bubble);
      this.tagCanvas = document.createElement('canvas'); this.tagCanvas.width = 256; this.tagCanvas.height = 72;
      this.tagTex = new THREE.CanvasTexture(this.tagCanvas); this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, depthWrite: false, transparent: true })); this.tag.scale.set(1.7, 0.48, 1); this.tag.position.y = 2.05; this.root.add(this.tag);
      this.tagKey = ''; this.yaw = 0; this.flip = 0; this.landT = 0; this.aimW = 0; this.kick = 0; this.fallT = 0; this.wasAlive = true; this.pos = new THREE.Vector3(); this.seen = false;
      this.play('idle', 0);
    }
    play(name, fade = 0.18) {
      if (!this.acts[name] || this.current === name) return;
      const next = this.acts[name], prev = this.acts[this.current];
      next.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (prev) prev.fadeOut(fade);
      this.current = name;
    }
    drawTag(p, local) {
      const key = `${p.name}|${Math.ceil(p.hp)}|${Math.ceil(p.shield)}|${p.bot}|${local}`;
      if (key === this.tagKey) return; this.tagKey = key;
      const g = this.tagCanvas.getContext('2d'); g.clearRect(0, 0, 256, 72);
      g.font = '28px "Patrick Hand", "Comic Sans MS", sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = 'rgba(255,253,244,0.95)'; g.fillStyle = COLORS[this.slot].hex;
      const label = local ? `${p.name} (you)` : p.bot ? `${p.name} · bot` : p.name;
      g.strokeText(label, 128, 28); g.fillText(label, 128, 28);
      g.fillStyle = '#1e1d2b'; g.fillRect(38, 40, 180, 18);
      g.fillStyle = '#fffdf4'; g.fillRect(41, 43, 174, 12);
      const f = clamp(p.hp / MAXHP, 0, 1); g.fillStyle = f > 0.5 ? '#3bc45c' : f > 0.25 ? '#ffc23d' : '#ff4d5e'; g.fillRect(41, 43, 174 * f, 12);
      if (p.shield > 0) { g.fillStyle = 'rgba(110,210,255,0.9)'; g.fillRect(41, 43, 174 * clamp(p.shield / 50, 0, 1), 5); }
      this.tagTex.needsUpdate = true;
    }
    update(p, dt, rt, local) {
      // p: this doodle as the view sees it now
      if (!this.seen) { this.yaw = p.yaw; this.seen = true; }
      if (p.alive && !this.wasAlive) { this.fallT = 0; this.current = ''; if (this.acts.hurt) this.acts.hurt.stop(); this.play('idle', 0.05); this.flip = 0; }
      this.wasAlive = p.alive;
      const dead = !p.alive;
      if (dead) this.fallT += dt;
      const show = !p.out && (!dead || this.fallT < 1.2) && !(p.inv && p.alive && Math.floor(rt * 12) % 2 === 1 && p.invBlink);
      this.root.visible = !p.out && (!dead || this.fallT < 1.2);
      this.model.visible = show;
      this.root.position.set(p.x, p.y, p.z);
      this.yaw += angDiff(this.yaw, p.yaw) * Math.min(1, dt * (local ? 30 : 16));
      this.root.rotation.set(0, this.yaw, 0);
      const sp = Math.hypot(p.vx, p.vz);
      let anim;
      if (dead || p.emote === 2) anim = 'hurt';
      else if (p.dash) anim = 'dash';
      else if (!p.ground) anim = p.vy > 0 ? 'jump' : 'fall';
      else if (p.stun) anim = 'hurt';
      else if (p.emote === 1) anim = 'win';
      else if (sp > 3.4) anim = 'run';
      else if (sp > 0.25) anim = 'walk';
      else anim = 'idle';
      if (anim === 'hurt' && this.current === 'hurt' && p.stun && !dead && p.emote !== 2) {} else this.play(anim, anim === 'jump' || anim === 'dash' || anim === 'hurt' ? 0.08 : 0.18);
      // the walk and run cycles are timed to the real speed, so feet don't slide
      if (this.acts.walk) this.acts.walk.timeScale = clamp(sp / 1.7, 0.6, 2.4);
      if (this.acts.run) this.acts.run.timeScale = clamp(sp / 4.0, 0.8, 1.7);
      this.mixer.update(dt);
      // falling over (eliminated or the flop emote), the double-jump flip, landing squash
      const fallen = dead || p.emote === 2;
      const target = fallen ? -Math.PI / 2 : 0;
      this.tip.rotation.x += (target - this.tip.rotation.x) * Math.min(1, dt * (fallen ? 7 : 9));
      let flipA = 0;
      if (this.flip > 0) { this.flip += dt; flipA = Math.min(1, this.flip / 0.36); if (this.flip > 0.36 || p.ground) this.flip = 0; }
      this.spin.rotation.x = flipA ? -smooth(flipA) * TAU : 0;
      if (this.landT > 0) this.landT -= dt;
      const sq = this.landT > 0 ? Math.sin(this.landT / 0.12 * Math.PI) * 0.12 : 0;
      this.root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      // the finger gun: the right arm points at the aim
      this.kick = Math.max(0, this.kick - dt * 8);
      this.aimW += ((p.aim && !fallen ? 1 : 0) - this.aimW) * Math.min(1, dt * 14);
      if (this.armR && this.aimW > 0.01) {
        this.root.updateMatrixWorld(true);
        const sh = this.armR.getWorldPosition(_v), dir = _s.set(p.ax, p.ay, p.az).sub(sh).normalize();
        dir.y += this.kick * 0.35; dir.normalize();
        this.armR.parent.getWorldQuaternion(_q).invert(); dir.applyQuaternion(_q);
        this.armR.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(ARM_DIR, dir), this.aimW);
      }
      this.bubble.visible = p.alive && (p.shield > 0 || (p.inv && Math.floor(rt * 8) % 2 === 0));
      if (this.bubble.visible) this.bubble.material.color.set(p.shield > 0 ? '#9fe6ff' : '#ffffff');
      this.ring.material.color.set(p.pw ? ITEM_COLOR[p.pw] : COLORS[this.slot].hex);
      this.ring.scale.setScalar(p.pw ? 1.25 + Math.sin(rt * 8) * 0.08 : 1);
      this.tag.visible = p.alive && !local;
      if (p.alive) this.drawTag(p, local);
      const fl = p.floor ?? 0;
      this.blob.visible = this.root.visible && fl > -1;
      this.blob.position.set(p.x, fl + 0.015, p.z);
      const hgt = Math.max(0, p.y - fl); this.blob.scale.setScalar(Math.max(0.4, 1 - hgt * 0.22)); this.blob.material.opacity = Math.max(0.05, 0.2 - hgt * 0.04);
      this.pos.set(p.x, p.y, p.z);
    }
    hand(out) { this.root.updateMatrixWorld(true); return this.handR ? this.handR.getWorldPosition(out) : out.set(this.pos.x, this.pos.y + 1.1, this.pos.z); }
  }
  const ARM_DIR = new THREE.Vector3(-1, 0, 0);
  let rigs = [];

  // ---- ink shots: drawn from the shot events, moving in a straight line until their end event
  const shots = new Map();
  function addShot(id, ox, oy, oz, dx, dy, dz, big, t0, own) { if (shots.size < SHOT_N) shots.set(id, { ox, oy, oz, dx, dy, dz, big, t0, end: null, own, slot: -1, trail: 0 }); }
  function endShot(id, x, y, z, kind, t) { const s = shots.get(id); if (s) s.end = { x, y, z, kind, t }; else if (kind) splat(x, y, z, kind); }
  function splat(x, y, z, kind) {
    const c = kind === 2 ? '#c98b4b' : kind === 6 ? '#bff3ff' : kind === 3 ? '#2b2d4a' : '#3a3c5a';
    for (let k = 0; k < 4; k++) puff(x, y, z, { vx: rand(-2, 2), vy: rand(0.5, 2.5), vz: rand(-2, 2), c, s0: 0.06, s1: 0.16, life: 0.35, g: 4 });
  }
  function updateShots(rtShots, rtOwn, dt) {
    let i = 0;
    for (const [id, s] of shots) {
      const t = (s.own ? rtOwn : rtShots) - s.t0;
      if (s.end && (s.own ? rtOwn : rtShots) >= s.end.t - 0.001) { splat(s.end.x, s.end.y, s.end.z, s.end.kind); shots.delete(id); continue; }
      if (t > BULLET_LIFE + 0.3) { shots.delete(id); continue; }
      if (t < 0) continue;
      const x = s.ox + s.dx * BULLET_V * t, y = s.oy + s.dy * BULLET_V * t, z = s.oz + s.dz * BULLET_V * t, sz = s.big ? 0.16 : 0.1;
      _m4.makeScale(sz, sz, sz).setPosition(x, y, z); shotMesh.setMatrixAt(i++, _m4);
      if ((s.trail += dt) > 0.03) { s.trail = 0; puff(x, y, z, { c: '#565878', s0: sz * 0.8, s1: sz * 0.3, life: 0.22, drag: 0 }); }
    }
    for (let k = i; k < SHOT_N; k++) shotMesh.setMatrixAt(k, hide);
    shotMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- the lock-on marker: red-and-yellow brackets on the rival you're locked on to, drawn over everything
  const lockTex = ctex(128, 128, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, w] of [['#1e1d2b', 14], ['#ff4d5e', 7]]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath();
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.moveTo(64 + sx * 52, 64 + sy * 24); g.lineTo(64 + sx * 52, 64 + sy * 52); g.lineTo(64 + sx * 24, 64 + sy * 52); }
      g.stroke();
    }
    g.fillStyle = '#ffd93d'; g.strokeStyle = '#1e1d2b'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 9, 0, TAU); g.fill(); g.stroke();
  });
  const lockSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, depthTest: false, depthWrite: false, transparent: true }));
  lockSprite.renderOrder = 999; lockSprite.visible = false; scene.add(lockSprite);
  let lockSlot = -1, lockPop = 0;
  function setLock(s) { if (s !== lockSlot) lockPop = 0; lockSlot = s; }

  // ---- floating damage numbers (pooled DOM)
  const dmgLayer = $('#dmgLayer'), dmgPool = Array.from({ length: 18 }, () => { const d = document.createElement('div'); d.className = 'dmg'; d.hidden = true; dmgLayer.appendChild(d); return { d, t: 0, x: 0, y: 0, z: 0 }; });
  let dmgNext = 0;
  function dmgText(x, y, z, text, color) { const p = dmgPool[dmgNext]; dmgNext = (dmgNext + 1) % dmgPool.length; p.d.textContent = text; p.d.style.color = color; p.d.hidden = false; Object.assign(p, { t: 0, x: x + rand(-0.2, 0.2), y, z: z + rand(-0.2, 0.2) }); }
  function updateDmg(dt) {
    for (const p of dmgPool) {
      if (p.d.hidden) continue; p.t += dt;
      if (p.t > 0.9) { p.d.hidden = true; continue; }
      _v.set(p.x, p.y + p.t * 1.2, p.z).project(camera);
      if (_v.z > 1) { p.d.style.opacity = 0; continue; }
      p.d.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - p.t) * 2})`;
      p.d.style.opacity = p.t > 0.6 ? (0.9 - p.t) / 0.3 : 1;
    }
  }

  // ---- camera: follows your doodle (or whoever you spectate), rotatable and zoomable
  const cam = { yaw: 0.6, pitch: 0.32, dist: 8, eff: 8, follow: false, manualT: 0, look: new THREE.Vector3(0, 1, 0), shake: 0, init: false, t: 0 };
  // the camera stays out of walls and out of treetops (inside a crown you'd only see its ink outline)
  const crowns = MAP.trees.map(t => ({ minX: t.x - 1.35 * t.s, maxX: t.x + 1.35 * t.s, minZ: t.z - 1.35 * t.s, maxZ: t.z + 1.35 * t.s, bottom: 1.5 * t.s, top: 3.9 * t.s }));
  const camBoxes = [...MAP.boxes.filter(b => b.kind !== 'pad'), ...crowns], _cl = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, bottom: 0, top: 0 };
  function camClear(lx, ly, lz, px, py, pz) {
    let t = 1;
    const dx = px - lx, dy = py - ly, dz = pz - lz;
    for (const b of camBoxes) { const k = segBox(lx, ly, lz, dx, dy, dz, b, 0.25); if (k < t) t = k; }
    for (const l of MAP.lifts) { Object.assign(_cl, l); _cl.top = liftTop(l, cam.t); const k = segBox(lx, ly, lz, dx, dy, dz, _cl, 0.25); if (k < t) t = k; }
    return t;
  }
  function updateCamera(focus, aim, dt) {
    const tgt = _v.set(focus.x, focus.y + 0.9, focus.z);
    if (aim) { const ax = clamp(aim.x - focus.x, -10, 10), az = clamp(aim.z - focus.z, -10, 10); tgt.x += ax * 0.08; tgt.z += az * 0.08; }
    if (!cam.init) { cam.look.copy(tgt); cam.init = true; }
    cam.look.lerp(tgt, REDUCED ? 1 : 1 - Math.exp(-dt * 7));
    const cp = Math.cos(cam.pitch), ox = Math.sin(cam.yaw) * cp, oy = Math.sin(cam.pitch), oz = Math.cos(cam.yaw) * cp;
    const clear = cam.dist < 18 ? camClear(cam.look.x, cam.look.y, cam.look.z, cam.look.x + ox * cam.dist, cam.look.y + oy * cam.dist, cam.look.z + oz * cam.dist) : 1;
    const want = Math.max(0.35, cam.dist * clear - 0.15); // right up behind your head if something is that close
    cam.eff = want < cam.eff ? want : cam.eff + (want - cam.eff) * Math.min(1, dt * 3);
    camera.position.set(cam.look.x + ox * cam.eff, cam.look.y + oy * cam.eff, cam.look.z + oz * cam.eff);
    if (cam.shake > 0 && !REDUCED) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake = Math.max(0, cam.shake - dt * 1.5); }
    camera.lookAt(cam.look);
  }
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // where the mouse points: a doodle near the cursor first (aim assist), otherwise a flat sheet at chest height
  function aimAt(nx, ny, me, view, out) {
    ray.setFromCamera({ x: nx, y: ny }, camera);
    let best = null, bd = 0.0035;
    for (const p of view.players) {
      if (!p.alive || p.slot === view.localSlot || p.out) continue;
      _v.set(p.x, p.y + 1, p.z).project(camera);
      const d = (_v.x - nx) ** 2 * (innerWidth / innerHeight) ** 2 + (_v.y - ny) ** 2;
      if (d < bd && _v.z < 1) { bd = d; best = p; }
    }
    if (best) return out.set(best.x, best.y + 1, best.z);
    plane.constant = -(me.y + 1.05);
    if (!ray.ray.intersectPlane(plane, out) || out.distanceTo(_v.set(me.x, me.y, me.z)) > 40) out.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 20);
    return out;
  }

  // ---- events from the match turned into things you can see
  function onEvent(e, view, t) {
    const [, type] = e, a = e.slice(2), P = view.players;
    const near = (x, z) => !view.focus || Math.hypot(x - view.focus.x, z - view.focus.z) < 30;
    switch (type) {
      case 'shot': {
        const [id, slot, ox, oy, oz, dx, dy, dz, big, t0] = a;
        addShot(id, ox, oy, oz, dx, dy, dz, big, t0, slot === view.localSlot);
        const r = rigs[slot]; if (r) r.kick = 1;
        if (near(ox, oz)) puff(ox + dx * 0.15, oy + dy * 0.15, oz + dz * 0.15, { c: '#ffd93d', s0: 0.12, s1: 0.25, life: 0.12 });
        if (slot === view.localSlot) SFX.play('shot'); else if (near(ox, oz)) SFX.play('shot', 0.35);
        break;
      }
      case 'bend': endShot(a[0], a[1], a[2], a[3], a[4], t); break;
      case 'hit': {
        const [v, by, amt, x, y, z, env] = a;
        const color = v === view.localSlot ? '#ff4d5e' : by === view.localSlot ? '#ffd23f' : '#ffffff';
        dmgText(x, y + 0.4, z, `-${amt}`, color);
        for (let k = 0; k < 6; k++) puff(x, y, z, { vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-3, 3), c: k % 2 ? '#2b2d4a' : COLORS[v].hex, s0: 0.07, s1: 0.16, life: 0.4, g: 6 });
        if (v === view.localSlot) { cam.shake = Math.max(cam.shake, 0.18 + amt / 120); HUD.flash(); SFX.play('hurt'); }
        else if (by === view.localSlot) SFX.play('hit');
        break;
      }
      case 'block': { const p = P[a[0]]; if (p) dmgText(p.x, p.y + 1.6, p.z, 'blocked', '#7fd3ff'); break; }
      case 'shieldhit': { const p = P[a[0]]; if (p) for (let k = 0; k < 4; k++) puff(p.x + rand(-0.6, 0.6), p.y + rand(0.3, 1.4), p.z + rand(-0.6, 0.6), { c: '#9fe6ff', s0: 0.08, s1: 0.2, life: 0.3 }); break; }
      case 'kill': {
        const [v, by, cause, x, y, z] = a;
        for (let k = 0; k < 16; k++) puff(x, y + 0.8, z, { vx: rand(-4, 4), vy: rand(1, 6), vz: rand(-4, 4), c: k % 3 ? '#2b2d4a' : COLORS[v].hex, s0: 0.12, s1: 0.32, life: 0.7, g: 9 });
        debris(x, y + 0.8, z, COLORS[v].hex, 6, 0.14, 4);
        HUD.feed(v, by, cause);
        if (by === view.localSlot) { SFX.play('kill'); cam.shake = Math.max(cam.shake, 0.15); }
        else if (v === view.localSlot) SFX.play('down');
        break;
      }
      case 'splash': { const [x, z] = a; for (let k = 0; k < 14; k++) puff(clamp(x, -HALF, HALF), -0.4, clamp(z, -HALF, HALF), { vx: rand(-2, 2), vy: rand(2, 5), vz: rand(-2, 2), c: k % 2 ? '#fbf8ee' : '#b9d3ef', s0: 0.12, s1: 0.3, life: 0.7, g: 10 }); SFX.play('splash', near(x, z) ? 0.8 : 0.3); break; }
      case 'jump': if (a[0] === view.localSlot) SFX.play('jump', 0.5); break;
      case 'jump2': { const r = rigs[a[0]]; if (r) r.flip = 1e-4; const p = P[a[0]]; if (p) for (let k = 0; k < 5; k++) puff(p.x, p.y, p.z, { vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), vy: -1, c: '#ffffff', s0: 0.08, s1: 0.2, life: 0.3 }); if (a[0] === view.localSlot) SFX.play('jump', 0.6, 1.4); break; }
      case 'land': { const r = rigs[a[0]]; if (r) r.landT = 0.12; const p = P[a[0]]; if (p) for (let k = 0; k < 6; k++) puff(p.x + rand(-0.3, 0.3), p.y + 0.05, p.z + rand(-0.3, 0.3), { vx: rand(-2, 2), vz: rand(-2, 2), c: '#f4ecd6', s0: 0.08, s1: 0.22, life: 0.35 }); break; }
      case 'dash': { const p = P[a[0]]; if (p) for (let k = 0; k < 5; k++) puff(p.x, p.y + 0.5, p.z, { vx: rand(-1, 1), vy: rand(0, 1), vz: rand(-1, 1), c: '#ffffff', s0: 0.12, s1: 0.3, life: 0.3 }); if (a[0] === view.localSlot) SFX.play('dash', 0.6); break; }
      case 'boing': { const pm = padMeshes[a[0]]; if (pm) pm.t = 0.35; SFX.play('boing', a[1] === view.localSlot ? 0.8 : 0.3); break; }
      case 'tp': { for (const q of [a[0], a[1]]) { const t2 = tpMeshes[q]; for (let k = 0; k < 12; k++) puff(t2.x + rand(-0.5, 0.5), rand(0.1, 1.8), t2.z + rand(-0.5, 0.5), { vy: rand(1, 3), c: t2.color, s0: 0.06, s1: 0.16, life: 0.6 }); } if (a[2] === view.localSlot) SFX.play('tp'); break; }
      case 'pick': { const S = a[0] >= 0 ? MAP.spawners[a[0]] : null, p = P[a[1]]; const x = S ? S.x : p ? p.x : 0, y = S ? S.y + 0.8 : p ? p.y + 0.8 : 0, z = S ? S.z : p ? p.z : 0; for (let k = 0; k < 10; k++) puff(x, y, z, { vx: rand(-2, 2), vy: rand(1, 3), vz: rand(-2, 2), c: ITEM_COLOR[a[2]], s0: 0.06, s1: 0.16, life: 0.5 }); if (a[1] === view.localSlot) { SFX.play('pick'); HUD.note(POWERS[a[2]].name + '! ' + POWERS[a[2]].note, 1.6); } break; }
      case 'crate': { const c = MAP.crates[a[0]]; debris(c.cx, 0.5, c.cz, '#c98b4b', 10, 0.2, 5); for (let k = 0; k < 6; k++) puff(c.cx, 0.5, c.cz, { vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-2, 2), c: '#e9d2b0', s0: 0.15, s1: 0.4, life: 0.5 }); SFX.play('crate', near(c.cx, c.cz) ? 0.7 : 0.2); break; }
      case 'cratehit': { const c = crateState[a[0]]; if (c) c.wob = 0.2; break; }
      case 'crateback': { const c = crateState[a[0]]; if (c) c.pop = 0; break; }
      case 'arm': { const p = P[a[0]]; if (p) { for (let k = 0; k < 8; k++) puff(p.x, p.y + 0.5, p.z, { vx: rand(-3, 3), vy: rand(1, 4), vz: rand(-3, 3), c: '#ffcf3a', s0: 0.08, s1: 0.2, life: 0.4 }); dmgText(p.x, p.y + 1.8, p.z, 'BONK!', '#ffb02e'); } if (a[0] === view.localSlot) SFX.play('bonk'); break; }
      case 'tgt': { const tv = targetViews[a[0]]; if (tv) { const T = MAP.targets[a[0]]; for (let k = 0; k < 8; k++) puff(T.x, T.y + 1.35, T.z, { vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-2, 2), c: k % 2 ? '#e63946' : '#ffffff', s0: 0.06, s1: 0.16, life: 0.4 }); } if (a[1] === view.localSlot) { SFX.play('hit'); HUD.note('Bullseye!', 0.8); } break; }
      case 'emote': if (a[1] === 1) { const p = P[a[0]]; if (p) for (let k = 0; k < 10; k++) puff(p.x, p.y + 2, p.z, { vx: rand(-2, 2), vy: rand(1, 3), vz: rand(-2, 2), c: ['#ffd93d', '#ff8fb1', '#7fb3ff'][k % 3], s0: 0.06, s1: 0.12, life: 0.7, g: 5 }); } break;
      case 'spawn': { const p = P[a[0]]; if (p && view.state !== 'countdown') for (let k = 0; k < 10; k++) puff(p.x + rand(-0.4, 0.4), rand(0.1, 1.6), p.z + rand(-0.4, 0.4), { vy: rand(1, 2.5), c: COLORS[a[0]].hex, s0: 0.06, s1: 0.16, life: 0.6 }); break; }
    }
  }

  // ---- per frame
  let qualityT = 0, qualityN = 0, qualitySum = 0;
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 66 : 50; camera.updateProjectionMatrix(); pollen.uniforms.uScale.value = innerHeight / 800 * pixelRatio; }
  addEventListener('resize', resize); resize();
  function frame(view, dt, rt, focus, aim) {
    timeU.value += dt;
    const t = view.t;
    // structures that move
    for (let i = 0; i < liftMeshes.length; i++) { const top = liftTop(MAP.lifts[i], t); liftMeshes[i].scale.y = top; liftMeshes[i].userData.lines.position.y = (top - 0.1) / top; }
    arm.rotation.y = -armAngle(t);
    for (const pm of padMeshes) { if (pm.t > 0) pm.t -= dt; const k = pm.t > 0 ? Math.sin(pm.t / 0.35 * Math.PI * 3) * 0.25 * (pm.t / 0.35) : 0; pm.g.scale.set(1 - k * 0.3, 1 + k, 1 - k * 0.3); }
    for (const tp of tpMeshes) { tp.disc.rotation.z += dt * 2; tp.ring.position.y = 0.12 + Math.sin(timeU.value * 3 + tp.x) * 0.03; if (Math.random() < dt * 6) puff(tp.x + rand(-0.45, 0.45), 0.15, tp.z + rand(-0.45, 0.45), { vy: rand(1, 2), c: tp.color, s0: 0.05, s1: 0.1, life: 0.9, drag: 0 }); }
    crateState.forEach((st, i) => {
      const alive = view.crates ? view.crates[i] : true, C = MAP.crates[i];
      if (alive && st.pop < 1) st.pop = Math.min(1, st.pop + dt * 4);
      let w = 0; if (st.wob > 0) { st.wob -= dt; w = Math.sin(st.wob * 60) * 0.06; }
      const k = alive ? smooth(st.pop) : 0;
      _m4.compose(_v.set(C.cx, C.top / 2 * k, C.cz), _q.identity(), _s.set(C.w * (k + w), C.top * (k - w), C.d * (k + w))); crateInst.setMatrixAt(i, _m4);
      _m4.compose(_v, _q, _s.set(C.w * (k + w) + 0.06 * k, C.top * (k - w) + 0.06 * k, C.d * (k + w) + 0.06 * k)); crateHull.setMatrixAt(i, _m4);
    });
    crateInst.instanceMatrix.needsUpdate = true; crateHull.instanceMatrix.needsUpdate = true;
    zone.visible = !!view.sd; if (view.sd) { const r = Math.min(100, view.zone); zone.scale.set(r, 1, r); }
    spawnerViews.forEach((sv, i) => {
      const k = view.spawners ? view.spawners[i] || '' : '';
      if (k !== sv.k) { if (sv.mesh) sv.holder.remove(sv.mesh); sv.mesh = k ? itemMesh(k) : null; if (sv.mesh) { sv.holder.add(sv.mesh); sv.pop = 0; } sv.k = k; }
      sv.glow.material.color.set(k ? ITEM_COLOR[k] : '#d6d0c0'); sv.glow.material.opacity = k ? 0.7 + Math.sin(timeU.value * 4) * 0.2 : 0.3;
      if (sv.mesh) { sv.pop = Math.min(1, (sv.pop || 0) + dt * 3); sv.holder.position.y = 0.85 + Math.sin(timeU.value * 2.4 + i) * 0.12; sv.holder.rotation.y += dt * 1.6; sv.holder.scale.setScalar(smooth(sv.pop) * (sv.S.big ? 1.3 : 1)); }
    });
    const seenDrops = new Set();
    for (const d of view.drops || []) { seenDrops.add(d.id); let m = dropMeshes.get(d.id); if (!m) { m = itemMesh('h'); scene.add(m); dropMeshes.set(d.id, m); } m.position.set(d.x, 0.55 + Math.sin(timeU.value * 3 + d.id) * 0.1, d.z); m.rotation.y += dt * 2; }
    for (const [id, m] of dropMeshes) if (!seenDrops.has(id)) { scene.remove(m); dropMeshes.delete(id); }
    targetViews.forEach((tv, i) => { tv.g.visible = !!view.practice; const down = view.targets ? view.targets[i] : false; tv.hinge.rotation.x += ((down ? -(Math.PI / 2 - 0.1) : 0) - tv.hinge.rotation.x) * Math.min(1, dt * (down ? 12 : 5)); });
    // doodles
    view.players.forEach((p, i) => {
      const r = rigs[i]; if (!r) return;
      r.update(p, dt, timeU.value, i === view.localSlot);
      if (p.alive) playerU.value[i].set(p.x, p.y, p.z, 1); else playerU.value[i].set(0, -99, 0, 0);
    });
    // sky
    cloudData.forEach((c, i) => {
      c.a += c.v * dt;
      const cx = Math.cos(c.a) * c.r, cz = Math.sin(c.a) * c.r;
      c.p.forEach((pp, j) => { const s = pp[3] * c.s; _m4.compose(_v.set(cx + pp[0] * c.s, c.y + pp[1] * c.s, cz + pp[2] * c.s), _q.identity(), _s.set(s, s * 0.75, s)); clouds.setMatrixAt(i * PUFFS + j, _m4); cloudOl.setMatrixAt(i * PUFFS + j, _m4); });
    });
    clouds.instanceMatrix.needsUpdate = true; cloudOl.instanceMatrix.needsUpdate = true;
    const lp = lockSlot >= 0 ? view.players[lockSlot] : null;
    lockSprite.visible = !!(lp && lp.alive);
    if (lockSprite.visible) {
      lockPop = Math.min(1, lockPop + dt * 5);
      const s = (1.7 + Math.sin(timeU.value * 6) * 0.1) * (1 + (1 - smooth(lockPop)) * 1.5);
      lockSprite.position.set(lp.x, lp.y + 0.95, lp.z); lockSprite.scale.set(s, s, 1); lockSprite.material.rotation = (1 - smooth(lockPop)) * 1.2;
    }
    updateShots(view.shotTime ?? t, view.ownShotTime ?? t, dt);
    updateFx(dt);
    if (focus) { cam.t = t; updateCamera(focus, aim, dt); const lr = rigs[view.localSlot]; if (lr && cam.eff < 1.1) lr.model.visible = false; sun.position.set(focus.x + 13, 26, focus.z + 9); sun.target.position.set(focus.x, 0, focus.z); }
    renderer.render(scene, camera);
    updateDmg(dt);
    // keep it smooth: if frames run long for a few seconds, render fewer pixels
    qualityT += dt; qualitySum += dt; qualityN++;
    if (qualityT > 2.5) { const avg = qualitySum / qualityN; if (avg > 1 / 45 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); } qualityT = qualitySum = 0; qualityN = 0; }
  }
  function buildRigs() { rigs.forEach(r => { scene.remove(r.root); scene.remove(r.blob); }); rigs = [0, 1, 2, 3].map(i => new Rig(i)); }
  function hand(slot, out) { return rigs[slot] ? rigs[slot].hand(out) : out; }
  function screenOf(x, y, z, out) { _v.set(x, y, z).project(camera); out.x = (_v.x * 0.5 + 0.5) * innerWidth; out.y = (-_v.y * 0.5 + 0.5) * innerHeight; out.z = _v.z; return out; }
  function clearShots() { shots.clear(); }
  return { setLock, info: () => ({ ...renderer.info.render, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, pr: pixelRatio }), setupModel, buildRigs, frame, onEvent, aimAt, cam, camera, hand, screenOf, clearShots, rigs: () => rigs, LOW, get fps() { return qualityN / Math.max(1e-6, qualitySum); } };
})();
