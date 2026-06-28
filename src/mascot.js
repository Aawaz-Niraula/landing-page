import * as THREE from 'three';

/*
 * Aawax, built procedurally from Three.js primitives.
 * Returns { group, parts } where `parts` exposes the pieces the scene
 * animates: eyes (for mouse-look), arms (cheer), antenna, and the two
 * transform accessories — `glasses` (nerd form) and `snake` (snake form).
 */

export const COLORS = {
  bodyTop: '#c9a4f2',
  bodyBottom: '#f0a6c8',
  dark: '#2c2438',
  blush: '#f291bd',
  antenna: '#e9e3f5',
  ball: '#ef9ac4',
  footL: '#7d6be6',
  footR: '#ef9ac4',
};

function gradientMaterial(topHex, bottomHex, extra = {}) {
  const sharedU = {
    uTop:    { value: new THREE.Color(topHex) },
    uBottom: { value: new THREE.Color(bottomHex) },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.0, color: 0xffffff, ...extra });
  mat._colorUniforms = sharedU;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTop    = sharedU.uTop;
    shader.uniforms.uBottom = sharedU.uBottom;
    shader.vertexShader =
      'varying float vGrad;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vGrad = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);'
      );
    shader.fragmentShader =
      'uniform vec3 uTop;\nuniform vec3 uBottom;\nvarying float vGrad;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= mix(uBottom, uTop, vGrad);'
      );
  };
  return mat;
}

const solid = (hex, extra = {}) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.4, metalness: 0.0, ...extra });

