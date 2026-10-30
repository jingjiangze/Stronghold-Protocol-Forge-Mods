// mod 反馈的自测（2026-10-13 新增）。
//
//   node site/selftest-feedback.mjs
//
// 与既有四个自测同一套写法：零依赖、只用 node 内置、自带一个 store 模式的极小 zip 写入器、
// 起一个**真正的新实例**（自己的端口 + 自己的临时数据目录），全程走 HTTP。
//
// 它专门盯业主那四条需求各自的**反面**：
//   ①  任何人都能提交（无账号）：正路 201；待审 / 不存在的 mod **不收**，
//      而且「不存在」与「没上线」回**同一个 404、同一句话**（不泄露待审队列里有没有这条）
//   ②  单看 / 合并看：`?mod=` 单条、`?mod=a,b` 合并、`?group=` 折叠同一个 pack id 的两条记录、
//      `?all=1&cursor&limit` 翻页；一个读法都不给 ⇒ 400 点名
//   ③  agent 面：字段闭集（多一栏整条拒）、枚举错**不回落**、`dedupe` 幂等（同键不写第二笔）、
//      批量栏一律 400、写端点按 IP 限流
//   ④  文字 + 图片：PNG/JPEG/GIF/WEBP 收；**SVG 与 HTML 拒**（那是脚本面）；单张上限、条上限、
//      逐字节相同不重写；图片令牌缺失 / 不对 ⇒ 401；发图时**重嗅文件头**，被换成 SVG 的字节直接 404
//   ⑤  **只有维护者能读**：管理读口不带凭据 ⇒ 401；`/api/mods` 在贴完反馈后**逐字节不变**；
//      `/api/status`（回执令牌那一读）里搜不到反馈正文；公开面不存在任何读反馈的路
//   ⑥  站点既有不变量不破：`DATA_DIR` 根下没有 `.part` 散文件；跑完文件数**只增不减**（零删除）；
//      那条记录的 `decision.json` 与 `meta.json` 一个字节都没被反馈动过
//   ⑦b S1（2026-10-14 把叠加层从上游 `renderPage` 里搬出来）换到的三条口径：
//      样式表链接与上游那一份逐字相同、审核台「反馈」那一格推导出的地址命中真路由、
//      `server.mjs` 里不再出现 `__FB_MOD__` / `__ADMIN_PAGE__` 的填充
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 8811;   // 不与另四个自测的端口撞（8799 / 8807 / 8809）
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'selftest-feedback-token-01234567';

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------- 极小 zip 写入器（store）
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(0, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
/** 干净包：`pack.json` 在根，两条记录**共用同一个 pack id**（折叠分组用的就是它）。 */
const packZip = () => makeZip([{
  name: 'pack.json',
  data: JSON.stringify({ id: 'fb-fold-test', name: '折叠测试包', author: 'selftest', version: '1.0.0', api: '>=1 <2', game: '0.2.x' }),
}]);

// ---------------------------------------------------------------- 图片字节（合成，只为文件头）
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('ihdr-fake-payload-for-selftest-0123456789', 'utf8')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-fake-payload-for-selftest-0123456789', 'utf8')]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.from('gif-fake-payload-for-selftest-0123456789', 'utf8')]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBP', 'ascii'), Buffer.from('vp8-fake-payload-for-selftest', 'utf8')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');

