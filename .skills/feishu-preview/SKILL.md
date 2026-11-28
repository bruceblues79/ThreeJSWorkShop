---
name: feishu-preview
description: Build viewer/preview.html for a registered asset and send it to the user's own Feishu chat. Use when the user says preview 某对象, 预览某资产, 发我 HTML 预览, or asks to send the viewer to Feishu. Do not use for editing assets or unrelated Feishu messages.
---

# Feishu Preview

把 `viewer/` 里已注册的资产打成自包含 HTML，并发到用户本人的飞书会话。
预览页只包含本次要预览的资产，不保留资产切换按钮。
单件产物 567–578 KB（580,588–591,751 B），全量 667 KB（682,569 B）；
差额仅为模型代码，three.js 与浏览台骨架始终在包内。以上为 2026-11-28 逐件重测值（8 件单资产 + 1 次全量）。

## 步骤

1. 从 `viewer/assets.ts` 的 `ASSETS` 读出资产 `id`，把用户口语映射到 id（例如 加农炮/炮/cannon → `cannon`）。
   找不到对应资产时停下来告诉用户已注册的 id，不要猜。
2. 运行：

   ```powershell
   .skills\feishu-preview\scripts\send-preview.ps1 -Asset <id>
   ```

   脚本会依次执行 `npm run viewer:build -- <id>`（只打入该资产、隐藏切换按钮）、
   解析当前飞书用户 `open_id`、把 `viewer/preview.html` 发到该用户的自聊。
3. 读取命令输出里的 `message_id`，向用户报告发送成功，并附上 `viewer/preview.html` 的 `computer://` 链接；
   同时说明 URL 参数：`?view=iso|front|side&yaw=&pitch=&hud=0&plate=0`（`asset` 已固定为本次目标）。

## 失败处理

- 构建失败：贴出报错首行，不要发送旧文件。
- `lark-cli` 不可用或发送失败：保留已构建的 HTML，告知用户在飞书侧重试或手动发送，不要重复重试超过一次。
- 资产未注册：只列出 `ASSETS` 里的 id，不要临时改注册表。
