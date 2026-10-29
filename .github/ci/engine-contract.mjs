#!/usr/bin/env node
// .github/ci/engine-contract.mjs —— PR 阶段就把「引擎会不会拒这个包」测出来。
//
//   node .github/ci/engine-contract.mjs --repo <本仓检出> --engine <引擎检出>
//        [--engine2 <第二引擎，只对照>] [--fail-on <相对路径> ...] [--strict]
//
// 语义（重要）：**只对「本次改动」拦，历史遗留只报**。
//   · 给了 --fail-on ⇒ 只有列出的路径（及同目录下的包）判硬失败，其余打「历史遗留，只报」
//   · 没给 --fail-on 且没给 --strict ⇒ 全量体检，问题都只报
//   · 给了 --strict ⇒ 全量体检，任何问题都判失败（手动体检用）
// 理由：一个永远红的门等于没门。本仓存在历史遗留问题（字段不规范、旧包缺字段），
// 新 PR 不该替它们背锅，但新引入的问题必须当场拦住。
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
//   · 索引 ↔ 站点数据：`mods/index.json`（去掉 documentation 类）与 `modsite/mods.json`
//     的 (id, version) 集合必须相等

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// ── 参数 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? true) : fallback;
};
const listOf = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return [];
  const out = [];
  for (let k = i + 1; k < argv.length; k += 1) {
    if (argv[k].startsWith('--')) break;
    out.push(argv[k]);
  }
  return out;
};
const repoRoot = path.resolve(String(argOf('--repo', '.')));
const engineRoot = argOf('--engine');
const engine2Root = argOf('--engine2');
const failOn = listOf('--fail-on').map((p) => p.replace(/\\/g, '/'));
const strict = argv.includes('--strict');
const scoped = failOn.length > 0;
const isMine = (rel) => {
  if (strict) return true;
  if (!scoped) return false;
  const r = rel.replace(/\\/g, '/');
  if (failOn.includes(r)) return true;
  // 同目录下任何文件改动，都算这个包被本次 PR 动过
  return failOn.some((f) => f.startsWith(r.replace(/\/mod\.zip$/, '/')));
};

const hard = [];
const soft = [];
const note = (s) => console.log(s);
const bad = (s) => { hard.push(s); console.log(`  ✖ ${s}`); };
const warn = (s) => { soft.push(s); console.log(`  ! ${s}`); };
// 按作用域决定「拦」还是「只报」
const issue = (rel, msg) => (isMine(rel) ? bad(msg) : warn(`${msg}（历史遗留，只报）`));

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
note(`索引条目 ${entries.length} 条（generatedAt ${index.generatedAt ?? '无'}）`);
if (scoped) note(`作用域：只对 ${failOn.length} 个本次改动的路径判硬失败，其余只报`);

