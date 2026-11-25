import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * TheFarField 角色 comma v3 — 严格按 IMG_comma_3.jpeg 三视图重做。
 *
 * 契约：
 *   - 根节点 char_comma，脚底 y=0，面朝 -Z，总高 1.80 m（含卷须）
 *   - 关节 head_joint / shoulder_l|r / elbow_l|r / wrist_l|r / hip_l|r / knee_l|r / ankle_l|r
 *   - 单图集 PBR：2048 颜色 + 1024 粗糙/金属 + 1024 法线，单一 MeshStandardMaterial
 *   - 臂展 1.80 m（指尖到指尖），躯干 + 长衫 + 背包并入 body，除四肢外仅头为独立关节
 */

const SEED = 20261125;
const ATLAS = 2048;
const AUX = 1024;
const TAU = Math.PI * 2;

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
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd(); }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lattice = (x: number, y: number) => vals[perm[(perm[x & 255] + (y & 255)) & 511]];
  return (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const u = fade(x - xi); const v = fade(y - yi);
    return lerp(
      lerp(lattice(xi, yi), lattice(xi + 1, yi), u),
      lerp(lattice(xi, yi + 1), lattice(xi + 1, yi + 1), u),
      v,
    );
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct = 3): number {
  let v = 0, amp = 0.5, freq = 1, total = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * noise(x * freq, y * freq);
    total += amp; amp *= 0.5; freq *= 2.03;
  }
  return v / total;
}

// ---------------------------------------------------------------- color

type RGB = readonly [number, number, number];
type Pixel = { r: number; g: number; b: number; h: number };
type Paint = (u: number, v: number) => Pixel;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const clamp255 = (t: number) => (t < 0 ? 0 : t > 255 ? 255 : t);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t);
};
function mix3(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
function toPixel(c: RGB, h: number, shade = 1): Pixel {
  return { r: clamp255(c[0] * shade), g: clamp255(c[1] * shade), b: clamp255(c[2] * shade), h: clamp255(h) };
}

// ---------------------------------------------------------------- painters

function woodPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 7);
  const n3 = makeNoise(seed + 13);
  return (u, v) => {
    const warp = fbm(n1, u * 3.2, v * 0.55, 2);
    const g = fbm(n2, u * 9 + warp * 2.4, v * 0.5, 3);
    const streak = smoothstep(0.5, 0.78, g);
    const fiber = fbm(n3, u * 140, v * 2.6, 2) - 0.5;
    const t = clamp01(streak * 0.55 + fiber * 0.35);
    const c = mix3(base, dark, t);
    const dirt = fbm(n1, u * 1.4, v * 1.1, 2);
    return toPixel(c, 138 + streak * 46 + fiber * 26, 1 - (dirt - 0.5) * 0.08);
  };
}

function woodEndPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 5);
  const n3 = makeNoise(seed + 11);
  return (u, v) => {
    const dx = u - 0.5; const dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const a = Math.atan2(dy, dx);
    const wob = fbm(n1, u * 5, v * 5, 2) * 7;
    const rings = 0.5 + 0.5 * Math.sin(r * 58 + wob + a * 1.2);
    const t = Math.pow(rings, 1.6) * 0.5 + (fbm(n2, u * 42, v * 42, 2) - 0.5) * 0.16;
    const c = mix3(base, dark, clamp01(t));
    let crack = 0;
    for (let i = 0; i < 3; i++) {
      const ca = 0.65 + i * 2.15;
      const da = Math.abs(Math.sin(a - ca));
      if (da < 0.022 && r > 0.14) crack = Math.max(crack, 1 - da / 0.022);
    }
    const pith = r < 0.055 ? 1 - r / 0.055 : 0;
    const grain = fbm(n3, u * 90, v * 90, 2) - 0.5;
    return toPixel(c, 140 + rings * 34 + grain * 18 - crack * 80 - pith * 40, 1 - crack * 0.34 - pith * 0.22);
  };
}

function clothPaint(seed: number, base: RGB, dark: RGB, weaveFreq: number): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 3);
  const n3 = makeNoise(seed + 9);
  return (u, v) => {
    const weave =
      (Math.sin(u * weaveFreq * TAU) * 0.5 + 0.5) * (Math.sin(v * weaveFreq * TAU) * 0.5 + 0.5);
    const slub = fbm(n3, u * 110, v * 110, 2) - 0.5;
    const mottle = fbm(n1, u * 4.5, v * 3.2, 3) - 0.5;
    const fold = smoothstep(0.54, 0.86, fbm(n2, u * 7 + 3, v * 2.6, 2));
    const t = clamp01(0.14 + slub * 0.3 + weave * 0.18 + mottle * 0.36 + fold * 0.4);
    return toPixel(mix3(base, dark, t), 120 + weave * 52 + slub * 46 + fold * 34);
  };
}

function leatherPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 4);
  return (u, v) => {
    const grain = fbm(n1, u * 160, v * 160, 2) - 0.5;
    const pore = Math.abs(Math.sin(u * 620) * Math.sin(v * 680));
    const crease = Math.max(0, fbm(n2, u * 11, v * 7, 2) - 0.62) * 2.4;
    const t = clamp01(0.2 + grain * 0.35 + pore * 0.12 + crease * 0.5);
    return toPixel(mix3(base, dark, t), 120 + grain * 50 + pore * 30 - crease * 30);
  };
}

function canvasPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 8);
  return (u, v) => {
    const weave =
      (Math.sin(u * 150 * TAU) * 0.5 + 0.5) * (Math.sin(v * 150 * TAU) * 0.5 + 0.5);
    const mottle = fbm(n1, u * 5, v * 4, 3) - 0.5;
    const stain = smoothstep(0.58, 0.78, fbm(n2, u * 3 + 7, v * 2.4, 3));
    const t = clamp01(0.16 + weave * 0.22 + mottle * 0.4 + stain * 0.4);
    return toPixel(mix3(base, dark, t), 118 + weave * 60 + mottle * 30 - stain * 22);
  };
}

function metalPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 6);
  return (u, v) => {
    const brush = Math.sin(u * 900 + fbm(n1, u * 6, v * 3, 2) * 4) * 0.5 + 0.5;
    const scratch = smoothstep(0.62, 0.9, fbm(n2, u * 24, v * 3.5, 2));
    const t = clamp01(0.2 + brush * 0.24 + scratch * 0.5);
    return toPixel(mix3(base, dark, t), 126 + brush * 20 - scratch * 26);
  };
}

function glassPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  return (u, v) => {
    const band = Math.exp(-Math.pow((u - 0.3) / 0.045, 2));
    const t = clamp01(0.25 + (fbm(n1, u * 4, v * 4, 2) - 0.5) * 0.3 - band * 0.35);
    return toPixel(mix3(base, dark, t), 118 + band * 40);
  };
}

function ropePaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  return (u, v) => {
    const braid = 0.5 + 0.5 * Math.sin((u * 2 + v * 13) * TAU);
    const braid2 = 0.5 + 0.5 * Math.sin((u * 2 - v * 13) * TAU);
    const t = clamp01(0.2 + braid * braid2 * 0.5 + (fbm(n1, u * 30, v * 30, 2) - 0.5) * 0.2);
    return toPixel(mix3(base, dark, t), 110 + braid * braid2 * 70);
  };
}

// (painters section above)
// ---------------------------------------------------------------- atlas

const CELL = {
  wood:    { x: 0,    y: 0,   size: 768 },
  woodEnd: { x: 768,  y: 0,   size: 512 },
  cloth:   { x: 1280, y: 0,   size: 512 },
  scarf:   { x: 1792, y: 0,   size: 256 },
  leather: { x: 0,    y: 768, size: 512 },
  canvas:  { x: 512,  y: 768, size: 512 },
  metal:   { x: 1024, y: 768, size: 256 },
  glass:   { x: 1280, y: 768, size: 256 },
  rope:    { x: 1536, y: 768, size: 256 },
  dark:    { x: 1792, y: 768, size: 256 },
} as const;
type CellName = keyof typeof CELL;

const CELL_RM: Record<CellName, readonly [number, number]> = {
  wood:    [0.62, 0],
  woodEnd: [0.68, 0],
  cloth:   [0.93, 0],
  scarf:   [0.90, 0],
  leather: [0.56, 0],
  canvas:  [0.95, 0],
  metal:   [0.40, 1],
  glass:   [0.14, 0],
  rope:    [0.86, 0],
  dark:    [0.95, 0],
};

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

function texOf(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintCell(size: number, paint: Paint) {
  const [color, cc] = makeCanvas(size);
  const [height, hc] = makeCanvas(size);
  const cimg = cc.createImageData(size, size);
  const himg = hc.createImageData(size, size);
  const cd = cimg.data; const hd = himg.data;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const p = paint((x + 0.5) / size, v);
      const i = (y * size + x) * 4;
      cd[i] = p.r; cd[i + 1] = p.g; cd[i + 2] = p.b; cd[i + 3] = 255;
      hd[i] = p.h; hd[i + 1] = p.h; hd[i + 2] = p.h; hd[i + 3] = 255;
    }
  }
  cc.putImageData(cimg, 0, 0);
  hc.putImageData(himg, 0, 0);
  return { color, height };
}

