import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * TheFarField 木件 v1 —— 按「正侧」文档两张正交剪影重建（正视 IMG_1346 / 侧视 IMG_1345）。
 *
 * 形体：一块外缘微鼓的饼状木件 —— 正面是大平面、背面是浅穹顶、四周立面近直；
 *       头顶一块逗号状厚片（向屏幕右倾倒），底部一根短柱。
 * 契约：原点在短柱底面 y=0，正面朝 -Z（浏览台「正面」机位即看到带缺口那面）。
 * 尺寸：盘面 0.497 宽 × 0.42 高 × 0.328 厚；含逗号总高 0.627 m。
 * 数据全部来自剪影逐像素量取（正视 765 px = 0.42 m，侧视 707 px = 0.42 m）。
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** 正视剪影半径表：10° 一档共 36 档，索引 = 角度/10，单位米（0° = +X） */
const R_TABLE: readonly number[] = [
  0.2484, 0.2427, 0.2383, 0.2342, 0.2281, 0.2218, 0.2183, 0.2145, 0.2115, 0.2100,
  0.2115, 0.2145, 0.2183, 0.2218, 0.2281, 0.2342, 0.2383, 0.2427, 0.2484, 0.2427,
  0.2383, 0.2342, 0.2281, 0.2218, 0.2183, 0.2145, 0.2115, 0.2100, 0.2115, 0.2145,
  0.2183, 0.2218, 0.2281, 0.2342, 0.2383, 0.2427,
];

/** 背面厚度比 g(ρ)：ρ 为径向归一值，1 表示该处背面顶到最厚 */
const G_RHO: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.97, 1.0];
const G_VAL: readonly number[] = [0.989, 0.987, 0.984, 0.976, 0.948, 0.910, 0.873, 0.831, 0.759, 0.653, 0.600, 0.580];

/** 前后总厚（米） */
const THICK = 0.328;
/** 盘面半高（米），用于背面「上深下浅」的倾斜归一 */
const HALF_H = 0.210;
/** 背面倾斜系数：顶部最厚 = 1 + 0.24，底部最薄 = 1 - 0.24 */
const TILT = 0.24;
/** 盘心高度（米） */
const BODY_Y = 0.263;
/** 径向分段 */
const SEG = 72;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function sampleTable(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
  }
  return ys[ys.length - 1];
}

/** 取正视剪影半径（米） */
function radial(deg: number): number {
  const t = ((deg % 360) + 360) % 360;
  const i = Math.floor(t / 10);
  return lerp(R_TABLE[i], R_TABLE[(i + 1) % R_TABLE.length], (t - i * 10) / 10);
}

/**
 * 断面剖面：[ρ, u]。ρ = 径向归一，u = 0 贴正面、1 顶到背面最深。
 * 0 → 0.905 是正面大平面，随后接正面外缘小圆角、近直立面、背面圆角，最后收到穹顶。
 */
const SECTION: ReadonlyArray<readonly [number, number]> = [
  [0.000, 0.000],
  [0.250, 0.000],
  [0.450, 0.000],
  [0.620, 0.000],
  [0.750, 0.000],
  [0.850, 0.000],
  [0.905, 0.000],
  [0.945, 0.018],
  [0.972, 0.055],
  [0.990, 0.110],
  [1.000, 0.200],
  [1.000, 0.500],
  [1.000, 0.760],
  [0.992, 0.900],
  [0.975, 0.965],
  [0.945, 1.000],
  [0.880, 1.000],
  [0.800, 1.000],
  [0.700, 1.000],
  [0.600, 1.000],
  [0.500, 1.000],
  [0.400, 1.000],
  [0.300, 1.000],
  [0.200, 1.000],
  [0.100, 1.000],
  [0.000, 1.000],
];

/**
 * 逗号厚片的正视剪影，[x, y] 以盘心为原点、x 向屏幕右为正、y 为相对盘心的高度（米）。
 * 顺序：右缘自上而下 → 底面向下延伸（埋进盘体）→ 左缘自下而上。
 */
const COMMA_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [0.0829, 0.3640], [0.1065, 0.3574], [0.1180, 0.3508], [0.1252, 0.3442],
  [0.1323, 0.3376], [0.1389, 0.3310], [0.1433, 0.3245], [0.1449, 0.3179],
  [0.1460, 0.3113], [0.1477, 0.3047], [0.1482, 0.2981], [0.1488, 0.2915],
  [0.1493, 0.2849], [0.1493, 0.2783], [0.1477, 0.2717], [0.1449, 0.2652],
  [0.1411, 0.2586], [0.1373, 0.2520], [0.1329, 0.2454], [0.1285, 0.2388],
  [0.1230, 0.2322], [0.1158, 0.2256], [0.1082, 0.2190], [0.1005, 0.2125],
  [0.1005, 0.1720],
  [0.0598, 0.1720],
  [0.0598, 0.2086], [0.0675, 0.2152], [0.0752, 0.2218], [0.0791, 0.2284],
  [0.0818, 0.2350], [0.0835, 0.2415], [0.0845, 0.2481], [0.0835, 0.2547],
  [0.0752, 0.2613], [0.0615, 0.2679], [0.0516, 0.2745], [0.0505, 0.2811],
  [0.0494, 0.2877], [0.0494, 0.2943], [0.0500, 0.3008], [0.0538, 0.3074],
  [0.0576, 0.3140], [0.0615, 0.3206], [0.0653, 0.3272], [0.0686, 0.3338],
  [0.0714, 0.3404], [0.0730, 0.3470], [0.0747, 0.3535], [0.0752, 0.3601],
];

