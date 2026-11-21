import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * TheFarField 角色原型 comma（参考 TheFarField/char_comma/IMG_comma_3.jpeg）。
 * 木偶玩具风格：圆盘木头脑 + 顶部卷须、细木关节四肢、灰布束腰长衫、
 * 红围巾、双圈皮带、帆布背包（铺盖卷 + 水壶）。
 *
 * 契约：
 *   - 根节点 char_comma，脚底 y = 0，面朝 -Z，总高 1.80 m（含头顶卷须）；
 *   - 关节节点：head_joint / shoulder_l|r / elbow_l|r / wrist_l|r /
 *     hip_l|r / knee_l|r / ankle_l|r，均为 Object3D 枢轴，网格挂在其下；
 *   - 贴图：2048 颜色图集；1024 粗糙度(G) + 金属度(B) 共用图集；1024 法线；
 *   - 单一 MeshStandardMaterial，所有分件共享。
 */

const SEED = 20261121;
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

// ---------------------------------------------------------------- color

type RGB = readonly [number, number, number];
type Pixel = { r: number; g: number; b: number; h: number };
type Paint = (u: number, v: number) => Pixel;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const clamp255 = (t: number) => (t < 0 ? 0 : t > 255 ? 255 : t);
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
function mix3(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
function toPixel(c: RGB, h: number, shade = 1): Pixel {
  return { r: clamp255(c[0] * shade), g: clamp255(c[1] * shade), b: clamp255(c[2] * shade), h: clamp255(h) };
}

// ---------------------------------------------------------------- atlas cells

/** 图集分格（像素坐标，canvas 左上为原点）。改这里必须同步 uvRect。 */
const CELL = {
  wood: { x: 0, y: 0, size: 768 },
  woodEnd: { x: 768, y: 0, size: 512 },
  cloth: { x: 1280, y: 0, size: 512 },
  scarf: { x: 1792, y: 0, size: 256 },
  leather: { x: 0, y: 768, size: 512 },
  canvas: { x: 512, y: 768, size: 512 },
  metal: { x: 1024, y: 768, size: 256 },
  glass: { x: 1280, y: 768, size: 256 },
  rope: { x: 1536, y: 768, size: 256 },
  dark: { x: 1792, y: 768, size: 256 },
} as const;

type CellName = keyof typeof CELL;

/** 每格 G=roughness、B=metalness（单一材质，靠贴图区分材质感）。 */
const CELL_RM: Record<CellName, readonly [number, number]> = {
  wood: [0.62, 0],
  woodEnd: [0.68, 0],
  cloth: [0.93, 0],
  scarf: [0.9, 0],
  leather: [0.56, 0],
  canvas: [0.95, 0],
  metal: [0.4, 1],
  glass: [0.14, 0],
  rope: [0.86, 0],
  dark: [0.95, 0],
};

// ---------------------------------------------------------------- paints

/** 纵向木纹：纹理 v 方向为木料长轴。 */
function woodPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 7);
  const n3 = makeNoise(seed + 13);
  const knotU = 0.34;
  return (u, v) => {
    const warp = fbm(n1, u * 3.2, v * 0.55, 2);
    const g = fbm(n2, u * 9 + warp * 2.4, v * 0.5, 3);
    const streak = smoothstep(0.5, 0.78, g);
    const fiber = fbm(n3, u * 140, v * 2.6, 2) - 0.5;
    const ku = u - knotU;
    const kv = v - 0.56;
    const kd = Math.hypot(ku, kv * 0.5);
    const knot = kd < 0.075 ? Math.exp(-(kd * kd) / 0.0011) : 0;
    const ring = kd < 0.11 ? Math.max(0, Math.sin(kd * 230)) * 0.06 : 0;
    const t = clamp01(streak * 0.55 + fiber * 0.35 + knot * 0.85 + ring);
    const c = mix3(base, dark, t);
    const dirt = fbm(n1, u * 1.4, v * 1.1, 2);
    const shade = 1 - (dirt - 0.5) * 0.08;
    return toPixel(c, 138 + streak * 46 + fiber * 26 - knot * 58 + ring * 18, shade);
  };
}

/** 端面年轮：同心环 + 径向裂纹 + 髓心。 */
function woodEndPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 5);
  const n3 = makeNoise(seed + 11);
  return (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
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
    const shade = 1 - crack * 0.34 - pith * 0.22;
    return toPixel(c, 140 + rings * 34 + grain * 18 - crack * 80 - pith * 40, shade);
  };
}

/** 织物：经纬交织 + 大尺度脏污/褶皱明暗。 */
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
    const c = mix3(base, dark, t);
    return toPixel(c, 120 + weave * 52 + slub * 46 + fold * 34);
  };
}

/** 皮革：细颗粒 + 折痕。 */
function leatherPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 4);
  return (u, v) => {
    const grain = fbm(n1, u * 160, v * 160, 2) - 0.5;
    const pore = Math.abs(Math.sin(u * 620) * Math.sin(v * 680));
    const crease = Math.max(0, fbm(n2, u * 11, v * 7, 2) - 0.62) * 2.4;
    const t = clamp01(0.2 + grain * 0.35 + pore * 0.12 + crease * 0.5);
    const c = mix3(base, dark, t);
    return toPixel(c, 120 + grain * 50 + pore * 30 - crease * 30);
  };
}

