# 执行规则（最高优先级）

- 执行我的任务前，请先不要急着输出结果。
- 请你先识别我这个需求里所有模糊、缺失、可能影响结果的信息，并列出问题向我确认；等我补充完关键信息之后，你再正式开始执行。
- 如果你必须先做假设，请明确告诉我你做了哪些假设，不要自己硬补充。

# 目录说明

- 根目录是主工程：Vite + TypeScript + three.js（原生），入口 `index.html` + `src/main.ts`。
- `HarborDefender/`、`TheFarField/`：按目标项目划分的资产子目录，各自带 AGENTS.md，单位统一为米。
- 常用命令：`npm run dev` 起预览、`npm run build` 类型检查并打包、`npm run preview` 预览产物。

# img2threejs

- 技能位于 `C:\Users\bruce\src\img2threejs`（v2.0.1，手动克隆；官方 CLI 不支持 Windows）。
- 在该目录下用 `python3` 运行 `forge/` 脚本（Python 3.12.10，`python3.exe` 别名已配置）。
- 需要时由我（agent）读取该目录的 `SKILL.md`、`grimoire/`、`docs/` 按其流水线执行。