function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, size, size).data;
  const [canvas, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const sample = (x: number, y: number) => {
    const sx = ((x % size) + size) % size;
    const sy = ((y % size) + size) % size;
    return src[(sy * size + sx) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = sample(x + 1, y) - sample(x - 1, y);
      const dy = sample(x, y + 1) - sample(x, y - 1);
      const nx = -dx * strength; const ny = dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i]     = (nx / len) * 0.5 * 255 + 127.5;
      img.data[i + 1] = (ny / len) * 0.5 * 255 + 127.5;
      img.data[i + 2] = (1  / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function buildAtlas() {
  const [colorC, colorX] = makeCanvas(ATLAS);
  const [heightC, heightX] = makeCanvas(AUX);
  const [rmC, rmX] = makeCanvas(AUX);

  const builders: Record<CellName, () => { color: HTMLCanvasElement; height: HTMLCanvasElement }> = {
    wood:    () => paintCell(CELL.wood.size,    woodPaint(SEED + 1, [216, 196, 166], [172, 145, 112])),
    woodEnd: () => paintCell(CELL.woodEnd.size, woodEndPaint(SEED + 2, [212, 190, 158], [166, 138, 106])),
    cloth:   () => paintCell(CELL.cloth.size,   clothPaint(SEED + 3, [152, 149, 142], [110, 106, 98], 170)),
    scarf:   () => paintCell(CELL.scarf.size,   clothPaint(SEED + 4, [156, 48, 40], [104, 28, 24], 84)),
    leather: () => paintCell(CELL.leather.size, leatherPaint(SEED + 5, [118, 86, 60], [78, 52, 36])),
    canvas:  () => paintCell(CELL.canvas.size,  canvasPaint(SEED + 6, [124, 110, 90], [86, 74, 58])),
    metal:   () => paintCell(CELL.metal.size,   metalPaint(SEED + 7, [134, 129, 120], [86, 82, 76])),
    glass:   () => paintCell(CELL.glass.size,   glassPaint(SEED + 8, [50, 70, 56], [22, 32, 25])),
    rope:    () => paintCell(CELL.rope.size,    ropePaint(SEED + 9, [192, 168, 126], [140, 114, 78])),
    dark:    () => paintCell(CELL.dark.size,    clothPaint(SEED + 10, [62, 58, 52], [34, 31, 28], 220)),
  };

  for (const name of Object.keys(CELL) as CellName[]) {
    const cell = CELL[name];
    const maps = builders[name]();
    colorX.drawImage(maps.color, cell.x, cell.y);
    heightX.drawImage(maps.height, cell.x / 2, cell.y / 2, cell.size / 2, cell.size / 2);
    const [rough, metal] = CELL_RM[name];
    rmX.fillStyle = `rgb(128, ${Math.round(rough * 255)}, ${Math.round(metal * 255)})`;
    rmX.fillRect(cell.x / 2, cell.y / 2, cell.size / 2, cell.size / 2);
  }

  return {
    map: texOf(colorC, true),
    rm: texOf(rmC, false),
    normalMap: texOf(normalFromHeight(heightC, 2.2), false),
  };
}

let cache: { atlas: THREE.MeshStandardMaterial } | null = null;

function materials() {
  if (cache) return cache;
  const atlas = buildAtlas();
  cache = {
    atlas: new THREE.MeshStandardMaterial({
      map: atlas.map,
      roughnessMap: atlas.rm,
      metalnessMap: atlas.rm,
      normalMap: atlas.normalMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 1,
      side: THREE.DoubleSide,
    }),
  };
  return cache;
}

// (atlas section above)
// ---------------------------------------------------------------- primitives

function uvRect(name: CellName) {
  const cell = CELL[name];
  const pad = 6;
  return {
    u0: (cell.x + pad) / ATLAS,
    u1: (cell.x + cell.size - pad) / ATLAS,
    v0: 1 - (cell.y + cell.size - pad) / ATLAS,
    v1: 1 - (cell.y + pad) / ATLAS,
  };
}

type MapOptions = { swap?: boolean; repeat?: readonly [number, number] };

function mapCell(geo: THREE.BufferGeometry, name: CellName, o: MapOptions = {}): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return geo;
  const { u0, u1, v0, v1 } = uvRect(name);
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i); let v = uv.getY(i);
    if (o.swap) { const t = u; u = v; v = t; }
    if (o.repeat) {
      u = (((u * o.repeat[0]) % 1) + 1) % 1;
      v = (((v * o.repeat[1]) % 1) + 1) % 1;
    }
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

function place(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

function box(w: number, h: number, d: number, cell: CellName, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  mapCell(geo, cell);
  return place(geo, x, y, z, rx, ry, rz);
}

function lathe(profile: Array<readonly [number, number]>, cell: CellName, segments = 20, swap = false): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0002), y));
  const geo = new THREE.LatheGeometry(pts, segments);
  mapCell(geo, cell, { swap });
  return geo;
}

/** 绕 Z 轴回转、平面 UV（端面年轮）。profile 半径必须单调递增。 */
function revolvePlanar(profile: Array<readonly [number, number]>, cell: CellName, radius: number, segments = 64): THREE.BufferGeometry {
  const cols = segments + 1;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (const [r, z] of profile) {
    for (let j = 0; j < cols; j++) {
      const a = (j / segments) * TAU;
      const x = Math.cos(a) * r; const y = Math.sin(a) * r;
      pos.push(x, y, z);
      uvs.push(0.5 + x / (2 * radius), 0.5 + y / (2 * radius));
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j; const b = a + 1; const c = a + cols; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute;
  const dir = profile[profile.length - 1][1] >= profile[0][1] ? -1 : 1;
  for (let i = 0; i < normal.count; i++) {
    if (Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) < 0.1) {
      normal.setXYZ(i, 0, 0, dir);
    }
  }
  normal.needsUpdate = true;
  mapCell(geo, cell);
  return geo;
}

type LoftRow = { y: number; rx: number; rz: number; n?: number; z?: number };
type LoftOptions = { radial?: number; fold?: number; cell?: CellName };

/** 沿 Y 轴放样超椭圆截面。无破边。 */
function loftY(rows: LoftRow[], o: LoftOptions = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 48;
  const fold = o.fold ?? 0;
  const cell = o.cell ?? 'cloth';
  const noise = makeNoise(SEED + 91);
  const cols = radial + 1;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a); const sz = Math.sin(a);
      const n = row.n ?? 2.2;
      const sx = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / n);
      const szn = Math.sign(sz) * Math.pow(Math.abs(sz), 2 / n);
      let wobble = 0;
      if (fold > 0) {
        wobble = fold * (fbm(noise, cx * 2.3 + 5, sz * 2.3 + row.y * 5.5, 2) - 0.5) * 2;
        wobble += fold * 0.28 * Math.sin(a * 9 + row.y * 6.5);
      }
      const rx = Math.max(0.004, row.rx + wobble);
      const rz = Math.max(0.004, row.rz + wobble * 0.65);
      pos.push(sx * rx, row.y, szn * rz + (row.z ?? 0));
      uvs.push(j / radial, i / (rows.length - 1));
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j; const b = a + 1; const c = a + cols; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mapCell(geo, cell);
}

