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
- **交付形式**：不产出 GLB；资产以 `model.ts` 形式由根工程 `viewer/assets.ts` 注册；在 `startBattle` 的加载流程里用 `requestAnimationFrame` 之后构建一次 `createCannon()` 原型，三座与后续重建都从该原型克隆。
- **风格锁定**：中世纪港口炮——木质双颊车架 + 四个实心木轮 + 前后横梁 + 楔形垫块，铁质车削炮身（炮口环、两道箍环、加厚炮尾、尾部球钮），硬边不圆滑。

### v2 资产（本仓库重建版，参考 `cannon/IMG_cannon.jpeg`）

- 代码：`HarborDefender/cannon/src/cannon-model.ts`，`createCannon()` 返回 `THREE.Group`。
- 公用浏览台：根工程 `viewer/`，所有资产共用，不再为单个资产单独出 HTML。
  资产在 `viewer/assets.ts` 注册，`npm run viewer:build` 生成自包含单文件 `viewer/preview.html`；
  URL 参数 `?asset=cannon&view=iso|front|side&yaw=&pitch=&hud=0&plate=0`。
- 实测包围盒（pitch 0）：0.228 × 0.199 × 0.350 m；最低点 y = 0.0018（十边形轮圈弦高）；炮轴 0.156 m。
- 炮身整体半径系数 0.76（最大直径约 0.086 m），轮距外沿 ±0.114，车架宽 0.228 m，仍在基座盘 0.38 内。
- 炮口挂点 `muzzle`（gun_rotate 局部）：(0, 0, -0.185)；`hit_core` 由包围盒中心自动计算（约 (0, 0.101, -0.010)）。
- 炮床只保留前段（z ≈ -0.130…-0.015），把后段让给抬炮时的炮尾摆动；pitch 0–80° 不再与木架穿插。
- 预览里的圆形基座盘属于浏览台，不在 `createCannon()` 内；`?plate=0` 可隐藏。
- 轮子不滚动，无动画节点；安装位（x/z/基座高度）与 v1 完全一致。

```
cannon                     Group
├─ cannon-carriage         Mesh   1180 tri，静态：木（车架/轮圈/轮辐/轮毂/轴/炮床）+ 铁（轮胎箍/轴帽/铆钉/包角/轴承箍）
├─ gun_rotate              Group  位置 (0, 0.156, 0)，pitch 枢轴
│  ├─ cannon-barrel        Mesh   600 tri，青铜炮身 + 黄铜凸箍 + 深色炮膛（合并为一个 Mesh）
│  └─ muzzle               Object3D (0, 0, -0.185)
└─ hit_core                Object3D
```

- 契约不变：yaw = 根 `rotation.y`；pitch = `gun_rotate.rotation.x`（正值抬炮口）；炮口朝 -Z；三个节点名禁止改。
- 单炮渲染成本：1780 tri / 2 draw call / 1 材质 / 3 张贴图；三座约 5.3k tri / 6 draw call。
  （优化前 v2：12412 tri / 5 draw call / 4 材质。）
- 材质：单张 1024 颜色图集，分格 wood 512 / bronze 512 / iron 256 / brass 256 / bore 128；
  粗糙度/金属度与法线各用 512 图集（分格同步减半）；
  `map` 为 sRGB 颜色，`roughnessMap` 与 `metalnessMap` 共用一张 G=roughness、B=metalness 的贴图，另有 `normalMap`。
  木纹/青铜锈蚀仍由固定种子 20261013 程序化生成，首次 `createCannon()` 时构建并缓存，三座共享，勿原地改参数或 dispose。
- 低模取舍：炮身 Lathe 14 段 + 11 点轮廓；凸箍 Torus 3×10（不带炮耳端盖）；轮圈 10 段、6 根轮辐；铆钉为六边形贴面片；轮毂箍/轮毂圆顶已删除。
- UV 全部映射进各自图集分格（内缩 2px 防溢色），贴图用 ClampToEdge。
- 兼容提示：新顶 0.2007，血条 `barY` 仍为 0.466，留白 0.265（v1 为 0.28）；若要维持旧留白，改 `DEFENDER_BAR_Y = 0.481`。

## 城防港城墙（wall）

兄弟项目原城墙只是一块平顶石头：`src/scene-assets/harbor-wall.scene-asset.ts`，
盒体 3.4 × 0.5 × 0.4 m，放置于 `(0, 0.55, -1.3)`（`battle-setup.ts`），墙顶 y = 0.8、临海面 z = -1.5、
陆地侧 z = -1.1，无城垛、无护墙。本仓库资产补齐乱石墙身、临海垛口护墙与墙顶碎石，不含炮、基座盘与海面。

- 代码：`HarborDefender/wall/src/wall-model.ts`，`createHarborWall(skyReflection?: THREE.Texture | null)` 返回 `THREE.Group`。
  浏览台经 `viewer/sky-cube.ts` 的 `createWallWithPreviewSky()` 传入程序化天空 cubemap（浏览台自身无天幕）。
- 浏览台：`?asset=wall`，资产 id `wall`。
- 实测包围盒：3.018 × 0.713 × 0.522 m（含战损削角与碎石）；墙身本体 3.006 × 0.500 × 0.524。
  取数：2026-11-28 `npm run viewer:build -- wall` 后 headless Chrome 访问 `?asset=wall&hud=1`，读读数面板。
  此前文档记 3.017，该数字最后一次写入是提交 f681043（v5 建档），其后 2e51139 改模型时未重测，以本次实测为准。
  原点仍在墙身中心，墙顶局部 y = +0.25（放置 0.55 后世界 0.8）；三个炮位安装盘（半径 0.23）内 90 个顶点 y 全为 0.2500，绝对水平。
