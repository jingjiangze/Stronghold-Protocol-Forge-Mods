# mod 反馈接口（提交 / 查看 / agent 接入）

> 面向**维护者与 agent**。需求口径（业主 2026-10-13）：
> ① 任何人都能给某个 mod 提交反馈；② 每个 mod 可单独查看，也可多个 mod 合并查看；
> ③ 支持 agent 接入；④ 支持文字与图片 —— 而**反馈正文与图片只有网站维护者看得到**。
>
> 站点侧的用法（怎么点、怎么读）在 [`../site/README.md`](../site/README.md)〈mod 反馈〉一节；
> 这份文件是**接口规格**：字段、限制、错误码、鉴权、幂等与折叠判据。

---

## 0. 一句话形状

| 动作 | 端点 | 鉴权 | 说明 |
|---|---|---|---|
| 提交反馈（文字） | `POST /api/feedback?mod=<记录编号>[&dedupe=<幂等键>]` | **无**（公开） | JSON 报文体，≤64 KB |
| 给这条反馈贴一张图 | `POST /api/feedback/image?mod=<编号>&fb=<反馈编号>` | **图片令牌** `x-feedback-token` | 裸字节，≤2 MB，一条最多 4 张 |
| 看反馈（单条 / 合并 / 折叠 / 全量） | `GET /api/<ADMIN_PATH>/feedback?…` | 管理口两道（`ADMIN_IPS` + 令牌 / Basic） | 只有这里能读到正文 |
| 取某一张图片 | `GET /api/<ADMIN_PATH>/feedback/file?mod=&fb=&n=` | 同上 | `inline` + `nosniff` |
| 标处理状态 | `POST /api/<ADMIN_PATH>/fb-state`（`{id, fb, state, reason?}`） | 同上 | **一次只认一条**；幂等 |
| 维护者看的那一页 | `GET /<ADMIN_PATH>/feedback-view`（审核台导航里「反馈」那一格） | 同上 | 单独一页，**不是**第四个 view |
| 人手填写的表单页 | `GET /feedback?mod=<记录编号>` | 无 | 只是那张**写**反馈的表单，读不到任何人的反馈 |

**公开面读不到反馈**：`/api/mods`、`/mods`、`/api/status/*`、`/api/publisher/*`、`/api/file/*` 与
`GET /api/feedback`（404）全都读不到。这不是「某个端点记得不返回」，而是**数据结构**决定的：
反馈写在被反馈那条记录的 `feedback/` 子目录里，**不进 `meta.json`**，而公开面读的就是 `meta.json`。
（`node site/selftest-feedback.mjs` 用「写完反馈后 `/api/mods` **逐字节不变**」把这条钉住。）

---

## 1. 提交一条反馈

```
POST /api/feedback?mod=c07bbd471791
content-type: application/json

{ "text": "引擎 0.16.0 装载 errors=0，但面板在 screen.game.hud 上不出现",
  "kind": "bug", "severity": "blocking",
  "engineVersion": "0.16.0", "contact": "群里我的昵称" }
```

### 1.1 字段是**闭集**（与包契约 `PACK_FIELDS` 同一立场）

| 栏 | 必填 | 上限 | 缺省 | 判据 |
|---|---|---|---|---|
| `text` | ✅ | 2000 字 | — | 空 / 超 ⇒ 400 |
| `kind` | | 闭枚举 `bug` `compat` `content` `other` | `other` | **填错不回落**，直接 400 |
| `severity` | | 闭枚举 `info` `annoying` `blocking` | `info` | 同上 |
| `engineVersion` | | 80 字 | `null` | 空串按 `null` 存 |
| `contact` | | 80 字 | `null` | **只有维护者看得到**；站点不猜、不代填、不公开 |

多写任何一栏 ⇒ `400 FB_UNKNOWN_FIELD`，错误里点名是哪一栏（静默丢弃会变成「我明明写了却没收到」）。

### 1.2 谁能被反馈

只有**公开在架**的 mod：`decision === 'approved'` 且没有待确认的自撤申请（与 `/api/mods` 同一条判据）。
待审的、已打回的、已被兼容包取代的、以及根本不存在的编号 ⇒ **同一个 404、同一句话**
`{"error":"没有这个地址"}` —— 不区分，否则「能不能提反馈」就变成探待审队列的口子。

### 1.3 响应

```jsonc
// 201
{ "ok": true, "changed": true, "feedbackId": "f00e911bdf40", "mod": "c07bbd471791",
  "modName": "…", "state": "reported", "at": "2026-10-13T07:18:26.635Z",
  "kind": "bug", "severity": "blocking", "images": 0,
  "imageToken": "<32 hex>",            // ⭐ 明文只在这一个响应里出现一次；盘上只有哈希
  "imagePath": "/api/feedback/image?mod=c07bbd471791&fb=f00e911bdf40",
  "limits": { "textMax": 2000, "shortMax": 80, "imgMax": 4, "imgBytesMax": 2097152, "bodyBytesMax": 65536 },
  "message": "已收到。这条反馈只有维护者看得到…" }
```

