import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
const sign = await fetch(origin + '/signin-with-chatgpt', {
  redirect: 'manual',
});
assert.equal(sign.status, 302);
const cookie = sign.headers.get('set-cookie').split(';')[0];
let checks = 0;
async function call(path = '', body, expected = 200, extra = {}) {
  const r = await fetch(origin + '/api/library' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie,
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  assert.equal(r.status, expected, JSON.stringify(data));
  checks++;
  return data;
}
const unauth = await fetch(origin + '/api/library');
assert.equal(unauth.status, 401);
checks++;
const meta = await call('?mode=meta');
assert.equal(new Set(meta.features.map((f) => f.parent)).size, 10);
const token = crypto.randomUUID();
const record = {
  raw: '[本地自动测试，非真实用户反馈] 语音识别测试 100%_' + token,
  request_name: '测试诉求 ' + token,
  kind: '体验',
  version: '',
  published_at: '2026-09-09 10:45:00',
  url: 'https://example.test/post/' + token,
  city: '',
  external_id: token,
  feature_id: meta.features[0].id,
};
const created = await call('', { action: 'create', record });
assert.equal(created.duplicate, false);
const id = created.id;
const duplicate = await call('', { action: 'create', record });
assert.equal(duplicate.duplicate, true);
let detail = await call('?mode=detail&id=' + id);
assert.equal(detail.history.length, 1);
assert.equal(detail.row.version, '');
assert.equal(detail.row.city, '');
assert.equal(JSON.parse(detail.row.original_snapshot).raw, record.raw);
const edited = await call('', {
  action: 'edit',
  id,
  revision: 1,
  patch: { raw: record.raw + ' 修订', kind: '质量', status: '已确认' },
});
assert.equal(edited.revision, 2);
await call(
  '',
  { action: 'edit', id, revision: 1, patch: { kind: '体验' } },
  409,
);
detail = await call('?mode=detail&id=' + id);
assert.equal(detail.history.length, 2);
assert.equal(JSON.parse(detail.row.original_snapshot).raw, record.raw);
await call('', { action: 'undo', event_id: detail.history[0].id });
detail = await call('?mode=detail&id=' + id);
assert.equal(detail.row.kind, '体验');
assert.equal(detail.row.revision, 3);
const result = await call('?q=' + encodeURIComponent('100%_' + token));
assert.equal(result.rows.length, 1);
assert.equal((await call('?from=2026-09-10&q=' + token)).total, 0);
const imp = await call('', {
  action: 'import',
  records: [
    {
      ...record,
      request_id: '',
      feature_id: '',
      feature1: 'HMI体验',
      feature2: '屏幕亮度与可读性',
    },
    { raw: '', source: '测试' },
    { ...record, id, raw: '不会覆盖' },
  ],
});
assert.equal(imp.results[0].duplicate, true);
assert.ok(imp.results[1].error);
assert.equal(imp.results[2].duplicate, true);
assert.equal((await call('?mode=detail&id=' + id)).row.raw, record.raw);
await call(
  '',
  {
    action: 'create',
    record: {
      ...record,
      external_id: token + 'invalid',
      published_at: '2026-02-30',
    },
  },
  400,
);
await call(
  '',
  {
    action: 'create',
    record: {
      ...record,
      external_id: token + 'invalid',
      url: 'javascript:alert(1)',
    },
  },
  400,
);
await call(
  '',
  {
    action: 'edit',
    id,
    revision: 3,
    patch: { feature_id: 'not-owner-feature' },
  },
  400,
);
await call(
  '',
  { action: 'edit', id, revision: 3, patch: { raw: 'CSRF' } },
  403,
  { Origin: 'https://other.example.test' },
);
await call('', {
  action: 'dictionary',
  type: 'demand',
  id: detail.row.request_id,
  name: '统一诉求 ' + token,
});
assert.equal(
  (await call('?mode=detail&id=' + id)).row.request_name,
  '统一诉求 ' + token,
);
const fileForm = new FormData();
fileForm.set('feedback_id', id);
fileForm.set(
  'file',
  new File(['local-test-attachment'], 'test.txt', { type: 'text/plain' }),
);
const fileR = await fetch(origin + '/api/files', {
  method: 'POST',
  headers: { cookie, Origin: origin },
  body: fileForm,
});
assert.equal(fileR.status, 200, await fileR.clone().text());
const file = await fileR.json();
checks++;
const download = await fetch(origin + '/api/files?id=' + file.id, {
  headers: { cookie },
});
assert.equal(await download.text(), 'local-test-attachment');
assert.ok(download.headers.get('content-disposition').startsWith('attachment'));
checks++;
assert.equal((await fetch(origin + '/api/files?id=' + file.id)).status, 401);
checks++;
await call('', {
  action: 'bulk',
  records: [{ id, revision: 3 }],
  patch: { archived: 1 },
});
assert.equal((await call('?q=' + token)).total, 0);
assert.equal((await call('?archived=1&q=' + token)).total, 1);
await call('', {
  action: 'bulk',
  records: [{ id, revision: 4 }],
  patch: { archived: 0 },
});
assert.equal((await call('?q=' + token)).total, 1);
// Leave only archived, explicitly synthetic records in the local development database.
await call('', {
  action: 'bulk',
  records: [{ id, revision: 5 }],
  patch: { archived: 1 },
});
console.log(
  `PASS: ${checks} API checks — auth, persistence, validation, dedup, filters, audit, conflict, undo, dictionaries, attachments, archive/restore.`,
);
