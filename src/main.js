import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { createPlanet } from './scene/planet.js';
import { loadCharacter, createGlasses } from './scene/character.js';

gsap.registerPlugin(ScrollTrigger, CustomEase);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const isMobile = () => window.innerWidth < 860;
// Cap the device-pixel-ratio hard on phones (DPR 2-3 at full res is the main
// cause of mobile jank); desktops get up to 1.5.
const targetDPR = () => Math.min(window.devicePixelRatio, isMobile() ? 1 : 1.5);

/* ===================================================================== *
 * ORGANIC EASE — one custom curve reused across the whole orchestration.
 * A weighted, fast-to-settle deceleration (expo-out family) that reads as
 * hand-animated instead of the linear / `power2` "robotic" default.
 * ===================================================================== */
const organic = CustomEase.create('organic', 'M0,0 C0.16,1 0.3,1 1,1');

/* ===================================================================== *
 * LENIS — THE SCROLL ENGINE.
 * Initialised at the very top so it is the single momentum source the rest
 * of the page reads from. Lenis scrolls the *real* window, so every
 * `window.scrollY` read elsewhere stays valid. Three wires here:
 *   1. lenis.on('scroll', ScrollTrigger.update) → frame-for-frame sync so
 *      GSAP scrub animations track the smoothed scroll exactly.
 *   2. gsap.ticker drives lenis.raf → scroll + tweens share ONE clock.
 *   3. lagSmoothing(0) → never let GSAP "catch up" and desync the scrub.
 * Disabled under prefers-reduced-motion (native scroll only).
 * ===================================================================== */
let lenis = null;
let scrollVel = 0; // smoothed scroll velocity → drives the kinetic skew
if (!reduced) {
  lenis = new Lenis({
    duration: 1.25,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    smoothTouch: false,
    wheelMultiplier: 0.85, // more deliberate scroll so the perks aren't flung past
    touchMultiplier: 1.1,
  });
  lenis.on('scroll', (e) => {
    ScrollTrigger.update();
    scrollVel = e.velocity ?? 0;
  });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ===================================================================== *
 * THREE.JS SETUP
 * ===================================================================== */
const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(targetDPR());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#08060f');
scene.fog = new THREE.FogExp2('#0b0814', 0.022);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 6);

scene.add(new THREE.AmbientLight('#ffffff', 0.45));
const hemi = new THREE.HemisphereLight('#c9b6ff', '#ff9ec0', 0.6);
scene.add(hemi);
const key = new THREE.DirectionalLight('#fff4ff', 1.9);
key.position.set(3, 5, 4); scene.add(key);
const fill = new THREE.DirectionalLight('#7aa2ff', 0.9);
fill.position.set(-4, 2, -2); scene.add(fill);
const accent = new THREE.PointLight('#b07cf0', 28, 18, 2);
accent.position.set(2, 1.5, 3); scene.add(accent);
const flashLight = new THREE.PointLight('#ffffff', 0, 9, 1.4);
scene.add(flashLight);

// Starfield
function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.3,'rgba(255,255,255,0.8)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const starGeo = new THREE.BufferGeometry();
const STAR_N = 620; // calmer sky (was 1400)
const sp = new Float32Array(STAR_N * 3);
for (let i = 0; i < STAR_N; i++) {
  const r=20+Math.random()*60, th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
  sp[i*3]=r*Math.sin(ph)*Math.cos(th); sp[i*3+1]=r*Math.sin(ph)*Math.sin(th); sp[i*3+2]=r*Math.cos(ph);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  map:starTexture(), size:0.26, transparent:true, opacity:0.8, depthWrite:false,
  color:'#b9a8e0', blending:THREE.AdditiveBlending, sizeAttenuation:true,
}));
scene.add(stars);

const planet = createPlanet();
scene.add(planet.group);

/* ===================================================================== *
 * CHARACTER RIG + SHOCKWAVE
 * ===================================================================== */
const rig = new THREE.Group();
const lookGroup = new THREE.Group();
rig.add(lookGroup);
scene.add(rig);