/** 沿 X 轴放样圆管（袖筒）。 */
function loftX(rows: Array<{ x: number; r: number }>, cell: CellName, radial = 28): THREE.BufferGeometry {
  const cols = radial + 1;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * TAU;
      pos.push(row.x, Math.cos(a) * row.r, Math.sin(a) * row.r);
      uvs.push(i / (rows.length - 1), j / radial);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j; const b = a + 1; const c = a + cols; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mapCell(geo, cell);
}

type SweepOptions = { radial?: number; closed?: boolean; cell?: CellName };

/** 沿三维路径扫掠椭圆截面。 */
function sweep(points: THREE.Vector3[], radius: (t: number) => readonly [number, number], o: SweepOptions = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 10;
  const closed = o.closed ?? false;
  const cell = o.cell ?? 'leather';
  const cols = radial + 1;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const tangent = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[closed ? (i - 1 + points.length) % points.length : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % points.length : Math.min(points.length - 1, i + 1)];
    tangent.subVectors(next, prev).normalize();
    if (Math.abs(tangent.y) > 0.92) ref.set(0, 0, 1); else ref.set(0, 1, 0);
    side.crossVectors(ref, tangent).normalize();
    up.crossVectors(tangent, side).normalize();
    const t = closed ? i / points.length : i / (points.length - 1);
    const [rx, rz] = radius(t);
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a) * rx; const s = Math.sin(a) * rz;
      pos.push(p.x + side.x * c + up.x * s, p.y + side.y * c + up.y * s, p.z + side.z * c + up.z * s);
      uvs.push(j / radial, t);
    }
  }
  const segs = closed ? points.length : points.length - 1;
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % points.length;
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j; const b = a + 1; const c = i2 * cols + j; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mapCell(geo, cell);
}

function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(list, false)!;
}

function ball(x: number, y: number, z: number, r: number, cell: CellName = 'wood', seg = 12): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.6)));
  mapCell(geo, cell);
  return place(geo, x, y, z);
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, cell: CellName = 'wood', segments = 6): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r, r, len, segments, 1, false);
  mapCell(geo, cell);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geo;
}

/** 带赤道凹槽的木球关节。 */
function jointBallProfile(r: number): Array<readonly [number, number]> {
  return [
    [0.0002, -r],
    [0.5 * r,  -0.86 * r],
    [0.96 * r, -0.2 * r],
    [r,        -0.06 * r],
    [0.9 * r,   0],
    [r,         0.09 * r],
    [0.95 * r,  0.3 * r],
    [0.48 * r,  0.86 * r],
    [0.0002,    r],
  ];
}

function jointBall(r: number, segments = 14): THREE.BufferGeometry {
  return lathe(jointBallProfile(r), 'wood', segments);
}

function mirrorX(geo: THREE.BufferGeometry, sign: number): THREE.BufferGeometry {
  if (sign < 0) geo.rotateY(Math.PI);
  return geo;
}

// (primitives section above)
// ---------------------------------------------------------------- head

/** 头盘：半径 0.23（直径 0.46 ≈ 肩宽 1.3 倍），中心 y=1.47，厚度 0.15。 */
const HEAD = {
  radius: 0.23,
  centerY: 1.47,
  halfThick: 0.075,
} as const;

function headGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 侧缘：木纹沿圆周（UV 交换）
  const rim = lathe(
    [
      [HEAD.radius - 0.005, -HEAD.halfThick],
      [HEAD.radius,         -HEAD.halfThick + 0.018],
      [HEAD.radius + 0.002,  0],
      [HEAD.radius,          HEAD.halfThick - 0.018],
      [HEAD.radius - 0.005,  HEAD.halfThick],
    ],
    'wood',
    36,
    true,
  );
  place(rim, 0, 0, 0, Math.PI / 2, 0, 0);
  rim.translate(0, HEAD.centerY, 0);
  parts.push(rim);

  // 正面（-Z）：中央凸台 + 一道同心刻槽 + 浅弧边
  const front = revolvePlanar(
    [
      [0.0,                  -HEAD.halfThick - 0.022],
      [0.05,                 -HEAD.halfThick - 0.022],
      [0.085,                -HEAD.halfThick - 0.020],
      [0.100,                -HEAD.halfThick - 0.014],
      [0.110,                -HEAD.halfThick - 0.006],
      [0.118,                -HEAD.halfThick - 0.006],
      [0.124,                -HEAD.halfThick - 0.014],
      [0.150,                -HEAD.halfThick - 0.012],
      [0.180,                -HEAD.halfThick - 0.008],
      [0.205,                -HEAD.halfThick - 0.002],
      [HEAD.radius - 0.005,  -HEAD.halfThick + 0.002],
    ],
    'woodEnd',
    HEAD.radius,
    36,
  );
  front.translate(0, HEAD.centerY, 0);
  parts.push(front);

  // 背面（+Z）：浅碗形
  const back = revolvePlanar(
    [
      [0.0,                  HEAD.halfThick + 0.008],
      [0.06,                 HEAD.halfThick + 0.008],
      [0.12,                 HEAD.halfThick + 0.004],
      [0.18,                 HEAD.halfThick - 0.002],
      [HEAD.radius - 0.005,  HEAD.halfThick - 0.006],
    ],
    'woodEnd',
    HEAD.radius,
    28,
  );
  back.translate(0, HEAD.centerY, 0);
  parts.push(back);

  // 卷须（comma）：起点在头盘顶部，朝角色左前方（-X 偏 -Z）伸出，末端上翘
  const topY = HEAD.centerY + HEAD.radius;
  const sproutPts = [
    new THREE.Vector3(-0.005, topY + 0.002, -0.005),
    new THREE.Vector3(-0.022, topY + 0.038, -0.018),
    new THREE.Vector3(-0.046, topY + 0.072, -0.030),
    new THREE.Vector3(-0.072, topY + 0.090, -0.040),
    new THREE.Vector3(-0.092, topY + 0.082, -0.046),
    new THREE.Vector3(-0.098, topY + 0.058, -0.046),
    new THREE.Vector3(-0.090, topY + 0.040, -0.040),
  ];
  const sprout = sweep(
    sproutPts,
    (t) => {
      const r = 0.019 * (1 - t) + 0.004;
      return [r, r];
    },
    { radial: 8, cell: 'wood' },
  );
  parts.push(sprout);

  // headGeometry 内部按世界坐标写（head_joint 在 y=1.24），导出前平移到关节局部空间
  return merged(parts).translate(0, -1.240, 0);
}

