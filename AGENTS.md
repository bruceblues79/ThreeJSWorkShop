# 目录说明

- 根目录是主工程：Vite + TypeScript + three.js（原生），入口 `index.html` + `src/main.ts`。
- `viewer/`：项目级公用资产浏览台，全部资产共用一套灯光/相机/控制；资产在 `viewer/assets.ts` 注册，
  `npm run viewer:build` 生成自包含单文件 `viewer/preview.html`（可直接发手机预览）。
  `npm run viewer:build -- <id>` 为单资产构建，只打入选定 `id` 的模型代码；
  `viewer/preview.html` 是构建产物，已被 `.gitignore` 忽略，不入库。
- `HarborDefender/`、`TheFarField/`：按目标项目划分的资产子目录，各自带 AGENTS.md，单位统一为米。
- 常用命令：`npm run dev` 起预览、`npm run build` 类型检查并打包、`npm run preview` 预览产物。

# 本地技能

- `.skills/` 存放随仓库版本管理的技能；`.trae/` 整目录忽略，不放技能。
- 「preview <资产>」：读取 `.skills/feishu-preview/SKILL.md` 并按其步骤执行
  （构建 `viewer/preview.html` 并发到用户本人飞书）。

# img2threejs

- 技能位于 `C:\Users\bruce\src\img2threejs`（v2.0.1，手动克隆；官方 CLI 不支持 Windows）。
- 在该目录下用 `python3` 运行 `forge/` 脚本（Python 3.12.10，`python3.exe` 别名已配置）。
- 需要时由我（agent）读取该目录的 `SKILL.md`、`grimoire/`、`docs/` 按其流水线执行。

# 资产索引

本表只做状态与导航，规格细节见各子项目 AGENTS.md。

| id | 所属项目 | 代码路径 | 导出函数 | 尺寸(m) | tri | draw call | 文档状态 | 交付状态 | 最后变动提交 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cannon | HarborDefender | [cannon-model.ts](HarborDefender/cannon/src/cannon-model.ts) | `createCannon()` | 0.228 × 0.199 × 0.350 | 1780 | 2 | 完整 | 已交付 | 69fef30 |
| wall | HarborDefender | [wall-model.ts](HarborDefender/wall/src/wall-model.ts) | `createWall()` | 3.017 × 0.713 × 0.522 | 1546 | 2 | 完整 | 已交付（兄弟项目为准，本仓库落后一版） | 2e51139 |
| bombardier | HarborDefender | [bombardier-model.ts](HarborDefender/bombardier/src/bombardier-model.ts) | `createBombardier()` | 1.3800 × 0.5887 × 1.3800 | 1356 | 2 | 完整 | 已交付 | e77e9d9 |
| boss-islewrath | HarborDefender | [boss-islewrath-model.ts](HarborDefender/boss_islewrath/src/boss-islewrath-model.ts) | `createBossIslewrath()` | 1.9260 × 2.2913 × 1.9260 | 5828 | 7 | 完整 | 已交付 | 4d3a77a |
| ornithopter | HarborDefender | [ornithopter-model.ts](HarborDefender/ornithopter/src/ornithopter-model.ts) | `createOrnithopter()` | 1.4010 × 0.4700 × 0.8422 | 1003 | 2 | 完整 | 已交付 | 33592df |
| pirate-ship | HarborDefender | [pirate-ship-model.ts](HarborDefender/pirate-ship/src/pirate-ship-model.ts) | `createPirateShip()` | 0.5403 × 0.9975 × 1.3535 | 1076 | 3 | 完整 | 已交付 | 698d046 |
| pirate-chief | HarborDefender | [pirate-chief-model.ts](HarborDefender/pirate_chief/src/pirate-chief-model.ts) | `createPirateChief()` | 0.4100 × 0.4330 × 0.4100 | 1340 | 2 | 完整 | 已交付 | 2a602aa |
| char-comma | TheFarField | [char-comma-model.ts](TheFarField/char_comma/src/char-comma-model.ts) | `createCharComma()` | 1.803 × 1.802 × 0.485 | 25312 | 14 | 简略 | 未交付（无注入目标） | 67327ca |

- 「文档状态」只有完整 / 简略 / 缺失三档；char-comma 标简略：`TheFarField/AGENTS.md` 已有代码路径、导出、浏览台 id
  与实测尺寸/tri/draw call，缺材质清单、节点树、朝向约定。
- 「交付状态」取 2026-11-28 逐件字节核对结果，做法与出处见 [HarborDefender/AGENTS.md](HarborDefender/AGENTS.md) 的「交付与注入（实测）」一节：
  7 件 HarborDefender 资产均已拷入兄弟项目 `src/scene-assets/`，其中 cannon、pirate-ship 与本仓库逐字节相同，
  bombardier / boss_islewrath / ornithopter / pirate_chief 只差文件头注释，wall 在兄弟项目侧另有一次实质迭代（本仓库未回流）。
- 「最后变动提交」取 `git log -1 --format='%h %s' -- <该资产的 model.ts 路径>`。

# 资产交付流程

- 注入兄弟项目 `C:\Users\bruce\Documents\WebProjects\HarborDefender` 的做法、逐件字节核对与挂载契约，
  全部记录在 [HarborDefender/AGENTS.md](HarborDefender/AGENTS.md) 的「交付与注入（实测）」一节，本节不重复数字。
- 摘要：交付是把 `model.ts` 拷成兄弟项目 `src/scene-assets/<映射名>.scene-asset.ts`，由 `battle-setup.ts`
  以 `.js` 后缀 import；兄弟项目全仓 grep `ThreeJSWorkShop` 无命中，即没有任何跨仓库路径、脚本或依赖。