- 墙长按反馈从 3.4 缩到 3.0（原游戏墙太长）；兄弟项目 `WALL_WIDTH = 3.4` 不用改，墙左右各短 0.2 m 仅为视觉变化，
  不影响炮位、停船带、海面与碎块判定。
- 墙身厚 0.4 → 0.5：后沿保持陆地侧局部 +0.20（世界 -1.10）不变，多出的 0.1 m 全部给临海侧。
  临海面局部 -0.30（世界 -1.60），炮位 ±45° 回转时前轮包络最外沿约 z = -1.482，垛体内表面 -1.50，间隙 0.018。
- 临海垛口护墙：6 座垛体，厚 0.10、高 0.22（顶世界 1.02），无压顶石。
  垛体 X 区间：±[0.24, 0.51]（炮位之间，宽 0.27）、±[0.99, 1.21]、±[1.28, 1.50]（两端，宽 0.22）；
  炮位处留 0.48 宽垛口。回转包络半宽 0.182，距最近垛边 0.058，绝不会穿垛。
- 硬边战损：墙身 24 × 4 × 2 段，位移按 9 cm 网格量化，块与块之间直接错位，断口是硬折面而不是曲线；
  两端台阶式削低（只动陆侧墙顶，z < -0.08 的垛体压住区不削）、陆侧墙顶两处啃口、临海面三处平底凿痕。
  6 座垛体各 3 行顶面，顶行按 32 mm 块整块削低 0.02–0.095 m、次行轻微错位。
- 碎石：6 块大块低模碎石（二十面体 20 tri/块，约 0.14–0.22 m 宽）散在墙顶两端，合并进 `wall-stone`；不做沙包。
- 节点：`wall` → `wall-stone`（墙身 + 垛体 + 碎石合并）、`wall-puddle`（墙顶 3 处积水合并，源码 `puddleSpots` 3 条）；
  无 `gun_rotate` / `muzzle` / `hit_core`。
- 材质：1 个 `MeshStandardMaterial`（`wall-stone`），颜色贴图 1024 乱石砌墙，粗糙度/金属度与法线为 512，
  `roughnessMap` 与 `metalnessMap` 共用 G=roughness、B=metalness 贴图，基色纯白。
  石墙为 6 × 6 抖动 Voronoi 单元（约 14% 单元并给邻居形成大石），缝宽 8 px 即灰缝，贴图无缝平铺，UV 1.6 次/m；
  颜色贴图叠加低频积垢，竖向流痕只留稀疏几道。无苔藓；法线强度 4.0，石棱明暗更重，砖块更凸。
  另有 1 个 `wall-puddle` 材质：v6 起改为 `ShaderMaterial` 的 unlit 天空镜面——顶点用 `mat3(modelMatrix)` 保留世界空间法线，
  片元 `reflect` 后 `textureCube(uSkyCube, …)` 采样天空，手动 `linearToSRGB` 编码，按掠射角以 `mix(0.6, 1.0, pow(1 - ndv, 2))`
  调镜面权重，`uOpacity` 0.92；无贴图槽（天空由外部 cubemap 传入），`castShadow = false`（否则会在石面上压出一圈脏影）。
  v5 及以前是 `MeshStandardMaterial`（0x1d2426 / roughness 0.05 / opacity 0.9）。
  水膜三角面须朝 +Y（绕序反过来会被背面剔除，预览里直接看不见）。
- 积水：墙顶 +Y 面 3 片 14 边不规则薄水膜（每片 14 tri），左右不对称，局部 y = +0.251（高墙顶 1 mm），
  中心 xz = (0.372, -0.078)、(0.98, -0.15)、(-0.98, -0.155)，尺寸 0.18–0.21 × 0.11–0.12 m；
  已避开炮位安装盘（±0.75/0，半径 0.23）、陆侧墙顶啃口（x = ±0.37 且 z > 0.12）与两端碎石堆。
  不传 `skyReflection` 时积水为纯黑薄膜；浏览台传的是 `viewer/sky-cube.ts` 生成的 6 面 64 × 64 程序化天空 cubemap。
- 渲染成本：实测 1546 tri / 2 Mesh = 2 draw call / 2 材质 / 3 张贴图（碎石 120 tri、积水 42 tri；3 张贴图全在 `wall-stone`，
  积水采样的是外部 cubemap，不占材质贴图槽）。取数同尺寸一项。
- 兼容：兄弟项目常量不用改。碎块落水仍按 z < -1.5 判定，最外侧 0.1 m 墙体上的少量碎块会直接落水；
  boss 扫射瞄准 y = 1.05 仍在垛口（1.02）之上。
- 墙顶必须保持绝对水平：战损只削两端陆侧墙顶与陆侧啃口，三个炮位安装盘半径 0.23 内的墙顶顶点保持 y = +0.25 不变。
- 交付现状：兄弟项目 v6（提交 59c001b）已回流本仓库（提交 1b09ab6），两侧同名文件现在只差头部注释（本仓库按要求删除），
  几何与材质代码逐字一致；差异明细见「交付与注入（实测）」第 2 节。

## 海盗轰炸机（bombardier）

### 1 代码与入口

