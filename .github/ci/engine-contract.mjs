#!/usr/bin/env node
// .github/ci/engine-contract.mjs —— PR 阶段就把「引擎会不会拒这个包」测出来。
//
//   node .github/ci/engine-contract.mjs --repo <本仓检出> --engine <引擎检出> [--engine2 <第二份引擎>]
//                                       [--only mods/<id>/<version>/mod.zip ...]
//
// 为什么需要它：`mod-gate` 的 J1/J3/J4/J5 只做静态四项（类型 / CRC / 体积 / 索引存在性）。
// 一个**能过闸门但引擎会拒**的包今天要等合并之后的 `auto-promote` 四道闸门才会红 —— 那时 PR
// 已经合进去了。典型形态（都有实测依据）：
//   · `api` 越界       ⇒ 引擎判 problem，清单直接 null（插件根本不出现在列表里）
//   · `class` 不认识   ⇒ 同上
//   · `app` 不覆盖     ⇒ 装载只 warning，但进房时 roomSets 判 PLUGIN_INCOMPATIBLE 硬拒
// 本脚本调**引擎自己那份** manifest 解析器（`shared/plugins/manifest.js`），不在这里重写规则
// （AGENTS.md §3「不抄规则」）。只读：**不执行任何插件代码**，只把清单 JSON 解析一遍。
//
// 顺带做两件 mod-gate 没做的事：
//   · 索引 ↔ 目录：`mods/index.json` 每条目的 path 存在、sha256 与字节一致、sizeBytes 一致；
//     反过来 `mods/**/mod.zip` 有没有条目（孤儿包 = 传了但站上永远看不到）
//   · 索引 ↔ 站点数据：`mods/index.json` 与 `modsite/mods.json` 的 (id, version) 集合必须相等
//     （不等 = 有人手改了其中一份，或者索引推送那一步被漏掉了）

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// ── 参数 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? true) : fallback;
};
const repoRoot = path.resolve(String(argOf('--repo', '.')));
const engineRoot = argOf('--engine');
const engine2Root = argOf('--engine2');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? argv.slice(onlyIdx + 1).filter((x) => !x.startsWith('--')) : null;

const fail = [];
const warn = [];
const note = (s) => console.log(s);
const bad = (s) => { fail.push(s); console.log(`  ✖ ${s}`); };
const soft = (s) => { warn.push(s); console.log(`  ! ${s}`); };

if (!engineRoot) {
  console.error('::error::--engine <引擎检出> 必填');
  process.exit(2);
}

// ── 读索引 ──────────────────────────────────────────────────────────────
const indexPath = path.join(repoRoot, 'mods', 'index.json');
if (!fs.existsSync(indexPath)) {
  console.error(`::error::找不到 ${indexPath}`);
  process.exit(2);
}
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const entries = Array.isArray(index.mods) ? index.mods : [];
note(`索引条目 ${entries.length} 条（${index.generatedAt ?? '无 generatedAt'}）`);

// ── 1) 索引 ↔ 目录 ──────────────────────────────────────────────────────
note('\n[1/3] 索引 ↔ 目录');
const seen = new Set();
for (const e of entries) {
  const id = e.id;
  const ver = e.version;
  const rel = e.path || `mods/${id}/${ver}/mod.zip`;
  const abs = path.join(repoRoot, rel);
  seen.add(`${id}@${ver}`);
  if (!fs.existsSync(abs)) {
    bad(`${id}@${ver}：索引指向的 ${rel} 不存在`);
    continue;
  }
  const buf = fs.readFileSync(abs);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (e.sha256 && e.sha256 !== sha) bad(`${id}@${ver}：sha256 与字节不符（索引 ${e.sha256.slice(0, 12)}… / 实际 ${sha.slice(0, 12)}…）`);
  if (Number.isInteger(e.sizeBytes) && e.sizeBytes !== buf.length) bad(`${id}@${ver}：sizeBytes ${e.sizeBytes} ≠ 实际 ${buf.length}`);
}

