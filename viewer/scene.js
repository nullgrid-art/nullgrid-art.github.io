import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { horizonYearsFor, SEGMENTS_PER_BEAM } from "/engine/dist/src/index.js";

/**
 * The Entropy Protocol render pipeline, extracted into a single reusable
 * factory so the per-token viewer (main.js) and the full-collection gallery
 * (gallery.js) render through the exact same code path. Any visual change made
 * here is reflected identically in both, there is no second copy to drift.
 *
 * A scene owns its own WebGL renderer bound to the supplied canvas. Render a
 * frame with `renderFrame(...)`, supplying the camera pose, the engine state
 * for the token at a given moment, and an animation time for the light
 * fragments. The caller decides the camera (orbit in the viewer, fixed in the
 * gallery) and the animation time (live clock in the viewer, fixed constant in
 * the gallery so thumbnails are deterministic).
 */
export function createLatticeScene({ canvas, size = 860, preserveDrawingBuffer = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 9, 24);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  // --- Layer 0: background depth gradient -----------------------------------
  const backgroundMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec2 fromCentre = vUv - 0.5;
        float dist = length(fromCentre);
        vec3 centre = vec3(0.022, 0.020, 0.028);
        vec3 edge   = vec3(0.000, 0.000, 0.005);
        vec3 col = mix(centre, edge, smoothstep(0.0, 0.85, dist));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthWrite: false,
    depthTest: false,
  });
  const background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backgroundMaterial);
  background.frustumCulled = false;
  background.renderOrder = -1000;
  scene.add(background);

  // --- Layer 1: structural lattice ------------------------------------------
  const LATTICE_BASE_COLOUR = new THREE.Color(0x474646);
  const LATTICE_BEAM_RADIUS = 0.085;
  const LATTICE_NODE_RADIUS = 0.13;

  const latticeVertexShader = `
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vRandom;
    attribute float instanceRandom;
    void main() {
      vec4 instancedPos = instanceMatrix * vec4(position, 1.0);
      vec4 worldPos = modelMatrix * instancedPos;
      vWorldPos = worldPos.xyz;
      vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      vRandom = instanceRandom;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const latticeFragmentShader = `
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vRandom;
    uniform vec3 uColor;
    uniform vec3 uEmissive;
    uniform float uEmissiveStrength;
    uniform vec3 uKeyDir;
    uniform vec3 uFillDir;
    uniform float uOpacity;
    float hash(vec3 p) {
      p = fract(p * vec3(443.8975, 397.2973, 491.1871));
      p += dot(p, p.yxz + 19.19);
      return fract((p.x + p.y) * p.z);
    }
    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash(i);
      float n100 = hash(i + vec3(1.0, 0.0, 0.0));
      float n010 = hash(i + vec3(0.0, 1.0, 0.0));
      float n110 = hash(i + vec3(1.0, 1.0, 0.0));
      float n001 = hash(i + vec3(0.0, 0.0, 1.0));
      float n101 = hash(i + vec3(1.0, 0.0, 1.0));
      float n011 = hash(i + vec3(0.0, 1.0, 1.0));
      float n111 = hash(i + vec3(1.0, 1.0, 1.0));
      return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
      );
    }
    void main() {
      float key  = max(dot(vNormal, uKeyDir),  0.0);
      float fill = max(dot(vNormal, uFillDir), 0.0);
      vec3 lit = uColor * (0.55 + 0.45 * key + 0.18 * fill);
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float ndv = max(dot(vNormal, viewDir), 0.0);
      float fresnel = pow(1.0 - ndv, 2.2);
      vec3 rimColour = mix(uColor, uEmissive, 0.65);
      vec3 rim = rimColour * fresnel * 0.38;
      float n = noise(vWorldPos * 3.5);
      float subtle = 0.93 + n * 0.14;
      float instanceBright = 0.94 + vRandom * 0.12;
      vec3 emission = uEmissive * uEmissiveStrength;
      vec3 finalCol = (lit * subtle * instanceBright + rim + emission);
      gl_FragColor = vec4(finalCol, uOpacity);
    }
  `;

  function makeLatticeMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: latticeVertexShader,
      fragmentShader: latticeFragmentShader,
      uniforms: {
        uColor: { value: LATTICE_BASE_COLOUR.clone() },
        uEmissive: { value: new THREE.Color(1, 1, 1) },
        uEmissiveStrength: { value: 0.0 },
        uKeyDir: { value: new THREE.Vector3(6, 10, 8).normalize() },
        uFillDir: { value: new THREE.Vector3(-6, -2, -5).normalize() },
        uOpacity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });
  }

  const beamGeometry = new THREE.CylinderGeometry(LATTICE_BEAM_RADIUS, LATTICE_BEAM_RADIUS, 1, 8, 1, false);
  const beamMaterial = makeLatticeMaterial();
  const MAX_BEAM_INSTANCES = 500 * SEGMENTS_PER_BEAM;
  const beamInstanceRandoms = new Float32Array(MAX_BEAM_INSTANCES);
  for (let i = 0; i < MAX_BEAM_INSTANCES; i++) beamInstanceRandoms[i] = Math.random();
  beamGeometry.setAttribute("instanceRandom", new THREE.InstancedBufferAttribute(beamInstanceRandoms, 1));
  const beamMesh = new THREE.InstancedMesh(beamGeometry, beamMaterial, MAX_BEAM_INSTANCES);
  beamMesh.count = 0;
  beamMesh.frustumCulled = false;
  beamMesh.renderOrder = 0;
  scene.add(beamMesh);

  const nodeGeometry = new THREE.SphereGeometry(LATTICE_NODE_RADIUS, 10, 8);
  const nodeMaterial = makeLatticeMaterial();
  const MAX_NODE_INSTANCES = 250;
  const nodeInstanceRandoms = new Float32Array(MAX_NODE_INSTANCES);
  for (let i = 0; i < MAX_NODE_INSTANCES; i++) nodeInstanceRandoms[i] = Math.random();
  nodeGeometry.setAttribute("instanceRandom", new THREE.InstancedBufferAttribute(nodeInstanceRandoms, 1));
  const nodeMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, MAX_NODE_INSTANCES);
  nodeMesh.count = 0;
  nodeMesh.frustumCulled = false;
  nodeMesh.renderOrder = 0;
  scene.add(nodeMesh);

  const _beamMatrix = new THREE.Matrix4();
  const _beamPosition = new THREE.Vector3();
  const _beamScale = new THREE.Vector3();
  const _beamQuaternion = new THREE.Quaternion();
  const _beamA = new THREE.Vector3();
  const _beamB = new THREE.Vector3();
  const _beamDir = new THREE.Vector3();
  const _yAxis = new THREE.Vector3(0, 1, 0);
  const _nodeMatrix = new THREE.Matrix4();

  // --- Layer 1.5: atmospheric dust ------------------------------------------
  function makeSoftCircleTexture(sz = 64) {
    const c = document.createElement("canvas");
    c.width = c.height = sz;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    g.addColorStop(0.0, "rgba(255,255,255,1.0)");
    g.addColorStop(0.4, "rgba(255,255,255,0.55)");
    g.addColorStop(1.0, "rgba(255,255,255,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const DUST_PARTICLE_COUNT = 720;
  const dustGeometry = new THREE.BufferGeometry();
  {
    const positions = new Float32Array(DUST_PARTICLE_COUNT * 3);
    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 7.0;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 7.0;
    }
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  }
  const dustMaterial = new THREE.PointsMaterial({
    size: 0.055,
    map: makeSoftCircleTexture(),
    color: 0xb8b0a4,
    transparent: true,
    opacity: 0.25,
    alphaTest: 0.001,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const dustField = new THREE.Points(dustGeometry, dustMaterial);
  dustField.renderOrder = 0;
  scene.add(dustField);

  // --- Layer 2: tadpole light fragments -------------------------------------
  const beamVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const beamFragmentShader = `
    varying vec2 vUv;
    uniform float uOpacity;
    uniform float uIntensity;
    uniform float uTailRadius;
    uniform sampler2D uGradient;
    void main() {
      float t = vUv.x;
      float radial = abs(vUv.y - 0.5) * 2.0;
      float radiusScale = mix(uTailRadius, 1.0, t);
      float effectiveRadial = clamp(radial / radiusScale, 0.0, 1.0);
      float radialAlpha = pow(1.0 - effectiveRadial, 2.0);
      float bodyAlpha = pow(t, 0.40);
      float headSoft = smoothstep(1.0, 0.92, t);
      float alpha = radialAlpha * bodyAlpha * headSoft * uOpacity;
      vec3 colour = texture2D(uGradient, vec2(t, 0.5)).rgb;
      vec3 emit = colour * (1.0 + radialAlpha * 1.1) * uIntensity;
      gl_FragColor = vec4(emit, alpha);
    }
  `;

  const MAX_FRAGMENTS = 40;
  const TUBE_LENGTH_SEGMENTS = 18;
  const TUBE_RADIAL_SEGMENTS = 6;
  const TUBE_RADIUS = 0.13;

  function createTubeGeometry() {
    const geo = new THREE.BufferGeometry();
    const lengthSegs = TUBE_LENGTH_SEGMENTS;
    const radialSegs = TUBE_RADIAL_SEGMENTS;
    const vertCount = (lengthSegs + 1) * (radialSegs + 1);
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    for (let i = 0; i <= lengthSegs; i++) {
      for (let j = 0; j <= radialSegs; j++) {
        const idx = i * (radialSegs + 1) + j;
        uvs[idx * 2] = i / lengthSegs;
        uvs[idx * 2 + 1] = j / radialSegs;
      }
    }
    const indices = new Uint16Array(lengthSegs * radialSegs * 6);
    let ix = 0;
    for (let i = 0; i < lengthSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * (radialSegs + 1) + j;
        const b = (i + 1) * (radialSegs + 1) + j;
        const c = (i + 1) * (radialSegs + 1) + j + 1;
        const d = i * (radialSegs + 1) + j + 1;
        indices[ix++] = a; indices[ix++] = b; indices[ix++] = d;
        indices[ix++] = b; indices[ix++] = c; indices[ix++] = d;
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    return geo;
  }

  const _framePoint = new THREE.Vector3();
  const _frameUp = new THREE.Vector3();
  const _frameTangents = [];
  const _frameNormals = [];
  const _frameBinormals = [];
  for (let i = 0; i <= TUBE_LENGTH_SEGMENTS; i++) {
    _frameTangents.push(new THREE.Vector3());
    _frameNormals.push(new THREE.Vector3());
    _frameBinormals.push(new THREE.Vector3());
  }

  function computeFrenetFramesInPlace(curve, segments) {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      curve.getTangent(t, _frameTangents[i]).normalize();
    }
    const T0 = _frameTangents[0];
    const N0 = _frameNormals[0];
    const B0 = _frameBinormals[0];
    const tx = Math.abs(T0.x), ty = Math.abs(T0.y), tz = Math.abs(T0.z);
    if (tx <= ty && tx <= tz) _frameUp.set(1, 0, 0);
    else if (ty <= tx && ty <= tz) _frameUp.set(0, 1, 0);
    else _frameUp.set(0, 0, 1);
    N0.crossVectors(_frameUp, T0).normalize();
    B0.crossVectors(T0, N0).normalize();
    for (let i = 1; i <= segments; i++) {
      const T = _frameTangents[i];
      const N = _frameNormals[i];
      const B = _frameBinormals[i];
      N.copy(_frameNormals[i - 1]);
      const dot = N.dot(T);
      N.addScaledVector(T, -dot).normalize();
      B.crossVectors(T, N).normalize();
    }
  }

  function updateTubeGeometry(geo, curve) {
    const lengthSegs = TUBE_LENGTH_SEGMENTS;
    const radialSegs = TUBE_RADIAL_SEGMENTS;
    const radius = TUBE_RADIUS;
    const positions = geo.attributes.position.array;
    computeFrenetFramesInPlace(curve, lengthSegs);
    for (let i = 0; i <= lengthSegs; i++) {
      const t = i / lengthSegs;
      curve.getPoint(t, _framePoint);
      const N = _frameNormals[i];
      const B = _frameBinormals[i];
      for (let j = 0; j <= radialSegs; j++) {
        const v = (j / radialSegs) * Math.PI * 2;
        const cos = -Math.cos(v);
        const sin = Math.sin(v);
        const nx = cos * N.x + sin * B.x;
        const ny = cos * N.y + sin * B.y;
        const nz = cos * N.z + sin * B.z;
        const idx = (i * (radialSegs + 1) + j) * 3;
        positions[idx] = _framePoint.x + nx * radius;
        positions[idx + 1] = _framePoint.y + ny * radius;
        positions[idx + 2] = _framePoint.z + nz * radius;
      }
    }
    geo.attributes.position.needsUpdate = true;
  }

  function buildGradientTexture(colours) {
    const width = 64;
    const data = new Uint8Array(width * 4);
    for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      let col;
      if (colours.length === 1) {
        col = colours[0];
      } else {
        const segCount = colours.length - 1;
        const scaled = t * segCount;
        const idx = Math.min(Math.floor(scaled), segCount - 1);
        const local = scaled - idx;
        const a = colours[idx];
        const b = colours[idx + 1];
        col = [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local, a[2] + (b[2] - a[2]) * local];
      }
      data[i * 4] = Math.round(Math.min(1, col[0]) * 255);
      data[i * 4 + 1] = Math.round(Math.min(1, col[1]) * 255);
      data[i * 4 + 2] = Math.round(Math.min(1, col[2]) * 255);
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  const fragmentObjects = [];
  for (let i = 0; i < MAX_FRAGMENTS; i++) {
    const material = new THREE.ShaderMaterial({
      vertexShader: beamVertexShader,
      fragmentShader: beamFragmentShader,
      uniforms: {
        uOpacity: { value: 0 },
        uIntensity: { value: 1.0 },
        uTailRadius: { value: 0.2 },
        uGradient: { value: null },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geometry = createTubeGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    fragmentObjects.push({ material, mesh, gradientTexture: null, tailRadius: 0.2 });
  }

  // --- Post-processing ------------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size, size), 0.7, 0.7, 0.5);
  composer.addPass(bloomPass);
  const cinematicPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignetteStrength: { value: 0.45 },
      uGrainStrength: { value: 0.06 },
      uChromaStrength: { value: 0.003 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uVignetteStrength;
      uniform float uGrainStrength;
      uniform float uChromaStrength;
      // Hoskins-style hash. The classic fract(sin(dot())) hash degenerates
      // into visible near-vertical striping on low-precision / software GL
      // (e.g. SwiftShader in the headless preview baker); this one stays
      // uniform white noise on every GPU.
      float random(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 uv = vUv;
        vec2 fromCentre = uv - 0.5;
        float dist = length(fromCentre);
        vec2 chromaOffset = fromCentre * uChromaStrength * (1.0 + dist * 3.0);
        float r = texture2D(tDiffuse, uv - chromaOffset).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv + chromaOffset).b;
        vec3 colour = vec3(r, g, b);
        float vignette = 1.0 - smoothstep(0.35, 0.95, dist) * uVignetteStrength;
        colour *= vignette;
        float grain = (random(uv * 1024.0 + fract(uTime * 0.13)) - 0.5) * uGrainStrength;
        colour += grain;
        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  });
  composer.addPass(cinematicPass);
  composer.addPass(new OutputPass());

  // --- Render state ---------------------------------------------------------
  let _lattice = null;
  let _state = null;
  let _illuminationLimit = 85;
  let _cachedLatticeFor = null;
  let _cachedDecay = -1;

  function decayedNodePos(lat, nodeIdx, decay, out) {
    const n = lat.nodes[nodeIdx];
    const dv = lat.decayVectors[nodeIdx];
    out.set(n.x + dv.x * decay, n.y + dv.y * decay, n.z + dv.z * decay);
  }

  function rebuildBaseLayer(lat, decay, illumFactor) {
    const opacityScale = 1.0 - 0.5 * decay;
    beamMaterial.uniforms.uOpacity.value = opacityScale;
    nodeMaterial.uniforms.uOpacity.value = opacityScale;
    const primary = lat.lightProfile.palette[0];
    beamMaterial.uniforms.uEmissive.value.setRGB(primary[0], primary[1], primary[2]);
    nodeMaterial.uniforms.uEmissive.value.setRGB(primary[0], primary[1], primary[2]);
    const luminance = primary[0] * 0.299 + primary[1] * 0.587 + primary[2] * 0.114;
    const luminanceFactor = Math.pow(1.0 - luminance, 0.8);
    const emissiveCeiling = 0.45 + luminanceFactor * 0.85;
    const illum = typeof illumFactor === "number" ? illumFactor : 1.0;
    const emissiveStrength = decay * decay * emissiveCeiling * illum;
    beamMaterial.uniforms.uEmissiveStrength.value = emissiveStrength;
    nodeMaterial.uniforms.uEmissiveStrength.value = emissiveStrength;

    let beamCursor = 0;
    for (let beamIdx = 0; beamIdx < lat.beams.length; beamIdx++) {
      const beam = lat.beams[beamIdx];
      decayedNodePos(lat, beam.from, decay, _beamA);
      decayedNodePos(lat, beam.to, decay, _beamB);
      const baseIdx = beamIdx * SEGMENTS_PER_BEAM;
      for (let s = 0; s < SEGMENTS_PER_BEAM; s++) {
        if (decay > lat.segmentThresholds[baseIdx + s]) continue;
        const t0 = s / SEGMENTS_PER_BEAM;
        const t1 = (s + 1) / SEGMENTS_PER_BEAM;
        const ax = _beamA.x + (_beamB.x - _beamA.x) * t0;
        const ay = _beamA.y + (_beamB.y - _beamA.y) * t0;
        const az = _beamA.z + (_beamB.z - _beamA.z) * t0;
        const bx = _beamA.x + (_beamB.x - _beamA.x) * t1;
        const by = _beamA.y + (_beamB.y - _beamA.y) * t1;
        const bz = _beamA.z + (_beamB.z - _beamA.z) * t1;
        _beamDir.set(bx - ax, by - ay, bz - az);
        const length = _beamDir.length();
        _beamDir.divideScalar(length);
        _beamPosition.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
        _beamQuaternion.setFromUnitVectors(_yAxis, _beamDir);
        const radiusScale = 1.0 - 0.4 * decay;
        _beamScale.set(radiusScale, length, radiusScale);
        _beamMatrix.compose(_beamPosition, _beamQuaternion, _beamScale);
        beamMesh.setMatrixAt(beamCursor, _beamMatrix);
        beamCursor++;
      }
    }
    beamMesh.count = beamCursor;
    beamMesh.instanceMatrix.needsUpdate = true;

    const nodeRadiusScale = 1.0 - 0.35 * decay;
    for (let i = 0; i < lat.nodes.length; i++) {
      decayedNodePos(lat, i, decay, _beamPosition);
      _beamScale.set(nodeRadiusScale, nodeRadiusScale, nodeRadiusScale);
      _nodeMatrix.compose(_beamPosition, _beamQuaternion.identity(), _beamScale);
      nodeMesh.setMatrixAt(i, _nodeMatrix);
    }
    nodeMesh.count = lat.nodes.length;
    nodeMesh.instanceMatrix.needsUpdate = true;
  }

  function curvePositionAtTime(point, time, out) {
    out.set(
      point.base.x + Math.sin(point.freq.x * time + point.phase.x) * point.amplitude.x,
      point.base.y + Math.sin(point.freq.y * time + point.phase.y) * point.amplitude.y,
      point.base.z + Math.sin(point.freq.z * time + point.phase.z) * point.amplitude.z
    );
  }

  const _scratchControls = [];
  for (let i = 0; i < 8; i++) _scratchControls.push(new THREE.Vector3());
  let _scratchCurve = null;

  function rebuildFragment(fragIdx, lightFragment, time, intensity, colourMultiplier) {
    const obj = fragmentObjects[fragIdx];
    const cycle = Math.sin(lightFragment.lifecycleFreq * time + lightFragment.lifecyclePhase);
    const lifecycleAlpha = Math.max(0, cycle);
    const eased = lifecycleAlpha * lifecycleAlpha * (3 - 2 * lifecycleAlpha);
    if (lifecycleAlpha < 0.005) {
      obj.mesh.visible = false;
    } else {
      obj.mesh.visible = true;
      obj.material.uniforms.uOpacity.value = eased * intensity;
    }
    const flow = lightFragment.centreFlow;
    const flowX = Math.sin(flow.freq.x * time + flow.phase.x) * flow.amplitude.x;
    const flowY = Math.sin(flow.freq.y * time + flow.phase.y) * flow.amplitude.y;
    const flowZ = Math.sin(flow.freq.z * time + flow.phase.z) * flow.amplitude.z;
    const cpCount = lightFragment.controlPoints.length;
    for (let k = 0; k < cpCount; k++) {
      const p = lightFragment.controlPoints[k];
      const out = _scratchControls[k];
      curvePositionAtTime(p, time, out);
      out.x += flowX; out.y += flowY; out.z += flowZ;
    }
    if (!_scratchCurve) {
      _scratchCurve = new THREE.CatmullRomCurve3(_scratchControls.slice(0, cpCount), false, "catmullrom", 0.4);
    } else {
      _scratchCurve.points = _scratchControls.slice(0, cpCount);
    }
    obj.material.uniforms.uIntensity.value = colourMultiplier;
    updateTubeGeometry(obj.mesh.geometry, _scratchCurve);
  }

  function bindFragmentVisuals(lp) {
    for (let i = 0; i < MAX_FRAGMENTS; i++) {
      const obj = fragmentObjects[i];
      if (i >= lp.fragments.length) {
        if (obj.gradientTexture) obj.gradientTexture.dispose();
        obj.gradientTexture = null;
        obj.material.uniforms.uGradient.value = null;
        obj.mesh.visible = false;
        continue;
      }
      const frag = lp.fragments[i];
      if (obj.gradientTexture) obj.gradientTexture.dispose();
      obj.gradientTexture = buildGradientTexture(frag.colours);
      obj.material.uniforms.uGradient.value = obj.gradientTexture;
      const tailVar = 0.1 + (Math.sin(frag.lifecyclePhase * 1.7) * 0.5 + 0.5) * 0.3;
      obj.material.uniforms.uTailRadius.value = tailVar;
    }
  }

  // Shared brightness arc for EVERY token: brightness = b^exp x ceiling.
  // Because the curve is shared, a token's absolute brightness before it peaks
  // is the same function of time regardless of its limit (a lower-limit token
  // matures faster along its shorter horizon, which exactly cancels its lower
  // ceiling). The upshot: a lower-illumination piece can never out-glow a
  // higher-illumination one at ANY point across the 10-year arc, and at peak
  // brightness strictly tracks the limit.
  //
  // Per-token growth curves (talent/work/balanced) previously drove this and
  // broke the ladder at mid-life: a 'talent' Resilient front-loaded to ~0.74
  // while a 'work' Transcendent sat at ~0.30 at year 5. Growth is now a
  // descriptive trait only; it no longer affects brightness ordering.
  const SHARED_BRIGHTNESS_EXP = 0.85;
  function intensityFor(state, illuminationLimit) {
    const b = state.brightnessState;
    const ceiling = illuminationLimit / 100;
    return Math.min(1.0, Math.pow(b, SHARED_BRIGHTNESS_EXP) * ceiling);
  }

  function illuminationFactorFor(limit) {
    const t = (limit - 69) / 28;
    return 0.6 + Math.pow(Math.max(0, Math.min(1, t)), 1.7) * 0.9;
  }

  // Reference luminance the colour path normalises every palette toward, so a
  // token's OVERALL brightness tracks its illumination limit rather than how
  // intrinsically light/dark its palette happens to be. ~mid of the palette
  // library's luminance range (0.46-0.90).
  const REFERENCE_LUMINANCE = 0.62;

  function paletteAverageLuminance(palette) {
    let sum = 0;
    for (const c of palette) sum += c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
    return sum / palette.length;
  }

  function rebuildAll(time) {
    if (!_lattice || !_state) return;
    const decay = _state.currentDecay;
    const brightness = _state.brightnessState;
    const lp = _lattice.lightProfile;
    const baseIntensity = intensityFor(_state, _illuminationLimit);
    const alphaCountFactor = Math.sqrt(33 / lp.fragmentCount);
    const intensity = baseIntensity * alphaCountFactor;
    const illumFactor = illuminationFactorFor(_illuminationLimit);
    // Softened count compensation in the colour path (sqrt, not linear): a
    // low-fragment token's threads no longer bloom disproportionately brighter
    // than a high-fragment one of the same illumination.
    const colourCountFactor = Math.sqrt(33 / lp.fragmentCount);
    // Wider illumination spread so the tier ladder reads clearly in the bloom.
    const colourIllumBoost = 0.55 + illumFactor * 0.45;
    const decayBoost = 1.0 + decay * 0.55;
    // Palette-luminance normalisation: scales the colour energy toward a fixed
    // reference so a near-white palette (Ethereal, Pastel Dream) doesn't blow
    // out under bloom and out-glow a Transcendent. Scales all channels equally,
    // so palette HUE is preserved, only overall intensity is levelled.
    const palAvgLum = paletteAverageLuminance(lp.palette);
    const paletteLumNorm = REFERENCE_LUMINANCE / Math.max(0.2, palAvgLum);
    const colourMultiplier =
      decayBoost * colourCountFactor * colourIllumBoost * paletteLumNorm;
    const primary = lp.palette[0];
    const paletteLum = primary[0] * 0.299 + primary[1] * 0.587 + primary[2] * 0.114;
    const paletteBloomComp = 1.0 + (1.0 - paletteLum) * 0.12;

    if (_lattice !== _cachedLatticeFor || decay !== _cachedDecay) {
      rebuildBaseLayer(_lattice, decay, illumFactor);
      _cachedLatticeFor = _lattice;
      _cachedDecay = decay;
      bloomPass.strength = (0.4 + brightness * 0.65 * illumFactor) * paletteBloomComp;
      bloomPass.radius = 0.55 + decay * 0.2;
      dustMaterial.opacity = 0.24 + brightness * 0.32 * illumFactor;
    }

    for (let i = 0; i < MAX_FRAGMENTS; i++) {
      if (i < lp.fragments.length) {
        rebuildFragment(i, lp.fragments[i], time, intensity, colourMultiplier);
      } else {
        fragmentObjects[i].mesh.visible = false;
      }
    }
  }

  // --- Public API -----------------------------------------------------------

  /** Load a new token. Rebuilds the per-fragment gradient textures. */
  function setLattice(lattice) {
    _lattice = lattice;
    // Invalidate the geometry cache so the next render rebuilds the lattice.
    _cachedLatticeFor = null;
    _cachedDecay = -1;
    bindFragmentVisuals(lattice.lightProfile);
  }

  /**
   * Render a single frame.
   *   state             engine state for this token at this moment
   *   illuminationLimit per-token brightness ceiling (69-97)
   *   animTime          seconds of light-fragment animation (live clock in the
   *                     viewer; a fixed constant in the gallery for determinism)
   *   cam               { x, y, z, fov, lookAt:{x,y,z} } camera pose
   */
  function renderFrame({ state, illuminationLimit, animTime, cam }) {
    _state = state;
    _illuminationLimit = illuminationLimit;
    if (cam) {
      camera.position.set(cam.x, cam.y, cam.z);
      const l = cam.lookAt || { x: 0, y: 0, z: 0 };
      camera.lookAt(l.x, l.y, l.z);
      if (typeof cam.fov === "number" && cam.fov !== camera.fov) {
        camera.fov = cam.fov;
        camera.updateProjectionMatrix();
      }
    }
    rebuildAll(animTime);
    cinematicPass.uniforms.uTime.value = animTime;
    composer.render();
  }

  function resize(px) {
    renderer.setSize(px, px, false);
    composer.setSize(px, px);
    bloomPass.setSize(px, px);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }

  function snapshot(type = "image/png", quality) {
    return renderer.domElement.toDataURL(type, quality);
  }

  return {
    setLattice,
    renderFrame,
    resize,
    snapshot,
    canvas: renderer.domElement,
    camera,
  };
}

/** Build engine state for a token at a given absolute lifetime in years. */
export function stateAtYears(years, illuminationLimit, decayLimit) {
  const iHorizon = horizonYearsFor(illuminationLimit);
  const dHorizon = horizonYearsFor(decayLimit);
  const brightnessState = Math.min(1, Math.max(0, years / iHorizon));
  const decayState = Math.min(1, Math.max(0, years / dHorizon));
  const currentIllumination = brightnessState * (illuminationLimit / 100);
  const currentDecay = decayState * (decayLimit / 100);
  const phase =
    brightnessState < 0.2 ? "structure" : brightnessState < 0.72 ? "decay" : "enlightenment";
  return {
    phase,
    brightnessState,
    decayState,
    currentIllumination,
    currentDecay,
    isStill: brightnessState >= 1 && decayState >= 1,
    glowIntensity: Math.min(1, 0.15 + brightnessState * 0.85),
    structuralDrift: 0,
  };
}

/** Deterministic per-seed camera framing (used by the per-token viewer). */
export function cameraProfileForSeed(seed) {
  let s = (seed >>> 0) || 1;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    radius: 12.5 + rng() * 4.5,
    heightAmplitude: 0.3 + rng() * 1.4,
    orbitSpeed: 0.000018 + rng() * 0.00003,
    fov: 38 + rng() * 12,
    orbitDirection: rng() < 0.5 ? -1 : 1,
    yawPhase: rng() * Math.PI * 2,
  };
}
