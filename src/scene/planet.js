import * as THREE from 'three';

/*
 * Realistic planet.
 *  - Surface: MeshStandardMaterial (real PBR lighting) with `map` and
 *    `normalMap` PLACEHOLDERS. Until you drop in textures it renders a
 *    procedural FBM terrain (injected via onBeforeCompile); the moment you
 *    call setTextures(map, normalMap) it uses your high-res maps instead.
 *  - Atmosphere: a custom Fresnel ShaderMaterial shell (back-side, additive).
 */

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float f=0.0,a=0.5; for(int i=0;i<4;i++){ f+=a*snoise(p); p*=2.03; a*=0.5; } return f; }
float terr(vec3 d){ return fbm(d*2.4)*0.6; }
`;

export function createPlanet() {
  const group = new THREE.Group();

  // shared uniforms we update each frame (tint = section colour grade)
  const uniforms = {
    uTint: { value: new THREE.Color('#b07cf0') },
    uTintAmt: { value: 0.0 },
  };

  // ---- surface ----------------------------------------------------------
  const surfMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.0,
    map: null, // ← drop your high-res colour map here (setTextures)
    normalMap: null, // ← drop your high-res normal map here
  });
  // Procedural fallback (only injected while there is no colour map).
  surfMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = uniforms.uTint;
    shader.uniforms.uTintAmt = uniforms.uTintAmt;
    const proceduralColor = !surfMat.map;
    const proceduralBump = !surfMat.normalMap;

    shader.vertexShader =
      'varying vec3 vDir;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDir = normalize(position);');

    let frag = 'uniform vec3 uTint;\nuniform float uTintAmt;\nvarying vec3 vDir;\n' + NOISE + shader.fragmentShader;

    if (proceduralColor) {
      frag = frag.replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec3 d = normalize(vDir);
          float h = terr(d);
          vec3 cOcean=vec3(0.07,0.04,0.20), cShore=vec3(0.26,0.11,0.42), cLand=vec3(0.46,0.18,0.58), cHigh=vec3(0.72,0.36,0.72), cPeak=vec3(0.92,0.70,0.92);
          vec3 col = mix(cOcean,cShore,smoothstep(-0.25,0.02,h));
          col = mix(col,cLand,smoothstep(0.02,0.22,h));
          col = mix(col,cHigh,smoothstep(0.22,0.45,h));
          col = mix(col,cPeak,smoothstep(0.5,0.78,h));
          float veins = smoothstep(0.55,0.62, fbm(d*8.0+3.0));
          col = mix(col, vec3(0.24,0.72,0.85), veins*0.45);
          float ice = smoothstep(0.82,0.94, abs(d.y));
          col = mix(col, vec3(0.78,0.86,0.98), ice*0.8);
          col = mix(col, col*(0.5+uTint), uTintAmt*0.6);
          diffuseColor.rgb *= col;
        }`
      );
    }
    if (proceduralBump) {
      frag = frag.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 d = normalize(vDir);
          float e = 0.07; float h0 = terr(d);
          vec3 t1 = normalize(cross(d, vec3(0.0,1.0,0.0)) + 1e-4);
          vec3 t2 = normalize(cross(d, t1));
          float hx = terr(d + t1*e) - h0;
          float hy = terr(d + t2*e) - h0;
          normal = normalize(normal - (t1*hx + t2*hy) * 2.2);
        }`
      );
    }
    shader.fragmentShader = frag;
  };

  const surface = new THREE.Mesh(new THREE.SphereGeometry(6, 128, 128), surfMat);
  surface.renderOrder = 0;
  group.add(surface);

  // ---- atmosphere (Fresnel glow) ---------------------------------------
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#b985ff') } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - max(dot(vN,vV),0.0), 3.3) * 0.8;
        gl_FragColor = vec4(uColor, f); }`,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(6.35, 64, 64), atmoMat);
  atmosphere.renderOrder = 2;
  group.add(atmosphere);

  // ---- decorative ring --------------------------------------------------
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(8.6, 0.1, 16, 140),
    new THREE.MeshStandardMaterial({ color: '#caa6ff', emissive: '#7a4bd6', emissiveIntensity: 0.4, transparent: true, opacity: 0.22 })
  );
  ring.rotation.set(Math.PI / 2.3, 0.3, 0);
  ring.renderOrder = 1;
  group.add(ring);

  group.position.set(0, -7.9, -1);

  return {
    group,
    surface,
    atmosphere,
    uniforms,
    atmoColor: atmoMat.uniforms.uColor.value,
    // Drop in high-res textures later — they override the procedural fallback.
    setTextures(map = null, normalMap = null) {
      surfMat.map = map;
      surfMat.normalMap = normalMap;
      surfMat.needsUpdate = true; // recompiles → skips the procedural branch
    },
    update(dt, tintColor, tintAmt) {
      group.rotation.y += dt * 0.03;
      uniforms.uTint.value.copy(tintColor);
      uniforms.uTintAmt.value = tintAmt;
      atmoMat.uniforms.uColor.value.copy(tintColor);
    },
  };
}
