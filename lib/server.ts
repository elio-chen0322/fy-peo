import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { featureSeed, kinds, expressionTypes, statuses, types, validUrl } from './catalog';
export function db() {
  return env.DB as D1Database;
}
export function bucket() {
  if (!env.FILES) throw new AppError('免费公开站点暂未启用附件存储，请使用原文或外部附件链接', 503);
  return env.FILES as R2Bucket;
}
export class AppError extends Error {
  constructor(
    message: string,
    public code = 400,
  ) {
    super(message);
  }
}
export async function identity(req?: Request) {
  const direct = env as unknown as Record<string, string>;
  if (direct.DEPLOYMENT_MODE === 'public-readonly') {
    if (req && !['GET', 'HEAD'].includes(req.method))
      throw new AppError('公开站点仅供查看；请在本地工作台修改和审核', 403);
    if (!direct.PUBLIC_DATA_OWNER) throw new AppError('公开数据空间尚未配置', 503);
    return { owner: direct.PUBLIC_DATA_OWNER, actor: '公开访客' };
  }
  const u = await getChatGPTUser();
  if (!u) throw new AppError('请先登录后使用反馈库', 401);
  if (req && req.method !== 'GET') {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin && !(direct.DEPLOYMENT_MODE === 'supabase-edge' && origin === direct.APP_ORIGIN))
      throw new AppError('请求来源不匹配', 403);
  }
  return { owner: u.userId, actor: u.displayName };
}
export function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export function failure(e: unknown) {
  if (e instanceof AppError) return response({ error: e.message }, e.code);
  console.error(
    'library operation failed',
    e instanceof Error ? e.message : 'unknown',
  );
  return response(
    { error: '保存或读取失败，请稍后重试；已有数据不会被清空。' },
    500,
  );
}
export async function json(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > 4_000_000)
    throw new AppError('单次请求过大，请分批导入');
  const txt = await req.text();
  if (txt.length > 4_000_000) throw new AppError('单次请求过大');
  try {
    return JSON.parse(txt);
  } catch {
    throw new AppError('请求格式错误');
  }
}
export async function seed(owner: string) {
  const n = await db()
    .prepare('SELECT count(*) AS n FROM features WHERE owner=?')
    .bind(owner)
    .first<{ n: number }>();
  if (n?.n) return;
  const q = [];
  for (const [p, names] of Object.entries(featureSeed))
    for (const name of names)
      q.push(
        db()
          .prepare(
            'INSERT OR IGNORE INTO features(id,owner,parent,name) VALUES(?,?,?,?)',
          )
          .bind(crypto.randomUUID(), owner, p, name),
      );
  await db().batch(q);
}
export async function hash(s: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export const editFields = [
  'external_id',
  'post_id',
  'parent_comment_id',
  'crawl_keyword',
  'raw',
  'request_id',
  'request_candidate_id',
  'request_candidate_score',
  'request_candidate_reason',
  'request_match_score',
  'request_match_status',
  'theme_id',
  'theme_confidence',
  'theme_reason',
  'feature_id',
  'kind',
  'expression_type',
  'expression_reason',
  'version',
  'published_at',
  'captured_at',
  'like_count',
  'comment_count',
  'collect_count',
  'share_count',
  'reply_count',
  'url',
  'attachment_links',
  'city',
  'source',
  'source_type',
  'status',
  'archived',
] as const;
export function snap(row: any) {
  return Object.fromEntries(editFields.map((k) => [k, row[k]]));
}
export function validateDate(v: string) {
  if (!v) return '';
  const t = v.trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(t))
    throw new AppError('时间格式应为 YYYY-MM-DD HH:mm:ss');
  const [d, time = '00:00:00'] = t.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== day
  )
    throw new AppError('日期无效');
  const [h, mi, s = 0] = time.split(':').map(Number);
  if (h > 23 || mi > 59 || s > 59) throw new AppError('时间无效');
  return t.length === 10 ? t + ' 00:00:00' : t.length === 16 ? t + ':00' : t;
}
export async function clean(input: any, owner: string) {
  const o: any = {};
  const metricFields = ['like_count', 'comment_count', 'collect_count', 'share_count', 'reply_count'];
  for (const key of editFields) {
    if (key === 'archived') {
      o[key] = input[key] === 1 ? 1 : 0;
      continue;
    }
    if (key === 'theme_confidence') {
      o[key] = Math.max(0, Math.min(100, Number(input[key]) || 0));
      continue;
    }
    if (key === 'request_candidate_score') {
      o[key] = Math.max(0, Math.min(100, Number(input[key]) || 0));
      continue;
    }
    if (key === 'request_match_score') {
      o[key] = Math.max(0, Math.min(100, Number(input[key]) || 0));
      continue;
    }
    if (metricFields.includes(key)) {
      const value = input[key];
      if (value === null || value === undefined || value === '') {
        o[key] = null;
      } else {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 0)
          throw new AppError('互动数量必须是非负整数');
        o[key] = number;
      }
      continue;
    }
    o[key] = String(input[key] ?? '').trim();
    if (
      o[key].length > (['raw', 'attachment_links'].includes(key) ? 30000 : 1500)
    )
      throw new AppError('字段内容过长');
  }
  if (!o.raw) throw new AppError('反馈原声不能为空');
  if (input.feature1 && !o.feature_id)
    throw new AppError('请选择二级 Feature，或清空一级 Feature 后保存');
  if (!kinds.includes(o.kind)) throw new AppError('体验/质量分类无效');
  if (!expressionTypes.includes(o.expression_type)) throw new AppError('表达类型无效');
  if (!statuses.includes(o.status)) throw new AppError('审核状态无效');
  if (!types.includes(o.source_type)) throw new AppError('内容类型无效');
  if (!o.source) throw new AppError('来源不能为空');
  o.published_at = validateDate(o.published_at);
  o.captured_at = validateDate(o.captured_at);
  if (o.url && !validUrl(o.url))
    throw new AppError('链接必须以 http:// 或 https:// 开头');
  for (const [key, table] of [
    ['request_id', 'demands'],
    ['request_candidate_id', 'demands'],
    ['feature_id', 'features'],
    ['theme_id', 'themes'],
  ])
    if (
      o[key] &&
      !(await db()
        .prepare(`SELECT id FROM ${table} WHERE id=? AND owner=?`)
        .bind(o[key], owner)
        .first())
    )
      throw new AppError('所选诉求或 Feature 已变更，请刷新后重试');
  return o;
}
function matchText(s: string) {
  return (s || '').toLocaleLowerCase()
    .replace(/#[^#\n]+#|\[[^\]]+\]/g, ' ')
    .replace(/建议增加|建议优化|建议|增加|优化|改善|希望|体验|功能|用户|关于|萤火虫|蔚来|紫菀|firefly|aster/g, ' ')
    .replace(/[^\u4e00-\u9fff0-9a-z]+/g, '');
}
function matchGrams(s: string) {
  const result = new Set<string>();
  for (const size of [2, 3])
    for (let i = 0; i <= s.length - size; i++) result.add(s.slice(i, i + size));
  return result;
}
export async function scoreFeedbackDemand(feedbackId: string, demandId: string, owner: string) {
  const [feedback, demand, catalog] = await Promise.all([
    db().prepare(`SELECT f.raw,COALESCE(p.raw,'') post_context,COALESCE(parent.raw,'') parent_context
      FROM feedback f LEFT JOIN feedback p ON p.owner=f.owner AND p.source_type='帖子' AND p.external_id=f.post_id
      LEFT JOIN feedback parent ON parent.owner=f.owner AND parent.source_type='评论' AND parent.external_id=f.parent_comment_id
      WHERE f.id=? AND f.owner=?`).bind(feedbackId, owner).first<any>(),
    db().prepare('SELECT name FROM demands WHERE id=? AND owner=?').bind(demandId, owner).first<{ name: string }>(),
    db().prepare("SELECT name FROM demands WHERE owner=? AND lifecycle_status IN ('待启用','启用')").bind(owner).all<{ name: string }>(),
  ]);
  if (!feedback || !demand || !catalog.results.length) return 0;
  const docs = catalog.results.map((d) => matchGrams(matchText(d.name)));
  const frequency = new Map<string, number>();
  for (const grams of docs) for (const gram of grams) frequency.set(gram, (frequency.get(gram) || 0) + 1);
  const idf = (g: string) => Math.log((docs.length + 1) / ((frequency.get(g) || 0) + 1)) + 1;
  const query = matchGrams(matchText(`${feedback.raw || ''} ${feedback.parent_context || ''} ${feedback.post_context || ''}`));
  const target = matchGrams(matchText(demand.name));
  if (!query.size || !target.size) return 0;
  const shared = [...query].filter((g) => target.has(g));
  const queryWeight = [...query].reduce((sum, g) => sum + idf(g), 0);
  const targetWeight = [...target].reduce((sum, g) => sum + idf(g), 0);
  const intersection = shared.reduce((sum, g) => sum + idf(g), 0);
  const normalized = intersection / Math.sqrt(Math.max(1, queryWeight) * Math.max(1, targetWeight));
  const a = matchText(feedback.raw || '');
  const b = matchText(demand.name);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  const ratio = 1 - previous[b.length] / Math.max(1, a.length, b.length);
  return Math.max(0, Math.min(100, Math.round(Math.max(normalized, ratio * 0.75) * 100)));
}
export async function resolveLabels(input: any, owner: string) {
  const o = { ...input };
  if (!o.feature_id && o.feature1 && o.feature2) {
    const p = String(o.feature1).trim(),
      n = String(o.feature2).trim();
    if (p.length > 100 || n.length > 150)
      throw new AppError('Feature 名称过长');
    await db()
      .prepare(
        'INSERT OR IGNORE INTO features(id,owner,parent,name) VALUES(?,?,?,?)',
      )
      .bind(crypto.randomUUID(), owner, p, n)
      .run();
    o.feature_id = (
      await db()
        .prepare(
          'SELECT id FROM features WHERE owner=? AND parent=? AND name=?',
        )
        .bind(owner, p, n)
        .first<any>()
    ).id;
  }
  if (!o.request_id && o.request_name) {
    const name = String(o.request_name).trim();
    if (name.length > 300) throw new AppError('诉求名称过长');
    await db()
      .prepare('INSERT OR IGNORE INTO demands(id,owner,name) VALUES(?,?,?)')
      .bind(crypto.randomUUID(), owner, name)
      .run();
    o.request_id = (
      await db()
        .prepare('SELECT id FROM demands WHERE owner=? AND name=?')
        .bind(owner, name)
        .first<any>()
    ).id;
  }
  if (!o.theme_id && o.theme_name) {
    const name = String(o.theme_name).trim();
    if (name.length > 150) throw new AppError('主题名称过长');
    const now = new Date().toISOString();
    await db()
      .prepare('INSERT OR IGNORE INTO themes(id,owner,name,created_at,updated_at) VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), owner, name, now, now)
      .run();
    o.theme_id = (await db().prepare('SELECT id FROM themes WHERE owner=? AND name=?').bind(owner, name).first<any>()).id;
  }
  return o;
}
export const joined = `SELECT f.*,
  COALESCE(d.name,'') request_name,
  COALESCE(d.uba,'') request_uba,
  COALESCE(d.attribute,'') request_attribute,
  COALESCE(d.request_type,'') request_type,
  COALESCE(d.hardware_software,'') request_hardware_software,
  COALESCE(d.feature1,'') request_feature1,
  COALESCE(d.feature2,'') request_feature2,
  COALESCE(cd.name,'') request_candidate_name,
  COALESCE(cd.uba,'') candidate_uba,
  COALESCE(cd.attribute,'') candidate_attribute,
  COALESCE(cd.request_type,'') candidate_request_type,
  COALESCE(cd.hardware_software,'') candidate_hardware_software,
  COALESCE(cd.feature1,'') candidate_feature1,
  COALESCE(cd.feature2,'') candidate_feature2,
  CASE WHEN f.request_id<>'' THEN COALESCE(d.feature1,'') ELSE COALESCE(t.parent,'') END feature1,
  CASE WHEN f.request_id<>'' THEN COALESCE(d.feature2,'') ELSE COALESCE(t.name,'') END feature2,
  COALESCE(th.name,'') theme_name,
  COALESCE(post.raw,'') post_context,
  COALESCE(parent.raw,'') parent_context,
  (SELECT COUNT(*) FROM files a WHERE a.feedback_id=f.id AND a.owner=f.owner) file_count
  FROM feedback f
  LEFT JOIN demands d ON d.id=f.request_id AND d.owner=f.owner
  LEFT JOIN demands cd ON cd.id=f.request_candidate_id AND cd.owner=f.owner
  LEFT JOIN features t ON t.id=f.feature_id AND t.owner=f.owner
  LEFT JOIN themes th ON th.id=f.theme_id AND th.owner=f.owner
  LEFT JOIN feedback post ON post.owner=f.owner AND post.source_type='帖子' AND post.external_id=f.post_id
  LEFT JOIN feedback parent ON parent.owner=f.owner AND parent.source_type='评论' AND parent.external_id=f.parent_comment_id`;
export function where(p: URLSearchParams, owner: string) {
  const clauses = ['f.owner=?', 'f.archived=?'];
  const args: any[] = [owner, p.get('archived') === '1' ? 1 : 0];
  for (const k of [
    'kind',
    'expression_type',
    'status',
    'source',
    'source_type',
    'version',
    'city',
    'request_id',
    'theme_id',
  ]) {
    const v = p.get(k);
    if (v) {
      clauses.push(`f.${k}=?`);
      args.push(v);
    }
  }
  if (p.get('candidate') === '1') {
    clauses.push("f.request_candidate_id<>'' AND f.request_id=''");
  }
  if (p.get('feature1')) {
    clauses.push("((f.request_id<>'' AND d.feature1=?) OR (f.request_id='' AND t.parent=?))");
    args.push(p.get('feature1'), p.get('feature1'));
  }
  if (p.get('feature2')) {
    clauses.push("((f.request_id<>'' AND d.feature2=?) OR (f.request_id='' AND t.name=?))");
    args.push(p.get('feature2'), p.get('feature2'));
  }
  if (p.get('q')) {
    clauses.push(
      "(f.raw LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\' OR f.external_id LIKE ? ESCAPE '\\' OR f.id LIKE ? ESCAPE '\\')",
    );
    const s = '%' + p.get('q')!.replace(/[\\%_]/g, '\\$&') + '%';
    args.push(s, s, s, s);
  }
  for (const [key, op] of [
    ['from', '>='],
    ['to', '<='],
  ])
    if (p.get(key)) {
      clauses.push(`f.published_at ${op} ?`);
      args.push(p.get(key) + (key === 'to' ? ' 23:59:59' : ' 00:00:00'));
    }
  return { sql: clauses.join(' AND '), args };
}
export async function event(
  owner: string,
  actor: string,
  action: string,
  before: any,
  after: any,
  id = '',
  revision = 0,
) {
  return db()
    .prepare(
      'INSERT INTO events(id,owner,feedback_id,action,before_json,after_json,after_revision,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      owner,
      id,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      revision,
      actor,
      new Date().toISOString(),
    )
    .run();
}
export async function create(
  input: any,
  owner: string,
  actor: string,
  action = '新增反馈',
) {
  const labels = await resolveLabels(input, owner);
  const o = await clean(labels, owner);
  if (o.request_id || o.request_candidate_id) {
    if (!o.request_match_score) o.request_match_score = o.request_candidate_score || 0;
    o.request_match_status = '待确认';
  }
  const fingerprint = await hash(
    o.external_id
      ? JSON.stringify([o.source, o.source_type, o.external_id])
      : JSON.stringify([o.source, o.source_type, o.raw, o.published_at, o.url]),
  );
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  const fields = editFields.join(',');
  const placeholders = editFields.map(() => '?').join(',');
  const orig = JSON.stringify({
    ...o,
    request_name: input.request_name || '',
    feature1: input.feature1 || '',
    feature2: input.feature2 || '',
  });
  const platform = ({小红书:'xhs',微博:'wb',抖音:'dy','B站':'bili'} as Record<string,string>)[o.source] || o.source;
  const voiceId = o.external_id ? `${platform}:${o.source_type==='帖子'?'note':`comment:${o.post_id}`}:${o.external_id}` : `feedback:${id}`;
  const result = await db().batch([
    db()
      .prepare(
        `INSERT OR IGNORE INTO feedback(id,owner,fingerprint,${fields},original_snapshot,created_at,updated_at) VALUES(?,?,?,${placeholders},?,?,?)`,
      )
      .bind(
        id,
        owner,
        fingerprint,
        ...editFields.map((k) => o[k]),
        orig,
        now,
        now,
      ),
    db()
      .prepare(
        'INSERT INTO events(id,owner,feedback_id,action,before_json,after_json,after_revision,actor,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1',
      )
      .bind(
        crypto.randomUUID(),
        owner,
        id,
        action,
        '{}',
        JSON.stringify(o),
        1,
        actor,
        now,
      ),
    db().prepare(`INSERT OR IGNORE INTO voice_screenings(id,owner,feedback_id,voice_id,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM feedback WHERE id=? AND owner=?)`)
      .bind(`screen:${id}`,owner,id,voiceId,now,now,id,owner),
  ]);
  return { id, duplicate: result[0].meta.changes === 0 };
}
export async function edit(
  id: string,
  revision: number,
  patch: any,
  owner: string,
  actor: string,
  action = '编辑反馈',
  preserveMatchState = false,
) {
  const before = await db()
    .prepare('SELECT * FROM feedback WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<any>();
  if (!before) throw new AppError('反馈不存在', 404);
  if (before.revision !== revision)
    throw new AppError('这条反馈已被修改，请刷新后重试', 409);
  const o = await clean({ ...before, ...patch }, owner);
  if (Object.hasOwn(patch, 'request_id') && o.request_id) {
    o.request_candidate_id = '';
    o.request_candidate_score = 0;
    o.request_candidate_reason = '';
  }
  const associationChanged = o.request_id !== before.request_id || o.request_candidate_id !== before.request_candidate_id;
  if (associationChanged) {
    const matchedId = o.request_id || o.request_candidate_id;
    o.request_match_score = matchedId ? await scoreFeedbackDemand(id, matchedId, owner) : 0;
    if (!preserveMatchState) o.request_match_status = matchedId ? '待确认' : '未匹配';
  }
  const now = new Date().toISOString();
  const next = revision + 1;
  const result = await db().batch([
    db()
      .prepare(
        `UPDATE feedback SET ${editFields.map((k) => k + '=?').join(',')},revision=?,updated_at=? WHERE id=? AND owner=? AND revision=?`,
      )
      .bind(...editFields.map((k) => o[k]), next, now, id, owner, revision),
    db()
      .prepare(
        'INSERT INTO events(id,owner,feedback_id,action,before_json,after_json,after_revision,actor,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1',
      )
      .bind(
        crypto.randomUUID(),
        owner,
        id,
        action,
        JSON.stringify(snap(before)),
        JSON.stringify(o),
        next,
        actor,
        now,
      ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError('这条反馈已被修改，请刷新后重试', 409);
  return { id, revision: next };
}
