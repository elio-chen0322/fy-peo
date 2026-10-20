import { db, failure, identity, response, json, AppError } from '@/lib/server';

export async function GET() {
  try {
    const { owner } = await identity();
    const posts = await db().prepare(
      `SELECT f.*, COALESCE(t.name,'') theme_name, COALESCE(d.name,'') request_name,
        COALESCE(cd.name,'') request_candidate_name, COALESCE(d.uba,'') request_uba,
        COALESCE(d.attribute,'') request_attribute, COALESCE(d.request_type,'') request_type,
        COALESCE(d.hardware_software,'') request_hardware_software,
        COALESCE(d.feature1,'') request_feature1, COALESCE(d.feature2,'') request_feature2,
        COALESCE(cd.uba,'') candidate_uba, COALESCE(cd.attribute,'') candidate_attribute,
        COALESCE(cd.request_type,'') candidate_request_type, COALESCE(cd.hardware_software,'') candidate_hardware_software,
        COALESCE(cd.feature1,'') candidate_feature1, COALESCE(cd.feature2,'') candidate_feature2
       FROM feedback f LEFT JOIN themes t ON t.id=f.theme_id AND t.owner=f.owner
       LEFT JOIN demands d ON d.id=f.request_id AND d.owner=f.owner
       LEFT JOIN demands cd ON cd.id=f.request_candidate_id AND cd.owner=f.owner
       WHERE f.owner=? AND f.archived=0 AND f.source_type='帖子'
       AND f.published_at >= '2026-08-14 00:00:00' AND f.published_at <= '2026-08-21 23:59:59'
       ORDER BY f.published_at, f.id`
    ).bind(owner).all<any>();
    const ids = posts.results.map((p: any) => p.post_id || p.external_id).filter(Boolean);
    let comments: any[] = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const result = await db().prepare(
        `SELECT f.*, COALESCE(t.name,'') theme_name, COALESCE(d.name,'') request_name,
          COALESCE(cd.name,'') request_candidate_name, COALESCE(d.uba,'') request_uba,
          COALESCE(d.attribute,'') request_attribute, COALESCE(d.request_type,'') request_type,
          COALESCE(d.hardware_software,'') request_hardware_software,
          COALESCE(d.feature1,'') request_feature1, COALESCE(d.feature2,'') request_feature2,
          COALESCE(cd.uba,'') candidate_uba, COALESCE(cd.attribute,'') candidate_attribute,
          COALESCE(cd.request_type,'') candidate_request_type, COALESCE(cd.hardware_software,'') candidate_hardware_software,
          COALESCE(cd.feature1,'') candidate_feature1, COALESCE(cd.feature2,'') candidate_feature2,
          COALESCE(p.raw,'') post_context, COALESCE(parent.raw,'') parent_context
         FROM feedback f LEFT JOIN themes t ON t.id=f.theme_id AND t.owner=f.owner
         LEFT JOIN demands d ON d.id=f.request_id AND d.owner=f.owner
         LEFT JOIN demands cd ON cd.id=f.request_candidate_id AND cd.owner=f.owner
         LEFT JOIN feedback p ON p.owner=f.owner AND p.source_type='帖子' AND p.external_id=f.post_id
         LEFT JOIN feedback parent ON parent.owner=f.owner AND parent.source_type='评论' AND parent.external_id=f.parent_comment_id
         WHERE f.owner=? AND f.archived=0 AND f.source_type='评论' AND f.post_id IN (${placeholders})
         ORDER BY f.published_at, f.id`
      ).bind(owner, ...ids).all<any>();
      comments = result.results;
    }
    const labelResult = await db().prepare('SELECT l.feedback_id,l.final_json,l.review_status,l.confidence,l.ai_json FROM voice_labels l WHERE l.owner=? ORDER BY l.created_at,l.id').bind(owner).all<any>();
    const labeledVoices = [...posts.results, ...comments].flatMap((f:any) => {
      const labels=labelResult.results.filter((l:any)=>l.feedback_id===f.id);
      if(!labels.length)return [f];
      return labels.flatMap((l:any)=>{
        const v=JSON.parse(l.final_json),ai=JSON.parse(l.ai_json);
        if(v['匹配状态']!=='匹配已有诉求'||!v['诉求ID'])return [];
        const confirmed=l.review_status!=='待审核';
        return [{...f,request_id:confirmed?v['诉求ID']:'',request_candidate_id:confirmed?'':v['诉求ID'],request_name:confirmed?v['诉求名称']:'',request_candidate_name:confirmed?'':v['诉求名称'],request_attribute:v['体验/质量'],candidate_attribute:v['体验/质量'],request_type:v['建议/问题']==='建议'?'Need':'Issue',candidate_request_type:v['建议/问题']==='建议'?'Need':'Issue',request_feature1:v['一级Feature'],candidate_feature1:v['一级Feature'],request_feature2:v['二级Feature'],candidate_feature2:v['二级Feature'],request_match_score:l.confidence??0,request_candidate_reason:ai['匹配依据']||'人工审核的独立诉求'}];
      });
    });
    const demandGroups = new Map<string, any>();
    for (const f of labeledVoices) {
      const id = f.request_id || f.request_candidate_id;
      const name = f.request_name || f.request_candidate_name;
      if (!id || !name) continue;
      const key = `${id}:${f.request_id ? 'formal' : 'candidate'}`;
      const group = demandGroups.get(key) || { id, name, matched: f.request_id ? '正式关联' : '候选待审', maxScore: 0, matchReason: f.request_id ? '沿用网站已有正式诉求关联和诉求库属性' : (f.request_candidate_reason || '网站已有候选关联，但未记录匹配依据；须人工复核'), count: 0, posts: new Set(), comments: 0, replies: 0, uba: f.request_uba || f.candidate_uba || '', attribute: f.request_attribute || f.candidate_attribute || '', type: f.request_type || f.candidate_request_type || '', hardware_software: f.request_hardware_software || f.candidate_hardware_software || '', feature1: f.request_feature1 || f.candidate_feature1 || '', feature2: f.request_feature2 || f.candidate_feature2 || '', samples: [] };
      if ((f.request_match_score || 0) > group.maxScore) { group.maxScore = f.request_match_score || 0; group.matchReason = f.request_candidate_reason || ''; }
      group.count++;
      if (f.source_type === '帖子') group.posts.add(f.post_id || f.external_id);
      else if (f.parent_comment_id) group.replies++;
      else group.comments++;
      if (group.samples.length < 5) group.samples.push({ raw: f.raw, url: f.url, source_type: f.source_type, published_at: f.published_at });
      demandGroups.set(key, group);
    }
    const themes = new Map<string, any>();
    for (const f of [...posts.results, ...comments]) {
      const name = f.theme_name || '待复核 / 未分类';
      const row = themes.get(name) || { name, posts: new Set(), comments: 0, replies: 0, expressionTypes: {}, samples: [] };
      if (f.source_type === '帖子') row.posts.add(f.post_id || f.external_id);
      else if (f.parent_comment_id) row.replies++;
      else row.comments++;
      row.expressionTypes[f.expression_type || '待判断'] = (row.expressionTypes[f.expression_type || '待判断'] || 0) + 1;
      if (row.samples.length < 4 && f.source_type === '评论') row.samples.push({ raw: f.raw, url: f.url, post_context: f.post_context, parent_context: f.parent_context, published_at: f.published_at, expression_type: f.expression_type });
      themes.set(name, row);
    }
    const daily = new Map<string, any>();
    for (const f of [...posts.results, ...comments]) {
      const day = (f.published_at || '').slice(0, 10);
      if (!day || day < '2026-08-14' || day > '2026-08-21') continue;
      const r = daily.get(day) || { day, posts: 0, comments: 0, replies: 0 };
      if (f.source_type === '帖子') r.posts++;
      else if (f.parent_comment_id) r.replies++;
      else r.comments++;
      daily.set(day, r);
    }
    const postTotals = posts.results.reduce((a: any, p: any) => ({ likes: a.likes + (p.like_count || 0), collects: a.collects + (p.collect_count || 0), shares: a.shares + (p.share_count || 0), platformComments: a.platformComments + (p.comment_count || 0) }), { likes: 0, collects: 0, shares: 0, platformComments: 0 });
    const decisionRows = await db().prepare("SELECT * FROM cycle_decisions WHERE owner=? AND period='2026-08-14_2026-08-21'").bind(owner).all<any>();
    return response({ period: { from: '2026-08-14', to: '2026-08-21' }, posts: posts.results, comments, counts: { posts: posts.results.length, comments: comments.length, withinWeek: comments.filter((c) => c.published_at >= '2026-08-14' && c.published_at <= '2026-08-21 23:59:59').length, outsideWeek: comments.filter((c) => c.published_at && (c.published_at < '2026-08-14' || c.published_at > '2026-08-21 23:59:59')).length, topLevelComments: comments.filter((c) => !c.parent_comment_id).length, floorReplies: comments.filter((c) => !!c.parent_comment_id).length, postMetrics: postTotals }, themes: [...themes.values()].map((t) => ({ ...t, posts: t.posts.size })).sort((a, b) => b.comments + b.replies - a.comments - a.replies), demands: [...demandGroups.values()].map((d) => ({ ...d, posts: d.posts.size, decision: decisionRows.results.find((x: any) => x.demand_id === d.id)?.decision || '待评估', solution: decisionRows.results.find((x: any) => x.demand_id === d.id)?.solution || '', implementation_plan: decisionRows.results.find((x: any) => x.demand_id === d.id)?.implementation_plan || '', responsible: decisionRows.results.find((x: any) => x.demand_id === d.id)?.responsible || '' })).sort((a, b) => b.count - a.count), daily: [...daily.values()] });
  } catch (e) { return failure(e); }
}

export async function POST(req: Request) {
  try {
    const { owner } = await identity(req);
    const b: any = await json(req);
    if (!b.demand_id || !['待评估','立项','不立项','持续观察'].includes(b.decision)) throw new AppError('决策字段无效');
    const demand = await db().prepare('SELECT id FROM demands WHERE id=? AND owner=?').bind(b.demand_id, owner).first();
    if (!demand) throw new AppError('诉求不存在', 404);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db().prepare(`INSERT INTO cycle_decisions(id,owner,period,demand_id,decision,solution,implementation_plan,responsible,updated_at) VALUES(?,?,'2026-08-14_2026-08-21',?,?,?,?,?,?) ON CONFLICT(owner,period,demand_id) DO UPDATE SET decision=excluded.decision,solution=excluded.solution,implementation_plan=excluded.implementation_plan,responsible=excluded.responsible,updated_at=excluded.updated_at`).bind(id, owner, b.demand_id, b.decision, String(b.solution||''), String(b.implementation_plan||''), String(b.responsible||''), now).run();
    return response({ ok: true });
  } catch (e) { return failure(e); }
}
