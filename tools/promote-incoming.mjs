#!/usr/bin/env node
// tools/promote-incoming.mjs — incoming/ 合并后的自动上架：一条命令走完「四道闸门 → mods/ 晋升 → index 收敛 → 站点数据」。
//
//   node tools/promote-incoming.mjs --incoming <dir> --engine <引擎检出>                    # 演练（只报，不写盘）
//   node tools/promote-incoming.mjs --incoming <dir> --engine <引擎检出> --write            # 真写
//   node tools/promote-incoming.mjs --all --engine <引擎检出> --write                       # 扫全部 incoming/*
// 可选：--pr <PR 号> --actor <登录名> --mods-root <目录>（演练用，默认 <仓库>/mods）
//
// 链路（与站侧 collect-station → build-index 等价，输入换成 incoming/ 的合并产物）：
//   1. 读 incoming/<名>/mod.zip → sha256 → stationId = auto<sha8>
//   2. 合成 staging（manifest.json + mods/<stationId>/{mod.zip,meta.json,decision.json}）——
//      PROVENANCE 的 ②③④⑤⑥ 源字段取自包内 pack.json 与 PR 元数据，缺的写 null（build-index 会写「未声明」，不编）
//   3. 调 build-index.mjs（引擎那一份装载器）在 **mods/ 的临时副本** 上跑四道闸门并写盘
//   4. 从临时副本取新条目 + 四件套，外科手术式并进真 mods/index.json（同 id 旧版本条目替换、其余一字不动）
//      —— 不整份重算 index：46 条既有条目的 PROVENANCE 是站侧事实，整份重算会把它们洗成「未声明」
//   5. 重生成 modsite/mods.json（与 build-mods-json.yml 同款逻辑），extras.json 不动（由那条工作流管）
//   6. 自检：每条有 id/download、无说明包；同 sha 已在 index 的包跳过（幂等）
//
// 闸门失败 ⇒ 非零退出 + 完整退件报告；**绝不带伤上架**。
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, statSync, cpSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? true) : fallback; };
const write = argv.includes('--write');
const all = argv.includes('--all');
const incomingArg = arg('--incoming');
const engineArg = arg('--engine', process.env.SP_ENGINE);
const prArg = arg('--pr');
const actorArg = arg('--actor', 'maintainer');
const modsRoot = resolve(String(arg('--mods-root', join(ROOT, 'mods'))));
const prLabel = prArg ? `PR #${prArg}` : '直接合并';

if (!engineArg) { console.error('缺少 --engine（引擎检出，用于装载闸门）'); process.exit(2); }
const engine = resolve(String(engineArg));
for (const need of ['server/workshop.js', 'shared/constants.js', 'shared/zip.js']) {
  if (!existsSync(join(engine, need))) { console.error(`这不是一个引擎检出（缺 ${need}）：${engine}`); process.exit(2); }
}
const incRoot = resolve(join(ROOT, 'incoming'));

// ── 候选：--incoming 指定一个，或 --all 扫全部 ──
function candidates() {
  if (all || !incomingArg) {
    if (!existsSync(incRoot)) return [];
    return readdirSync(incRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(incRoot, e.name))
      .filter((d) => existsSync(join(d, 'mod.zip')));
  }
  const d = resolve(String(incomingArg));
  if (!existsSync(join(d, 'mod.zip'))) { console.error(`✖ ${d} 里没有 mod.zip`); process.exit(2); }
  return [d];
}

// 已在 index 且同 sha 的包跳过（幂等：重跑不产生任何 diff）
function liveByIdSha() {
  const idxPath = join(modsRoot, 'index.json');
  const map = new Map();
  try {
    const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
    for (const m of idx.mods ?? []) map.set(`${m.id}@${m.sha256}`, m);
    return { map, index: idx };
  } catch { return { map, index: null }; }
}

const indexState = liveByIdSha();
const dirs = candidates();
if (!dirs.length) { console.log('没有候选（incoming/ 为空或没有 mod.zip）。'); process.exit(0); }