const shockwaveMat = new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
const shockwave = new THREE.Mesh(new THREE.SphereGeometry(1,32,32), shockwaveMat);
shockwave.scale.setScalar(0.01); rig.add(shockwave);
const innerShockMat = new THREE.MeshBasicMaterial({color:'#e0c8ff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
const innerShock = new THREE.Mesh(new THREE.SphereGeometry(1,24,24), innerShockMat);
innerShock.scale.setScalar(0.01); rig.add(innerShock);

/* ===================================================================== *
 * RIG ANCHORS — where Aawax SETTLES per section, in SCREEN space. The render
 * loop converts the anchor to world coords and damps toward it, so Aawax
 * always tucks into the visible empty zone beside the app (never behind it).
 *   study → content RIGHT → Aawax small, empty LEFT,  looks right →
 *   speak → content LEFT  → Aawax small, empty RIGHT, looks left  ←
 * ===================================================================== */
// SCREEN-SPACE anchors: fx,fy are viewport fractions (0..1), converted to world
// every frame so Aawax always lands in the visible EMPTY zone at any aspect
// ratio — and stays SMALL beside the app content instead of behind it.
// Desktop: fx/fy/s (screen anchor). Mobile: mfy/ms override so Aawax sits
// CENTRED, behind the stacked cards as ambient background (there's no room to
// the side on a phone). mfy/ms default sensibly when omitted.
const RIG = {
  hero:  { fx: 0.5,  fy: 0.30, z: 0.0,  s: 0.62, mfy: 0.30, ms: 0.5 },
  study: { fx: 0.20, fy: 0.20, z: 0.3,  s: 0.40, mfy: 0.46, ms: 0.66 }, // mobile: behind card
  speak: { fx: 0.80, fy: 0.20, z: 0.3,  s: 0.40, mfy: 0.46, ms: 0.66 }, // mobile: behind card
  how:   { fx: 0.5,  fy: 0.13, z: -0.6, s: 0.34, mfy: 0.14, ms: 0.34 },
  cta:   { fx: 0.5,  fy: 0.16, z: 0.0,  s: 0.44, mfy: 0.16, ms: 0.42 },
};
function screenToWorld(fx, fy, worldZ) {
  const dist = camera.position.z - worldZ;
  const vH = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
  const vW = vH * camera.aspect;
  return { x: (fx - 0.5) * vW, y: (0.5 - fy) * vH };
}
const rigScreen = { ...RIG.hero };                    // desired screen anchor
const rigState  = { x: 0, y: 1.05, z: 0, s: 0.62 };   // damped world, applied each frame
let portalRig   = null;                                // portal override (highest priority)
let faceBias = 0, faceBiasTarget = 0;                  // yaw so Aawax looks toward its app
let tourFy = null;                                     // when touring, overrides the anchor fy
let touring = false;                                   // guard section triggers during a tour
// Tour DOM refs + state declared EARLY so the section triggers (which call
// showHint/hideHint during ScrollTrigger's first refresh) never hit a TDZ.
const hintEl     = document.getElementById('aawax-hint');
const bubbleEl   = document.getElementById('aawax-bubble');
const bubbleText = bubbleEl?.querySelector('.ab-text');
const bubbleNext = bubbleEl?.querySelector('.ab-next');
let tourSteps = [], tourIdx = -1, tourSection = null, tourFx = null;
const tourEligible = (el) => el && !reduced && el.querySelector('[data-tour]'); // mobile included

let alien = null;
let speakerMode = false, isSpeaking = false, speakPhase = 0;
let micIntro = false; // true while the mic plays its rise/twist entrance
// Lock mouse-look during spin
let spinLock = false;
// Camera shake intensity (decays each frame)
let camShake = 0;

loadCharacter({url:'/assets/alien.glb', kind:'alien'}).then(a => {
  alien = a;
  lookGroup.add(alien.root);
  const g = createGlasses(); alien.attachGlasses(g); setGlasses(false);
  ScrollTrigger.refresh();
});

/* ===================================================================== *
 * APP THEMES — strict colour identity. StudyBuddy is GREEN, Speaker Coach
 * is PURPLE. Nothing else. Used by the body morph, booms, sweeps, cursor.
 * ===================================================================== */
const THEME = {
  study:   { top:'#4ade80', bot:'#86efac', acc:'#4ade80', hex:'#4ade80', glow:'74,222,128'  },
  speak:   { top:'#a855f7', bot:'#c084fc', acc:'#a855f7', hex:'#a855f7', glow:'168,85,247'   },
  default: { top:'#c9a4f2', bot:'#f0a6c8', hex:'#b07cf0' },
};

/* ===================================================================== *
 * COLOR MORPHING — Aawaz body only, no scene lighting changes
 * ===================================================================== */
function animateAwaxColor(topHex, botHex, accentHex) {
  const p = alien?.procedural?.parts;
  if (!p) return;
  const top = new THREE.Color(topHex), bot = new THREE.Color(botHex);
  p.gradientMats?.forEach(mat => {
    if (!mat._colorUniforms) return;
    gsap.to(mat._colorUniforms.uTop.value,    {r:top.r,g:top.g,b:top.b,duration:0.55,ease:'power2.inOut'});
    gsap.to(mat._colorUniforms.uBottom.value, {r:bot.r,g:bot.g,b:bot.b,duration:0.55,ease:'power2.inOut'});
  });
  if (accentHex) {
    const acc = new THREE.Color(accentHex);
    [p.bow, p.mic].forEach(grp => grp?.children?.forEach(c => {
      if (c.material?.color) gsap.to(c.material.color, {r:acc.r,g:acc.g,b:acc.b,duration:0.4});
    }));
  }
}

function setGlasses(on) {
  if (!alien?.glasses) return;
  if (on) alien.glasses.visible = true;
  gsap.to(alien.glasses.scale, {
    x:on?1:0.001, y:on?1:0.001, z:on?1:0.001,
    duration:0.5, ease:on?'back.out(2)':'power2.in',
    onComplete: () => { if (!on) alien.glasses.visible = false; },
  });
  alien.setExpression(on ? 'studious' : 'neutral');
  if (on) animateAwaxColor(THEME.study.top, THEME.study.bot, THEME.study.acc);
  else if (!speakerMode) animateAwaxColor(THEME.default.top, THEME.default.bot);
}
// StudyBuddy "look" (appearance only — the boom is applied by the caller).
const studyLook = () => setGlasses(true);

/* ===================================================================== *
 * SHOCKWAVE — contained, visible inside the portal circle
 * ===================================================================== */
function flashTransform(onPeak) {
  if (reduced) { onPeak?.(); return; }
  const tl = gsap.timeline();
  gsap.set([shockwave.scale, innerShock.scale], {x:0.04,y:0.04,z:0.04});
  gsap.set([shockwaveMat, innerShockMat], {opacity:0});
  // Smaller, tighter boom — a crisp pop that settles fast instead of
  // swallowing the frame. Peak radii roughly halved vs. the old blast.
  tl.to(innerShockMat, {opacity:0.6,duration:0.06}, 0)
    .to(innerShock.scale, {x:0.2,y:0.2,z:0.2,duration:0.06}, 0)
    .to(shockwaveMat, {opacity:0.42,duration:0.08}, 0)
    .to(shockwave.scale, {x:0.16,y:0.16,z:0.16,duration:0.08}, 0)
    .to(flashLight, {intensity:34,duration:0.07}, 0)
    .add(() => onPeak?.(), 0.09)
    .to(shockwave.scale, {x:1.25,y:1.25,z:1.25,duration:0.46,ease:organic}, 0.08)
    .to(shockwaveMat, {opacity:0,duration:0.4,ease:'power2.in'}, 0.1)
    .to(innerShock.scale, {x:0.78,y:0.78,z:0.78,duration:0.34,ease:'power2.out'}, 0.08)
    .to(innerShockMat, {opacity:0,duration:0.3,ease:'power2.in'}, 0.12)
    .to(flashLight, {intensity:0,duration:0.44,ease:'power2.out'}, 0.1)
    .set([shockwave.scale, innerShock.scale], {x:0.01,y:0.01,z:0.01});
}

// Speaker Coach "look" (appearance only — purple body, bow + mic, sly grin).
function speakerLook() {
  if (!alien) return;
  speakerMode = true;
  const p = alien.procedural?.parts;
  animateAwaxColor(THEME.speak.top, THEME.speak.bot, THEME.speak.acc);
  if (p?.bow) { p.bow.visible=true; gsap.fromTo(p.bow.scale,{x:0.001,y:0.001,z:0.001},{x:1,y:1,z:1,duration:0.6,ease:'back.out(2)'}); }
  if (p?.mic) {
    p.mic.visible = true;
    const b = p.mic.userData.base;
    // The mic rises + twists into the hand; micIntro pauses the render float.
    micIntro = true;
    gsap.fromTo(p.mic.scale, {x:0.001,y:0.001,z:0.001}, {x:1,y:1,z:1, duration:0.7, ease:'back.out(1.8)', delay:0.08});
    gsap.fromTo(p.mic.position, {y:b.y-0.28, x:b.x}, {y:b.y, duration:0.75, ease:organic, delay:0.08});
    gsap.fromTo(p.mic.rotation, {z:b.rz-0.55}, {z:b.rz, duration:0.85, ease:organic, delay:0.08});
    gsap.delayedCall(1.0, () => { micIntro = false; });
  }
  alien.setExpression('sly');
}
function defaultLook() {
  if (!alien) return;
  speakerMode = false;
  const p = alien.procedural?.parts;
  animateAwaxColor(THEME.default.top, THEME.default.bot);
  if (p?.bow) gsap.to(p.bow.scale,{x:0.001,y:0.001,z:0.001,duration:0.3,ease:'back.in(1.5)',onComplete:()=>{ p.bow.visible=false; }});
  if (p?.mic) gsap.to(p.mic.scale,{x:0.001,y:0.001,z:0.001,duration:0.3,ease:'back.in(1.5)',onComplete:()=>{ p.mic.visible=false; }});
  alien.setExpression('neutral');
}

// Non-portal toggles — these own the boom (the portal owns its own).
function toSpeaker() { if (speakerMode || !alien) return; flashTransform(speakerLook); }
function toDefault() { if (!speakerMode || !alien) return; flashTransform(defaultLook); }

/* ===================================================================== *
 * PORTAL EFFECTS TOOLKIT
 * ===================================================================== */
const lensFlare = document.getElementById('lens-flare');

// Pre-created burst particles pool
const BURST_N = 24;
const burstPool = [];
for (let i = 0; i < BURST_N; i++) {
  const p = document.createElement('div');
  p.className = 'burst-particle';
  document.body.appendChild(p);
  burstPool.push(p);
}

function doRingPulse(hexColor) {
  const CX = window.innerWidth / 2, CY = window.innerHeight / 2;
  for (let i = 0; i < 3; i++) {
    const r = document.createElement('div');
    r.className = 'ring-pulse';
    r.style.borderColor = hexColor;
    document.body.appendChild(r);
    gsap.set(r, {xPercent:-50, yPercent:-50, x:CX, y:CY, scale:0.2, opacity:0.85});
    gsap.to(r, {scale:3.2, opacity:0, duration:1.0+i*0.11, delay:i*0.08, ease:organic, onComplete:()=>r.remove()});
  }
}

function doBurstParticles(hexColor) {
  const CX = window.innerWidth / 2, CY = window.innerHeight / 2;
  burstPool.forEach((p, i) => {
    const angle = (i / BURST_N) * Math.PI * 2 + Math.random() * 0.4;
    const dist  = 110 + Math.random() * 130;
    const size  = 2 + Math.random() * 5;
    gsap.killTweensOf(p);
    gsap.set(p, {x:CX, y:CY, width:size, height:size, backgroundColor:hexColor, borderRadius:'50%', opacity:0.85, scale:1, xPercent:-50, yPercent:-50, zIndex:45});
    gsap.to(p, {x:CX+Math.cos(angle)*dist, y:CY+Math.sin(angle)*dist, opacity:0, scale:0, duration:0.65+Math.random()*0.3, ease:'power2.out'});
  });
}

function doLensFlare() {
  if (!lensFlare) return;
  gsap.fromTo(lensFlare, {opacity:0}, {opacity:1, duration:0.06, yoyo:true, repeat:1, ease:'none', overwrite:true});
}

function quickFlash(hexColor, onPeak) {
  // Quick re-entry effect: rings + flash, no portal. Applies the look at the peak.
  doRingPulse(hexColor);
  doLensFlare();
  camShake = 0.03;
  flashTransform(onPeak);
}

/* ===================================================================== *
 * PORTAL — the full first-time transformation experience
 *
 * Architecture:
 *  1. portalRig overrides rigState in render loop → centers Aawaz
 *  2. Canvas clips to a circle (200px radius) via CSS clip-path
 *  3. Canvas z-index elevated above the dark backdrop
 *  4. Aawaz spins once → shockwave fires → color changes
 *  5. Circle expands to fill screen, backdrop fades → section reveals
 *  6. portalRig hands control back to rigState/scroll
 * ===================================================================== */
const portalBackdrop = document.getElementById('portal-backdrop');
const portalFrame    = document.getElementById('portal-frame');
const portalIcon     = portalFrame?.querySelector('.portal-icon');
const portalLabel    = portalFrame?.querySelector('.portal-label');
const portalRing     = portalFrame?.querySelector('.portal-ring');

let portalOpen   = false;
let portalActive = false;
let activePortalTl = null; // current portal timeline (force-completed if throttled)
const portalDone = { study: false, speak: false };

// How many world units the character occupies vertically, for circle sizing
function calcPortalRadiusPx(scale) {
  // Antenna top at world y ≈ 1.78 * scale, camera z=6, vertical FOV=42°
  const vFOVHalf = 21 * Math.PI / 180;
  const worldPerPx = (2 * Math.tan(vFOVHalf) * 6) / window.innerHeight;
  const topPx = (1.78 * scale) / worldPerPx;
  return Math.round(topPx + 32); // 32px breathing room
}

function openPortal(emoji, label, anchor, onTransform, onPortalClose) {
  if (portalOpen || reduced) { Object.assign(rigScreen, anchor); onTransform?.(); setTimeout(onPortalClose, 700); return; }
  portalOpen   = true;
  portalActive = true;

  gsap.set('.section .panel, .section .demo-col', {opacity:0, pointerEvents:'none'});

  if (portalIcon)  portalIcon.textContent  = emoji;
  if (portalLabel) portalLabel.textContent = label;

  const mob      = window.innerWidth < 860;
  const targetS  = mob ? 0.5 : 0.62;
  const targetY  = -0.15; // slight downward shift so antenna doesn't clip
  const circlePx = calcPortalRadiusPx(targetS);
  const accentHex = label.includes('Study') ? THEME.study.hex : THEME.speak.hex;

  // Capture current rig state, create override object
  portalRig = { x:rigState.x, y:rigState.y, z:rigState.z, s:rigState.s };

  const tl = gsap.timeline({
    onComplete() {
      activePortalTl = null;
      portalOpen   = false;
      portalActive = false;
      // Reset canvas to normal background (z=-1, no clip)
      canvas.removeAttribute('style');
      gsap.set([portalBackdrop, portalFrame], {opacity:0});
      // SETTLE TO THE SIDE: glide Aawax out of centre to the section anchor
      // (converted to world), keeping the damped `rigState` in lock-step so
      // there is no snap when control returns to the render loop.
      Object.assign(rigScreen, anchor);
      const m = window.innerWidth < 860;
      const w = screenToWorld(m ? 0.5 : anchor.fx, m ? Math.min(anchor.fy, 0.24) : anchor.fy, anchor.z);
      gsap.to(portalRig, {
        x:w.x, y:w.y, z:anchor.z, s:(m ? anchor.s * 0.82 : anchor.s),
        duration:0.95, ease:organic,
        onUpdate() { Object.assign(rigState, portalRig); },
        onComplete() { portalRig = null; },
      });
      onPortalClose?.();
    },
  });
  activePortalTl = tl;

  tl
    // ── Phase 1: Dark out, center Aawaz ──────────────────────────────
    .to(portalBackdrop, {opacity:1, duration:0.35, ease:'power2.out'}, 0)
    .to(portalRig, {x:0, y:targetY, z:0, s:targetS, duration:0.5, ease:'power3.out'}, 0)

    // ── Phase 2: Canvas clips to circle showing only Aawaz ───────────
    .call(() => {
      canvas.style.cssText = `position:fixed;inset:0;z-index:38;clip-path:circle(0px at 50% 50%);pointer-events:none;`;
    }, [], 0.1)
    .to(canvas, {clipPath:`circle(${circlePx}px at 50% 50%)`, duration:0.52, ease:'power3.out'}, 0.15)

    // ── Phase 3: Portal ring frames the canvas circle ─────────────────
    .to(portalFrame, {opacity:1, duration:0.28}, 0.32)
    .from(portalRing, {scale:0.3, duration:0.6, ease:'back.out(2.2)'}, 0.32)

    // ── Phase 4: Aawaz spins once — held inside the circle ───────────
    .call(() => {
      spinLock = true;
      gsap.to(lookGroup.rotation, {
        y: Math.PI * 2.1,
        duration: 0.9, ease: 'power2.inOut',
        onComplete() { lookGroup.rotation.y = 0; spinLock = false; },
      });
    }, [], 0.6)

    // ── Phase 5: Flash + shockwave + color change ─────────────────────
    .call(() => {
      flashTransform(onTransform); // boom + apply look at the peak — BOTH apps now boom
      doRingPulse(accentHex);
      doBurstParticles(accentHex);
      doLensFlare();
      colorFlood(label.includes('Study') ? 'study' : 'speak');
      camShake = 0.07;
    }, [], 1.42)

    // ── Phase 6: Label drops in below circle ──────────────────────────
    .from([portalIcon, portalLabel], {opacity:0, y:22, duration:0.42, stagger:0.09, ease:'power3.out'}, 1.65)

    // ── Hold ─────────────────────────────────────────────────────────
    .to({}, {duration:0.85})

    // ── Phase 7: Close — circle expands to fill screen ───────────────
    .to(portalFrame, {opacity:0, duration:0.26})
    .to(canvas, {clipPath:'circle(150% at 50% 50%)', duration:0.72, ease:'power3.inOut'}, '-=0.06')
    .to(portalBackdrop, {opacity:0, duration:0.5}, '-=0.45');
}

/* ===================================================================== *
 * CURSOR AURORA + SPARKLE TRAIL
 * ===================================================================== */
const cursorAurora = document.getElementById('cursor-aurora');
const cursorDot    = document.getElementById('cursor-dot');

if (cursorAurora && !reduced) {
  const quickX = gsap.quickTo(cursorAurora, 'x', {duration:0.7, ease:'power3'});
  const quickY = gsap.quickTo(cursorAurora, 'y', {duration:0.7, ease:'power3'});
  const dotX   = gsap.quickTo(cursorDot,    'x', {duration:0.15, ease:'none'});
  const dotY   = gsap.quickTo(cursorDot,    'y', {duration:0.15, ease:'none'});

  const sparks = [];
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('div'); s.className = 'cursor-spark';
    document.body.appendChild(s); sparks.push(s);
  }
  let lastSparkT = 0, sparkIdx = 0, sectionColor = '#b07cf0';

  window.addEventListener('mousemove', e => {
    quickX(e.clientX); quickY(e.clientY);
    dotX(e.clientX);   dotY(e.clientY);

    // Sparkle trail — calmer now (slower cadence, smaller, fainter).
    const now = performance.now();
    if (now - lastSparkT > 130) {
      lastSparkT = now;
      const s = sparks[sparkIdx++ % 12], sz = 3 + Math.random()*4;
      gsap.set(s, {x:e.clientX,y:e.clientY,width:sz,height:sz,backgroundColor:sectionColor,scale:1,opacity:0.5,borderRadius:'50%',xPercent:-50,yPercent:-50});
      gsap.to(s, {y:e.clientY-22-Math.random()*22, x:e.clientX+(Math.random()-0.5)*44, opacity:0, scale:0, duration:0.6+Math.random()*0.25, ease:'power2.out'});
    }

    // Aurora tint follows the chapter colour: hero/cta violet·pink, study GREEN, speaker PURPLE.
    const prog = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if      (prog<0.18) { sectionColor='#b07cf0'; cursorAurora.style.background='radial-gradient(circle,rgba(176,124,240,0.16)0%,rgba(239,154,196,0.06)40%,transparent 70%)'; }
    else if (prog<0.40) { sectionColor='#4ade80'; cursorAurora.style.background='radial-gradient(circle,rgba(74,222,128,0.14)0%,rgba(134,239,172,0.05)40%,transparent 70%)'; }
    else if (prog<0.60) { sectionColor='#a855f7'; cursorAurora.style.background='radial-gradient(circle,rgba(168,85,247,0.16)0%,rgba(192,132,252,0.06)40%,transparent 70%)'; }
    else if (prog<0.80) { sectionColor='#b07cf0'; cursorAurora.style.background='radial-gradient(circle,rgba(176,124,240,0.14)0%,rgba(192,132,252,0.05)40%,transparent 70%)'; }
    else                { sectionColor='#ef9ac4'; cursorAurora.style.background='radial-gradient(circle,rgba(239,154,196,0.16)0%,rgba(176,124,240,0.06)40%,transparent 70%)'; }
  });
}

/* ===================================================================== *
 * MAGNETIC BUTTONS
 * ===================================================================== */
if (!reduced) {
  document.querySelectorAll('.btn-primary,.btn-study,.btn-speak,.btn-ghost,.cta-card').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      gsap.to(btn, {x:(e.clientX-r.left-r.width/2)*0.38, y:(e.clientY-r.top-r.height/2)*0.38, duration:0.3, ease:'power2.out'});
    });
    btn.addEventListener('mouseleave', () => gsap.to(btn, {x:0, y:0, duration:0.7, ease:'elastic.out(1,0.35)'}));
  });
}

