# PROVENANCE — 大厅视频背景（独立 mod）

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `hubvideo` · 1.2.0 |
| ② 原作者 | 原件未署名 |
| ③ 原件许可 | 原件未声明许可 |
| ④ 兼容改写者 | 未声明 |
| ⑤ 来源 | 本地包 `卫戍协议mod-大厅视频背景-mod-hubvideo-v1.2.0.zip` |
| ⑥ 改了什么 | **适配说明**：原件以 `install.mjs` + `manifest.json` + `payload/` 形态交付，无 pack.json；本次补写 pack.json 并去掉 install.mjs。; 大厅背景面板新增第三个页签，支持 MP4 / WebM 视频背景（客户端 CSS/JS + 服务端转发 + 对话框改造）。 |

## 素材与授权

- 本包含 2 个素材文件 / 1563310 B（{"png": 2}）—— 版权归原权利方，仅供非商业个人使用。


## 装载失败与处置（2026-10-30）

> 由 `.github/workflows/pack-compat.yml`（真装载门）实测判出。

**装不上，且只发客户端会更糟**：判词 `EMPTY_PACK`。客户端 3 个文件能映射成插件 `code.client`，但 `payload/server/hubVideo.js` 是**路由模块**（`/hub-video/resolve` 等，且 `import ./http/common.js` 相对导入宿主树），插件带不动 ⇒ 单发客户端会得到「面板在、视频放不出来」的假功能。

完整分析见 [docs/PACK-LOAD-FAILURES.md](../../../docs/PACK-LOAD-FAILURES.md)。
