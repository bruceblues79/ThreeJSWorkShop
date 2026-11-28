import * as THREE from 'three';
import { createHarborWall } from '../HarborDefender/wall/src/wall-model';

/**
 * 浏览台的程序化天空 cubemap。
 * 有些资产（如城墙积水）需要采样天空做镜面反射，而浏览台本身没有天幕；
 * 这里用 6 个 64 × 64 的 canvas 面拼一张小尺寸天空，仅用于预览。
 */

const FACE_SIZE = 64;

/** 竖向三段渐变：顶部偏冷蓝、中间（地平线）偏亮、底部偏暗土色。 */
function skyFace(top: string, horizon: string, bottom: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_SIZE;
  canvas.height = FACE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  const gradient = ctx.createLinearGradient(0, 0, 0, FACE_SIZE);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.56, horizon);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);
  return canvas;
}

let cached: THREE.CubeTexture | null = null;

export function previewSkyCube(): THREE.CubeTexture {
  if (cached) return cached;
  const side = () => skyFace('#2b5a8c', '#cfe3f2', '#4a4238');
  // 面序：+X / -X / +Y（天顶）/ -Y（地面）/ +Z / -Z
  cached = new THREE.CubeTexture([
    side(),
    side(),
    skyFace('#1f4670', '#3f77ab', '#8fb4d2'),
    skyFace('#5a4f40', '#3d352b', '#241f18'),
    side(),
    side(),
  ]);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.needsUpdate = true;
  return cached;
}

/** 城墙积水的 unlit 镜面需要天空参考，浏览台工厂统一在这里补上。 */
export function createWallWithPreviewSky(): THREE.Group {
  return createHarborWall(previewSkyCube());
}
