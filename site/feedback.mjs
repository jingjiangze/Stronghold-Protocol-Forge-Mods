// 反馈面：能写哪些栏、多长算长、什么字节算「一张图片」。
//
// 与 `zip.mjs` / `review.mjs` 同一层 —— **只用 node 内置模块，不引第三方**。
// 单独成文件的理由有两条：让 `server.mjs` 里那两段端点不必各自写一份校验，
// 「反馈的字段闭集」与「图片白名单」在全站**只有一份定义**；再就是反馈那两页的
// 占位符填充也住在这里 —— 不寄在上游的 `renderPage` 里（见 `fillFeedbackPage` 的注释）。
//
// 端点本身在 `server.mjs`（公开写：`POST /api/feedback`、`POST /api/feedback/image`；
// 只有维护者能读：`GET /api/<ADMIN_PATH>/feedback`）。这里不放任何 HTTP 逻辑。

/**
 * 反馈报文的**字段闭集**（与包契约 `PACK_FIELDS` 那条纪律同构：多写一栏就拒，
 * 不静默丢弃 —— 静默丢弃会变成「我明明写了 engineVersion，怎么没收到」）。
 */
export const FB_FIELDS = Object.freeze(['text', 'kind', 'severity', 'engineVersion', 'contact']);
/** 反馈类型（闭枚举）。`content` = 内容与数值层面的意见，`compat` = 兼容/装载问题。 */
export const FB_KINDS = Object.freeze(['bug', 'compat', 'content', 'other']);
/** 影响程度（闭枚举）。故意不用数字严重度 —— 那需要一套没人对得上的标尺。 */
export const FB_SEVERITIES = Object.freeze(['info', 'annoying', 'blocking']);
/** 正文上限（字）。`note` 那一栏是 20000，反馈不必那么长：它是「一条问题」，不是「一份说明」。 */
export const FB_TEXT_MAX = 2000;
/** 短栏（engineVersion / contact）上限（字）。 */
export const FB_SHORT_MAX = 80;
/** 反馈报文体上限（字节）：2000 个汉字最坏 3 字节/字，加 JSON 包装。 */
export const FB_BODY_MAX = 64 * 1024;
/** 一条反馈最多几张图。 */
export const FB_IMG_MAX = 4;
/** 单张图片字节上限（站点**不缩放、不转码**，所以只能靠上限，不能靠重编码压小）。 */
export const FB_IMG_BYTES_MAX = 2 * 1024 * 1024;
/** 合并查看一次最多点几个 mod（**读**侧的事；写侧永远一次一个 mod）。 */
export const FB_MODS_MAX = 20;
/** `?all=1` 翻页时一页几条。 */
export const FB_PAGE_DEFAULT = 50;
export const FB_PAGE_MAX = 200;

/**
 * 反馈的处理状态（**闭集**，维护者侧）。业主 2026-10-13 补的一条：反馈要能标「看过了 / 在办 / 办完」。
 *
 * 三条口径与站内既有做法逐字同源：
 *   · **缺省即 `new`**：老文件里没有这一栏就读成 `new` —— 与 `packKind` 缺省 `unknown` 同一立场，
 *     **不回填、不猜**（缺省绝不可能是 `done`，否则「没人看过」会被统计成「办完了」）；
 *   · **改状态是一次一条**（`id` + `fb` 都得明确写出），批量形状一律 400（AGENTS.md §8.1）；
 *   · **幂等**：目标值已经是它 ⇒ `changed:false`，不写盘、不留第二笔流水（零删除，流水只加不减）。
 */
export const FB_STATES = Object.freeze(['new', 'read', 'doing', 'done']);
/** 状态那一栏在响应里怎么读（缺省 `new`，不在闭集里的脏值也读成 `new`，不原样透出去）。 */
export const fbStateOf = (fb) => (FB_STATES.includes(fb?.state) ? fb.state : 'new');
/** 状态变更的理由上限（字）。可以不给 —— 给了就如实存着。 */
export const FB_REASON_MAX = 200;

/** 幂等键的形状（agent 重试时带上同一个键）：允许字母数字、下划线、连字符。 */
export const FB_DEDUPE_RE = /^[A-Za-z0-9_-]{6,64}$/;
/** 反馈编号与记录编号同一形状（同一个 `ID_RE` 口径，不另造一套）。 */
export const FB_ID_RE = /^[a-z0-9]{6,32}$/;

/**
 * 校验并归一化反馈报文。返回 `{ error, code? }`（不合格）或 `{ fb }`（合格）。
 *
 * 三条口径写在这里，免得下一个人改歪：
 *   · **未知栏 ⇒ 整条拒**，不裁剪、不忽略（与 `PACK_UNKNOWN_FIELD` 同一立场）；
 *   · 闭枚举的**缺省值**是 `other` / `info`，但**填错值不回落** —— 回落会把拼写错误变成
 *     「按最不严重的那档统计」，那才是审核时最不想看到的失真；
 *   · `contact` 是**投稿人自愿留给维护者的联系方式**，可以为空；站点不猜、不代填、不公开。
 */
