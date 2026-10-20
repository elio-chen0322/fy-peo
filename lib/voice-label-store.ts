import { db, AppError, create, hash } from './server';
import { emptyRecord } from './catalog';
import {
  aiFinal,
  confidenceFromAI,
  excludedScreen,
  matchStates,
  parseObject,
  recordFromRaw,
  relevanceStates,
  type LabelValue,
} from './voice-labeling';

const currentTime = () => new Date().toISOString();
const validScore = (x: any) =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;
export function screenRow(r: any) {
  return {
    ...r,
    raw: parseObject(r.raw_json, []),
    ai: parseObject(r.ai_json),
    final: parseObject(r.final_json),
  };
}
export function labelRow(r: any) {
  return { ...r, ai: parseObject(r.ai_json), final: parseObject(r.final_json) };
}
export async function canonicalLabel(
  value: LabelValue,
  owner: string,
): Promise<LabelValue> {
  const v = { ...value };
  if (!matchStates.includes(v['匹配状态']))
    throw new AppError('请选择有效的匹配状态');
  if (v['匹配状态'] === '匹配已有诉求') {
    const d = await db()
      .prepare('SELECT * FROM demands WHERE owner=? AND id=?')
      .bind(owner, String(v['诉求ID'] || ''))
      .first<any>();
    if (
      !d ||
      d.lifecycle_status !== '启用' ||
      !d.feature1 ||
      !d.feature2 ||
      !['Need', 'Issue'].includes(d.request_type) ||
      !['体验', '质量'].includes(d.attribute) ||
      /作废|测试诉求/.test(d.name)
    )
      throw new AppError('只能关联启用且四维完整的标准诉求');
    return {
      诉求ID: d.id,
      诉求名称: d.name,
      一级Feature: d.feature1,
      二级Feature: d.feature2,
      '建议/问题': d.request_type === 'Need' ? '建议' : '问题',
      '体验/质量': d.attribute,
      匹配状态: v['匹配状态'],
    };
  }
  v['诉求ID'] = '';
  if (['无诉求', '不匹配'].includes(v['匹配状态']))
    for (const k of [
      '诉求名称',
      '一级Feature',
      '二级Feature',
      '建议/问题',
      '体验/质量',
    ])
      v[k] = '';
  else {
    if (
      !['建议', '问题', '待判断', '不适用', ''].includes(
        v['建议/问题'] || '',
      ) ||
      !['体验', '质量', '待判断', '不适用', ''].includes(v['体验/质量'] || '')
    )
      throw new AppError('建议/问题或体验/质量取值无效');
    if (v['一级Feature'] && v['二级Feature']) {
      const pair = await db()
        .prepare(
          'SELECT 1 ok FROM features WHERE owner=? AND parent=? AND name=? UNION SELECT 1 FROM demands WHERE owner=? AND feature1=? AND feature2=? LIMIT 1',
        )
        .bind(
          owner,
          v['一级Feature'],
          v['二级Feature'],
          owner,
          v['一级Feature'],
          v['二级Feature'],
        )
        .first();
      if (!pair) throw new AppError('二级Feature不属于所选一级Feature');
    }
  }
  return Object.fromEntries(
    [
      '诉求ID',
      '诉求名称',
      '一级Feature',
      '二级Feature',
      '建议/问题',
      '体验/质量',
      '匹配状态',
    ].map((k) => [k, String(v[k] || '')]),
  );
}
export async function rawForFeedback(f: any) {
  if (f.raw_json) {
    const raw = parseObject(f.raw_json, []);
    if (raw.length === 26) return raw;
  }
  const original = parseObject(f.original_snapshot);
  const contextStatus =
    f.source_type === '帖子'
      ? '不适用'
      : !f.post_context || (f.parent_comment_id && !f.parent_context)
        ? '部分缺失'
        : '完整';
  return [
    f.source_type,
    f.raw,
    '',
    original.author_name || '',
    original.author_id || '',
    f.published_at || null,
    f.like_count ?? null,
    f.captured_at || null,
    f.crawl_keyword || '',
    '',
    '',
    '',
    '',
    contextStatus,
    '',
    f.post_context || '',
    f.parent_context || '',
    f.collect_count ?? null,
    f.comment_count ?? null,
    f.share_count ?? null,
    f.voice_id || `feedback:${f.id}`,
    f.post_id || '',
    f.source_type === '评论' ? f.external_id : '',
    '',
    '' + (f.parent_comment_id || ''),
    f.url || '',
  ];
}
export async function getVoice(id: string, owner: string) {
  const f = await db()
    .prepare(`SELECT f.*,s.voice_id,s.raw_json,
 COALESCE((SELECT p.raw FROM feedback p WHERE p.owner=f.owner AND p.source=f.source AND p.source_type='帖子' AND p.external_id=f.post_id LIMIT 1),'') post_context,
 COALESCE((SELECT p.raw FROM feedback p WHERE p.owner=f.owner AND p.source=f.source AND p.source_type='评论' AND p.external_id=f.parent_comment_id LIMIT 1),'') parent_context
 FROM feedback f LEFT JOIN voice_screenings s ON s.feedback_id=f.id AND s.owner=f.owner WHERE f.id=? AND f.owner=?`)
    .bind(id, owner)
    .first<any>();
  if (!f) throw new AppError('原声不存在', 404);
  return f;
}
function validateEvidence(raw: any[], data: any, screen = false) {
  const fieldMap: Record<string, any> = {
    body: raw[1],
    title: raw[2],
    post_context: raw[15],
    reply_context: raw[16],
  };
  const value = screen ? data['筛选证据'] : data['引用证据'];
  const evidence = typeof value === 'string' ? parseObject(value, []) : value;
  if (!Array.isArray(evidence) || !evidence.length)
    throw new AppError('打标结果缺少可核验的原文证据');
  if (!screen && !evidence.some((e) => e.field === 'body'))
    throw new AppError('诉求判断必须引用当前作者的正文，不能只继承上下文');
  for (const e of evidence)
    if (
      !Object.hasOwn(fieldMap, e.field) ||
      !e.quote ||
      !String(fieldMap[e.field] || '').includes(e.quote)
    )
      throw new AppError('证据引用与原声或上下文不一致');
}
export async function importVoices(
  records: any[],
  owner: string,
  actor: string,
) {
  if (!Array.isArray(records) || !records.length || records.length > 10)
    throw new AppError('每批导入1–10条原声');
  const results = [];
  for (const item of records) {
    try {
      const raw = item.raw;
      let record: any;
      try {
        record = recordFromRaw(raw);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      const ai = { ...(item.ai || {}) };
      const relevance = ai['AI相关性'] || '待确认',
        demandness = ai['AI诉求性'] || '待确认';
      if (
        !relevanceStates.includes(relevance) ||
        !['有诉求', '无诉求', '待确认'].includes(demandness)
      )
        throw new AppError('筛选分类无效');
      const relConfidence = validScore(ai['相关性置信度'])
        ? Math.round(ai['相关性置信度'])
        : null;
      if (relConfidence !== null) validateEvidence(raw, ai, true);
      const normalized = [];
      const assigned = new Set();
      const intentIds = new Set();
      if (!Array.isArray(item.labels || []) || (item.labels || []).length > 50)
        throw new AppError('单条原声最多导入50个独立诉求');
      for (const l of item.labels || []) {
        const initial = aiFinal(l.ai || {});
        const final = await canonicalLabel(initial, owner);
        if (JSON.stringify(initial) !== JSON.stringify(final))
          throw new AppError('打标结果的诉求名称或四维与字典不一致');
        const intent = String(l.intent_id || '');
        if (!intent || intent.length > 150 || intentIds.has(intent))
          throw new AppError('拆分诉求ID缺失或重复');
        intentIds.add(intent);
        if (final['诉求ID']) {
          if (assigned.has(final['诉求ID']))
            throw new AppError('同一原声重复关联同一标准诉求');
          assigned.add(final['诉求ID']);
        }
        const confidence = confidenceFromAI(
          l.ai,
          relConfidence,
          String(raw[13] || ''),
        );
        if (confidence !== null) validateEvidence(raw, l.ai);
        normalized.push({ ...l, final, confidence });
      }
      if (
        (relevance === '不相关' || demandness === '无诉求') &&
        normalized.length
      )
        throw new AppError('不相关或无诉求原声不能同时包含诉求标签');
      const fingerprint = await hash(
        JSON.stringify([record.source, record.source_type, record.external_id]),
      );
      let f = await db()
        .prepare('SELECT * FROM feedback WHERE owner=? AND fingerprint=?')
        .bind(owner, fingerprint)
        .first<any>();
      if (f && f.raw !== String(record.raw).trim())
        throw new AppError(
          '同来源ID的正文已变化，请核对原声后再导入，已有审核未覆盖',
        );
      if (f) {
        const old = await db()
          .prepare(
            'SELECT raw_json FROM voice_screenings WHERE owner=? AND feedback_id=?',
          )
          .bind(owner, f.id)
          .first<any>();
        const oldRaw = parseObject(old?.raw_json, []);
        if (
          oldRaw.length === 26 &&
          [1, 2, 15, 16].some(
            (i) => String(oldRaw[i] || '') !== String(raw[i] || ''),
          ) &&
          (await db()
            .prepare(
              "SELECT 1 ok FROM voice_labels WHERE owner=? AND feedback_id=? AND review_status<>'待审核' LIMIT 1",
            )
            .bind(owner, f.id)
            .first())
        )
          throw new AppError(
            '已审核原声的正文或上下文发生变化，请核对新版本，已有审核未覆盖',
          );
      }
      let created = false;
      if (!f) {
        const result = await create(
          { ...emptyRecord(), ...record },
          owner,
          actor,
          '导入原声打标表',
        );
        f = await db()
          .prepare('SELECT * FROM feedback WHERE owner=? AND fingerprint=?')
          .bind(owner, fingerprint)
          .first<any>();
        created = !result.duplicate;
      }
      const time = currentTime();
      const statements = [
        db()
          .prepare(`INSERT INTO voice_screenings(id,owner,feedback_id,voice_id,raw_json,ai_json,final_json,relevance,demandness,confidence,catalog_version,rule_version,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,feedback_id) DO UPDATE SET voice_id=excluded.voice_id,raw_json=excluded.raw_json,ai_json=excluded.ai_json,final_json=excluded.final_json,relevance=excluded.relevance,demandness=excluded.demandness,confidence=excluded.confidence,catalog_version=excluded.catalog_version,rule_version=excluded.rule_version,revision=voice_screenings.revision+1,updated_at=excluded.updated_at WHERE voice_screenings.review_status='待审核'`)
          .bind(
            `screen:${f.id}`,
            owner,
            f.id,
            String(raw[20]),
            JSON.stringify(raw),
            JSON.stringify(ai),
            JSON.stringify({ relevance, demandness }),
            relevance,
            demandness,
            relConfidence,
            String(ai['字典版本'] || ''),
            String(ai['规则版本'] || ''),
            time,
            time,
          ),
      ];
      let protectedLabels = 0;
      for (const l of normalized) {
        let labelId = await hash(JSON.stringify([owner, f.id, l.intent_id]));
        if (l.final['诉求ID']) {
          const same = await db()
            .prepare(
              "SELECT * FROM voice_labels WHERE owner=? AND feedback_id=? AND json_extract(final_json,'$.诉求ID')=? AND intent_id<>? LIMIT 1",
            )
            .bind(owner, f.id, l.final['诉求ID'], l.intent_id)
            .first<any>();
          if (same) {
            if (same.review_status !== '待审核') {
              protectedLabels++;
              continue;
            }
            if (same.intent_id === 'legacy') {
              labelId = same.id;
              statements.push(
                db()
                  .prepare(
                    "UPDATE voice_labels SET intent_id=? WHERE id=? AND owner=? AND review_status='待审核'",
                  )
                  .bind(l.intent_id, same.id, owner),
              );
            } else
              throw new AppError(
                '同一诉求的拆分编号已变化，请核对对应片段后重新导入，已有标签保持不变',
              );
          }
        }
        statements.push(
          db()
            .prepare(`INSERT INTO voice_labels(id,owner,feedback_id,intent_id,fragment,ai_json,final_json,source,confidence,text_score,catalog_version,rule_version,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,feedback_id,intent_id) DO UPDATE SET fragment=excluded.fragment,ai_json=excluded.ai_json,final_json=excluded.final_json,source=excluded.source,confidence=excluded.confidence,text_score=excluded.text_score,catalog_version=excluded.catalog_version,rule_version=excluded.rule_version,revision=voice_labels.revision+1,updated_at=excluded.updated_at WHERE voice_labels.review_status='待审核'`)
            .bind(
              labelId,
              owner,
              f.id,
              l.intent_id,
              String(l.fragment || ''),
              JSON.stringify(l.ai),
              JSON.stringify(l.final),
              l.confidence === null ? '文字候选' : 'AI语义打标',
              l.confidence,
              validScore(l.ai['文字匹配分']) ? l.ai['文字匹配分'] : null,
              String(l.ai['字典版本'] || ai['字典版本'] || ''),
              String(l.ai['规则版本'] || ai['规则版本'] || ''),
              time,
              time,
            ),
        );
      }
      // Reviewed rows are deliberately protected by the upsert predicate.
      await db().batch(statements);
      results.push({
        voice_id: raw[20],
        feedback_id: f.id,
        created,
        labels: normalized.length,
        protected_labels: protectedLabels,
      });
    } catch (e) {
      results.push({
        voice_id: item.raw?.[20],
        error: e instanceof AppError ? e.message : '该条导入失败，请重试',
      });
    }
  }
  return { results };
}
async function ensureNoDuplicate(
  owner: string,
  feedbackId: string,
  demandId: string,
  exceptId = '',
) {
  if (!demandId) return;
  const duplicate = await db()
    .prepare(
      `SELECT id FROM voice_labels WHERE owner=? AND feedback_id=? AND id<>? AND json_extract(final_json,'$.诉求ID')=? AND json_extract(final_json,'$.匹配状态')='匹配已有诉求' LIMIT 1`,
    )
    .bind(owner, feedbackId, exceptId, demandId)
    .first();
  if (duplicate) throw new AppError('该原声已关联此标准诉求，请合并同义表达');
}
export async function addLabel(body: any, owner: string, actor: string) {
  const f = await getVoice(String(body.feedback_id), owner);
  const fragment = String(body.fragment || '').trim();
  if (!fragment || fragment.length > 3000)
    throw new AppError('请填写该独立诉求的原文片段（最多3000字）');
  if (!f.raw.includes(fragment))
    throw new AppError('片段必须逐字出自当前作者的原声');
  const value = await canonicalLabel(body.value || {}, owner);
  await ensureNoDuplicate(owner, f.id, value['诉求ID']);
  const id = crypto.randomUUID(),
    time = currentTime();
  const ai = Object.fromEntries(
    Object.entries(value).map(([k, v]) => ['AI' + k, v]),
  );
  await db()
    .prepare(
      `INSERT INTO voice_labels(id,owner,feedback_id,intent_id,fragment,ai_json,final_json,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      owner,
      f.id,
      'manual:' + id,
      fragment,
      JSON.stringify(ai),
      JSON.stringify(value),
      '人工',
      time,
      time,
    )
    .run();
  return { id };
}
async function commitLabel(b: any, owner: string, actor: string, verification: any) {
  const before = await db()
    .prepare('SELECT * FROM voice_labels WHERE id=? AND owner=?')
    .bind(String(b.id), owner)
    .first<any>();
  if (!before) throw new AppError('诉求标签不存在', 404);
  if (before.revision !== Number(b.revision))
    throw new AppError('此标签已被修改，请刷新后重试', 409);
  const value = await canonicalLabel(b.value || {}, owner);
  await ensureNoDuplicate(
    owner,
    before.feedback_id,
    value['诉求ID'],
    before.id,
  );
  const reviewer = String(b.reviewer || '').trim(),
    note = String(b.note || '').trim();
  if (!reviewer || reviewer.length > 150 || note.length > 3000)
    throw new AppError('请填写审核人，备注最多3000字');
  const ai = parseObject(before.ai_json);
  const initial = aiFinal(ai);
  const changed = JSON.stringify(initial) !== JSON.stringify(value);
  const state = changed ? '修改' : '确认';
  if (
    before.review_status === state &&
    before.final_json === JSON.stringify(value) &&
    before.reviewer === reviewer &&
    before.note === note
  )
    return {
      id: before.id,
      review_status: state,
      learned: true,
      duplicate: true,
    };
  const f = await getVoice(before.feedback_id, owner);
  const raw = await rawForFeedback(f);
  const time = currentTime();
  const eid = crypto.randomUUID();
  const payload = {
    action: 'review',
    verification,
    event_id: eid,
    key: '诉求打标:' + raw[20] + '#' + before.intent_id,
    voice_id: raw[20],
    body: raw[1] || '',
    title: raw[2] || '',
    post_context: raw[15] || '',
    reply_context: raw[16] || '',
    intent: before.fragment,
    before: initial,
    after: value,
    reviewer,
    actor,
    note,
    changed,
    run_id: 'peo-site',
    catalog_version: before.catalog_version,
    reviewed_label_hash: await hash(JSON.stringify(value)),
    reviewed_at: time,
  };
  const results = await db().batch([
    db()
      .prepare(
        "UPDATE voice_labels SET final_json=?,review_status=?,reviewer=?,note=?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND revision=? AND EXISTS(SELECT 1 FROM voice_review_queue WHERE id=? AND owner=? AND status='待Codex核对')",
      )
      .bind(
        JSON.stringify(value),
        state,
        reviewer,
        note,
        time,
        before.id,
        owner,
        before.revision,
        verification.queue_id,
        owner,
      ),
    db()
      .prepare(
        'INSERT INTO voice_label_events(id,owner,feedback_id,label_id,scope,payload_json,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',
      )
      .bind(
        eid,
        owner,
        f.id,
        before.id,
        'label',
        JSON.stringify(payload),
        time,
      ),
    finishVerification(verification, owner, eid, time),
  ]);
  if (!results[0].meta.changes)
    throw new AppError('此标签已被修改，请刷新后重试', 409);
  return { id: before.id, review_status: state, learned: true };
}
async function commitScreen(b: any, owner: string, actor: string, verification: any) {
  const s = await db()
    .prepare('SELECT * FROM voice_screenings WHERE feedback_id=? AND owner=?')
    .bind(String(b.feedback_id), owner)
    .first<any>();
  if (!s) throw new AppError('筛选记录不存在', 404);
  if (s.revision !== Number(b.revision))
    throw new AppError('筛选记录已变化，请刷新后重试', 409);
  const relevance = String(b.relevance || ''),
    demandness = String(b.demandness || ''),
    reviewer = String(b.reviewer || '').trim();
  if (
    !relevanceStates.includes(relevance) ||
    !['有诉求', '无诉求', '待确认'].includes(demandness) ||
    !reviewer ||
    reviewer.length > 150 ||
    (relevance === '不相关' && demandness === '有诉求')
  )
    throw new AppError('请核对相关性、诉求性并填写审核人');
  if (
    relevance !== '不相关' &&
    demandness === '无诉求' &&
    (await db()
      .prepare(
        "SELECT 1 ok FROM voice_labels WHERE owner=? AND feedback_id=? AND json_extract(final_json,'$.匹配状态') NOT IN ('不匹配','无诉求') LIMIT 1",
      )
      .bind(owner, s.feedback_id)
      .first())
  )
    throw new AppError(
      '此原声仍有独立诉求标签，请先逐条审核或拒绝这些标签，再确认无诉求',
    );
  const ai = parseObject(s.ai_json);
  const initial = {
      relevance: ai['AI相关性'] || '待确认',
      demandness: ai['AI诉求性'] || '待确认',
    },
    after = { relevance, demandness };
  const state =
    JSON.stringify(initial) === JSON.stringify(after) ? '确认' : '修改';
  const time = currentTime(),
    eid = crypto.randomUUID();
  const f = await getVoice(s.feedback_id, owner),
    raw = await rawForFeedback(f);
  const note = String(b.note || '').slice(0, 3000);
  if (
    s.review_status === state &&
    s.final_json === JSON.stringify(after) &&
    s.reviewer === reviewer &&
    s.note === note
  )
    return { review_status: state, duplicate: true };
  const payload = {
    action: 'review',
    verification,
    event_id: eid,
    key: '原声筛选:' + raw[20],
    voice_id: raw[20],
    body: raw[1] || '',
    title: raw[2] || '',
    post_context: raw[15] || '',
    reply_context: raw[16] || '',
    intent: '',
    before: initial,
    after,
    reviewer,
    actor,
    note,
    changed: state === '修改',
    run_id: 'peo-site',
    catalog_version: s.catalog_version,
    reviewed_at: time,
  };
  const result = await db().batch([
    db()
      .prepare(
        "UPDATE voice_screenings SET final_json=?,relevance=?,demandness=?,review_status=?,reviewer=?,note=?,revision=revision+1,updated_at=? WHERE feedback_id=? AND owner=? AND revision=? AND EXISTS(SELECT 1 FROM voice_review_queue WHERE id=? AND owner=? AND status='待Codex核对')",
      )
      .bind(
        JSON.stringify(after),
        relevance,
        demandness,
        state,
        reviewer,
        note,
        time,
        s.feedback_id,
        owner,
        s.revision,
        verification.queue_id,
        owner,
      ),
    db()
      .prepare(
        'INSERT INTO voice_label_events(id,owner,feedback_id,scope,payload_json,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',
      )
      .bind(eid, owner, f.id, 'screen', JSON.stringify(payload), time),
    finishVerification(verification, owner, eid, time),
  ]);
  if (!result[0].meta.changes)
    throw new AppError('筛选记录已变化，请刷新后重试', 409);
  return {
    review_status: state,
    excluded: excludedScreen({
      ...after,
      confidence: s.confidence,
      review_status: state,
    }),
  };
}

// Reconcile human Excel edits with trusted snapshots already stored on the site.
export async function importReviews(
  records: any[],
  owner: string,
  actor: string,
) {
  if (!Array.isArray(records) || records.length > 10)
    throw new AppError('每批最多回写10条原声的审核');
  const results = [];
  for (const item of records) {
    let applied = 0;
    try {
      const pending = [];
      const raw = item.raw;
      if (!Array.isArray(raw) || raw.length !== 26)
        throw new AppError('审核文件缺少原26列');
      const s = await db()
        .prepare('SELECT * FROM voice_screenings WHERE owner=? AND voice_id=?')
        .bind(owner, String(raw[20]))
        .first<any>();
      const reviewed = (r: any) => ['确认', '修改'].includes(r?.state);
      if (
        !reviewed(item.review) &&
        !(item.labels || []).some((l: any) => reviewed(l.review))
      ) {
        results.push({ voice_id: raw[20], skipped: true, applied: 0 });
        continue;
      }
      if (!s)
        throw new AppError('网站没有此原声的审核基线，请先导入原声与AI候选');
      const f = await getVoice(s.feedback_id, owner),
        baseline = await rawForFeedback(f);
      for (let i = 0; i < 26; i++) {
        if ([5, 7].includes(i) && raw[i] && baseline[i]) {
          const wall = (v: any) =>
            Date.parse(
              String(v)
                .replace(' ', 'T')
                .replace(/(?:Z|[+-]\d\d:\d\d)$/, '') + 'Z',
            );
          if (wall(raw[i]) !== wall(baseline[i]))
            throw new AppError('原声时间已改变，未学习该条审核');
        } else if ((raw[i] ?? '') !== (baseline[i] ?? ''))
          throw new AppError('原声或上下文被修改，未学习该条审核');
      }
      const check = (stored: any, incoming: any, r: any) => {
        if (
          r.revision !== undefined &&
          r.revision !== null &&
          r.revision !== '' &&
          Number(r.revision) !== stored.revision
        )
          throw new AppError('网站审核版本已更新，请重新导出后审核', 409);
        if (
          (r.revision === undefined ||
            r.revision === null ||
            r.revision === '') &&
          stored.review_status !== '待审核'
        )
          throw new AppError('已审核记录缺少版本号，请从网站重新导出');
        const ai = parseObject(stored.ai_json);
        for (const k of Object.keys(ai))
          if (
            !k.startsWith('人工') &&
            !['审核状态', '审核人', '审核备注'].includes(k) &&
            (ai[k] ?? '') !== (incoming[k] ?? '')
          )
            throw new AppError('AI快照被修改，未学习该条审核');
        if (!String(r.reviewer || '').trim())
          throw new AppError('请填写审核人');
      };
      const seen = new Set();
      for (const l of item.labels || []) {
        if (!reviewed(l.review)) continue;
        if (seen.has(l.intent_id)) throw new AppError('标签审核行重复');
        seen.add(l.intent_id);
        const stored = await db()
          .prepare(
            'SELECT * FROM voice_labels WHERE owner=? AND feedback_id=? AND intent_id=?',
          )
          .bind(owner, f.id, String(l.intent_id))
          .first<any>();
        if (!stored)
          throw new AppError('网站没有此拆分诉求的基线，不能按行序猜测关联');
        check(stored, l.ai, l.review);
        if (l.fragment !== stored.fragment)
          throw new AppError('诉求片段被修改，请在网页重新拆分后审核');
        const initial = aiFinal(parseObject(stored.ai_json));
        const fields = l.review.fields || {};
        const value = { ...initial };
        for (const [k, v] of Object.entries(fields))
          if (v !== '' && v !== null && v !== undefined) value[k] = v;
        if (fields['诉求ID'] && !fields['匹配状态'])
          value['匹配状态'] = '匹配已有诉求';
        const final = await canonicalLabel(value, owner);
        for (const [k, v] of Object.entries(fields))
          if (
            !(
              ['无诉求', '不匹配'].includes(final['匹配状态']) &&
              k !== '匹配状态'
            ) &&
            v !== '' &&
            v !== null &&
            v !== undefined &&
            String(v) !== String(final[k] ?? '')
          )
            throw new AppError('人工四维或匹配状态与诉求ID冲突');
        if (
          l.review.state === '确认' &&
          JSON.stringify(initial) !== JSON.stringify(final)
        )
          throw new AppError('存在更正时，请将审核状态设为修改');
        pending.push({
          action: 'label',
          id: stored.id,
          revision: stored.revision,
          value: final,
          reviewer: l.review.reviewer,
          note: l.review.note,
        });
      }
      if (reviewed(item.review)) {
        check(s, item.ai, item.review);
        const fields = item.review.fields || {},
          ai = parseObject(s.ai_json);
        const relevance = fields['相关性'] || ai['AI相关性'] || '待确认',
          demandness = fields['诉求性'] || ai['AI诉求性'] || '待确认';
        if (
          item.review.state === '确认' &&
          (relevance !== (ai['AI相关性'] || '待确认') ||
            demandness !== (ai['AI诉求性'] || '待确认'))
        )
          throw new AppError('存在筛选更正时，请将审核状态设为修改');
        pending.push({
          action: 'screen',
          feedback_id: f.id,
          revision: s.revision,
          relevance,
          demandness,
          reviewer: item.review.reviewer,
          note: item.review.note,
        });
      }
      for (const action of pending) {
        if (action.action === 'label') await reviewLabel(action, owner, actor);
        else await reviewScreen(action, owner, actor);
        applied++;
      }
      results.push({ voice_id: raw[20], applied });
    } catch (e) {
      results.push({
        voice_id: item.raw?.[20],
        applied,
        error: e instanceof AppError ? e.message : '审核回写失败，请核对后重试',
      });
    }
  }
  return { results };
}


function finishVerification(v: any, owner: string, eventId: string, time: string) {
  return db().prepare(`UPDATE voice_review_queue SET status='核对通过',verification_reason=?,checked_at=?,event_id=? WHERE id=? AND owner=? AND status='待Codex核对' AND EXISTS(SELECT 1 FROM voice_label_events WHERE id=? AND owner=?)`)
    .bind(v.reason,time,eventId,v.queue_id,owner,eventId,owner);
}
async function reviewBaseline(scope: string, body: any, owner: string) {
  const row = scope === 'label'
    ? await db().prepare('SELECT * FROM voice_labels WHERE id=? AND owner=?').bind(String(body.id),owner).first<any>()
    : await db().prepare('SELECT * FROM voice_screenings WHERE feedback_id=? AND owner=?').bind(String(body.feedback_id),owner).first<any>();
  if (!row) throw new AppError('审核基线不存在',404);
  if (row.revision !== Number(body.revision)) throw new AppError('审核版本已变化，请刷新后重新提交',409);
  const f = await getVoice(row.feedback_id,owner), raw = await rawForFeedback(f);
  const reviewer=String(body.reviewer||'').trim(),note=String(body.note||'').trim();
  if(!reviewer || reviewer.length>150 || note.length>3000) throw new AppError('请填写审核人，备注最多3000字');
  let proposal:any;
  if(scope==='label') {
    const value=await canonicalLabel(body.value||{},owner);
    await ensureNoDuplicate(owner,row.feedback_id,value['诉求ID'],row.id);
    proposal={id:row.id,revision:row.revision,value,reviewer,note};
  } else {
    const relevance=String(body.relevance||''),demandness=String(body.demandness||'');
    if(!relevanceStates.includes(relevance)||!['有诉求','无诉求','待确认'].includes(demandness)||(relevance==='不相关'&&demandness==='有诉求')) throw new AppError('请核对相关性与诉求性');
    proposal={feedback_id:row.feedback_id,revision:row.revision,relevance,demandness,reviewer,note};
  }
  const snapshot={raw,ai:parseObject(row.ai_json),final:parseObject(row.final_json),revision:row.revision,fragment:row.fragment||'',intent_id:row.intent_id||'',catalog_version:row.catalog_version,rule_version:row.rule_version};
  return {row,proposal,snapshot,snapshot_hash:await hash(JSON.stringify({snapshot,proposal}))};
}
async function queueReview(scope:string,body:any,owner:string,actor:string) {
  const b=await reviewBaseline(scope,body,owner),target=scope==='label'?b.row.id:b.row.feedback_id;
  const old=await db().prepare("SELECT * FROM voice_review_queue WHERE owner=? AND scope=? AND target_id=? AND status IN ('草稿','待Codex核对') ORDER BY created_at DESC LIMIT 1").bind(owner,scope,target).first<any>();
  if(old?.snapshot_hash===b.snapshot_hash) return {queue_id:old.id,review_status:old.status,duplicate:true,learned:false};
  const id=crypto.randomUUID(),time=currentTime();
  await db().batch([
    db().prepare("UPDATE voice_review_queue SET status='已替换',checked_at=? WHERE owner=? AND scope=? AND target_id=? AND status IN ('草稿','待Codex核对','待人工处理')").bind(time,owner,scope,target),
    db().prepare("INSERT INTO voice_review_queue(id,owner,feedback_id,target_id,scope,proposal_json,snapshot_json,snapshot_hash,actor,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,'草稿')").bind(id,owner,b.row.feedback_id,target,scope,JSON.stringify(b.proposal),JSON.stringify(b.snapshot),b.snapshot_hash,actor,time),
  ]);
  return {queue_id:id,review_status:'草稿',learned:false};
}
// Freeze all explicitly reviewed drafts, across pages and filters, as one submission.
export async function submitReviewDrafts(owner:string,actor:string) {
  const drafts=(await db().prepare("SELECT * FROM voice_review_queue WHERE owner=? AND status='草稿' ORDER BY created_at,id").bind(owner).all<any>()).results;
  if(!drafts.length) return {submitted:0};
  for(const q of drafts) {
    try {
      const current=await reviewBaseline(q.scope,parseObject(q.proposal_json),owner);
      if(current.snapshot_hash!==q.snapshot_hash) throw new AppError('原声、AI快照或字典已变化');
    } catch(e) {throw new AppError('有审核草稿的基线已变化，本次尚未提交。请在审核记录中重新保存该项：'+String(parseObject(q.snapshot_json).fragment||parseObject(q.snapshot_json).raw?.[1]||'该原声').slice(0,60)+'；'+(e instanceof AppError?e.message:'请刷新核对'),409);}
  }
  // A single conditional UPDATE submits exactly the checked draft set atomically.
  // If a second browser edits any draft during validation, nothing is submitted.
  const token=await hash(JSON.stringify(drafts.map(q=>q.id+':'+q.snapshot_hash).sort()));
  const ids=JSON.stringify(drafts.map(q=>q.id));
  const result=await db().prepare(`UPDATE voice_review_queue SET status='待Codex核对',checked_at='',verification_reason='' WHERE owner=? AND status='草稿' AND id IN (SELECT value FROM json_each(?)) AND (SELECT COUNT(*) FROM voice_review_queue WHERE owner=? AND status='草稿' AND id IN (SELECT value FROM json_each(?)))=?`).bind(owner,ids,owner,ids,drafts.length).run();
  if(!result.meta.changes) throw new AppError('审核草稿已在另一窗口修改，本次未提交，请刷新后重试',409);
  return {submitted:result.meta.changes,submission:token};
}
export const reviewLabel=(b:any,owner:string,actor:string)=>queueReview('label',b,owner,actor);
export const reviewScreen=(b:any,owner:string,actor:string)=>queueReview('screen',b,owner,actor);
export async function verificationQueue(owner:string,pendingOnly=false) {
  const r=await db().prepare(`SELECT * FROM voice_review_queue WHERE owner=? ${pendingOnly?"AND status='待Codex核对'":''} ORDER BY created_at DESC,id DESC LIMIT 100`).bind(owner).all<any>();
  return r.results.map(q=>({...q,proposal:parseObject(q.proposal_json),snapshot:parseObject(q.snapshot_json)}));
}
export async function resolveVerification(b:any,owner:string,actor:string) {
  const q=await db().prepare('SELECT * FROM voice_review_queue WHERE id=? AND owner=?').bind(String(b.queue_id),owner).first<any>();
  if(!q) throw new AppError('核对任务不存在',404);
  if(q.status!=='待Codex核对') throw new AppError('核对任务已处理，请刷新',409);
  if(b.snapshot_hash!==q.snapshot_hash) throw new AppError('核对快照不一致',409);
  const reason=String(b.reason||'').trim();
  if(reason.length<10||reason.length>4000||!['通过','需人工处理'].includes(b.decision)) throw new AppError('请提供Codex逐项核对结论与理由（10–4000字）');
  const proposal=parseObject(q.proposal_json);
  let issue='';
  try {
    const current=await reviewBaseline(q.scope,proposal,owner);
    if(current.snapshot_hash!==q.snapshot_hash) issue='原声、上下文、AI快照、审核版本或诉求字典已变化，请重新核对并提交。';
  } catch(e) {issue=e instanceof AppError?e.message:'无法核对当前基线';}
  if(issue||b.decision==='需人工处理') {
    await db().prepare("UPDATE voice_review_queue SET status='待人工处理',verification_reason=?,checked_at=? WHERE id=? AND owner=? AND status='待Codex核对'").bind(issue||reason,currentTime(),q.id,owner).run();
    return {status:'待人工处理',reason:issue||reason,learned:false};
  }
  const verification={queue_id:q.id,snapshot_hash:q.snapshot_hash,reason,verified_by:'Codex',checked_at:currentTime()};
  try {
    const result=q.scope==='label'?await commitLabel(proposal,owner,q.actor,verification):await commitScreen(proposal,owner,q.actor,verification);
    if(result.duplicate) await db().prepare("UPDATE voice_review_queue SET status='核对通过',verification_reason=?,checked_at=? WHERE id=? AND owner=? AND status='待Codex核对'").bind(reason,currentTime(),q.id,owner).run();
    return {...result,status:'核对通过'};
  } catch(e) {
    if(!(e instanceof AppError)) throw e;
    await db().prepare("UPDATE voice_review_queue SET status='待人工处理',verification_reason=?,checked_at=? WHERE id=? AND owner=? AND status='待Codex核对'").bind(e.message,currentTime(),q.id,owner).run();
    return {status:'待人工处理',reason:e.message,learned:false};
  }
}
