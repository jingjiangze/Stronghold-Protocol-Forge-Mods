# PROVENANCE — 盟约界面增强（大厅音乐）

> 本包**不是** `tools/build-index.mjs` 机械生成的：它是 `plugin.json` 插件包，不是 `pack.json` 工坊包，
> 进不了 build-index 的 stage（`build-index.mjs:278` 只认 `pack.json`）。本条由维护者手工补录，格式对齐。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `stronghold-ui` · 0.3.1 |
| ② 原作者 | 原件未署名（UI 包来自一份匿名定制部署）；插件化整合与大厅音乐：jingjiangze |
| ③ 原件许可 | 原件未声明许可；原包 `AGENTS.md` 写明「仅供学习研究、禁止商用」 |
| ④ 兼容改写者 | jingjiangze |
| ⑤ 来源 | 上传站记录 `d11dbaf5a6c4` · 原件 `ui-package-20261014`（Stronghold Protocol 0.2.6 定制前端） |
| ⑥ 改了什么 | 20 个界面文件 + 8 个兼容垫片整理成 `code.client` 覆盖层；新增网易云大厅音乐（搜索 / 链接 / 队列 / 歌词 / 封面） |

## 素材与授权

- 本包**不含**图片 / 音频 / 字体 / Spine 素材（zip 内清点过）。

## 安装依赖

- 需要支持 `code.client` 客户端覆盖的基座（mod 管理器改造版）。
- 装好后必须在 `plugins/config.json` 的 `trusted` 里钉 `plugin.lock.json` 的 sha256，否则会被 `PLUGIN_TRUST_PIN` 静默禁用。
- 官方 0.3.1 原版不支持 `code.client`，装上不生效。
- 服务端 CSP 需放行 `speedcdn.jiangjiangze.icu`、`api.qijieya.cn`、`api.injahow.cn`、`www.ffapi.cn`、`*.music.126.net`、`*.126.net`、`*.127.net`。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
