# HarborDefender说明

- 为本地项目`C:\Users\bruce\Documents\WebProjects\HarborDefender`设计资产，注入资产。
- 制作单位的尺寸，性能要求参考注入的项目

# RULES

- 单位米

# SETUP

## 城防港加农炮（cannon）

兄弟项目唯一的守方单位，`DEFENSE_SLOTS` 三个城防位默认全满。调查来源：
`src/scene-assets/cannon.scene-asset.ts`（建模）、`src/battle-setup.ts`（挂载与补挂 helper）、
`src/level-config.ts`（COMBAT / DEFENSE_SLOTS / DEFENDER_BAR_Y）、
`src/cannon-aim-system.ts`、`src/cannon-fire-system.ts`、`src/components.ts`。

### 尺寸（实测包围盒，单位：米）

| 项 | 值 |
| --- | --- |
| 整体尺寸 X × Y × Z | 0.252 × 0.1847 × 0.373 |
| 包围盒中心 | (0, 0.0937, -0.0135) |
| 地面 | y = 0（轮底；实测最低点 0.0013，倒角所致） |
| 炮轴枢轴高度 | 0.15 |
| 炮口（gun_rotate 局部坐标） | (0, 0, -0.2) |
| 炮身最大半径 / 直径 | 0.036 / 0.072 |
| 轮距（X 向最外沿） | ±0.126 |
| 模型顶部 | 0.186（血条高度即按此值推导） |

安装位（`DEFENSE_SLOTS` + `mountDefenseUnit`）：x = -0.75 / 0 / +0.75，y = 0.84（墙顶 0.8 + 基座盘高 0.04），z = -1.3（`WALL_CENTER_Z`），朝向海面（-Z）。
基座盘直径 0.38、槽间距 0.75；模型 0.373 的进深几乎吃满基座盘，新资产不要再加深，宽度也不要超过 0.38 以免与相邻槽穿插。

### 节点组织

```
cannon                     Object3D   根节点 = 原型（无父级，clone 后逐个挂载）
├─ cannon-carriage         Mesh       332 tri，木材质（车架 + 四轮 + 横梁 + 楔块合并）
└─ gun_rotate              Object3D   位置 (0, 0.15, 0)，俯仰枢轴（旋转轴 = 炮耳轴心）
   └─ cannon-barrel         Mesh       1160 tri，铁材质（炮身 + 炮耳 + 尾钮合并）
```

运行时补挂（`decorateCombatPrototype`，只挂在原型上，克隆自动继承）：

- `gun_rotate/muzzle`：Object3D，位置 (0, 0, -0.2)，炮弹沿它的世界 -Z 射出。
- `cannon/hit_core`：Object3D，位置 = 包围盒中心（约 (0, 0.0937, -0.0135)），可命中核心。

命名契约：`gun_rotate`、`muzzle`、`hit_core` 三个名字被系统用 `getObjectByName` 查找，禁止改名。
本项目是单座单位，可沿用默认名；若改成多座同体，`hit_core` 与枢轴必须改名去重。

### 使用要点

- **原点与朝向**：轮子接地矩形中心为原点，y = 0 是地面；炮口朝 -Z（海一侧），炮尾 +Z。
- **变换**：根节点 `rotation.y` = 整炮水平回旋（yaw）；`gun_rotate.rotation.x` = 俯仰（pitch，正值抬炮口）。两者都由 `CannonAim` 组件驱动，系统每帧写入。
- **瞄准限位**：yaw ±45°，pitch 0–80°，默认 22.5°；刷新/重开回到 yaw 0、pitch 22.5。
- **射击**：沿 `muzzle` 世界 -Z，初速 13.75 m/s，重力 15 m/s²，仅守方炮弹有 1.0/s 空气阻力；间隔 2.5 s + [0.2, 0.5] s 抖动；炮弹来自 48 发共享对象池（球形，半径 0.0375）。
- **命中与死亡**：`hit_core` 半径 0.22 的球形判定；生命 100，被海盗炮弹命中掉 9，自己打海盗掉 20；归零后加 `Destroyed` 标签、整台隐藏（不销毁实体），并爆出 0.6 比例的木质/铁质碎片。
- **血条与维修**：血条高度 `barY = 0.186 + 0.28 = 0.466`（本体局部 y），宽度 0.5、缩放 0.6；维修按钮挂在血条左缘上方，维修按时间持续消耗钱包。
- **交互**：整台模型是唯一拖拽热区（`RayInteractable`，无分件热区）；浏览器水平/垂直拖动同时改 yaw / pitch，XR 用扳机 + 射线悬停起拖。
- **装配**：每座单位是原型的 `clone(true)`，几何与材质共享；不要对已放置实例的共享材质原地改参数，也不要 dispose 它们的几何/材质。
- **渲染成本**：合计 1492 tri / 4476 verts，2 个 Mesh = 2 draw call，2 个材质；三座同屏约 4.5k tri / 6 draw call。所有网格挂载时统一打开 `castShadow` / `receiveShadow`。
- **材质锁定**：`cannon-wood`（roughness 0.7 / metalness 0）与 `cannon-iron`（roughness 0.5 / metalness 1），`vertexColors: true`、基色纯白；颜色全部顶点色烘焙，无贴图，随机由固定种子 20261013 保证确定性。
- **交付形式**：不导出 GLB、不进 `src/assets.ts` 清单；在 `startBattle` 的加载流程里用 `requestAnimationFrame` 之后构建一次 `createCannon()` 原型，三座与后续重建都从该原型克隆。
- **风格锁定**：中世纪港口炮——木质双颊车架 + 四个实心木轮 + 前后横梁 + 楔形垫块，铁质车削炮身（炮口环、两道箍环、加厚炮尾、尾部球钮），硬边不圆滑。