/* ===================================================================== *
 * 3D PANEL TILT
 * ===================================================================== */
if (!reduced && window.innerWidth > 860) {
  document.querySelectorAll('.showcase .panel, .cta-card').forEach(el => {
    const maxT = el.classList.contains('cta-card') ? 8 : 12;
    el.style.transformStyle = 'preserve-3d';
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      gsap.to(el, {rotateX:((e.clientY-r.top-r.height/2)/r.height)*-maxT, rotateY:((e.clientX-r.left-r.width/2)/r.width)*maxT, transformPerspective:900, duration:0.35, ease:'power2.out'});
    });
    el.addEventListener('mouseleave', () => gsap.to(el, {rotateX:0, rotateY:0, duration:0.9, ease:'elastic.out(1,0.3)'}));
  });
}

/* ===================================================================== *
 * CURTAIN BARS
 * ===================================================================== */
const curtainEl   = document.getElementById('curtain');
const curtainBars = curtainEl ? [...curtainEl.querySelectorAll('.c-bar')] : [];

function curtainIn(color='#b07cf0') {
  if (!curtainEl || reduced) return;
  curtainEl.style.setProperty('--cc', color);
  gsap.set(curtainBars, {yPercent:-105});
  gsap.to(curtainBars, {yPercent:0, duration:0.5, ease:'power4.inOut', stagger:{amount:0.1,from:'center'}});
}
function curtainOut() {
  if (!curtainEl || reduced) return;
  gsap.to(curtainBars, {yPercent:105, duration:0.45, ease:'power4.inOut', stagger:{amount:0.09,from:'edges'}, delay:0.05});
}

