import type * as THREE from 'three';
import { createCannon } from '../HarborDefender/cannon/src/cannon-model';
import { createWall } from '../HarborDefender/wall/src/wall-model';
import { createPirateShip } from '../HarborDefender/pirate-ship/src/pirate-ship-model';

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
  {
    id: 'wall',
    label: '城防港城墙 v5',
    create: createWall,
    note: '墙顶 y=0.8 · 炮位 x=±0.75/0 · 3.0 m 垛口护墙',
  },
  {
    id: 'pirate-ship',
    label: '海盗船 v3',
    create: createPirateShip,
    yawRange: 45,
    pitchMin: -10,
    pitchMax: 40,
    pitch: 0,
    note: '船头 -Z · 水线原点 · 桅顶 0.8775 · 炮口 z=-0.58',
  },
];
