# PROVENANCE — 干员皮肤

> 本包是 **`plugin.json` 插件包**（manifest 2, `class: trusted`），不是 `pack.json` 工坊包，
> 进不了 `tools/build-index.mjs` / `tools/promote-incoming.mjs` 的 stage ⇒ 由维护者手工补录，格式对齐 `mods/ai-scoring`。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `operator-skins` · 0.3.1 |
| ② 原作者 | （未声明） |
| ③ 原件许可 | 未声明 |
| ④ 兼容改写者 | **未声明** |
| ⑤ 来源 | `jingjiangze/stronghold-server` 分支 `baidu` 的 `plugins/operator-skins/`（盒子 `/opt/stronghold` 上实际在跑的同一份） |
| ⑥ 改了什么 | **收录即原样**：9 文件 · 99,187 B，未改一字节 |

## 清单要点

| 项 | 值 |
|---|---|
| `class` | `trusted` |
| `api` | 2 |
| `app` | `>=0.3.0 <0.4.0` |
| `scope` | ['room'] |
| `permissions` | `trusted.server` |
| `needs` | `code.client`, `code.data` |

| `code.*` 键 | 数量 | 装载面 |
|---|---|---|
| `code.client` | 4 项 | `code.client`（客户端按路径顶替宿主文件） |
| `code.data` | 0 项 | `code.data`（数据文件覆盖） |

> `needs` 不在 manifest 2 的已知字段表里，引擎会给一条 `PLUGIN_FIELD_UNKNOWN` 警告并忽略——
> 它是**文档性声明**，不参与装载判定（本条为审计结论，原包未改）。



## 素材与授权

- 本包**不含**图片 / 音频 / 字体 / Spine 素材（zip 内清点过）。

## 安装依赖

- `trusted` 类：在 `plugins/config.json` 的 `trusted` 里钉 `plugin.lock.json` 整份原文的 sha256
  （`2eb1ca051335634ef81a809d6c81bf2afda7e9c7315dd40c0e3e087aa4dbde7f`），并设 `SP_PLUGIN_SCRIPTS=trusted`（或 `trusted-force`，仅本机 host），重启生效。
- 包内 `plugin.lock.json` 与盒子 `plugins/config.json` 里钉的值**实测一致**（收录时交叉核对过）。

## ⚠️ 装载依赖（收录时请保留这条）

本包是**服务端/客户端插件**（`plugin.json` manifest 2），需要基座具备 fork 引擎那几面才有意义：

1. manifest 2 认 `code` 字段并透传（`shared/plugins/manifest.js` 的 `V2_FIELDS`）；
2. 对应的装载链：`code.client` → `server/index.js` 建表 + `server/http/static.js` 命中；
   `code.lobby` → `server/plugins/lobbyModules.js` 逐个挂 `setup(api)`；
   `code.match` → `server/plugins/contentSet.js` 的 `match` 单根；
   `code.static` → 静态资源跳转钩子。

**官方主线引擎（无 `code` 字段的版本）上装了不生效**：插件文件不会下发，静默降级。
`class: trusted` 的包还必须在 `plugins/config.json` 的 `trusted` 里钉 `plugin.lock.json` 整份原文的 sha256，
并设 `SP_PLUGIN_SCRIPTS=trusted`（或 `trusted-force`，仅本机 host），否则被 `PLUGIN_TRUST_PIN` / `PLUGIN_SCRIPTS_DISABLED` 静默禁用。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
