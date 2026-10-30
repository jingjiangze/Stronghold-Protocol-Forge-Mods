# 上传站「过审 → 代提 PR」接入说明

给上传站（`site/server.mjs` 那套）加一条出口：**审核通过后，点一下把这条包推进 mod 仓库的 PR**，
由 `mod-gate` 在 PR 上校验、由人合并。

**为什么 token 放服务端、不放网页**（2026-10-20 安全审计结论）：

- 站点是纯静态（Cloudflare Pages + GitHub Pages，无 Functions），**没有服务端能拦**。token 一旦内置进页面，
  任何打开页面的人都能从 DevTools → Network 拿到它 —— 等于公开分发。
- 更要紧的是**token 能做什么**：classic PAT（`repo` scope）覆盖账号下**全部仓库**（含 private）、能改 Actions，
  还能通过「改 workflow 再触发」间接读到仓里的 `CLOUDFLARE_API_TOKEN`。
- 而 GitHub 的 secret scanning **只扫 GitHub 平台，扫不到你部署在 CF Pages 上的站点** ⇒
  「泄露后自动撤销」这条最后的兜底也不成立。
- ⇒ **凭证必须单点保管在服务端**：可秒级轮换、可只给单个仓、可设过期。

---

## 一、需要什么

| 项 | 值 |
|---|---|
| 服务端 | 跑上传站的这台机器（`node site/server.mjs` 那个进程所在处） |
| 新文件 | `site/publish-pr.mjs`（GitHub 客户端）、`site/publish-to-pr.mjs`（CLI） |
| 环境变量 | `SP_GITHUB_TOKEN`（**必需**）、`SP_GITHUB_REPO`（可选，默认本仓）、`SP_GITHUB_BASE`（可选，默认 `master`） |
| 站侧数据 | `--data` 指向上传站的数据根（默认 `/var/lib/sp-modsite`） |
| 依赖 | **无**。只用 Node 22 自带的 `fetch`，不引 octokit —— 少一个依赖少一处供应链面 |

## 二、配 token（唯一正确的形状）

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → 新建
2. **Repository access**：只选 `jingjiangze/Stronghold-Protocol-Forge-Mods` **这一个仓**
3. **Permissions**：
   - `Contents` = **Read and write**（要建 blob/tree/commit/ref）
   - `Pull requests` = **Read and write**（要开 PR）
   - **不要给 `Administration`** —— 那会连带能改分支保护、删仓库
4. **Expiration**：30 天或更短。到期自动失效，是最有效的兜底
5. 写进服务端 env（例如 `/opt/sp-modsite/.env`）：

```sh
SP_GITHUB_TOKEN=github_pat_xxx
# 可选
SP_GITHUB_REPO=jingjiangze/Stronghold-Protocol-Forge-Mods
SP_GITHUB_BASE=master
```

6. `systemctl restart <你的服务名>`

> ⚠ **不要**用现在本机那个 classic PAT（`repo` scope）—— 它覆盖名下全部 42 个仓库。
> fine-grained 能把爆炸半径缩到「1 个 public 仓」。

## 三、怎么用

### 先演练（不发任何请求）

```sh
node site/publish-to-pr.mjs --station-id <编号> --data /var/lib/sp-modsite --dry-run
```

会打印将要写入的 5 个文件与 PR 标题，**一个请求都不发**。

### 真提

```sh
node site/publish-to-pr.mjs --station-id <编号> --data /var/lib/sp-modsite
```

成功输出：

```
✓ 已开 PR #123  https://github.com/jingjiangze/Stronghold-Protocol-Forge-Mods/pull/123
  分支 publish/<编号> → master；等 mod-gate 变绿后由人合并。
```

### 它会做什么（以及**不会**做什么）

| 做 | 不做 |
|---|---|
| 只放行 `decision=approved` 的记录（未过审直接拒） | **不合并 PR**（合并永远是人的动作） |
| 写 `mods/<id>/<version>/{mod.zip,meta.json,decision.json,PROVENANCE.md}` | **不直推 master**（master 有分支保护） |
| 更新 `mods/index.json`（`mod-gate` 的 J5 要求索引与磁盘一致） | 不删旧版本、不改别人的条目 |
| 从站侧 `meta.json` 生成 PROVENANCE（缺失字段写「未声明」，不编造） | 不执行 mod 里的任何代码 |

## 四、接进审核后台（可选）

若要在 `/admin` 的审核页加一个按钮，最小改法是在 `site/server.mjs` 里加一个端点：

```js
// 放在其它 ADMIN_API 端点旁边
if (req.method === 'POST' && p === `${ADMIN_API}/publish-pr`) {
  // 与既有端点同一道门：ADMIN 令牌 + ADMIN_IPS
  const { publishPr, readConfig, provenanceMarkdown } = await import('./publish-pr.mjs');
  const id = url.searchParams.get('id');
  // …… 按 publish-to-pr.mjs 的逻辑组装 files（可直接复用它的函数）
  const out = await publishPr(readConfig(), { branch: `publish/${id}`, title, body, files });
  return sendJson(res, 200, { ok: true, pr: out.pr, url: out.url });
}
```

**不要**把这个端点做成「一过审就自动提 PR」——留一个人工点击更稳（避免误操作把半成品推上去，
也让「站上通过」与「入库」两步可以分开）。

## 五、数据形状（站侧）

CLI 从 `${data}/<area>/<id>/` 读：

| 文件 | 必需 | 用途 |
|---|---|---|
| `meta.json` | ✅ | 取 `packId`/`name`/`version`/`author`/`license`/`compatAuthor`/`compatOf`/`compatNote`/`note` |
| `decision.json` | ✅ | 只认 `decision === 'approved'` |
| `blob.zip` 或 `mod.zip` | ✅ | 包体（先找 `blob.zip`） |

`<area>` 三个区都查：`compat` / `flagged` / `submissions`（与 `server.mjs` 的 `dirOf` 同口径）。

## 六、自测

```sh
node --test site/publish-pr.test.mjs   # 14 项，含「dryRun 零请求」「非 2xx 抛错」「不合并」三条反向断言
```

> 注意：本仓库的 CI 规则是「不在本机跑长测试」，上面这条是纯逻辑测试（无网络、<1s），
> 适合本地手动跑；常规回归请走 GitHub Actions。