/** 帆布：粗纬 + 大片水渍。 */
function canvasPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 8);
  return (u, v) => {
    const weave =
      (Math.sin(u * 150 * TAU) * 0.5 + 0.5) * (Math.sin(v * 150 * TAU) * 0.5 + 0.5);
    const mottle = fbm(n1, u * 5, v * 4, 3) - 0.5;
    const stain = smoothstep(0.58, 0.78, fbm(n2, u * 3 + 7, v * 2.4, 3));
    const t = clamp01(0.16 + weave * 0.22 + mottle * 0.4 + stain * 0.4);
    const c = mix3(base, dark, t);
    return toPixel(c, 118 + weave * 60 + mottle * 30 - stain * 22);
  };
}

/** 铁件：竖向拉丝 + 划痕。 */
function metalPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  const n2 = makeNoise(seed + 6);
  return (u, v) => {
    const brush = Math.sin(u * 900 + fbm(n1, u * 6, v * 3, 2) * 4) * 0.5 + 0.5;
    const scratch = smoothstep(0.62, 0.9, fbm(n2, u * 24, v * 3.5, 2));
    const t = clamp01(0.2 + brush * 0.24 + scratch * 0.5);
    const c = mix3(base, dark, t);
    return toPixel(c, 126 + brush * 20 - scratch * 26);
  };
}

/** 深绿玻璃瓶。 */
function glassPaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  return (u, v) => {
    const band = Math.exp(-Math.pow((u - 0.3) / 0.045, 2));
    const t = clamp01(0.25 + (fbm(n1, u * 4, v * 4, 2) - 0.5) * 0.3 - band * 0.35);
    const c = mix3(base, dark, t);
    return toPixel(c, 118 + band * 40);
  };
}

/** 麻绳。 */
function ropePaint(seed: number, base: RGB, dark: RGB): Paint {
  const n1 = makeNoise(seed);
  return (u, v) => {
    const braid = 0.5 + 0.5 * Math.sin((u * 2 + v * 13) * TAU);
    const braid2 = 0.5 + 0.5 * Math.sin((u * 2 - v * 13) * TAU);
    const t = clamp01(0.2 + braid * braid2 * 0.5 + (fbm(n1, u * 30, v * 30, 2) - 0.5) * 0.2);
    const c = mix3(base, dark, t);
    return toPixel(c, 110 + braid * braid2 * 70);
  };
}

/** 布料内侧/缝隙。 */
function darkPaint(seed: number): Paint {
  const n1 = makeNoise(seed);
  const base: RGB = [62, 58, 52];
  const dark: RGB = [34, 31, 28];
  return (u, v) => {
    const t = clamp01(fbm(n1, u * 20, v * 20, 2) * 0.7);
    return toPixel(mix3(base, dark, t), 128 + t * 20);
  };
}

// ---------------------------------------------------------------- atlas

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
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 逐像素烘焙一个分格的颜色与高度（高度稍后合成 1024 法线）。 */
function paintCell(size: number, paint: Paint): { color: HTMLCanvasElement; height: HTMLCanvasElement } {
  const [color, colorCtx] = makeCanvas(size);
  const [height, heightCtx] = makeCanvas(size);
  const colorImage = colorCtx.createImageData(size, size);
  const heightImage = heightCtx.createImageData(size, size);
  const c = colorImage.data;
  const h = heightImage.data;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const p = paint((x + 0.5) / size, v);
      const i = (y * size + x) * 4;
      c[i] = p.r;
      c[i + 1] = p.g;
      c[i + 2] = p.b;
      c[i + 3] = 255;
      h[i] = p.h;
      h[i + 1] = p.h;
      h[i + 2] = p.h;
      h[i + 3] = 255;
    }
  }
  colorCtx.putImageData(colorImage, 0, 0);
  heightCtx.putImageData(heightImage, 0, 0);
  return { color, height };
}