- 代码：`HarborDefender/bombardier/src/bombardier-model.ts`
- 导出：`createBombardier(): THREE.Group`（文件唯一导出，无参数）
- 浏览台：资产 id `bombardier`；`lift = 0.3`、`pitchNode = bombardier`、pitch −25…35°、yaw ±45°（`viewer/assets.ts`）
- 取数：2026-11-28 全量构建（`npm run viewer:build`）后，Chromium 1248 无头访问
  `http://127.0.0.1:8123/viewer/preview.html?asset=bombardier`；尺寸、接地、tri、draw call 取读数面板与 `window.__assetInfo`，
  节点局部坐标与逐 Mesh tri/verts 由浏览器内遍历同一工厂产物得到。

### 2 尺寸（实测包围盒，单位：米）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 整体尺寸 X × Y × Z | 1.3800 × 0.5887 × 1.3800 | 浏览器面板 |
| 包围盒 min（模型局部） | (-0.6900, -0.2297, -0.6500) | 浏览器面板 `__assetInfo.min` |
| 包围盒 max（模型局部） | (0.6900, 0.3590, 0.7300) | 浏览器面板 `__assetInfo.max` |
| 包围盒中心（模型局部） | (0, 0.0646, 0.0400) | 浏览器遍历（= `hit_core` 位置） |
| 接地 y（面板值，含 lift 0.3） | 0.0703 | 浏览器面板 |
| 最低点（模型局部 y） | -0.2297 | 浏览器面板 `__assetInfo.min.y` |
| 最高点（模型局部 y） | 0.3590（挂载后世界 0.6590） | 浏览器面板 + `lift` 代码常量 |

### 3 节点树

```
bombardier                Group     根，局部 (0, 0, 0)
├─ bombardier-body        Mesh      1204 tri / 3612 verts，局部 (0, 0, 0)，材质 atlas
├─ propellers             Group     局部 (0, 0.296, 0.04)
│  └─ propeller-main      Group     局部 (0, 0, 0)，浏览台每帧写 rotation.y = 时间 × 8
│     └─ bombardier-rotor Mesh      152 tri / 456 verts，材质 atlas（4 片桨叶 + 根部绳绑合并）
├─ muzzle                 Object3D  局部 (0, -0.1785, -0.102)
└─ hit_core               Object3D  局部 (0, 0.0646, 0.0400)（= 整体包围盒中心）
```

- 节点名：`bombardier` / `bombardier-body` / `propellers` / `propeller-main` / `bombardier-rotor` / `muzzle` / `hit_core`
  （外部查找契约需对照兄弟项目确认，勿改名）

### 4 材质清单

| 材质名 | 类型 | roughness | metalness | 贴图 | 共享 |
| --- | --- | --- | --- | --- | --- |
| （未命名） | MeshStandardMaterial | 1（由 roughnessMap 调制） | 1（由 metalnessMap 调制） | 有：`map` 512²、`roughnessMap`＋`metalnessMap` 共用 256²（G=roughness、B=metalness）、`normalMap` 256² | 是（模块级 `cache`，同工厂所有实例共用） |

- `side = DoubleSide`；基色 0xffffff，颜色全部来自 512 颜色图集；无顶点色；`viewer/assets.ts` 与模型均未设材质名，故材质名一栏为「未命名」。

### 5 渲染成本

- 实测 1356 tri / 4068 verts / 2 Mesh = 2 draw call / 1 材质 / 3 张贴图。
- 拆分：机身 1204 tri + 旋翼 152 tri；贴图张数按唯一图像计（`roughnessMap` 与 `metalnessMap` 共用同一张）。

### 6 朝向与安装约定

- 机头朝本地 -Z，原点为飞行姿态中心（机身上下并不对称：局部 y 跨 −0.2297…0.3590）。
- 旋翼轴心局部 y = 0.296、z = 0.04；桨盘半径 0.69，XZ 包围盒 1.38 × 1.38 即由桨盘撑出。
- 挂载：浏览台 `lift = 0.3` 写在 `root.position.y`，pitch 作用节点为根 `bombardier`（整机俯仰），yaw 为根 `rotation.y`。
- `muzzle` = 机腹投弹口 (0, -0.1785, -0.102)（代码常量 `DIM.muzzleY / DIM.muzzleZ`，与节点实测一致）。
- 源码头部注释声明「`propellers` 的子旋翼节点绕自身 +Y 旋转（兄弟项目 8 rad/s）」；本仓库浏览台按 8 rad/s 驱动 `propeller-main`。

## 怒岛号 boss（boss_islewrath）

### 1 代码与入口

- 代码：`HarborDefender/boss_islewrath/src/boss-islewrath-model.ts`
- 导出：`createBossIslewrath(): THREE.Group`（文件唯一导出，无参数）
- 浏览台：资产 id `boss-islewrath`；无 `lift`、`pitchNode = gun_rotate_1`、pitch −5…60°、yaw ±45°（`viewer/assets.ts`）
- 取数：同 bombardier，`?asset=boss-islewrath`，尺寸/tri/draw call 取读数面板与 `window.__assetInfo`，节点数据由浏览器内遍历得到。

### 2 尺寸（实测包围盒，单位：米）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 整体尺寸 X × Y × Z | 1.9260 × 2.2913 × 1.9260 | 浏览器面板 |
| 包围盒 min（模型局部） | (-0.9630, -0.7620, -0.9630) | 浏览器面板 `__assetInfo.min` |
| 包围盒 max（模型局部） | (0.9630, 1.5293, 0.9630) | 浏览器面板 `__assetInfo.max` |
| 包围盒中心（模型局部） | (0, 0.3836, 0) | 浏览器遍历（= `hit_core_hull` 位置） |
| 接地 y（面板值，无 lift） | -0.7620 | 浏览器面板 |
| 最低点（模型局部 y） | -0.7620（水下锥形封底） | 浏览器面板 |
| 最高点（模型局部 y） | 1.5293（激光炮顶） | 浏览器面板 |

