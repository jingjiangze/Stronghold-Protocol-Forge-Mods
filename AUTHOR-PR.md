# 作者直接提 PR 的链路（最小 token）

目标：**mod 作者直接 PR 到本仓库，CI 自动测，你必须审核后才合并。**

---

## 一、链路形状

```
作者（任意人）
  │  用自己的 GitHub 账号
  │  fork → 在 incoming/<mod名>/ 放 mod.zip + SOURCE.md → 开 PR
  ▼
你的仓库  PR #N
  │  ① mod-gate 自动跑（类型 / CRC / ≤200MiB / 索引一致性）
  │  ② mod-compat 自动跑（静态契约预检）
  │  ③ ⛔ 缺审批 ⇒ state=blocked（这就是「必须你审」）
  ▼
你点「Approve」
  │  ⇒ state=clean
  ▼
你点「Merge」（squash）
  ▼
合并后：build-mods-json.yml 重新生成 mods.json → 两条腿部署 → 站点更新
```

**关键点：作者的 PR 在缺你的审批时是 `blocked`，GitHub 在服务端拒绝合并。**
这不是靠自觉，是平台强制的。

---

## 二、当前已配好的保护（实测确认）

| 规则 | 值 | 效果 |
|---|---|---|
| `required_approving_review_count` | **1** | 作者 PR 缺审批 ⇒ `blocked`，合不了 |
| `dismiss_stale_reviews` | **true** | 作者改一次代码，你的旧审批作废，需重审 |
| `required_status_checks` | `mod-gate`（strict） | CI 不过也合不了 |
| `enforce_admins` | **false** | **你自己的 PR（含 CI 的 mods.json PR）不被审批卡住** |
| `allow_force_pushes` / `allow_deletions` | false/false | 不能强推、不能删 master |
| `allow_forking` | true | 陌生人能 fork（这是「作者直接 PR」的前提） |

> 实测记录（2026-10-20）：
> - 自批自己的 PR → `422 Review Can not approve your own pull request`；
> - 作者视角的 PR 缺审批 → `mergeable_state=blocked`；
> - 你的 admin 身份在有 `required_approving_review_count=1` 时**仍可直接合并**（`enforce_admins=false`）。

---

## 三、token 怎么给（两种，选一种）

### 方案甲：作者完全不需要 token（推荐）

作者用**自己的 GitHub 账号** fork + PR。**你不需要发任何凭证给任何人。**

- 作者门槛：一个 GitHub 账号（免费）。
- 上传方式：GitHub 网页 `Upload files`，**单文件 ≤25 MiB**；拖整个文件夹也行。
- 大文件（25–100 MiB）：作者自己用 `git push`（需要装 git，但不需要任何 token —— fork 是他自己的仓）。
- **风险边界**：fork PR 的 `GITHUB_TOKEN` 被 GitHub 强制降为**只读**，拿不到任何 secrets。
  所以「作者直接 PR」在 GitHub 的模型里天然是安全的。

**这条是正道，且已经可用**（`allow_forking=true`、`required_approving_review_count=1` 都已生效）。

### 方案乙：发一把「只能 PR 到本仓库」的最小 token

**只有当你要让作者在网页上「点一下就提交」、完全不想让他碰到 fork/PR 概念时才需要。**

GitHub 没有「只能开 PR 不能推代码」的权限——`Contents: write` 天然包含「能推分支」。
但你**可以**把爆炸半径压到极限：

| 项 | 必须设成 | 为什么 |
|---|---|---|
| token 类型 | **Fine-grained PAT**（不是 classic） | classic 的 `repo` scope 覆盖你名下**全部**仓库 |
| Repository access | **只勾 `jingjiangze/Stronghold-Protocol-Forge-Mods`** | 其余 41 个仓（含 12 个 private）全部隔离 |
| Permissions | `Contents: **Read and write**` + `Pull requests: **Read and write**` | 开 PR 需要写 contents（建分支）+ 写 PR |
| **不要给** | `Administration`、`Actions`、`Secrets`、`Workflows` | 给了就能改分支保护/改 CI/读 secrets，整条闸门作废 |
| Expiration | **30 天或更短** | 到期自动失效，是最有效的兜底 |

**这把 token 泄露后，攻击者能做什么 / 不能做什么：**

| 能 | 不能 |
|---|---|
| 往本仓推分支、开 PR | 碰其他任何仓库 |
| 改本仓 `.github/workflows/*`（⇒ 可能绕过闸门） | 改分支保护、删仓库、加 collaborator |
| 反复触发本仓 Actions | 读其他仓、读 secrets 的**值** |

