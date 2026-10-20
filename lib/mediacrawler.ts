import { emptyRecord, type InputRecord } from './catalog';

type JsonRecord = Record<string, unknown>;

function rowsFromFile(file: File, text: string): JsonRecord[] {
  if (file.name.toLowerCase().endsWith('.jsonl')) {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          const row = JSON.parse(line);
          if (!row || typeof row !== 'object' || Array.isArray(row))
            throw new Error('每行必须是 JSON 对象');
          return row as JsonRecord;
        } catch (error) {
          throw new Error(`${file.name} 第 ${index + 1} 行格式错误：${(error as Error).message}`);
        }
      });
  }
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as JsonRecord[];
  if (parsed && typeof parsed === 'object') {
    const object = parsed as Record<string, unknown>;
    for (const key of ['data', 'items', 'records'])
      if (Array.isArray(object[key])) return object[key] as JsonRecord[];
  }
  throw new Error(`${file.name} 中未找到记录数组`);
}

function textValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function publishedAt(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  const milliseconds = number < 1e12 ? number * 1000 : number;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return parts;
}

function countValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const text = String(value).trim().replace(/[，,\s]/g, '');
  if (!text || ['-', '—', 'null', 'none'].includes(text.toLowerCase())) return null;
  const match = text.match(/^([\d.]+)(万|亿|千|k|m)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = ({ 万: 10_000, 亿: 100_000_000, 千: 1_000, k: 1_000, m: 1_000_000 } as Record<string, number>)[match[2] || ''] || 1;
  const result = Math.round(amount * multiplier);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function parentCommentId(value: unknown) {
  const id = textValue(value);
  return id === '0' || id.toLowerCase() === 'none' || id.toLowerCase() === 'null' ? '' : id;
}

function capturedAt(row: JsonRecord) {
  return publishedAt(row.last_modify_ts || row.add_ts) || publishedAt(Date.now());
}

function noteUrl(row: JsonRecord) {
  const id = textValue(row.note_id);
  const raw = textValue(row.note_url);
  try {
    const parsed = raw ? new URL(raw) : null;
    if (parsed && ['xiaohongshu.com', 'www.xiaohongshu.com'].includes(parsed.hostname))
      return `https://www.xiaohongshu.com${parsed.pathname}`;
  } catch {
    // Fall back to a clean canonical link without transient query tokens.
  }
  return id ? `https://www.xiaohongshu.com/explore/${encodeURIComponent(id)}` : '';
}

function captureTime(record: InputRecord) {
  const value = record.captured_at?.trim();
  if (!value) return 0;
  const timestamp = Date.parse(value.replace(' ', 'T') + '+08:00');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function quality(record: InputRecord) {
  return (record.raw?.length || 0) + (record.url ? 500 : 0) + (record.published_at ? 100 : 0);
}

export async function parseMediaCrawlerFiles(files: File[]) {
  if (!files.length) throw new Error('请选择 MediaCrawler 的 JSONL 或 JSON 文件');
  if (files.some((file) => file.size > 20_000_000))
    throw new Error('单个文件不能超过 20 MB');
  const mapped: { row: number; record: InputRecord }[] = [];
  const warnings: string[] = [];
  let sourceRows = 0;
  for (const file of files) {
    const records = rowsFromFile(file, await file.text());
    if (!records.length) continue;
    sourceRows += records.length;
    const isComment = records.some((row) => 'comment_id' in row || 'parent_comment_id' in row);
    const isNote = records.some((row) => 'note_id' in row && ('desc' in row || 'title' in row));
    if (isComment === isNote)
      throw new Error(`${file.name} 无法判断是帖子还是评论数据，请选择 MediaCrawler 小红书 search_contents 或 search_comments 文件`);
    for (const [index, row] of records.entries()) {
      const id = textValue(isComment ? row.comment_id : row.note_id);
      const raw = isComment
        ? textValue(row.content)
        : [textValue(row.title), textValue(row.desc)].filter(Boolean).join('\n');
      if (!id) {
        warnings.push(`${file.name} 第 ${index + 1} 行缺少来源 ID，已跳过`);
        continue;
      }
      if (!raw) {
        warnings.push(`${file.name} 第 ${index + 1} 行原声为空，已跳过`);
        continue;
      }
      mapped.push({
        row: mapped.length + 1,
        record: {
          ...emptyRecord(),
          raw,
          analysis_context: textValue(row.analysis_context),
          source: '小红书',
          source_type: isComment ? '评论' : '帖子',
          external_id: id,
          post_id: textValue(row.note_id) || (isNote ? id : ''),
          parent_comment_id: isComment ? parentCommentId(row.parent_comment_id) : '',
          crawl_keyword: textValue(row.source_keyword),
          published_at: publishedAt(isComment ? row.create_time : row.time),
          captured_at: capturedAt(row),
          like_count: countValue(isComment ? row.like_count : row.liked_count),
          comment_count: isNote ? countValue(row.comment_count ?? row.comments_count) : null,
          collect_count: isNote ? countValue(row.collected_count) : null,
          share_count: isNote ? countValue(row.share_count ?? row.shared_count) : null,
          reply_count: isComment ? countValue(row.sub_comment_count) : null,
          url: noteUrl(row),
          city: textValue(row.ip_location),
          status: '待审核',
        },
      });
    }
  }
  if (!mapped.length) throw new Error('文件中没有可导入的帖子或评论原声');
  const unique = new Map<string, (typeof mapped)[number]>();
  let duplicateRows = 0;
  for (const item of mapped) {
    const key = `${item.record.source_type}:${item.record.external_id}`;
    const current = unique.get(key);
    if (!current) unique.set(key, item);
    else {
      duplicateRows++;
      if (
        captureTime(item.record) > captureTime(current.record) ||
        (captureTime(item.record) === captureTime(current.record) && quality(item.record) > quality(current.record))
      ) unique.set(key, item);
    }
  }
  return {
    rows: [...unique.values()].map((item, index) => ({ ...item, row: index + 1 })),
    ignored: [] as string[],
    sheet: 'MediaCrawler 小红书 JSONL',
    sourceRows,
    duplicateRows,
    warnings,
  };
}