/** 由 1024 高度图生成 1024 法线图，方向与既有资产一致。 */
function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, size, size).data;
  const [canvas, ctx] = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const sample = (x: number, y: number) => {
    const sx = ((x % size) + size) % size;
    const sy = ((y % size) + size) % size;
    return src[(sy * size + sx) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = sample(x + 1, y) - sample(x - 1, y);
      const dy = sample(x, y + 1) - sample(x, y - 1);
      const nx = -dx * strength;
      const ny = dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      image.data[i] = (nx / len) * 0.5 * 255 + 127.5;
      image.data[i + 1] = (ny / len) * 0.5 * 255 + 127.5;
      image.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function buildAtlas() {
  const [colorCanvas, colorCtx] = makeCanvas(ATLAS);
  const [heightCanvas, heightCtx] = makeCanvas(AUX);
  const [rmCanvas, rmCtx] = makeCanvas(AUX);

  const builders: Record<CellName, () => { color: HTMLCanvasElement; height: HTMLCanvasElement }> = {
    wood: () => paintCell(CELL.wood.size, woodPaint(SEED + 1, [216, 196, 166], [172, 145, 112])),
    woodEnd: () => paintCell(CELL.woodEnd.size, woodEndPaint(SEED + 2, [212, 190, 158], [166, 138, 106])),
    cloth: () => paintCell(CELL.cloth.size, clothPaint(SEED + 3, [150, 146, 137], [108, 104, 97], 170)),
    scarf: () => paintCell(CELL.scarf.size, clothPaint(SEED + 4, [154, 52, 43], [102, 30, 26], 84)),
    leather: () => paintCell(CELL.leather.size, leatherPaint(SEED + 5, [116, 86, 60], [76, 52, 36])),
    canvas: () => paintCell(CELL.canvas.size, canvasPaint(SEED + 6, [124, 110, 90], [86, 74, 58])),
    metal: () => paintCell(CELL.metal.size, metalPaint(SEED + 7, [134, 129, 120], [86, 82, 76])),
    glass: () => paintCell(CELL.glass.size, glassPaint(SEED + 8, [50, 70, 56], [22, 32, 25])),
    rope: () => paintCell(CELL.rope.size, ropePaint(SEED + 9, [192, 168, 126], [140, 114, 78])),
    dark: () => paintCell(CELL.dark.size, darkPaint(SEED + 10)),
  };

  for (const name of Object.keys(CELL) as CellName[]) {
    const cell = CELL[name];
    const maps = builders[name]();
    colorCtx.drawImage(maps.color, cell.x, cell.y);
    heightCtx.drawImage(maps.height, cell.x / 2, cell.y / 2, cell.size / 2, cell.size / 2);
    const [rough, metal] = CELL_RM[name];
    rmCtx.fillStyle = `rgb(128, ${Math.round(rough * 255)}, ${Math.round(metal * 255)})`;
    rmCtx.fillRect(cell.x / 2, cell.y / 2, cell.size / 2, cell.size / 2);
  }

  return {
    map: texture(colorCanvas, true),
    rm: texture(rmCanvas, false),
    normalMap: texture(normalFromHeight(heightCanvas, 2.2), false),
  };
}

// ---------------------------------------------------------------- material

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

// ---------------------------------------------------------------- UV

/** 图集分格 UV 矩形（留 6px 内缩，防 mip 溢色）。 */
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
    let u = uv.getX(i);
    let v = uv.getY(i);
    if (o.swap) {
      const t = u;
      u = v;
      v = t;
    }
    if (o.repeat) {
      u = (((u * o.repeat[0]) % 1) + 1) % 1;
      v = (((v * o.repeat[1]) % 1) + 1) % 1;
    }
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------- primitives

function place(
  geo: THREE.BufferGeometry,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

function box(
  w: number,
  h: number,
  d: number,
  cell: CellName,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  mapCell(geo, cell);
  return place(geo, x, y, z, rx, ry, rz);
}

/** 绕 Y 轴回转（车削件）：profile 为 [半径, 高度]，v 沿长轴。 */
function lathe(
  profile: Array<readonly [number, number]>,
  cell: CellName,
  segments = 20,
  swap = false,
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0002), y));
  const geo = new THREE.LatheGeometry(pts, segments);
  mapCell(geo, cell, { swap });
  return geo;
}

/**
 * 绕 Z 轴回转、UV 采用平面投影（端面年轮用）。
 * profile 为 [半径, z]，半径必须单调递增；radius 为平面 UV 的归一化半径。
 */