### 1.4 `dedupe` —— agent 的幂等键

`?dedupe=<6–64 位 [A-Za-z0-9_-]>`。同一个键重复提交 ⇒ **`200 {changed:false}`** 并返回**已有那条**的编号，
不写第二笔。做法与 `/api/publisher/blob` 那条「逐字节相同 ⇒ `changed:false`」同源，
因为 agent 的网络重试是常态，而不是例外。人手填表那一页**不带** `dedupe`（按钮在请求期间禁用）。

---

## 2. 贴图片

```
POST /api/feedback/image?mod=c07bbd471791&fb=f00e911bdf40
x-feedback-token: <提交那一次响应里的 imageToken>
content-type: application/octet-stream          # 内容类型由服务端嗅探，不信这一栏

<图片裸字节>
```

**只收栅格图**：PNG / JPEG / GIF / WEBP，按**文件头魔数**判定。

| 情况 | 结果 |
|---|---|
| 缺 `x-feedback-token` 或不对 | `401` —— 否则任何人都能往别人那条反馈上塞图 |
| `fb` / `mod` 对不上 | `404 没有这个地址`（与「不存在」同一句话） |
| SVG / HTML / zip / 认不出的头 | `400 FB_NOT_AN_IMAGE` |
| 单张 > 2 MB | `413`（先看 `content-length` 明明白白拒，不传一半掐连接） |
| 已有 4 张 | `400`（一条反馈最多 4 张） |
| 与已贴的某张**逐字节相同** | `200 {changed:false}`，返回那一张，不重写 |

三条设计说明：

1. **为什么禁 SVG**：站点目前**没有 CSP 响应头**，而反馈正文是用户自由文本 —— 一张内嵌
   `<script>` 的 SVG 就是持久型 XSS，而它看起来完全「像一张图」。**白名单**而不是黑名单就是为这个。
2. **为什么不转码不缩图**：站点零依赖（`site/*.mjs` 只用 node 内置，无 npm、无数据库），
   没有图像库 ⇒ **存进去的字节 = 发出来的字节**。所以只能靠上限（2 MB / 4 张），不能靠重编码压小。
   要真正的小图与缩略图需要引入依赖，那是另一件事（见 §7 待裁决）。
3. **发的时候重嗅一次**：`GET ${ADMIN_API}/feedback/file` 会把磁盘文件的前 16 字节再嗅一遍，
   `content-type` **只来自嗅探结果**（不读扩展名、不读记录里那一栏、不读客户端报的），
   认不出就 404 一个字节都不发。落盘与读取之间文件若被别的途径换过，这是最后一道。

---

## 3. 查看：单独 / 合并 / 折叠 / 全量（**仅维护者**）

```bash
# 单独一条记录
curl -s -u admin:$ADMIN_TOKEN "http://127.0.0.1:25570/<ADMIN_PATH>/feedback?mod=c07bbd471791"
# 或带头
curl -s -H "x-admin-token: $ADMIN_TOKEN" ".../api/<ADMIN_PATH>/feedback?mod=a,b"
```

| 读法 | 含义 |
|---|---|
| `?mod=<编号>` | 那一条记录的反馈（最窄的一档） |
| `?mod=a,b,c` | **合并**几条记录（读侧批量，最多 20 个） |
| `?group=<编号>` | 把「**同一款 mod**」的几条记录折成一组看 |
| `?all=1&cursor=<偏移>&limit=<50>` | 全量翻页（`limit` ≤200），agent 做汇总用 |
| 一个都不给 | `400`，并把四种读法说清楚 |

### 3.1 折叠判据（为什么必须折叠）

站上一份 mod 常常**是几条记录**：

- 同一个 `pack.json.id` 的两条（引擎不允许同 id 并存，`/mods` 页对此专门画了一行提示）；
- 原件投稿 + 维护者的**兼容改写版**（`compatOf` 那条链，改写后原投稿转 `superseded`）。

线上实测（2026-10-13）：可见的 53 条里只有 **30 个不同 `packId`**，两组「同 packId 多条」，
另有 **25 条 `compatOf` 链**。**按记录编号分组会把同一款 mod 的反馈劈成几半**，所以：

```
判据①  packId 相同            （packId 取包内 pack.json.id —— 与公开列表同一份推导，不另立口径）
判据②  compatOf 双向有链        （A 说它由 B 改来 ⇒ A、B 是一款）
组名    pack:<packId>，拿不到 packId 时退回 rec:<组根编号>
```

