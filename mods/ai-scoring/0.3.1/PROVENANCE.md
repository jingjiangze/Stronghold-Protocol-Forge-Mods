# PROVENANCE — AI 评分（魔塔）· 客户端布阵评分插件

> 本包**不是** `tools/build-index.mjs` 机械生成的：它是 `plugin.json` 插件包，不是 `pack.json` 工坊包，
> 进不了 build-index 的 stage（`build-index.mjs:278` 只认 `pack.json`）。本条由维护者手工补录，格式对齐。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `ai-scoring` · 0.3.1 |
| ② 原作者 | 引擎部署树 `plugins/ai-scoring/`（jingjiangze） |
| ③ 原件许可 | GPL-3.0-or-later（与引擎仓 `LICENSE` 一致） |
| ④ 兼容改写者 | **未声明** |
| ⑤ 来源 | `jingjiangze/Stronghold-Protocol-Server-Deploy` 分支 `ms` 的 `plugins/ai-scoring/`（2026-10-21 评分闭环修复后形态：自带 scoringWorker + 信号兜底，lockHash `54c6598c…`） |
| ⑥ 改了什么 | 收录即原样（8 个文件：manifest + lock + 3 客户端模块 + 2 shared 模块 + 服务端空实现）。上游演进=「runner 发 `t:'score'` 而基座 worker 只认 `rehearsal`⇒分数永不可产生」「main.js 读恒 undefined 的小写 `__sp`⇒调度恒 off」两处断链的修复（scoringWorker 自带确定性标准场景，官方 `rehearsal.js` 同式计分） |

## ⚠️ 装载依赖（收录时请保留这条）

本包是**纯客户端覆盖插件**（`code.client`），在**官方主线引擎（无 `code` 字段 / 无 clientOverlay 的 0.3.1/0.3.2）上装了不生效**：插件文件不会被下发（404 静默降级）。需要基座具备两面：

1. manifest 2 认 `code` 字段并透传（`shared/plugins/manifest.js`）；
2. `clientOverlay` 装载链：`server/index.js` 建表（仅 `status==='loaded'`）+ `server/http/static.js` 命中（`client/**` 与 `shared/**` 两族键）；
3. （上报收口，可选）`POST /api/lineup-score` 端点——缺它评分照常本地产生，只是上报 fail-open 落空。

以上改动已作为 PR 提交到 `jingjiangze/Stronghold-Protocol-Forge`（分支 `gpt/plugin-client-overlay`），在合并前本包只对**已含这些改动的部署树**（如 `Server-Deploy@ms`）有意义——那棵树上已实测全链：点「准备就绪」采集布阵 → 本地库 → Worker 标准场景出分（实测 score=-995 手算吻合）→ POST 端点 200。

## 素材与授权

- 本包**不含**图片 / 音频 / 字体 / Spine 素材（zip 内清点过：全部是 `.js` 与清单/锁）。

## 安装依赖

- 需要支持 `code.client` 客户端覆盖的基座（见上「装载依赖」）。
- 装好后必须在 `plugins/config.json` 的 `trusted` 里钉 `plugin.lock.json` 整份原文的 sha256（`54c6598cff1af9f6e6d605978c005b0a5db8ac230f3ce5b67d089e515d14d550`），并设 `SP_PLUGIN_SCRIPTS=trusted`（或 `trusted-force`，仅本机 host），否则被 `PLUGIN_TRUST_PIN` / `PLUGIN_SCRIPTS_DISABLED` 静默禁用、overlay 整体不应用。
- 语义提醒：评分是「标准场景分」（固定第 1 回合模板波次 + 固定 seed 的确定性彩排），用于布阵库内部排序；不是对玩家真实回合的预测（真实波次权威值浏览器不可得）。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
