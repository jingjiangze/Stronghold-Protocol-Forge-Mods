// site/packcheck 自测：纯函数，不起服务、不联网。
//
//   node site/selftest-packcheck.mjs
//
// 钉的是「站侧预检的判据与引擎一致、且只报不改」：
//   · 未知顶层键 / `api` 类型 / `content` 名单 / `combat` 未声明 —— 这四条是引擎装载期会点名拒的，
//     站侧必须**在上传时就看得见**（否则玩家下载后装不上，问题被推到人工）；
//   · 闭集本身的数量（36 键 / 14 个内容文件名）—— 有人顺手删一格，这里就红；
//   · 只读：跑一遍之后入参一个字节都不许变。
import { checkPack, blockersOf, PACK_FIELDS, CONTENT_FILES } from './packcheck.mjs';

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};
const codesOf = (r) => r.codes.map((c) => c.code);

console.log('packcheck 自测');

// ① 闭集本身（引擎 shared/workshop.js 的 PACK_FIELDS / WORKSHOP_CONTENT_FILES）
check(PACK_FIELDS.length === 36, '顶层键闭集是 36 键（与引擎 PACK_FIELDS 一致）', String(PACK_FIELDS.length));
check(CONTENT_FILES.length === 14, '内容文件名闭集是 14 个（与引擎 WORKSHOP_CONTENT_FILES 一致）', String(CONTENT_FILES.length));
check(PACK_FIELDS.includes('combat') && PACK_FIELDS.includes('api') && PACK_FIELDS.includes('content'),
  '闭集里有关键三格（combat / api / content）');

// ② 干净包：没有 blocker
{
  const good = { id: 'demo', name: '演示', version: '1.0.0', author: '某人', license: 'GPL-3.0', api: '>=1.0.0 <2.0.0', content: ['chess'], client: { theme: {} } };
  const r = checkPack(good);
  check(blockersOf(r.codes).length === 0, '合法包没有任何 blocker', JSON.stringify(codesOf(r)));
  check(r.combat === null, '没写 combat 时 combat=null（如实：没声明 ≠ 声明了 false）');
  check(r.id === 'demo' && r.api === '>=1.0.0 <2.0.0', 'id / api 被原样读出来');
}

// ③ 未知顶层键（引擎 PACK_UNKNOWN_FIELD，整包拒）
{
  const r = checkPack({ id: 'x', name: 'x', typo: 1, config: {} });
  check(codesOf(r).includes('PACK_UNKNOWN_FIELD'), '未知顶层键 -> PACK_UNKNOWN_FIELD');
  check(blockersOf(r.codes).length === 1, '它是 blocker（引擎装载期整包拒）');
  check(/config/.test(r.codes[0].detail) && /typo/.test(r.codes[0].detail), '详情里点名了那两个键', r.codes[0].detail);
}

// ④ api 类型（区间语义留给引擎，站侧只看类型）
{
  check(codesOf(checkPack({ id: 'x', api: 1 })).includes('BAD_API_TYPE'), 'api 是数字 -> BAD_API_TYPE');
  check(codesOf(checkPack({ id: 'x', api: ['>=1.0.0'] })).includes('BAD_API_TYPE'), 'api 是数组 -> BAD_API_TYPE');
  check(!codesOf(checkPack({ id: 'x', api: '>=1.0.0' })).includes('BAD_API_TYPE'), 'api 是字符串 -> 不报（区间判给引擎）');
  check(!codesOf(checkPack({ id: 'x' })).includes('BAD_API_TYPE'), '没写 api -> 不报');
}

// ⑤ content 名单
{
  check(codesOf(checkPack({ id: 'x', content: 'chess' })).includes('CONTENT_NOT_ARRAY'), 'content 不是数组 -> CONTENT_NOT_ARRAY');
  const r = checkPack({ id: 'x', content: ['chess', 'config', 'units'] });
  check(codesOf(r).includes('CONTENT_UNKNOWN_FILE'), 'content 里有引擎不认识的名字 -> CONTENT_UNKNOWN_FILE');
  check(/config/.test(r.codes.find((c) => c.code === 'CONTENT_UNKNOWN_FILE').detail), '详情里点名了 config（说明书 §1.1 那个经典坑）');
  check(blockersOf(checkPack({ id: 'x', content: ['chess', 'bonds'] }).codes).length === 0, '全认识的名字 -> 不报');
}

// ⑥ combat 告知（引擎三条硬门：server.meta / server.battle / server.modules[].matchClass）
{
  check(codesOf(checkPack({ id: 'x', server: { meta: {} } })).includes('COMBAT_UNDECLARED'),
    'server.meta 没写 combat -> COMBAT_UNDECLARED（引擎 META_NEEDS_COMBAT）');
  check(codesOf(checkPack({ id: 'x', server: { battle: {} } })).includes('COMBAT_UNDECLARED'),
    'server.battle 没写 combat -> COMBAT_UNDECLARED（引擎 BATTLE_NEEDS_COMBAT）');
  check(codesOf(checkPack({ id: 'x', server: { modules: [{ id: 'm', matchClass: {} }] } })).includes('COMBAT_UNDECLARED'),
    'server.modules[].matchClass 没写 combat -> COMBAT_UNDECLARED（引擎 MODULES_NEED_COMBAT）');
  check(blockersOf(checkPack({ id: 'x', server: { meta: {} } }).codes).length === 1, '它是 blocker');
  const ok = checkPack({ id: 'x', combat: true, server: { meta: {}, battle: {} } });
  check(!codesOf(ok).includes('COMBAT_UNDECLARED'), '写了 combat:true -> 不报未声明');
  check(codesOf(ok).includes('COMBAT_DECLARED'), '写了 combat:true -> 给一条 info（提醒标注到站上备注）');
  check(ok.combat === true, 'combat 读出来是 true');
  check(!codesOf(checkPack({ id: 'x', server: { modules: [{ id: 'm' }] } })).includes('COMBAT_UNDECLARED'),
    'modules 里没有 matchClass -> 不算「改对局结果」');
  check(!codesOf(checkPack({ id: 'x', client: { theme: {} } })).includes('COMBAT_UNDECLARED'), '只动界面 -> 不报');
}

// ⑦ 读不到 pack.json
{
  const r = checkPack(null);
  check(codesOf(r).includes('PACK_JSON_UNREADABLE'), 'null -> PACK_JSON_UNREADABLE');
  check(r.combat === null && r.id === null, '读不到时不给任何编造值');
  check(codesOf(checkPack([])).includes('PACK_JSON_UNREADABLE'), '数组（不是对象）-> 同样读不到');
}

// ⑧ 只报不改（纯函数：跑完入参一字不变）
{
  const input = { id: 'x', name: 'y', typo: 1, content: ['nope'], server: { meta: {} } };
  const snapshot = JSON.stringify(input);
  checkPack(input);
  check(JSON.stringify(input) === snapshot, '跑完预检后入参一个字节都没变（只读）');
}

console.log('');
if (failures) { console.log(`✖ ${failures} 项没通过`); process.exit(1); }
console.log('✔ packcheck：闭集 / 未知键 / api 类型 / content 名单 / combat 告知，全部通过');