export function normalizeFeedback(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '反馈必须是一个 JSON 对象', code: 'FB_BAD_BODY' };
  }
  const extra = Object.keys(raw).filter((k) => !FB_FIELDS.includes(k));
  if (extra.length) {
    return {
      error: `反馈只认这些栏：${FB_FIELDS.join(' / ')}。多出来的栏：${extra.join(' / ')}`,
      code: 'FB_UNKNOWN_FIELD',
    };
  }
  const text = String(raw.text ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return { error: '正文是空的', code: 'FB_EMPTY_TEXT' };
  if (text.length > FB_TEXT_MAX) {
    return { error: `正文太长（最多 ${FB_TEXT_MAX} 字，这一条 ${text.length} 字）`, code: 'FB_TEXT_TOO_LONG' };
  }
  const kind = raw.kind == null ? 'other' : String(raw.kind).trim();
  if (!FB_KINDS.includes(kind)) {
    return { error: `kind 只能是 ${FB_KINDS.join(' / ')}（不填按 other）`, code: 'FB_BAD_KIND' };
  }
  const severity = raw.severity == null ? 'info' : String(raw.severity).trim();
  if (!FB_SEVERITIES.includes(severity)) {
    return { error: `severity 只能是 ${FB_SEVERITIES.join(' / ')}（不填按 info）`, code: 'FB_BAD_SEVERITY' };
  }
  const short = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, FB_SHORT_MAX));
  return {
    fb: {
      text,
      kind,
      severity,
      engineVersion: short(raw.engineVersion),
      contact: short(raw.contact),
    },
  };
}

/**
 * 图片魔数嗅探：**只认栅格图** —— PNG / JPEG / GIF / WEBP。认不出返回 `null`。
 *
 * 为什么是白名单而不是黑名单（三条都是硬理由）：
 *   ① SVG / HTML 是**脚本面**不是图片面。站点当前没有 CSP 响应头，一张内嵌 `<script>` 的 SVG
 *      就是持久型 XSS —— 而它看起来完全「像一张图」，黑名单挡不住这种。
 *   ② **扩展名不参与判据**：`x-filename` 只用来拼显示名（与 `blobNameFromHeader` 同一立场），
 *      落盘文件名一律由服务端按嗅探结果生成 `<反馈编号>-<序>.<png|jpg|gif|webp>`。
 *   ③ 站点零依赖，**不解码、不缩放、不转格式** —— 存进去的字节 = 发出来的字节，
 *      所以「它到底是什么」只能由头几个字节说了算，服务端不会替它重编码成安全形态。
 *
 * 返回的 `mediaType` 是**发图时唯一的 content-type 来源**（不读盘上的扩展名，也不读客户端报的），
 * 配合 `x-content-type-options: nosniff`，浏览器就不会把别的字节当脚本或 HTML 解释。
 */
export function sniffImage(buf) {
  if (!buf || buf.length < 13) return null;
  const at = (off, bytes) => bytes.every((b, i) => buf[off + i] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mediaType: 'image/png', ext: 'png' };
  if (at(0, [0xff, 0xd8, 0xff])) return { mediaType: 'image/jpeg', ext: 'jpg' };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return { mediaType: 'image/gif', ext: 'gif' };
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return { mediaType: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * 折叠「同一个 mod」的分组键。
 *
 * 站上一份 mod 常常**是几条记录**：原件投稿 + 维护者的兼容改写版（`compatOf` 那条链），
 * 甚至同一个 `pack.json.id` 的两条（引擎里同 id 不能并存，`/mods` 页对此有专门一行提示）。
 * 按记录编号分组会把同一款 mod 的反馈劈成几半，所以判据两条（与公开列表那两条同源）：
 *   ① `packId` 相同；② `compatOf` 有链（**双向**：A 说它由 B 改来 ⇒ A、B 同一款）。
 * 拿不到 `packId` 的记录（说明包、读不到 pack.json 的形态）就退化成**按自己的编号**成组 ——
 * 宁可多分几组，也**绝不**把两款无关的 mod 并进一组。
 */
export function fbGroupKey(id, packId) {
  return packId ? `pack:${packId}` : `rec:${id}`;
}

/**
 * 反馈那两页的**占位符填充**（纯字符串变换，不读盘也不碰 res）。
 *
 * 为什么在这里而不是上游的 `renderPage` 里（2026-10-14 的 S1）：`renderPage` 是上游的
 * 「老住户」—— 他每加一个筛选维度就往中间插一行（`__KINDS__`、`__FUNCS__`、`__MAX_MB__`
 * 都是这样陆续长出来的），我方挂进去的那几行**每轮同步必撞**。搬回这一层之后
 * `server.mjs` 里那个函数**逐字节等于上游**，`.github/overlay-check.mjs` 的 `noTouch` 就是钉这条的。
 *
 * 纪律与 `renderPage` 逐字同源，一条都不放松：
 *   · **URL 上的任意值绝不进 HTML**：`fbMod` 先过调用方给的正则 —— 传的就是服务端那个 `ID_RE`，
 *     不在此处另造一套口径；形状不对就当没给（空串），不报错、不原样透出；
 *   · 只认这四个槽，页面里其余字节原样保留；
 *   · 读盘与发送留给 `server.mjs`：这一层仍然没有任何 HTTP / IO 逻辑（与文件开头那条承诺一致）。
 */
export function fillFeedbackPage(
  html,
  { css = '', adminApi = '', adminPage = '', fbMod = '', idRe = FB_ID_RE } = {},
) {
  const raw = String(fbMod ?? '');
  const safe = idRe.test(raw) ? raw : '';
  return String(html)
    .split('__CSS__').join(css)
    .split('__ADMIN_API__').join(adminApi)
    .split('__ADMIN_PAGE__').join(adminPage)
    .split('__FB_MOD__').join(safe);
}
