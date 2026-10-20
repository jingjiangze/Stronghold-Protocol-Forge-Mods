# stronghold-ui — 盟约界面增强（插件包）

## 1. 原件叫什么、从哪来

- **名称**：`ui-package-20261014`（Stronghold Protocol 0.2.6 定制部署的前端界面包）
- **来源**：该定制部署的服主提供的离线包（`ui-package-20261014.zip`）；本仓库外无公开 URL
- **版本或日期**：2026-10-14（包内 `MANIFEST.json` 的 `basedOn: Stronghold Protocol 0.2.6`）
- **拿到的方式**：直接拿到 zip，未经过 git

## 2. 原作者

- **署名**：原件未署名（原包只写「来自一台改造过的服务器」）
- **联系方式**：无

## 3. 原件的许可

- **有没有 LICENSE**：原件未声明许可
- **是否允许再分发**：不清楚
- **其它限制**：原包 `AGENTS.md` 写明「仅供个人学习研究使用，禁止用于商业及非法用途」；本插件沿用同一条限制

## 4. 它改了什么

本包**没有改原件的美术与数值**，只做了三件事：

| 改的东西 | 怎么改的 | 备注 |
|---|---|---|
| 原件的 20 个界面文件 + 8 个兼容垫片 | 整理成 `plugin.json` 的 `code.client` 覆盖层（同名覆盖基座 `public/**`） | 不修改基座磁盘文件 |
| `public/js/audio.js` | 加两处可选钩子：`playBgm` 开头的 `lobbyMusicOverride`、`bgm` 建立后的 `lobbyMusicBgmStarted` | 不装本插件时两处都是空调用，原 BGM 行为不变 |
| `public/js/ui/lobbyMusic.js` | **新增**（原件只有本地文件上传）：网易云搜索、粘贴歌曲/歌单链接、队列顺序播放、歌词、封面 | 见下 |

大厅音乐的实现细节：

- 搜索与解析优先走 `ffapi.cn` 的签名接口（`POST /tool/163_music/api/api.php`，签名为 `md5(秒级时间戳 + 固定串)`），失败回退 Meting 公共端点。
- 音频直链是网易云 CDN，`<audio crossOrigin="anonymous">` 经 Web Audio 接进游戏原有的 `bgmGain`，所以音量/静音沿用游戏设置。
- 只保存歌曲 id，不保存签名 URL（地址带时效）。

- **有没有改引擎源码**：没有。插件不碰 `server/**`、`shared/**`（除了一份 `shared/randomMode.js` 兼容垫片，仅在目标缺失时生效）。
- **有没有加新的干员 / 盟约 / 装备 / 特质**：没有。
- **它自己说它做了什么**：原件 `AGENTS.md` 第 1 节列出「大厅/房间/调配/结算、S.W.E.E.P. 报告、大厅背景、成就统计、对局动画与结算」等界面改造；本包原样保留这些，只额外加了大厅音乐。

## 5. 自带素材是哪来的

| 素材 | 来源 | 授权 |
|---|---|---|
| 无 | 包内不含任何图片/音频 | — |

所有图片、音频走游戏原有的 CDN（`speedcdn.jiangjiangze.icu`）或玩家浏览器本地存储，包内只有代码与 CSS。

## 6. 安装依赖（重要）

- 基座必须是**支持 `code.client` 客户端覆盖**的版本（mod 管理器改造过的 Stronghold Protocol 0.3.x）。
- 装好后必须在 `plugins/config.json` 的 `trusted` 里钉住本包 `plugin.lock.json` 的 sha256，否则会被 `PLUGIN_TRUST_PIN` 静默禁用。
- 服务端 CSP 需要放行：`speedcdn.jiangjiangze.icu`（素材）、`api.qijieya.cn` / `api.injahow.cn` / `www.ffapi.cn`（音乐接口）、`*.music.126.net` / `*.126.net` / `*.127.net`（网易云音频与封面）。
- 官方 0.3.1 原版基座**不支持** `code.client`，装上不生效。
