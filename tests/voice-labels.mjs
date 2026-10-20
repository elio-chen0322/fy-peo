import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = await import(
  createRequire(require.resolve('vite')).resolve('esbuild')
);
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'peo-label-tests-'));
const database = new DatabaseSync(':memory:');
database.exec(
  `CREATE TABLE demands(id TEXT PRIMARY KEY,owner TEXT,name TEXT,lifecycle_status TEXT,feature1 TEXT,feature2 TEXT,request_type TEXT,attribute TEXT);CREATE TABLE features(id TEXT,owner TEXT,parent TEXT,name TEXT);CREATE TABLE feedback(id TEXT PRIMARY KEY,owner TEXT,fingerprint TEXT,raw TEXT,source TEXT,source_type TEXT,external_id TEXT,post_id TEXT,parent_comment_id TEXT,original_snapshot TEXT,published_at TEXT,like_count INTEGER,captured_at TEXT,crawl_keyword TEXT,collect_count INTEGER,comment_count INTEGER,share_count INTEGER,url TEXT,created_at TEXT,updated_at TEXT);`,
);
database.exec(
  fs
    .readFileSync('drizzle/0010_voice_label_review.sql', 'utf8')
    .split('INSERT OR IGNORE INTO voice_screenings')[0],
);
database.exec(fs.readFileSync('drizzle/0011_voice_review_queue.sql','utf8'));
database.exec(fs.readFileSync('drizzle/0012_review_drafts.sql','utf8'));
const adapter = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async first() {
            return database.prepare(sql).get(...args) || null;
          },
          async all() {
            return { results: database.prepare(sql).all(...args) };
          },
          async run() {
            const r = database.prepare(sql).run(...args);
            return { meta: { changes: Number(r.changes) } };
          },
          sql,
          args,
        };
      },
    };
  },
  async batch(statements) {
    database.exec('BEGIN');
    try {
      const r = [];
      for (const s of statements) {
        const result = database.prepare(s.sql).run(...s.args);
        r.push({ meta: { changes: Number(result.changes) } });
      }
      database.exec('COMMIT');
      return r;
    } catch (e) {
      database.exec('ROLLBACK');
      throw e;
    }
  },
};
globalThis.__peoTestDb = adapter;
await build({
  entryPoints: ['lib/voice-label-store.ts'],
  outfile: path.join(temp, 'store.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'test-server',
      setup(b) {
        b.onResolve({ filter: /^\.\/server$/ }, () => ({
          path: 'mock',
          namespace: 'test',
        }));
        b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
          contents: `export const db=()=>globalThis.__peoTestDb;export class AppError extends Error{constructor(m,code=400){super(m);this.code=code;}}export const hash=async s=>s;export async function create(){throw new Error('not needed in this test')}`,
          loader: 'js',
        }));
      },
    },
  ],
});
const store = await import(path.join(temp, 'store.mjs'));
async function approved(method,body,owner='u',actor='tester') {
 const queued=await store[method](body,owner,actor);
 assert.equal(queued.learned,false);
 await store.submitReviewDrafts(owner,actor);
 const q=database.prepare('SELECT * FROM voice_review_queue WHERE id=?').get(queued.queue_id);
 return store.resolveVerification({queue_id:q.id,snapshot_hash:q.snapshot_hash,decision:'通过',reason:'测试核对：当前作者独立表达与所选诉求及四维一致，原声和AI快照版本均保持一致。'},owner,actor);
}
const time = new Date().toISOString();
database
  .prepare('INSERT INTO demands VALUES(?,?,?,?,?,?,?,?)')
  .run('d1', 'u', '导航卡顿', '启用', '地图', '导航', 'Issue', '体验');
database
  .prepare('INSERT INTO demands VALUES(?,?,?,?,?,?,?,?)')
  .run('d2', 'u', '建议增加CarPlay', '启用', '生态', '互联', 'Need', '体验');
database
  .prepare('INSERT INTO features VALUES(?,?,?,?)')
  .run('f1', 'u', '地图', '导航');
