#!/usr/bin/env node
// .github/ci/engine-load.mjs —— 线上已上架的包，**还能不能被当前引擎装上**。
//
// 为什么要它：`engine-contract.mjs` 只做**静态**判据（清单字段 / api / app / class）。
// 它证明不了「引擎真的能装载」——那要跑引擎自己的 `loadWorkshop`。上游有 `pack-compat.yml`
// 干这件事，但那份脚本依赖 `tools/workshop-validate.mjs` 与 `shared/workshopValidate.mjs`，
// 本仓没有这条依赖链，**不能整份拷过来**。所以这里只做最小等价物：直接调引擎的装载器。
//
//   node .github/ci/engine-load.mjs --repo . --engine <引擎检出> [--only <id>@<ver> ...]
//   node .github/ci/engine-load.mjs --repo . --engine <引擎检出> --list     # 只枚举，不装载
//
// 判据（与 `tools/build-index.mjs` 的四道闸门同源，直接抄它的写法，不另立一套）：
//   `errors.length === 0 && packsLoaded.length === 1 && packsLoaded[0] === packId`
//
// 跳过：
//   · `plugin.json` 插件包 —— 那不是 workshop 包（装载走 `code.*` / 插件注册表），
//     拿 `loadWorkshop` 判它必然报「没有 pack.json」，属**误报**，直接标 skip。
//   · 索引里 path 不存在的条目 —— 那是索引坏了，由 `engine-contract.mjs` 判，不在这里重复报。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const argOf = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? d) : d; };
const listOf = (n) => {
  const i = argv.indexOf(n); if (i < 0) return [];
  const out = [];
  for (let k = i + 1; k < argv.length; k += 1) { if (argv[k].startsWith('--')) break; out.push(argv[k]); }
  return out;
};

const repoRoot = path.resolve(String(argOf('--repo', '.')));
const engineRoot = argOf('--engine');
const only = listOf('--only');
const listOnly = argv.includes('--list');
if (!engineRoot) { console.error('::error::--engine <引擎检出> 必填'); process.exit(2); }

const idxPath = path.join(repoRoot, 'mods', 'index.json');
if (!fs.existsSync(idxPath)) { console.error(`::error::找不到 ${idxPath}`); process.exit(2); }
const index = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
let entries = (index.mods || []).map((m) => ({
  id: m.id, version: m.version, rel: (m.path || `mods/${m.id}/${m.version}/mod.zip`).replace(/\\/g, '/'),
}));
if (only.length) entries = entries.filter((e) => only.includes(`${e.id}@${e.version}`));
console.log(`索引条目 ${index.mods.length} 条；本次待判 ${entries.length} 条`);

// 清单类型：plugin.json 的包不走 workshop 装载
const manifestKind = (zip) => {
  let names;
  try { names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n'); }
  catch { return 'unreadable'; }
  const has = (f) => names.some((n) => n === f || n.endsWith(`/${f}`));
  if (has('plugin.json')) return 'plugin';
  if (has('pack.json')) return 'pack';
  return 'none';
};

if (listOnly) {
  const tally = { pack: 0, plugin: 0, none: 0, unreadable: 0, missing: 0 };
  for (const e of entries) {
    const zip = path.join(repoRoot, e.rel);
    if (!fs.existsSync(zip)) { tally.missing += 1; console.log(`  missing  ${e.rel}`); continue; }
    const k = manifestKind(zip); tally[k] += 1;
    console.log(`  ${k.padEnd(10)} ${e.rel}`);
  }
  console.log('统计', tally);
  process.exit(0);
}

const engineWorkshop = await import(pathToFileURL(path.join(String(engineRoot), 'server/workshop.js')).href);
if (typeof engineWorkshop.loadWorkshop !== 'function') {
  console.error('::error::引擎检出里没有 loadWorkshop（server/workshop.js）—— 这条门失去判据，不报绿');
  process.exit(2);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-load-'));
const bad = [];
const skipped = [];
let ok = 0;

for (const e of entries) {
  const zip = path.join(repoRoot, e.rel);
  if (!fs.existsSync(zip)) { skipped.push({ ...e, why: 'zip 不存在（索引坏了，engine-contract 判）' }); continue; }
  const kind = manifestKind(zip);
  if (kind === 'plugin') { skipped.push({ ...e, why: 'plugin.json 插件包，不属于 workshop 装载面' }); continue; }
  if (kind !== 'pack') { bad.push({ ...e, why: `zip 里没有 pack.json（${kind}）` }); continue; }

  // 与 build-index.mjs 同一个做法：解到一个干净根，目录名 = packId（装载器按 <根>/<包 id>/pack.json 找包）
  const root = path.join(tmpRoot, `${e.id}-${e.version}`);
  const packDir = path.join(root, e.id);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(packDir, { recursive: true });
  try {
    execFileSync('unzip', ['-q', '-o', zip, '-d', packDir], { stdio: 'pipe' });
  } catch (err) {
    bad.push({ ...e, why: `解压失败：${String(err.message).slice(0, 120)}` });
    continue;
  }
  // 套了一层 <id>/ 目录的：剥壳（与 build-index 的 prefix 处理等价）
  const inner = path.join(packDir, e.id);
  if (!fs.existsSync(path.join(packDir, 'pack.json')) && fs.existsSync(path.join(inner, 'pack.json'))) {
    for (const n of fs.readdirSync(inner)) fs.renameSync(path.join(inner, n), path.join(packDir, n));
    fs.rmSync(inner, { recursive: true, force: true });
  }

  let loaded;
  try {
    loaded = engineWorkshop.loadWorkshop(root, { log: () => {} });
  } catch (err) {
    bad.push({ ...e, why: `装载抛错：${String(err.message).slice(0, 160)}` });
    continue;
  }
  const ids = (loaded.packs ?? []).map((p) => p.id);
  const errs = (loaded.errors ?? []).map((x) => `${x.pack}: ${x.reason}`);
  if (errs.length === 0 && ids.length === 1 && ids[0] === e.id) {
    ok += 1;
    console.log(`  ✓ ${e.id}@${e.version}  packsLoaded=[${ids}] errors=0`);
  } else {
    bad.push({ ...e, why: `packsLoaded=[${ids}] errors=${errs.length} ${errs.join(' | ')}` });
    console.log(`  ✗ ${e.id}@${e.version}  packsLoaded=[${ids}] errors=${errs.length} ${errs.join(' | ')}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('\n──────── 汇总 ────────');
console.log(`装载通过 ${ok} · 失败 ${bad.length} · 跳过 ${skipped.length}`);
for (const s of skipped) console.log(`  - 跳过 ${s.id}@${s.version}：${s.why}`);
if (bad.length) {
  for (const b of bad) console.log(`::error::${b.id}@${b.version}：${b.why}`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(1);
}
fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log('线上包全部还能被当前引擎装上');
