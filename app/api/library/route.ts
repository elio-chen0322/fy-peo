import {
  AppError,
  db,
  identity,
  response,
  failure,
  json,
  seed,
  joined,
  where,
  create,
  edit,
  scoreFeedbackDemand,
  hash,
  resolveLabels,
} from '@/lib/server';
import { emptyRecord } from '@/lib/catalog';
async function loadImportLabels(owner: string) {
  const [features, themes, demands] = await Promise.all([
    db().prepare('SELECT * FROM features WHERE owner=?').bind(owner).all<any>(),
    db().prepare('SELECT * FROM themes WHERE owner=? AND active=1').bind(owner).all<any>(),
    db().prepare('SELECT * FROM demands WHERE owner=?').bind(owner).all<any>(),
  ]);
  return { features: features.results, themes: themes.results, demands: demands.results };
}
function suggestImportLabels(record: any, labels: Awaited<ReturnType<typeof loadImportLabels>>) {
  const raw = String(record.raw || '').toLocaleLowerCase();
  const context = String(record.analysis_context || '').toLocaleLowerCase();
  const matchingText = `${raw}\n${context}`;
  const feature = [...labels.features]
    .filter((item) => item.name.length > 1 && matchingText.includes(item.name.toLocaleLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const matches = labels.themes.flatMap((theme) =>
    String(theme.keywords || '')
      .split(/[，,、\n]/)
      .map((word: string) => word.trim())
      .filter((word: string) => word.length > 1 && matchingText.includes(word.toLocaleLowerCase()))
      .map((word: string) => ({ theme, word })),
  ).sort((a: any, b: any) => b.word.length - a.word.length);
  const match = matches[0];
  const demand = [...labels.demands]
    .filter((item) => item.name.length > 1 && matchingText.includes(item.name.toLocaleLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const proposedFeature = feature || (match?.theme.feature_id
    ? labels.features.find((item) => item.id === match.theme.feature_id)
    : undefined);
  return {
    ...record,
    ...(record.feature_id || !proposedFeature ? {} : { feature_id: proposedFeature.id }),
    ...(!record.request_candidate_id && demand ? {
      request_candidate_id: demand.id,
      request_candidate_score: raw.includes(demand.name.toLocaleLowerCase()) ? 90 : 72,
      request_match_score: raw.includes(demand.name.toLocaleLowerCase()) ? 90 : 72,
      request_match_status: '待确认',
      request_candidate_reason: raw.includes(demand.name.toLocaleLowerCase())
        ? '原声正文包含诉求名称；仅为待确认候选'
        : '帖子/楼中上下文包含诉求名称；仅为待确认候选',
    } : {}),
    ...(record.theme_id || !match ? {} : {
      theme_id: match.theme.id,
      theme_confidence: 0,
      theme_reason: `原声命中主题关键词“${match.word}”`,
    }),
  };
}
async function refreshCrawlerSnapshot(record: any, owner: string, actor: string) {
  const source = String(record.source || '小红书');
  const sourceType = String(record.source_type || '其他');
  const externalId = String(record.external_id || '').trim();
  if (source !== '小红书' || !externalId || !record.captured_at || !('post_id' in record))
    return null;
  const fingerprint = await hash(JSON.stringify([source, sourceType, externalId]));
  const before = await db()
    .prepare('SELECT * FROM feedback WHERE owner=? AND fingerprint=?')
    .bind(owner, fingerprint)
    .first<any>();
  if (!before) return null;
  if (before.captured_at && record.captured_at < before.captured_at)
    return { duplicate: true };
  const fields = [
    'post_id', 'parent_comment_id', 'crawl_keyword', 'captured_at',
    'published_at', 'url', 'city', 'like_count', 'comment_count',
    'collect_count', 'share_count', 'reply_count',
  ];
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field in record) || record[field] === undefined) continue;
    if (['like_count', 'comment_count', 'collect_count', 'share_count', 'reply_count'].includes(field) && record[field] === null)
      continue;
    if (String(before[field] ?? '') !== String(record[field] ?? '')) patch[field] = record[field];
  }
  if (!Object.keys(patch).length) return { duplicate: true };
  await edit(before.id, before.revision, patch, owner, actor, '刷新 MediaCrawler 采集快照');
  return { refreshed: true };
}
export async function GET(req: Request) {
  try {
    const { owner } = await identity(req);
    const p = new URL(req.url).searchParams;
    await seed(owner);
    const mode = p.get('mode');
    if (mode === 'meta') {
      const [features, demands, themes, stats, values] = await Promise.all([
        db()
          .prepare(
            'SELECT t.*, (SELECT COUNT(*) FROM feedback f WHERE f.feature_id=t.id AND f.owner=t.owner AND f.archived=0) count FROM features t WHERE t.owner=? ORDER BY parent,name',
          )
          .bind(owner)
          .all(),
        db()
          .prepare(
            'SELECT d.*, (SELECT COUNT(*) FROM feedback f WHERE f.request_id=d.id AND f.owner=d.owner AND f.archived=0) count FROM demands d WHERE d.owner=? ORDER BY name',
          )
          .bind(owner)
          .all(),
        db()
          .prepare(
            'SELECT t.*, (SELECT COUNT(*) FROM feedback f WHERE f.theme_id=t.id AND f.owner=t.owner AND f.archived=0) count FROM themes t WHERE t.owner=? ORDER BY active DESC,name',
          )
          .bind(owner)
          .all(),
        db()
          .prepare(
            "SELECT COUNT(*) total,COALESCE(SUM(status='待审核'),0) pending,COALESCE(SUM(status='已确认'),0) confirmed FROM feedback WHERE owner=? AND archived=0",
          )
          .bind(owner)
          .first(),
        db()
          .prepare(
            'SELECT DISTINCT version,city,source FROM feedback WHERE owner=? AND archived=0 LIMIT 10000',
          )
          .bind(owner)
          .all(),
      ]);
      return response({
        features: features.results,
        demands: demands.results,
        themes: themes.results,
        stats,
        values: values.results,
      });
    }
    if (mode === 'detail') {
      const id = p.get('id') || '';
      const row = await db()
        .prepare(joined + ' WHERE f.id=? AND f.owner=?')
        .bind(id, owner)
        .first();
      if (!row) throw new AppError('反馈不存在', 404);
      const files = await db()
        .prepare(
          'SELECT id,name,mime,size,created_at FROM files WHERE feedback_id=? AND owner=? ORDER BY created_at',
        )
        .bind(id, owner)
        .all();
      const history = await db()
        .prepare(
          'SELECT * FROM events WHERE feedback_id=? AND owner=? ORDER BY created_at DESC LIMIT 50',
        )
        .bind(id, owner)
        .all();
      return response({ row, files: files.results, history: history.results });
    }
    if (mode === 'history') {
      const offset = Math.max(0, Number(p.get('offset')) || 0);
      const rows = await db()
        .prepare(
          'SELECT * FROM events WHERE owner=? ORDER BY created_at DESC LIMIT 50 OFFSET ?',
        )
        .bind(owner, offset)
        .all();
      return response({ rows: rows.results });
    }
    const w = where(p, owner),
      offset = Math.max(0, Math.min(1e7, Number(p.get('offset')) || 0));
    const limit = Math.max(1, Math.min(500, Number(p.get('limit')) || 30));
    const order =
      p.get('sort') === 'association'
        ? "CASE WHEN (f.request_id<>'' OR f.request_candidate_id<>'') AND f.request_match_status<>'已确认' THEN 0 WHEN f.request_id<>'' THEN 1 WHEN f.request_candidate_id<>'' THEN 2 ELSE 3 END ASC,f.request_match_score DESC,f.published_at DESC,f.id DESC"
        : p.get('sort') === 'oldest'
        ? 'f.published_at ASC,f.id ASC'
        : p.get('sort') === 'updated'
          ? 'f.updated_at DESC,f.id DESC'
          : 'f.published_at DESC,f.id DESC';
    const [rows, count] = await Promise.all([
      db()
        .prepare(
          joined +
            ' WHERE ' +
            w.sql +
            ' ORDER BY ' +
            order +
            ' LIMIT ? OFFSET ?',
        )
        .bind(...w.args, limit, offset)
        .all(),
      db()
        .prepare(
          'SELECT COUNT(*) n FROM feedback f LEFT JOIN demands d ON d.id=f.request_id AND d.owner=f.owner LEFT JOIN features t ON t.id=f.feature_id AND t.owner=f.owner WHERE ' +
            w.sql,
        )
        .bind(...w.args)
        .first<{ n: number }>(),
    ]);
    return response({ rows: rows.results, total: count?.n || 0 });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { owner, actor } = await identity(req);
    const b = await json(req);
    await seed(owner);
    if (b.action === 'create')
      return response(
        await create({ ...emptyRecord(), ...b.record }, owner, actor),
      );
    if (b.action === 'edit') {
      const patch = await resolveLabels(b.patch, owner);
      return response(
        await edit(String(b.id), Number(b.revision), patch, owner, actor),
      );
    }
    if (b.action === 'match') {
      const id = String(b.id || '');
      const revision = Number(b.revision);
      const demandId = String(b.demand_id || '');
      const score = demandId ? await scoreFeedbackDemand(id, demandId, owner) : 0;
      const confirming = b.confirm === true;
      const patch = demandId
        ? confirming
          ? {
              request_id: demandId,
              request_candidate_id: '',
              request_candidate_score: 0,
              request_candidate_reason: '',
              request_match_score: score,
              request_match_status: '已确认',
            }
          : {
              request_id: '',
              request_candidate_id: demandId,
              request_candidate_score: score,
              request_candidate_reason: `规则匹配分 ${score}/100；等待人工确认`,
              request_match_score: score,
              request_match_status: '待确认',
            }
        : {
            request_id: '',
            request_candidate_id: '',
            request_candidate_score: 0,
            request_candidate_reason: '',
            request_match_score: 0,
            request_match_status: '未匹配',
          };
      return response(
        await edit(id, revision, patch, owner, actor, confirming ? '人工确认诉求匹配' : '编辑诉求候选', true),
      );
    }
    if (b.action === 'import') {
      if (!Array.isArray(b.records) || b.records.length > 25)
        throw new AppError('每批最多 25 条');
      const labels = await loadImportLabels(owner);
      const results = [];
      for (const [index, r] of b.records.entries()) {
        try {
          if (
            r.id &&
            (await db()
              .prepare('SELECT id FROM feedback WHERE id=? AND owner=?')
              .bind(String(r.id), owner)
              .first())
          ) {
            results.push({ index, duplicate: true });
            continue;
          }
          const refreshed = await refreshCrawlerSnapshot(r, owner, actor);
          if (refreshed) {
            results.push({ index, ...refreshed });
            continue;
          }
          results.push({
            index,
            ...(await create(
              suggestImportLabels({
                ...emptyRecord(),
                ...r,
                id: undefined,
                request_id: '',
                feature_id: '',
              }, labels),
              owner,
              actor,
              'Excel 导入',
            )),
          });
        } catch (e) {
          results.push({
            index,
            error: e instanceof AppError ? e.message : '本条导入失败，请重试',
          });
        }
      }
      return response({ results });
    }
    if (b.action === 'bulk') {
      if (
        !Array.isArray(b.records) ||
        !b.records.length ||
        b.records.length > 50
      )
        throw new AppError('每次请选择 1–50 条反馈');
      const patch = Object.fromEntries(
        Object.entries(b.patch || {}).filter(([k]) =>
          [
            'request_id',
            'request_candidate_id',
            'request_candidate_score',
            'request_candidate_reason',
            'feature_id',
            'kind',
            'status',
            'archived',
          ].includes(
            k,
          ),
        ),
      );
      if (!Object.keys(patch).length) throw new AppError('请设置要修改的字段');
      const results = [];
      for (const r of b.records) {
        try {
          results.push(
            await edit(
              String(r.id),
              Number(r.revision),
              patch,
              owner,
              actor,
              '批量修改',
            ),
          );
        } catch (e) {
          results.push({
            id: r.id,
            error: e instanceof Error ? e.message : '修改失败',
          });
        }
      }
      return response({ results });
    }
    if (b.action === 'undo') {
      const e = await db()
        .prepare('SELECT * FROM events WHERE id=? AND owner=?')
        .bind(String(b.event_id), owner)
        .first<any>();
      if (!e?.feedback_id || !e.after_revision)
        throw new AppError('此记录不可撤销');
      const before = JSON.parse(e.before_json);
      return response(
        await edit(
          e.feedback_id,
          e.after_revision,
          Object.keys(before).length ? before : { archived: 1 },
          owner,
          actor,
          '撤销：' + e.action,
        ),
      );
    }
    if (b.action === 'dictionary') {
      const feature = b.type === 'feature';
      if (!feature && b.type !== 'demand') throw new AppError('字典类型无效');
      const table = feature ? 'features' : 'demands';
      const name = String(b.name || '').trim(),
        parent = String(b.parent || '').trim();
      if (
        !name ||
        name.length > 150 ||
        (feature && (!parent || parent.length > 100))
      )
        throw new AppError('请输入有效名称（名称不超过 150 字）');
      const id = b.id || crypto.randomUUID();
      const before = b.id
        ? await db()
            .prepare(`SELECT * FROM ${table} WHERE id=? AND owner=?`)
            .bind(id, owner)
            .first()
        : null;
      if (b.id && !before) throw new AppError('分类不存在', 404);
      const duplicate = await db()
        .prepare(
          `SELECT id FROM ${table} WHERE owner=? AND name=? ${feature ? 'AND parent=?' : ''} AND id<>?`,
        )
        .bind(owner, name, ...(feature ? [parent] : []), id)
        .first();
      if (duplicate) throw new AppError('已存在同名分类或诉求，请直接使用');
      const stmt = before
        ? feature
          ? db()
              .prepare(
                'UPDATE features SET parent=?,name=? WHERE id=? AND owner=?',
              )
              .bind(parent, name, id, owner)
          : db()
              .prepare('UPDATE demands SET name=? WHERE id=? AND owner=?')
              .bind(name, id, owner)
        : feature
          ? db()
              .prepare(
                'INSERT INTO features(id,owner,parent,name) VALUES(?,?,?,?)',
              )
              .bind(id, owner, parent, name)
          : db()
              .prepare('INSERT INTO demands(id,owner,name) VALUES(?,?,?)')
              .bind(id, owner, name);
      const now = new Date().toISOString();
      await db().batch([
        stmt,
        db()
          .prepare(
            'INSERT INTO events(id,owner,feedback_id,action,before_json,after_json,after_revision,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            owner,
            '',
            (before ? '重命名' : '新增') + (feature ? ' Feature' : '标准诉求'),
            JSON.stringify(before || {}),
            JSON.stringify({ id, parent, name }),
            0,
            actor,
            now,
          ),
      ]);
      return response({ id });
    }
    if (b.action === 'import_demand_features') {
      if (!Array.isArray(b.records) || b.records.length > 100)
        throw new AppError('每批最多导入 100 个 Feature 标签');
      const statements = b.records.flatMap((r: any) => {
        const parent = String(r.parent || '').trim();
        const name = String(r.name || '').trim();
        const sourceId = String(r.source_id || '').trim();
        if (!parent || !name || !sourceId || parent.length > 150 || name.length > 150)
          throw new AppError('Feature 一级/二级名称或来源 ID 无效');
        return [
          db().prepare('INSERT OR IGNORE INTO features(id,owner,parent,name,source_id) VALUES(?,?,?,?,?)')
            .bind(crypto.randomUUID(), owner, parent, name, sourceId),
          db().prepare('UPDATE features SET source_id=? WHERE owner=? AND parent=? AND name=?')
            .bind(sourceId, owner, parent, name),
        ];
      });
      if (statements.length) await db().batch(statements);
      return response({ imported: b.records.length });
    }
    if (b.action === 'import_demand_catalog') {
      if (!Array.isArray(b.records) || b.records.length > 100)
        throw new AppError('每批最多导入 100 条用户诉求');
      const statements = b.records.map((r: any) => {
        const sourceId = String(r.source_id || '').trim();
        const name = String(r.name || '').trim();
        if (!sourceId || !/^\d+$/.test(sourceId) || !name || name.length > 300)
          throw new AppError('用户诉求名称或来源 ID 无效');
        return db().prepare(`
          INSERT INTO demands(
            id,owner,name,ao,source_id,uba,attribute,request_type,hardware_software,
            feature1,feature1_source_id,feature2,feature2_source_id,team,team_source_id,
            team_lead,team_members,created_time,creator,lifecycle_status,source_url
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(owner,name) DO UPDATE SET
            ao=excluded.ao,source_id=excluded.source_id,uba=excluded.uba,attribute=excluded.attribute,
            request_type=excluded.request_type,hardware_software=excluded.hardware_software,
            feature1=excluded.feature1,feature1_source_id=excluded.feature1_source_id,
            feature2=excluded.feature2,feature2_source_id=excluded.feature2_source_id,
            team=excluded.team,team_source_id=excluded.team_source_id,
            team_lead=excluded.team_lead,team_members=excluded.team_members,
            created_time=excluded.created_time,creator=excluded.creator,
            lifecycle_status=excluded.lifecycle_status,source_url=excluded.source_url
        `).bind(
          `peo-${sourceId}`, owner, name, String(r.ao || ''), sourceId,
          String(r.uba || ''), String(r.attribute || ''), String(r.request_type || ''),
          String(r.hardware_software || ''), String(r.feature1 || ''),
          String(r.feature1_source_id || ''), String(r.feature2 || ''),
          String(r.feature2_source_id || ''), String(r.team || ''),
          String(r.team_source_id || ''), String(r.team_lead || ''),
          String(r.team_members || ''), String(r.created_time || ''),
          String(r.creator || ''), String(r.lifecycle_status || ''),
          String(r.source_url || ''),
        );
      });
      if (statements.length) await db().batch(statements);
      return response({ imported: b.records.length });
    }
    if (b.action === 'theme') {
      const name = String(b.name || '').trim();
      const featureId = String(b.feature_id || '').trim();
      const description = String(b.description || '').trim();
      const keywords = String(b.keywords || '').trim();
      if (!name || name.length > 150 || description.length > 500 || keywords.length > 1000)
        throw new AppError('请填写有效主题名称，说明不超过 500 字、关键词不超过 1,000 字');
      if (featureId && !(await db().prepare('SELECT id FROM features WHERE id=? AND owner=?').bind(featureId, owner).first()))
        throw new AppError('所关联的 Feature 不存在或已变更');
      const id = String(b.id || crypto.randomUUID());
      const active = b.active === 0 ? 0 : 1;
      const before = b.id
        ? await db().prepare('SELECT * FROM themes WHERE id=? AND owner=?').bind(id, owner).first<any>()
        : null;
      if (b.id && !before) throw new AppError('主题不存在', 404);
      const duplicate = await db()
        .prepare('SELECT id FROM themes WHERE owner=? AND name=? AND id<>?')
        .bind(owner, name, id)
        .first();
      if (duplicate) throw new AppError('已存在同名主题，请直接编辑已有主题');
      const now = new Date().toISOString();
      const stmt = before
        ? db().prepare('UPDATE themes SET feature_id=?,name=?,description=?,keywords=?,active=?,updated_at=? WHERE id=? AND owner=?').bind(featureId, name, description, keywords, active, now, id, owner)
        : db().prepare('INSERT INTO themes(id,owner,feature_id,name,description,keywords,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, owner, featureId, name, description, keywords, active, now, now);
      await db().batch([
        stmt,
        db().prepare('INSERT INTO events(id,owner,feedback_id,action,before_json,after_json,after_revision,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(crypto.randomUUID(), owner, '', (before ? '编辑' : '新增') + '用户声音主题', JSON.stringify(before || {}), JSON.stringify({ id, feature_id: featureId, name, description, keywords, active }), 0, actor, now),
      ]);
      return response({ id });
    }
    throw new AppError('未知操作');
  } catch (e) {
    return failure(e);
  }
}
