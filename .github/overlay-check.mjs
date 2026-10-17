#!/usr/bin/env node
// .github/overlay-check.mjs —— 叠加层的机器闸门（读 .github/overlay.json，人和 CI 都只信它）。
//
//   node .github/overlay-check.mjs --work <master树> --up <上游树>
//
// 三件事，退出码各不相同，别混：
//   1 = 挂载点/自有文件**丢了**，或 **noTouch** 那段与上游不一致（我方代码又挂进上游函数体内了）
//       —— 都是「我们的东西被同步弄没了 / 又寄错了地方」这类最危险的静默故障
//   2 = 上游**已实现**同名接口 ⇒ 触发退役流程（这是好事，不是坏在合并）
//   3 = 用法/清单错（清单读不到、目录不存在）⇒ 绝不报绿
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? (process.argv[i + 1] || d) : d; };
const work = arg('--work'), up = arg('--up');
if (!work || !up) { console.error('usage: node .github/overlay-check.mjs --work <dir> --up <dir>'); process.exit(3); }
const ovPath = path.join(work, '.github/overlay.json');
if (!fs.existsSync(ovPath) || !fs.existsSync(up)) { console.error('::error::清单或目录不存在，不判绿'); process.exit(3); }
const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
const read = (root, p) => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; } };

let lost = 0, retired = 0, stale = 0;
for (const f of ov.mine ?? []) {
  if (!fs.existsSync(path.join(work, f))) { console.log(`✗ 自有文件缺失：${f}`); lost++; }
}
for (const m of ov.mounts ?? []) {
  const w = read(work, m.file), u = read(up, m.file);
  if (w === null) { console.log(`✗ 挂载点宿主文件不存在：${m.file}`); lost++; continue; }
  const inMine = w.includes(m.anchor);
  const inUp = u !== null && u.includes(m.anchor);
  if (!inMine) { console.log(`✗ 挂载点丢了：${m.file} 里找不到 ${JSON.stringify(m.anchor)}（原因：${m.why}）`); lost++; continue; }
  if (inUp) { console.log(`⚑ 上游已实现同名东西：${m.file} 里也有 ${JSON.stringify(m.anchor)} ⇒ 按 retireWhen 退役我方那一份`); retired++; }
}
for (const t of ov.noTouch ?? []) {
  const w = read(work, t.file), u = read(up, t.file);
  if (w === null || u === null) { console.log(`✗ noTouch 宿主文件不存在：${t.file}`); lost++; continue; }
  const seg = (src) => {
    const a = src.indexOf(t.start);
    if (a < 0) return null;
    const b = src.indexOf(t.end, a);
    return b < 0 ? null : src.slice(a, b + t.end.length);
  };
  const ws = seg(w), us = seg(u);
  if (us === null) {
    console.log(`⚑ noTouch 的锚点在上游已找不到：${t.file} 里那段 ${JSON.stringify(t.start.slice(0, 24))}… ⇒ **清单过期**，请更新（合并照旧放行：我方代码不在他体内，撞不到）`);
    stale++;
    continue;
  }
  if (ws === null) { console.log(`✗ noTouch：${t.file} 里我方这段函数与上游对不上形状（被改写或删了）—— ${t.why}`); lost++; continue; }
  if (ws !== us) {
    console.log(`✗ noTouch 违背：${t.file} 里那一段与上游不一致（我方 ${ws.length} B vs 上游 ${us.length} B）⇒ 代码又挂回上游函数体内了（原因：${t.why}）`);
    lost++;
  }
}
for (const r of ov.reservedRoutes ?? []) {
  for (const f of ['site/server.mjs', 'site/pages/mods.html', 'site/pages/admin.html', 'site/pages/mine.html', 'site/README.md']) {
    const u = read(up, f);
    if (u && u.includes(r)) { console.log(`⚑ 上游用到了我方预留的名字 ${JSON.stringify(r)}（在 ${f}）⇒ 走退役流程，不与上游抢命名`); retired++; break; }
  }
}
const total = (ov.mounts?.length ?? 0) + (ov.mine?.length ?? 0) + (ov.noTouch?.length ?? 0);
console.log(`叠加层检查：条目 ${total} 项（挂载 ${ov.mounts?.length ?? 0} / 自有 ${ov.mine?.length ?? 0} / noTouch ${ov.noTouch?.length ?? 0}）| 丢失 ${lost} | 可退役 ${retired} | 清单待更新 ${stale}`);
if (lost) { console.error(`::error::${lost} 个挂载点/自有文件/noTouch 违背 —— 同步不放行`); process.exit(1); }
if (retired) { console.error(`::notice::${retired} 处上游已实现 → 该减叠加层了（合并本身是好的）`); process.exit(2); }
if (stale) console.log(`::warning::${stale} 条 noTouch 锚点在上游已找不到 = 清单过期（上游重构了他自己的函数）。合并不拦，但请更新 overlay.json 的那一段锚点。`);
console.log('✓ 叠加层完整，且上游还没有抢我们这些名字');