/* ===================================================================== *
 * SECTION SWEEP (lightweight, used for repeat-entry)
 * ===================================================================== */
const sweepEl = document.createElement('div');
sweepEl.className = 'section-sweep';
document.body.appendChild(sweepEl);

function triggerSweep(hex='#b07cf0') {
  if (reduced) return;
  sweepEl.style.background = `linear-gradient(110deg,transparent 0%,${hex}22 45%,${hex}18 60%,transparent 100%)`;
  gsap.fromTo(sweepEl, {xPercent:-105,opacity:1}, {xPercent:115,opacity:1,duration:1.1,ease:'power2.inOut', onComplete:()=>gsap.set(sweepEl,{opacity:0,xPercent:0})});
}

/* ── DRAMATIC COLOR FLOOD — a full-screen wash in the app's identity colour,
 *    fired on entering an app section so the switch reads clean-cut. ── */
const floodEl = document.createElement('div');
floodEl.className = 'color-flood';
document.body.appendChild(floodEl);
function colorFlood(themeKey) {
  if (reduced) return;
  const g = THEME[themeKey]?.glow; if (!g) return;
  floodEl.style.background = `radial-gradient(circle at 50% 48%, rgba(${g},0.5) 0%, rgba(${g},0.18) 38%, transparent 72%)`;
  gsap.killTweensOf(floodEl);
  gsap.fromTo(floodEl, {opacity:0, scale:0.55}, {opacity:1, scale:1.12, duration:0.42, ease:'power2.out'});
  gsap.to(floodEl, {opacity:0, duration:0.75, delay:0.34, ease:'power2.in'});
}

/* ===================================================================== *
 * SCROLLTRIGGER — bell-curve opacity + stagger reveals
 * ===================================================================== */
gsap.utils.toArray('.section').forEach(sec => {
  const panels = [...sec.querySelectorAll('.panel, .demo-col')];
  gsap.set(panels, {opacity:0, y:40});

  ScrollTrigger.create({
    trigger:sec, start:'top bottom', end:'bottom top',
    onUpdate(self) {
      if (portalActive) return;
      const o = Math.min(1, Math.sin(self.progress*Math.PI)*1.8);
      gsap.set(panels, {opacity:o, y:(1-o)*40, pointerEvents:o>0.15?'auto':'none'});
    },
  });

  if (!reduced && sec.id !== 'hero') { // hero gets its own kinetic intro below
    ScrollTrigger.create({
      trigger:sec, start:'top 64%', once:true,
      onEnter() {
        if (portalActive) return;
        const els = [
          ...sec.querySelectorAll('.eyebrow,.badge'), // h2 handled by the word-mask reveal
          ...sec.querySelectorAll('p.lead,p.body'),
          ...sec.querySelectorAll('.feature-list li'),
          ...sec.querySelectorAll('.btn,.cta-card'),
        ].filter(Boolean);
        gsap.from(els, {y:60,opacity:0,filter:'blur(8px)',duration:0.95,stagger:0.07,ease:'power3.out',clearProps:'transform,opacity,filter'});
      },
    });
  }
});

