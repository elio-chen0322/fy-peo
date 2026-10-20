import { emptyRecord, type InputRecord, type Feedback } from './catalog';
const columns: [string, string, number][] = [
  ['反馈原声', 'raw', 60],
  ['所属帖子ID', 'post_id', 28],
  ['父评论ID', 'parent_comment_id', 28],
  ['采集关键词', 'crawl_keyword', 20],
  ['采集时间', 'captured_at', 24],
  ['点赞数', 'like_count', 12],
  ['帖子评论数', 'comment_count', 14],
  ['收藏数', 'collect_count', 12],
  ['分享数', 'share_count', 12],
  ['评论回复数', 'reply_count', 14],
  ['用户诉求', 'request_name', 32],
  ['诉求UBA', 'request_uba', 12],
  ['诉求属性', 'request_attribute', 14],
  ['诉求类型', 'request_type', 14],
  ['硬件/软件类型', 'request_hardware_software', 18],
  ['用户声音主题', 'theme_name', 28],
  ['一级Feature', 'feature1', 28],
  ['二级Feature', 'feature2', 28],
  ['体验/质量', 'kind', 14],
  ['版本', 'version', 24],
  ['发帖/评论时间', 'published_at', 24],
  ['链接', 'url', 36],
  ['附件', 'attachment_links', 38],
  ['IP城市', 'city', 16],
  ['声音来源', 'source', 16],
  ['内容类型', 'source_type', 12],
  ['审核状态', 'status', 12],
  ['来源编号', 'external_id', 24],
  ['反馈编号', 'id', 40],
];
const aliases: Record<string, string> = {
  反馈原声: 'raw',
  用户诉求: 'request_name',
  用户声音主题: 'theme_name',
  一级feature: 'feature1',
  二级feature: 'feature2',
  '体验/质量': 'kind',
  '体验／质量': 'kind',
  版本: 'version',
  报错版本: 'version',
  反馈软件版本: 'version',
  '发帖/评论时间': 'published_at',
  发帖时间: 'published_at',
  评论时间: 'published_at',
  链接: 'url',
  原文链接: 'url',
  附件: 'attachment_links',
  ip城市: 'city',
  声音来源: 'source',
  来源: 'source',
  渠道: 'source',
  内容类型: 'source_type',
  审核状态: 'status',
  来源编号: 'external_id',
  搜索口令: 'external_id',
  反馈编号: 'id',
};
function cellText(c: any): string {
  const v = c.value;
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (v && typeof v === 'object') {
    if (v.hyperlink) return v.hyperlink;
    if (v.richText) return v.richText.map((x: any) => x.text).join('');
    if ('result' in v) return String(v.result ?? '');
    if (v.error) return '';
  }
  return String(v ?? '').trim();
}
export async function parseWorkbook(buffer: ArrayBuffer) {
  const ExcelJS = await import('exceljs');
  const book = new ExcelJS.default.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error('工作簿中没有工作表');
  if (sheet.rowCount > 10001)
    throw new Error('单次最多 10,000 行，请分文件导入');
  const headers: Record<number, string> = {},
    extras: number[] = [];
  const ignored: string[] = [];
  sheet.getRow(1).eachCell((c, i) => {
    const h = cellText(c).replace(/\s/g, '').toLowerCase();
    if (aliases[h]) headers[i] = aliases[h];
    else if (['图片链接', '视频链接', '语音链接'].includes(h)) extras.push(i);
    else ignored.push(cellText(c));
  });
  if (!Object.values(headers).includes('raw'))
    throw new Error('未找到「反馈原声」表头，请将表头放在第一行');
  const rows: { row: number; record: InputRecord }[] = [];
  sheet.eachRow((r, i) => {
    if (i === 1) return;
    const defaults = {
      ...emptyRecord(),
      source: '未注明',
      source_type: '其他',
    };
    const record: any = { ...defaults };
    for (const [n, k] of Object.entries(headers))
      record[k] = cellText(r.getCell(Number(n)));
    record.attachment_links = [
      record.attachment_links,
      ...extras.map((n) => cellText(r.getCell(n))),
    ]
      .filter(Boolean)
      .join('\n');
    for (const k of ['kind', 'status', 'source', 'source_type'])
      if (!record[k]) record[k] = (defaults as any)[k];
    if (Object.values(headers).some((k) => record[k]))
      rows.push({ row: i, record });
  });
  return { rows, ignored, sheet: sheet.name };
}
export function downloadBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
export async function buildWorkbook(rows: Partial<Feedback>[]) {
  const ExcelJS = await import('exceljs');
  const book = new ExcelJS.default.Workbook();
  const s = book.addWorksheet('反馈详情');
  s.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  for (const r of rows)
    s.addRow(
      Object.fromEntries(
        columns.map(([, key]) => [key, (r as any)[key] ?? '']),
      ),
    );
  s.views = [{ state: 'frozen', ySplit: 1 }];
  s.autoFilter = `A1:${s.getColumn(columns.length).letter}1`;
  s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  s.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF163D37' },
  };
  s.getRow(1).height = 28;
  s.eachRow((r, i) => {
    if (i > 1) {
      r.alignment = { vertical: 'top', wrapText: true };
      r.height = 64;
    }
  });
  return book.xlsx.writeBuffer();
}
export async function exportWorkbook(
  rows: Partial<Feedback>[],
  filename = 'firefly-反馈库.xlsx',
) {
  const b = await buildWorkbook(rows);
  downloadBlob(
    new Blob([b as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}
