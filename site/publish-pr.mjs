// site/publish-pr.mjs —— 「过审 → 代提 PR」。
//
// 为什么单独一个模块，不写进 server.mjs：
//   ① server.mjs 已经 335 KB，再加一份 GitHub 客户端会让它更难审；
//   ② 这个模块的全部副作用都对外（往 GitHub 写），必须能被单独测、单独关掉；
//   ③ 它需要一份**凭据**，而凭据不该散落在主服务里。
//
// 凭据怎么放（唯一正确的形状，见 2026-10-20 安全审计）：
//   · 放在服务端 env，**绝不进浏览器**（静态站没有服务端可拦，token 一上线即公开）；
//   · 用 **fine-grained PAT，只对 `jingjiangze/Stronghold-Protocol-Forge-Mods` 一个仓**，
//     权限只给 `Contents: read+write` + `Pull requests: write`（**不给 Administration** ——
//     那会连带能改分支保护、删仓）；
//   · 设过期（30 天或更短），到期自动失效，是最有效的兜底；
//   · 轮换只需改 env + 重启，秒级 —— 这是它相对「内置进网页」的根本优势。
//
// 写盘内容与 PR 形状：
//   目标分支 `publish/<stationId>` 上写
//     mods/<id>/<version>/mod.zip
//     mods/<id>/<version>/meta.json
//     mods/<id>/<version>/PROVENANCE.md
//     mods/<id>/<version>/decision.json
//   并更新 mods/index.json（**必须**：mod-gate 的 J5 要求索引与磁盘一致）。
//   然后开 PR 到 master → mod-gate 在 PR 上跑 → 人合并。**这个模块不合并、不直推 master。**
//
// 不用 @octokit：只需要 3 个 REST 端点（取 ref、建 blob/tree/commit、开 PR），
// 用 fetch 就够，少一个依赖少一处供应链面。

const API = 'https://api.github.com';

/** 环境变量说明（缺一个就抛，绝不静默降级）。 */
export function readConfig(env = process.env) {
  const token = String(env.SP_GITHUB_TOKEN || '').trim();
  const repo = String(env.SP_GITHUB_REPO || 'jingjiangze/Stronghold-Protocol-Forge-Mods').trim();
  const base = String(env.SP_GITHUB_BASE || 'master').trim();
  const missing = [];
  if (!token) missing.push('SP_GITHUB_TOKEN');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) missing.push('SP_GITHUB_REPO（owner/repo 形状）');
  if (missing.length) {
    const e = new Error(`publish-pr：缺配置 ${missing.join(' / ')}`);
    e.code = 'CONFIG';
    throw e;
  }
  return { token, repo, base };
}

/** 一次 GitHub REST 调用。非 2xx 就抛，带状态码与响应体前 300 字。 */
async function gh(cfg, method, path, body, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'sp-modsite-publish',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`GitHub ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    e.code = 'GITHUB';
    e.status = res.status;
    throw e;
  }
  return text ? JSON.parse(text) : null;
}

/** 取 base 分支最新提交。 */
async function headOf(cfg, opts) {
  const ref = await gh(cfg, 'GET', `/repos/${cfg.repo}/git/ref/heads/${cfg.base}`, undefined, opts);
  return ref.object.sha;
}

/**
 * 把一棵文件树推到新分支并开 PR。
 * @param {{ token: string, repo: string, base: string }} cfg
 * @param {{ branch: string, title: string, body: string, files: Record<string, Buffer|string>,
 *           dryRun?: boolean, fetchImpl?: typeof fetch }} job
 * @returns {Promise<{ ok: boolean, branch?: string, pr?: number, url?: string, dryRun?: boolean }>}
 */
export async function publishPr(cfg, job) {
  const { branch, title, body, files, dryRun = false } = job;
  const opts = { fetchImpl: job.fetchImpl || fetch };

  // 先在本地把树拼出来（dryRun 时到这一步为止，一个请求都不发）
  const paths = Object.keys(files).sort();
  if (!paths.length) throw new Error('publishPr：files 是空的');

  if (dryRun) {
    return { ok: true, dryRun: true, branch, files: paths };
  }

  const parent = await headOf(cfg, opts);
  const parentCommit = await gh(cfg, 'GET', `/repos/${cfg.repo}/git/commits/${parent}`, undefined, opts);
  const baseTree = parentCommit.tree.sha;

  // 1) 逐个文件建 blob
  const blobs = [];
  for (const p of paths) {
    const content = files[p];
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const blob = await gh(cfg, 'POST', `/repos/${cfg.repo}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    }, opts);
    blobs.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 2) 建树（基于 base 树，只加/改这些文件）
  const tree = await gh(cfg, 'POST', `/repos/${cfg.repo}/git/trees`, { base_tree: baseTree, tree: blobs }, opts);

  // 3) 建提交 + 分支
  const commit = await gh(cfg, 'POST', `/repos/${cfg.repo}/git/commits`, {
    message: title, tree: tree.sha, parents: [parent],
  }, opts);
  await gh(cfg, 'POST', `/repos/${cfg.repo}/git/refs`, {
    ref: `refs/heads/${branch}`, sha: commit.sha,
  }, opts);

  // 4) 开 PR（**不合并**：合并永远是人的动作）
  const pr = await gh(cfg, 'POST', `/repos/${cfg.repo}/pulls`, {
    title, body, head: branch, base: cfg.base,
  }, opts);

  return { ok: true, branch, pr: pr.number, url: pr.html_url, commit: commit.sha };
}

/** 某个已上线记录在站侧的六个字段 → PROVENANCE.md 的表格（与 tools/build-index.mjs 同格式）。 */
export function provenanceMarkdown(rec, { note = '' } = {}) {
  const cell = (v) => (v && String(v).trim() ? String(v).trim() : '**未声明**');
  const lines = [
    `# PROVENANCE — ${rec.name || rec.id}`,
    '',
    '本文件由上传站的「过审 → 代提 PR」生成（事实来源：站点记录与包内 `pack.json`）。',
    '**没有的事实写「未声明」，不编造。**',
    '',
    '| 项 | 值 |',
    '|---|---|',
    `| ① 包 id / 版本 | \`${rec.id}\` · ${rec.version} |`,
    `| ② 原作者 | ${cell(rec.author)}${rec.authorSource ? `（来源：${rec.authorSource}）` : ''} |`,
    `| ③ 原件许可 | ${cell(rec.license)} |`,
    `| ④ 兼容改写者 | ${cell(rec.compatAuthor)} |`,
    `| ⑤ 来源 | 站上记录 \`${rec.stationId || rec.id}\`${rec.compatOf ? ` · 由原件 \`${rec.compatOf}\` 改写` : ''} |`,
    `| ⑥ 改了什么 | ${cell(rec.compatNote)} |`,
    '',
  ];
  if (note) lines.push('## 站侧备注', '', String(note).trim(), '');
  return lines.join('\n');
}
