# PROVENANCE — 感谢名单（标题屏滚动条）

> 本包**不是** `tools/build-index.mjs` 机械生成的：它是 `plugin.json` 插件包（`class: trusted`），
> 不是 `pack.json` 工坊包，进不了 build-index 的 stage（`build-index.mjs` 只认 `pack.json`）。
> `tools/promote-incoming.mjs` 同理，只做 pack —— 所以本条由维护者手工补录，格式与 `mods/ai-scoring` 对齐。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `thanks` · 0.1.0 |
| ② 原作者 | jingjiangze（来源 PR #45 `incoming/thanks-marquee`） |
| ③ 原件许可 | CC0-1.0（包内 `plugin.json` 的 `license`） |
| ④ 兼容改写者 | **未声明** |
| ⑤ 来源 | `incoming/thanks-marquee/thanks-0.1.0.zip`（PR #45，2026-10-21 提交） |
| ⑥ 改了什么 | 收录即原样（5 个文件：`plugin.json` + `plugin.lock.json` + `client/js/screens/title.js` + `client/css/screens/title.css` + `host/noop.js`） |

## 功能

标题屏页脚加一条横向无缝滚动的感谢名单。数据源是同源 `/data/thanks.json`（服务端代理，60s 轮询），
拿不到时落包内快照，再失败落客户端内置 `THANKS_FALLBACK`；尊重 `prefers-reduced-motion`。
**零玩法数据改动**：不碰 operators/enemies/modes/stages/dsl/offers/i18n。

## ⚠️ 装载依赖（收录时请保留这条）

本包是**纯客户端覆盖插件**（`code.client`），在**官方主线引擎（无 `code` 字段 / 无 clientOverlay 的版本）上装了不生效**：
插件文件不会被下发（404 静默降级）。需要基座具备两面：

1. manifest 2 认 `code` 字段并透传（`shared/plugins/manifest.js` 的 `V2_FIELDS`）；
2. `clientOverlay` 装载链：`server/index.js` 建表（仅 `status === 'loaded'`）+ `server/http/static.js` 命中
   （`client/**` 两族键）。

投递形态必须是 `class: trusted` —— `content` 类不允许携带 `.js`（`shared/plugins/manifest.js` 的 `PARTS`）。

## 已知上游缺陷（本包自带副本已补，`public/` 原文件未动）

基线 `public/js/screens/title.js` 的 `Emblem` 未导出，而 `achievements.js` 在 import 它。
本包副本补了 `export` 才能工作；根修应改 `public/js/screens/title.js` 那一份。

## 素材与授权

- 本包**不含**图片 / 音频 / 字体 / Spine 素材（zip 内清点过：全部是 `.js` / `.css` 与清单、锁）。

## 安装依赖

- 需要支持 `code.client` 客户端覆盖的基座（见上「装载依赖」）。
- 装好后必须在 `plugins/config.json` 的 `trusted` 里钉 `plugin.lock.json` 整份原文的 sha256
  （`d173ca3b5f7f83a4a9f8f28701b3221528e3663c6e4a2df29ee96a5fa2008444`，688 B），
  并设 `SP_PLUGIN_SCRIPTS=trusted`（或 `trusted-force`，仅本机 host），
  否则被 `PLUGIN_TRUST_PIN` / `PLUGIN_SCRIPTS_DISABLED` 静默禁用、overlay 整体不应用。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