function revealSectionContent(secEl) {
  if (!secEl) return;
  const panels = [...secEl.querySelectorAll('.panel,.demo-col')];
  const els    = [...secEl.querySelectorAll('.eyebrow,.badge,p.lead,p.body,.feature-list li,.btn')].filter(Boolean);
  gsap.to(panels, {opacity:1, y:0, duration:0.75, ease:'power3.out', pointerEvents:'auto'});
  gsap.from(els, {y:55,opacity:0,filter:'blur(7px)',duration:0.9,stagger:0.065,ease:'power3.out',clearProps:'transform,opacity,filter',delay:0.2});
  gsap.delayedCall(0.8, () => showHint(secEl)); // offer the guided tour once content is in
}

document.querySelectorAll('[data-speech]').forEach(el => {
  let tm;
  ScrollTrigger.create({
    trigger:el.closest('.section'), start:'top 55%', end:'bottom 45%',
    onEnter()     { el.classList.add('show'); clearTimeout(tm); tm=setTimeout(()=>el.classList.remove('show'),5000); },
    onEnterBack() { el.classList.add('show'); clearTimeout(tm); tm=setTimeout(()=>el.classList.remove('show'),5000); },
    onLeave()     { el.classList.remove('show'); },
    onLeaveBack() { el.classList.remove('show'); },
  });
});

/* ===================================================================== *
 * CLIP-PATH ENTRANCE REVEALS
 * Add data-reveal="up" | "iris" | "right" to ANY element; the clip-path is
 * animated from hidden → full as it enters the viewport. Pure GPU
 * compositing (no layout), so it stays buttery under Lenis momentum.
 * Progressive enhancement: if JS never runs, nothing is ever clipped.
 * ===================================================================== */
const CLIP = {
  up:    { from:'inset(100% 0% 0% 0% round 20px)', to:'inset(0% 0% 0% 0% round 20px)' },
  iris:  { from:'circle(0% at 50% 58%)',           to:'circle(140% at 50% 58%)' },
  right: { from:'inset(0% 100% 0% 0% round 20px)', to:'inset(0% 0% 0% 0% round 20px)' },
};
document.querySelectorAll('[data-reveal]').forEach((el) => {
  if (reduced) return;
  const cfg = CLIP[el.dataset.reveal] || CLIP.up;
  // Already on screen at load? Just show it — never leave content clipped away.
  if (el.getBoundingClientRect().top < window.innerHeight * 0.85) {
    gsap.set(el, { clipPath: cfg.to });
    return;
  }
  gsap.set(el, { clipPath: cfg.from });
  ScrollTrigger.create({
    trigger: el, start: 'top 82%', once: true,
    onEnter: () => gsap.to(el, { clipPath: cfg.to, duration: 1.15, ease: organic }),
  });
});

/* ===================================================================== *
 * SCRUB DEMO — a subtle camera dolly driven frame-for-frame by Lenis.
 * `scrub:1` ties it to the smoothed scroll position; the organic ease keeps
 * the acceleration from feeling mechanical. (Aawax's big moves now live in
 * the per-section anchors below, which is what makes the settle reliable.)
 * ===================================================================== */
const camZ = {v:6};
gsap.timeline({scrollTrigger:{trigger:'#scroll',start:'top top',end:'bottom bottom',scrub:1}})
  .to(camZ, {v:6.3, ease:organic})
  .to(camZ, {v:6.0, ease:organic});

// ── Central section controller: one helper sets the rig anchor + look bias ──
const studyEl = document.getElementById('studybuddy');
const speakEl = document.getElementById('speaker-coach');
function settle(anchor, bias = 0) { Object.assign(rigScreen, anchor); faceBiasTarget = bias; }

// Hero video lives only in the hero. Fade it DETERMINISTICALLY on section
// change (the old scrub fade mis-positioned once the page grew to 5 sections,
// leaving the video covering Aawax in every section).
const heroVideoEl = document.getElementById('hero-video');
function fadeHeroVideo(to) {
  if (heroVideoEl) gsap.to(heroVideoEl, { opacity: to, duration: to ? 0.6 : 0.9, ease: 'power2.inOut', overwrite: true });
}

ScrollTrigger.create({
  trigger:'#hero', start:'top 60%', end:'bottom 40%',
  onEnter:     () => { if (touring) return; settle(RIG.hero, 0); hideHint(); fadeHeroVideo(1); },
  onEnterBack: () => { if (touring) return; settle(RIG.hero, 0); hideHint(); fadeHeroVideo(1); },
});

ScrollTrigger.create({
  trigger:'#studybuddy', start:'top 60%', end:'bottom 40%',
  onEnter: () => {
    if (touring) return;
    isSpeaking = true; settle(RIG.study, 0.42); fadeHeroVideo(0); // tuck into the empty LEFT
    // Mobile: skip the cinematic portal entirely — just turn Aawax green +
    // studious and let the bell-curve fade reveal the content cleanly.
    if (isMobile()) { studyLook(); return; }
    if (!portalDone.study) {
      portalDone.study = true;
      openPortal('📚','StudyBuddy', RIG.study, studyLook, () => revealSectionContent(studyEl));
    } else {
      quickFlash(THEME.study.hex, studyLook);
      colorFlood('study');
      gsap.delayedCall(1.0, () => showHint(studyEl));
    }
  },
  onEnterBack: () => { if (touring) return; settle(RIG.study, 0.42); fadeHeroVideo(0); isSpeaking=true; studyLook(); if (isMobile()) return; quickFlash(THEME.study.hex, studyLook); colorFlood('study'); gsap.delayedCall(1.0, () => showHint(studyEl)); },
  onLeave:     () => { if (touring) return; setGlasses(false); isSpeaking=false; hideHint(); },
  onLeaveBack: () => { if (touring) return; setGlasses(false); isSpeaking=false; hideHint(); },
});

ScrollTrigger.create({
  trigger:'#speaker-coach', start:'top 60%', end:'bottom 40%',
  onEnter: () => {
    if (touring) return;
    isSpeaking = true; settle(RIG.speak, -0.42); // tuck into the empty RIGHT, look toward the app
    if (isMobile()) { speakerLook(); return; } // mobile: clean, no cinematic portal
    if (!portalDone.speak) {
      portalDone.speak = true;
      openPortal('🎤','Speaker Coach', RIG.speak, speakerLook, () => revealSectionContent(speakEl));
    } else {
      quickFlash(THEME.speak.hex, speakerLook);
      colorFlood('speak');
      gsap.delayedCall(1.0, () => showHint(speakEl));
    }
  },
  onEnterBack: () => { if (touring) return; settle(RIG.speak, -0.42); isSpeaking=true; speakerLook(); if (isMobile()) return; quickFlash(THEME.speak.hex, speakerLook); colorFlood('speak'); gsap.delayedCall(1.0, () => showHint(speakEl)); },
  onLeave:     () => { if (touring) return; toDefault(); isSpeaking=false; hideHint(); },
  onLeaveBack: () => { if (touring) return; toDefault(); isSpeaking=false; hideHint(); },
});

