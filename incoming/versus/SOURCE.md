# versus 0.1.0 — SOURCE

- 作者：jingjiangze
- 许可：AGPL-3.0-or-later
- 来源：本会话新写（2026-10-22），manifest 2 `class: trusted`
- 改了什么：新增对局种类 `mode_x_versus_2v2`（2V2 对抗，base `mode_multi_normal`，14 回合）；meta 钩子在 R14 公告「对方视角公开」；3 个 settings（teamSize / confrontTargetSeconds / rosterMs）
- 自带素材：无
- **引擎依赖**：需要 `gpt/versus-constants` 分支的引擎侧改动（`ROOM_MODES` / `g.confront` / `room.swapSeats` / `confrontTraits.js`），当前 master 尚未包含。装到没有这些改动的服务器上模式可选但对抗逻辑不生效。
- 校验：`tools/plugin.mjs check` 0/0；`tools/plugin.mjs pack` ok；真服务器启动实测 versus **loaded**（trusted 类，lock+pin）
