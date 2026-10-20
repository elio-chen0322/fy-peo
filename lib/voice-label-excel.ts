import { voiceHeaders, labelHeaders, screenHeaders } from './voice-labeling';
import { downloadBlob } from './excel';

function value(cell: any) {
  const v = cell.value;
  if (v instanceof Date) return v.toISOString().replace('Z', ''); // Excel holds Beijing wall time.
  if (v && typeof v === 'object') {
    if (v.formula || v.sharedFormula || v.error)
      throw new Error('原声和审核字段不能包含公式或错误单元格');
    if (v.richText) return v.richText.map((x: any) => x.text).join('');
    if (v.hyperlink) return v.text || v.hyperlink;
  }
  return v ?? null;
}
function readSheet(sheet: any) {
  if (sheet.rowCount > 20005) throw new Error('单次最多导入20,000行');
  let header = 0;
  let names: string[] = [];
  for (let i = 1; i <= Math.min(20, sheet.rowCount); i++) {
    const row = sheet.getRow(i);
    const h = Array.from({ length: row.cellCount }, (_, j) =>
      String(value(row.getCell(j + 1)) || ''),
    );
    if (h.includes('原声ID') && h.includes('原声正文')) {
      header = i;
      names = h;
      break;
    }
  }
  if (!header) throw new Error(`${sheet.name} 前20行未找到原声表头`);
  if (voiceHeaders.some((h, i) => names[i] !== h))
    throw new Error('前26列需保持原声总表的表头与顺序');
  const result = [];
  for (let i = header + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (!value(row.getCell(21))) continue;
    const raw = voiceHeaders.map((_, j) => value(row.getCell(j + 1)));
    const fields = Object.fromEntries(
      names.slice(26).map((h, j) => [h, value(row.getCell(j + 27))]),
    );
    result.push({ raw, fields });
  }
  return result;
}
async function compatibleXlsx(buffer: ArrayBuffer) {
  // The skill's OOXML exporter uses valid x: namespace prefixes. ExcelJS only
  // recognizes unprefixed SpreadsheetML elements, so normalize the package in
  // memory. No source file is modified, and r:id / other namespaces remain intact.
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.(xml|rels)$/.test(entry.name)) continue;
    const xml = await entry.async('string');
    if (xml.length > 30_000_000)
      throw new Error('工作表内容过大，请分文件导入');
    let next = xml.replace(/^\uFEFF/, '');
    const namespace =
      /xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/.exec(
        next,
      );
    if (namespace) {
      const prefix = namespace[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      next = next
        .replace(new RegExp('(<\\/?)' + prefix + ':', 'g'), '$1')
        .replace(
          namespace[0],
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        );
    }
    if (entry.name.endsWith('.rels')) {
      const base = entry.name.split('/').slice(0, -2);
      next = next.replace(/<Relationship\b[^>]*>/g, (tag) => {
        if (/TargetMode=["']External["']/.test(tag)) return tag;
        return tag.replace(/Target="\/([^"\r\n]+)"/, (_, target) => {
          const parts = String(target).split('/');
          let common = 0;
          while (
            common < base.length &&
            common < parts.length &&
            base[common] === parts[common]
          )
            common++;
          return (
            'Target="' +
            '../'.repeat(base.length - common) +
            parts.slice(common).join('/') +
            '"'
          );
        });
      });
    }
    if (next !== xml) {
      zip.file(entry.name, next);
      changed = true;
    }
  }
  return changed ? await zip.generateAsync({ type: 'arraybuffer' }) : buffer;
}
export async function parseLabelFile(file: File) {
  const review = (f: any, screen = false) => ({
    state: f['审核状态'] || '待审核',
    reviewer: f['审核人'] || '',
    note: f['审核备注'] || '',
    revision: f[screen ? '原声筛选版本' : '标签审核版本'],
    fields: Object.fromEntries(
      Object.entries(f)
        .filter(([k]) => k.startsWith('人工'))
        .map(([k, v]) => [k.slice(2), v]),
    ),
  });
  if (file.size > 30_000_000) throw new Error('文件不能超过30 MB');
  if (file.name.endsWith('.json')) {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.screening) || !Array.isArray(data.labels))
      throw new Error('请选择skill生成的review.json');
    const map = new Map<string, any>();
    for (const s of data.screening) {
      if (map.has(String(s.raw?.[20]))) throw new Error('筛选表含重复原声ID');
      map.set(String(s.raw?.[20]), {
        raw: s.raw,
        ai: s.ai,
        review: review(s.ai, true),
        labels: [],
      });
    }
    for (const l of data.labels) {
      const id = String(l.raw?.[20]),
        item = map.get(id);
      if (
        !item ||
        !String(l.key).startsWith(id + '#') ||
        JSON.stringify(item.raw) !== JSON.stringify(l.raw)
      )
        throw new Error('标签与原声ID或原声快照不对应');
      item.labels.push({
        intent_id: String(l.key).slice((id + '#').length),
        fragment: l.ai['诉求片段'],
        ai: l.ai,
        review: review(l.ai),
      });
    }
    return [...map.values()];
  }
  const ExcelJS = await import('exceljs');
  const book = new ExcelJS.default.Workbook();
  await book.xlsx.load(await compatibleXlsx(await file.arrayBuffer()));
  const screen =
    book.getWorksheet('原声筛选') ||
    book.getWorksheet('原声总表') ||
    book.worksheets[0];
  if (!screen) throw new Error('Excel没有工作表');
  const map = new Map<string, any>();
  for (const s of readSheet(screen)) {
    const id = String(s.raw[20]);
    if (map.has(id)) throw new Error('原声筛选表含重复原声ID');
    map.set(id, {
      raw: s.raw,
      ai: Object.fromEntries(
        screenHeaders
          .filter(
            (k) =>
              !k.startsWith('人工') &&
              !['审核状态', '审核人', '审核备注'].includes(k),
          )
          .map((k) => [k, s.fields[k] ?? '']),
      ),
      review: review(s.fields, true),
      labels: [],
    });
  }
  const labels = book.getWorksheet('诉求打标');
  if (labels)
    for (const l of readSheet(labels)) {
      const id = String(l.raw[20]),
        item = map.get(id),
        key = String(l.fields['标签行ID'] || '');
      if (!item || !key.startsWith(id + '#'))
        throw new Error('标签行ID与原声ID不对应');
      if (JSON.stringify(l.raw) !== JSON.stringify(item.raw))
        throw new Error('标签行与筛选行的原声或上下文不一致');
      item.labels.push({
        intent_id: key.slice(id.length + 1),
        fragment: l.fields['诉求片段'],
        ai: l.fields,
        review: review(l.fields),
      });
    }
  return [...map.values()];
}
export async function buildLabelWorkbook(rows: any[], dictionary?: any[]) {
  const ExcelJS = await import('exceljs');
  const book = new ExcelJS.default.Workbook();
  const add = (name: string, headers: string[], values: any[][]) => {
    const sheet = book.addWorksheet(name);
    sheet.getCell('A2').value = name;
    sheet.getCell('B3').value =
      '原26列保留；蓝色为人工审核字段。置信度为参考分，非校准概率。';
    sheet.getRow(5).values = headers;
    for (const vals of values)
      sheet.addRow(
        vals.map((v, i) =>
          headers[i]?.includes('北京时间') && v
            ? new Date(
                String(v)
                  .replace(' ', 'T')
                  .replace(/(?:Z|[+-]\d\d:\d\d)$/, '') + 'Z',
              )
            : v,
        ),
      );
    sheet.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: 5 + values.length, column: headers.length },
    };
    headers.forEach((h, i) => {
      const c = sheet.getColumn(i + 1);
      c.width = /正文|背景|上下文|依据|证据|名称|备注/.test(h)
        ? 55
        : /Feature/.test(h)
          ? 30
          : /ID/.test(h)
            ? 32
            : 22;
      if (/ID|稳定标识/.test(h)) c.numFmt = '@';
      if (h.includes('北京时间')) c.numFmt = 'yyyy-mm-dd hh:mm:ss';
      if (
        h.startsWith('人工') ||
        ['审核状态', '审核人', '审核备注'].includes(h)
      ) {
        c.eachCell({ includeEmpty: true }, (cell: any, row: number) => {
          if (row > 5) {
            cell.font = { color: { argb: 'FF175DA9' } };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFEEF6FF' },
            };
          }
        });
      }
    });
    sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(5).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF253B50' },
    };
    sheet.getRow(5).height = 40;
    sheet.eachRow((row: any, i: number) => {
      if (i > 5) {
        row.alignment = { vertical: 'top', wrapText: true };
        row.height = 100;
      }
    });
    return sheet;
  };
  const labels = rows.flatMap((item) =>
    item.labels.map((l: any) => {
      const f = l.final,
        ai = {
          ...l.ai,
          标签行ID: item.raw[20] + '#' + l.intent_id,
          诉求片段: l.fragment,
          字典版本: l.catalog_version,
          规则版本: l.rule_version,
          综合置信度: l.confidence ?? '',
          置信等级:
            l.confidence === null
              ? ''
              : l.confidence >= 90
                ? '高'
                : l.confidence >= 75
                  ? '中'
                  : '低',
          审核状态: l.review_status,
          审核人: l.reviewer,
          审核备注: l.note,
        };
      if (l.review_status !== '待审核')
        for (const k of [
          '诉求ID',
          '诉求名称',
          '一级Feature',
          '二级Feature',
          '建议/问题',
          '体验/质量',
          '匹配状态',
        ])
          ai['人工' + k] = f[k] || '';
      return [
        ...item.raw,
        ...labelHeaders.map((k) => ai[k] ?? ''),
        l.revision ?? '',
      ];
    }),
  );
  add('诉求打标', [...voiceHeaders, ...labelHeaders, '标签审核版本'], labels);
  const screen = rows.map((item) => {
    const s = item.screen,
      ai = {
        ...s?.ai,
        字典版本: s?.catalog_version || '',
        规则版本: s?.rule_version || '',
        审核状态: s?.review_status || '待审核',
        审核人: s?.reviewer || '',
        审核备注: s?.note || '',
      };
    if (s?.review_status !== '待审核') {
      ai['人工相关性'] = s?.relevance || '';
      ai['人工诉求性'] = s?.demandness || '';
    }
    return [
      ...item.raw,
      ...screenHeaders.map((k) => ai[k] ?? ''),
      s?.revision ?? '',
    ];
  });
  add('原声筛选', [...voiceHeaders, ...screenHeaders, '原声筛选版本'], screen);
  add(
    '已剔除',
    [...voiceHeaders, ...screenHeaders, '原声筛选版本'],
    screen.filter((_, i) => {
      const s = rows[i].screen;
      return (
        (s?.relevance === '不相关' || s?.demandness === '无诉求') &&
        (s.review_status !== '待审核' || s.confidence >= 95)
      );
    }),
  );
  if (dictionary)
    add(
      '标签字典',
      [
        '诉求ID',
        '诉求名称',
        '一级Feature',
        '二级Feature',
        '建议/问题',
        '体验/质量',
        '生命周期',
      ],
      dictionary.map((d) => [
        d.id,
        d.name,
        d.feature1,
        d.feature2,
        d.request_type === 'Need' ? '建议' : '问题',
        d.attribute,
        d.lifecycle_status,
      ]),
    );
  return book;
}
export async function exportLabels(rows: any[], dictionary: any[]) {
  const book = await buildLabelWorkbook(rows, dictionary);
  const bytes = await book.xlsx.writeBuffer();
  downloadBlob(
    new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'PEO原声打标-' +
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
        new Date(),
      ) +
      '.xlsx',
  );
}