> ⚠ 即便收敛到单仓，`Contents: write` 仍包含「改 workflow」的能力 ——
> 所以**方案乙的 token 绝不能放进浏览器**（静态站无服务端可拦），只能放在服务端或让作者自己保管。

### 结论

**给作者用的，走方案甲（不发 token）。**
**方案乙只用在「你自己或维护者的服务端代提 PR」**（`site/publish-to-pr.mjs`，见 `PUBLISH-PR.md`）。

---

## 四、作者该怎么操作（这就是上传页要写的）

### 小包（≤25 MiB）

1. 打开 `https://github.com/jingjiangze/Stronghold-Protocol-Forge-Mods`
2. 点 **Fork**（创建到你自己的账号下）
3. 进你 fork 里的 `incoming/` → **Add file ▾ → Create new file**
4. 文件名填 `incoming/<mod名>/SOURCE.md`（打斜杠自动建目录），照模板写五件事
5. 回到 `incoming/<mod名>/` → **Add file ▾ → Upload files** → 拖入 `mod.zip`
6. **Commit changes** → GitHub 会引导你 **Create pull request** 回原仓库
7. 等 `mod-gate` 变绿（约 1–2 分钟）
8. **等维护者审核** —— 在此之前 GitHub 会显示 "Review required"，合不了

### 大包（25–100 MiB）

同上，只是第 5 步改用 git：

```sh
git clone https://github.com/<你的账号>/Stronghold-Protocol-Forge-Mods.git
cd Stronghold-Protocol-Forge-Mods
mkdir -p incoming/<mod名>
cp /path/to/mod.zip incoming/<mod名>/
# 写 incoming/<mod名>/SOURCE.md（五件事）
git add incoming/<mod名>
git commit -m "上传 <mod名>"
git push          # 推到你自己的 fork
```

然后在 GitHub 上开 PR 回 `jingjiangze/Stronghold-Protocol-Forge-Mods:master`。

---

## 五、你审核时该看什么

`mod-gate` 绿只证明「形状对、没损坏」，**不等于可以合并**。审核时至少确认：

| 项 | 判据 |
|---|---|
| 署名 | `SOURCE.md` 的原作者 ≠ 提交者，且是原作者的名字 |
| 许可 | 原件许可写明，且没禁止再分发 |
| 改动说明 | 具体到文件/数值，不是「优化了一些东西」 |
| 素材 | 夹带官方素材必须标注（未标注才拦） |
| id 冲突 | `pack.json` 的 `id` 不与已入库存量撞（引擎不允许同 id 并存） |
| 类型 | 是**能装的真功能包**，不是说明文档 |

审完点 **Approve**，再点 **Merge（squash）**。

---

## 六、已知限制与后续可优化点

| 限制 | 现状 | 可优化方向 |
|---|---|---|
| `mod-gate` 的 check 名声明在 `mod-gate.yml` 里，PR 可改这个文件来绕过闸门 | **存在**（见下方「闸门自指」） | 给 `.github/workflows/**` 加 CODEOWNERS + `require_code_owner_review`；或把闸门逻辑搬进一个 pr 无权改的 reusable workflow |
| 作者不懂 `incoming/` 目录约定 | 靠 SOURCE.md 模板与上传页文案 | 上传页已写清（`/upload`） |
| 25 MiB 网页上限 | GitHub 硬限，无法绕 | 大包走 git push（作者自己的 fork，不需要 token） |
| CI 的 mods.json PR 需要你合并 | 因 `enforce_admins=false`，你可直接合并 | 若要全自动，需第二个人/第二个账号做审批，或给 CI 换成 App 身份 |
| 说明包 `documentation` | 入库闸门与站点都已排除 | — |

### 闸门自指（既有缺陷，值得修）

`required_status_checks = [mod-gate]`，而 `mod-gate` 这个 check 名**声明在 `mod-gate.yml` 里**；
`pull_request` 事件跑的是 **merge 结果里的 workflow 文件** ⇒ 只改 `mod-gate.yml` 的 PR
可以让这个 check 改名 / 消失 / 永远 exit 0，从而自解除闸门。

**最小缓解**：把 `.github/workflows/**` 纳入 CODEOWNERS，并开 `require_code_owner_reviews=true`。
这样连改 workflow 也必须你批。