### v2 资产（本仓库重建版，参考 `IMG_cannon.jpeg`）

- 代码：`HarborDefender/cannon/src/cannon-model.ts`，`createCannon()` 返回 `THREE.Group`。
- 公用浏览台：根工程 `viewer/`，所有资产共用，不再为单个资产单独出 HTML。
  资产在 `viewer/assets.ts` 注册，`npm run viewer:build` 生成自包含单文件 `viewer/preview.html`；
  URL 参数 `?asset=cannon&view=iso|front|side&yaw=&pitch=&hud=0&plate=0`。
- 实测包围盒（pitch 0）：0.239 × 0.203 × 0.350 m；地面 y = 0；炮轴 0.156 m。
- 炮身整体半径系数 0.76（最大直径约 0.086 m），轮距外沿 ±0.1195，车架宽 0.239 m，仍在基座盘 0.38 内。
- 炮口挂点 `muzzle`（gun_rotate 局部）：(0, 0, -0.185)；`hit_core` 由包围盒中心自动计算。
- 炮床只保留前段（z ≈ -0.130…-0.015），把后段让给抬炮时的炮尾摆动；pitch 0–80° 不再与木架穿插。
- 预览里的圆形基座盘属于浏览台，不在 `createCannon()` 内；`?plate=0` 可隐藏。
- 轮子不滚动，无动画节点；安装位（x/z/基座高度）与 v1 完全一致。

```
cannon                     Group
├─ cannon-carriage         Mesh  木：车架 + 四轮 + 前段炮床（合并）
├─ cannon-iron-fittings    Mesh  铁：轮胎、轮毂箍、铆钉、包角、轴帽、轴承铁箍
├─ gun_rotate              Group 位置 (0, 0.156, 0)，pitch 枢轴
│  ├─ cannon-barrel        Mesh  青铜炮身（Lathe 回转体）
│  ├─ cannon-barrel-fittings Mesh 金色凸箍 + 炮耳同心圆端盖
│  ├─ cannon-bore          Mesh  炮膛内筒（深色）
│  └─ muzzle               Object3D (0, 0, -0.185)
└─ hit_core                Object3D
```

- 契约不变：yaw = 根 `rotation.y`；pitch = `gun_rotate.rotation.x`（正值抬炮口）；炮口朝 -Z；三个节点名禁止改。
- 渲染成本：12412 tri / 5 draw call / 4 材质；三座约 37k tri / 15 draw call（v1 为 1492 tri / 2 draw call）。
- 材质：程序化 canvas 贴图，固定种子 20261013——木 `map/roughnessMap/normalMap`，
  青铜 `map/roughnessMap/metalnessMap/normalMap`（绿锈为低金属度+高粗糙度，磨亮处反之），
  黄铜为凸箍/端盖纯色金属，铁件近黑。纹理首次 `createCannon()` 时生成并缓存，三座共享，勿原地改参数或 dispose。
- 兼容提示：新顶 0.203，血条 `barY` 仍为 0.466，留白 0.263（v1 为 0.28）；若要维持旧留白，改 `DEFENDER_BAR_Y = 0.483`。