拿不到 `packId` 的记录（说明包、zip 读不出 pack.json 的形态）**退化成按自己成组** ——
宁可多分几组，也**绝不**把两款无关的 mod 并进一组。
折叠组里**连待审的同 packId 记录一起列出**，每条带 `state` 栏如实标注（不藏，也不因此收反馈）。

### 3.2 响应

```jsonc
{ "ok": true, "mode": "merged", "at": "…",
  "items": [ { "id": "f00e911bdf40", "mod": "c07bbd471791", "modName": "…",
               "area": "submissions", "state": "approved",
               "packId": "fb-fold-test", "groupKey": "pack:fb-fold-test",
               "at": "…", "kind": "bug", "severity": "blocking",
               "text": "正文原样", "engineVersion": "0.16.0", "contact": "…",
               "ip": "203.0.113.7", "dedupe": null,
               "images": [ { "n": 1, "bytes": 49, "sha256": "…", "mediaType": "image/png",
                             "at": "…", "url": "/api/<ADMIN_PATH>/feedback/file?mod=…&fb=…&n=1" } ] } ],
  "mods":   [ { "id": "…", "name": "…", "exists": true, "state": "approved", "packKind": "functional",
                "packId": "…", "groupKey": "…", "feedbackCount": 3, "imageCount": 5 } ],
  "groups": { "pack:fb-fold-test": ["2efdbd…", "31abca…"] },
  "counts": { "records": 2, "items": 3, "shown": 3, "missing": [],
              "byKind": {"other":3}, "bySeverity": {"info":3}, "withImages": 2, "imageFiles": 5 },
  "cursor": null,   // 只有 all=1 且还有下一页时给偏移
  "privacy": "这一份响应含反馈正文与图片地址，只在管理口内…" }
```

`items` 按时间**倒序**（最近的先看），与审核台列表那一口径一致。

---

### 3.3 处理状态（`POST ${ADMIN_API}/fb-state`）

```jsonc
{ "id": "c07bbd471791", "fb": "f00e911bdf40", "state": "doing", "reason": "已复现，等下一版" }
```

| 档 | 含义 |
|---|---|
| `new` | 没人看过（**缺省就是它**：文件里没有这一栏 ⇒ 读成 `new`，不回填、不猜） |
| `read` | 看过了 |
| `doing` | 在办 |
| `done` | 办完 |

- **一次只认一条**：`id` + `fb` 都要明确写出；报文里出现 `ids` / `batch` / `items` / `list` ⇒ 400（AGENTS.md §8.1）。
- **幂等**：目标值已经是它 ⇒ `200 {changed:false}`，**不写盘、不留第二笔流水**。
- **只动状态那一栏**：正文、图片、图片令牌哈希一个字节都不碰；每次真改动追加一笔
  `stateHistory: { at, from, to, by:'admin', reason }`（流水只加不减 ⇒ 零删除）。
- 读侧配套：`?state=new`（可逗号多选，值不在闭集 ⇒ 400 点名），
  `counts.byState` 数的是**筛过那一批**，`counts.matched` 是没筛的条数（「筛掉了多少」要对得上）；
  `mods[].feedbackNew` 给「这条记录还有几条没看过」。
- 状态存在**反馈自己的文件**里（不在 `meta.json`）⇒ 标状态同样不可能漏进公开面。

## 4. 鉴权与限流

| 侧 | 凭据 | 限流 |
|---|---|---|
| 写（反馈 / 图片） | **无**（与 `/api/submit` 同一立场：公开投稿） | 每 IP 每 10 分钟 **60 次**（复用 `publisherRateLimited`） |
| 读（反馈 / 图片） | `ADMIN_IPS` 白名单 **+** `x-admin-token` 或 HTTP Basic（用户名 `admin`） | 不设（读侧不是刷量面） |

⚠️ 两点如实说明：

- **没有为反馈另开限流档**。这个 60/10min/IP 的桶是**按 IP**、与发布者自助那几条**共用**的，
  对 agent 批量提交并不合适（ NAT 出口 / 多人共享一个出口 IP 会互相挡）。
  反馈与 agent 的配额方案是**单独一份提案**，不夹在这个功能里顺带改。
- **`ADMIN_IPS` 默认只认回环**，而站点只有 HTTP —— 所以「读反馈」这件事目前只能在
  SSH 隧道里做（`ssh -L 25570:127.0.0.1:25570 …`）。挂 agent 时把 agent 放在**服务器那一侧**或隧道内。

---

## 5. agent 接入清单（照抄就能跑）