// ---------------------------------------------------------------- arms
// T-pose：肩 → 肘 → 腕 → 指尖均沿 ±X 方向，掌心向下。
// 肩距中线 ±0.18，上臂 0.30，前臂 0.25，手 0.17，臂展 1.80。

const ARM = {
  shoulderX: 0.18,
  shoulderY: 1.22,
  upperLen: 0.30,
  foreLen: 0.25,
} as const;

function upperArmGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(ball(0, 0, 0, 0.046, 'wood', 10));

  // 上臂木杆（沿 +X 延伸 0.30）
  const arm = lathe(
    [
      [0.0002, 0.0],
      [0.032,  0.010],
      [0.030,  0.140],
      [0.034,  0.240],
      [0.034,  0.258],
      [0.030,  0.272],
      [0.0002, ARM.upperLen],
    ],
    'wood',
    10,
  );
  place(arm, 0, 0, 0, 0, 0, -Math.PI / 2);
  parts.push(arm);

  // 灰布短袖（覆盖肩到上臂中后段），平口无破边
  const sleeve = loftX(
    [
      { x: 0.060, r: 0.060 },
      { x: 0.140, r: 0.068 },
      { x: 0.220, r: 0.074 },
      { x: 0.280, r: 0.072 },
    ],
    'cloth',
    18,
  );
  parts.push(sleeve);

  return mirrorX(merged(parts), sign);
}

function forearmGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const elbow = jointBall(0.040, 12);
  place(elbow, 0, 0, 0, 0, 0, -Math.PI / 2);
  parts.push(elbow);

  const fore = lathe(
    [
      [0.0002, 0.020],
      [0.030,  0.034],
      [0.028,  0.130],
      [0.034,  0.220],
      [0.034,  0.232],
      [0.027,  0.240],
      [0.0002, ARM.foreLen],
    ],
    'wood',
    10,
  );
  place(fore, 0, 0, 0, 0, 0, -Math.PI / 2);
  parts.push(fore);

  return mirrorX(merged(parts), sign);
}

function handGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(ball(0, 0, 0, 0.026, 'wood', 8));

  // 手掌：扁盒，掌心向下
  parts.push(box(0.075, 0.026, 0.080, 'wood', sign * 0.055, 0, 0));

  // 四指：每指 2 节（木偶指节），T-pose 指尖齐平
  const fingers = [
    { z: 0.028, len: 0.072 },
    { z: 0.009, len: 0.080 },
    { z: -0.009, len: 0.078 },
    { z: -0.028, len: 0.062 },
  ];
  for (const f of fingers) {
    let x = sign * 0.085;
    const seg = f.len / 2;
    for (let s = 0; s < 2; s++) {
      const nx = x + sign * seg;
      parts.push(rod(new THREE.Vector3(x, 0, f.z), new THREE.Vector3(nx, 0, f.z), 0.007, 'wood', 5));
      parts.push(ball(nx, 0, f.z, 0.008, 'wood', 6));
      x = nx;
    }
  }

  // 拇指（2 节，前侧 -Z 方向伸出）
  const t0 = new THREE.Vector3(sign * 0.038, 0.0, -0.032);
  const t1 = new THREE.Vector3(sign * 0.060, 0.0, -0.062);
  const t2 = new THREE.Vector3(sign * 0.078, 0.0, -0.088);
  parts.push(rod(t0, t1, 0.0085, 'wood', 5));
  parts.push(ball(t1.x, t1.y, t1.z, 0.0098, 'wood', 6));
  parts.push(rod(t1, t2, 0.0078, 'wood', 5));
  parts.push(ball(t2.x, t2.y, t2.z, 0.0085, 'wood', 6));

  return merged(parts);
}

// ---------------------------------------------------------------- legs
// 髋 y=0.90 / 膝 y=0.46 / 踝 y=0.08 / 脚底 y=0