function revolvePlanar(
  profile: Array<readonly [number, number]>,
  cell: CellName,
  radius: number,
  segments = 64,
): THREE.BufferGeometry {
  const cols = segments + 1;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (const [r, z] of profile) {
    for (let j = 0; j < cols; j++) {
      const a = (j / segments) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      pos.push(x, y, z);
      uvs.push(0.5 + x / (2 * radius), 0.5 + y / (2 * radius));
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 中心收缩点会得到零法线，按端面朝向补齐
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
type LoftOptions = { radial?: number; fold?: number; tears?: boolean; cell?: CellName };

/** 沿 Y 轴放样超椭圆截面（衣物、背包）。 */
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
    const last = i === rows.length - 1;
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      const n = row.n ?? 2.2;
      const sx = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / n);
      const szn = Math.sign(sz) * Math.pow(Math.abs(sz), 2 / n);
      let y = row.y;
      if (last && o.tears) {
        y += (fbm(noise, a * 2.4, 3.1, 2) - 0.5) * 0.055;
        for (let k = 0; k < 5; k++) {
          const ta = k * 1.31 + 0.4;
          const d = Math.abs(Math.atan2(Math.sin(a - ta), Math.cos(a - ta)));
          if (d < 0.13) y -= (1 - d / 0.13) * (0.03 + 0.015 * (k % 2));
        }
      }
      let wobble = 0;
      if (fold > 0) {
        wobble = fold * (fbm(noise, cx * 2.3 + 5, sz * 2.3 + row.y * 5.5, 2) - 0.5) * 2;
        wobble += fold * 0.28 * Math.sin(a * 9 + row.y * 6.5);
      }
      const rx = Math.max(0.004, row.rx + wobble);
      const rz = Math.max(0.004, row.rz + wobble * 0.65);
      pos.push(sx * rx, y, szn * rz + (row.z ?? 0));
      uvs.push(j / radial, i / (rows.length - 1));
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
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

/** 沿 X 轴放样圆管（袖筒），最后一圈可做破边。 */
function loftX(
  rows: Array<{ x: number; r: number; ragged?: number }>,
  cell: CellName,
  radial = 28,
  seed = SEED + 33,
): THREE.BufferGeometry {
  const noise = makeNoise(seed);
  const cols = radial + 1;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * TAU;
      let x = row.x;
      if (row.ragged) x += (fbm(noise, a * 3.1, i * 2.2, 2) - 0.5) * row.ragged;
      pos.push(x, Math.cos(a) * row.r, Math.sin(a) * row.r);
      uvs.push(i / (rows.length - 1), j / radial);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
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

/** 沿三维路径扫掠椭圆截面（围巾、皮带、背带、卷须）。 */
function sweep(
  points: THREE.Vector3[],
  radius: (t: number) => readonly [number, number],
  o: SweepOptions = {},
): THREE.BufferGeometry {
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
    if (Math.abs(tangent.y) > 0.92) ref.set(0, 0, 1);
    else ref.set(0, 1, 0);
    side.crossVectors(ref, tangent).normalize();
    up.crossVectors(tangent, side).normalize();
    const t = closed ? i / points.length : i / (points.length - 1);
    const [rx, rz] = radius(t);
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a) * rx;
      const s = Math.sin(a) * rz;
      pos.push(p.x + side.x * c + up.x * s, p.y + side.y * c + up.y * s, p.z + side.z * c + up.z * s);
      uvs.push(j / radial, t);
    }
  }
  const segs = closed ? points.length : points.length - 1;
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % points.length;
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = i2 * cols + j;
      const d = c + 1;
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

// ---------------------------------------------------------------- wooden joints

function ball(x: number, y: number, z: number, r: number, cell: CellName = 'wood', seg = 18): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7)));
  mapCell(geo, cell);
  return place(geo, x, y, z);
}

function rod(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  cell: CellName = 'wood',
  segments = 8,
): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r, r, len, segments, 1, false);
  mapCell(geo, cell);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geo;
}

/** 带一道赤道凹槽的木球关节。 */
function jointBallProfile(r: number): Array<readonly [number, number]> {
  return [
    [0.0002, -r],
    [0.22 * r, -0.93 * r],
    [0.5 * r, -0.86 * r],
    [0.82 * r, -0.56 * r],
    [0.96 * r, -0.2 * r],
    [r, -0.06 * r],
    [0.9 * r, 0],
    [0.94 * r, 0.05 * r],
    [r, 0.09 * r],
    [0.95 * r, 0.3 * r],
    [0.8 * r, 0.58 * r],
    [0.48 * r, 0.86 * r],
    [0.2 * r, 0.94 * r],
    [0.0002, r],
  ];
}

function jointBall(r: number, segments = 20): THREE.BufferGeometry {
  return lathe(jointBallProfile(r), 'wood', segments);
}

function mirrorX(geo: THREE.BufferGeometry, sign: number): THREE.BufferGeometry {
  if (sign < 0) geo.rotateY(Math.PI);
  return geo;
}

// ---------------------------------------------------------------- head

const HEAD = {
  discRadius: 0.215,
  discCenterY: 0.215,
  rimHalf: 0.064,
} as const;

function headGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 圆盘侧缘：木纹沿圆周（UV 交换）
  const rim = lathe(
    [
      [0.215, -HEAD.rimHalf],
      [0.2175, -0.045],
      [0.2188, 0],
      [0.2175, 0.045],
      [0.215, HEAD.rimHalf],
    ],
    'wood',
    72,
    true,
  );
  place(rim, 0, 0, 0, Math.PI / 2, 0, 0);
  rim.translate(0, HEAD.discCenterY, 0);
  parts.push(rim);

  // 正面：中心凸台 + 两道同心刻槽 + 外圈凹槽，平面 UV 让年轮对中
  const front = revolvePlanar(
    [
      [0.0, -0.0895],
      [0.03, -0.089],
      [0.055, -0.0862],
      [0.07, -0.0818],
      [0.08, -0.0755],
      [0.096, -0.0738],
      [0.099, -0.0648],
      [0.104, -0.0648],
      [0.107, -0.0738],
      [0.129, -0.0738],
      [0.132, -0.0648],
      [0.137, -0.0648],
      [0.14, -0.0738],
      [0.158, -0.0738],
      [0.166, -0.0625],
      [0.18, -0.0625],
      [0.188, -0.07],
      [0.198, -0.0745],
      [0.21, -0.0725],
      [0.215, -0.064],
    ],
    'woodEnd',
    HEAD.discRadius,
    72,
  );
  front.translate(0, HEAD.discCenterY, 0);
  parts.push(front);

  // 背面：浅弧面
  const back = revolvePlanar(
    [
      [0.0, 0.0775],
      [0.06, 0.0765],
      [0.12, 0.0745],
      [0.18, 0.0718],
      [0.205, 0.069],
      [0.215, 0.064],
    ],
    'woodEnd',
    HEAD.discRadius,
    64,
  );
  back.translate(0, HEAD.discCenterY, 0);
  parts.push(back);

  // 顶部卷须（comma）
  const sproutPoints = [
    new THREE.Vector3(0, 0.4275, 0.012),
    new THREE.Vector3(0.002, 0.452, 0.006),
    new THREE.Vector3(0.02, 0.4705, -0.002),
    new THREE.Vector3(0.046, 0.476, -0.01),
    new THREE.Vector3(0.062, 0.462, -0.008),
    new THREE.Vector3(0.058, 0.444, 0.0),
    new THREE.Vector3(0.044, 0.439, 0.004),
  ];
  const sprout = sweep(sproutPoints, (t) => {
    const r = 0.0165 * (1 - t) + 0.0035;
    return [r, r];
  }, { radial: 10, cell: 'wood' });
  parts.push(sprout);

  return merged(parts);
}

