# SOURCE.md — 离线独立模拟（offline-solo）

## 1. 原件叫什么、从哪来

- **名称**：离线独立模拟（offline-solo）· Offline solo (pure browser)
- **来源**：本 mod 是自研产物，没有上游原件。源码在引擎仓的同一条 PR 里：
  <https://github.com/jingjiangze/Stronghold-Protocol-Server-Deploy/pull/3>，
  目录 `plugins/offline-solo/`（`public/js/offline/` 是同一批文件的基座副本）。
- **版本或日期**：0.3.1（2026-10-21 打包）
- **拿到的方式**：由 `node tools/plugin.mjs pack plugins/offline-solo --zip` 从该分支直接打出。

## 2. 原作者

- **署名**：jingjiangze（本仓维护者）
- **联系方式**：GitHub <https://github.com/jingjiangze>

## 3. 原件的许可

- **有没有 LICENSE**：GPL-3.0-or-later，与引擎仓 `Stronghold-Protocol` 一致（仓根 `LICENSE`）。
- **是否允许再分发**：允许（GPL-3.0-or-later）。
- **其它限制**：不含任何游戏官方素材（见第 5 节），因此不涉及素材授权问题。

## 4. 它改了什么

这是一个**只加客户端代码**的插件：不改 `data/**`、不改玩法数值、不改引擎源码。

| 加的东西 | 作用 |
|---|---|
| `client/js/offline/index.js` | 启动探测（`?host=0` / `?server=1` / `HEAD /healthz`）与 `bootOffline()` |
| `client/js/offline/localSocket.js` | 页内 loopback WebSocket（形状与浏览器 `WebSocket` 一致） |
| `client/js/offline/localLobby.js` | 薄大厅：应答 `hello` / `ping` / `room.*`，其余 `g.*` / `b.*` 转给真 `Match` |
| `client/js/offline/lineupOutbox.js` | 离线布阵队列（`localStorage`，最多 200 条，按签名去重） |
| `client/js/offline/lineupSync.js` | 重新联网后分批 `POST /api/offline-lineup` |
| `host/noop.js` | 服务端空实现（本插件没有服务端代码） |

- **有没有改引擎源码**：没有。**但反过来必须说清** ——
  这个包单独装上**不会让游戏离线可玩**：它需要引擎侧同时具备
  ① `/match/` 静态挂载、② `/data.js` 垫片的 `getConfig` / `getMode`、③ `public/js/main.js` 里的离线探测入口。
  这三处都在上面那条引擎 PR 里。**在缺少这些改动的旧引擎上，本插件只是一批不会被加载的静态文件。**
- **有没有加新的干员 / 盟约 / 装备 / 特质**：没有。
- **它自己说它做了什么**：`plugin.json` 的 `description` ——
  「不连服务器也能打完一整局独立模拟：页内 loopback + 薄大厅 + 真 Match 引擎。结算的布阵先落本地队列，联网后补传学习库。只加代码，不改玩法数据。」

## 5. 自带素材是哪来的

| 素材 | 来源 | 授权 |
|---|---|---|
| （无） | — | — |

- **是否夹带游戏官方素材**：否。包内只有 `.js` 与 `plugin.json` / `plugin.lock.json`，共 8 个条目。

## 6. 其它想说的

- 本包是**引擎内同一批文件的副本**：引擎分支上它默认**不启用**（`plugins/config.json` 的 `trusted` 里登记了 pin，
  但不在 `default` 列表），因为离线能力已经放在基座树里，保证「一台没有任何插件的服务器」也能离线开局。
  换句话说：装不装它，玩法表现一样；它的意义是让 mod 管理器能看见 / 固定 / 分发这个能力。
- 包内含 `plugin.lock.json`（7 个文件的 SHA-256 与字节数），可用于安装前校验。
- 已验证：`node tools/plugin.mjs check` 0 problem / 0 warning；`unzip -t` 级 CRC 全通过。
