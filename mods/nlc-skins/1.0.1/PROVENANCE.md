# PROVENANCE — NLC 皮肤合集（整份素材清单）

> **2026-10-30 重打包**：原包是 `pack.json` 形态、`content: ["skins","assets"]` —— 这两个名字引擎都不认
> （`UNKNOWN_CONTENT_FILE`），**装载期整包被拒**，一直装不上。本版按**插件形态**（`plugin.json`）重打包，
> 语义与原包一致：换掉素材清单与皮肤表，不改玩法。**原 1.0.0 保留在站上不动。**

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `nlc-skins` · 1.0.1（原 1.0.0） |
| ② 原作者 | 原件未署名 |
| ③ 原件许可 | 原件未声明许可 |
| ④ 兼容改写者 | jingjiangze（本次重打包，未改任何素材字节） |
| ⑤ 来源 | 站上 `mods/nlc-skins/1.0.0/mod.zip` |
| ⑥ 改了什么 | 只改**形态**：`pack.json` → `plugin.json`；`public/assets/**` → `client/assets/**`（`code.client` 按宿主路径顶替）；4 张 data 表走 `code.data`。**素材与 data 文件一个字节没改**（见 `plugin.lock.json` 的逐文件 sha256）。 |

## ⚠️ 装之前必须知道的三件事

1. **它整份替换宿主 `data/assets.json`**（引擎 2026-10-30 起 `code.data` 支持任意 `data/<name>.json`）。
   原包那份清单是 **7969 个文件 / 485 MB** 的素材索引。如果你宿主上的 `assets.json` 已经演进过，
   换掉它会让**其它素材的 URL 对不上** —— 这不是「加皮肤」，是「换整张表」。
   同理还换 `data/avatars.json` / `data/skins.json` / `data/skins-installed.json`。
2. **只有 2026-10-30 及以后的引擎才认这个通道**。更早的引擎上 `code.data` 只认 `data/config.json`，
   于是本包装得上、但**四张表一个都不会生效**（静默）。装完请核对 `data/assets.json` 的来源。
3. `class: trusted` ⇒ 必须在 `plugins/config.json` 的 `trusted` 里钉本包 `plugin.lock.json` 整份原文的
   sha256（`78b38a33eed3bc9b427b17bac44d166f6e418bbe4a6e5b7c24bc62b85e7c412c`，6970 B），
   并设 `SP_PLUGIN_SCRIPTS=trusted`（或 `trusted-force`，仅本机 host），否则被静默禁用。

   > 注：本版 `plugin.lock.json` 是**按 `tools/plugin.mjs pack` 的格式手工生成**的（逐文件 sha256 + bytes），
   > 不是用引擎工具跑出来的。钉之前请自己在引擎仓跑一次 `node tools/plugin.mjs pack <本包目录>` 复核。

## 本版构成

| 项 | 值 |
|---|---|
| 文件数 / 解压后 | 37 个 / 10,574,046 B |
| zip / sha256 | 5,165,208 B / `97d72087d90be6dcf36960a81ca2deae228ff8acda1a8fccf11a492a8c773df3` |
| `code.client` | 24 条（`assets/**` → 宿主 `public/assets/**`） |
| `code.data` | `data/assets.json`, `data/avatars.json`, `data/skins-installed.json`, `data/skins.json` |

## 未收的东西（原包里有，本版故意不带）

- `_engine-fix-zhuiji/server/match/match/phases.js` —— 那是往**宿主引擎**里打的补丁，插件形态表达不了。
  需要的话请按原包 README 的说明单独打。
- `MANIFEST.json` / `README.md` —— 原包的打包清单与说明，不进运行时。

## 素材与授权

- 素材（3 套立绘 / 头像 / Spine 三件套，共 24 个文件）与 4 张 data 表**原样收录**，未改字节；
  `source/` 下保留了 6 张原图作为溯源材料。
- 版权归原权利方；原件未声明许可，本条**照实抄录**，不替其断言真伪。

- 收录闸门见 [AGENTS.md](../AGENTS.md) §4；装载失败的整体分析见 [docs/PACK-LOAD-FAILURES.md](../../../docs/PACK-LOAD-FAILURES.md)。