### 3 节点树

```
boss_islewrath            Group     根，局部 (0, 0, 0)
├─ gun_t1                 Group     局部 (-0.62, 0.66, -0.46)，前二炮台
│  ├─ hit_core_1          Object3D  局部 (0, 0.075, 0)，挂在 gun_t（不在 gun_rotate_1 下）
│  └─ gun_rotate_1        Group     局部 (0, 0, 0)，scale 0.75
│     ├─ turret-barrel-1  Mesh      252 tri / 756 verts
│     └─ muzzle_1         Object3D  局部 (0, 0, -0.34)（父级 0.75 缩放后等效 -0.255）
├─ gun_t2                 Group     局部 (0.62, 0.66, -0.46)，结构同 gun_t1（hit_core_2 / gun_rotate_2 / turret-barrel-2 / muzzle_2）
├─ gun_t3                 Group     局部 (0.6, 0.94, 0.48)，后二炮台（hit_core_3 / gun_rotate_3 / turret-barrel-3 / muzzle_3）
├─ gun_t4                 Group     局部 (-0.6, 0.94, 0.48)，结构同 gun_t3
├─ laser_turret           Group     局部 (0, 1.32, 0.05)
│  ├─ hit_core_laser      Object3D  局部 (0, 0.0405, 0.054)
│  └─ gun_rotate_laser    Group     scale 0.675
│     ├─ laser-cannon     Mesh      1008 tri / 3024 verts
│     ├─ laser-core       Mesh      300 tri / 900 verts，材质 glow
│     └─ muzzle_laser     Object3D  局部 (0, 0, -0.95)
├─ boss-hull              Mesh      3512 tri / 10536 verts，船体 + 四炮座 + 装甲罩 + 栏杆合并
└─ hit_core_hull          Object3D  局部 (0, 0.3836, 0)（= 整体包围盒中心）
```

- 节点名：`boss_islewrath` / `gun_t1`～`gun_t4` / `gun_rotate_1`～`gun_rotate_4` / `muzzle_1`～`muzzle_4` /
  `hit_core_1`～`hit_core_4` / `laser_turret` / `gun_rotate_laser` / `muzzle_laser` / `hit_core_laser` /
  `turret-barrel-1`～`turret-barrel-4` / `laser-cannon` / `laser-core` / `boss-hull` / `hit_core_hull`
  （外部查找契约需对照兄弟项目确认，勿改名）
- 本模型没有无后缀的 `gun_rotate` / `muzzle` / `hit_core`，浏览台面板的「节点」行因此为空；pitch 由 `pitchNode = gun_rotate_1` 驱动。
- 带序号的节点名由模板生成（`gun_t${t.id}`、`gun_rotate_${t.id}`、`muzzle_${t.id}`、`hit_core_${t.id}`、`turret-barrel-${t.id}`，id = 1…4），
  在源码里 grep 请用模板串而不是具体序号。

### 4 材质清单

| 材质名 | 类型 | roughness | metalness | 贴图 | 共享 |
| --- | --- | --- | --- | --- | --- |
| （未命名） | MeshStandardMaterial | 1（由 roughnessMap 调制） | 1（由 metalnessMap 调制） | 有：`map` 1024²、`roughnessMap`＋`metalnessMap` 共用 512²（G=roughness、B=metalness）、`normalMap` 512² | 是（模块级 `cache`） |
| （未命名） | MeshBasicMaterial | 不适用 | 不适用 | 无 | 是（同一 `cache`）；颜色 0xff2a16、`toneMapped: false`，用于 `laser-core` |

- 颜色 1024 图集分格：iron 256 / red 256 / wood 256 / woodDark 128 / rust 128 / bone 128 / bore 128 / skull（`CELL` 常量）；
  粗糙度金属度与法线图集为颜色图集的 1/2 分辨率（512²），颜色图集为 sRGB、其余两张为线性。

### 5 渲染成本

- 实测 5828 tri / 17484 verts / 7 Mesh = 7 draw call / 2 材质 / 3 张贴图。
- 拆分：船体 3512 tri + 四根炮管各 252 tri（1008）+ 激光炮 1008 + 激光红芯 300。

### 6 朝向与安装约定

- 船头朝本地 -Z，+Z 为后侧；炮口沿本地 -Z 射出，炮管与 `muzzle_*` 均朝 -Z。
- 枢轴高度：前二炮台 y = 0.66、后二炮台 y = 0.94、激光塔 y = 1.32（`DIM.frontPivotY / rearPivotY / laserPivotY`）；
  后二高于前二，越顶射击不会穿过前排炮台。
- 缩比：`gun_rotate_1`～`4` 统一 0.75（`DIM.gunScale`），`gun_rotate_laser` 0.675（`DIM.laserScale`）。
- 炮口局部坐标：炮台 `muzzle_N` z = -0.34（受 0.75 缩放），激光 `muzzle_laser` z = -0.95（受 0.675 缩放）。
- 无 `lift`，原点即水线以上船体基准（水下锥底局部 y = -0.7620）；浏览台把模型直接放在地面 y = 0 上时整体沉入 -0.762。

## 海盗扑翼飞行器（ornithopter）

### 1 代码与入口

