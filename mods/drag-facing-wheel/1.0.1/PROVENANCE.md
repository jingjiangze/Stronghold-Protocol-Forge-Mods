# PROVENANCE — 干员自由拖放与朝向轮盘（服务端兼容移植）

> **修版说明（2026-10-30）**：这是 `1.0.0` 的修版，原版本保留在站上不动。
> 原包被引擎整包拒（见下），本版只改 `pack.json` 的必要字段，**内容文件一个没动**。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `drag-facing-wheel` · 1.0.1（原 1.0.0） |
| ② 原作者 | 原件未署名（移植自 sp.isomer319.xyz 现网实现） |
| ③ 原件许可 | GPL-3.0-or-later |
| ④ 兼容改写者 | jingjiangze（本次修复） |
| ⑤ 来源 | 站上 `mods/drag-facing-wheel/1.0.0/mod.zip` |
| ⑥ 改了什么 | `pack.json` 顶层有 `credits` —— 引擎对它不认识的顶层键**直接整包拒**（`PACK_UNKNOWN_FIELD`）。本版把那段出处／致谢原文搬进 `description`，信息不丢，包能装上。 |

## 引擎判词（原版本）

见 `.github/ci/pack-load-baseline.txt` 与「门 — 线上包真装载」的运行记录。

## 本版要点

| 项 | 值 |
|---|---|
| `game` / `api` | `0.3.x` / `>=1 <3` |
| `content` | [] |
| 声明 `server` / `client` | False / False |
| 文件数 / 解压后 | 37 个 / 397,306 B |
| zip / sha256 | 156,874 B / `23ebc3b84d2d57b1eec97fa026699dccdd802e0f73d11b8eaae8d409e56f3291` |

## 素材与授权

- 内容文件与原版本完全一致（本版只动 `pack.json`）。素材版权归原权利方，仅供非商业个人使用；
  许可照原件的 `GPL-3.0-or-later` 如实抄录，本条不替其断言真伪。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
