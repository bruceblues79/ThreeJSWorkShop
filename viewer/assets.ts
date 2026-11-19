import type * as THREE from 'three';
import { createCannon } from '../HarborDefender/cannon/src/cannon-model';
import { createWall } from '../HarborDefender/wall/src/wall-model';
import { createPirateShip } from '../HarborDefender/pirate-ship/src/pirate-ship-model';
import { createOrnithopter } from '../HarborDefender/ornithopter/src/ornithopter-model';

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
  /** 俯仰作用节点，默认 gun_rotate */
  pitchNode?: string;
  /** 悬空高度（飞行器用），默认贴地 */
  lift?: number;
  /** 每帧动画，time 为累计秒数 */
  animate?: (root: THREE.Group, time: number) => void;
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
  {
    id: 'ornithopter',
    label: '海盗扑翼飞行器 v1',
    create: createOrnithopter,
    yawRange: 45,
    pitchMin: -25,
    pitchMax: 35,
    pitch: 0,
    pitchNode: 'ornithopter',
    lift: 0.24,
    animate: (root, time) => {
      const left = root.getObjectByName('wing_left');
      const right = root.getObjectByName('wing_right');
      if (!left || !right) return;
      const swing = 0.35 * Math.sin(time * 10);
      right.rotation.z = swing;
      left.rotation.z = -swing;
    },
    note: '船头 -Z · 机腹货舱口 (0,-0.158,0.032) · 翼展约 1.30 m<br />扑翼预览放慢（游戏 40 rad/s）',
  },
];
