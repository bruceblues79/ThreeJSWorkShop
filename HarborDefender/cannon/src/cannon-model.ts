import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * HarborDefender 城防港加农炮 v2。
 * 契约：根节点 rotation.y = yaw；gun_rotate.rotation.x = pitch（正值抬炮口）；
 * muzzle 在世界 -Z 方向；hit_core 可命中。单位：米。
 */

const SEED = 20261013;

/** 炮身半径整体系数：参考图里炮管更修长，避免短粗感。 */
const BARREL_R = 0.76;

const DIM = {
  wheelR: 0.036,
  wheelW: 0.03,
  trackX: 0.097,
  wheelZ: 0.108,
  axleY: 0.0371,
  cheekX: 0.069,
  cheekT: 0.022,
  pivotY: 0.156,
  barrelFront: -0.185,
  barrelLength: 0.295,
  trunnionZ: 0.005,
} as const;

// ---------------------------------------------------------------- noise

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number): (x: number, y: number) => number {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rnd();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lattice = (x: number, y: number) => vals[perm[(perm[x & 255] + (y & 255)) & 511]];

  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = fade(x - xi);
    const v = fade(y - yi);
    return lerp(
      lerp(lattice(xi, yi), lattice(xi + 1, yi), u),
      lerp(lattice(xi, yi + 1), lattice(xi + 1, yi + 1), u),
      v,
    );
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 3): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise(x * freq, y * freq);
    total += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return value / total;
}

// ---------------------------------------------------------------- textures

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  return [canvas, ctx];
}

