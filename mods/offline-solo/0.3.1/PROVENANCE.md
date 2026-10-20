# PROVENANCE — 离线独立模拟（纯浏览器）

> 本包**不是** `tools/build-index.mjs` 机械生成的：它是 `plugin.json` 插件包，不是 `pack.json` 工坊包，
> 进不了 build-index 的 stage（`build-index.mjs:278` 只认 `pack.json`）。本条由维护者手工补录，格式对齐。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `offline-solo` · 0.3.1 |
| ② 原作者 | jingjiangze（引擎仓 PR #3 的 `plugins/offline-solo/`） |
| ③ 原件许可 | GPL-3.0-or-later（与引擎仓 `LICENSE` 一致） |
| ④ 兼容改写者 | **未声明** |
| ⑤ 来源 | <https://github.com/jingjiangze/Stronghold-Protocol-Server-Deploy/pull/3> 的 `plugins/offline-solo/`（与基座 `public/js/offline/` 同一批文件） |
| ⑥ 改了什么 | 纯新增：5 个客户端模块（启动探测 / 页内 loopback / 薄大厅 / 本地布阵队列 / 联网补传）+ 1 个服务端空实现 |

## ⚠️ 引擎层不兼容（收录时请保留这条）

本包在**官方 0.3.1 原版上完全无效**。离线能力需要引擎侧三处改动，缺一不可：

1. `/match/` 静态挂载（把 `server/match/**` 发给页面）；
2. `/data.js` 垫片的 `getConfig` / `getMode`；
3. `public/js/main.js` 里的离线探测入口。

三处都在引擎仓 PR #3 里。**在缺少这些改动的引擎上，本包只是一批不会被加载的静态文件。**

即使引擎带上了这些改动，本包也只是一份**副本**——离线能力本身已放在基座树里，
默认配置（一个插件都不启用）就能离线开局。它的意义是让 mod 管理器能看见 / 固定 / 分发这个能力。

## 素材与授权

- 本包**不含**图片 / 音频 / 字体 / Spine 素材（zip 内清点过：8 个条目，全部是 `.js` 与清单/锁）。

## 安装依赖

- 需要支持 `code.client` 客户端覆盖的基座（mod 管理器改造版）。
- 装好后必须在 `plugins/config.json` 的 `trusted` 里钉 `plugin.lock.json` 的 sha256，
  否则会被 `PLUGIN_TRUST_PIN` 静默禁用。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
