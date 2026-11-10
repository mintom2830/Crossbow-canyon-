// GPU animation for the instanced small rats.
// Every rat is one instance of one mesh, so hundreds of rats still cost a
// single draw call. Each vertex knows which body part it belongs to (aPart)
// and where that part's joint is (aPivot.xyz; aPivot.w is the kind of rat's gait,
// see below); each instance gets an animation state (iAnim) every frame:
//   x  walk phase in radians (driven by distance walked, so feet don't slide)
//      while dying: the side it rolls over to (+1 / -1)
//   y  hit flinch, 1 -> 0 after a hit; -1 while stunned or frozen (hold still)
//   z  gate attack phase 0..1 (the bite lands at 0.65); -1 when not attacking
//   w  0 alive; 0..1 defeat progress; -1..0 "spent" poof progress
// aSub.w: how little a vertex follows its part's joint (its stiffness).
//   The hand-built rats have separate legs, tail and head (0: they swing whole);
//   a Meshy rat is one skin, so its legs, tail and head bend smoothly out of the
//   body (1 at the joint, falling to 0 at the foot, the tail tip, the snout).
// iState (per instance): the animation controller's state (enemyanim.js):
//   x  pace against its normal walk (0 still, 1 walking, 2+ sprinting)
//   y  lean: + pushing off, - braking      z  stagger (a critical hit, 1 fading to 0)
//   w  getting back up after landing from a throw (1 fading to 0)
// iPhys (optional, per instance): secondary motion simulated on springs in the view:
//   x  the tail swung out of a turn (it lags, then whips back)   y  the head turned into the turn
//   z  a squash when it lands or skids                           w  the ears flopped back and out
// aSub / aSubPivot (zeros on the hand-built rats): smaller parts inside the head
// and tail, and where they turn:
//   x  1 left ear, 2 right ear, 3 jaw (0 none)   y  how much it follows that part
//   z  along the tail, 0 at the root to 1 at the tip (0: a rigid hand-built tail)
//   w  the stiffness above
// aPivot.w (per model, see gaitCode in models.js): how that kind of rat moves, gait +
// 8 × attack. Gaits: 0 trot · 1 gallop · 2 heavy stomp · 3 waddle · 4 sneak · 5 hop.
// Attacks: 0 lunge and bite · 1 dash, bite, hop back · 2 charge and slam · 3 shield bash ·
// 4 heavy lunge · 5 jump and bite · 6 brace and blow up · 7 spinning strike
// (The gait and the stiffness ride in spare components so the shader stays well
// under the 16 vertex inputs many graphics cards allow: the instance matrix alone
// takes four.)
import * as THREE from 'three';