export function createMascot() {
  const group = new THREE.Group();
  const parts = {};
  parts.gradientMats = [];
  const SPHERE = new THREE.SphereGeometry(1, 64, 64);
  const front = (x, y) => Math.sqrt(Math.max(0.0001, 1 - x * x - y * y));

  // ---- Body -------------------------------------------------------------
  const body = new THREE.Mesh(SPHERE, gradientMaterial(COLORS.bodyTop, COLORS.bodyBottom, { roughness: 0.38 }));
  body.scale.set(1.06, 1.0, 1.0);
  group.add(body);
  parts.body = body;
  parts.gradientMats.push(body.material);

  // ---- Eyes (each a small group so they can dart toward the cursor) -----
  parts.eyeL = null;
  parts.eyeR = null;
  const eyeGeo = new THREE.SphereGeometry(0.14, 32, 32);
  const eyeMat = solid(COLORS.dark, { roughness: 0.18 });
  const hiGeo = new THREE.SphereGeometry(0.045, 16, 16);
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeBase = {};
  for (const sx of [-1, 1]) {
    const x = 0.3 * sx, y = 0.12;
    const z = front(x, y) * 0.99;
    const eye = new THREE.Group();
    eye.position.set(x, y, z);
    const ball = new THREE.Mesh(eyeGeo, eyeMat);
    ball.scale.set(0.78, 1.25, 0.7);
    eye.add(ball);
    const hi = new THREE.Mesh(hiGeo, hiMat);
    hi.position.set(-0.03 * sx, 0.06, 0.08);
    eye.add(hi);
    group.add(eye);
    const key = sx < 0 ? 'eyeL' : 'eyeR';
    parts[key] = eye;
    eyeBase[key] = eye.position.clone();
  }
  parts.eyeBase = eyeBase;

  // ---- Mouth ------------------------------------------------------------
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.035, 16, 48, Math.PI),
    solid(COLORS.dark, { roughness: 0.2 })
  );
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.16, front(0, -0.16) * 0.99);
  group.add(mouth);
  parts.mouth = mouth;

  // ---- Blush ------------------------------------------------------------
  const blushMat = solid(COLORS.blush, { transparent: true, opacity: 0.7, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const x = 0.52 * sx, y = -0.08;
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), blushMat);
    blush.position.set(x, y, front(x, y) * 0.985);
    blush.scale.set(1.25, 0.85, 0.4);
    group.add(blush);
  }

  // ---- Arm nubs ---------------------------------------------------------
  const armMat = gradientMaterial(COLORS.bodyTop, COLORS.bodyBottom);
  parts.gradientMats.push(armMat);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(SPHERE, armMat);
    arm.scale.set(0.3, 0.42, 0.3);
    arm.position.set(1.02 * sx, -0.18, 0.05);
    arm.rotation.z = -0.4 * sx;
    group.add(arm);
    parts[sx < 0 ? 'armL' : 'armR'] = arm;
  }

  // ---- Feet -------------------------------------------------------------
  for (const f of [{ sx: -1, hex: COLORS.footL, k: 'footL' }, { sx: 1, hex: COLORS.footR, k: 'footR' }]) {
    const foot = new THREE.Mesh(SPHERE, solid(f.hex));
    foot.scale.set(0.34, 0.26, 0.42);
    foot.position.set(0.4 * f.sx, -0.98, 0.42);
    group.add(foot);
    parts[f.k] = foot;
  }

  // ---- Antenna ----------------------------------------------------------
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0.0, 0.95, 0.1),
    new THREE.Vector3(-0.18, 1.45, 0.1),
    new THREE.Vector3(0.12, 1.78, 0.1)
  );
  const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.025, 12, false), solid(COLORS.antenna, { roughness: 0.6 }));
  group.add(stalk);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 32), solid(COLORS.ball, { emissive: new THREE.Color(COLORS.ball), emissiveIntensity: 0.35 }));
  ball.position.copy(curve.getPoint(1));
  group.add(ball);
  parts.antennaBall = ball;
  parts.antenna = stalk;

  // ====================================================================
  //  NERD FORM — glasses (hidden until the StudyBuddy section)
  // ====================================================================
  const glasses = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#15121c', roughness: 0.35, metalness: 0.3 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.1, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.4 });
  for (const sx of [-1, 1]) {
    const x = 0.3 * sx, y = 0.13, z = front(x, y) * 0.99 + 0.04;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 16, 40), frameMat);
    rim.position.set(x, y, z);
    glasses.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), lensMat);
    lens.position.set(x, y, z - 0.01);
    glasses.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), frameMat);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.13, front(0, 0.13) * 0.99 + 0.06);
  glasses.add(bridge);
  for (const sx of [-1, 1]) {
    const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), frameMat);
    temple.rotation.z = Math.PI / 2;
    temple.rotation.y = 0.5 * sx;
    temple.position.set(0.55 * sx, 0.15, 0.55);
    glasses.add(temple);
  }
  glasses.scale.setScalar(0.001);
  glasses.visible = false;
  group.add(glasses);
  parts.glasses = glasses;

  // ====================================================================
  //  SNAKE FORM — a tapering tail + forked tongue (hidden until Speaker)
  // ====================================================================
  const snake = new THREE.Group();
  const snakeMat = gradientMaterial(COLORS.bodyTop, COLORS.bodyBottom, { roughness: 0.36 });
  const seg = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const r = 0.34 * (1 - i / (N + 1));
    const s = new THREE.Mesh(SPHERE, snakeMat);
    s.scale.setScalar(r);
    snake.add(s);
    seg.push({ mesh: s, r });
  }
  snake.scale.setScalar(0.001);
  snake.visible = false;
  group.add(snake);
  parts.snake = snake;
  parts.snakeSeg = seg;

  // forked tongue — long & red, protrudes from the mouth and flicks
  const tongue = new THREE.Group();
  const tongueMat = solid('#e0335f', { roughness: 0.25, emissive: new THREE.Color('#5e0d22'), emissiveIntensity: 0.3 });
  const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.42, 10), tongueMat);
  tBase.position.y = -0.21;
  tongue.add(tBase);
  for (const sx of [-1, 1]) {
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 0.22, 8), tongueMat);
    fork.position.set(0.07 * sx, -0.5, 0);
    fork.rotation.z = 0.6 * sx;
    tongue.add(fork);
  }
  tongue.rotation.x = Math.PI * 0.52; // angle out & down from the mouth
  tongue.position.set(0, -0.2, front(0, -0.2) * 0.99 + 0.08);
  tongue.scale.setScalar(0.001);
  tongue.visible = false;
  group.add(tongue);
  parts.tongue = tongue;

  // ====================================================================
  //  SPEAKER FORM — cute bow + microphone (shown in Speaker Coach section)
  // ====================================================================
  const bowMat = solid('#ef9ac4', { emissive: new THREE.Color('#7a1040'), emissiveIntensity: 0.25, roughness: 0.4 });
  const bow = new THREE.Group();
  for (const sx of [-1, 1]) {
    const lobe = new THREE.Mesh(SPHERE, bowMat);
    lobe.scale.set(0.28, 0.18, 0.13);
    lobe.position.set(0.16 * sx, 0.04 * sx, 0);
    lobe.rotation.z = 0.5 * sx;
    bow.add(lobe);
  }
  const bowKnot = new THREE.Mesh(SPHERE, solid('#ffc8de', { roughness: 0.35 }));
  bowKnot.scale.setScalar(0.09);
  bow.add(bowKnot);
  bow.position.set(0.26, 0.93, 0.30);
  bow.scale.setScalar(0.001);
  bow.visible = false;
  group.add(bow);
  parts.bow = bow;

  // A refined handheld mic: tapered handle · chrome collar · status light ·
  // metallic windscreen with grille bands that HUG the sphere (no floating halo).
  const micBodyMat   = new THREE.MeshStandardMaterial({ color: '#2c2438', roughness: 0.34, metalness: 0.78, emissive: new THREE.Color('#181020'), emissiveIntensity: 0.25 });
  const micChromeMat = new THREE.MeshStandardMaterial({ color: '#dccbf6', roughness: 0.16, metalness: 0.95 });
  const micGrilleMat = new THREE.MeshStandardMaterial({ color: '#b6a2e4', roughness: 0.24, metalness: 0.9, emissive: new THREE.Color('#553aa0'), emissiveIntensity: 0.45 });
  const micLightMat  = solid('#ff8fc4', { emissive: new THREE.Color('#ff8fc4'), emissiveIntensity: 1.7, roughness: 0.3 });

  const mic = new THREE.Group();
  const HEAD_R = 0.135, HEAD_Y = 0.34, HEAD_SQUASH = 1.12;

  // Handle — gently tapered so it reads as "held"
  const micHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.5, 24), micBodyMat);
  micHandle.position.y = 0.02;
  mic.add(micHandle);

  // Rounded butt cap
  const micCap = new THREE.Mesh(new THREE.SphereGeometry(0.044, 20, 16), micBodyMat);
  micCap.position.y = -0.23;
  micCap.scale.y = 0.7;
  mic.add(micCap);

  // Chrome collar where the handle meets the head
  const micCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.058, 0.05, 24), micChromeMat);
  micCollar.position.y = 0.26;
  mic.add(micCollar);

  // Thin status-light ring above the collar
  const micLight = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 10, 28), micLightMat);
  micLight.position.y = 0.30;
  micLight.rotation.x = Math.PI / 2;
  mic.add(micLight);

  // Windscreen head — metallic, slightly egg-shaped
  const micHead = new THREE.Mesh(SPHERE, micChromeMat);
  micHead.scale.set(HEAD_R, HEAD_R * HEAD_SQUASH, HEAD_R);
  micHead.position.y = HEAD_Y;
  mic.add(micHead);

  // Grille bands — latitude rings sized to sit ON the windscreen surface
  for (const dy of [-0.06, -0.02, 0.02, 0.06]) {
    const t = dy / (HEAD_R * HEAD_SQUASH);
    const ringR = Math.sqrt(Math.max(0.0001, 1 - t * t)) * HEAD_R * 1.015;
    const band = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.006, 8, 32), micGrilleMat);
    band.position.y = HEAD_Y + dy;
    band.rotation.x = Math.PI / 2;
    mic.add(band);
  }

  // On Aawax's left so the mic frames inward when the rig settles screen-right
  const MIC_BASE = { x: -0.6, y: 0.06, z: 0.62, rz: -0.3 };
  mic.position.set(MIC_BASE.x, MIC_BASE.y, MIC_BASE.z);
  mic.rotation.set(-0.26, 0.12, MIC_BASE.rz);
  mic.scale.setScalar(0.001);
  mic.visible = false;
  mic.userData.base = MIC_BASE;
  group.add(mic);
  parts.mic = mic;

  return { group, parts };
}