```bash
BASE=http://47.103.14.217:25570
MOD=c07bbd471791
KEY=ci-run-20261013-a1        # 幂等键：同一轮重跑用同一个值

# ① 取在架 mod 的编号（公开，无凭据）
curl -s "$BASE/api/mods" | jq -r '.mods[] | "\(.id)  \(.name)"'

# ② 提交文字反馈
R=$(curl -s -X POST "$BASE/api/feedback?mod=$MOD&dedupe=$KEY" \
      -H 'content-type: application/json' \
      -d '{"text":"装载 errors=0，但 aside 槽没有画出来","kind":"bug","severity":"annoying","engineVersion":"0.16.0"}')
FB=$(echo "$R" | jq -r .feedbackId); TOK=$(echo "$R" | jq -r .imageToken)

# ③ 贴一张截图（裸字节；PNG 由服务端嗅认）
curl -s -X POST "$BASE/api/feedback/image?mod=$MOD&fb=$FB" \
      -H "x-feedback-token: $TOK" --data-binary @shot.png

# ④ 读（agent 要在管理侧跑）
curl -s -H "x-admin-token: $ADMIN_TOKEN" "$BASE/api/<ADMIN_PATH>/feedback?group=$MOD" | jq .counts
```

给 agent 的六条约定：

1. **重试带同一个 `dedupe`** —— 网络重试不该产生第二笔；同键返回 `200 {changed:false}`。
2. **一次只提一个 mod**。批量栏（`ids` / `batch` / `items` / `list`）一律 400 ——
   那是仓里 §8.1 那条铁律（写侧永远单条），合并只在**读**侧。
3. **图片传字节，不要传 URL**。站点**不抓外链**（也就没有 SSRF 面）；URL 形态需要引入抓取与
   校验，属于另一次改动。
4. **不要指望读公开面拿到反馈**。任何「读反馈」的 agent 都需要 `ADMIN_TOKEN`，
   并且要能到达管理口（回环 / 白名单 IP）。
5. **撞 429 就退避**，不要换 IP 绕过（桶是按来源 IP 的，`TRUST_PROXY=0` 时不认 `x-forwarded-for`）。
6. 反馈的**正文原样存**，站点不渲染 markdown、不清洗、不截断（只按 2000 字拒长）。

---

## 6. 落盘与备份

```
<DATA_DIR>/submissions/<记录编号>/feedback/<反馈编号>.json     正文 + 元数据 + 图片清单 + 图片令牌哈希
<DATA_DIR>/submissions/<记录编号>/feedback/<反馈编号>-<序>.png  图片原字节
<DATA_DIR>/audit.jsonl                                        事件流（feedbackSubmit / feedbackImage）
```

- 备份照旧**只备份 `DATA_DIR`** 一个目录，没有新增要备份的东西。
- 图片写盘走「先落 `DATA_DIR` 根下的 `<fb>-<n>.fbimg.part`、检查全过再 `rename` 进记录目录」，
  失败路径由请求处理器的 `finally` 兜掉 —— 与 `/api/submit`、`/api/publisher/blob` 同一条纪律。
  **`DATA_DIR` 根下仍然只有 `submissions/`、`flagged/`、`compat/` 三个目录**（那条不变量没动）。
- 审计日志**一个凭据字节都不写**：图片令牌明文不进日志（自测里有一条专门断这件事）。
- **零删除**：反馈没有删除口，也没有「标记已处理」那类决定端点。
  要清理请当作**审核动作**由人在服务器上处理（删目录即可，与站点「想清掉一条投稿就删对应目录」同口径）。

## 7. 这一版**没做**的事（列清楚，免得下一个人以为有）

| 项 | 现状 | 为什么 |
|---|---|---|
| ~~反馈的处理状态~~ | **已做**：`new / read / doing / done`（§3.3） | 一次一条、幂等、只动那一栏；没有引入批量操作 |
| ~~维护者看的界面~~ | **已做**：`GET /<ADMIN_PATH>/feedback-view` | **单独一页**而不是审核台的第四个视图 —— 那一页是一整个内联 `<script>`，顶层抛一次错就会把后面所有绑定点全带哑（`selftest-admin.mjs` 治的就是这类事故），两边分开才互不牵连 |
| 图片缩略图 / 压缩 | 不做 | 零依赖约束（不引图像库）；所以上限是 2 MB × 4 张 |
| CSP / HTTPS | **未加**（站点既有状态：响应头里一个安全头都没有；443 未开） | 加图片这一路**提高了对这两项的需要**，但它们会影响三份既有页面（三页都是内联 `<script>`，严格 CSP 会当场打断它们），属于另一次改动 |
| 反馈的通知 / webhook | 无 | 需要出网抓取或另一套凭据 |
| agent 独立配额 | 未做 | 单独提案，不由这个功能顺带改（§4） |
| 删除反馈 | 无 | 站点整条链**零删除**；要清理由人在服务器上删目录 |
