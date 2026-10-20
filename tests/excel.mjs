import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { parseWorkbook, buildWorkbook } from '../work/excel-test.mjs';
const book = new ExcelJS.Workbook();
const s = book.addWorksheet('反馈');
s.addRow([
  '搜索口令',
  '反馈原声',
  '用户诉求',
  '一级Feature',
  '二级Feature',
  '报错版本',
  '体验/质量',
  '发帖时间',
  '用车城市',
  '图片链接',
  '视频链接',
  'VIN',
  '渠道',
]);
s.addRow([
  'qa_1',
  '=1+1 用户原声',
  '语音更准确',
  '人工智能与情感体验',
  '语音唤醒与识别',
  '',
  '质量',
  new Date('2026-09-09T10:45:00Z'),
  '上海',
  'https://example.test/image',
  'https://example.test/video',
  'sensitive-do-not-import',
  '用户社区',
]);
const out = await parseWorkbook(await book.xlsx.writeBuffer());
assert.equal(out.rows.length, 1);
const r = out.rows[0].record;
assert.equal(r.city, '');
assert.equal(r.version, '');
assert.equal(r.source, '用户社区');
assert.equal(r.published_at, '2026-09-09 10:45:00');
assert.equal(
  r.attachment_links,
  'https://example.test/image\nhttps://example.test/video',
);
assert.ok(!JSON.stringify(r).includes('sensitive-do-not-import'));
assert.equal(r.external_id, 'qa_1');
const buffer = await buildWorkbook([{ ...r, id: 'stable_qa_1' }]);
const exported = new ExcelJS.Workbook();
await exported.xlsx.load(buffer);
assert.equal(
  exported.worksheets[0].getCell('A2').type,
  ExcelJS.ValueType.String,
);
assert.equal(exported.worksheets[0].getCell('A2').value, '=1+1 用户原声');
const roundtrip = await parseWorkbook(buffer);
assert.equal(roundtrip.rows[0].record.id, 'stable_qa_1');
for (const k of [
  'raw',
  'feature1',
  'feature2',
  'published_at',
  'attachment_links',
  'city',
  'version',
  'request_name',
  'external_id',
])
  assert.equal(roundtrip.rows[0].record[k], r[k]);
if (process.argv[2]) {
  const reference = await parseWorkbook(await readFile(process.argv[2]));
  assert.equal(reference.rows.length, 11);
  assert.ok(reference.rows.every((r) => r.record.city === ''));
  console.log(
    'PASS: provided workbook recognized, 11 rows; no use-city to IP-city mapping. Reference data was not uploaded.',
  );
}
console.log(
  'PASS: Excel mapping, date, excluded sensitive columns, attachment links, text/formula safety, export/import round-trip.',
);