ScrollTrigger.create({
  trigger:'#how', start:'top 60%', end:'bottom 40%',
  onEnter:     () => { if (touring) return; settle(RIG.how, 0); toDefault(); isSpeaking=false; hideHint(); alien?.setExpression('neutral'); },
  onEnterBack: () => { if (touring) return; settle(RIG.how, 0); toDefault(); isSpeaking=false; hideHint(); },
});

ScrollTrigger.create({
  trigger:'#cta', start:'top 60%',
  onEnter:     () => { if (touring) return; settle(RIG.cta, 0); alien?.setExpression('joyful'); isSpeaking=false; hideHint(); triggerSweep(THEME.default.hex); },
  onLeaveBack: () => { if (touring) return; alien?.setExpression('neutral'); },
});

/* ===================================================================== *
 * UI ORCHESTRATION — progress rail · chapter nav · nav state · kinetic
 * hero. Every scroll read comes from Lenis, so the whole chrome moves on
 * one momentum clock.
 * ===================================================================== */
const totalScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

// 1) Top progress hairline + condensed nav-on-scroll
const progressFill = document.querySelector('#scroll-progress span');
const navEl = document.querySelector('.nav');
const setProgress = progressFill ? gsap.quickSetter(progressFill, 'scaleX') : null;
function onScrollUI() {
  if (setProgress) setProgress(window.scrollY / totalScroll());
  if (navEl) navEl.classList.toggle('scrolled', window.scrollY > 40);
}
if (lenis) lenis.on('scroll', onScrollUI);
else window.addEventListener('scroll', onScrollUI, { passive: true });
onScrollUI();

// 2) Chapter rail — active state + Lenis-smooth jump links
const chapLinks = [...document.querySelectorAll('#chapters .chap')];
const chapIds = ['hero', 'studybuddy', 'speaker-coach', 'how', 'cta'];
const setChapter = (i) => chapLinks.forEach((a, k) => a.classList.toggle('is-active', k === i));
chapIds.forEach((id, i) => {
  ScrollTrigger.create({
    trigger: '#' + id, start: 'top 55%', end: 'bottom 45%',
    onEnter: () => setChapter(i), onEnterBack: () => setChapter(i),
  });
});

// 3) Any in-page anchor scrolls through Lenis (rail + nav)
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.2 });
    else target.scrollIntoView({ behavior: 'smooth' });
  });
});

// 3b) SECTION SNAP (soft) — once a USER scroll settles, if you're NEAR a section
//     it glides you onto it, so the deliberate transitions/perks land one at a
//     time instead of being flung past. Proximity-based so it never traps you in
//     a tall section (bento). Only user wheel/touch arms it, so it never fights
//     programmatic scrolls (chapter rail, tour, anchors). Off during tour/portal.
if (!reduced) {
  const snapEls = chapIds.map((id) => document.getElementById(id)).filter(Boolean);
  let snapTO = null, userScroll = false;
  const arm = () => { userScroll = true; };
  window.addEventListener('wheel', arm, { passive: true });
  window.addEventListener('touchmove', arm, { passive: true });
  const doSnap = () => {
    if (!userScroll || touring || portalActive) return;
    userScroll = false;
    const y = window.scrollY;
    let best = null, bd = Infinity;
    for (const s of snapEls) { const d = Math.abs(s.offsetTop - y); if (d < bd) { bd = d; best = s; } }
    if (best && bd > 14 && bd < window.innerHeight * 0.42) {
      if (lenis) lenis.scrollTo(best, { duration: 0.7 });
      else best.scrollIntoView({ behavior: 'smooth' });
    }
  };
  window.addEventListener('scroll', () => { clearTimeout(snapTO); snapTO = setTimeout(doSnap, 150); }, { passive: true });
}

// 4) Kinetic typography — split a heading into per-word line-masks (21.dev
//    "vertical cut reveal", adapted to vanilla GSAP). Returns the inner spans.
function splitWords(el) {
  el.classList.add('kinetic');
  const frag = document.createDocumentFragment();
  const maskWord = (child) => {
    const w = document.createElement('span'); w.className = 'word';
    const inner = document.createElement('span'); inner.appendChild(child);
    w.appendChild(inner); return w;
  };
  [...el.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent.split(/(\s+)/).forEach((tok) => {
        if (/^\s+$/.test(tok)) frag.appendChild(document.createTextNode(' '));
        else if (tok) frag.appendChild(maskWord(document.createTextNode(tok)));
      });
    } else if (node.nodeName === 'BR') {
      frag.appendChild(document.createElement('br'));
    } else {
      frag.appendChild(maskWord(node.cloneNode(true))); // e.g. .gradient-text
    }
  });
  el.innerHTML = '';
  el.appendChild(frag);
  return el.querySelectorAll('.word > span');
}

// Kinetic hero intro (plays on load)
const heroH1 = document.querySelector('.s-hero h1');
if (heroH1 && !reduced) {
  const words = splitWords(heroH1);
  const intro = gsap.timeline({ delay: 0.35 });
  gsap.set(words, { yPercent: 115 });
  intro
    .to(words, { yPercent: 0, duration: 1.05, ease: organic, stagger: 0.085 })
    .from('.s-hero .eyebrow', { y: 18, opacity: 0, duration: 0.8, ease: organic }, 0.1)
    .from('.s-hero .lead',    { y: 24, opacity: 0, duration: 0.9, ease: organic }, 0.45)
    .from('.s-hero .actions .btn', { y: 20, opacity: 0, duration: 0.8, ease: organic, stagger: 0.12 }, 0.65);
  // (scroll hint is NOT animated — it stays visible via CSS so a throttled
  //  intro can never leave it hidden.)
}

// SELF-HEAL: embedded browsers / background tabs throttle rAF + GSAP, which can
// freeze an intro or a portal mid-way. Whenever the page becomes visible again,
// snap the hero to its final state and re-sync ScrollTrigger.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // A portal frozen mid-way by throttling would leave Aawax centered — finish it.
  if (portalActive && activePortalTl) activePortalTl.progress(1);
  ScrollTrigger.refresh();
  gsap.set('.s-hero h1 .word > span, .s-hero .eyebrow, .s-hero .lead, .s-hero .actions .btn',
    { clearProps: 'opacity,transform' });
});

// Dramatic per-word cut reveal on every section heading (stagger from centre)
if (!reduced) {
  document.querySelectorAll('.s-study h2, .s-speak h2, .s-how h2, .s-cta h2').forEach((h) => {
    const words = splitWords(h);
    gsap.set(words, { yPercent: 120 });
    ScrollTrigger.create({
      trigger: h.closest('.section'), start: 'top 72%', once: true,
      onEnter: () => gsap.to(words, { yPercent: 0, duration: 0.95, ease: organic, stagger: { each: 0.06, from: 'center' } }),
    });
  });
}

/* ===================================================================== *
 * AAWAX GUIDED TOUR — once settled beside an app, Aawax can walk you down
 * its UI one component at a time, explaining each in a speech bubble. It
 * stays in the visible margin (never behind the UI), follows the active
 * component as the page scrolls, and returns to the empty side when done.
 * (DOM refs + state are declared earlier, near the rig anchors, to dodge a TDZ.)
 * ===================================================================== */
function showHint(el) {
  if (!hintEl || touring || portalActive || !tourEligible(el)) return;
  // Only offer the tour while that section is substantially on screen — never
  // over the hero video, never for a section you've scrolled away from.
  const r = el.getBoundingClientRect();
  if (r.bottom < window.innerHeight * 0.3 || r.top > window.innerHeight * 0.7) return;
  tourSection = el;
  hintEl.classList.add('show');
}
function hideHint() { hintEl?.classList.remove('show'); }

