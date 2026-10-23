# 感谢名单（标题屏滚动条）· SOURCE

## 1. 原件叫什么、从哪来

- **名称**：感谢名单滚动条（Thanks marquee / title-thanks）
- **来源**：本仓库所有者自有实现。首发于线上正式服 `http://101.37.150.107:3000`（标题屏 `/` 页脚），
  样式即照该处复刻；本次按其行为重新实现为可安装的工坊包。
- **版本或日期**：2026-10-21 打包（plugin version 0.1.0）
- **拿到的方式**：从部署树 `Stronghold-Protocol-Server-Deploy`（分支 `ms`）中提取，非第三方原件。

## 2. 原作者

- **署名**：jingjiangze（所有者本人）；名单内容本身来自社区，详见第 5 条
- **联系方式**：GitHub `jingjiangze`

## 3. 原件的许可

- **有没有 LICENSE**：无单独 LICENSE 文件；实现以 CC0-1.0 声明（见 `plugin.json` 的 `license`）
- **是否允许再分发**：允许
- **其它限制**：无

## 4. 它改了什么

| 改的东西 | 怎么改的 | 备注 |
|---|---|---|
| `js/screens/title.js`（覆盖） | 追加 `ThanksMarquee()` 组件，挂在 `<footer class="title-foot">` 第一个子元素 | 与 mota 覆盖版逐字节同源，另补 `export function Emblem()`（见下） |
| `css/screens/title.css`（覆盖） | 追加 `.title-thanks` 全段 + `@keyframes thanks-scroll`（32s linear，`translateX(-50%)` 无缝）+ hover/active 暂停 + `prefers-reduced-motion` 静止 | |
| 数据源 | 同源 `GET /data/thanks.json`（服务端代理自 `ganxiemingdan.jiangjiangze.icu`，60s 轮询），**不跨域、不改 CSP** | 失败静默降级 |
| 兜底 | 内置快照 `THANKS_FALLBACK`（13 条 + dedication） | 源不可用时仍渲染 |

- **有没有改引擎源码**：没有。只覆盖客户端两个文件，零玩法数据改动。
- **有没有加新的干员 / 盟约 / 装备 / 特质**：没有。
- **它自己说它做了什么**：「在标题屏页脚加一条横向无缝滚动的感谢名单。」

### ⚠ 一个需要维护者知道的既有缺陷（不是本包引入）

部署树基线里 `public/js/screens/title.js:113` 是 `function Emblem()`（**未导出**），而
`public/js/ui/achievements.js:28` 是 `import { Emblem } from '../screens/title.js'` —— 上游自身缺导出。
本包的 `title.js` 副本**补了 `export`** 才能被 achievements 正常 import；`public/` 原文件本次未动
（避免影响 mota 线）。维护者若要修根，请改 `public/js/screens/title.js` 那一份。

## 5. 自带素材是哪来的

| 素材 | 来源 | 授权 |
|---|---|---|
| 名单文字（人名 + 角色） | `https://ganxiemingdan.jiangjiangze.icu`（KV 由该站维护者用口令维护） | 站方公开数据 |
| 无图片 / 音频 / 模型 | — | — |

## 6. 安装与形态

- `class: trusted` + `code.client`（标题屏代码覆盖必须 trusted；`content` 类不允许携带 `.js`）
- `scope: ["room"]`；`loadOrder` 不是 manifest 2 字段（打包器已告警），覆盖优先级靠 id 字典序：
  `mota` < `thanks` ⇒ `thanks` 胜出，与 `server/index.js` 的排序判据一致
- 已在本机（`SP_PLUGIN_SCRIPTS=trusted-force`）实测：`thanks: loaded`、`title.js` 覆盖生效、
  `/data/thanks.json` 返回 13 条、真浏览器渲染 28 个名字 + `thanks-scroll/32s` + 实测滚动 + 零报错
