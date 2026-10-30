# PROVENANCE — 国家图书馆联动皮肤（NLC 三款 + 追忆回合修复）

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `nlc-skins` · 1.0.0 |
| ② 原作者 | 原件未署名 |
| ③ 原件许可 | 原件未声明许可（素材版权归鹰角网络 / Yostar） |
| ④ 兼容改写者 | 未声明 |
| ⑤ 来源 | 本地包 `国家图书馆联动皮肤.zip` |
| ⑥ 改了什么 | **适配说明**：原件是 PowerShell 安装器（`Install-NLC-Skins.ps1`）+ 整文件覆盖；本次补写 pack.json 并**去掉 .ps1**，按工坊包形态交付。; 含三款 2026-10-16 官方皮肤：黍·源远流长、烛煌·夜行烛火、琳琅诗怀雅·盛世之象（头像 / 商店立绘 / 战斗模型 Spine 三件套）。; ⚠️ **含官方素材**：全部从国服客户端用 UnityPy 解包，版权归鹰角网络 / Yostar，仅供非商业个人使用。; 另附 jibian_zhuiji（追忆）卡牌引擎修复：`_engine-fix-zhuiji/server/match/match/phases.js`，修「回到第 10 回合不出怪/卡死」。 |

## 素材与授权

- 本包含 30 个素材文件 / 7325735 B（{"png": 18, "atlas": 6, "skel": 6}）—— 版权归原权利方，仅供非商业个人使用。


## 装载失败与处置（2026-10-30）

> 由 `.github/workflows/pack-compat.yml`（真装载门）实测判出。

**装不上，且不可重设计**：判词 `PACK_UNKNOWN_FIELD: "credits"` → 去掉后又 `content: ["skins","assets"]` 两个名字都不合法。它真正想做的「整份替换宿主 `data/assets.json`」（7969 条、绝对 URL）**pack 没有这条通道**；而 pack 的 `art` 是 `pack.json` 里的内联表（`{表名:{id:条目}}`，路径相对 `assets/`），两者不可互转。

完整分析见 [docs/PACK-LOAD-FAILURES.md](../../../docs/PACK-LOAD-FAILURES.md)。