// ---------------------------------------------------------------- arms

function upperArmGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(ball(0, 0, 0, 0.047, 'wood', 18));

  const arm = lathe(
    [
      [0.0002, 0.0],
      [0.03, 0.004],
      [0.032, 0.04],
      [0.03, 0.16],
      [0.031, 0.2],
      [0.036, 0.205],
      [0.036, 0.214],
      [0.03, 0.219],
      [0.03, 0.26],
      [0.034, 0.264],
      [0.034, 0.272],
      [0.028, 0.277],
      [0.0002, 0.302],
    ],
    'wood',
    16,
  );
  place(arm, 0, 0, 0, 0, 0, -Math.PI / 2);
  parts.push(arm);

  // 破边短袖
  const sleeve = loftX(
    [
      { x: 0.072, r: 0.058 },
      { x: 0.12, r: 0.064 },
      { x: 0.17, r: 0.069 },
      { x: 0.215, r: 0.072 },
      { x: 0.246, r: 0.071, ragged: 0.018 },
    ],
    'cloth',
    28,
  );
  parts.push(sleeve);

  return mirrorX(merged(parts), sign);
}

function forearmGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const elbow = jointBall(0.043, 22);
  place(elbow, 0, 0, 0, 0, 0, -Math.PI / 2);
  parts.push(elbow);

  const fore = lathe(
    [
      [0.0002, 0.03],
      [0.026, 0.034],
      [0.03, 0.05],
      [0.028, 0.16],
      [0.03, 0.19],
      [0.034, 0.194],
      [0.034, 0.202],
      [0.027, 0.206],
      [0.027, 0.232],
      [0.031, 0.236],
      [0.031, 0.243],
      [0.024, 0.247],
    ],
    'wood',
    16,
  );
  place(fore, 0, 0, 0, 0, 0, -Math.PI / 2);
  parts.push(fore);

  return mirrorX(merged(parts), sign);
}

function handGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(ball(0, 0, 0, 0.029, 'wood', 16));
  parts.push(box(0.08, 0.068, 0.027, 'wood', sign * 0.058, 0, 0));
  parts.push(box(0.012, 0.068, 0.028, 'wood', sign * 0.092, 0, 0));

  const fingers = [
    { y: 0.0255, len: 0.064 },
    { y: 0.0085, len: 0.074 },
    { y: -0.0085, len: 0.07 },
    { y: -0.0255, len: 0.056 },
  ];
  for (const f of fingers) {
    let x = sign * 0.094;
    const seg = f.len / 3;
    for (let s = 0; s < 3; s++) {
      const nx = x + sign * seg;
      parts.push(rod(new THREE.Vector3(x, f.y, 0), new THREE.Vector3(nx, f.y, 0), 0.0074, 'wood', 8));
      parts.push(ball(nx, f.y, 0, 0.0087, 'wood', 10));
      x = nx;
    }
  }

  // 拇指：两节，掌心朝 -Z 时向上外张
  const t0 = new THREE.Vector3(sign * 0.036, 0.034, -0.002);
  const t1 = new THREE.Vector3(sign * 0.052, 0.062, -0.004);
  const t2 = new THREE.Vector3(sign * 0.06, 0.086, -0.006);
  parts.push(rod(t0, t1, 0.009, 'wood', 8));
  parts.push(ball(t1.x, t1.y, t1.z, 0.0102, 'wood', 10));
  parts.push(rod(t1, t2, 0.0082, 'wood', 8));
  parts.push(ball(t2.x, t2.y, t2.z, 0.0088, 'wood', 10));

  return merged(parts);
}

// ---------------------------------------------------------------- legs