// ---------------------------------------------------------------- 起服务
const dataDir = mkdtempSync(join(tmpdir(), 'sp-fbsite-'));
const child = spawn(process.execPath, [join(HERE, 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: TOKEN, MAX_MB: '8' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (d) => { serverLog += d; });
child.stderr.on('data', (d) => { serverLog += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitUp = async () => {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return true; } catch { /* 等 */ }
    await sleep(120);
  }
  return false;
};
const admin = (p, opt = {}) => fetch(`${BASE}${p}`, { ...opt, headers: { 'x-admin-token': TOKEN, ...(opt.headers || {}) } });
const adminJson = async (p) => (await admin(p)).json();
const submitPack = async () => {
  const r = await fetch(`${BASE}/api/submit?${new URLSearchParams({ name: '折叠测试包', note: '自测：同一 pack id 的记录' })}`, {
    method: 'POST', headers: { 'content-type': 'application/zip', 'x-filename': 'fb.zip' }, body: packZip(),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const approve = async (id) => admin('/api/admin/decide', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id, decision: 'approved', reason: '自测放行' }),
});
const fbPost = async (mod, obj, dedupe = '') => {
  const q = new URLSearchParams({ mod });
  if (dedupe) q.set('dedupe', dedupe);
  const r = await fetch(`${BASE}/api/feedback?${q}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: typeof obj === 'string' ? obj : JSON.stringify(obj),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const imgPost = async (mod, fb, token, buf) => {
  const r = await fetch(`${BASE}/api/feedback/image?mod=${encodeURIComponent(mod)}&fb=${encodeURIComponent(fb)}`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-feedback-token': token }, body: buf,
  });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const countFiles = (root = dataDir) => {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name)); else n++;
    }
  };
  walk(root);
  return n;
};

const boot = await waitUp();
console.log(`反馈面自测 · 实例 ${BASE}`);
if (!boot) {
  console.log('✖ 服务起不来：\n' + serverLog);
  process.exit(1);
}

try {
  // 两条记录共用一个 pack id（A、B），第三条**没上线**（C）
  const A = (await submitPack()).body;
  const B = (await submitPack()).body;
  const C = (await submitPack()).body;
  check(A && B && C && A.id && B.id && C.id, '三条投稿都收下', `${A?.id} / ${B?.id} / ${C?.id}`);
  check((await approve(A.id)).status === 200 && (await approve(B.id)).status === 200, 'A、B 已通过并公开');
  // ⭐ 基线：在**写任何反馈之前**抓一份公开列表。后面要求它逐字节不变。
  const listBefore = await (await fetch(`${BASE}/api/mods`)).text();
  const filesBefore = countFiles();

  // ================================================================ ① 谁能被反馈
  console.log('① 提交门（公开可写，但只对**在架**的 mod 开）');
  const toPending = await fbPost(C.id, { text: '给还没上线的那条提反馈' });
  const toUnknown = await fbPost('zzzzzzzzzzzz', { text: '给不存在的编号提反馈' });
  check(toPending.status === 404 && toUnknown.status === 404, '待审的与不存在的 ⇒ 都是 404');
  check(toPending.body?.error === toUnknown.body?.error && toPending.body?.error === '没有这个地址',
    '两者**同一句话**、且与站点全局 404 逐字相同（不泄露待审队列）', JSON.stringify(toPending.body?.error));
  const badShape = await fbPost('BAD-ID', { text: 'x' });
  check(badShape.status === 400, 'mod 形状不对 ⇒ 400（不当成「不存在」）', badShape.body?.error);
  const okFirst = await fbPost(A.id, { text: '引擎 0.16.0 装载报 errors=0，但面板在 screen.game.hud 上不出现' });
  check(okFirst.status === 201 && okFirst.body?.changed === true, '在架的 mod ⇒ 201，正文收下了', okFirst.body?.feedbackId);
  const fbId = okFirst.body?.feedbackId;
  const imgToken = okFirst.body?.imageToken;
  check(!!imgToken && /^[0-9a-f]{32}$/.test(String(imgToken)), '响应给了一枚图片令牌（明文只出现这一次，盘上只有哈希）');

  // ================================================================ ③ agent 面：闭集 / 枚举 / 幂等 / 批量
  console.log('③ 报文的形状（agent 最容易写歪的一段）');
  const extraField = await fbPost(A.id, { text: '多写一栏', foo: 'bar' });
  check(extraField.status === 400 && extraField.body?.code === 'FB_UNKNOWN_FIELD', '未知字段 ⇒ **整条拒**并点名是哪一栏', extraField.body?.error);
  check((await fbPost(A.id, { text: '   ' })).body?.code === 'FB_EMPTY_TEXT', '空正文 ⇒ 400');
  const longText = await fbPost(A.id, { text: '长'.repeat(2001) });
  check(longText.status === 400 && longText.body?.code === 'FB_TEXT_TOO_LONG', '正文 2001 字 ⇒ 400（上限 2000）');
  const badKind = await fbPost(A.id, { text: 'x', kind: 'BUG' });
  check(badKind.status === 400 && badKind.body?.code === 'FB_BAD_KIND', 'kind 拼错 ⇒ 400，**不回落成 other**');
  const badSev = await fbPost(A.id, { text: 'x', severity: 'fatal' });
  check(badSev.status === 400 && badSev.body?.code === 'FB_BAD_SEVERITY', 'severity 不在闭集 ⇒ 400');
  check((await fbPost(A.id, 'text=plain')).status === 400, '不是 JSON ⇒ 400');
  const batchQ = await fetch(`${BASE}/api/feedback?mod=${A.id}&ids=a,b`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '批量栏' }),
  });
  check(batchQ.status === 400, '出现批量栏 `ids` ⇒ 400（§8.1：写侧一次只认一个 mod）');
  check((await fbPost(A.id, { text: '幂等键形状不对' }, 'bad key!')).status === 400, 'dedupe 形状不对 ⇒ 400');
  const DEDUPE = 'agent-run-0001';
  const d1 = await fbPost(A.id, { text: '同一条内容，agent 重试' }, DEDUPE);
  const d2 = await fbPost(A.id, { text: '同一条内容，agent 重试' }, DEDUPE);
  check(d1.status === 201 && d1.body?.changed === true, '第一次带 dedupe ⇒ 201 写了一笔');
  check(d2.status === 200 && d2.body?.changed === false && d2.body?.feedbackId === d1.body?.feedbackId,
    '第二次同键 ⇒ 200 `changed:false`，**没有写第二笔**', d2.body?.note);

  // ================================================================ ④ 图片
  console.log('④ 图片（只收栅格图；令牌定归属；发的时候重嗅）');
  check((await imgPost(A.id, fbId, '', PNG)).status === 401, '不带图片令牌 ⇒ 401（否则谁都能往别人那条上塞图）');
  check((await imgPost(A.id, fbId, 'deadbeefdeadbeefdeadbeefdeadbeef', PNG)).status === 401, '令牌不对 ⇒ 401（同一句话，不说「差几个字符」）');
  check((await imgPost(A.id, 'aaaaaaaaaaaa', imgToken, PNG)).status === 404, '反馈编号不存在 ⇒ 404 同一句');
  const i1 = await imgPost(A.id, fbId, imgToken, PNG);
  check(i1.status === 201 && i1.body?.image?.mediaType === 'image/png' && i1.body?.image?.n === 1, 'PNG ⇒ 第 1 张', JSON.stringify(i1.body?.image));
  const i2 = await imgPost(A.id, fbId, imgToken, JPG);
  check(i2.status === 201 && i2.body?.image?.mediaType === 'image/jpeg', 'JPEG ⇒ 第 2 张');
  const i3 = await imgPost(A.id, fbId, imgToken, GIF);
  check(i3.status === 201 && i3.body?.image?.mediaType === 'image/gif', 'GIF ⇒ 第 3 张');
  const i4 = await imgPost(A.id, fbId, imgToken, WEBP);
  check(i4.status === 201 && i4.body?.image?.mediaType === 'image/webp', 'WEBP ⇒ 第 4 张（贴满）');
  const i5 = await imgPost(A.id, fbId, imgToken, PNG);
  check(i5.status === 400, '第 5 张 ⇒ 400「已经贴满了」', i5.body?.error);
  const fbB = await fbPost(B.id, { text: '这一条专门用来试幂等与文件头' });
  const fbBId = fbB.body?.feedbackId;
  const dupA = await imgPost(B.id, fbBId, fbB.body?.imageToken, PNG);
  const dupB = await imgPost(B.id, fbBId, fbB.body?.imageToken, PNG);
  check(dupA.status === 201 && dupB.status === 200 && dupB.body?.changed === false,
    '逐字节相同的图重复贴 ⇒ 200 `changed:false`，不写第二份', dupB.body?.note);
  check(dupB.body?.image?.n === dupA.body?.image?.n, '重复贴返回的还是那一张（n 不变）');
  const svgReal = await imgPost(B.id, fbBId, fbB.body?.imageToken, SVG);
  check(svgReal.status === 400 && svgReal.body?.code === 'FB_NOT_AN_IMAGE', 'SVG ⇒ 400 **不收**（站点没有 CSP，那是脚本面不是图片面）', svgReal.body?.error);
  const htmlBytes = await imgPost(B.id, fbBId, fbB.body?.imageToken, Buffer.from('<!doctype html><script>1</script>', 'utf8'));
  check(htmlBytes.status === 400, 'HTML 字节 ⇒ 400（同一判据：认不出文件头）');
  const zipBytes = await imgPost(B.id, fbBId, fbB.body?.imageToken, packZip());
  check(zipBytes.status === 400, 'zip 字节 ⇒ 400（不当图收，也不解压）');
  const huge = await imgPost(B.id, fbBId, fbB.body?.imageToken, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
  check(huge.status === 413, '超过 2 MB ⇒ 413（先报 413，不是掐连接）', huge.body?.error);

  // ================================================================ ② 单看 / 合并看 / 折叠 / 翻页
  console.log('② 读侧：单条 · 合并 · 折叠同一个 pack id · 翻页');
  const noCred = await fetch(`${BASE}/api/admin/feedback?mod=${A.id}`);
  check(noCred.status === 401, '管理读口**不带凭据 ⇒ 401**（「仅维护者可见」就是这一道门）', String(noCred.status));
  const noHow = await admin('/api/admin/feedback');
  check(noHow.status === 400, '一个读法都不给 ⇒ 400，并把三种读法说清楚', (await noHow.json())?.error);
  const one = await adminJson(`/api/admin/feedback?mod=${A.id}`);
  check(one.ok && one.items.length >= 2, '?mod=<一条> ⇒ 只回这一条记录的反馈', `items=${one.items?.length}`);
  check(one.items.every((x) => x.mod === A.id), '单查不会把别的记录混进来');
  check(one.items.some((x) => x.text?.includes('装载报')), '正文原样读得出来（管理口内）', String(one.items[0]?.text).slice(0, 20));
  check(one.items.some((x) => x.images.length === 4), '图片清单带元数据与**管理口内的** url');
  check(one.items.every((x) => x.images.every((i) => String(i.url).startsWith('/api/admin/feedback/file'))),
    '图片 url 一律挂在管理口下（不给任何公开路径）');
  const merged = await adminJson(`/api/admin/feedback?mod=${A.id},${B.id}`);
  check(new Set(merged.items.map((x) => x.mod)).size === 2, '?mod=a,b ⇒ **合并**两条记录', `items=${merged.items.length}`);
  check(merged.counts.records === 2 && merged.counts.withImages >= 2, 'counts 与屏幕上同一批口径', JSON.stringify(merged.counts));
  const tooMany = await admin(`/api/admin/feedback?mod=${new Array(21).fill(A.id).join(',')}`);
  check(tooMany.status === 400, '一次点 21 个 mod ⇒ 400（合并有上限，要全量请用 all=1）');
  const grp = await adminJson(`/api/admin/feedback?group=${A.id}`);
  const gids = (grp.mods || []).map((m) => m.id);
  check(grp.ok && gids.includes(A.id) && gids.includes(B.id),
    '?group= ⇒ 把同一个 pack id 的两条记录**折成一组**（否则同一款 mod 的反馈被劈成两半）', gids.join(' + '));
  check(Object.keys(grp.groups || {}).length === 1 && /fb-fold-test/.test(Object.keys(grp.groups)[0]),
    '组名用的是包内 pack id（`pack:<id>`）', Object.keys(grp.groups || {})[0]);
  check(gids.length >= 3 && grp.mods.some((m) => m.state !== 'approved'),
    '折叠组把同 pack id 的**待审那条也一并列出**（`state` 栏如实标出，不藏）', grp.mods.map((m) => `${m.id}:${m.state}`).join(' '));
  const allv = await adminJson('/api/admin/feedback?all=1&limit=2&cursor=0');
  check(allv.items.length === 2 && typeof allv.cursor === 'string', '?all=1 翻页给出 cursor（agent 做汇总用）', `cursor=${allv.cursor}`);
  const all2 = await adminJson(`/api/admin/feedback?all=1&limit=2&cursor=${allv.cursor}`);
  check(all2.items[0]?.id !== allv.items[0]?.id, '下一页不是同一批');
  const ghost = await adminJson('/api/admin/feedback?mod=zzzzzzzzzzzz');
  check(ghost.mods?.[0]?.exists === false && ghost.counts.missing?.[0] === 'zzzzzzzzzzzz',
    '管理口里「不存在」如实点名（公开面那条同句 404 是另一回事）', JSON.stringify(ghost.counts.missing));

  // ================================================================ ⑤ 隐私边界
  console.log('⑤ 只有维护者能读 —— 公开面一个字节都不许变');
  const listNow = await (await fetch(`${BASE}/api/mods`)).text();
  check(listBefore === listNow, '`/api/mods` 在写完反馈后**逐字节相同**（反馈不进 meta.json ⇒ 结构上不可能漏）', `${listNow.length} B`);
  check((await fetch(`${BASE}/api/feedback?mod=${A.id}`)).status === 404, '公开面**没有**读反馈的路（GET /api/feedback ⇒ 404）');
  check((await fetch(`${BASE}/api/feedback/file?mod=${A.id}&fb=${fbId}&n=1`)).status === 404, '图片也没有公开口（404 而非 401 —— 不提示「这里有个东西」）');
  const stText = await (await fetch(`${BASE}/api/status/${A.id}?t=${A.receipt}`)).text();
  check(!stText.includes('装载报') && !stText.includes(String(fbId)), '回执令牌那一读里搜不到反馈正文与编号', `${stText.length} B`);
  const mineList = await adminJson('/api/admin/list');
  check(mineList.submissions.every((s) => !JSON.stringify(s).includes('装载报')),
    '审核台 `/list` 本身也不带反馈正文（读反馈要专门那一条路）');
  const page = await (await fetch(`${BASE}/mods`)).text();
  check(page.includes('提交反馈'), '公开列表给了「提交反馈」的入口（写的一侧要摸得到）');
  const fbPage = await (await fetch(`${BASE}/feedback?mod=${A.id}`)).text();
  check(fbPage.includes(A.id) && !fbPage.includes('__FB_MOD__'), '反馈页把编号带上，且占位符已替换');
  const fbXss = await (await fetch(`${BASE}/feedback?mod=%3Cscript%3Ealert(1)%3C%2Fscript%3E`)).text();
  check(!fbXss.includes('<script>alert(1)</script>'), '`?mod=` 上塞 HTML ⇒ 被 ID_RE 挡在门外，不进 HTML');

  console.log('⑤b 管理口取图片字节');
  const got = await admin(`/api/admin/feedback/file?mod=${A.id}&fb=${fbId}&n=1`);
  const gotBuf = Buffer.from(await got.arrayBuffer());
  check(got.status === 200 && got.headers.get('content-type') === 'image/png', 'content-type 来自**重嗅文件头**（不读扩展名、不读客户端报的）', got.headers.get('content-type'));
  check(got.headers.get('x-content-type-options') === 'nosniff', '带 `x-content-type-options: nosniff`');
  check(sha(gotBuf) === sha(PNG), '发出来的字节与贴进去的逐字节相同（不转码、不缩放）');
  check((await admin(`/api/admin/feedback/file?mod=${A.id}&fb=${fbId}&n=9`)).status === 400, 'n 越界 ⇒ 400');
  const pngPath = join(dataDir, 'submissions', A.id, 'feedback', `${fbId}-1.png`);
  check(existsSync(pngPath), '图片落在**被反馈那条记录的目录里**（DATA_DIR 根没有新增区）');
  const swap = readFileSync(pngPath);
  try {
    writeFileSync(pngPath, SVG);
    const served = await admin(`/api/admin/feedback/file?mod=${A.id}&fb=${fbId}&n=1`);
    check(served.status === 404, '盘上的字节被换成 SVG ⇒ 404，**一个字节都不发**');
  } finally {
    writeFileSync(pngPath, swap);                     // 换回去：自测不改数据形态
  }

  // ================================================================ ⑦ 处理状态 + 审核侧页面
  console.log('⑦ 处理状态（一次一条 · 幂等 · 只动那一栏）与审核侧那一页');
  const fbFile = join(dataDir, 'submissions', A.id, 'feedback', `${fbId}.json`);
  const before = readJson(fbFile);
  const metaSnapBefore = readFileSync(join(dataDir, 'submissions', A.id, 'meta.json'), 'utf8');
  check(!('state' in before), '刚提交的反馈里**没有** state 栏 ⇒ 读成 new（不回填、不猜）');
  const oneNew = await adminJson(`/api/admin/feedback?mod=${A.id}`);
  check(oneNew.mods?.[0]?.feedbackNew >= 1, '「没看过」的条数在 mods 那一栏给得出来', JSON.stringify(oneNew.mods?.[0]?.feedbackNew));
  const setRead = await admin('/api/admin/fb-state', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: A.id, fb: fbId, state: 'read', reason: '已复现' }),
  });
  const setReadJ = await setRead.json();
  check(setRead.status === 200 && setReadJ.changed === true && setReadJ.from === 'new' && setReadJ.state === 'read',
    '标成 read ⇒ changed:true、from:new', JSON.stringify(setReadJ).slice(0, 60));
  const again = await admin('/api/admin/fb-state', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: A.id, fb: fbId, state: 'read' }),
  });
  const againJ = await again.json();
  check(again.status === 200 && againJ.changed === false, '同一目标值重复标 ⇒ changed:false（幂等，不写第二笔）', againJ.note);
  check(readJson(fbFile)?.stateHistory?.length === 1, '流水里只有一笔（幂等那次没留痕）', String(readJson(fbFile)?.stateHistory?.length));
  check(readJson(fbFile)?.text === before.text && (readJson(fbFile)?.images || []).length === (before.images || []).length,
    '只动状态那一栏：正文与图片清单逐字未变');
  const batchState = await admin('/api/admin/fb-state', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [A.id], state: 'done' }),
  });
  check(batchState.status === 400, '报文里出现 `ids` ⇒ 400（§8.1：一次只认一条）');
  check((await admin('/api/admin/fb-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: A.id, fb: fbId, state: 'DONE' }) })).status === 400,
    'state 不在闭集 ⇒ 400（不忽略、不小写化后放过）');
  check((await admin('/api/admin/fb-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: A.id, fb: 'aaaaaaaaaaaa', state: 'done' }) })).status === 404,
    '不存在的反馈 ⇒ 404');
  const otherMod = await admin('/api/admin/fb-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: B.id, fb: fbId, state: 'done' }) });
  check(otherMod.status === 404 && (await otherMod.json())?.error === '没有这条反馈',
    'fb 属于别的 mod ⇒ 同一句 404（不做存在性探针）');
  check((await admin('/api/admin/fb-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: A.id, fb: fbId, state: 'done', reason: '长'.repeat(201) }) })).status === 400,
    '理由超过 200 字 ⇒ 400');
  const filtered = await adminJson(`/api/admin/feedback?mod=${A.id}&state=new`);
  check(filtered.items.every((x) => x.state === 'new') && filtered.counts.items < filtered.counts.matched,
    '?state=new 只给没看过的，counts 区分「筛前 matched / 筛后 items」', `${filtered.counts.items}/${filtered.counts.matched}`);
  check(Object.keys(filtered.counts.byState || {}).join() === 'new', 'byState 数的是筛过那一批', JSON.stringify(filtered.counts.byState));
  check((await admin('/api/admin/feedback?mod=' + A.id + '&state=nope')).status === 400, 'state 填错 ⇒ 400 点名，不悄悄忽略');

  const noCredView = await fetch(`${BASE}/admin/feedback-view`);
  check(noCredView.status === 401, '审核侧那一页不带凭据 ⇒ 401（与审核台同一道门，浏览器据此弹登录框）');
  const viewHtml = await (await admin('/admin/feedback-view')).text();
  check(viewHtml.includes("const API = '/api/admin'"), '页面里的 __ADMIN_API__ 换成了当前前缀');
  check(!viewHtml.includes('__ADMIN_API__') && !viewHtml.includes('__ADMIN_PAGE__') && !viewHtml.includes('__CSS__'),
    '三个占位符一个都不许残留（API 前缀、审核台链接、样式表）');
  const apiPathView = await admin('/api/admin/feedback-view');
  check(apiPathView.status === 404, '把 `-view` 挂到 API 前缀上 ⇒ 404（页面只有一条路，不开第二道门）');
  const navHtml = await (await fetch(`${BASE}/admin`, { headers: { 'x-admin-token': TOKEN } })).text();
  check(navHtml.includes('id="vFeedback"'), '审核台导航里多了「反馈」那一格');
  check(!navHtml.includes('__ADMIN_PAGE__'), '审核台页面里没有未替换的页面前缀占位符（那格的地址改由脚本推）');
  check(navHtml.includes("$('vFeedback').href = API.replace"), '那一格的 href 确实由脚本挂上（不是留一个死链）');
  // 地址是**推导**出来的，所以判据也按同一条推导走一遍并真去访问：公式写错就红，不靠肉眼比对字符串。
  const apiInNav = (navHtml.match(/const API = '([^']*)'/) || [])[1] || '';
  const fbHref = apiInNav.replace(/^\/api(?=\/)/, '') + '/feedback-view';
  const fbHrefOk = fbHref === '/admin/feedback-view'
    && (await fetch(`${BASE}${fbHref}`, { headers: { 'x-admin-token': TOKEN } })).status === 200;
  check(fbHrefOk, '按页面里的推导算出的地址就是那条真路由', fbHref);
  check(navHtml.includes('?view=main') && navHtml.includes('?view=approved') && navHtml.includes('?view=rejected'),
    '三个视图那三条真实地址一个字没动（反馈不是第四个视图）');
  check((await fetch(`${BASE}/api/feedback-view`)).status === 404, '把 `-view` 挂到公开前缀上 ⇒ 404（不给出第二条路）');

  console.log('⑦b S1 的三条口径（渲染解耦后）');
  const serverSrc = readFileSync(join(HERE, 'server.mjs'), 'utf8');
  const cssUpstream = (serverSrc.match(/\.split\('__CSS__'\)\.join\('([^']*)'\)/) || [])[1] || '';
  const cssFeedback = (serverSrc.match(/const FEEDBACK_THEME_CSS = '([^']*)'/) || [])[1] || '';
  check(cssFeedback !== '' && cssFeedback === cssUpstream,
    '反馈页的样式表链接与上游 `renderPage` 注入的那一份**逐字相同**（版本串漂移就红）', `${cssFeedback} vs ${cssUpstream}`);
  check(fbPage.includes(`href="${cssFeedback}"`) && viewHtml.includes(`href="${cssFeedback}"`),
    '两页都真的带上了这份链接（不是只有常量对得上）');
  check(!/\.split\('__FB_MOD__'\)/.test(serverSrc) && !/\.split\('__ADMIN_PAGE__'\)/.test(serverSrc),
    '`server.mjs` 里已没有这两个槽的填充 ⇒ 上游 `renderPage` 体内不留我方代码（填充住在 feedback.mjs）');
  const metaAfter = readFileSync(join(dataDir, 'submissions', A.id, 'meta.json'), 'utf8');
  check(metaAfter === metaSnapBefore, '标状态后 `meta.json` 逐字节不变（公开面读取源照旧干净）');

  // ================================================================ ⑥ 限流与既有不变量
  console.log('⑥ 写侧限流（复用发布者那一档 60/10min/IP）与站点不变量');
  let saw429 = 0;
  for (let i = 1; i <= 60; i++) {
    const r = await fbPost(A.id, { text: `限流压测第 ${i} 次` });
    if (r.status === 429) { saw429 = i; break; }
  }
  check(saw429 > 0, `连续写到第 ${saw429 || '>60'} 次触发 429（agent 批量需要单独配额 —— 见 docs/FEEDBACK-API.md 那条注记）`);
  const rootEntries = readdirSync(dataDir);
  // 根下允许的就只有上游那几个既有目录：`tombstones/` 是 2026-10-14 上游「硬删（档 3）」的墓碑目录，
  // 与反馈无关。**这条断言钉的是「反馈这一层没有新开区、也没有 .part 散文件」**。
  check(rootEntries.every((n) => ['submissions', 'flagged', 'compat', 'tombstones', 'audit.jsonl'].includes(n)),
    '`DATA_DIR` 根下只有那三个区 + 上游的 tombstones + audit.jsonl，**没有 .part 散文件**', rootEntries.join(' / '));
  check(countFiles() >= filesBefore, '跑完文件数只增不减（零删除：反馈没有任何删除口）', `${filesBefore} → ${countFiles()}`);
  check(readJson(join(dataDir, 'submissions', A.id, 'decision.json'))?.decision === 'approved', '反馈**没有**改动那条记录的决定');
  const metaRaw = readFileSync(join(dataDir, 'submissions', A.id, 'meta.json'), 'utf8');
  check(!metaRaw.includes('装载报') && !metaRaw.includes('imageTokens'), '反馈**没写进 `meta.json`**（公开面的读取源里没有它）');
  const auditLines = readFileSync(join(dataDir, 'audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const fbActions = auditLines.filter((l) => String(l.action).startsWith('feedback'));
  check(fbActions.length >= 2 && fbActions.every((l) => l.actor === 'public'),
    '审计日志有 feedbackSubmit / feedbackImage 两笔，actor 都是 public', `${fbActions.length} 笔`);
  check(!readFileSync(join(dataDir, 'audit.jsonl'), 'utf8').includes(imgToken), '审计日志里**没有**图片令牌明文（零凭据）');

  console.log(failures ? `\n✖ 有 ${failures} 条断言没过` : '\n✔ 反馈的提交 / 单看与合并 / agent 形状 / 图文 / 仅维护者可读，整条链通过');
  process.exitCode = failures ? 1 : 0;
} catch (e) {
  console.error('✖ 自测自己炸了：', e);
  process.exitCode = 1;
} finally {
  child.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
