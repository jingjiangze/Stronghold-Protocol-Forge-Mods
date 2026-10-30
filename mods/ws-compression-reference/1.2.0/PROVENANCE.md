# 署名与来源 · PROVENANCE

> 原作者与兼容改写者**分开列出，不抹掉任何一方**。原件未署名的一律写**「原件未署名」**，不代填；
> 许可照实抄自包内 `pack.json` 的 `license` 字段，未改动。

## 包

| 项 | 值 |
|---|---|
| 包 id | `ws-compression-reference` |
| 版本 | `1.2.0` |
| 名称 | WS 压缩参考（协商参数 / 档位 / 实测） |
| 目录名 = 包 id | 是 |
| 顶层目录 | `ws-compression-reference/` |

## 原作者

不单列个人署名 —— 见包内 `pack.json` 的 `author` 字段（原件未改动），以及包内 `NOTICE-来源说明.md`「本包是原作者自己做的」一节。

**上游**：`jingjiangze/stronghold-ws-compression`（<https://github.com/jingjiangze/stronghold-ws-compression>，
2026-10-11 建，MIT）。它是从一个在跑的卫戍协议服务端 `jingjiangze/stronghold-master-play`
（线上 `build a697834a6599`）里抽出来的 WebSocket 链路层。

## 许可

`MIT`（包内 `pack.json.license` 原文）。

## 兼容改写者

`Mo233`

## 来源

站点投稿 **`20a46941c219`**，原件 zip 大小 **8846 字节**，
sha256 `692a3c3ae3ef7d3633c9efcf1da610dfd1e61a5fb312944b050d86bc80f40a15`
（源文件只读，未改动一个字节）。

## 改了什么

**包内 5 个文件的内容一个字节都没动**（逐文件 sha256 见下表）。本次只有一处改动：

| # | 改动点 | 原做法 | 我们的做法 | 为什么 |
|---|---|---|---|---|
| 1 | **zip 条目名** | `css\ws-compression.css`、`ui\wsCompression.js` —— 条目名里是**字面反斜杠**（Windows 打包工具的常见产物，不是路径分隔符） | 重打成规范条目名 `css/ws-compression.css`、`ui/wsCompression.js`（正斜杠） | 正斜杠是 ZIP 规范的路径分隔符。Linux 侧解压时字面反斜杠**不会被当分隔符**，会落成一个名为 `css\ws-compression.css` 的文件，于是 `pack.json.client.panels[0].module = "ui/wsCompression.js"` 与 `styles[0] = "css/ws-compression.css"` 都指不到东西 —— 面板与样式表静默不加载。条目名不是内容，所以这一改**不动任何文件字节**。 |

**没有其他改动**：`api`（`">=1 <2"`）本来就与引擎 `MOD_API_VERSION = 1` 相符；`routes` / `client.panels` /
`content: []` / `combat: false` / `layer: "C"` 全部照旧；包内没有重复实现，也没有第二份同义声明。
`NOTICE-来源说明.md` 与自带元数据（`name` / `description` / `author` / `license` / `version`）一字未改。

### 本包**做不到**的那一半（原作者已在 `NOTICE-来源说明.md`「做不了的部分」写明，与引擎一致）

传输层压缩是 `WebSocketServer({ perMessageDeflate })` 的**启动选项**，作用在建连时刻的扩展协商上。
工坊包在服务端能声明的只有 `server.preDispatch`（拦**入站 C2S** 消息）与 `routes`（只读 `.json`），
两者都够不到握手选项；`server.modules` 的白名单也不允许注入代码去改。面板侧同样读不到实时协商结果
（`ctx` 里没有网络层）。所以这个包是**可核对的参考 + 自查步骤**，不是「装了就让压缩生效」的包 ——
与原件 `NOTICE-来源说明.md` 的结论一致，本次适配没有改变这个边界。

## 自带素材来源

**没有任何素材。** 没有图标、没有音频、没有字体、没有游戏解包数据。
`css/ws-compression.css` 与 `ui/wsCompression.js` 是本包自带的样式与代码（MIT）；
`ws-compression.json` 是原件自己的实测与判定数据。

## 校验用哈希（改动前 / 改动后）

| 文件 | 改动前 sha256（= 原件） | 改动后 sha256 |
|---|---|---|
| `css/ws-compression.css` | `cadb02203ca73fb9a8658223f93ba41ae0e32604987f846c1a4d82e1f5364429` | 同左（未改） |
| `ui/wsCompression.js` | `62fc9f208f9a9b723968c87efed52d051f9b1bf0f49f305852c2bf511d1e3dae` | 同左（未改） |
| `NOTICE-来源说明.md` | `e01f6ed5dea535a038065742647484a966a9a13696ec7c2864ba125b612d1343` | 同左（未改） |
| `pack.json` | `424b16910a4daec52c239b19b479d9d8355d007f1968a6678709139ac2e87e1d` | 同左（未改） |
| `ws-compression.json` | `fa9cb2490f8db4e2937422e3ed6741387479604754630d8a008c2e4b09d589e0` | 同左（未改） |

条目名那一处改动不落在任何文件的字节上，所以上表的「改动后」与「改动前」逐条相同 ——
**唯一变的是 zip 里那两条的落点**。`PROVENANCE.md` 是本次新增 =
`1ad35ba559fe78fac90e38d1bd7adefd1ed9d642785dc5927e9c900f40e667c4`（4482 B），不参与上表。

本成品：`20a46941c219-ws-compression-reference.zip`（6 个条目，顶层目录 `ws-compression-reference/`，一包一 zip）。**字节数与 sha256 记在交付索引**
`../CHECKSUMS.txt`（与其余统一交付物同一份清单）。这里刻意不写它：包内文本一变，包含它的那个 zip 的摘要
就跟着变，写进包里必然自相矛盾。
sha256 `bb2f81e07651529644fd86dac00c917c4b98d0cf9268c063269886cf053c9253`（6 个条目，顶层目录 `ws-compression-reference/`）。
