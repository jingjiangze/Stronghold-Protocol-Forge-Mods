# PROVENANCE — 测试模拟（训练房）

> **修版说明（2026-10-30）**：这是 `1.0.0` 的修版，原版本保留在站上不动。
> 原包被引擎整包拒（见下），本版只改 `pack.json` 的必要字段，**内容文件一个没动**。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `test-sim` · 1.0.1（原 1.0.0） |
| ② 原作者 | 卫戍协议同人 mod |
| ③ 原件许可 | GPL-3.0-or-later |
| ④ 兼容改写者 | jingjiangze（本次修复） |
| ⑤ 来源 | 站上 `mods/test-sim/1.0.0/mod.zip` |
| ⑥ 改了什么 | 原件是 **`install.mjs` + `pack/pack.json` 的安装器形态**，工坊装载器要在 zip 顶层找 `pack.json`，所以一直装不上（`pack.json is missing`）。本版只收 `pack/` 里那份包体，安装器 / `backup-original/` / `screenshots/` 未收。 |

## 引擎判词（原版本）

见 `.github/ci/pack-load-baseline.txt` 与「门 — 线上包真装载」的运行记录。

## 本版要点

| 项 | 值 |
|---|---|
| `game` / `api` | `0.19.x` / `>=1 <2` |
| `content` | None |
| 声明 `server` / `client` | True / True |
| 文件数 / 解压后 | 4 个 / 34,336 B |
| zip / sha256 | 11,695 B / `6cc7834e4feb5b48424534d70ceb11c528519839ba72ce676a7336f2e5c677e8` |

## 素材与授权

- 内容文件与原版本完全一致（本版只动 `pack.json`）。素材版权归原权利方，仅供非商业个人使用；
  许可照原件的 `GPL-3.0-or-later` 如实抄录，本条不替其断言真伪。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
