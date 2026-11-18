import type * as THREE from 'three';
import { createCannon } from '../HarborDefender/cannon/src/cannon-model';

/**
 * 公用浏览台的资产注册表。
 * 新增资产：在 ASSETS 里追加一项，id 即 URL 参数 ?asset=<id>。
 */
export type AssetEntry = {
  id: string;
  label: string;
  create: () => THREE.Group;
  /** 回旋限位 ±度，默认 45 */
  yawRange?: number;
  pitchMin?: number;
  pitchMax?: number;
  /** 初始俯仰度，默认 18 */
  pitch?: number;
  note?: string;
};

export const ASSETS: AssetEntry[] = [
  {
    id: 'cannon',
    label: '城防港加农炮 v2',
    create: createCannon,
    yawRange: 45,
    pitchMin: 0,
    pitchMax: 80,
  },
];