function thighGeometry(): THREE.BufferGeometry {
  return lathe(
    [
      [0.0002, -0.442],
      [0.030,  -0.432],
      [0.032,  -0.400],
      [0.032,  -0.060],
      [0.048,  -0.012],
      [0.050,   0.004],
      [0.030,   0.026],
      [0.0002,  0.030],
    ],
    'wood',
    12,
  );
}

function shinGeometry(): THREE.BufferGeometry {
  return lathe(
    [
      [0.0002, -0.382],
      [0.028,  -0.372],
      [0.030,  -0.352],
      [0.030,  -0.060],
      [0.044,  -0.008],
      [0.046,   0.006],
      [0.028,   0.026],
      [0.0002,  0.030],
    ],
    'wood',
    12,
  );
}

function footGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(ball(0, 0, 0, 0.030, 'wood', 10));
  // 木鞋：前掌 + 后跟 + 鞋底
  parts.push(box(0.080, 0.050, 0.10, 'wood', 0, -0.042, -0.030));
  parts.push(box(0.072, 0.050, 0.065, 'wood', 0, -0.042, 0.045));
  parts.push(box(0.092, 0.022, 0.220, 'wood', 0, -0.068, 0.0));

  // 脚趾（5 颗小方块）
  const toes = [-0.030, -0.015, 0.0, 0.015, 0.030];
  for (const tx of toes) {
    parts.push(box(0.013, 0.020, 0.026, 'wood', tx, -0.040, -0.088));
  }

  // 脚背皮带
  parts.push(
    sweep(
      [
        new THREE.Vector3(sign * -0.046, -0.020, -0.020),
        new THREE.Vector3(sign * -0.018, -0.012, -0.024),
        new THREE.Vector3(0,            -0.008, -0.026),
        new THREE.Vector3(sign * 0.018, -0.012, -0.024),
        new THREE.Vector3(sign * 0.046, -0.020, -0.020),
      ],
      () => [0.013, 0.005],
      { radial: 8, cell: 'leather' },
    ),
  );
  // 踝箍
  const anklet = new THREE.TorusGeometry(0.032, 0.004, 5, 14);
  mapCell(anklet, 'leather');
  place(anklet, 0, -0.002, 0, Math.PI / 2, 0, 0);
  parts.push(anklet);

  return merged(parts);
}

// ---------------------------------------------------------------- body（躯干 / 服装 / 背包）

function buckle(x: number, y: number, z: number, w = 0.034, h = 0.026): THREE.BufferGeometry {
  const t = 0.0045; const d = 0.005;
  return merged([
    box(w, t, d, 'metal', x, y + h / 2, z),
    box(w, t, d, 'metal', x, y - h / 2, z),
    box(t, h, d, 'metal', x - w / 2, y, z),
    box(t, h, d, 'metal', x + w / 2, y, z),
    box(0.0035, h * 0.78, 0.0028, 'metal', x, y, z + 0.0015),
  ]);
}

function bodyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 木脖子
  parts.push(
    lathe(
      [
        [0.024, 1.175],
        [0.034, 1.200],
        [0.030, 1.216],
        [0.030, 1.245],
      ],
      'wood',
      12,
    ),
  );

  // 灰布长衫：肩 → 束腰 → 直筒下摆（平直，无破边）
  // 下摆 y=0.50，膝盖 0.46 露出下方小腿
  const tunic = loftY(
    [
      { y: 1.218, rx: 0.060, rz: 0.052 },
      { y: 1.200, rx: 0.110, rz: 0.082 },
      { y: 1.160, rx: 0.170, rz: 0.108 },
      { y: 1.080, rx: 0.176, rz: 0.112 },
      { y: 0.960, rx: 0.162, rz: 0.102 },
      { y: 0.880, rx: 0.150, rz: 0.094 },
      { y: 0.760, rx: 0.164, rz: 0.104 },
      { y: 0.620, rx: 0.180, rz: 0.114 },
      { y: 0.500, rx: 0.188, rz: 0.120 },
    ],
    { radial: 28, fold: 0.005, cell: 'cloth' },
  );
  parts.push(tunic);

  // 单圈腰带
  const belt = new THREE.TorusGeometry(0.158, 0.014, 5, 32);
  mapCell(belt, 'leather');
  belt.scale(1, 0.62, 1);
  place(belt, 0, 0.880, 0, Math.PI / 2, 0, 0);
  parts.push(belt);

  // 腰带结 + 垂尾 + 金属尾片（角色左侧）
  parts.push(box(0.052, 0.038, 0.022, 'leather', -0.104, 0.872, -0.092, 0, 0, 0.18));
  parts.push(box(0.022, 0.072, 0.018, 'leather', -0.126, 0.834, -0.088, 0, 0, 0.3));
  const beltTail = sweep(
    [
      new THREE.Vector3(-0.118, 0.862, -0.098),
      new THREE.Vector3(-0.128, 0.795, -0.112),
      new THREE.Vector3(-0.140, 0.712, -0.117),
      new THREE.Vector3(-0.147, 0.640, -0.112),
    ],
    (t) => [0.026 + t * 0.005, 0.006],
    { radial: 8, cell: 'leather' },
  );
  parts.push(beltTail);
  parts.push(box(0.032, 0.020, 0.012, 'metal', -0.148, 0.628, -0.112));

  // 红围巾：颈圈（绕脖一圈）
  const collarPts: THREE.Vector3[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    collarPts.push(new THREE.Vector3(Math.cos(a) * 0.100, 1.192 + Math.sin(a * 3) * 0.006, Math.sin(a) * 0.088));
  }
  parts.push(
    sweep(collarPts, () => [0.034, 0.030], {
      radial: 8, closed: true, cell: 'scarf',
    }),
  );

  // 左肩前披片：从左颈肩披到左胸前（背部不做披片，三视图背面无红）
  const shoulderDrape = sweep(
    [
      new THREE.Vector3(-0.040, 1.218, -0.020),
      new THREE.Vector3(-0.080, 1.208, -0.058),
      new THREE.Vector3(-0.110, 1.185, -0.098),
      new THREE.Vector3(-0.132, 1.150, -0.122),
      new THREE.Vector3(-0.142, 1.108, -0.132),
    ],
    (t) => [0.052 + t * 0.020, 0.007],
    { radial: 8, cell: 'scarf' },
  );
  parts.push(shoulderDrape);

  // 左胸垂尾：从颈前向左胯垂下
  const scarfTail = sweep(
    [
      new THREE.Vector3(-0.058, 1.170, -0.092),
      new THREE.Vector3(-0.080, 1.100, -0.118),
      new THREE.Vector3(-0.102, 1.020, -0.132),
      new THREE.Vector3(-0.120, 0.940, -0.134),
      new THREE.Vector3(-0.132, 0.872, -0.124),
      new THREE.Vector3(-0.136, 0.820, -0.114),
    ],
    (t) => {
      const half = t < 0.85 ? 0.038 + t * 0.030 : 0.068 - (t - 0.85) * 0.4;
      return [half, 0.0065];
    },
    { radial: 8, cell: 'scarf' },
  );
  parts.push(scarfTail);

  // ---------------------------------------------------------------- 背包
  // 主包：背后大方包，y 0.86 ~ 1.20，z 中心 +0.20
  const pack = loftY(
    [
      { y: 1.200, rx: 0.100, rz: 0.050, n: 2.6, z: 0.200 },
      { y: 1.190, rx: 0.132, rz: 0.063, n: 2.6, z: 0.200 },
      { y: 1.160, rx: 0.150, rz: 0.074, n: 2.5, z: 0.200 },
      { y: 0.960, rx: 0.156, rz: 0.080, n: 2.4, z: 0.200 },
      { y: 0.900, rx: 0.148, rz: 0.074, n: 2.4, z: 0.200 },
      { y: 0.860, rx: 0.098, rz: 0.045, n: 2.6, z: 0.200 },
    ],
    { radial: 28, cell: 'canvas' },
  );
  parts.push(pack);

  // 顶盖
  parts.push(
    sweep(
      [
        new THREE.Vector3(0, 1.198, 0.140),
        new THREE.Vector3(0, 1.224, 0.180),
        new THREE.Vector3(0, 1.230, 0.222),
        new THREE.Vector3(0, 1.198, 0.262),
        new THREE.Vector3(0, 1.140, 0.278),
        new THREE.Vector3(0, 1.005, 0.268),
      ],
      (t) => [0.132 + Math.sin(t * Math.PI) * 0.008, 0.007],
      { radial: 10, cell: 'canvas' },
    ),
  );

  // 顶盖两条皮革扣带 + 金属扣
  for (const sx of [-1, 1]) {
    parts.push(
      sweep(
        [
          new THREE.Vector3(sx * 0.075, 1.200, 0.148),
          new THREE.Vector3(sx * 0.075, 1.230, 0.198),
          new THREE.Vector3(sx * 0.075, 1.222, 0.240),
          new THREE.Vector3(sx * 0.075, 1.150, 0.285),
          new THREE.Vector3(sx * 0.075, 1.050, 0.293),
          new THREE.Vector3(sx * 0.075, 0.968, 0.280),
        ],
        () => [0.017, 0.005],
        { radial: 6, cell: 'leather' },
      ),
    );
    parts.push(buckle(sx * 0.075, 1.045, 0.300, 0.032, 0.024));
  }

  // 铺盖卷：横向（沿 X），直径 0.16，长 0.42，放在背包顶部后方
  const rollY = 1.245;
  const rollZ = 0.205;
  const roll = new THREE.CylinderGeometry(0.078, 0.078, 0.42, 18, 1, false);
  mapCell(roll, 'canvas');
  place(roll, 0, rollY, rollZ, 0, 0, Math.PI / 2);
  parts.push(roll);

  // 皮箍两道（在卷两端 1/3 处）
  for (const sx of [-1, 1]) {
    const hoop = new THREE.TorusGeometry(0.080, 0.006, 4, 14);
    mapCell(hoop, 'leather');
    place(hoop, sx * 0.13, rollY, rollZ, 0, Math.PI / 2, 0);
    parts.push(hoop);
  }

  // 端面螺旋（帆布卷纹）
  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = t * TAU * 2.4;
      const r = 0.008 + t * 0.064;
      pts.push(new THREE.Vector3(sx * 0.211, rollY + Math.cos(a) * r, rollZ + Math.sin(a) * r));
    }
    parts.push(sweep(pts, () => [0.0055, 0.0055], { radial: 4, cell: 'rope' }));
  }

  // 背包正面下方两个并排长袋（三视图背面可见）
  for (const sx of [-1, 1]) {
    parts.push(box(0.100, 0.110, 0.045, 'canvas', sx * 0.070, 0.930, 0.278));
    // 袋盖
    parts.push(box(0.104, 0.030, 0.048, 'canvas', sx * 0.070, 0.985, 0.276));
    // 袋扣皮条 + 金属扣
    parts.push(box(0.018, 0.060, 0.010, 'leather', sx * 0.070, 0.960, 0.302));
    parts.push(buckle(sx * 0.070, 0.932, 0.308, 0.022, 0.018));
  }

  // 背包左侧袋（角色左）
  parts.push(box(0.050, 0.120, 0.095, 'canvas', -0.170, 0.955, 0.200));
  parts.push(box(0.054, 0.028, 0.100, 'canvas', -0.170, 1.015, 0.198));
  parts.push(box(0.012, 0.070, 0.022, 'leather', -0.198, 0.995, 0.240));
  parts.push(box(0.020, 0.012, 0.014, 'metal', -0.198, 0.968, 0.246));

  // 水壶（角色右侧，与侧袋对称位置）
  const bx = 0.192;
  const by = 0.960;
  const bz = 0.200;
  const bottleBody = new THREE.CylinderGeometry(0.026, 0.026, 0.115, 12, 1, false);
  mapCell(bottleBody, 'glass');
  parts.push(place(bottleBody, bx, by, bz));
  const bottleShoulder = new THREE.CylinderGeometry(0.013, 0.026, 0.030, 12, 1, false);
  mapCell(bottleShoulder, 'glass');
  parts.push(place(bottleShoulder, bx, by + 0.072, bz));
  const bottleNeck = new THREE.CylinderGeometry(0.011, 0.011, 0.030, 10, 1, false);
  mapCell(bottleNeck, 'glass');
  parts.push(place(bottleNeck, bx, by + 0.102, bz));
  const cork = new THREE.CylinderGeometry(0.0125, 0.0115, 0.018, 10, 1, false);
  mapCell(cork, 'wood');
  parts.push(place(cork, bx, by + 0.126, bz));
  // 水壶皮套环
  const bottleHoop = new THREE.TorusGeometry(0.030, 0.004, 5, 12);
  mapCell(bottleHoop, 'leather');
  place(bottleHoop, bx, by - 0.020, bz, Math.PI / 2, 0, 0);
  parts.push(bottleHoop);

  // 肩带（从包顶绕过肩到胸前，皮革）
  for (const sx of [-1, 1]) {
    parts.push(
      sweep(
        [
          new THREE.Vector3(sx * 0.100, 1.195, 0.170),
          new THREE.Vector3(sx * 0.118, 1.240, 0.060),
          new THREE.Vector3(sx * 0.120, 1.228, -0.030),
          new THREE.Vector3(sx * 0.110, 1.130, -0.110),
          new THREE.Vector3(sx * 0.102, 1.020, -0.120),
          new THREE.Vector3(sx * 0.100, 0.940, -0.114),
        ],
        () => [0.018, 0.0055],
        { radial: 6, cell: 'leather' },
      ),
    );
    parts.push(buckle(sx * 0.102, 1.005, -0.128, 0.028, 0.022));
  }

  return merged(parts);
}