function thighGeometry(): THREE.BufferGeometry {
  // 髋部木球直接并进大腿：小腿枢轴在下方，髋球只在造型上出现
  return lathe(
    [
      [0.0002, -0.552],
      [0.025, -0.548],
      [0.033, -0.536],
      [0.035, -0.45],
      [0.033, -0.2],
      [0.033, -0.06],
      [0.037, -0.045],
      [0.048, -0.028],
      [0.052, -0.008],
      [0.05, 0.006],
      [0.046, 0.018],
      [0.032, 0.028],
      [0.0002, 0.034],
    ],
    'wood',
    18,
  );
}

function shinGeometry(): THREE.BufferGeometry {
  return lathe(
    [
      [0.0002, -0.192],
      [0.024, -0.188],
      [0.03, -0.178],
      [0.032, -0.168],
      [0.03, -0.05],
      [0.033, -0.03],
      [0.045, -0.012],
      [0.048, 0.002],
      [0.045, 0.016],
      [0.03, 0.028],
      [0.0002, 0.034],
    ],
    'wood',
    18,
  );
}

function footGeometry(sign: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(ball(0, 0, 0, 0.033, 'wood', 16));
  parts.push(box(0.072, 0.055, 0.062, 'wood', 0, -0.062, 0.034));
  parts.push(box(0.082, 0.055, 0.12, 'wood', 0, -0.066, -0.04));
  parts.push(box(0.088, 0.042, 0.056, 'wood', 0, -0.072, -0.114));
  parts.push(box(0.098, 0.026, 0.235, 'wood', 0, -0.087, -0.045));

  const toes = [
    { x: -0.033, len: 0.03 },
    { x: -0.017, len: 0.034 },
    { x: 0.0, len: 0.036 },
    { x: 0.017, len: 0.033 },
    { x: 0.033, len: 0.027 },
  ];
  for (const toe of toes) {
    parts.push(box(0.0145, 0.024, toe.len, 'wood', toe.x, -0.071, -0.155 - toe.len * 0.35));
  }

  // 脚背皮带 + 踝箍
  const strap = sweep(
    [
      new THREE.Vector3(sign * -0.052, -0.048, -0.026),
      new THREE.Vector3(sign * -0.02, -0.028, -0.03),
      new THREE.Vector3(0, -0.02, -0.032),
      new THREE.Vector3(sign * 0.02, -0.028, -0.03),
      new THREE.Vector3(sign * 0.052, -0.048, -0.026),
    ],
    () => [0.014, 0.0055],
    { radial: 8, cell: 'leather' },
  );
  parts.push(strap);

  const anklet = new THREE.TorusGeometry(0.034, 0.0042, 6, 22);
  mapCell(anklet, 'leather');
  place(anklet, 0, -0.006, 0, Math.PI / 2, 0, 0);
  parts.push(anklet);

  return merged(parts);
}

// ---------------------------------------------------------------- 躯干 / 服装 / 背包