- 代码：`HarborDefender/ornithopter/src/ornithopter-model.ts`
- 导出：`createOrnithopter(): THREE.Group`（文件唯一导出，无参数）
- 浏览台：资产 id `ornithopter`；`lift = 0.27`、`pitchNode = ornithopter`、pitch −25…35°、yaw ±45°（`viewer/assets.ts`）
- 取数：同 bombardier，`?asset=ornithopter`。

### 2 尺寸（实测包围盒，单位：米）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 整体尺寸 X × Y × Z | 1.4010 × 0.4700 × 0.8422 | 浏览器面板 |
| 包围盒 min（模型局部） | (-0.7005, -0.2300, -0.3930) | 浏览器面板 `__assetInfo.min` |
| 包围盒 max（模型局部） | (0.7005, 0.2400, 0.4492) | 浏览器面板 `__assetInfo.max` |
| 包围盒中心（模型局部） | (0, 0.0050, 0.0281) | 浏览器遍历（= `hit_core` 位置） |
| 接地 y（面板值，含 lift 0.27） | 0.0400 | 浏览器面板 |
| 最低点（模型局部 y） | -0.2300 | 浏览器面板 `__assetInfo.min.y` |
| 最高点（模型局部 y） | 0.2400（挂载后世界 0.5100） | 浏览器面板 + `lift` 代码常量 |

### 3 节点树

```
ornithopter               Group     根，局部 (0, 0, 0)
├─ ornithopter-body       Mesh      827 tri / 2481 verts，局部 (0, 0, 0)，含双翼 / 尾翼 / 机腹投石口 / 起落架
├─ propellers             Group     局部 (0, 0.005, -0.318)，rotation.x = -π/2（把桨轴 +Y 对到机头轴线）
│  └─ propeller-main      Group     局部 (0, 0, 0)，浏览台每帧写 rotation.y = 时间 × 12
│     └─ ornithopter-prop Mesh      176 tri / 528 verts（4 片桨叶 + 桨毂 + 整流锥 + 箍环合并）
├─ muzzle                 Object3D  局部 (0, -0.158, 0.042)
└─ hit_core               Object3D  局部 (0, 0.0050, 0.0281)（= 整体包围盒中心）
```

- 节点名：`ornithopter` / `ornithopter-body` / `propellers` / `propeller-main` / `ornithopter-prop` / `muzzle` / `hit_core`
  （外部查找契约需对照兄弟项目确认，勿改名）
- 无 `wing_left` / `wing_right` 等扑翼节点（源码注释明确取消扑翼）。

### 4 材质清单

| 材质名 | 类型 | roughness | metalness | 贴图 | 共享 |
| --- | --- | --- | --- | --- | --- |
| （未命名） | MeshStandardMaterial | 1（由 roughnessMap 调制） | 1（由 metalnessMap 调制） | 有：`map` 512²、`roughnessMap`＋`metalnessMap` 共用 256²（G=roughness、B=metalness）、`normalMap` 256² | 是（模块级 `cache`） |

- `side = DoubleSide`（翼面为单层薄面，需要双面可见）；基色 0xffffff，颜色全部来自 512 颜色图集；无顶点色；材质未命名。

### 5 渲染成本

- 实测 1003 tri / 3009 verts / 2 Mesh = 2 draw call / 1 材质 / 3 张贴图。
- 拆分：机身 827 tri + 螺旋桨 176 tri。

### 6 朝向与安装约定

- 船头（机头）朝本地 -Z，原点为飞行姿态中心；翼展即 X 向 1.4010。
- 螺旋桨组局部 (0, 0.005, -0.318)，整组 rotation.x = -π/2（桨盘垂直于 Z 轴、立在机头前方）；`propeller-main` 绕本地 +Y 自转即绕机头轴线旋转。
  桨盘扫掠决定整体高度：局部 y 的 -0.2300…0.2400 与 z 下限 -0.3930 均由桨叶撑出，机身本体只有 -0.1548…0.1967。
- 挂载：浏览台 `lift = 0.27` 写在 `root.position.y`，pitch 作用节点为根 `ornithopter`，yaw 为根 `rotation.y`。
- `muzzle` = 机腹投石口 (0, -0.158, 0.042)（代码常量 `DIM.muzzleY / DIM.muzzleZ`，与节点实测一致）。
- 浏览台 `animate` 驱动 `propeller-main` 12 rad/s（源码头部注释写「兄弟项目 8 rad/s」，以 `viewer/assets.ts` 的实现为准）。

## 海盗船（pirate-ship）

### 1 代码与入口

- 代码：`HarborDefender/pirate-ship/src/pirate-ship-model.ts`
- 导出：`createPirateShip(): THREE.Group`（文件唯一导出，无参数）
- 浏览台：资产 id `pirate-ship`；无 `lift`、`pitchNode` 用默认 `gun_rotate`、pitch −10…40°、yaw ±45°（`viewer/assets.ts`）
- 取数：同 bombardier，`?asset=pirate-ship`。

### 2 尺寸（实测包围盒，单位：米）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 整体尺寸 X × Y × Z | 0.5403 × 0.9975 × 1.3535 | 浏览器面板 |
| 包围盒 min（模型局部） | (-0.2702, -0.1200, -0.7035) | 浏览器面板 `__assetInfo.min` |
| 包围盒 max（模型局部） | (0.2702, 0.8775, 0.6500) | 浏览器面板 `__assetInfo.max` |
| 包围盒中心（模型局部） | (0, 0.3788, -0.0268) | 浏览器遍历（= `hit_core` 位置） |
| 接地 y（面板值，无 lift） | -0.1200 | 浏览器面板 |
| 最低点（模型局部 y） | -0.1200（龙骨，`DIM.keel`） | 浏览器面板 |
| 最高点（模型局部 y） | 0.8775（桅顶/帆顶，`DIM.mastTop`） | 浏览器面板 |

