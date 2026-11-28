# TheFarField说明

- 目标项目：暂无（本机 `C:\Users\bruce\Documents\WebProjects` 下没有 TheFarField 项目，尚无注入目标）。
- 暂无尺寸 / 性能 / 面数约束，本目录为美术资产探索。
- 制作单位的尺寸，性能要求参考注入的项目（当前无注入项目，故无参考值）。

# RULES

- 单位米

# SETUP

## TheFarField 角色原型 comma（char_comma）

- 代码：`TheFarField/char_comma/src/char-comma-model.ts`
- 导出：`createCharComma(): THREE.Group`（文件唯一导出，无参数）
- 浏览台：资产 id `char-comma`；`pitchNode = char_comma`、pitch 固定 0、yaw ±180°（`viewer/assets.ts`）
- 尺寸 X × Y × Z：1.803 × 1.802 × 0.485 m
- tri：25312
- draw call：14
- 实测方式：`npm run viewer:build -- char-comma` 后打开 `viewer/preview.html?asset=char-comma`，
  取读数面板与 `window.__assetInfo`；数字回填前一律保持「未实测」。
