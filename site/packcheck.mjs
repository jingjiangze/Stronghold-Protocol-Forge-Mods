// site/packcheck.mjs —— 上传时对包内 `pack.json` 的**契约预检**（纯函数，不依赖引擎、不联网）。
//
// 为什么要有它：站点的审核是「人看」，而**契约**（能声明哪些字段、`content` 认哪些名字、
// `combat` 该不该声明）只有引擎在**装载时**才判。于是今天存在这样一条路：一个 `pack.json` 写了
// 引擎不认识的顶层键、或声明了 `server.meta` 却没写 `combat: true`，在站上一路绿灯到公开，
// 玩家下载后**装载期才被点名拒**（`PACK_UNKNOWN_FIELD` / `META_NEEDS_COMBAT` …）。
// 本站这一层只做**便宜且无歧义**的预检，把结论**如实标在记录上**给审核台与下载者看。
//
// 三条边界（都是刻意的，别"顺手"扩）：
//   ① **不做区间比对**。`api` 的区间语义由引擎 `shared/packs.js appVersionMatches` 判（那个函数
//      连 `bounds()`/`cmp()` 一起约 40 行，且注释写明「读不懂的区间**算匹配**」）。站侧复刻一份
//      就会有**第二份实现**，两边一旦漂移，站说能装、引擎说不能 —— 本仓的纪律是「只有一份实现」
//      （见 `site/server.mjs` 的 `approveGate` 注释）。所以这里只看 `api` 的**类型**。
//   ② **不拦上传**。预检结论进 `codes`，随记录如实展示；收不收仍由审核台的人定
//      （本仓 §3：素材/口径的取舍是人判的，工具只如实报）。
//   ③ **不改包**。只读 `pack.json` 这一条，绝不回写 zip。
//
// 字段闭集与拒绝码逐条对齐引擎：`shared/workshop.js` 的 `PACK_FIELDS`（36 键）、
// `WORKSHOP_CONTENT_FILES`（14 个内容文件名）、`META_NEEDS_COMBAT` / `BATTLE_NEEDS_COMBAT` /
// `MODULES_NEED_COMBAT` 三条硬门（引擎 `shared/workshop.js:128-163`、`:2432-2438` 与 DESIGN §28.13/§28.15）。

/**
 * 引擎认识的 `pack.json` 顶层键（闭集，36 键）。一个不认识的顶层键，引擎**点名整包拒**
 * （`PACK_UNKNOWN_FIELD`）。出处：引擎 `shared/workshop.js` 的 `PACK_FIELDS`。
 * ⚠️ 这张表**必须与引擎同步**：上游加一格而这里没加，预检会误报「不认识」。
 * 本次取值来自引擎检出 `jingjiangze/Stronghold-Protocol-Forge@b4089f7`（2026-10-14）。
 */
export const PACK_FIELDS = Object.freeze([
  // 身份与元信息
  'id', 'name', 'version', 'author', 'license', 'description', 'gameVersion', 'game', 'api', 'layer', 'combat',
  // 内容与覆盖
  'content', 'overrides',
  // 素材与声明（贡献项）
  'voices', 'voiceLangs', 'bondIcons', 'itemIcons', 'art', 'skins', 'support', 'operators', 'i18n',
  // 形态（clip set）与静态相位通道
  'forms', 'fx',
  // 纯文本声明（公告 / 鸣谢）
  'notices',
  // 行为开关（不是贡献项）
  'playtest',
  // 启用声明：装好 ≠ 生效
  'enabled',
  // 变体 / 口径声明
  'variants',
  // 行为开关声明
  'behaviour',
  // 中间层四组能力声明
  'assets', 'client', 'server', 'routes',
  // 目标引擎
  'target',
  // 管理器合同：对其它工坊包的依赖与互斥
  'dependencies', 'conflicts',
]);

/** 引擎认识的数据文件名（`content` 里只能写这些）。出处：引擎 `shared/workshop.js` 的
 *  `WORKSHOP_CONTENT_FILES`。写别的名字**不会报错**，而是"这个文件谁都不读"——所以这里如实报出来。 */
export const CONTENT_FILES = Object.freeze([
  'chess', 'units', 'items', 'enemies', 'stages', 'waves', 'tokens', 'bosses',
  'factions', 'garrisons', 'bands', 'bonds', 'effects', 'choices',
]);

