import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMascot } from '../mascot.js';

/*
 * CharacterManager
 *  - loadCharacter(url): loads an external .glb via GLTFLoader. Finds the mesh
 *    that carries morph targets and exposes setMorph(name, value) so you can
 *    drive blinks / mouth / morph animations from code via morphTargetInfluences.
 *  - If the .glb is missing it falls back to the procedural Aawax so the page
 *    never breaks. Same API either way.
 *  - attachGlasses(mesh): finds the head bone/node and parents the glasses to it.
 */

export class Character {
  constructor({ root, morphMesh = null, mixer = null, animations = [], kind = 'alien', procedural = null }) {
    this.root = root;
    this.morphMesh = morphMesh;
    this.dict = (morphMesh && morphMesh.morphTargetDictionary) || {};
    this.mixer = mixer;
    this.animations = animations;
    this.kind = kind;
    this.procedural = procedural; // { group, parts } when falling back
    this._mats = null;
  }

  /* Drive a morph target by name (works on real GLB morph targets, and is
     emulated on the procedural fallback so the same calls always do something) */
  setMorph(name, value) {
    if (this.morphMesh && this.dict[name] !== undefined) {
      this.morphMesh.morphTargetInfluences[this.dict[name]] = value;
      return;
    }
    if (!this.procedural) return;
    const p = this.procedural.parts;
    switch (name) {
      case 'blink': { const s = 1 - value * 0.9; p.eyeL.scale.y = s; p.eyeR.scale.y = s; break; }
      case 'mouthOpen': p.mouth.scale.y = 1 + value * 0.8; break;
      case 'smile': p.mouth.scale.x = 1 + value * 0.3; break;
      default: break;
    }
  }

  /* Place an expression by combining a few morphs. */
  setExpression(name) {
    const presets = {
      neutral: { smile: 0.4, mouthOpen: 0 },
      bored: { smile: 0, mouthOpen: 0.05 },
      sly: { smile: 0.6, mouthOpen: 0 },
      joyful: { smile: 1, mouthOpen: 0.5 },
      studious: { smile: 0.5, mouthOpen: 0 },
      curious: { smile: 0.55, mouthOpen: 0.18 },
    };
    const e = presets[name] || presets.neutral;
    for (const k in e) this.setMorph(k, e[k]);
  }

  /* Placeholder per the spec: attach 3D glasses to the character's head node.
     On a real GLB it finds the head bone/node and parents the mesh to it.
     The procedural fallback already models glasses, so we reference those. */
  attachGlasses(glassesMesh) {
    if (this.procedural) {
      this.glasses = this.procedural.parts.glasses; // use the modelled pair
    } else {
      let head = null;
      this.root.traverse((o) => { if (!head && /head|skull|face/i.test(o.name)) head = o; });
      (head || this.root).add(glassesMesh);
      this.glasses = glassesMesh;
    }
    this.glasses.visible = false;
    this.glasses.scale.setScalar(0.001);
    return this.glasses;
  }

  setGlasses(on) {
    if (!this.glasses) return;
    if (on) this.glasses.visible = true;
    this.glasses.scale.setScalar(on ? 1 : 0.001);
    this.setExpression(on ? 'bored' : 'neutral');
  }

  /* Fade in/out for the swap ("shader dissolve" — opacity based, works on any model). */
  setOpacity(v) {
    if (!this._mats) {
      this._mats = [];
      this.root.traverse((o) => { if (o.material) this._mats.push(o.material); });
    }
    for (const m of this._mats) { m.transparent = true; m.opacity = v; m.depthWrite = v > 0.5; }
  }

  update(dt) {
    if (this.mixer) this.mixer.update(dt);
  }
}

/* Build a glasses mesh you can hand to character.attachGlasses(). */
export function createGlasses() {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: '#15121c', roughness: 0.35, metalness: 0.3 });
  const lens = new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.1, transmission: 0.6, transparent: true, opacity: 0.4 });
  for (const sx of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 16, 40), frame);
    rim.position.set(0.3 * sx, 0.13, 0.96);
    g.add(rim);
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), lens);
    l.position.set(0.3 * sx, 0.13, 0.95);
    g.add(l);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), frame);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.13, 1.0);
  g.add(bridge);
  return g;
}

/* Procedural fallback character (the original Aawax). kind tweaks the look. */
function buildProceduralCharacter(kind) {
  const m = createMascot();
  const char = new Character({ root: m.group, kind, procedural: m });
  if (kind === 'snake') {
    const p = m.parts;
    p.snake.visible = true;
    p.snake.scale.setScalar(1);
    p.tongue.visible = true;
    p.tongue.scale.setScalar(1);
    p.body.scale.set(p.body.scale.x * 0.8, p.body.scale.y * 1.35, p.body.scale.z * 0.9);
    for (const k of ['armL', 'armR', 'footL', 'footR']) p[k].scale.multiplyScalar(0.18);
    char._snakeSeg = p.snakeSeg;
  }
  return char;
}

/* Load an external .glb; fall back to procedural on any error. */
export function loadCharacter({ url, kind, manager }) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader(manager);
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        let morphMesh = null;
        root.traverse((o) => {
          if (o.isMesh && o.morphTargetInfluences && o.morphTargetInfluences.length) morphMesh = o;
          if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
        });
        const mixer = gltf.animations.length ? new THREE.AnimationMixer(root) : null;
        console.info(`[Aawax] loaded ${url} (morphs: ${morphMesh ? Object.keys(morphMesh.morphTargetDictionary).join(', ') : 'none'})`);
        resolve(new Character({ root, morphMesh, mixer, animations: gltf.animations, kind }));
      },
      undefined,
      () => {
        console.warn(`[Aawax] ${url} not found — using procedural ${kind} fallback.`);
        resolve(buildProceduralCharacter(kind));
      }
    );
  });
}