/** 逗号中心深度（米，相对盘厚中线，正值偏向背面） */
const COMMA_Z = 0.018;
/** 逗号厚度（米，含倒角） */
const COMMA_THICK = 0.098;
/** 逗号倒角半径（米），先按此值内缩轮廓抵掉外扩 */
const COMMA_BEVEL = 0.013;
/** 逗号绕 X 轴向后倾倒的角度（度） */
const COMMA_LEAN = 12;
/** 逗号旋转支点高度（米） */
const COMMA_PIVOT_Y = 0.455;

/** 闭合多边形沿内法线斜接内缩，用来抵掉挤出倒角的外扩 */
function insetPolygon(pts: Array<[number, number]>, d: number): Array<[number, number]> {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const s = area > 0 ? 1 : -1; // 逆时针时左法线指向内部
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
    const l2 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const n1x = (-(p[1] - a[1]) / l1) * s;
    const n1y = ((p[0] - a[0]) / l1) * s;
    const n2x = (-(b[1] - p[1]) / l2) * s;
    const n2y = ((b[0] - p[0]) / l2) * s;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const k = d / Math.max(mx * n1x + my * n1y, 0.4);
    out.push([p[0] + mx * k, p[1] + my * k]);
  }
  return out;
}

function buildBody(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const ringStart: number[] = [];

  const zFront = -THICK / 2;

  for (let s = 1; s < SECTION.length - 1; s++) {
    const rho = SECTION[s][0];
    const u = SECTION[s][1];
    ringStart.push(pos.length / 3);
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * TAU;
      const r = radial((j / SEG) * 360) * rho;
      const x = -r * Math.cos(th); // 正视机位在 -Z，屏幕右 = -X，故取负号
      const y = BODY_Y + r * Math.sin(th);
      const depth = THICK * sampleTable(G_RHO, G_VAL, rho) * u * (1 + TILT * ((y - BODY_Y) / HALF_H));
      pos.push(x, y, zFront + depth);
    }
  }

  for (let s = 0; s < ringStart.length - 1; s++) {
    for (let j = 0; j < SEG; j++) {
      const a = ringStart[s] + j;
      const b = ringStart[s] + ((j + 1) % SEG);
      const c = ringStart[s + 1] + j;
      const d = ringStart[s + 1] + ((j + 1) % SEG);
      idx.push(a, c, b, b, c, d);
    }
  }

  // 正中心与背中心两个极点
  const frontPole = pos.length / 3;
  pos.push(0, BODY_Y, zFront);
  const backPole = pos.length / 3;
  pos.push(0, BODY_Y, zFront + THICK * sampleTable(G_RHO, G_VAL, 0));
  const first = ringStart[0];
  const last = ringStart[ringStart.length - 1];
  for (let j = 0; j < SEG; j++) {
    const j2 = (j + 1) % SEG;
    idx.push(frontPole, first + j, first + j2);
    idx.push(backPole, last + j2, last + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildComma(): THREE.Mesh {
  const raw: Array<[number, number]> = COMMA_OUTLINE.map(([x, y]) => [-x, BODY_Y + y]);
  const pts = insetPolygon(raw, COMMA_BEVEL);
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const bevel = COMMA_BEVEL;
  const depth = COMMA_THICK - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 1,
  });
  geo.translate(0, 0, -(depth / 2));
  const smooth = mergeVertices(geo, 1e-4);
  smooth.computeVertexNormals();
  return new THREE.Mesh(smooth, MAT);
}

const MAT = new THREE.MeshStandardMaterial({ color: 0xa6a6a6, roughness: 0.82, metalness: 0 });

export function createWoodObject(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'wood_object';

  const body = new THREE.Mesh(buildBody(), MAT);
  body.name = 'wood_body';
  root.add(body);

  const comma = buildComma();
  comma.name = 'wood_comma';
  comma.position.y = -COMMA_PIVOT_Y;
  const commaPivot = new THREE.Group();
  commaPivot.name = 'wood_comma_pivot';
  commaPivot.position.set(0, COMMA_PIVOT_Y, COMMA_Z);
  commaPivot.rotation.x = COMMA_LEAN * DEG;
  commaPivot.add(comma);
  root.add(commaPivot);

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.049, 0.11, 24, 1), MAT);
  foot.name = 'wood_foot';
  foot.position.set(0, 0.055, -0.035);
  root.add(foot);

  return root;
}
