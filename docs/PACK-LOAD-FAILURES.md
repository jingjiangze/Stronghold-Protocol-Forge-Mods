# 线上包装载失败：6 个的病因、修法边界与处置

> 来源：`.github/workflows/pack-compat.yml`（真装载门）第一次跑的结果，
> 2026-10-30，引擎 `jingjiangze/Stronghold-Protocol-Forge@main`。
> 判据与 `tools/build-index.mjs` 的四道闸门同源：`errors=0` 且 `packsLoaded` 恰好 `[packId]`。

## 门跑出来什么

```
装载通过 75 · 新失败 0 · 基线内已知失败 6 · 跳过 21
```

「跳过 21」= 21 个 `plugin.json` 插件包，不属于 workshop 装载面（它们走 `code.*` / 插件注册表）。

那 6 个装不上的，逐个拆开看，**只有 2 个是「补字段 / 摆正结构」能修的**，且都已出修版并存进基线。

---

## 已修（新版本已上线，原版本留档不动）

### `test-sim` 1.0.0 → 1.0.1

- **判词**：`pack.json is missing`
- **病因**：原件是 **安装器形态** —— zip 里是 `install.mjs` + `pack/pack.json` + `backup-original/`，
  而装载器在 **zip 顶层**找 `pack.json`。
- **修法**：只收 `pack/` 里那份包体，安装器 / `backup-original/` / `screenshots/` 未收。
- **复验**：`✓ packsLoaded=[test-sim] errors=0`

### `fanpack-kazdel-mod` 1.2.1 → 1.2.2

- **判词**：`UNKNOWN_CONTENT_FILE: content "config"` → 修完又 `chess.json is declared in pack.json but missing`
- **病因两层**：
  1. `content` 里写了 `config` —— 不是工坊包的数据文件（合法集合见引擎 `shared/workshop.js` 的 `content` 表）；
  2. 数据文件埋在 `payload/data/` 下，而装载器读的是 `path.join(packDir, name + ".json")`
     （引擎 `server/workshop.js:159`）⇒ **必须放在包根**。
- **修法**：① `content` 去掉 `config`；② `data/*.json` 提到包根。
- **复验**：`✓ packsLoaded=[fanpack-kazdel-mod] errors=0`

两个修版都**只动 `pack.json` 的必要字段 + 版本号，内容文件一字节没改**。

---

## 修不了（重设计层面的事，不是打包手术）

### `drag-facing-wheel` —— 它是**开发集成套件**，不是可分发包

```
integration-fragments/server-drag-visual.fragment.js
integration-fragments/server-facing-handlers.fragment.js
integration-fragments/server-facing-open-drop.fragment.js
integration-fragments/server-frame-motion.fragment.js
portable/js/**        portable/shared/**        portable/vendor/**
agent.md
```

- `integration-fragments/*.fragment.js` 是**要手工贴进宿主 `server/match/*` 的片段**，
  任何 pack / plugin 形态都表达不了「往宿主某个函数体里插几行」。
- `portable/` 是跨 render 版本的移植层（`js/render14-r3/` 这类目录在宿主里就没有对应路径）。
- 结论：**不能重设计成包**。它要么作为文档/补丁集继续以「集成套件」形态存在，
  要么由作者改写成真正的 drop-in 覆盖。

### `hubvideo` —— 客户端能映射，服务端带不动

- 客户端 3 个文件能直接映射成插件 `code.client`：
  `payload/public/js/ui/hubVideo.js` → `client/js/ui/hubVideo.js`（宿主 `public/js/ui/hubVideo.js`）等。
- 但 `payload/server/hubVideo.js` 是**路由模块**：`/hub-video/resolve`、`/hub-video/s/<token>`、`/hub-video/cover`，
  且 `import { sendError, sendJson } from './http/common.js'` —— 相对导入宿主 `server/http/` 树，
  插件目录里解析不到。
- ⇒ **只发客户端会得到「有壳没后端」的假功能**（面板在、视频放不出来），比不发更糟。
- 建议作者按插件 API 重写服务端那一段（路由注册走插件面），再出插件形态。

### `nlc-skins` —— 它要的是「整份替换宿主 data 文件」，pack 没这条通道

- 它的 `data/assets.json` 是**宿主整份素材清单**（`stats.files = 7969`、485 MB、
  条目值是 `/assets/~<hash>/...` 这类**绝对 URL**）。
- 而 pack 的 `art` 是 **`pack.json` 里的内联对象**，形态是 `{ "<表名>": { "<id>": <条目> } }`：
  - 表名闭集：`chars` / `enemies` / `tokens` / `skills` / `profSub` / `bonds` / `bands`
    （引擎 `shared/workshop.js` 的 `ART_TABLES`，`ART_UNKNOWN_TABLE` 就在那里报）；
  - 扁平表（`skills`/`profSub`/`bonds`/`bands`）的值是 **`assets/` 下的相对路径**；
  - 声明 `art` 还要求包里有 `assets/` 目录（`ART_NEEDS_ASSETS`）。
- 两者**不可互转**：把 7969 条宿主清单转成 `art` 条目既不现实（值形态、路径语义都不同），
  也不是作者的原意（他要的是整份换掉）。
- 另外它的 `content: ["skins", "assets"]` 两个名字引擎都不认（`content` 只收
  chess/units/items/enemies/stages/waves/tokens/bosses/factions/garrisons/bands/bonds/effects/choices/variants）。
- 结论：**不能重设计成包**。要么引擎加一条「整份替换 `data/*.json`」的通道（产品决策），
  要么作者改写成 `art` 表形态。

### `ave-mujica` 1.8.24 —— 已被取代，不需要重设计

- 判词：`ART_UNKNOWN_TABLE: "sfxUnits" is not an art table`
- 但同 id 的 **`1.8.25` 装载是通过的**（真装载门实测）。
- ⇒ `1.8.24` 是**旧版本**，不是待修的包。基线里保留它的判词即可。

---

## 给作者的三条口径（从这 6 个里提炼）

1. **`pack.json` 的顶层键是闭集**：写一个装载器不认识的键（如 `credits`）会被**整包拒**，
   不是「忽略」。要记出处就写进 `description`。
2. **数据文件放包根**：`content` 里写 `chess` ⇒ 文件必须是 `<包根>/chess.json`；
   塞进 `data/`、`payload/` 之类子目录一概报 `declared but missing`。
3. **要改宿主文件就不是包**：pack 表达不了「替换 `public/js/ui/x.js`」或「替换 `data/assets.json`」。
   前者是插件 `code.client` 的事（`client/<相对路径>` → 宿主 `public/<相对路径>`），
   后者目前**没有任何机制**。