### 3 节点树

```
pirate-ship               Group     根，局部 (0, 0, 0)，原点在水线面中心
├─ ship-hull              Mesh      872 tri / 2616 verts，船壳 + 甲板 + 舷墙 + 上层建筑 + 索具 + 桅帆合并
├─ cannon_mount           Group     局部 (0, 0.345, -0.38)，水平回旋枢轴
│  ├─ gun-mount           Mesh      68 tri / 204 verts（炮盘/夹板，随 cannon_mount 转，不随俯仰）
│  └─ gun_rotate          Group     局部 (0, 0, 0)，俯仰枢轴
│     ├─ ship-barrel      Mesh      136 tri / 408 verts
│     └─ muzzle           Object3D  局部 (0, 0, -0.2)
└─ hit_core               Object3D  局部 (0, 0.3788, -0.0268)（= 整体包围盒中心）
```

- 节点名：`pirate-ship` / `ship-hull` / `cannon_mount` / `gun-mount` / `gun_rotate` / `ship-barrel` / `muzzle` / `hit_core`
  （外部查找契约需对照兄弟项目确认，勿改名）

### 4 材质清单

| 材质名 | 类型 | roughness | metalness | 贴图 | 共享 |
| --- | --- | --- | --- | --- | --- |
| （未命名） | MeshStandardMaterial | 1（由 roughnessMap 调制） | 1（由 metalnessMap 调制） | 有：`map` 512²、`roughnessMap`＋`metalnessMap` 共用 256²（G=roughness、B=metalness）、`normalMap` 256² | 是（模块级 `cache`，三个 Mesh 共用一份） |

- `side = DoubleSide`，`alphaTest = 0.5`（帆面破洞由颜色图集 alpha 挖空，其余分格 alpha 全为 1）；基色 0xffffff；无顶点色；材质未命名。

### 5 渲染成本

- 实测 1076 tri / 3228 verts / 3 Mesh = 3 draw call / 1 材质 / 3 张贴图。
- 拆分：船体 872 tri + 炮盘 68 tri + 炮管 136 tri；源码头部注释写「2 个 Mesh = 2 draw call」，与实测的 3 个 Mesh 不符，以实测为准。

### 6 朝向与安装约定

- 船头朝本地 -Z，+Z 为船尾；原点在水线面中心，龙骨局部 y = -0.12（沉入水下，浏览台里接地 y 即显示 -0.12）。
- 水平回旋枢轴 `cannon_mount` 局部 (0, 0.345, -0.38)；源码注释声明炮盘与炮管随 `cannon_mount` 水平旋转、只有炮管随 `gun_rotate` 俯仰。
  浏览台的 yaw 写在根 `rotation.y`，pitch 写在 `gun_rotate.rotation.x`。
- 炮口：`muzzle` 在 `gun_rotate` 局部 z = -0.2，叠加枢轴 z = -0.38 后世界 z ≈ -0.58。
- 无 `lift`；模型顶部（桅顶/帆顶）局部 y = 0.8775（`DIM.mastTop`）。

## 海盗船长头颅（pirate_chief）

### 1 代码与入口

- 代码：`HarborDefender/pirate_chief/src/pirate-chief-model.ts`
- 导出：`createPirateChief(): THREE.Group`（文件唯一导出，无参数）
- 浏览台：资产 id `pirate-chief`；无 `lift`、`pitchNode = pirate-chief`、pitch −15…15°、yaw ±45°（`viewer/assets.ts`）
- 取数：同 bombardier，`?asset=pirate-chief`。

### 2 尺寸（实测包围盒，单位：米）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 整体尺寸 X × Y × Z | 0.4100 × 0.4330 × 0.4100 | 浏览器面板 |
| 包围盒 min（模型局部） | (-0.2050, 0.0040, -0.2050) | 浏览器面板 `__assetInfo.min` |
| 包围盒 max（模型局部） | (0.2050, 0.4370, 0.2050) | 浏览器面板 `__assetInfo.max` |
| 包围盒中心（模型局部） | (0, 0.2205, 0) | 浏览器遍历（由 min/max 计算） |
| 接地 y（面板值，无 lift） | 0.0040 | 浏览器面板 |
| 最低点（模型局部 y） | 0.0040（坐垫法兰底面） | 浏览器面板 |
| 最高点（模型局部 y） | 0.4370（三角帽冠顶） | 浏览器面板 |

### 3 节点树

```
pirate-chief              Group     根，局部 (0, 0, 0)
├─ hit_core               Object3D  局部 (0, 0.215, 0)，固定常量，非包围盒中心（中心为 0.2205）
├─ pirate-chief-mesh      Mesh      1196 tri / 3588 verts，坐垫法兰 + 颈圈 + 头骨 + 口罩 + 独眼 + 三角帽合并
├─ pirate-chief-glow      Mesh      144 tri / 432 verts，材质 glow（四颗指示灯 + 红色镜芯）
└─ hp_blood               Object3D  局部 (0, 0.45, 0)，帽顶血条挂点
```

- 节点名：`pirate-chief` / `hit_core` / `pirate-chief-mesh` / `pirate-chief-glow` / `hp_blood`
  （外部查找契约需对照兄弟项目确认，勿改名）

### 4 材质清单