/** 声明了这些「会改对局结果」的通道，就必须同时写 `combat: true`（引擎三条硬门，见文件头）。 */
const COMBAT_CHANNELS = Object.freeze(['meta', 'battle']);

/** 一条预检结论：{ code, level, detail }。level：blocker = 引擎装载期会点名拒；info = 只是如实标注。 */
function flag(code, level, detail) {
  return { code, level, detail };
}

/**
 * 跑一遍预检。**纯函数**：输入已经 `JSON.parse` 过的 pack.json（或 null），输出结论。
 * @param {any} pack 包内 `pack.json` 解析结果（读不到就传 null）
 * @returns {{ codes: Array<{code:string,level:string,detail:string}>, combat: boolean|null, id: string|null, api: string|null }}
 */
export function checkPack(pack) {
  const codes = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return { codes: [flag('PACK_JSON_UNREADABLE', 'blocker', '读不到包内 pack.json（缺条目 / 超 1 MB / 不是 JSON）')], combat: null, id: null, api: null };
  }

  // ① 顶层键闭集（引擎 PACK_UNKNOWN_FIELD）
  const unknown = Object.keys(pack).filter((k) => !PACK_FIELDS.includes(k));
  if (unknown.length) {
    codes.push(flag('PACK_UNKNOWN_FIELD', 'blocker',
      '引擎不认识的顶层键（装载期整包拒）：' + unknown.slice(0, 8).join(', ')
      + (unknown.length > 8 ? ' 等 ' + unknown.length + ' 个' : '')));
  }

  // ② `api` 的类型（区间语义留给引擎，见文件头边界①）
  const api = typeof pack.api === 'string' ? pack.api.trim() : (pack.api === undefined ? null : String(pack.api));
  if (pack.api !== undefined && typeof pack.api !== 'string') {
    codes.push(flag('BAD_API_TYPE', 'blocker', '`api` 必须是字符串区间（现在是 ' + (Array.isArray(pack.api) ? 'array' : typeof pack.api) + '）'));
  }

  // ③ `content` 里的文件名（引擎 WORKSHOP_CONTENT_FILES）
  if (pack.content !== undefined) {
    if (!Array.isArray(pack.content)) {
      codes.push(flag('CONTENT_NOT_ARRAY', 'blocker', '`content` 必须是数组'));
    } else {
      const bad = pack.content.filter((n) => typeof n !== 'string' || !CONTENT_FILES.includes(n));
      if (bad.length) {
        codes.push(flag('CONTENT_UNKNOWN_FILE', 'blocker',
          '`content` 里有引擎不认识的数据文件（声明了也不会被读）：' + bad.map((x) => JSON.stringify(x)).slice(0, 6).join(', ')));
      }
    }
  }

  // ④ combat 告知（引擎 META_NEEDS_COMBAT / BATTLE_NEEDS_COMBAT / MODULES_NEED_COMBAT 三条硬门）
  const server = (pack.server && typeof pack.server === 'object' && !Array.isArray(pack.server)) ? pack.server : null;
  const uses = [];
  if (server) {
    for (const ch of COMBAT_CHANNELS) if (server[ch] !== undefined) uses.push('server.' + ch);
    if (Array.isArray(server.modules) && server.modules.some((m) => m && typeof m === 'object' && m.matchClass !== undefined)) {
      uses.push('server.modules[].matchClass');
    }
  }
  const combat = pack.combat === true ? true : (pack.combat === undefined ? null : false);
  if (uses.length && combat !== true) {
    codes.push(flag('COMBAT_UNDECLARED', 'blocker',
      '用了会改对局结果的通道（' + uses.join(' / ') + '）却没写 `combat: true` —— 引擎装载期点名拒'));
  }
  if (combat === true) {
    codes.push(flag('COMBAT_DECLARED', 'info', '此包声明会改对局结果（`combat: true`）—— 请把这件事标注在站上备注里'));
  }

  return { codes, combat, id: typeof pack.id === 'string' ? pack.id.trim() : null, api };
}

/** 只要结论里"引擎会拒"的那几条（审核台最该先看到的一行）。 */
export function blockersOf(codes) {
  return (Array.isArray(codes) ? codes : []).filter((c) => c && c.level === 'blocker');
}