function texture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function normalFrom(albedo: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = albedo.width;
  const src = albedo.getContext('2d')!.getImageData(0, 0, size, size).data;
  const [canvas, ctx] = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const lum = (x: number, y: number) => {
    const i = ((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
      const dy = (lum(x, y - 1) - lum(x, y + 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = (dx * inv * 0.5 + 0.5) * 255;
      image.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      image.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function plankSeam(y: number, plankHeight: number): number {
  const local = ((y % plankHeight) + plankHeight) % plankHeight;
  if (local < 2.5) return 0.42;
  if (local < 4.5) return 1.25;
  return 1;
}

function buildWoodTextures() {
  const size = 512;
  const [albedo, ctx] = makeCanvas(size);
  const [rough, rctx] = makeCanvas(size);
  const grainNoise = makeNoise(SEED + 11);
  const fiberNoise = makeNoise(SEED + 29);
  const crackNoise = makeNoise(SEED + 47);
  const image = ctx.createImageData(size, size);
  const rimage = rctx.createImageData(size, size);
  const plankHeight = size / 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fiber = fbm(fiberNoise, x * 0.006, y * 0.16, 3);
      const grain = fbm(grainNoise, x * 0.016, y * 0.05, 4);
      const crack = crackNoise(x * 0.09, y * 0.012);
      let l = 0.115 + 0.1 * fiber + 0.115 * grain + 0.02 * crack;
      const seam = plankSeam(y, plankHeight);
      l *= seam;
      if (l > 0.46) l = 0.46;
      const warm = 0.9 + 0.25 * fiber;
      const i = (y * size + x) * 4;
      image.data[i] = l * 255 * 1.3 * warm;
      image.data[i + 1] = l * 255 * 1.02 * warm;
      image.data[i + 2] = l * 255 * 0.8 * warm;
      image.data[i + 3] = 255;

      const r = THREE.MathUtils.clamp(0.74 + 0.18 * grain - 0.25 * (seam - 1) + 0.05 * crack, 0.4, 0.98);
      const ri = i;
      rimage.data[ri] = rimage.data[ri + 1] = rimage.data[ri + 2] = r * 255;
      rimage.data[ri + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  rctx.putImageData(rimage, 0, 0);

  // 板缝里的暗色霉斑与铁件渗锈
  const rnd = mulberry32(SEED + 71);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size;
    const y = Math.floor(rnd() * 6) * plankHeight + rnd() * plankHeight;
    const radius = 12 + rnd() * 46;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, rnd() > 0.5 ? '#1a120b' : '#5a4a34');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;

  return {
    map: texture(albedo, true),
    roughnessMap: texture(rough, false),
    normalMap: texture(normalFrom(albedo, 2.4), false),
  };
}

function drawBarrelOrnament(ctx: CanvasRenderingContext2D, size: number, color: string, alpha: number) {
  const bands = [0.13, 0.44, 0.74, 0.9];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  for (const v of bands) {
    const y = (1 - v) * size;
    ctx.fillRect(0, y - 3, size, 2);
    ctx.fillRect(0, y + 3, size, 2);
    for (let i = 0; i < 64; i++) ctx.fillRect(i * 8 + 2, y - 9, 3.5, 5);
    for (let i = 0; i < 16; i++) {
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(i * 32 + 16, y + 13, 8, 0.3, Math.PI * 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(i * 32 + 16, y - 13, 6, Math.PI * 1.1, Math.PI * 2.3);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function buildBronzeTextures() {
  const size = 512;
  const [albedo, ctx] = makeCanvas(size);
  const [rough, rctx] = makeCanvas(size);
  const [metal, mctx] = makeCanvas(size);
  const patinaNoise = makeNoise(SEED + 101);
  const blotchNoise = makeNoise(SEED + 131);
  const pitNoise = makeNoise(SEED + 157);
  const image = ctx.createImageData(size, size);
  const rimage = rctx.createImageData(size, size);
  const mimage = mctx.createImageData(size, size);

  const bronze = [0.40, 0.30, 0.15];
  const patina = [0.16, 0.28, 0.23];
  const deep = [0.09, 0.14, 0.12];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const blotch = fbm(blotchNoise, x * 0.012, y * 0.012, 4);
      const fine = fbm(patinaNoise, x * 0.06, y * 0.06, 3);
      const pit = pitNoise(x * 0.22, y * 0.22);
      let mask = THREE.MathUtils.smoothstep(blotch * 0.7 + fine * 0.45, 0.29, 0.61);
      if (pit > 0.8) mask = Math.min(1, mask + 0.35);
      const wear = THREE.MathUtils.smoothstep(fine, 0.68, 0.95) * (1 - mask);

      let r = bronze[0] + (patina[0] - bronze[0]) * mask;
      let g = bronze[1] + (patina[1] - bronze[1]) * mask;
      let b = bronze[2] + (patina[2] - bronze[2]) * mask;
      if (mask > 0.82) {
        const k = (mask - 0.82) / 0.18;
        r += (deep[0] - r) * k * 0.7;
        g += (deep[1] - g) * k * 0.7;
        b += (deep[2] - b) * k * 0.7;
      }
      r += (0.62 - r) * wear * 0.32;
      g += (0.48 - g) * wear * 0.32;
      b += (0.22 - b) * wear * 0.32;

      const i = (y * size + x) * 4;
      image.data[i] = THREE.MathUtils.clamp(r, 0, 1) * 255;
      image.data[i + 1] = THREE.MathUtils.clamp(g, 0, 1) * 255;
      image.data[i + 2] = THREE.MathUtils.clamp(b, 0, 1) * 255;
      image.data[i + 3] = 255;

      const roughness = THREE.MathUtils.clamp(0.34 + 0.44 * mask + 0.06 * pit, 0, 1);
      rimage.data[i] = rimage.data[i + 1] = rimage.data[i + 2] = roughness * 255;
      rimage.data[i + 3] = 255;

      const metalness = THREE.MathUtils.clamp(0.94 - 0.8 * mask, 0, 1);
      mimage.data[i] = mimage.data[i + 1] = mimage.data[i + 2] = metalness * 255;
      mimage.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  rctx.putImageData(rimage, 0, 0);
  mctx.putImageData(mimage, 0, 0);

  drawBarrelOrnament(ctx, size, '#2a2110', 0.5);
  drawBarrelOrnament(ctx, size, '#c9a85c', 0.28);
  drawBarrelOrnament(rctx, size, '#3a3a3a', 0.55);

  return {
    map: texture(albedo, true),
    roughnessMap: texture(rough, false),
    metalnessMap: texture(metal, false),
    normalMap: texture(normalFrom(albedo, 1.6), false),
  };
}

// ---------------------------------------------------------------- materials

let cache: {
  wood: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
} | null = null;

function materials() {
  if (cache) return cache;
  const wood = buildWoodTextures();
  const bronze = buildBronzeTextures();
  cache = {
    wood: new THREE.MeshStandardMaterial({
      ...wood,
      color: 0xffffff,
      metalness: 0.02,
      roughness: 1,
      flatShading: true,
    }),
    bronze: new THREE.MeshStandardMaterial({
      ...bronze,
      color: 0xffffff,
      metalness: 1,
      roughness: 1,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0x9c7c44,
      metalness: 1,
      roughness: 0.44,
      flatShading: false,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: 0x24201c,
      metalness: 0.86,
      roughness: 0.55,
      flatShading: true,
    }),
  };
  return cache;
}

// ---------------------------------------------------------------- geometry helpers

function transform(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(matrix);
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  return transform(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
}

function cylinderX(radius: number, length: number, x: number, y: number, z: number, segments = 20, openEnded = false) {
  return transform(new THREE.CylinderGeometry(radius, radius, length, segments, 1, openEnded), x, y, z, 0, 0, Math.PI / 2);
}

function ringFace(inner: number, outer: number, segments: number, x: number, y: number, z: number, ry: number) {
  return transform(new THREE.RingGeometry(inner, outer, segments), x, y, z, 0, ry, 0);
}

function torusX(radius: number, tube: number, x: number, y: number, z: number) {
  return transform(new THREE.TorusGeometry(radius, tube, 6, 40), x, y, z, 0, Math.PI / 2, 0);
}

function torusZ(radius: number, tube: number, z: number) {
  return transform(new THREE.TorusGeometry(radius, tube, 6, 40), 0, 0, z);
}

function dome(x: number, y: number, z: number, radius: number) {
  return transform(new THREE.SphereGeometry(radius, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), x, y, z, 0, 0, Math.PI / 2);
}

// ---------------------------------------------------------------- wheel

function buildWheel(cx: number, cz: number): { wood: THREE.BufferGeometry[]; iron: THREE.BufferGeometry[] } {
  const { wheelR: R, wheelW: W, axleY: A } = DIM;
  const wood: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];

  const shape = new THREE.Shape();
  shape.absarc(0, 0, R, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.0295, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const rim = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 24 });
  const rimUv = rim.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < rimUv.count; i++) rimUv.setXY(i, rimUv.getX(i) * 16, rimUv.getY(i) * 16);
  rimUv.needsUpdate = true;
  rim.translate(0, 0, -W / 2);
  rim.rotateY(Math.PI / 2);
  rim.translate(cx, A, cz);
  wood.push(rim);

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const r = 0.0195;
    wood.push(box(0.013, 0.023, 0.008, cx, A + Math.cos(angle) * r, cz + Math.sin(angle) * r, angle, 0, 0));
  }

  wood.push(cylinderX(0.0125, 0.033, cx, A, cz, 14));
  iron.push(cylinderX(0.0133, 0.008, cx - W * 0.3, A, cz, 14));
  iron.push(cylinderX(0.0133, 0.008, cx + W * 0.3, A, cz, 14));

  iron.push(transform(new THREE.CylinderGeometry(R + 0.0011, R + 0.0011, W + 0.002, 28, 1, true), cx, A, cz, 0, 0, Math.PI / 2));
  iron.push(ringFace(R - 0.0016, R + 0.0011, 28, cx - (W + 0.002) / 2, A, cz, -Math.PI / 2));
  iron.push(ringFace(R - 0.0016, R + 0.0011, 28, cx + (W + 0.002) / 2, A, cz, Math.PI / 2));

  iron.push(dome(cx + Math.sign(cx) * (W * 0.5 + 0.004), A, cz, 0.0058));

  return { wood, iron };
}

// ---------------------------------------------------------------- barrel profile

function barrelProfile(): THREE.Vector2[] {
  const raw: Array<[number, number]> = [
    [0.0455, 0.0],
    [0.0492, 0.005],
    [0.0495, 0.011],
    [0.0472, 0.018],
    [0.0448, 0.025],
    [0.0446, 0.035],
    [0.0462, 0.05],
    [0.0452, 0.065],
    [0.0448, 0.095],
    [0.0455, 0.125],
    [0.0468, 0.155],
    [0.0485, 0.185],
    [0.0505, 0.215],
    [0.0530, 0.243],
    [0.0558, 0.262],
    [0.0562, 0.272],
    [0.0530, 0.281],
    [0.0430, 0.288],
    [0.0300, 0.293],
    [0.0230, 0.297],
    [0.0255, 0.302],
    [0.0270, 0.307],
    [0.0240, 0.313],
    [0.0130, 0.318],
    [0.0000, 0.320],
  ];
  const scale = DIM.barrelLength / raw[raw.length - 1][1];
  return raw.map(([r, y]) => new THREE.Vector2(r * BARREL_R, y * scale));
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = list.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const merged = mergeGeometries(flat);
  if (!merged) throw new Error('cannon geometry merge failed');
  return merged;
}

// ---------------------------------------------------------------- factory

export function createCannon(): THREE.Group {
  const mats = materials();
  const root = new THREE.Group();
  root.name = 'cannon';

  const wood: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];
  const bronze: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];

  const { wheelR: R, trackX: TX, wheelZ: WZ, axleY: A, cheekX: CX, cheekT: CT, pivotY } = DIM;

  // 侧颊：前低 / 中高（炮耳座）/ 后低，形成参考图的阶梯轮廓
  const cheekSections: Array<[number, number, number]> = [
    [-0.155, -0.05, 0.122],
    [-0.05, 0.032, 0.142],
    [0.032, 0.14, 0.112],
  ];
  for (const side of [-1, 1]) {
    for (const [z0, z1, top] of cheekSections) {
      wood.push(box(CT, top - 0.05, z1 - z0, side * CX, (top + 0.05) / 2, (z0 + z1) / 2));
      iron.push(box(0.0025, 0.006, z1 - z0, side * (CX + CT / 2), top - 0.004, (z0 + z1) / 2));
    }
    // 炮耳轴承木块 + 铁箍
    wood.push(box(0.032, 0.058, 0.066, side * 0.084, 0.133, 0));
    iron.push(box(0.036, 0.008, 0.07, side * 0.084, 0.160, 0));
    iron.push(box(0.036, 0.008, 0.07, side * 0.084, 0.106, 0));
    // 角铁包角
    iron.push(box(0.003, 0.052, 0.012, side * (CX + CT / 2 + 0.001), 0.08, 0.135));
    iron.push(box(0.003, 0.012, 0.052, side * (CX + CT / 2 + 0.001), 0.058, 0.113));
    iron.push(box(0.003, 0.052, 0.012, side * (CX + CT / 2 + 0.001), 0.08, -0.149));
    iron.push(box(0.003, 0.012, 0.052, side * (CX + CT / 2 + 0.001), 0.058, -0.127));
    // 铆钉
    for (const z of [-0.13, -0.08, 0.06, 0.11]) {
      for (const y of [0.068, 0.095]) {
        iron.push(transform(new THREE.SphereGeometry(0.0044, 8, 6), side * (CX + CT / 2 + 0.001), y, z));
      }
    }
  }

  // 前后横梁 + 前段炮床（后段留给抬炮时的炮尾摆动空间，避免穿插）
  wood.push(box(0.156, 0.052, 0.046, 0, A, WZ));
  wood.push(box(0.156, 0.052, 0.046, 0, A, -WZ));
  wood.push(box(0.096, 0.03, 0.115, 0, 0.066, -0.073));
  wood.push(box(0.07, 0.03, 0.03, 0, 0.05, -0.166));
  wood.push(box(0.07, 0.028, 0.03, 0, 0.048, 0.15));
  // 轴
  wood.push(cylinderX(0.012, 0.206, 0, A, WZ, 12));
  wood.push(cylinderX(0.012, 0.206, 0, A, -WZ, 12));
  iron.push(cylinderX(0.0078, 0.012, 0.108, A, WZ, 10));
  iron.push(cylinderX(0.0078, 0.012, -0.108, A, WZ, 10));
  iron.push(cylinderX(0.0078, 0.012, 0.108, A, -WZ, 10));
  iron.push(cylinderX(0.0078, 0.012, -0.108, A, -WZ, 10));

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = buildWheel(sx * TX, sz * WZ);
      wood.push(...wheel.wood);
      iron.push(...wheel.iron);
    }
  }

  // ---- 炮身（车削回转体）
  const gun = new THREE.Group();
  gun.name = 'gun_rotate';
  gun.position.set(0, pivotY, 0);

  const profile = barrelProfile();
  const lathe = new THREE.LatheGeometry(profile, 48);
  lathe.rotateX(Math.PI / 2);
  lathe.translate(0, 0, DIM.barrelFront);
  bronze.push(lathe);

  // 炮膛（深色内筒，前端面即膛底）
  const bore = new THREE.CylinderGeometry(0.0265 * BARREL_R, 0.0265 * BARREL_R, 0.055, 32);
  bore.rotateX(Math.PI / 2);
  bore.translate(0, 0, DIM.barrelFront + 0.0275);
  const boreMesh = new THREE.Mesh(mergeAll([bore]), mats.iron);
  boreMesh.name = 'cannon-bore';
  gun.add(boreMesh);

  // 炮口端面
  bronze.push(ringFace(0.0265 * BARREL_R, 0.0455 * BARREL_R, 40, 0, 0, DIM.barrelFront + 0.0004, Math.PI));

  // 炮耳
  bronze.push(cylinderX(0.0115 * BARREL_R, 0.19, 0, 0, DIM.trunnionZ, 16));

  // 金色凸箍（参考图的高光边）
  const bands: Array<[number, number]> = [
    [-0.180, 0.0492],
    [-0.139, 0.0462],
    [-0.042, 0.0468],
    [0.057, 0.0558],
  ];
  for (const [z, r] of bands) brass.push(torusZ(r * BARREL_R + 0.0014, 0.0032, z));

  // 炮耳端盖（同心圆青铜盘）
  for (const side of [-1, 1]) {
    brass.push(cylinderX(0.023, 0.009, side * 0.097, 0, DIM.trunnionZ, 24));
    brass.push(torusX(0.0150, 0.0024, side * 0.1015, 0, DIM.trunnionZ));
    brass.push(torusX(0.0077, 0.0020, side * 0.1015, 0, DIM.trunnionZ));
  }

  const barrel = new THREE.Mesh(mergeAll(bronze), mats.bronze);
  barrel.name = 'cannon-barrel';
  gun.add(barrel);

  const barrelBrass = new THREE.Mesh(mergeAll(brass), mats.brass);
  barrelBrass.name = 'cannon-barrel-fittings';
  gun.add(barrelBrass);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, DIM.barrelFront);
  gun.add(muzzle);

  const carriageWood = new THREE.Mesh(mergeAll(wood), mats.wood);
  carriageWood.name = 'cannon-carriage';
  root.add(carriageWood);

  const carriageIron = new THREE.Mesh(mergeAll(iron), mats.iron);
  carriageIron.name = 'cannon-iron-fittings';
  root.add(carriageIron);

  root.add(gun);

  for (const mesh of [carriageWood, carriageIron, barrel, barrelBrass, boreMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const hitCore = new THREE.Object3D();
  hitCore.name = 'hit_core';
  hitCore.position.copy(center);
  root.add(hitCore);

  return root;
}
