#!/usr/bin/env node
// site/publish-to-pr.mjs —— 命令行入口：把一条已上线记录推进 mod 仓库的 PR。
//
//   SP_GITHUB_TOKEN=github_pat_xxx \
//   node site/publish-to-pr.mjs --station-id 5a05ef99d82e [--dry-run]
//
// 它做什么：
//   1. 从站侧数据目录读 `data/<area>/<id>/meta.json` + `decision.json`（只读）
//   2. 只放行 `decision=approved` 的记录（**没过审的一律拒**）
//   3. 拼出 mods/<id>/<version>/{mod.zip,meta.json,PROVENANCE.md,decision.json}
//   4. 更新 mods/index.json（mod-gate 的 J5 要求索引与磁盘一致）
//   5. 调 publishPr 开 PR —— **不合并**
//
// 凭据只从 env 读，绝不打印。缺 token 时给清楚的说明，不静默降级。

import fs from 'node:fs';
import path from 'node:path';
import { readConfig, publishPr, provenanceMarkdown } from './publish-pr.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const has = (n) => process.argv.includes(n);

const stationId = arg('--station-id');
const dryRun = has('--dry-run');
const dataDir = path.resolve(arg('--data') || process.env.SP_DATA_DIR || '/var/lib/sp-modsite');

if (!stationId || !/^[a-z0-9]{6,32}$/.test(stationId)) {
  console.error('用法: node site/publish-to-pr.mjs --station-id <id> [--dry-run] [--data <dir>]');
  process.exit(2);
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

// 三个区都找一遍（与 server.mjs 的 dirOf 同口径）
let area = null, meta = null, decision = null;
for (const a of ['compat', 'flagged', 'normal']) {
  const d = path.join(dataDir, a === 'normal' ? 'submissions' : a, stationId);
  const m = readJson(path.join(d, 'meta.json'));
  if (m) { area = a; meta = m; decision = readJson(path.join(d, 'decision.json')); break; }
}
if (!meta) {
  console.error(`✖ 找不到记录 ${stationId}（在 ${dataDir} 下三个区都查过了）`);
  process.exit(1);
}
if (!decision || decision.decision !== 'approved') {
  console.error(`✖ ${stationId} 的状态是 ${decision ? decision.decision : '未决定'}，只有 approved 才能提 PR`);
  process.exit(1);
}

const id = String(meta.packId || meta.id || stationId).trim();
const version = String(meta.version || '').trim();
if (!id || !version) {
  console.error(`✖ 记录缺 pack id 或 version（id=${id} version=${version}）—— 不能提 PR`);
  process.exit(1);
}

// 包体：站侧存的是 blob
const blobCandidates = [
  path.join(dataDir, area === 'normal' ? 'submissions' : area, stationId, 'blob.zip'),
  path.join(dataDir, area === 'normal' ? 'submissions' : area, stationId, 'mod.zip'),
];
const zipPath = blobCandidates.find((p) => fs.existsSync(p));
if (!zipPath) {
  console.error(`✖ 找不到包体（试过 ${blobCandidates.join(' / ')}）`);
  process.exit(1);
}
const zip = fs.readFileSync(zipPath);

// mods/index.json：保留既有条目，替换/追加这一条
const idxPath = path.resolve(arg('--index') || 'mods/index.json');
let index = { mods: [] };
if (fs.existsSync(idxPath)) {
  const parsed = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  index = Array.isArray(parsed) ? { mods: parsed } : parsed;
}
const sha256 = await (async () => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(zip).digest('hex');
})();
const entry = {
  id, name: meta.name || id, version,
  sha256,
  packHash: meta.packHash || null,
  category: meta.packKind || 'functional',
  categoryWhy: meta.categoryWhy || '',
  stationId,
  path: `mods/${id}/${version}/mod.zip`,
  sizeBytes: zip.length,
  fileCount: meta.fileCount || 0,
  unpackedBytes: meta.unpackedBytes || 0,
  assets: meta.assets || null,
  notes: Array.isArray(meta.notes) ? meta.notes : (meta.note ? [meta.note] : []),
  engineLoad: meta.engineLoad || null,
};
const rest = (index.mods || []).filter((m) => !(m.id === id && m.version === version));
index.mods = [...rest, entry].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const base = `mods/${id}/${version}/`;
const files = {
  [`${base}mod.zip`]: zip,
  [`${base}meta.json`]: `${JSON.stringify(meta, null, 1)}\n`,
  [`${base}decision.json`]: `${JSON.stringify(decision, null, 1)}\n`,
  [`${base}PROVENANCE.md`]: provenanceMarkdown(
    { ...meta, id, version, stationId, author: meta.author, license: meta.license,
      compatAuthor: meta.compatAuthor, compatOf: meta.compatOf, compatNote: meta.compatNote },
    { note: meta.note || '' },
  ),
  'mods/index.json': `${JSON.stringify(index, null, 1)}\n`,
};

const title = `publish: ${id} v${version}（站上过审 · ${stationId}）`;
const body = [
  `站上记录 \`${stationId}\` 已过审，代提 PR 入库。`,
  '',
  '| 项 | 值 |',
  '|---|---|',
  `| 包 id | \`${id}\` |`,
  `| 版本 | ${version} |`,
  `| 大小 | ${(zip.length / 1048576).toFixed(1)} MiB |`,
  `| SHA256 | \`${sha256}\` |`,
  `| 原作者 | ${meta.author || '未声明'} |`,
  `| 兼容改写 | ${meta.compatAuthor || '—'} |`,
  '',
  '`mod-gate` 会在本 PR 上跑（类型 / CRC / 大小 / 索引一致性）。**合并由人确认**，本流程不自动合并。',
].join('\n');

if (dryRun) {
  console.log(`[dry-run] 会写入 ${Object.keys(files).length} 个文件：`);
  for (const p of Object.keys(files).sort()) console.log(`  ${p}  (${files[p].length} B)`);
  console.log(`[dry-run] 目标分支 publish/${stationId} → base master；PR 标题：${title}`);
  console.log('[dry-run] 不发任何请求。');
  process.exit(0);
}

let cfg;
try {
  cfg = readConfig();
} catch (e) {
  console.error(`✖ ${e.message}`);
  console.error('');
  console.error('怎么配（token 只放服务端 env，绝不进浏览器）：');
  console.error('  1) GitHub → Settings → Developer settings → Fine-grained tokens → 新建');
  console.error('     Repository access: 只选 jingjiangze/Stronghold-Protocol-Forge-Mods');
  console.error('     Permissions: Contents = Read and write, Pull requests = Read and write');
  console.error('     Expiration: 30 天（到期自动失效，是最有效的兜底）');
  console.error('  2) 写进服务端 env 文件（例如 /opt/sp-modsite/.env）：');
  console.error('     SP_GITHUB_TOKEN=github_pat_xxx');
  console.error('  3) systemctl restart <服务名>');
  process.exit(1);
}

const out = await publishPr(cfg, { branch: `publish/${stationId}`, title, body, files });
console.log(`✓ 已开 PR #${out.pr}  ${out.url}`);
console.log(`  分支 ${out.branch} → ${cfg.base}；等 mod-gate 变绿后由人合并。`);