| 材质名 | 类型 | roughness | metalness | 贴图 | 共享 |
| --- | --- | --- | --- | --- | --- |
| （未命名） | MeshStandardMaterial | 1（由 roughnessMap 调制） | 1（由 metalnessMap 调制） | 有：`map` 512²、`roughnessMap`＋`metalnessMap` 共用 512²（G=roughness、B=metalness）、`normalMap` 512² | 是（模块级 `cache`） |
| （未命名） | MeshBasicMaterial | 不适用 | 不适用 | 无 | 是（同一 `cache`）；颜色 0xff2a16、`toneMapped: false` |

- 颜色图集 512² 分格：iron 192 / red 192 / dark 64 / bone 64 / bore 64 / rust 64（`CELL` 常量）；粗糙度金属度与法线同为 512²，独立三张。

### 5 渲染成本

- 实测 1340 tri / 4020 verts / 2 Mesh = 2 draw call / 2 材质 / 3 张贴图。
- 拆分：静态件 1196 tri + 发光件 144 tri。

### 6 朝向与安装约定

- 面部朝本地 -Z；设计基准为「坐垫平面 y = 0」，实测最低点在坐垫法兰底面 y = 0.0040。
- `hit_core` 固定 (0, 0.215, 0)，不随包围盒变化；`hp_blood` 在帽顶 (0, 0.45, 0)。
- 无 `lift`、无枢轴子节点：浏览台 pitch 写在根 `pirate-chief.rotation.x`（−15…15°），yaw 写在根 `rotation.y`。
- 单件为独立头颅，不含躯干；挂载时以坐垫平面（y≈0）作为承接面。

## 交付与注入（实测）

取数方式（2026-11-28）：对本仓库 7 个 `model.ts` 与兄弟项目
`C:\Users\bruce\Documents\WebProjects\HarborDefender\src\scene-assets\*.scene-asset.ts` 逐件算 SHA256，
再用 `git diff --no-index` 做行级比对；挂载事实取自兄弟项目 `src/battle-setup.ts` 的源码行号。

### 1 交付方式

- 交付形态是**拷贝**，不是路径引用：本仓库 `<资产>/src/<name>-model.ts` 覆盖到兄弟项目
  `src/scene-assets/<映射名>.scene-asset.ts`。兄弟项目所有 import 都指向自身 `./scene-assets/*.js`，
  没有跨仓库相对路径，也没有 symlink。
- 文件名映射（本仓库 → 兄弟项目）：cannon → `cannon.scene-asset.ts`；wall → `harbor-wall.scene-asset.ts`；
  boss_islewrath → `boss-islewrath.scene-asset.ts`；pirate_chief → `pirate-chief.scene-asset.ts`；
  bombardier / ornithopter / pirate-ship 同名加 `.scene-asset` 后缀。
- 导入写法带 `.js` 后缀（`battle-setup.ts`:54-65），符合兄弟项目的 ESM 约定。
- 交付包含一次兄弟项目侧的提交：7 件资产在兄弟项目仓库各有自己的提交（见下表末列），不是一次性批量提交。
- 交付后本仓库再改模型不会自动同步；重交付 = 重新覆盖 + 兄弟项目侧提交，字节数与下表会再次变化。

### 2 逐件核对（本仓库 vs 兄弟项目，2026-11-28）

| 资产 | 本仓库字节 | 兄弟项目字节 | 行级差异 | 结论 | 兄弟项目落库提交 |
| --- | --- | --- | --- | --- | --- |
| cannon | 22797 | 22797 | 0 | SHA256 完全相同 | c737602 2026-11-19 |
| pirate-ship | 38106 | 38106 | 0 | SHA256 完全相同 | c737602 2026-11-19 |
| bombardier | 37519 | 37553 | +4 / −3 | 仅文件头注释 | b2a0969 2026-11-19 |
| ornithopter | 34403 | 34562 | +3 / −1 | 仅文件头注释 | 3d15107 2026-11-19 |
| boss_islewrath | 31261 | 31340 | +2 / −1 | 仅文件头注释 | 669423a 2026-11-20 |
| pirate_chief | 21176 | 21255 | +2 / −1 | 仅文件头注释 | 669423a 2026-11-20 |
| wall | 20784 | 21679 | −13 / 0 | 仅缺头部注释（本仓库按要求删除），几何与材质代码逐字一致 | 59c001b 2026-11-22 |

- 注释类差异的固定内容：兄弟项目侧把「对齐兄弟项目 xxx.glb」「兄弟项目 8 rad/s」「保持兄弟项目 barY = 0.479」
  这类本仓库口径改写成兄弟项目自身口径（`PROP 8 rad/s`、`健康条 barY 沿用该高度`、`level-wave-system 硬依赖`），
  并统一加一行「与海盗船、轰炸机一致：loading 阶段在代码中构建，不再固化 GLB」。几何与材质代码零差异。
- wall 曾在兄弟项目侧独立迭代（提交 59c001b，v6 stone with mirrored sky puddles，版本 0.1.481）：出口改名
  `createHarborWall(skyReflection?: THREE.Texture | null)`、积水改 unlit 天空镜面 `ShaderMaterial`、积水 `castShadow = false`。
  **该版本已回流本仓库**（提交 1b09ab6），两侧几何与材质代码逐字一致，只差本仓库被删掉的头部注释。
- 回流必须同时补齐浏览台的缺失依赖：浏览台没有天幕，`skyReflection` 传 `undefined` 会让积水采样空 sampler 变成纯黑。
  为此新增 `viewer/sky-cube.ts`（6 面 64 × 64 程序化天空 cubemap，模块级缓存）并导出 `createWallWithPreviewSky()`。
  必须包一层工厂而不能在 `viewer/assets.ts` 里写内联箭头函数：`viewer/build-viewer.mjs`:58 的注册表解析
  只接受裸标识符 `create: <name>`，内联箭头会抛 `cannot parse asset entry`。