// ── 1) 索引 ↔ 目录 ──────────────────────────────────────────────────────
note('\n[1/3] 索引 ↔ 目录');
const seen = new Set();
for (const e of entries) {
  const id = e.id;
  const ver = e.version;
  const rel = (e.path || `mods/${id}/${ver}/mod.zip`).replace(/\\/g, '/');
  const abs = path.join(repoRoot, rel);
  seen.add(`${id}@${ver}`);
  if (!fs.existsSync(abs)) {
    issue(rel, `${id}@${ver}：索引指向的 ${rel} 不存在`);
    continue;
  }
  const buf = fs.readFileSync(abs);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (e.sha256 && e.sha256 !== sha) issue(rel, `${id}@${ver}：sha256 与字节不符（索引 ${e.sha256.slice(0, 12)}… / 实际 ${sha.slice(0, 12)}…）`);
  if (Number.isInteger(e.sizeBytes) && e.sizeBytes !== buf.length) issue(rel, `${id}@${ver}：sizeBytes ${e.sizeBytes} ≠ 实际 ${buf.length}`);
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
for (const o of orphans) {
  const [id, ver] = o.split('@');
  issue(`mods/${id}/${ver}/mod.zip`, `${o}：盘上有 mod.zip 但索引里没有条目 —— 站上永远看不到它（跑 promote-incoming 或 build-index）`);
}
note(`  盘上 ${onDisk.length} 个包 / 索引 ${seen.size} 条 / 孤儿 ${orphans.length}`);

// ── 2) 索引 ↔ 站点数据 ──────────────────────────────────────────────────
note('\n[2/3] 索引 ↔ modsite/mods.json');
const sitePath = path.join(repoRoot, 'modsite', 'mods.json');
if (!fs.existsSync(sitePath)) {
  warn('modsite/mods.json 不存在 —— 跳过（首次生成前是正常的）');
} else {
  const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  const siteSet = new Set((site.mods || []).map((m) => `${m.id}@${m.version}`));
  // 站点按设计过滤掉 documentation 类（见 build-mods-json.yml），比对时必须同样排除
  const listed = entries.filter((m) => (m.category || 'unknown') !== 'documentation');
  const indexSet = new Set(listed.map((m) => `${m.id}@${m.version}`));
  const onlyIndex = [...indexSet].filter((k) => !siteSet.has(k));
  const onlySite = [...siteSet].filter((k) => !indexSet.has(k));
  const msgOf = (arr) => `${arr.slice(0, 8).join(', ')}${arr.length > 8 ? ` …（共 ${arr.length}）` : ''}`;
  // 站点数据陈旧就是 2026-10-29 那样的病（索引换了、mods.json 没重生成）⇒ 一律硬失败
  if (onlyIndex.length) bad(`索引里有、mods.json 里没有：${msgOf(onlyIndex)} —— mods.json 是旧的，站点看不到这些包`);
  if (onlySite.length) bad(`mods.json 里有、索引里没有：${msgOf(onlySite)} —— mods.json 停在旧状态，站点会提供已经不存在的下载`);
  if (!onlyIndex.length && !onlySite.length) note(`  两侧一致：${siteSet.size} 条（已排除 ${entries.length - listed.length} 条 documentation）`);
  note(`  mods.json generatedAt=${site.generatedAt ?? '无'} / sig=${site.sig ? '有' : '无'} / keyId=${site.keyId ?? '无'}`);
  if (!site.sig) warn('modsite/mods.json 没有签名（客户端要求签名时会拒绝载入）');
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

// 两种清单走两套判据（审计查明的边界，别混用）：
//   · plugin.json（manifest 2）⇒ 引擎的 readPluginManifest：api 越界 / class 不认识判 problem
//     （清单直接 null），app 不覆盖判 warning（进房时才硬拒）—— 这两条正是要拦的。
//   · pack.json（工坊包）⇒ **不能**用 readPackManifest。那是给 packs/（manifest 1）用的，它要求
//     顶层有 type；而工坊包由引擎的 loadWorkshop 装载、本来就没有 type
//     ⇒ 用它判会把 73 个线上正常包全判成 problem（实测）。工坊包改用仓库自己那份静态契约
//     site/packcheck.mjs 的 checkPack（与 mod-compat.yml 同源）。
const checkWithEngine = (eng, zip, id) => {
  const mname = findManifest(zip, ['plugin.json', 'pack.json']);
  if (!mname) return { skip: true };
  let raw;
  try {
    raw = JSON.parse(readZipEntry(zip, mname));
  } catch (e) {
    return { problems: [`${mname} 不是合法 JSON：${e.message}`], warnings: [] };
  }
  if (mname.endsWith('plugin.json')) {
    const ctx = { id };
    if (eng.app) ctx.app = eng.app;
    if (eng.api) ctx.api = eng.api;
    const r = eng.M.readPluginManifest(raw, ctx);
    // 引擎的 problems / warnings 是字符串数组；带 code 的完整对象在 r.issues 里
    const codes = new Map((r.issues || []).map((i) => [i.text, i.code]));
    const tag = (t) => (codes.get(t) ? `${codes.get(t)}: ${t}` : t);
    return { problems: (r.problems || []).map(tag), warnings: (r.warnings || []).map(tag) };
  }
  if (!packcheck) return { skip: true };
  const r = packcheck.checkPack(raw);
  const fmt = (c) => `${c.code}: ${c.detail ?? c.message ?? ""}`;
  return {
    problems: (r.codes || []).filter((c) => c.level === 'blocker').map(fmt),
    warnings: (r.codes || []).filter((c) => c.level !== 'blocker').map(fmt),
  };
};

// 工坊包的静态契约：默认取「与本脚本同一检出」的 site/packcheck.mjs（PR 事件下这就是 base 那份）
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packcheckPath = String(argOf('--packcheck', path.join(scriptDir, '..', '..', 'site', 'packcheck.mjs')));
let packcheck = null;
try {
  packcheck = await import(pathToFileURL(packcheckPath).href);
  note(`  工坊包静态契约：${path.relative(process.cwd(), packcheckPath) || packcheckPath}`);
} catch (e) {
  warn(`没有可用的 site/packcheck.mjs（${e.message}）—— pack.json 这一段跳过`);
}

note('\n[3/3] 引擎侧清单契约（不执行插件代码）');
const engines = [await loadEngine(path.resolve(String(engineRoot)), path.basename(path.resolve(String(engineRoot))))];
if (engine2Root && fs.existsSync(path.join(String(engine2Root), 'shared', 'plugins'))) {
  engines.push(await loadEngine(path.resolve(String(engine2Root)), `${path.basename(path.resolve(String(engine2Root)))}（第二引擎，只对照）`));
}

const targets = onDisk.map((k) => {
  const [id, ver] = k.split('@');
  return `mods/${id}/${ver}/mod.zip`;
});

let checked = 0;
let newProblems = 0;
let legacyProblems = 0;
for (const rel of targets) {
  const zip = path.join(repoRoot, rel);
  if (!fs.existsSync(zip)) continue;
  const id = rel.split('/')[1];
  checked += 1;
  const first = checkWithEngine(engines[0], zip, id);
  if (first.skip) { issue(rel, `${rel}：zip 里既没有 plugin.json 也没有 pack.json（引擎会判 PLUGIN_INSTALL_ZIP）`); continue; }
  const probs = first.problems || [];
  if (probs.length) {
    if (isMine(rel)) {
      newProblems += 1;
      bad(`${rel}（${engines[0].label}）：${probs.length} 个 problem`);
      for (const p of probs) console.log(`      · ${p}`);
    } else {
      legacyProblems += 1;
      console.log(`    ! ${rel}：${probs.length} 个 problem（历史遗留，只报）`);
      for (const p of probs) console.log(`      · ${p}`);
    }
  }
  // app 范围不覆盖时不拦装载、但进房会硬拒 —— 所以 warning 也要打出来
  const ws = first.warnings || [];
  if (ws.length) {
    console.log(`    ${rel}：${ws.length} 个 warning`);
    for (const w of ws) console.log(`      · ${w}`);
  }
  for (const eng of engines.slice(1)) {
    const r = checkWithEngine(eng, zip, id);
    if (r.skip) continue;
    const n = (r.problems || []).length;
    if (n) console.log(`    [对照/${eng.label}] ${rel}：problems=${n} → ${(r.problems || []).slice(0, 2).join(' | ')}`);
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
note('\n──────── 汇总 ────────');
note(`扫描包 ${checked} 个 · 本次改动引入的 problem ${newProblems} 个 · 历史遗留 ${legacyProblems} 个`);
note(`硬失败 ${hard.length} 条 · 只报 ${soft.length} 条`);
if (hard.length) {
  for (const f of hard) console.log(`::error::${f}`);
  process.exit(1);
}
note('全部通过（历史遗留项已按「只报」列出，见上）');
