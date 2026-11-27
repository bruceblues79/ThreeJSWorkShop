# 目录说明

- 根目录是主工程：Vite + TypeScript + three.js（原生），入口 `index.html` + `src/main.ts`。
- `viewer/`：项目级公用资产浏览台，全部资产共用一套灯光/相机/控制；资产在 `viewer/assets.ts` 注册，
  `npm run viewer:build` 生成自包含单文件 `viewer/preview.html`（可直接发手机预览）。
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


