# PROVENANCE — 卡兹戴尔同人内容包（立绘修复版）

> **修版说明（2026-10-30）**：这是 `1.2.1` 的修版，原版本保留在站上不动。
> 原包被引擎整包拒（见下），本版只改 `pack.json` 的必要字段，**内容文件一个没动**。

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `fanpack-kazdel-mod` · 1.2.2（原 1.2.1） |
| ② 原作者 | 原件未署名 |
| ③ 原件许可 | 原件未声明许可 |
| ④ 兼容改写者 | jingjiangze（本次修复） |
| ⑤ 来源 | 站上 `mods/fanpack-kazdel-mod/1.2.1/mod.zip` |
| ⑥ 改了什么 | 两层：① `content` 里的 `config` 不是工坊包数据文件（`UNKNOWN_CONTENT_FILE`）⇒ 去掉；② 数据文件埋在 `payload/` 下，装载器在包根按 `<name>.json` 找，一直报 `chess.json is declared but missing` ⇒ 把 `payload/` 这层壳剥掉，数据摆到 `data/` 下（包根仍只有 `pack.json`）。**内容文件一个字节没改。** |

## 引擎判词（原版本）

见 `.github/ci/pack-load-baseline.txt` 与「门 — 线上包真装载」的运行记录。

## 本版要点

| 项 | 值 |
|---|---|
| `game` / `api` | `0.3.x` / `>=1 <3` |
| `content` | ['chess'] |
| 声明 `server` / `client` | False / False |
| 文件数 / 解压后 | 44 个 / 3,286,689 B |
| zip / sha256 | 612,701 B / `fca5038c61265ab9f2839c1f56008c4896d1146befbdb1f41b90fea1d8d2b02f` |

## 素材与授权

- 内容文件与原版本完全一致（本版只动 `pack.json`）。素材版权归原权利方，仅供非商业个人使用；
  许可照原件的 `原件未声明许可` 如实抄录，本条不替其断言真伪。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4。