export const RAT_POSE_GLSL = [
  "attribute float aPart;",
  "attribute vec4 aPivot;",
  "attribute vec4 iAnim;",
  "attribute vec4 iPhys;",
  "attribute vec4 aSub;",
  "attribute vec3 aSubPivot;",
  "attribute vec4 iState;",
  "uniform float uTime;",
  "varying float vFlash;",
  "mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }",
  "mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }",
  "mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }",
  "struct RatPose { mat3 rot; vec3 pos; float flash; };",
  "RatPose ratPose(vec3 p) {",
  "float ph = iAnim.x;",
  "float hit = iAnim.y;",
  "float atk = iAnim.z;",
  "float die = iAnim.w;",
  "bool still = hit < 0.0;",
  "hit = max(hit, 0.0);",
  "bool alive = die == 0.0;",
  "bool attacking = atk >= 0.0 && alive;",
  "if (!alive || still) ph = 0.6;",
  "int part = int(aPart + 0.5);",
  "float pw = floor(aPivot.w + 0.5);",
  "int AS = int(floor(pw / 8.0 + 0.01));",        // how it attacks (RAT_ATTACK in models.js)
  "int G = int(pw) - AS * 8;",
  "float bw = 1.0 - aSub.w;",
  // the controller's state (enemyanim.js): pace, lean, stagger, get-up
  "float spd = clamp(iState.x, 0.0, 3.0), lean = clamp(iState.y, -1.0, 1.0), stg = clamp(iState.z, 0.0, 1.0), gup = clamp(iState.w, 0.0, 1.0);",
  // a slow walk takes short steps, a run long ones, a sprint longer still
  "float stride = mix(0.55, 1.0, smoothstep(0.0, 1.0, spd)) * (1.0 + 0.3 * smoothstep(1.2, 2.6, spd));",
  "bool idleNow = alive && !still && !attacking && spd < 0.06;",
  // how much it is on the move (0 standing: the legs settle under it)
  "float mov = alive && !still ? smoothstep(0.02, 0.3, spd) : 0.0;",
  // quicker little steps when sneaking, slower heavy ones when stomping or waddling
  "if (alive && !still) ph *= G == 4 ? 1.45 : G == 2 ? 0.8 : G == 3 ? 0.85 : G == 5 ? 0.75 : 1.0;",
  "float jit = fract(iAnim.x * 0.137);",
  "float swing = sin(ph);",
  "float foot = 1.0 - abs(sin(ph));",
  "mat3 R = mat3(1.0);",
  // the trot's beat: 0 at the middle of a diagonal pair's time on the ground, twice a cycle
  "float m2 = 2.0 * ph - 1.9;",
  "float legUp = 0.0;",
  "if (part >= 1 && part <= 4) {",
  // diagonal pairs step together (front left with back right); the back foot a beat ahead
  "float off = (part == 1 || part == 4) ? 0.0 : 3.14159;",
  "float amp = 0.8, duty = 0.6, lift = 0.085;",
  "if (G == 0) { off += part <= 2 ? 0.0 : 0.3; amp = 0.72; lift = part <= 2 ? 0.07 : 0.1; }",
  "else if (G == 1) { off = part <= 2 ? (part == 1 ? 0.0 : 0.35) : (part == 3 ? 2.6 : 2.95); amp = 1.05; duty = 0.42; lift = 0.12; }",
  "else if (G == 5) { off = part <= 2 ? 0.0 : 0.5; amp = 0.9; duty = 0.5; lift = 0.06; }",
  "else if (G == 2) { amp = 0.6; duty = 0.66; lift = 0.09; }",
  "else if (G == 3) { amp = 0.55; duty = 0.62; lift = 0.05; }",
  "else if (G == 4) { amp = 0.7; duty = 0.7; lift = 0.045; }",
  "duty -= 0.1 * smoothstep(1.2, 2.4, spd);",   // running: less time on the ground
  // each foot is planted and sweeps back under the body as it moves on (so it doesn't
  // slide), then lifts and flicks forward to plant again
  "float u = fract((ph + off) / 6.28318), sw;",
  "if (u < duty) sw = -1.0 + 2.0 * u / duty;",
  "else { float s = (u - duty) / (1.0 - duty); sw = 1.0 - 2.0 * s * s * (3.0 - 2.0 * s); legUp = sin(s * 3.14159) * lift * stride; }",
  "float a = sw * amp * stride * mix(0.25, 1.0, mov);",
  "legUp *= mov * (1.0 - stg) * (1.0 - gup) * (attacking || !alive ? 0.0 : 1.0);",
  // knocked off balance: the legs splay; scrambling up after a throw: they paddle
  "a += stg * (part <= 2 ? -0.5 : 0.35) + gup * sin(uTime * 26.0 + float(part) * 1.9) * 0.7;",
  "if (attacking) {",
  "float wind = smoothstep(0.05, 0.5, atk) * (1.0 - smoothstep(0.58, 0.68, atk));",
  "if (AS == 3 || AS == 4) {",
  // rearing up: the front paws come up (the shield with them), then rake down
  "if (part <= 2) {",
  "float ak = part == 2 ? fract(atk + 0.9) : atk;",
  "float up = smoothstep(0.05, 0.5, ak) * (1.0 - smoothstep(0.58, 0.68, ak));",
  "float rake = smoothstep(0.58, 0.68, ak) * (1.0 - smoothstep(0.75, 1.0, ak));",
  "a = -1.5 * up + 0.5 * rake + (part == 1 ? 0.0 : 0.2) * up;",
  "} else a = 0.25 + 0.2 * wind;",        // braced back feet
  "} else if (AS == 5) {",
  "a = (part <= 2 ? -0.9 : 0.8) * sin(clamp((atk - 0.35) / 0.3, 0.0, 1.0) * 3.14159);",   // tucked for the jump
  "} else {",
  // low to the ground: front paws braced forward, back legs gathered to push off
  "a = (part <= 2 ? -0.45 : 0.4) * wind + (part <= 2 ? 0.3 : -0.25) * smoothstep(0.58, 0.66, atk) * (1.0 - smoothstep(0.76, 1.0, atk));",
  "}",
  "}",
  "if (die > 0.0) a = -0.4 + sin(uTime * 34.0 + float(part) * 1.7) * 0.55 * (1.0 - smoothstep(0.3, 0.6, die));",
  "R = rX(a * bw);",
  "} else if (part == 5) {",
  "float wag = still ? 0.0 : sin(uTime * 7.0 + ph * 0.5) * 0.3 + sin(ph) * 0.12;",
  "float lift = attacking ? -0.35 : G == 1 ? -0.3 - 0.15 * swing : G == 4 ? 0.15 : G == 5 ? -0.25 * abs(swing) : 0.0;",
  "if (G == 4) wag *= 0.3;",
  "if (G == 3) wag += sin(ph) * 0.25;",
  "wag += sin(hit * 18.0) * 0.5 * hit + stg * sin(uTime * 20.0) * 0.4;",
  // a Meshy rat's tail bends along its length (the tip most) and a wave runs down it
  "float tt = aSub.z > 0.0 ? aSub.z : 1.0, bend = aSub.z > 0.0 ? tt * 1.6 : 1.0;",
  "float wave = (still || aSub.z <= 0.0) ? 0.0 : sin(uTime * 8.0 + ph * 0.5 - tt * 3.4) * 0.32 * tt;",
  // a trotting rat holds its tail out straight and low behind it, swaying a little with
  // the hips and a slow ripple running down it (not curled up)
  "if (G == 0 && aSub.z > 0.0) {",
  "lift = 0.04 * mov + (attacking ? 0.12 : 0.0);",   // (the model's curled tail is laid out straight at load: rat-models.js)
  "wag = still ? 0.0 : (sin(ph - 0.9) * 0.08 * mov + sin(uTime * 1.7 + jit * 20.0) * 0.05) + sin(hit * 18.0) * 0.5 * hit + stg * sin(uTime * 20.0) * 0.4;",
  "wave = still ? 0.0 : sin(ph - tt * 2.6) * 0.09 * tt * mov;",
  "}",
  "R = rY(((wag + iPhys.x) * bend + wave) * bw) * rX(lift * bend * bw);",
  "} else if (part == 6) {",
  "float pitch = sin(ph * 2.0) * 0.07 - 0.04 * foot;",
  "float look = still ? 0.0 : sin(uTime * 1.3 + jit * 40.0) * 0.16 * smoothstep(0.4, 1.0, sin(uTime * 0.7 + jit * 23.0));",
  // trotting, the head is carried up and level (it rides out the body's roll) and only nods a little
  "if (G == 0) pitch = mov * (-0.16 - 0.02 * sin(m2) + 0.025 * sin(m2 - 1.2)) - 0.04 * (1.0 - mov) * foot;",
  "if (G == 1) pitch -= 0.12;",
  "if (G == 4) { pitch += 0.12; look = still ? 0.0 : sin(uTime * 4.0 + jit * 40.0) * 0.3 * step(0.6, sin(uTime * 1.1 + jit * 9.0)); }",
  "if (attacking) {",
  "float hu = smoothstep(0.1, 0.55, atk) * (1.0 - smoothstep(0.58, 0.64, atk)), hd = smoothstep(0.58, 0.64, atk) * (1.0 - smoothstep(0.72, 0.9, atk));",
  // rearing kinds lift the head, then bite down; the rest lower it to strike
  "pitch += (AS == 3 || AS == 4) ? -0.35 * hu + 0.55 * hd : AS == 2 ? 0.45 * hu + 0.25 * hd : 0.3 * hu + 0.4 * hd;",
  "}",
  "pitch -= 0.5 * sin(hit * 3.14159) + 0.55 * stg;",
  "look += stg * sin(uTime * 16.0) * 0.25;",
  "if (attacking) look = 0.0;",
  "R = rY((look + iPhys.y) * bw) * rX(pitch * bw);",
  "}",
  // ears and jaw move inside the head before the head turns
  "vec3 pp = p;",
  "mat3 RS = mat3(1.0);",
  "if (part == 6 && aSub.x > 0.5) {",
  "float sw = aSub.y;",
  "if (aSub.x < 2.5) {",
  "float side = aSub.x < 1.5 ? -1.0 : 1.0;",
  "float tw = still ? 0.0 : pow(max(0.0, sin(uTime * 2.3 + jit * 31.0 + side * 1.7)), 14.0) * 0.55;",
  "float flop = iPhys.w + tw + 0.35 * sin(hit * 3.14159) + (die > 0.0 ? 0.6 * smoothstep(0.0, 0.3, die) : 0.0);",
  "RS = rZ(-side * flop * 0.9 * sw) * rX(-flop * 0.7 * sw);",
  "} else {",
  "float open = attacking ? smoothstep(0.45, 0.6, atk) * (1.0 - smoothstep(0.66, 0.8, atk)) : 0.0;",
  "open = max(open, sin(hit * 3.14159) * 0.8);",
  "if (die > 0.0) open = max(open, 0.9 * smoothstep(0.0, 0.2, die));",
  "RS = rX(0.6 * open * sw);",
  "}",
  "pp = RS * (p - aSubPivot) + aSubPivot;",
  "}",
  "vec3 q = R * (pp - aPivot.xyz) + aPivot.xyz;",
  "q.y += legUp * bw;",   // a stepping foot lifts off the ground
  // trotting, the spine rolls: the rump rises as each back foot pushes off, the shoulders
  // a moment later, and the hips swing a little toward the back foot on the ground
  // (planted feet stay where they are)
  "if (G == 0 && !attacking) {",
  "float rr = smoothstep(0.6, -0.6, q.z), keep = (part >= 1 && part <= 4) ? 1.0 - bw : 1.0;",
  "q.y += keep * mov * (0.035 + stride * (0.03 * rr * sin(m2 - 0.7) + 0.012 * (1.0 - rr) * sin(m2 + 0.6)));",   // it stands a little taller on the move
  "q.x += keep * mov * stride * 0.035 * rr * sin(ph + 0.4);",
  "}",
  "float bob = abs(sin(ph)) * 0.05;",
  "float pitchB = sin(ph * 2.0) * 0.04;",
  "float rollB = sin(ph) * 0.05;",
  "vec3 off = vec3(0.0);",
  "vec3 sc = vec3(1.0, 1.0 - 0.06 * foot, 1.0 + 0.03 * foot);",
  // trotting: low and level, a small lift on each diagonal step, and the body stretching
  // as it pushes off and bunching as the feet come under it
  "if (G == 0) { bob = 0.02 * (0.5 + 0.5 * cos(m2)); pitchB = 0.022 * sin(m2); rollB = sin(ph - 0.6) * 0.03; sc = vec3(1.0, 1.0 - 0.02 * (0.5 - 0.5 * cos(m2)), 1.0 + 0.025 * sin(m2 - 0.5)); }",
  "else if (G == 1) { bob = abs(sin(ph + 0.5)) * 0.1; pitchB = sin(ph) * 0.16; rollB = 0.0; sc = vec3(1.0, 1.0 - 0.05 * foot, 1.0 + 0.12 * sin(ph)); }",
  "else if (G == 2) { bob = abs(sin(ph)) * 0.035; rollB = sin(ph) * 0.09; sc = vec3(1.0 + 0.05 * foot, 1.0 - 0.09 * foot, 1.0); }",
  "else if (G == 3) { bob = abs(sin(ph)) * 0.03; rollB = sin(ph) * 0.17; pitchB *= 0.5; }",
  "else if (G == 4) { bob = abs(sin(ph)) * 0.015; rollB *= 0.3; pitchB = 0.07; off.y = -0.07; }",
  "else if (G == 5) { bob = abs(sin(ph)) * 0.16; pitchB = -sin(ph) * 0.12; sc = vec3(1.0 + 0.08 * foot, 0.86 + 0.24 * abs(sin(ph)), 1.0 - 0.05 * foot); }",
  "if (still) { bob = 0.0; pitchB = 0.0; rollB = 0.0; sc = vec3(1.0); off.y = 0.0; }",
  "off.y += bob * (still ? 0.0 : stride);",
  // leaning into a run, forward as it pushes off, back as it brakes
  "if (!still) pitchB += 0.09 * smoothstep(1.1, 2.6, spd) + 0.22 * lean;",
  // standing: it breathes
  "if (idleNow) { float br = sin(uTime * 2.6 + jit * 17.0); sc *= vec3(1.0 + 0.02 * br, 1.0 + 0.035 * br, 1.0); }",
  // a critical hit knocks it off balance: it rocks back and sways side to side
  "float stw = stg * sin(uTime * 15.0 + jit * 9.0);",
  "pitchB -= 0.45 * stg; rollB += 0.35 * stw; off.z -= 0.3 * stg; off.x += 0.12 * stw;",
  // landed from a throw: low and scrabbling, it gets back on its feet
  "off.y -= 0.14 * gup; pitchB += 0.3 * gup * sin(uTime * 13.0); rollB += 0.4 * gup * sin(uTime * 9.0 + 1.0);",
  "sc *= vec3(1.0 + 0.5 * iPhys.z, 1.0 - iPhys.z, 1.0 + 0.5 * iPhys.z);",
  "float fl = sin(hit * 3.14159);",
  "pitchB -= 0.4 * fl;",
  "off.z -= 0.16 * fl;",
  "sc *= vec3(1.0 + 0.14 * fl, 1.0 - 0.2 * fl, 1.0 + 0.08 * fl);",
  "float spinY = 0.0;",
  "if (attacking) {",
  // every attack: anticipation (wind-up), the strike landing at 0.65 (the moment the
  // gate takes the damage), follow-through, recovery
  "float rear = smoothstep(0.05, 0.55, atk) * (1.0 - smoothstep(0.58, 0.66, atk));",
  "float lunge = smoothstep(0.58, 0.66, atk) * (1.0 - smoothstep(0.76, 1.0, atk));",
  "float rec = smoothstep(0.7, 0.84, atk) * (1.0 - smoothstep(0.88, 1.0, atk));",
  "float imp = smoothstep(0.62, 0.66, atk) * (1.0 - smoothstep(0.66, 0.78, atk));",
  "if (AS == 1) {",            // fast: a short dash in, a quick bite, a hop back into its running stance
  "float dash = smoothstep(0.45, 0.62, atk) * (1.0 - smoothstep(0.7, 0.8, atk));",
  "float hopB = sin(clamp((atk - 0.7) / 0.25, 0.0, 1.0) * 3.14159);",
  "pitchB += 0.12 * rear + 0.15 * dash - 0.25 * hopB;",
  "off.z += -0.05 * rear + 0.5 * dash - 0.3 * hopB; off.y += 0.3 * hopB;",
  "} else if (AS == 2) {",     // armoured: head down, a step back, then a charge that slams in
  "float back = smoothstep(0.05, 0.5, atk) * (1.0 - smoothstep(0.52, 0.6, atk));",
  "float chg = smoothstep(0.52, 0.65, atk) * (1.0 - smoothstep(0.75, 0.95, atk));",
  "pitchB += 0.3 * back + 0.22 * chg; off.z += -0.25 * back + 0.5 * chg;",
  "sc *= vec3(1.0 + 0.12 * imp, 1.0 - 0.15 * imp, 1.0 - 0.18 * imp);",
  "} else if (AS == 3) {",     // shield: rears up behind the raised shield, braces, bashes forward
  "pitchB += -0.7 * rear + 0.25 * lunge; off.z += -0.1 * rear + 0.42 * lunge; off.y += 0.06 * rear;",
  "} else if (AS == 4) {",     // brood: a heavy, slower lunge, the sack throwing its weight
  "pitchB += -0.45 * rear + 0.4 * lunge; off.z += -0.08 * rear + 0.3 * lunge; off.y += 0.03 * rear;",
  "sc *= vec3(1.0 + 0.08 * imp, 1.0 - 0.1 * imp, 1.0);",
  "} else if (AS == 5) {",     // ratling: jumps at the gate and bites
  "float jmp = sin(clamp((atk - 0.35) / 0.3, 0.0, 1.0) * 3.14159);",
  "off.y += 0.45 * jmp; off.z += 0.5 * smoothstep(0.35, 0.65, atk) * (1.0 - smoothstep(0.8, 1.0, atk)); pitchB -= 0.3 * jmp;",
  "} else if (AS == 6) {",     // bomb: braces low as the fuse burns down, then the blast
  "float brace = smoothstep(0.05, 0.6, atk) * (1.0 - smoothstep(0.62, 0.7, atk));",
  "float blast = smoothstep(0.64, 0.7, atk) * (1.0 - smoothstep(0.8, 1.0, atk));",
  "off.y -= 0.08 * brace; pitchB += 0.2 * brace - 0.4 * blast; off.z -= 0.25 * blast;",
  "sc *= vec3(1.0 + 0.06 * brace + 0.2 * blast, 1.0 - 0.1 * brace + 0.15 * blast, 1.0 + 0.06 * brace);",
  "} else if (AS == 7) {",     // ninja: crouches, then a full spinning strike
  "spinY = smoothstep(0.4, 0.66, atk) * 6.2832;",
  "pitchB += 0.15 * rear; off.z += 0.35 * lunge; off.y += 0.12 * sin(smoothstep(0.4, 0.66, atk) * 3.14159);",
  "} else {",                  // a plain rat: slows, lowers its head, lunges, bites, recoils
  "pitchB += 0.18 * rear + 0.32 * lunge - 0.2 * rec; off.z += -0.08 * rear + 0.38 * lunge - 0.12 * rec;",
  "sc *= vec3(1.0, 1.0 - 0.06 * rear, 1.0 + 0.04 * rear);",
  "}",
  "rollB = 0.0;",
  "}",
  "mat3 B = rY(spinY) * rZ(rollB) * rX(pitchB);",
  "vec3 hip = vec3(0.0, 0.12, -0.3);",
  "vec3 r = B * ((q - hip) * sc) + hip + off;",
  "mat3 Rt = B * R * RS;",
  "float flash = still ? 0.0 : smoothstep(0.6, 1.0, hit) * 0.75;",
  "if (die > 0.0) {",
  "float side = iAnim.x;",
  "float flip = smoothstep(0.0, 0.32, die);",
  "float hop = sin(clamp(die / 0.32, 0.0, 1.0) * 3.14159) * 0.42;",
  "mat3 D = rZ(3.14159 * flip * side);",
  "vec3 c = vec3(0.0, 0.3, 0.0);",
  "r = D * (r - c) + c + vec3(0.0, hop, -0.25 * flip);",
  "float gone = smoothstep(0.58, 0.95, die);",
  "r = r * (1.0 - gone) + vec3(0.0, 0.1, -0.25) * gone;",
  "Rt = D * Rt;",
  "flash = (1.0 - smoothstep(0.0, 0.18, die)) * 0.9;",
  "} else if (die < 0.0) {",
  "float k = -die;",
  "mat3 S = rY(k * 10.0);",
  "r = S * r * (1.0 - smoothstep(0.15, 1.0, k)) + vec3(0.0, k * 0.5, 0.0);",
  "Rt = S * Rt;",
  "flash = 0.4 * (1.0 - k);",
  "}",
  "return RatPose(Rt, r, flash);",
  "}",
].join('\n');

// Toon-shaded rat material (gradientMap: the banded light ramp from toon.js).
// map: a Meshy model's texture (the hand-built rats are vertex-coloured).
export function ratMaterial(uniforms, gradientMap, map = null) {
  // a Meshy model (map) is drawn from both sides, so its open edges never show the outline behind
  const mat = new THREE.MeshToonMaterial(map ? { map, gradientMap, side: THREE.DoubleSide } : { vertexColors: true, gradientMap });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + RAT_POSE_GLSL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  RatPose rp = ratPose(position);\n  objectNormal = rp.rot * objectNormal;\n  vFlash = rp.flash;')
      .replace('#include <begin_vertex>', 'vec3 transformed = rp.pos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.96, 0.92) * vFlash;');
  };
  mat.customProgramCacheKey = () => (map ? 'rat-anim-toon-tex-v7' : 'rat-anim-toon-v7');
  return mat;
}

// Gate attack phase (0..1, bite at 0.65) from the simulation's swing timer.
export function attackPhase(attackT, rate) {
  const a = 1 - attackT / rate + 0.65;
  return a - Math.floor(a);
}