const onDisk = [];
const modsRoot = path.join(repoRoot, 'mods');
if (fs.existsSync(modsRoot)) {
  for (const d of fs.readdirSync(modsRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const vroot = path.join(modsRoot, d.name);
    for (const v of fs.readdirSync(vroot, { withFileTypes: true })) {
      if (!v.isDirectory()) continue;
      if (fs.existsSync(path.join(vroot, v.name, 'mod.zip'))) onDisk.push(`${d.name}@${v.name}`);
    }
  }
}
const orphans = onDisk.filter((k) => !seen.has(k));
for (const o of orphans) bad(`${o}：盘上有 mod.zip 但索引里没有条目 —— 站上永远看不到它（跑一次 tools/build-index.mjs 或 promote-incoming）`);
note(`  盘上 ${onDisk.length} 个包 / 索引 ${seen.size} 条 / 孤儿 ${orphans.length}`);

// ── 2) 索引 ↔ 站点数据 ──────────────────────────────────────────────────
note('\n[2/3] 索引 ↔ modsite/mods.json');
const sitePath = path.join(repoRoot, 'modsite', 'mods.json');
if (!fs.existsSync(sitePath)) {
  soft('modsite/mods.json 不存在 —— 跳过（首次生成前是正常的）');
} else {
  const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  const siteSet = new Set((site.mods || []).map((m) => `${m.id}@${m.version}`));
  const onlyIndex = [...seen].filter((k) => !siteSet.has(k));
  const onlySite = [...siteSet].filter((k) => !seen.has(k));
  if (onlyIndex.length) bad(`索引里有、mods.json 里没有：${onlyIndex.slice(0, 8).join(', ')}${onlyIndex.length > 8 ? ` …（共 ${onlyIndex.length}）` : ''} —— mods.json 是旧的，站点看不到这些包`);
  if (onlySite.length) bad(`mods.json 里有、索引里没有：${onlySite.slice(0, 8).join(', ')}${onlySite.length > 8 ? ` …（共 ${onlySite.length}）` : ''} —— mods.json 停在旧版本，站点会提供已经不存在的下载`);
  if (!onlyIndex.length && !onlySite.length) note(`  两侧一致：${siteSet.size} 条`);
  note(`  mods.json generatedAt=${site.generatedAt ?? '无'} / sig=${site.sig ? '有' : '无'} / keyId=${site.keyId ?? '无'}`);
  if (!site.sig) soft('modsite/mods.json 没有签名（客户端要求签名时会拒绝载入）');
}

// ── 3) 引擎侧清单契约 ───────────────────────────────────────────────────
const loadEngine = async (root, label) => {
  const C = await import(pathToFileURL(path.join(root, 'shared', 'constants.js')).href);
  const M = await import(pathToFileURL(path.join(root, 'shared', 'plugins', 'manifest.js')).href);
  // 两条产品线的版本口径不同：一条用 PLUGIN_APP_VERSION（= 游戏本体版本），另一条只有 APP_VERSION。
  // 不在这里硬编码任何一个 —— 引擎说什么就是什么。
  const app = C.PLUGIN_APP_VERSION ?? C.APP_VERSION;
  const api = C.PLUGIN_API;
  note(`  ${label}：app=${app} api=${api ? `${api.min}–${api.current}` : '?'}`);
  return { M, app, api, label };
};

const listZip = (zip) => execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
const readZipEntry = (zip, name) => execFileSync('unzip', ['-p', zip, name], { encoding: 'utf8', maxBuffer: 32 << 20 });

// 清单可以在根，也可以在唯一顶层目录里（与引擎 sniffArchive 的口径一致）
const findManifest = (zip, names) => {
  const list = listZip(zip);
  for (const n of names) if (list.includes(n)) return n;
  const tops = new Set(list.map((p) => p.split('/')[0]));
  if (tops.size === 1) {
    const [top] = [...tops];
    for (const n of names) if (list.includes(`${top}/${n}`)) return `${top}/${n}`;
  }
  return null;
};

const checkWithEngine = (eng, zip, id, mode) => {
  const mname = findManifest(zip, ['plugin.json', 'pack.json']);
  if (!mname) return { skip: true };
  let raw;
  try {
    raw = JSON.parse(readZipEntry(zip, mname));
  } catch (e) {
    return { problems: [`${mname} 不是合法 JSON：${e.message}`], warnings: [] };
  }
  const ctx = { id };
  if (eng.app) ctx.app = eng.app;
  if (eng.api) ctx.api = eng.api;
  const r = mname.endsWith('plugin.json') ? eng.M.readPluginManifest(raw, ctx) : eng.M.readPackManifest(raw, ctx);
  // 引擎的 problems / warnings 是**字符串数组**（issueList 里 push 的就是 text）；带 code 的完整对象在 r.issues 里。
  const codes = new Map((r.issues || []).map((i) => [i.text, i.code]));
  const tag = (t) => (codes.get(t) ? `${codes.get(t)}: ${t}` : t);
  return { problems: (r.problems || []).map(tag), warnings: (r.warnings || []).map(tag), manifest: r.manifest };
};

note('\n[3/3] 引擎侧清单契约（不执行插件代码）');
const engines = [];
engines.push(await loadEngine(path.resolve(String(engineRoot)), path.basename(path.resolve(String(engineRoot)))));
if (engine2Root) engines.push(await loadEngine(path.resolve(String(engine2Root)), `${path.basename(path.resolve(String(engine2Root)))}（第二引擎，只报不拦）`));

const targets = only && only.length ? only : onDisk.map((k) => {
  const [id, ver] = k.split('@');
  return `mods/${id}/${ver}/mod.zip`;
});

let checked = 0;
let pkgProblems = 0;
for (const rel of targets) {
  const zip = path.join(repoRoot, rel);
  if (!fs.existsSync(zip)) { bad(`${rel}：不存在`); continue; }
  const parts = rel.split('/');
  const id = parts[1];
  checked += 1;
  const results = engines.map((eng) => ({ eng, r: checkWithEngine(eng, zip, id) }));
  const first = results[0];
  if (first.r.skip) { soft(`${rel}：zip 里既没有 plugin.json 也没有 pack.json（引擎会判 PLUGIN_INSTALL_ZIP）`); pkgProblems += 1; continue; }
  if (first.r.problems?.length) {
    pkgProblems += 1;
    bad(`${rel}（${first.eng.label}）：${first.r.problems.length} 个 problem`);
    for (const p of first.r.problems) console.log(`      · ${p}`);
  }
  const ws = first.r.warnings || [];
  if (ws.length) { console.log(`    ${rel}：${ws.length} 个 warning`); for (const w of ws) console.log(`      · ${w}`); }
  // 第二引擎只做对照，不参与判定
  for (const { eng, r } of results.slice(1)) {
    const n = (r.problems || []).length;
    console.log(`    [对照/${eng.label}] ${rel}：problems=${n}${n ? ` → ${r.problems.slice(0, 2).join(' | ')}` : ''}`);
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
note('\n──────── 汇总 ────────');
note(`扫描包 ${checked} 个 · 契约 problem ${pkgProblems} 个 · 硬失败 ${fail.length} 条 · 提示 ${warn.length} 条`);
for (const w of warn) console.log(`  ! ${w}`);
if (fail.length) {
  for (const f of fail) console.log(`::error::${f}`);
  process.exit(1);
}
note('全部通过');
