# SOURCE.md — watch-lineup（观阵 · 战斗中查看队友布阵）

> 本包是**本仓库维护者本人（jingjiangze）的第一方投稿**，走与外部作者相同的 incoming/ 收件流程。
> 五件事逐条自报，无占位。

## 1. 原件叫什么、从哪来

- **名称**：watch-lineup（观阵 · 战斗中查看队友布阵，只读透传）
- **来源**：本会话（2026-10-20/21）为本仓生态新写的第一方包；配套的引擎内置实现已同时提 PR：
  Stronghold-Protocol-Server-Deploy#1（ms）/ #2（server）、Stronghold-Protocol-Forge#8（main 0.15.1 线）、
  Forge#9（modmgr 生产线，gpt/modmgr-watch-lineup → modmgr）
- **版本或日期**：1.0.0（2026-10-21）
- **拿到的方式**：直接从实现会话打包（`_tmp/watch-lineup-pack-2026-10-21/watch-lineup/` → bsdtar zip）

## 2. 原作者

- **署名**：jingjiangze（包作者 = 维护者本人；无第二作者）
- **联系方式**：本仓 owner 账号（GitHub @jingjiangze）

## 3. 原件的许可

- **有没有 LICENSE**：GPL-3.0-or-later（随游戏本体；pack.json `license` 字段同款声明）
- **是否允许再分发**：允许（GPL 之下）
- **其它限制**：无。包内无第三方代码、无自有素材

## 4. 它改了什么

**本包不改引擎任何文件**——它是纯工坊包，全部行为经引擎已合并的挂载面表达：

| 文件 | 作用 | 机制 |
|---|---|---|
| `pack.json` | 声明面：`server.modules[].uses:["matchClass"] + channels:["lineup"]`、`client.panels[].messages:["lineup"]`、`combat:true` | 闭集 36 键内的字段，无一多余 |
| `server/lineup.mjs` | matchClass 包装器：`handlePackMsg` 处理 `{action: on/off/view}`；view 经 `decideView` 四条闸门（开关/目标存活/live-field 命名碰撞/boss 分组）后调用引擎现成的 `Match.prepFieldMeta(target)` 并 `sendTo` 给观看者 | **服务端零计算**：只读透传，不算任何数值；状态挂 Match 实例随房销毁 |
| `client/watchLineup.js` | 面板（slot `screen.game.aside`）：自开关（观看者自己的，默认关）、队友行「布阵」按钮、收到 `m.field{prep:true}` 后按 rect 渲染定稿棋盘（棋盘/整备区/临时区/效果列/下一波敌人预览） | C 层只读：`ctx.net.send/on` 引擎通道，无 store/match 句柄 |
| `client/watchLineup.css` | 面板样式 | 无外部资源 |
| `notice/announcement.json` | 房内公告：怎么用 + 边界 | 追加语义，不覆盖引擎自带公告 |
| `test/gate.test.mjs`（6 组）+ `test/panel.test.mjs`（6 组） | 纯判定与假 DOM 面板测试（14 用例，本机 14/14 pass） | 不需要引擎根即可跑 |

- **有没有改引擎源码**：没有。`prepFieldMeta` / `sendTo` / `bossGroupOf` / `this.mods` 全是引擎（0.15.1/0.16.x 线）现成能力
- **有没有加新的干员 / 盟约 / 装备 / 特质**：没有
- **它自己说它做了什么**：战斗进行中查看其他玩家 prep 期末定稿的布阵；服务端零计算，开关是观看者自己的（仿 `g.autoplay`），最终攻势/隐秘核心沿用引擎分组隐藏规则

## 5. 自带素材是哪来的

| 素材 | 来源 | 授权 |
|---|---|---|
| 无 | —（索引器会判 `assetFree: true`） | — |

- **是否夹带游戏官方素材**：**否**。包内只有代码、pack.json 与一份公告文本

## 6. 其它想说的

- `combat: true` 是 **matchClass 的能力面声明**（引擎硬闸门：`uses` 含 matchClass 必须 combat:true）——
  本模块实际**只读透传**（不写任何对局状态），已在 pack.json description 与房内公告双处告知
- 与引擎内置实现（Deploy#1/#2、Forge#8/#9）语义一致、互不依赖：没合引擎 PR 的 0.15.1/0.16.x 树上本包独立生效；
  合了的树上两者共存（面板是额外面，不占主界面）
- 已知边界：战斗中查看时引擎主画面会临时切到该棋盘（vanilla 主 UI 行为），点「返回自己」恢复；
  modmgr（0.3.1 基座）线无 pack.msg 机制，本包目标线为 Forge main（0.15.1 || 0.16.x）
