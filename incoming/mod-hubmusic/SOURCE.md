# 大厅音乐 · 在线平台（QQ音乐 / 网易云 / 酷我） — SOURCE

- 原件：本地 zip（作者匿名）
- 版本：1.9.0
- 形态：install.mjs 安装器 + payload/
- 适配：**适配说明**：原件是 `install.mjs` 安装器（面向 0.2.5/0.3.0），本包把**前端部分**固化成 `code.client`。 ⚠️ 原件的服务端（`server/lobbyMusic.js` + `server/http/routes.js` 的 `/lobby-music/` 分支）**无法通过插件机制装载**，已放在包内 `manual-server/` 供手工安装 —— 不装它时搜索/在线解析会 404，本地文件播放仍可用。 ⚠️ 与 `stronghold-ui` 都覆盖 `js/ui/lobbyMusic.js`；插件按 id 字典序覆盖，`stronghold-ui` 在后会盖掉本包，两者**二选一**。
