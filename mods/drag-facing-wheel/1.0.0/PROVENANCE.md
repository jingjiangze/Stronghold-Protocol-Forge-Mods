# PROVENANCE — 干员自由拖放与朝向轮盘（服务端兼容移植）

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `drag-facing-wheel` · 1.0.0 |
| ② 原作者 | 原件未署名（移植自 sp.isomer319.xyz 现网实现） |
| ③ 原件许可 | GPL-3.0-or-later |
| ④ 兼容改写者 | 未声明 |
| ⑤ 来源 | 本地包 `干员自由拖放与朝向轮盘-服务器兼容代码-20261015.zip` |
| ⑥ 改了什么 | **适配说明**：原件是「源码片段集」——`portable/`（可独立运行的兼容模块）+ `integration-fragments/`（接入片段），没有 pack.json。; 本次补写 pack.json（id=drag-facing-wheel, game=0.3.x），只收 `portable/` 与 `integration-fragments/`，**不收** `.ps1/.bat` 安装器与 demo/tests。; `integration-fragments/` 依赖原闭包变量，不能当独立 ES 模块直接跑；它们是对接参考，实际接入要按 agent.md 手工合入。 |

## 素材与授权

- 本包**不含**图片 / 音频 / 字体 / Spine 素材。


## 装载失败与处置（2026-10-30）

> 由 `.github/workflows/pack-compat.yml`（真装载门）实测判出。

**装不上，且不可重设计**：判词 `PACK_UNKNOWN_FIELD: "credits"`（去掉后又 `EMPTY_PACK`）。本包交付的是**开发集成套件** —— `integration-fragments/server-*.fragment.js` 要手工贴进宿主 `server/match/*`，`portable/` 是跨 render 版本的移植层。任何 pack / plugin 形态都表达不了「往宿主函数体里插几行」。

完整分析见 [docs/PACK-LOAD-FAILURES.md](../../../docs/PACK-LOAD-FAILURES.md)。