database
  .prepare(
    'INSERT INTO feedback(id,owner,raw,source,source_type,external_id,post_id,parent_comment_id,original_snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  )
  .run(
    'voice',
    'u',
    '导航卡顿，希望增加CarPlay',
    '小红书',
    '评论',
    'c',
    'p',
    '',
    '{}',
    time,
    time,
  );
database
  .prepare(
    'INSERT INTO voice_screenings(id,owner,feedback_id,voice_id,created_at,updated_at) VALUES(?,?,?,?,?,?)',
  )
  .run('s', 'u', 'voice', 'xhs:comment:p:c', time, time);
const first = await store.addLabel(
  {
    feedback_id: 'voice',
    fragment: '导航卡顿',
    value: { 诉求ID: 'd1', 匹配状态: '匹配已有诉求' },
  },
  'u',
  'tester',
);
const second = await store.addLabel(
  {
    feedback_id: 'voice',
    fragment: '希望增加CarPlay',
    value: { 诉求ID: 'd2', 匹配状态: '匹配已有诉求' },
  },
  'u',
  'tester',
);
assert.equal(
  database.prepare('SELECT count(*) n FROM voice_labels').get().n,
  2,
);
await assert.rejects(
  () =>
    store.addLabel(
      {
        feedback_id: 'voice',
        fragment: '导航卡顿',
        value: { 诉求ID: 'd1', 匹配状态: '匹配已有诉求' },
      },
      'u',
      'tester',
    ),
  /已关联/,
);
await assert.rejects(
  () =>
    store.addLabel(
      {
        feedback_id: 'voice',
        fragment: '没有出现的文字',
        value: { 诉求ID: 'd1', 匹配状态: '匹配已有诉求' },
      },
      'u',
      'tester',
    ),
  /逐字出自/,
);
await assert.rejects(
  () =>
    store.reviewLabel(
      {
        id: first.id,
        revision: 1,
        value: { 诉求ID: 'd1', 匹配状态: '匹配已有诉求' },
        reviewer: '',
      },
      'u',
      'tester',
    ),
  /审核人/,
);
await approved('reviewLabel',
  {
    id: first.id,
    revision: 1,
    value: { 匹配状态: '不匹配' },
    reviewer: '审核员',
  },
  'u',
  'tester',
);
assert.equal(
  JSON.parse(
    database
      .prepare('SELECT final_json FROM voice_labels WHERE id=?')
      .get(second.id).final_json,
  )['诉求ID'],
  'd2',
);
assert.equal(
  database
    .prepare('SELECT review_status FROM voice_labels WHERE id=?')
    .get(second.id).review_status,
  '待审核',
);
await assert.rejects(
  () =>
    store.reviewLabel(
      {
        id: first.id,
        revision: 1,
        value: { 匹配状态: '不匹配' },
        reviewer: '审核员',
      },
      'u',
      'tester',
    ),
  /刷新/,
);
await assert.rejects(
  () =>
    store.reviewLabel(
      {
        id: second.id,
        revision: 1,
        value: { 诉求ID: 'd2', 匹配状态: '匹配已有诉求' },
        reviewer: '审核员',
      },
      'other-owner',
      'tester',
    ),
  /不存在/,
);
await approved('reviewLabel',
  {
    id: second.id,
    revision: 1,
    value: { 诉求ID: 'd2', 匹配状态: '匹配已有诉求' },
    reviewer: '审核员',
  },
  'u',
  'tester',
);
await approved('reviewLabel',
  {
    id: second.id,
    revision: 2,
    value: { 诉求ID: 'd2', 匹配状态: '匹配已有诉求' },
    reviewer: '审核员',
  },
  'u',
  'tester',
);
assert.equal(
  database.prepare('SELECT count(*) n FROM voice_label_events').get().n,
  2,
);
await approved('reviewScreen',
  {
    feedback_id: 'voice',
    revision: 1,
    relevance: '相关',
    demandness: '有诉求',
    reviewer: '审核员',
  },
  'u',
  'tester',
);
assert.equal(
  database.prepare('SELECT count(*) n FROM voice_label_events').get().n,
  3,
);
const pure = await build({
  entryPoints: ['lib/voice-labeling.ts'],
  outfile: path.join(temp, 'pure.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const labels = await import(path.join(temp, 'pure.mjs'));
assert.equal(
  labels.confidenceFromAI(
    {
      语义置信度: 98,
      一级Feature置信度: 97,
      二级Feature置信度: 96,
      '建议/问题置信度': 98,
      '体验/质量置信度': 97,
      AI匹配状态: '匹配已有诉求',
      候选差距: 20,
    },
    99,
    '完整',
  ),
  96,
);
assert.equal(
  labels.confidenceFromAI(
    {
      语义置信度: 98,
      一级Feature置信度: 97,
      二级Feature置信度: 96,
      '建议/问题置信度': 98,
      '体验/质量置信度': 97,
      AI匹配状态: '匹配已有诉求',
      候选差距: 20,
    },
    99,
    '部分缺失',
  ),
  79,
);
assert.equal(labels.confidenceFromAI({ 文字匹配分: 90 }, 99, '完整'), null);
assert.equal(
  labels.excludedScreen({
    relevance: '不相关',
    confidence: 94,
    review_status: '待审核',
  }),
  false,
);
assert.equal(
  labels.excludedScreen({
    relevance: '不相关',
    confidence: 95,
    review_status: '待审核',
  }),
  true,
);
assert.equal(
  labels.excludedScreen({
    relevance: '不相关',
    confidence: null,
    review_status: '修改',
  }),
  true,
);
const beforeExcel = database
  .prepare('SELECT * FROM voice_labels WHERE id=?')
  .get(second.id);
const originalRaw = await store.rawForFeedback(
  await store.getVoice('voice', 'u'),
);
const excelRecord = {
  raw: originalRaw,
  labels: [
    {
      intent_id: beforeExcel.intent_id,
      fragment: beforeExcel.fragment,
      ai: JSON.parse(beforeExcel.ai_json),
      review: {
        state: '修改',
        revision: beforeExcel.revision,
        reviewer: 'Excel审核人',
        note: '只拒绝这一诉求',
        fields: { 匹配状态: '不匹配', 诉求ID: 'd2' },
      },
    },
  ],
};
const imported = await store.importReviews([excelRecord], 'u', 'tester');
assert.equal(imported.results[0].applied, 1);
assert.equal(database.prepare('SELECT count(*) n FROM voice_label_events').get().n,3,'Excel submission must not learn before Codex');
await store.submitReviewDrafts('u','tester');
for(const q of await store.verificationQueue('u',true)) await store.resolveVerification({queue_id:q.id,snapshot_hash:q.snapshot_hash,decision:'通过',reason:'测试核对：人工明确拒绝这一条独立诉求，不影响其他原声和诉求；原声、AI快照、版本均已核对。'},'u','tester');
assert.equal(
  JSON.parse(
    database
      .prepare('SELECT final_json FROM voice_labels WHERE id=?')
      .get(second.id).final_json,
  )['匹配状态'],
  '不匹配',
);
assert.equal(
  JSON.parse(
    database
      .prepare('SELECT final_json FROM voice_labels WHERE id=?')
      .get(first.id).final_json,
  )['匹配状态'],
  '不匹配',
);
const eventCount = database
  .prepare('SELECT count(*) n FROM voice_label_events')
  .get().n;
const stale = await store.importReviews([excelRecord], 'u', 'tester');
assert.match(stale.results[0].error, /版本/);
assert.equal(
  database.prepare('SELECT count(*) n FROM voice_label_events').get().n,
  eventCount,
);
const tampered = structuredClone(excelRecord);
tampered.labels[0].review.revision = beforeExcel.revision + 1;
tampered.labels[0].ai['AI诉求名称'] = '修改机器快照';
const tamper = await store.importReviews([tampered], 'u', 'tester');
assert.match(tamper.results[0].error, /快照/);
assert.equal(
  database.prepare('SELECT count(*) n FROM voice_label_events').get().n,
  eventCount,
);
const changedRaw = structuredClone(tampered);
changedRaw.raw[1] = '错误修改正文';
const invalidRaw = await store.importReviews([changedRaw], 'u', 'tester');
assert.match(invalidRaw.results[0].error, /原声/);
// A pending proposal never changes the current result or learning count.
const current=database.prepare('SELECT * FROM voice_labels WHERE id=?').get(second.id);
const eventsBefore=database.prepare('SELECT count(*) n FROM voice_label_events').get().n;
const qb={id:second.id,revision:current.revision,value:{诉求ID:'d2',匹配状态:'匹配已有诉求'},reviewer:'人工审核员',note:'重新关联'};
const pending1=await store.reviewLabel(qb,'u','tester');
const pending2=await store.reviewLabel(qb,'u','tester');assert.equal(pending1.queue_id,pending2.queue_id);
assert.equal(database.prepare('SELECT count(*) n FROM voice_label_events').get().n,eventsBefore);
assert.equal(database.prepare('SELECT final_json FROM voice_labels WHERE id=?').get(second.id).final_json,current.final_json);
assert.equal((await store.verificationQueue('u',true)).length,0,'Codex must not read unsubmitted drafts');
const unsubmitted=database.prepare('SELECT * FROM voice_review_queue WHERE id=?').get(pending1.queue_id);
await assert.rejects(()=>store.resolveVerification({queue_id:unsubmitted.id,snapshot_hash:unsubmitted.snapshot_hash,decision:'通过',reason:'测试核对完整理由不少于十字'},'u','tester'),/已处理/);
assert.equal((await store.submitReviewDrafts('other-owner','tester')).submitted,0,'Other owners cannot submit these drafts');
assert.equal((await store.submitReviewDrafts('u','tester')).submitted,1);
assert.equal((await store.submitReviewDrafts('u','tester')).submitted,0,'Repeated batch click must not duplicate submission');
const task=database.prepare('SELECT * FROM voice_review_queue WHERE id=?').get(pending1.queue_id);
await assert.rejects(()=>store.resolveVerification({queue_id:task.id,snapshot_hash:'wrong',decision:'通过',reason:'测试核对完整理由不少于十字'},'u','tester'),/快照/);
await assert.rejects(()=>store.resolveVerification({queue_id:task.id,snapshot_hash:task.snapshot_hash,decision:'通过',reason:'测试核对完整理由不少于十字'},'other-owner','tester'),/不存在/);
const blocked=await store.resolveVerification({queue_id:task.id,snapshot_hash:task.snapshot_hash,decision:'需人工处理',reason:'当前上下文不足以确认重新关联，保留原审核结果并请人工说明。'},'u','tester');assert.equal(blocked.learned,false);
const again=await store.reviewLabel(qb,'u','tester');
await store.submitReviewDrafts('u','tester');
database.prepare('UPDATE voice_labels SET revision=revision+1 WHERE id=?').run(second.id);
const task2=database.prepare('SELECT * FROM voice_review_queue WHERE id=?').get(again.queue_id);
const staleQueue=await store.resolveVerification({queue_id:task2.id,snapshot_hash:task2.snapshot_hash,decision:'通过',reason:'完整核对理由，但此任务的审核版本在等待期间已经发生变化。'},'u','tester');assert.equal(staleQueue.status,'待人工处理');
assert.equal(database.prepare('SELECT count(*) n FROM voice_label_events').get().n,eventsBefore);
// A single stale draft blocks the whole batch, preserving all drafts for the user.
const arow=database.prepare('SELECT * FROM voice_labels WHERE id=?').get(first.id);
const brow=database.prepare('SELECT * FROM voice_labels WHERE id=?').get(second.id);
const da=await store.reviewLabel({id:arow.id,revision:arow.revision,value:{匹配状态:'不匹配'},reviewer:'审核员',note:'第一条跨页审核'},'u','tester');
const dbb=await store.reviewLabel({id:brow.id,revision:brow.revision,value:{匹配状态:'不匹配'},reviewer:'审核员',note:'第二条跨页审核'},'u','tester');
database.prepare('UPDATE voice_labels SET revision=revision+1 WHERE id=?').run(first.id);
await assert.rejects(()=>store.submitReviewDrafts('u','tester'),/尚未提交/);
assert.equal(database.prepare("SELECT count(*) n FROM voice_review_queue WHERE status='草稿'").get().n,2);
assert.equal((await store.verificationQueue('u',true)).length,0);
const fixed=database.prepare('SELECT * FROM voice_labels WHERE id=?').get(first.id);
await store.reviewLabel({id:fixed.id,revision:fixed.revision,value:{匹配状态:'不匹配'},reviewer:'审核员',note:'第一条更新基线'},'u','tester');
assert.equal((await store.submitReviewDrafts('u','tester')).submitted,2,'One click submits drafts for different independent labels');
assert.equal((await store.verificationQueue('u',true)).length,2);
assert.equal(database.prepare('SELECT count(*) n FROM voice_label_events').get().n,eventsBefore,'Submitting alone must not learn');
console.log(
  '通过：审核草稿不进入Codex队列、一键跨诉求批量提交、重复提交幂等、草稿版本冲突整批保留、一原声多诉求、独立拒绝、四维继承、去重、原文证据、账号隔离、并发版本、审核记忆幂等、置信度风险封顶、误剔除保护、Excel人工审核回写、过期版本和快照修改拦截。',
);
database.close();
fs.rmSync(temp, { recursive: true });
