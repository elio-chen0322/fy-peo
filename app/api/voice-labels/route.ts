import { AppError, db, identity, response, failure, json } from '@/lib/server';
import {
  submitReviewDrafts,
  verificationQueue,
  resolveVerification,
  addLabel,
  getVoice,
  importReviews,
  importVoices,
  labelRow,
  rawForFeedback,
  reviewLabel,
  reviewScreen,
  screenRow,
} from '@/lib/voice-label-store';

const exclusion = "((COALESCE(s.relevance,'待确认')='不相关' OR COALESCE(s.demandness,'待确认')='无诉求') AND (COALESCE(s.review_status,'待审核')<>'待审核' OR COALESCE(s.confidence,0)>=95))";
const explicitDemand = `(NOT ${exclusion} AND s.relevance='相关' AND s.demandness='有诉求' AND EXISTS(SELECT 1 FROM voice_labels vl WHERE vl.owner=f.owner AND vl.feedback_id=f.id AND json_extract(vl.final_json,'$.匹配状态') IN ('匹配已有诉求','待新增诉求')))`;
const unresolved = `(NOT ${exclusion} AND NOT ${explicitDemand})`;
export async function GET(req: Request) {
  try {
    const { owner, actor } = await identity(req);
    const p = new URL(req.url).searchParams;
    if (p.get('mode') === 'verification_queue') return response({rows:await verificationQueue(owner,p.get('pending')==='1')});
    if (p.get('mode') === 'learning') {
      const r = await db()
        .prepare(
          "SELECT id,scope,payload_json,created_at FROM voice_label_events WHERE owner=? AND revoked_at='' ORDER BY created_at DESC,id DESC LIMIT 10000",
        )
        .bind(owner)
        .all<any>();
      return response({
        rows: r.results.map((x) => ({
          ...x,
          payload: JSON.parse(x.payload_json),
        })),
      });
    }
    if (p.get('mode') === 'detail') {
      const f = await getVoice(p.get('id') || '', owner);
      const [screen, labels] = await Promise.all([
        db()
          .prepare(
            'SELECT * FROM voice_screenings WHERE owner=? AND feedback_id=?',
          )
          .bind(owner, f.id)
          .first(),
        db()
          .prepare(
            'SELECT * FROM voice_labels WHERE owner=? AND feedback_id=? ORDER BY created_at,id',
          )
          .bind(owner, f.id)
          .all(),
      ]);
      return response({
        voice: f,
        raw: await rawForFeedback(f),
        screen: screen ? screenRow(screen) : null,
        labels: labels.results.map(labelRow),
      });
    }
    const clauses = ['f.owner=?', 'f.archived=?'],
      args: any[] = [owner,p.get('archived')==='1'?1:0];
    for(const field of ['expression_type','version','source','city','status','theme_id']) {if(p.get(field)){clauses.push(`f.${field}=?`);args.push(p.get(field));}}
    for(const [key,op] of [['from','>='],['to','<=']]) {const date=p.get(key);if(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new AppError('日期格式无效');clauses.push(`substr(replace(f.published_at,'T',' '),1,10) ${op} ?`);args.push(date);}}
    const view = p.get('view') || 'kept';
    if (view === 'kept') clauses.push(explicitDemand);
    if (view === 'pending') clauses.push(unresolved);
    if (view === 'excluded') clauses.push(exclusion);
    if (p.get('q')) {
      const q = '%' + p.get('q')!.replace(/[\\%_]/g, '\\$&') + '%';
      clauses.push(
        "(f.raw LIKE ? ESCAPE '\\' OR s.voice_id LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM voice_labels l WHERE l.owner=f.owner AND l.feedback_id=f.id AND (l.final_json LIKE ? ESCAPE '\\' OR l.fragment LIKE ? ESCAPE '\\')))",
      );
      args.push(q, q, q, q);
    }
    if(p.get('has_labels')==='1')clauses.push('EXISTS(SELECT 1 FROM voice_labels vl WHERE vl.owner=f.owner AND vl.feedback_id=f.id)');
    if (p.get('multi') === '1')
      clauses.push(
        '(SELECT COUNT(*) FROM voice_labels l WHERE l.owner=f.owner AND l.feedback_id=f.id)>1',
      );
    if (p.get('relevance')) {
      clauses.push("COALESCE(s.relevance,'待确认')=?");
      args.push(p.get('relevance'));
    }
    const labelConditions = ['l.owner=f.owner', 'l.feedback_id=f.id'];
    const la: any[] = [];
    if (p.get('review')) {
      labelConditions.push('l.review_status=?');
      la.push(p.get('review'));
    }
    if (p.get('match')) {
      labelConditions.push("json_extract(l.final_json,'$.匹配状态')=?");
      la.push(p.get('match'));
    }
    if (p.get('confidence') === 'low')
      labelConditions.push('(l.confidence IS NOT NULL AND l.confidence<75)');
    if (p.get('confidence') === 'high')
      labelConditions.push('(l.confidence>=90)');
    if (p.get('confidence') === 'missing')
      labelConditions.push('l.confidence IS NULL');
    if (p.get('feature1')) {
      labelConditions.push("json_extract(l.final_json,'$.一级Feature')=?");
      la.push(p.get('feature1'));
    }
    if (p.get('feature2')) {
      labelConditions.push("json_extract(l.final_json,'$.二级Feature')=?");
      la.push(p.get('feature2'));
    }
    if (p.get('suggestion_issue')) {
      labelConditions.push("json_extract(l.final_json,'$.建议/问题')=?");
      la.push(p.get('suggestion_issue'));
    }
    if (p.get('request_id')) {labelConditions.push("json_extract(l.final_json,'$.诉求ID')=?");la.push(p.get('request_id'));}
    if (p.get('attribute') || p.get('kind')) {
      labelConditions.push("json_extract(l.final_json,'$.体验/质量')=?");
      la.push(p.get('attribute') || p.get('kind'));
    }
    if (labelConditions.length > 2) {
      clauses.push(
        `EXISTS(SELECT 1 FROM voice_labels l WHERE ${labelConditions.join(' AND ')})`,
      );
      args.push(...la);
    }
    const from =
      'FROM feedback f LEFT JOIN voice_screenings s ON s.feedback_id=f.id AND s.owner=f.owner';
    const limit = Math.min(100, Math.max(1, Number(p.get('limit')) || 100)),
      offset = Math.max(0, Number(p.get('offset')) || 0);
    const [rows, total, stats, ls, learning] = await Promise.all([
      db()
        .prepare(`SELECT f.*,s.voice_id,s.raw_json,
    COALESCE((SELECT p.raw FROM feedback p WHERE p.owner=f.owner AND p.source=f.source AND p.source_type='帖子' AND p.external_id=f.post_id LIMIT 1),'') post_context,
    COALESCE((SELECT p.raw FROM feedback p WHERE p.owner=f.owner AND p.source=f.source AND p.source_type='评论' AND p.external_id=f.parent_comment_id LIMIT 1),'') parent_context,
    (SELECT COUNT(*) FROM voice_labels l WHERE l.owner=f.owner AND l.feedback_id=f.id) label_total ${from} WHERE ${clauses.join(' AND ')} ORDER BY f.published_at DESC,f.id LIMIT ? OFFSET ?`)
        .bind(...args, limit, offset)
        .all<any>(),
      db()
        .prepare(`SELECT COUNT(*) n ${from} WHERE ${clauses.join(' AND ')}`)
        .bind(...args)
        .first<any>(),
      db()
        .prepare(
          `SELECT COUNT(*) total,COALESCE(SUM(${exclusion}),0) excluded,COALESCE(SUM(${explicitDemand}),0) actionable,COALESCE(SUM(${unresolved}),0) uncertain ${from} WHERE f.owner=? AND f.archived=0`,
        )
        .bind(owner)
        .first<any>(),
      db()
        .prepare(
          "SELECT COUNT(*) labels,COALESCE(SUM(l.review_status='待审核'),0) pending,COUNT(DISTINCT l.feedback_id) labeled_voices,COALESCE(SUM(json_extract(l.final_json,'$.匹配状态')='匹配已有诉求'),0) matched_labels,COALESCE(SUM(json_extract(l.final_json,'$.匹配状态')='待新增诉求'),0) new_labels FROM voice_labels l JOIN feedback f ON f.id=l.feedback_id AND f.owner=l.owner WHERE l.owner=? AND f.archived=0",
        )
        .bind(owner)
        .first<any>(),
      db()
        .prepare(
          "SELECT COUNT(*) n FROM voice_label_events WHERE owner=? AND revoked_at=''",
        )
        .bind(owner)
        .first<any>(),
    ]);
    const ids = rows.results.map((f) => f.id);
    let labels: any[] = [],
      screens: any[] = [];
    for (let start = 0; start < ids.length; start += 60) {
      const batchIds = ids.slice(start, start + 60);
      const placeholders = batchIds.map(() => '?').join(',');
      const extra = labelConditions.slice(2);
      const r = await Promise.all([
        db()
          .prepare(
            `SELECT l.* FROM voice_labels l WHERE l.owner=? AND l.feedback_id IN (${placeholders}) ${extra.length ? 'AND ' + extra.join(' AND ') : ''} ORDER BY l.created_at,l.id`,
          )
          .bind(owner, ...batchIds, ...la)
          .all(),
        db()
          .prepare(
            `SELECT * FROM voice_screenings WHERE owner=? AND feedback_id IN (${placeholders})`,
          )
          .bind(owner, ...batchIds)
          .all(),
      ]);
      labels.push(...r[0].results);
      screens.push(...r[1].results);
    }
    const proposals: any[] = [];
    for (let start = 0; start < ids.length; start += 60) {
      const batchIds = ids.slice(start, start + 60);
      const result = await db().prepare(`SELECT * FROM voice_review_queue WHERE owner=? AND feedback_id IN (${batchIds.map(()=>'?').join(',')}) AND status IN ('草稿','待Codex核对','待人工处理') ORDER BY created_at DESC,id DESC`).bind(owner,...batchIds).all<any>();
      proposals.push(...result.results);
    }
    return response({
      rows: await Promise.all(
        rows.results.map(async (f) => ({
          reviews: proposals.filter(q=>q.feedback_id===f.id).map(q=>({...q,proposal:JSON.parse(q.proposal_json)})),
          voice: f,
          raw: await rawForFeedback(f),
          screen: screens.find((s) => s.feedback_id === f.id)
            ? screenRow(screens.find((s) => s.feedback_id === f.id))
            : null,
          labels: labels.filter((l) => l.feedback_id === f.id).map(labelRow),
        })),
      ),
      total: total?.n || 0,
      stats: { review_drafts:(await db().prepare("SELECT COUNT(*) n FROM voice_review_queue WHERE owner=? AND status='草稿'").bind(owner).first<any>())?.n||0, ...stats, ...ls, learning: learning?.n || 0, verification_pending:(await db().prepare("SELECT COUNT(*) n FROM voice_review_queue WHERE owner=? AND status='待Codex核对'").bind(owner).first<any>())?.n||0 },
      reviewer: actor,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { owner, actor } = await identity(req);
    const b = await json(req);
    if (b.action === 'submit_review_drafts') return response(await submitReviewDrafts(owner,actor));
    if (b.action === 'discard_draft') {await db().prepare("UPDATE voice_review_queue SET status='已撤回',checked_at=? WHERE id=? AND owner=? AND status='草稿'").bind(new Date().toISOString(),String(b.id),owner).run();return response({ok:true});}
    if (b.action === 'withdraw_verification') {await db().prepare("UPDATE voice_review_queue SET status='已撤回',checked_at=? WHERE id=? AND owner=? AND status='待Codex核对'").bind(new Date().toISOString(),String(b.id),owner).run();return response({ok:true});}
    if (b.action === 'resolve_verification') return response(await resolveVerification(b,owner,actor));
    if (b.action === 'import')
      return response(await importVoices(b.records, owner, actor));
    if (b.action === 'import_review')
      return response(await importReviews(b.records, owner, actor));
    if (b.action === 'add_label')
      return response(await addLabel(b, owner, actor));
    if (b.action === 'review_label')
      return response(await reviewLabel(b, owner, actor));
    if (b.action === 'review_screen')
      return response(await reviewScreen(b, owner, actor));
    if (b.action === 'revoke_learning') {
      const r = await db()
        .prepare(
          "UPDATE voice_label_events SET revoked_at=? WHERE id=? AND owner=? AND revoked_at=''",
        )
        .bind(new Date().toISOString(), String(b.id), owner)
        .run();
      if (!r.meta.changes) throw new AppError('案例不存在或已经撤回', 404);
      return response({ revoked: true });
    }
    throw new AppError('未知打标操作');
  } catch (e) {
    return failure(e);
  }
}