function buckle(x: number, y: number, z: number, w = 0.034, h = 0.026): THREE.BufferGeometry {
  const t = 0.0045;
  const d = 0.005;
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

  // 车削木脖子（下端藏在衣领内，上端插入圆盘）
  parts.push(
    lathe(
      [
        [0.024, 1.232],
        [0.028, 1.244],
        [0.034, 1.252],
        [0.03, 1.26],
        [0.03, 1.266],
        [0.035, 1.27],
        [0.028, 1.276],
        [0.029, 1.3],
        [0.032, 1.312],
        [0.03, 1.325],
        [0.026, 1.336],
      ],
      'wood',
      20,
    ),
  );

  // 灰布长衫：肩部收口 → 束腰 → 破边下摆
  const tunic = loftY(
    [
      { y: 1.246, rx: 0.055, rz: 0.05 },
      { y: 1.238, rx: 0.1, rz: 0.078 },
      { y: 1.226, rx: 0.145, rz: 0.096 },
      { y: 1.205, rx: 0.168, rz: 0.106 },
      { y: 1.16, rx: 0.178, rz: 0.112 },
      { y: 1.05, rx: 0.172, rz: 0.108 },
      { y: 0.95, rx: 0.162, rz: 0.1 },
      { y: 0.88, rx: 0.15, rz: 0.094 },
      { y: 0.82, rx: 0.155, rz: 0.098 },
      { y: 0.72, rx: 0.172, rz: 0.108 },
      { y: 0.62, rx: 0.182, rz: 0.115 },
      { y: 0.52, rx: 0.186, rz: 0.118 },
      { y: 0.435, rx: 0.188, rz: 0.12 },
    ],
    { radial: 56, fold: 0.0065, tears: true },
  );
  parts.push(tunic);

  // 双圈皮带
  for (const y of [0.866, 0.848]) {
    const band = new THREE.TorusGeometry(0.158, 0.011, 8, 64);
    mapCell(band, 'leather');
    band.scale(1, 0.62, 1);
    place(band, 0, y, 0, Math.PI / 2, 0, 0);
    parts.push(band);
  }

  // 皮带结 + 垂尾 + 金属尾片（角色左侧）
  parts.push(box(0.052, 0.038, 0.022, 'leather', -0.104, 0.856, -0.092, 0, 0, 0.18));
  parts.push(box(0.022, 0.072, 0.018, 'leather', -0.126, 0.818, -0.088, 0, 0, 0.3));
  const beltTail = sweep(
    [
      new THREE.Vector3(-0.118, 0.845, -0.098),
      new THREE.Vector3(-0.128, 0.78, -0.112),
      new THREE.Vector3(-0.14, 0.7, -0.117),
      new THREE.Vector3(-0.147, 0.635, -0.112),
    ],
    (t) => [0.026 + t * 0.005, 0.006],
    { radial: 8, cell: 'leather' },
  );
  parts.push(beltTail);
  parts.push(box(0.032, 0.02, 0.012, 'metal', -0.148, 0.622, -0.112));

  // 红围巾：颈圈 + 肩部披巾 + 左胸垂尾
  const collarPts: THREE.Vector3[] = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    collarPts.push(new THREE.Vector3(Math.cos(a) * 0.108, 1.205 + Math.sin(a * 3) * 0.006, Math.sin(a) * 0.09));
  }
  parts.push(
    sweep(collarPts, (t) => [0.032 + Math.sin(t * TAU * 2) * 0.004, 0.028], {
      radial: 12,
      closed: true,
      cell: 'scarf',
    }),
  );

  const cape = loftY(
    [
      { y: 1.242, rx: 0.06, rz: 0.052 },
      { y: 1.232, rx: 0.104, rz: 0.082 },
      { y: 1.215, rx: 0.148, rz: 0.108 },
      { y: 1.18, rx: 0.182, rz: 0.128 },
      { y: 1.13, rx: 0.198, rz: 0.138 },
      { y: 1.075, rx: 0.205, rz: 0.142 },
    ],
    { radial: 56, fold: 0.009, tears: true, cell: 'scarf' },
  );
  parts.push(cape);

  const scarfTail = sweep(
    [
      new THREE.Vector3(-0.075, 1.115, -0.125),
      new THREE.Vector3(-0.1, 1.03, -0.148),
      new THREE.Vector3(-0.122, 0.94, -0.152),
      new THREE.Vector3(-0.135, 0.855, -0.14),
      new THREE.Vector3(-0.142, 0.795, -0.128),
      new THREE.Vector3(-0.145, 0.75, -0.118),
    ],
    (t) => {
      const half = t < 0.9 ? 0.036 + 0.03 * t : 0.066 - (t - 0.9) * 0.55;
      return [half, 0.0065];
    },
    { radial: 10, cell: 'scarf' },
  );
  parts.push(scarfTail);

  // 帆布背包本体
  const pack = loftY(
    [
      { y: 1.198, rx: 0.1, rz: 0.05, n: 2.6, z: 0.185 },
      { y: 1.188, rx: 0.132, rz: 0.063, n: 2.6, z: 0.185 },
      { y: 1.16, rx: 0.15, rz: 0.073, n: 2.5, z: 0.185 },
      { y: 1.1, rx: 0.155, rz: 0.078, n: 2.4, z: 0.185 },
      { y: 0.95, rx: 0.155, rz: 0.078, n: 2.4, z: 0.185 },
      { y: 0.88, rx: 0.148, rz: 0.074, n: 2.4, z: 0.185 },
      { y: 0.85, rx: 0.128, rz: 0.062, n: 2.5, z: 0.185 },
      { y: 0.82, rx: 0.098, rz: 0.045, n: 2.6, z: 0.185 },
    ],
    { radial: 48, cell: 'canvas' },
  );
  parts.push(pack);

  // 背包顶盖
  parts.push(
    sweep(
      [
        new THREE.Vector3(0, 1.196, 0.132),
        new THREE.Vector3(0, 1.222, 0.172),
        new THREE.Vector3(0, 1.228, 0.215),
        new THREE.Vector3(0, 1.195, 0.256),
        new THREE.Vector3(0, 1.13, 0.272),
        new THREE.Vector3(0, 1.055, 0.27),
        new THREE.Vector3(0, 1.005, 0.262),
      ],
      (t) => [0.132 + Math.sin(t * Math.PI) * 0.008, 0.007],
      { radial: 12, cell: 'canvas' },
    ),
  );

  // 顶盖两条皮革扣带 + 金属扣
  for (const sx of [-1, 1]) {
    parts.push(
      sweep(
        [
          new THREE.Vector3(sx * 0.075, 1.2, 0.146),
          new THREE.Vector3(sx * 0.075, 1.228, 0.196),
          new THREE.Vector3(sx * 0.075, 1.222, 0.238),
          new THREE.Vector3(sx * 0.075, 1.15, 0.281),
          new THREE.Vector3(sx * 0.075, 1.05, 0.289),
          new THREE.Vector3(sx * 0.075, 0.968, 0.276),
        ],
        () => [0.017, 0.005],
        { radial: 8, cell: 'leather' },
      ),
    );
    parts.push(buckle(sx * 0.075, 1.045, 0.297, 0.032, 0.024));
  }

  // 铺盖卷 + 麻绳端面 + 两道皮箍
  const roll = new THREE.CylinderGeometry(0.055, 0.055, 0.33, 24, 1, false);
  mapCell(roll, 'canvas');
  place(roll, 0, 1.235, 0.185, 0, 0, Math.PI / 2);
  parts.push(roll);

  for (const sx of [-1, 1]) {
    const hoop = new THREE.TorusGeometry(0.058, 0.0055, 6, 24);
    mapCell(hoop, 'leather');
    place(hoop, sx * 0.09, 1.235, 0.185, 0, Math.PI / 2, 0);
    parts.push(hoop);
  }

  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const a = t * TAU * 3.2;
      const r = 0.007 + t * 0.045;
      pts.push(new THREE.Vector3(sx * 0.1665, 1.235 + Math.cos(a) * r, 0.185 + Math.sin(a) * r));
    }
    parts.push(sweep(pts, () => [0.005, 0.005], { radial: 6, cell: 'rope' }));
  }

  // 侧袋 + 搭扣
  for (const sx of [-1, 1]) {
    parts.push(box(0.05, 0.12, 0.095, 'canvas', sx * 0.168, 0.945, 0.185));
    parts.push(box(0.054, 0.028, 0.1, 'canvas', sx * 0.168, 1.005, 0.183));
    parts.push(box(0.012, 0.07, 0.022, 'leather', sx * 0.196, 0.985, 0.226));
    parts.push(box(0.02, 0.012, 0.014, 'metal', sx * 0.196, 0.958, 0.232));
  }

  // 水壶（角色右侧）
  const bottleBody = new THREE.CylinderGeometry(0.024, 0.024, 0.11, 18, 1, false);
  mapCell(bottleBody, 'glass');
  parts.push(place(bottleBody, 0.199, 0.965, 0.185));
  const bottleShoulder = new THREE.CylinderGeometry(0.013, 0.024, 0.03, 18, 1, false);
  mapCell(bottleShoulder, 'glass');
  parts.push(place(bottleShoulder, 0.199, 1.035, 0.185));
  const bottleNeck = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 14, 1, false);
  mapCell(bottleNeck, 'glass');
  parts.push(place(bottleNeck, 0.199, 1.065, 0.185));
  const cork = new THREE.CylinderGeometry(0.0125, 0.0115, 0.018, 14, 1, false);
  mapCell(cork, 'wood');
  parts.push(place(cork, 0.199, 1.089, 0.185));

  // 肩带（从包顶绕过肩到胸前）
  for (const sx of [-1, 1]) {
    parts.push(
      sweep(
        [
          new THREE.Vector3(sx * 0.1, 1.19, 0.155),
          new THREE.Vector3(sx * 0.115, 1.235, 0.06),
          new THREE.Vector3(sx * 0.118, 1.225, -0.03),
          new THREE.Vector3(sx * 0.108, 1.13, -0.108),
          new THREE.Vector3(sx * 0.1, 1.02, -0.118),
          new THREE.Vector3(sx * 0.098, 0.94, -0.112),
        ],
        () => [0.018, 0.0055],
        { radial: 8, cell: 'leather' },
      ),
    );
    parts.push(buckle(sx * 0.1, 1.0, -0.125, 0.028, 0.022));
  }

  return merged(parts);
}

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
  head.position.set(0, 1.315, 0);
  root.add(head);
  addMesh(head, headGeometry(), 'char_comma_head');

  for (const sign of [1, -1]) {
    const side = sign > 0 ? 'r' : 'l';
    const shoulder = new THREE.Object3D();
    shoulder.name = `shoulder_${side}`;
    shoulder.position.set(sign * 0.16, 1.2, 0);
    root.add(shoulder);
    addMesh(shoulder, upperArmGeometry(sign), `char_comma_upper_arm_${side}`);

    const elbow = new THREE.Object3D();
    elbow.name = `elbow_${side}`;
    elbow.position.set(sign * 0.315, 0, 0);
    shoulder.add(elbow);
    addMesh(elbow, forearmGeometry(sign), `char_comma_forearm_${side}`);

    const wrist = new THREE.Object3D();
    wrist.name = `wrist_${side}`;
    wrist.position.set(sign * 0.25, 0, 0);
    elbow.add(wrist);
    addMesh(wrist, handGeometry(sign), `char_comma_hand_${side}`);
  }

  for (const sign of [1, -1]) {
    const side = sign > 0 ? 'r' : 'l';
    const hip = new THREE.Object3D();
    hip.name = `hip_${side}`;
    hip.position.set(sign * 0.075, 0.845, 0);
    root.add(hip);
    addMesh(hip, thighGeometry(), `char_comma_thigh_${side}`);

    const knee = new THREE.Object3D();
    knee.name = `knee_${side}`;
    knee.position.set(0, -0.55, 0);
    hip.add(knee);
    addMesh(knee, shinGeometry(), `char_comma_shin_${side}`);

    const ankle = new THREE.Object3D();
    ankle.name = `ankle_${side}`;
    ankle.position.set(0, -0.195, 0);
    knee.add(ankle);
    addMesh(ankle, footGeometry(sign), `char_comma_foot_${side}`);
  }

  return root;
}
