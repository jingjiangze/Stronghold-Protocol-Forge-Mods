# PROVENANCE — 观阵 · 战斗中查看队友布阵（只读透传）

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `watch-lineup` · 1.0.0 |
| ② 原作者 | 未声明 |
| ③ 原件许可 | GPL-3.0-or-later（随游戏本体；本包无自有素材） |
| ④ 兼容改写者 | 未声明 |
| ⑤ 来源 | 本项目自建；走与外部作者相同的 `incoming/` 收件流程 |
| ⑥ 改了什么 | 纯工坊包，未改引擎任何文件；全部行为走引擎既有挂载面（`prepFieldMeta` / `sendTo` / `bossGroupOf` / `this.mods`） |

## 素材与授权

- 本包**不含**图片 / 音频 / 字体 / Spine 素材，无第三方代码。

## 引擎版本与兼容性

- `pack.json` 目标线：`game: 0.15.1 || 0.16.x`，`api: >=1 <2`。
- `modmgr`（0.3.1 基座）线**没有 `pack.msg` 机制**，本包在 0.3.1 上不生效。
- 配套引擎 PR（语义一致、互不依赖，合与不合都能工作）：
  - `Stronghold-Protocol-Server-Deploy#1` / `#2`
  - `Stronghold-Protocol-Forge#8` / `#9`
- `combat: true` 是能力面声明（`matchClass` 是唯一能改对局结果的挂载点，引擎硬闸门要求它）；本模块实际**只读透传**，不做任何模拟、不改任何对局数值。
- 开关是观看者自己的（仿 `g.autoplay`，默认关；关着时本包一个分支都不进）。

## 已知限制

- 战斗中查看时，引擎主画面会**临时切到该棋盘**，点「返回自己」即恢复（引擎既有行为）。
- `clientCombat` 的战场 `fieldId` 恰为 `n:<pid>`，存在 live field 命名碰撞；本包先查 `fields` 再进布阵板分支。
- 最终攻势 / 隐秘核心期间沿用引擎的分组隐藏规则。
- 与 `stronghold-ui` 无同文件冲突：本包落点为 `client/watchLineup.js` + `server/lineup.mjs`，前者覆盖的是 `js/ui/lobbyMusic.js`。