// (parts section above)
// ---------------------------------------------------------------- assembly

export function createCharComma(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'char_comma';
  const mat = materials().atlas;

  const addMesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, name: string) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  };

  addMesh(root, bodyGeometry(), 'char_comma_body');

  const head = new THREE.Object3D();
  head.name = 'head_joint';
  head.position.set(0, 1.240, 0);
  root.add(head);
  addMesh(head, headGeometry(), 'char_comma_head');

  for (const sign of [1, -1]) {
    const side = sign > 0 ? 'r' : 'l';
    const shoulder = new THREE.Object3D();
    shoulder.name = `shoulder_${side}`;
    shoulder.position.set(sign * ARM.shoulderX, ARM.shoulderY, 0);
    root.add(shoulder);
    addMesh(shoulder, upperArmGeometry(sign), `char_comma_upper_arm_${side}`);

    const elbow = new THREE.Object3D();
    elbow.name = `elbow_${side}`;
    elbow.position.set(sign * ARM.upperLen, 0, 0);
    shoulder.add(elbow);
    addMesh(elbow, forearmGeometry(sign), `char_comma_forearm_${side}`);

    const wrist = new THREE.Object3D();
    wrist.name = `wrist_${side}`;
    wrist.position.set(sign * ARM.foreLen, 0, 0);
    elbow.add(wrist);
    addMesh(wrist, handGeometry(sign), `char_comma_hand_${side}`);
  }

  for (const sign of [1, -1]) {
    const side = sign > 0 ? 'r' : 'l';
    const hip = new THREE.Object3D();
    hip.name = `hip_${side}`;
    hip.position.set(sign * 0.080, 0.900, 0);
    root.add(hip);
    addMesh(hip, thighGeometry(), `char_comma_thigh_${side}`);

    const knee = new THREE.Object3D();
    knee.name = `knee_${side}`;
    knee.position.set(0, -0.440, 0);
    hip.add(knee);
    addMesh(knee, shinGeometry(), `char_comma_shin_${side}`);

    const ankle = new THREE.Object3D();
    ankle.name = `ankle_${side}`;
    ankle.position.set(0, -0.380, 0);
    knee.add(ankle);
    addMesh(ankle, footGeometry(sign), `char_comma_foot_${side}`);
  }

  return root;
}

