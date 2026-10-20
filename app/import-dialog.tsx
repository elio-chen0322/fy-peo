'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { parseWorkbook, exportWorkbook } from '@/lib/excel';
import { parseMediaCrawlerFiles } from '@/lib/mediacrawler';
import type { InputRecord } from '@/lib/catalog';
import { api } from '@/lib/client';
type ImportData = {
  rows: { row: number; record: InputRecord }[];
  ignored: string[];
  sheet: string;
  sourceRows?: number;
  duplicateRows: number;
  warnings: string[];
};
export function ImportDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (m: string) => Promise<void>;
}) {
  const [data, setData] = useState<ImportData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState(''),
    [issues, setIssues] = useState<string[]>([]),
    [done, setDone] = useState(false);
  async function select(selected?: FileList | File[]) {
    const files = Array.from(selected || []);
    if (!files.length) return;
    setBusy(true);
    setError('');
    setData(null);
    setResult('');
    setIssues([]);
    setDone(false);
    try {
      if (files.reduce((total, file) => total + file.size, 0) > 20_000_000)
        throw new Error('所选文件总大小不能超过 20 MB');
      const excelFiles = files.filter((file) => file.name.toLowerCase().endsWith('.xlsx'));
      if (excelFiles.length) {
        if (files.length !== 1) throw new Error('Excel 文件请一次选择一个；MediaCrawler 可以同时选择帖子与评论 JSONL');
        const parsed = await parseWorkbook(await files[0].arrayBuffer());
        setData({ ...parsed, duplicateRows: 0, warnings: [] });
      } else {
        const parsed = await parseMediaCrawlerFiles(files);
        setData(parsed);
        setIssues(parsed.warnings);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!data) return;
    setBusy(true);
    setError('');
    const failures: string[] = [];
    let added = 0,
      refreshed = 0,
      duplicate = data.duplicateRows;
    try {
      for (let i = 0; i < data.rows.length; i += 25) {
        setResult(
          `正在处理 ${i + 1}–${Math.min(i + 25, data.rows.length)} / ${data.rows.length} 行`,
        );
        const batch = data.rows.slice(i, i + 25);
        const out = await api('', {
          action: 'import',
          records: batch.map((x) => x.record),
        });
        for (const r of out.results) {
          if (r.error) failures.push(`第 ${batch[r.index].row} 行：${r.error}`);
          else if (r.refreshed) refreshed++;
          else if (r.duplicate) duplicate++;
          else added++;
        }
      }
      setDone(true);
      setResult(
        `新增 ${added} 条 · 更新采集快照 ${refreshed} 条 · 跳过未变化重复 ${duplicate} 条 · 空原声/缺少来源 ID 跳过 ${data.warnings.length} 条 · 失败 ${failures.length} 条`,
      );
    } catch (e) {
      setError(
        `导入中断：${(e as Error).message}。已成功新增 ${added} 条；可以重新导入同一文件，已入库内容将跳过。`,
      );
    } finally {
      setIssues(failures);
      setBusy(false);
      await onSaved(`本次导入已新增 ${added} 条反馈。`);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        className="!max-w-[900px] max-h-[90vh] overflow-auto"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>导入历史反馈</DialogTitle>
          <DialogDescription>
            支持 Excel，也支持 MediaCrawler 小红书 search_contents / search_comments JSONL。导入后按已维护的 Feature、诉求和主题关键词生成待审核建议；按来源 ID 去重，不覆盖已入库和手工修改的数据。
          </DialogDescription>
        </DialogHeader>
        <div className="notice">
            Excel 原表「用车城市」不会作为 IP 城市导入；VIN、Vehicle ID
          等不在本版范围内。图片、视频、语音链接合并至附件。时间统一按中国标准时间记录，不自动补齐版本。
        </div>
        <div className="inline-fields">
          <Input
            aria-label="选择 Excel 或 MediaCrawler 文件"
            type="file"
            accept=".xlsx,.json,.jsonl"
            multiple
            disabled={busy}
            onChange={(e) => select(e.target.files || undefined)}
          />
          <Button
            variant="outline"
            onClick={() => exportWorkbook([], 'firefly-导入模板.xlsx')}
          >
            下载模板
          </Button>
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {data && (
          <>
            <div className="import-summary">
              {data.sheet} · {data.sourceRows !== undefined ? `源文件 ${data.sourceRows} 行 · 去重后 ${data.rows.length} 条待导入` : `${data.rows.length} 条待处理`}
              {data.rows.length > 20 ? ' · 预览前 20 条' : ''}
              {data.duplicateRows > 0 && ` · 文件内重复 ${data.duplicateRows} 条已合并`}
            </div>
            {data.warnings.length > 0 && <p className="muted">已跳过 {data.warnings.length} 条无来源 ID 或原声为空的记录，明细见下方。</p>}
            {data.ignored.length > 0 && (
              <p className="muted">不导入的列：{data.ignored.join('、')}</p>
            )}
            <div className="table-wrap max-h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      '行号',
                      '反馈原声',
                      '帖子关系 / 互动',
                      '用户诉求',
                      'Feature',
                      '平台 / 内容类型',
                      '发布时间',
                      'IP城市',
                    ].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.slice(0, 20).map(({ row, record: r }) => (
                    <TableRow key={row}>
                      <TableCell>{row}</TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal">
                        {r.raw || (
                          <span className="text-red-700">
                            原声缺失，无法导入
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal text-xs">
                        <div>帖子：{r.post_id || '—'}{r.parent_comment_id ? ` · 父评论：${r.parent_comment_id}` : ''}</div>
                        <div>点赞：{r.like_count ?? '—'} · 帖子评论：{r.comment_count ?? '—'} · 收藏：{r.collect_count ?? '—'} · 分享：{r.share_count ?? '—'} · 回复：{r.reply_count ?? '—'}</div>
                        <div>采集：{r.captured_at || '未知'}{r.crawl_keyword ? ` · 关键词：${r.crawl_keyword}` : ''}</div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {r.request_name || '待归纳'}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {r.feature1} / {r.feature2}
                      </TableCell>
                      <TableCell>{r.source} / {r.source_type}</TableCell>
                      <TableCell>{r.published_at || '时间未知'}</TableCell>
                      <TableCell>{r.city || '未知'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="actions justify-end">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                关闭
              </Button>
              <Button
                onClick={run}
                disabled={busy || done || !data.rows.length}
              >
                {busy
                  ? '处理中…'
                  : done
                    ? '已处理'
                    : '确认导入 ' + data.rows.length + ' 条'}
              </Button>
            </div>
          </>
        )}
        {result && (
          <div className="notice" role="status">
            {result}
          </div>
        )}
        {issues.length > 0 && (
          <div className="error-box whitespace-pre-wrap">
            {issues.slice(0, 20).join('\n')}{issues.length > 20 ? `\n…另有 ${issues.length - 20} 条未展示` : ''}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
