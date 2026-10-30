// publish-pr.mjs 的自测：用假 fetch 跑完整链，验证「发了哪些请求、顺序对不对、dryRun 真的不发请求」。
// 同时做反向对照：缺配置必须抛 CONFIG；GitHub 非 2xx 必须抛。
// 不联网、不写仓库 —— 这是纯逻辑测试。
import { readConfig, publishPr, provenanceMarkdown } from './publish-pr.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// ---- 1. readConfig
console.log('readConfig');
try { readConfig({}); ok('空 env 抛错', false); }
catch (e) { ok('空 env 抛 CONFIG', e.code === 'CONFIG', e.message); }
const cfg = readConfig({ SP_GITHUB_TOKEN: 't', SP_GITHUB_REPO: 'a/b' });
ok('正常 env 返回', cfg.repo === 'a/b' && cfg.base === 'master');
ok('默认 base=master', cfg.base === 'master');

// ---- 2. dryRun 不发任何请求
console.log('dryRun');
let calls = 0;
const noFetch = async () => { calls++; throw new Error('不该发请求'); };
const dry = await publishPr(cfg, {
  branch: 'b', title: 't', body: 'b',
  files: { 'x.txt': 'hello' }, dryRun: true, fetchImpl: noFetch,
});
ok('dryRun 返回 ok', dry.ok === true && dry.dryRun === true);
ok('dryRun 零请求', calls === 0, `calls=${calls}`);
ok('dryRun 列出文件', dry.files.includes('x.txt'));

// ---- 3. 完整链：记录请求序列
console.log('完整链');
const seen = [];
const fake = async (url, init) => {
  const path = url.replace('https://api.github.com', '');
  seen.push(`${init.method} ${path}`);
  const body = init.body ? JSON.parse(init.body) : {};
  const reply = (obj, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(obj),
  });
  if (path.endsWith('/git/ref/heads/master')) return reply({ object: { sha: 'p'.repeat(40) } });
  if (path.includes('/git/commits/')) return reply({ tree: { sha: 't'.repeat(40) } });
  if (path.endsWith('/git/blobs')) return reply({ sha: 'B'.repeat(40) }, 201);
  if (path.endsWith('/git/trees')) return reply({ sha: 'T'.repeat(40) }, 201);
  if (path.endsWith('/git/commits')) return reply({ sha: 'C'.repeat(40) }, 201);
  if (path.endsWith('/git/refs')) return reply({ ref: body.ref }, 201);
  if (path.endsWith('/pulls')) return reply({ number: 42, html_url: 'https://example/pr/42' }, 201);
  return reply({ error: 'unexpected' }, 404);
};
const res = await publishPr(cfg, {
  branch: 'publish/x', title: 't', body: 'b',
  files: { 'a/1.txt': 'x', 'b/2.txt': 'y' }, fetchImpl: fake,
});
ok('返回 pr 号', res.pr === 42, JSON.stringify(res));
ok('顺序：ref→commit→blob×2→tree→commit→refs→pulls',
  seen[0].includes('GET /repos/a/b/git/ref/heads/master') &&
  seen[1].includes('GET /repos/a/b/git/commits/') &&
  seen.filter((x) => x.includes('/git/blobs')).length === 2 &&
  seen.some((x) => x.includes('POST /repos/a/b/git/trees')) &&
  seen.some((x) => x.includes('POST /repos/a/b/git/commits')) &&
  seen.some((x) => x.includes('POST /repos/a/b/git/refs')) &&
  seen[seen.length - 1].includes('POST /repos/a/b/pulls'),
  seen.join(' | '));
ok('没合并、没直推 master', !seen.some((x) => /merge|PUT .*refs\/heads\/master/.test(x)), seen.join(' | '));

// ---- 4. GitHub 非 2xx 必须抛
console.log('失败路径');
const boom = async () => ({ ok: false, status: 422, text: async () => '{"message":"bad"}' });
try { await publishPr(cfg, { branch: 'b', title: 't', body: 'b', files: { x: 'y' }, fetchImpl: boom }); ok('非 2xx 抛错', false); }
catch (e) { ok('非 2xx 抛 GITHUB', e.code === 'GITHUB' && e.status === 422, e.message.slice(0, 60)); }

// ---- 5. 空 files 必须抛
try { await publishPr(cfg, { branch: 'b', title: 't', body: 'b', files: {}, dryRun: true }); ok('空 files 抛错', false); }
catch (e) { ok('空 files 抛错', /空/.test(e.message), e.message); }

// ---- 6. PROVENANCE 格式
console.log('PROVENANCE');
const md = provenanceMarkdown({ id: 'x', version: '1.0.0', name: 'X', author: 'Alice', license: 'GPL-3.0', stationId: 'abc' });
ok('含②原作者', md.includes('| ② 原作者 | Alice'));
ok('缺字段写未声明', provenanceMarkdown({ id: 'y', version: '1', name: 'Y' }).includes('**未声明**'));
ok('有表头', md.split('\n').some((l) => l.startsWith('| 项 | 值 |')));

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
