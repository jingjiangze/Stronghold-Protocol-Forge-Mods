# 跨域资源放行（CSP 声明）— SOURCE

## 1. 原件叫什么、从哪来
- **名称**：csp-allow（原创）
- **来源**：本项目自建（origin: jingjiangze/Stronghold-Protocol-Forge-Mods）
- **版本或日期**：1.0.0 · 2026-10-21
- **拿到的方式**：随基座改动一起产生

## 2. 原作者
- **署名**：jingjiangze
- **联系方式**：无

## 3. 原件的许可
- **有没有 LICENSE**：GPL-3.0-or-later（随基座）
- **是否允许再分发**：允许
- **其它限制**：无

## 4. 它改了什么
- 新增**插件声明跨域源**的能力：`plugin.json` 可以写 `"csp": { img: [...], media: [...], connect: [...], script: [...], style: [...], font: [...], frame: [...] }`，服务端把它们合并进站点 `Content-Security-Policy`。
- 只接受明确的 `https://` 源（或 `http://localhost[:port]`）；`*`、`'unsafe-inline'`、`'unsafe-eval'` 一律拒绝。
- `"csp": "off"` 完全关闭 CSP（需显式，服务端打 warn）。
- 本插件就是一份**默认白名单**：素材 CDN、网易云音频/封面 CDN、音乐搜索接口。

- **有没有改引擎源码**：**有，这是前提**。本插件需要基座包含这三处改动：
  1. `server/http/csp.js` — `siteCsp(publicDir, extra)` + `mergeCspSources()` + `isAllowedCspSource()` + 按指令去重
  2. `server/index.js` — 读所有 loaded 插件的 `plugin.json.csp`，合并后传给 `siteCsp`
  3. `shared/plugins/manifest.js` — manifest 字段白名单加 `csp`
  没有这三处，插件装了不生效（但也不会报错）。
- **有没有加新的干员 / 盟约 / 装备 / 特质**：没有。

## 5. 自带素材是哪来的
- 无素材（纯声明）。