- 导出名两侧保持一致（都叫 `createHarborWall`），交付/回流都是纯拷贝，不需要改名适配。
- 时间关系：兄弟项目 6 件文件 mtime 为 2026/11/20、wall 为 2026/11/23，均不早于本仓库对应资产最后改动日
  （cannon 11/18、pirate-ship 11/18、bombardier 11/19、ornithopter 11/19、boss 11/20、pirate_chief 11/20、wall 11/22）。

### 3 挂载契约（兄弟项目侧）

- 7 件全部在 `startBattle` 的加载流程里构建：loading 面板先呈现一帧、再停 `LOADING_MIN_MS` 之后统一调用工厂
  （`battle-setup.ts`:580-593），canvas/three 侧一次构建原型，其余实例均为克隆。
- 攻击方：原型交给 `LevelWaveSystem.setUnitPrototype('pirate-ship' | 'ornithopter' | 'bombardier' | 'boss_islewrath', proto)`
  （:615-618），船长走 `setChiefPrototype(chiefProto)`（:619）。
- 城墙：`bakeWallFaceMottle` 后 `position.set(0, 0.55, WALL_CENTER_Z)`（:622-623）；挂载时统一 `receiveShadow = true`，
  `castShadow` 除 `wall-puddle` 外全开（:626-632）。
- 守方加农炮：`decorateCombatPrototype(cannonProto, 0, -0.2)`（:644）只在缺 `muzzle` / `hit_core` 时补建（:141-160）；
  本仓库 v2 模型已自带这两个节点，该步对现有资产是兜底，三座 clone 自动继承。
- 命名契约由运行时 `getObjectByName` 强制，改名即断：`gun_rotate`（`cannon-aim-system.ts`:100、
  `cannon-recoil-system.ts`:43、`level-wave-system.ts`:94）、`muzzle`（`cannon-fire-system.ts`:98、`pirate-fire-system.ts`:89）、
  `hit_core`（`pirate-fire-system.ts`:99）、`hp_blood`（`boss-chief-system.ts`:149）。
- 未交付：`char_comma`（TheFarField）无注入目标，本机 `C:\Users\bruce\Documents\WebProjects` 下不存在 TheFarField 项目。

## 与既有描述的出入

对照 `viewer/assets.ts` 各资产 `note` 字段（比对时间 2026-11-28，全量构建浏览器实测）：

| 资产 | 既有描述 | 实测 | 结论 |
| --- | --- | --- | --- |
| bombardier | 「船头 -Z · 四叶主旋翼 8 rad/s（真实）· 投弹口 (0,-0.1785,-0.102)」「顶部 y=0.359（保持 barY 0.479）」 | 机头 -Z；桨叶 4 片；`animate` 8 rad/s；`muzzle` 局部 (0, -0.1785, -0.102)；局部最高 y = 0.3590 | 一致，正文直接引用 |
| boss_islewrath | 「船头 -Z · 后二炮台基座 0.94 / 前二 0.66 · 副炮 0.75 倍 / 主炮 0.675 倍」 | `gun_t3/gun_t4` y = 0.94、`gun_t1/gun_t2` y = 0.66；`gun_rotate_1…4` scale 0.75、`gun_rotate_laser` scale 0.675；炮口 -Z | 一致 |
| ornithopter | 「翼展约 1.40 m」「机头木桨 12 rad/s」「机腹投石口 (0,-0.158,0.042)」 | X 向 1.4010；`animate` 12 rad/s；`muzzle` 局部 (0, -0.158, 0.042) | 一致 |
| pirate-ship | 「船头 -Z · 水线原点 · 桅顶 0.8775 · 炮口 z=-0.58」 | 船头 -Z；原点在水线（龙骨 -0.12）；max y = 0.8775；`cannon_mount` z = -0.38 + `muzzle` z = -0.2 = -0.58 | 一致 |
| pirate_chief | 「0.41 × 0.433 × 0.41 m · 坐垫 y=0」 | 尺寸 0.4100 × 0.4330 × 0.4100 一致；最低点 y = 0.0040 | **不一致**：以浏览器实测 0.0040 为准 |

关于 pirate_chief 的 4 mm 差异：代码 `cylinderY(0.118, 0.122, 0.034, 0, 0.021, 0, …)` 的坐垫法兰中心 y = 0.021、高 0.034，
底面因此落在 y = 0.0040；「坐垫 y=0」是设计基准（头骨造型以坐垫平面为原点），不是顶点实测值。
本次不改 `viewer/assets.ts` 的既有描述，仅在此记录。

另附：三处源码头部注释与实测/实现不一致（不属于 `viewer/assets.ts`，一并记录便于后续排查）

- `ornithopter-model.ts` 头部注释写 `muzzle = (0, -0.176, 0.042)`，代码常量 `DIM.muzzleY = -0.158`，实测 -0.158 → 以代码/实测为准。
- `ornithopter-model.ts` 头部注释写「兄弟项目 8 rad/s」，`viewer/assets.ts` 的 `animate` 实际按 12 rad/s 驱动 → 文档按 12 rad/s。
- `pirate-ship-model.ts` 头部注释写「2 个 Mesh = 2 draw call」，实测 3 Mesh / 3 draw call（`gun-mount` 独立成 Mesh）→ 以实测为准。