const promoted = [];
const skipped = [];
for (const dir of dirs) {
  const dirName = basename(dir);
  const zipPath = join(dir, 'mod.zip');
  const buf = readFileSync(zipPath);
  const sha = createHash('sha256').update(buf).digest('hex');
  // 粗判 id：先解 zip 找 pack.json（借 build-index 的闸门统一做，这里只为幂等跳过与命名）
  // —— 简化：stationId 由 sha 决定，packId 由闸门结果决定。
  const stationId = 'auto' + sha.slice(0, 8);
  if ([...indexState.map.keys()].some((k) => k.endsWith('@' + sha))) {
    skipped.push(`${dirName}（同 sha 已在 index：${sha.slice(0, 12)}…）`);
    continue;
  }

  // ── 合成 staging ──
  const stage = join(tmpdir(), `sp-promote-${process.pid}-${stationId}`);
  rmSync(stage, { recursive: true, force: true });
  const stMods = join(stage, 'mods', stationId);
  mkdirSync(stMods, { recursive: true });
  copyFileSync(zipPath, join(stMods, 'mod.zip'));

  // 解 zip 读 pack.json（与 build-index 相同的放宽上限；仅读不执行）
  const engineZip = await import(('file://' + join(engine, 'shared/zip.js')).replace(/\\/g, '/'));
  const read = engineZip.zipRead(buf, { maxEntries: 8192, maxTotalBytes: 512 * 1024 * 1024, maxFileBytes: 256 * 1024 * 1024 });
  if (!read?.ok) { console.error(`✖ ${dirName}: zip 读取失败 ${read?.error ?? ''}`); process.exit(1); }
  const norm = (n) => n.split('\\').join('/').replace(/^\.\//, '');
  let packEntry = read.entries.find((e) => norm(e.name) === 'pack.json');
  let prefix = '';
  if (!packEntry) {
    const dirs1 = new Set(read.entries.map((e) => norm(e.name)).filter((n) => n.includes('/')).map((n) => n.split('/')[0]));
    if (dirs1.size === 1) { prefix = [...dirs1][0] + '/'; packEntry = read.entries.find((e) => norm(e.name) === prefix + 'pack.json'); }
  }
  if (!packEntry) { console.error(`✖ ${dirName}: zip 根与唯一顶层目录里都没有 pack.json`); process.exit(1); }
  const packJson = JSON.parse(packEntry.data.toString('utf8'));
  const fileCount = read.entries.filter((e) => norm(e.name) && !norm(e.name).endsWith('/')).length;
  const unpackedBytes = read.entries.reduce((a, e) => a + (e.data?.length ?? 0), 0);

  const now = new Date().toISOString();
  const meta = {
    id: stationId,
    area: 'auto',
    name: packJson.name || packJson.id,
    note: `自动上架（${prLabel} 合并即审，来自 incoming/${dirName}）：zip ${fileCount} 文件 · ${buf.length} B · sha256 ${sha}。`,
    size: buf.length,
    sha256: sha,
    uploadedAt: now,
    entries: fileCount,
    unpackedBytes,
    packKind: (packJson.server || packJson.client || packJson.routes) ? 'functional' : null,
  };
  const decision = {
    decision: 'approved',
    reason: `维护者合并即审（${prLabel} 由 ${actorArg} 合并）；机器四闸门（sha256 / pack.json / category / 引擎装载）由 tools/build-index.mjs 实测，结论见 mods/index.json`,
    at: now,
    by: actorArg,
    displayName: packJson.name || packJson.id,
    acknowledgedSuspected: false,
  };
  writeFileSync(join(stMods, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
  writeFileSync(join(stMods, 'decision.json'), JSON.stringify(decision, null, 1) + '\n');

  const manifest = {
    generatedAt: now,
    source: {
      host: 'github-actions / 本地 promote-incoming', dataDir: null, readAt: now,
      selection: `incoming/${dirName}（${prLabel} 合并即审；tools/promote-incoming.mjs）`,
      excludedSamePackId: [],
    },
    mods: [{
      id: stationId,
      packId: packJson.id ?? null,
      name: packJson.name ?? null,
      sha256: sha,
      // PROVENANCE ②③④⑤⑥ 的源字段：取包内声明，缺的留 null（build-index 写「未声明」，不编）
      author: packJson.author ?? null,
      authorSource: 'pack.json',
      license: packJson.license ?? null,
      compatAuthor: null,
      compatOf: null,
      source: `incoming/${dirName}（${prLabel}，维护者合并即审）`,
      compatNote: null,
    }],
  };
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

  // ── 跑 build-index（临时 mods-root：闸门 + 写盘都在副本上，真 mods/ 不被半成品污染）──
  const tmpModsRoot = join(tmpdir(), `sp-promote-mods-${process.pid}-${stationId}`);
  rmSync(tmpModsRoot, { recursive: true, force: true });
  cpSync(modsRoot, tmpModsRoot, { recursive: true });
  const buildIndex = join(ROOT, 'tools', 'build-index.mjs');
  let child;
  try {
    const args = [buildIndex, '--stage', stage, '--engine', engine, '--mods-root', tmpModsRoot, '--write', '--json'];
    child = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1e8 });
  } catch (e) {
    // 退出码 1 = 有退件：把闸门结论原样带出来
    const out = e.stdout || '';
    let rejected = [];
    try { rejected = JSON.parse(out).rejected ?? []; } catch { /* 报告解析失败就打原文 */ }
    console.error(`✖ ${dirName}: 闸门未过（build-index 退出码 ${e.status}）`);
    for (const r of rejected) for (const g of r.gates?.filter((x) => !x.ok) ?? []) console.error(`   [${g.gate}] ${g.why}`);
    if (!rejected.length) console.error(out || e.message);
    rmSync(stage, { recursive: true, force: true });
    rmSync(tmpModsRoot, { recursive: true, force: true });
    process.exit(1);
  }
  const result = JSON.parse(child);
  const acc = (result.mods ?? []).find((m) => m.sha256 === sha);
  if (!acc) { console.error(`✖ ${dirName}: 闸门通过但索引里找不到本条（异常）`); process.exit(1); }
  const newEntry = acc;
  const newDir = join(tmpModsRoot, newEntry.id, newEntry.version ?? '0.0.0');
  if (!existsSync(join(newDir, 'mod.zip'))) { console.error(`✖ ${dirName}: 临时副本缺四件套（异常）`); process.exit(1); }

  promoted.push({ dirName, stationId, newEntry, newDir, stage, tmpModsRoot });
  console.log(`✓ ${dirName} → ${newEntry.id} v${newEntry.version}（${newEntry.category}，层 ${newEntry.engineLoad?.layer ?? '?'}，${buf.length} B）`);
}

if (!promoted.length) {
  console.log(skipped.length ? `全部跳过：\n  - ${skipped.join('\n  - ')}` : '没有可晋升的包。');
  process.exit(0);
}

// ── 外科手术式并进真 mods/（--write 才动）──────────────────────────────────
const splice = () => {
  const idxPath = join(modsRoot, 'index.json');
  const index = indexState.index ? JSON.parse(JSON.stringify(indexState.index)) : {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    source: { host: 'tools/promote-incoming', dataDir: null, readAt: null, manifestGeneratedAt: null, selection: 'tools/promote-incoming.mjs', excludedSamePackId: [] },
    engine: { path: engine }, note: '本索引是 mod 仓库的唯一真相；每条字段都实测。', mods: [], rejected: [],
    prune: { enabled: false, candidates: 0, live: 0, wouldDelete: [], deleted: [], held: [] },
  };
  for (const p of promoted) {
    // 同 id 的旧版本条目移除（新版本上位；旧版本目录不删——那要站侧状态佐证，人工 --prune-stale 才删）
    index.mods = (index.mods ?? []).filter((m) => m.id !== p.newEntry.id);
    index.mods.push(p.newEntry);
    index.mods.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const destDir = join(modsRoot, p.newEntry.id, p.newEntry.version ?? '0.0.0');
    mkdirSync(destDir, { recursive: true });
    cpSync(p.newDir, destDir, { recursive: true });
  }
  index.generatedAt = new Date().toISOString();
  writeFileSync(idxPath, JSON.stringify(index, null, 2) + '\n');

  // ── 站点数据：modsite/mods.json（与 build-mods-json.yml 同款逻辑）──
  const prov = (id, ver) => {
    try {
      const t = readFileSync(join(modsRoot, id, ver, 'PROVENANCE.md'), 'utf8');
      const cell = (label) => { const m = new RegExp('\\|\\s*' + label + '\\s*\\|\\s*([^|]+?)\\s*\\|').exec(t); return m ? m[1].trim() : ''; };
      const isCompat = /\|\s*④\s*兼容改写者\s*\|/.test(t) && !/④\s*兼容改写者\s*\|\s*\*\*未声明\*\*/.test(t);
      return { author: cell('② 原作者') || '', license: cell('③ 原件许可') || '', compatAuthor: cell('④ 兼容改写者') || '', isCompat, from: cell('⑤ 来源') || '' };
    } catch { return null; }
  };
  const addedAtOf = (rel) => {
    try {
      const t = execFileSync('git', ['log', '--diff-filter=A', '--format=%ct', '-1', '--', rel], { encoding: 'utf8', cwd: ROOT }).trim();
      return t ? Number(t) * 1000 : 0;
    } catch { return 0; }
  };
  const flat = (x) => Array.isArray(x) ? x.join('\n') : (x == null ? '' : String(x));
  const out = (index.mods ?? [])
    .filter((m) => (m.category || 'unknown') !== 'documentation')
    .map((m) => {
      const p = prov(m.id, m.version);
      return {
        id: m.id, name: m.name || m.id, version: m.version || '', category: m.category || 'unknown',
        note: flat(m.notes || m.note), author: p ? p.author : '', license: p ? p.license : '',
        compatAuthor: p ? p.compatAuthor : '', isCompat: p ? p.isCompat : false, from: p ? p.from : '',
        sizeBytes: m.sizeBytes || 0, fileCount: m.fileCount || 0, sha256: m.sha256 || '', packId: m.packId || '',
        addedAt: addedAtOf(m.path),
        download: m.path ? `https://raw.githubusercontent.com/jingjiangze/Stronghold-Protocol-Forge-Mods/master/${m.path}` : '',
      };
    }).filter((m) => m.id);
  const bad = [];
  for (const m of out) { if (!m.download) bad.push(`${m.id}: 无下载直链`); if (!m.sha256) bad.push(`${m.id}: 无 sha256`); }
  const docCount = out.filter((m) => m.category === 'documentation').length;
  if (docCount) bad.push(`${docCount} 条说明包混入`);
  if (bad.length) { console.error(`✖ mods.json 自检失败：${bad.join('；')}`); process.exit(1); }
  mkdirSync(join(ROOT, 'modsite'), { recursive: true });
  writeFileSync(join(ROOT, 'modsite', 'mods.json'), JSON.stringify({ generatedAt: new Date().toISOString(), mods: out }, null, 1) + '\n');
  console.log(`modsite/mods.json：${out.length} 条（自检通过）。`);
};

console.log('');
if (write) {
  splice();
  console.log(`已写：mods/（+${promoted.length} 包）· mods/index.json · modsite/mods.json`);
} else {
  console.log('（演练：未写盘 —— 加 --write 才真写。将晋升：');
  for (const p of promoted) console.log(`   ${p.dirName} → mods/${p.newEntry.id}/${p.newEntry.version ?? '0.0.0'}/`);
  console.log('）');
}
for (const s of skipped) console.log(`  跳过：${s}`);