function startTour() {
  if (!tourSection || touring || !tourEligible(tourSection)) return;
  tourSteps = [...tourSection.querySelectorAll('[data-tour]')];
  if (!tourSteps.length) return;
  touring = true; tourIdx = -1;
  hideHint();
  tourSection.classList.add('touring');
  tourFx = tourSection.classList.contains('s-speak') ? 0.70 : 0.30; // step in toward the UI
  faceBiasTarget = tourFx < 0.5 ? 0.5 : -0.5;
  bubbleEl.classList.add('show');
  advanceTour(1);
}
function advanceTour() {
  if (!touring) return;
  tourSteps.forEach((el) => el.classList.remove('tour-active'));
  tourIdx += 1;
  if (tourIdx >= tourSteps.length) { endTour(); return; }
  const el = tourSteps[tourIdx];
  el.classList.add('tour-active');
  if (lenis) lenis.scrollTo(el, { offset: -window.innerHeight * 0.45, duration: 0.9 });
  else el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (bubbleText) bubbleText.textContent = el.dataset.tour;
  if (bubbleNext) bubbleNext.textContent = tourIdx === tourSteps.length - 1 ? "That's the tour ✨" : 'Next →';
}
function endTour() {
  tourSteps.forEach((el) => el.classList.remove('tour-active'));
  bubbleEl?.classList.remove('show');
  tourSection?.classList.remove('touring');
  touring = false; tourFx = null; tourFy = null; tourIdx = -1;
  if (tourSection) {
    faceBiasTarget = tourSection.classList.contains('s-speak') ? -0.42 : 0.42;
    gsap.delayedCall(0.45, () => showHint(tourSection));
  }
}
hintEl?.addEventListener('click', startTour);
bubbleNext?.addEventListener('click', advanceTour);

// Keep the hint + bubble pinned to Aawax's on-screen position (called each frame).
function positionTourDom() {
  if (!hintEl) return;
  const showBubble = bubbleEl.classList.contains('show');
  const showHintNow = hintEl.classList.contains('show');
  if (!showBubble && !showHintNow) return;
  const W = window.innerWidth, H = window.innerHeight, mob = W < 860;
  // On mobile Aawax sits centred up top, so anchor the chrome there.
  const fx = mob ? 0.5 : (tourFx != null ? tourFx : rigScreen.fx);
  const fy = mob ? 0.2 : (tourFy != null ? tourFy : rigScreen.fy);
  const px = fx * W, py = fy * H, leftSide = fx < 0.5;
  if (showBubble) {
    if (mob) {
      bubbleEl.classList.remove('right'); bubbleEl.classList.add('below');
      bubbleEl.style.left = '50%'; bubbleEl.style.right = 'auto'; bubbleEl.style.top = `${py + 130}px`;
    } else {
      bubbleEl.classList.remove('below');
      bubbleEl.style.top = `${py}px`;
      bubbleEl.classList.toggle('right', !leftSide);
      if (leftSide) { bubbleEl.style.left = `${px + 78}px`; bubbleEl.style.right = 'auto'; }
      else { bubbleEl.style.right = `${W - px + 78}px`; bubbleEl.style.left = 'auto'; }
    }
  }
  if (showHintNow) {
    if (mob) { hintEl.style.left = '50%'; hintEl.style.top = `${py + 130}px`; }
    else { hintEl.style.left = `${px}px`; hintEl.style.top = `${py + 118}px`; }
  }
}

/* ===================================================================== *
 * VIDEO + MUSIC
 * ===================================================================== */
const heroVideo = document.getElementById('hero-video');
const bgMusic   = document.getElementById('bg-music');
const musicBtn  = document.getElementById('music-toggle');

if (heroVideo) {
  heroVideo.addEventListener('loadedmetadata', () => { heroVideo.currentTime = 1; });
  heroVideo.addEventListener('timeupdate', () => {
    if (heroVideo.duration && heroVideo.currentTime >= heroVideo.duration - 0.15) {
      heroVideo.currentTime = 1; heroVideo.play().catch(()=>{});
    }
  });
  // Fade handled deterministically by fadeHeroVideo() in the section triggers.
}
if (bgMusic && musicBtn) {
  bgMusic.volume = 0.32;
  musicBtn.addEventListener('click', () => {
    if (bgMusic.paused) { bgMusic.play().catch(()=>{}); musicBtn.classList.add('playing'); }
    else                { bgMusic.pause(); musicBtn.classList.remove('playing'); }
  });
}

/* ===================================================================== *
 * MOUSE-LOOK
 * ===================================================================== */
const pointer = {x:0, y:0};
window.addEventListener('pointermove', e => {
  pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
});
const wave = document.querySelector('[data-wave]');
if (wave) for (let i=0; i<28; i++) {
  const s = document.createElement('span');
  s.style.animationDelay = `${(i%14)*0.06}s`; s.style.height = '70px';
  wave.appendChild(s);
}

/* ===================================================================== *
 * RENDER LOOP
 * ===================================================================== */
const clock       = new THREE.Clock();
const purpleColor = new THREE.Color('#b07cf0');
let look = {x:0, y:0};

// Scroll-velocity "weight": subtle skew on showcase blocks + a body lean.
const showcases = [...document.querySelectorAll('.showcase')];
let skewV = 0;

// Mascot life — blink scheduler, eye saccades, brow, idle breathing.
let blinkTimer = 1.2, blinking = false, blinkT = 0, doubleBlk = false;
let saccadeTimer = 0.8;
const saccadeTgt = { x: 0, y: 0 }, eyeOff = { x: 0, y: 0 };
let browTimer = 3.0, brow = 0, browTgt = 0;

