import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url),
  { build } = await import(
    createRequire(require.resolve('vite')).resolve('esbuild')
  );
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'peo-label-excel-'));
fs.symlinkSync(
  path.resolve('node_modules'),
  path.join(temp, 'node_modules'),
  'dir',
);
await build({
  entryPoints: ['lib/voice-label-excel.ts'],
  outfile: path.join(temp, 'excel.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const excel = await import(path.join(temp, 'excel.mjs'));
const source = JSON.parse(
  fs.readFileSync('../outputs/peo-voice-label-validation/review.json', 'utf8'),
);
const parsed = await excel.parseLabelFile(
  new File([JSON.stringify(source)], 'review.json'),
);
assert.equal(parsed.length, 8);
assert.equal(
  parsed.reduce((n, x) => n + x.labels.length, 0),
  4,
);
const rows = parsed.map((item) => ({
  ...item,
  screen: {
    ai: item.ai,
    relevance: item.ai['AI相关性'],
    confidence: item.ai['相关性置信度'],
    catalog_version: item.ai['字典版本'],
    rule_version: item.ai['规则版本'],
    review_status: '待审核',
  },
  labels: item.labels.map((l) => ({
    ...l,
    final: Object.fromEntries(
      [
        '诉求ID',
        '诉求名称',
        '一级Feature',
        '二级Feature',
        '建议/问题',
        '体验/质量',
        '匹配状态',
      ].map((k) => [k, l.ai['AI' + k] || '']),
    ),
    confidence: l.ai['综合置信度'],
    review_status: '待审核',
    catalog_version: l.ai['字典版本'],
    rule_version: l.ai['规则版本'],
  })),
}));
const book = await excel.buildLabelWorkbook(rows, [
  {
    id: 'd',
    name: '示例字典',
    feature1: '一级',
    feature2: '二级',
    request_type: 'Need',
    attribute: '体验',
    lifecycle_status: '启用',
  },
]);
assert.deepEqual(
  book.worksheets.map((s) => s.name),
  ['诉求打标', '原声筛选', '已剔除', '标签字典'],
);
assert.equal(book.getWorksheet('已剔除').rowCount, 6);
assert.equal(book.getWorksheet('诉求打标').rowCount, 9);
const data = await book.xlsx.writeBuffer();
const roundtrip = await excel.parseLabelFile(new File([data], 'review.xlsx'));
assert.equal(roundtrip.length, 8);
assert.equal(
  roundtrip.reduce((n, x) => n + x.labels.length, 0),
  4,
);
for (let i = 0; i < rows.length; i++)
  for (let j = 0; j < 26; j++) {
    const a = roundtrip[i].raw[j],
      b = rows[i].raw[j];
    if ([5, 7].includes(j) && a && b)
      assert.equal(Date.parse(String(a) + 'Z'), Date.parse(String(b) + 'Z'));
    else assert.equal(a, b ?? null, `原声列${j}被改变`);
  }
const direct = await excel.parseLabelFile(
  new File(
    [
      fs.readFileSync(
        '../outputs/voice-merged-20261016/用户原声总表_最近两天_合并版.xlsx',
      ),
    ],
    '原声总表.xlsx',
  ),
);
assert.equal(direct.length, 1033);
assert.equal(
  direct.reduce((n, x) => n + x.labels.length, 0),
  0,
);
console.log(
  '通过：skill JSON与Excel导入、26列完整往返、日期/长ID/空指标保留、一原声多行标签、剔除页、1033条原声总表识别。',
);
fs.rmSync(temp, { recursive: true });