function render() {
  const dt  = Math.min(clock.getDelta(), 0.05);
  const t   = clock.elapsedTime;
  const mob = window.innerWidth < 860;
  const bob = reduced ? 0 : Math.sin(t * 1.1) * 0.06;
  scrollVel = damp(scrollVel, 0, 5, dt); // velocity decays to rest between scroll ticks

  // Guided tour: Aawax follows the active component's vertical centre.
  if (touring && tourSteps[tourIdx]) {
    const r = tourSteps[tourIdx].getBoundingClientRect();
    tourFy = gsap.utils.clamp(0.2, 0.82, (r.top + r.height / 2) / window.innerHeight);
  }

  // Rig placement — portalRig (portal) overrides the damped settle.
  if (portalRig !== null) {
    rig.position.set(portalRig.x, portalRig.y + bob, portalRig.z);
    rig.scale.setScalar(portalRig.s);
  } else {
    // ORGANIC SETTLE: convert the screen anchor → world, ease the rig toward it.
    // On mobile Aawax is centred and uses the anchor's `mfy`/`ms` so it sits
    // BEHIND the stacked cards as an ambient background (no room beside them).
    const fx = mob ? 0.5 : (tourFx != null ? tourFx : rigScreen.fx);
    let fy = tourFy != null ? tourFy : rigScreen.fy;
    if (mob) fy = rigScreen.mfy != null ? rigScreen.mfy : Math.min(fy, 0.24);
    const tgt = screenToWorld(fx, fy, rigScreen.z);
    rigState.x = damp(rigState.x, tgt.x, 3.4, dt);
    rigState.y = damp(rigState.y, tgt.y, 3.4, dt);
    rigState.z = damp(rigState.z, rigScreen.z, 3.4, dt);
    const sTgt = mob ? (rigScreen.ms != null ? rigScreen.ms : rigScreen.s * 0.82) : rigScreen.s;
    rigState.s = damp(rigState.s, sTgt, 3.4, dt);
    rig.position.set(rigState.x, rigState.y + bob, rigState.z);
    rig.scale.setScalar(rigState.s);
  }

  // Mouse-look (disabled during spin) + a damped bias so Aawax faces its app,
  // plus a slow idle head-sway so it never sits perfectly still.
  if (!spinLock) {
    faceBias = damp(faceBias, mob ? 0 : faceBiasTarget, 3, dt);
    look.x = damp(look.x, reduced ? 0 : pointer.x * 0.5, 5, dt);
    look.y = damp(look.y, reduced ? 0 : pointer.y * 0.28, 5, dt);
    lookGroup.rotation.y = look.x + faceBias + (reduced ? 0 : Math.sin(t * 0.45) * 0.05);
    lookGroup.rotation.x = -look.y + (reduced ? 0 : Math.sin(t * 0.7) * 0.02);
    lookGroup.rotation.z = reduced ? 0 : damp(lookGroup.rotation.z, Math.sin(t * 0.5) * 0.05, 2, dt);
  }

  // Scroll-velocity weight: skew the showcase blocks + lean Aawax into the scroll.
  if (!reduced) {
    const target = mob ? 0 : gsap.utils.clamp(-0.7, 0.7, scrollVel * 0.05);
    skewV = damp(skewV, target, 12, dt);
    for (const s of showcases) s.style.transform = `skewY(${skewV.toFixed(3)}deg)`;
    rig.rotation.z = damp(rig.rotation.z, gsap.utils.clamp(-0.04, 0.04, -scrollVel * 0.0006), 6, dt);
  }

  // Camera shake (decays exponentially)
  if (camShake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * camShake;
    camera.position.y += (Math.random() - 0.5) * camShake;
    camShake *= 0.72;
  }

  if (alien && !reduced) {
    const p = alien.procedural?.parts;

    // Blink — randomised cadence with the occasional quick double-blink.
    blinkTimer -= dt;
    if (!blinking && blinkTimer <= 0) { blinking = true; blinkT = 0; doubleBlk = Math.random() < 0.32; blinkTimer = 2.4 + Math.random()*3.2; }
    if (blinking) {
      blinkT += dt; const D = 0.12;
      alien.setMorph('blink', blinkT < D ? Math.sin((blinkT/D)*Math.PI) : 0);
      if (blinkT >= D) { if (doubleBlk) { doubleBlk = false; blinkT = -0.06; } else blinking = false; }
    }

    // Eye saccades — pupils dart to a wandering target, blended with the cursor.
    saccadeTimer -= dt;
    if (saccadeTimer <= 0) { saccadeTimer = 0.5 + Math.random()*1.9; saccadeTgt.x = (Math.random()-0.5)*0.07; saccadeTgt.y = (Math.random()-0.5)*0.05; }
    eyeOff.x = damp(eyeOff.x, saccadeTgt.x + pointer.x*0.03, 9, dt);
    eyeOff.y = damp(eyeOff.y, saccadeTgt.y + pointer.y*0.02, 9, dt);
    const eb = p?.eyeBase;
    if (eb && p.eyeL && p.eyeR) {
      p.eyeL.position.x = eb.eyeL.x + eyeOff.x; p.eyeL.position.y = eb.eyeL.y + eyeOff.y;
      p.eyeR.position.x = eb.eyeR.x + eyeOff.x; p.eyeR.position.y = eb.eyeR.y + eyeOff.y;
    }

    // Brow — an occasional curious raise (squash/stretch the eyes a touch).
    browTimer -= dt;
    if (browTimer <= 0) { browTimer = 2.5 + Math.random()*4; browTgt = Math.random() < 0.5 ? 0.18 : 0; }
    brow = damp(brow, browTgt, 6, dt);
    if (p?.eyeL && p?.eyeR && !blinking) { const sy = 1 + brow; p.eyeL.scale.y = sy; p.eyeR.scale.y = sy; }

    // Mouth
    if (isSpeaking) {
      speakPhase += dt * 5.2;
      const spk = Math.max(0, Math.sin(speakPhase)*0.55 + Math.sin(speakPhase*1.9)*0.18 + Math.sin(speakPhase*0.4)*0.12);
      alien.setMorph('mouthOpen', Math.min(1, spk));
    } else {
      alien.setMorph('mouthOpen', Math.max(0, Math.sin(t*1.6)*0.22));
    }

    // Idle breathing — gentle body swell.
    const breathe = 1 + Math.sin(t*1.5)*0.018;
    if (p?.body) p.body.scale.set(1.06*breathe, 1.0*breathe, 1.0);

    if (p) {
      if (isSpeaking) {
        if (p.armL) { p.armL.rotation.x=damp(p.armL.rotation.x,Math.sin(t*2.6)*0.28,5,dt); p.armL.position.y=damp(p.armL.position.y,-0.18+Math.sin(t*2.0)*0.09,5,dt); }
        if (p.armR) { p.armR.rotation.x=damp(p.armR.rotation.x,Math.sin(t*2.6+1.3)*0.28,5,dt); p.armR.position.y=damp(p.armR.position.y,-0.18+Math.sin(t*2.0+0.9)*0.09,5,dt); }
        lookGroup.position.y = damp(lookGroup.position.y, Math.sin(t*2.3)*0.042, 5, dt);
      } else {
        if (p.armL) { p.armL.rotation.x=damp(p.armL.rotation.x,0,3,dt); p.armL.position.y=damp(p.armL.position.y,-0.18,3,dt); }
        if (p.armR) { p.armR.rotation.x=damp(p.armR.rotation.x,0,3,dt); p.armR.position.y=damp(p.armR.position.y,-0.18,3,dt); }
        lookGroup.position.y = damp(lookGroup.position.y, 0, 3, dt);
      }

      if (p.mic?.visible && !micIntro) {
        const b = p.mic.userData.base;
        if (b) {
          p.mic.position.y = b.y + Math.sin(t*2.4)*0.12;
          p.mic.position.x = b.x + Math.sin(t*1.5)*0.04;
          p.mic.rotation.z = b.rz + Math.sin(t*1.8)*0.07;
        }
      }
      if (p.antennaBall) p.antennaBall.position.y = 1.78 + Math.sin(t*2.9)*0.045;
    }
  }

  if (alien) alien.update(dt);
  flashLight.position.copy(rig.position);

  // Planet stays neutral purple — no per-section colour bleeding
  planet.update(dt, purpleColor, 0.0);
  planet.group.position.y = -7.9 - (window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) * 3.0;

  stars.rotation.y += dt * 0.005;

  // Smooth camera drift
  camera.position.x = damp(camera.position.x, pointer.x * 0.18, 2, dt);
  camera.position.y = damp(camera.position.y, pointer.y * 0.12, 2, dt);
  camera.position.z = damp(camera.position.z, camZ.v, 2, dt);
  camera.lookAt(0, 0, 0);

  positionTourDom(); // keep the hint/bubble pinned to Aawax on screen

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

/* ===================================================================== *
 * RESIZE
 * ===================================================================== */
// On phones the browser chrome (URL bar) hiding/showing fires `resize` with a
// new HEIGHT constantly while scrolling. Reflowing + ScrollTrigger.refresh on
// each of those is what makes mobile scroll "glitch". So: always keep the
// canvas sized, but only refresh layout when the WIDTH actually changes.
let lastW = window.innerWidth;
let resizeTO = null;
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(targetDPR());
  if (window.innerWidth !== lastW) {
    lastW = window.innerWidth;
    clearTimeout(resizeTO);
    resizeTO = setTimeout(() => ScrollTrigger.refresh(), 150);
  }
});
