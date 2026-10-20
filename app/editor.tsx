'use client';
import { apiFetch, workspaceHref, downloadAttachment } from '@/lib/transport';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { api, type HistoryItem } from '@/lib/client';
import { Tags } from 'lucide-react';
import {
  emptyRecord,
  kinds,
  expressionTypes,
  statuses,
  types,
  fieldLabels,
  type InputRecord,
  type Feature,
  type Demand,
  type Theme,
} from '@/lib/catalog';
export function Choice({
  label,
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
}: {
  label: string;
  value?: string;
  options: (string | { id: string; name: string })[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <NativeSelect
        className="w-full mt-2"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) =>
          typeof o === 'string' ? (
            <option key={o}>{o}</option>
          ) : (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ),
        )}
      </NativeSelect>
    </label>
  );
}
export function HistoryList({
  items,
  onUndo,
  features = [],
  demands = [],
  revision,
}: {
  items: HistoryItem[];
  onUndo?: (id: string) => void;
  features?: Feature[];
  demands?: Demand[];
  revision?: number;
}) {
  const show = (key: string, v: any) =>
    key === 'request_id'
      ? demands.find((d) => d.id === v)?.name || v || '未设置'
      : key === 'feature_id'
        ? features.find((f) => f.id === v)?.name || v || '未设置'
        : key === 'archived'
          ? v
            ? '已归档'
            : '有效'
          : String(v ?? '') || '未设置';
  return (
    <>
      {items.length === 0 ? (
        <div className="empty-state">
          <p>暂无修改记录</p>
        </div>
      ) : (
        items.map((e) => {
          const before = JSON.parse(e.before_json),
            after = JSON.parse(e.after_json);
          const changes = Object.keys(after).filter(
            (k) => before[k] !== after[k] && fieldLabels[k],
          );
          return (
            <div className="history-entry" key={e.id}>
              <div className="history-top">
                <strong>{e.action}</strong>
                {onUndo &&
                  e.after_revision > 0 &&
                  (revision === undefined || revision === e.after_revision) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUndo(e.id)}
                    >
                      撤销此次修改
                    </Button>
                  )}
              </div>
              <p>
                {new Date(e.created_at).toLocaleString('zh-CN')} · {e.actor}{' '}
                {e.feedback_id && '· ' + e.feedback_id.slice(0, 8)}
              </p>
              <p>
                {changes.length
                  ? changes
                      .map(
                        (k) =>
                          `${fieldLabels[k]}：${show(k, before[k])} → ${show(k, after[k])}`,
                      )
                      .join('\n')
                  : after.name || '记录已保存'}
              </p>
            </div>
          );
        })
      )}
    </>
  );
}
export function Editor({
  record,
  features,
  demands,
  themes = [],
  onClose,
  onSaved,
}: {
  record: InputRecord | null;
  features: Feature[];
  demands: Demand[];
  themes?: Theme[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState<InputRecord>(emptyRecord()),
    [baseline, setBaseline] = useState(''),
    [detail, setDetail] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState(false),
    [uploads, setUploads] = useState<File[]>([]);
  const [suggestion, setSuggestion] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    setDetail(null);
    setUploads([]);
    if (!record) return;
    setForm(record);
    setBaseline(JSON.stringify(record));
    if (record.id) {
      setBusy(true);
      api('?mode=detail&id=' + record.id)
        .then((d) => {
          if (live) {
            setForm(d.row);
            setBaseline(JSON.stringify(d.row));
            setDetail(d);
          }
        })
        .catch((e) => live && setError(e.message))
        .finally(() => live && setBusy(false));
    }
    return () => {
      live = false;
    };
  }, [record]);
  const dirty = JSON.stringify(form) !== baseline || uploads.length > 0;
  useEffect(() => {
    if (!record || !dirty) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, record]);
  const change = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  function suggestLabels() {
    const text = `${form.raw || ''} ${form.request_name || ''}`.toLowerCase();
    const activeThemes = themes.filter((t) => t.active);
    const matches = activeThemes.flatMap((theme) => theme.keywords.split(/[，,、\n]/).map((word) => word.trim()).filter((word) => word.length > 1 && text.includes(word.toLowerCase())).map((word) => ({ theme, word })));
    const feature = [...features].sort((a, b) => b.name.length - a.name.length).find((f) => f.name.length > 1 && text.includes(f.name.toLowerCase()));
    const demand = [...demands].sort((a, b) => b.name.length - a.name.length).find((d) => d.name.length > 1 && text.includes(d.name.toLowerCase()));
    const themeMatch = matches.sort((a, b) => b.word.length - a.word.length)[0];
    const suggestedFeature = feature || (themeMatch ? features.find((f) => f.id === themeMatch.theme.feature_id) : undefined);
    setForm((f) => ({
      ...f,
      ...(suggestedFeature ? { feature1: suggestedFeature.parent, feature2: suggestedFeature.name, feature_id: suggestedFeature.id } : {}),
      ...(demand ? { request_id: demand.id, request_name: demand.name } : {}),
      ...(themeMatch ? { theme_id: themeMatch.theme.id, theme_confidence: 0, theme_reason: `原声命中主题关键词“${themeMatch.word}”` } : { theme_confidence: 0, theme_reason: '' }),
    }));
    setSuggestion([suggestedFeature ? `二级 Feature：${suggestedFeature.parent} / ${suggestedFeature.name}` : '', demand ? `用户诉求：${demand.name}` : '', themeMatch ? `主题：${themeMatch.theme.name}（命中“${themeMatch.word}”）` : '主题：未找到足够匹配的关键词'].filter(Boolean).join(' · '));
  }
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  async function save() {
    setBusy(true);
    setError('');
    try {
      const out = await api(
        '',
        form.id
          ? {
              action: 'edit',
              id: form.id,
              revision: form.revision,
              patch: form,
            }
          : { action: 'create', record: form },
      );
      if (out.duplicate)
        throw new Error('此反馈已经入库。请返回列表搜索，不必重复新增。');
      const id = form.id || out.id;
      const saved = await api('?mode=detail&id=' + id);
      setForm(saved.row);
      setBaseline(JSON.stringify(saved.row));
      setDetail(saved);
      let remaining = [...uploads];
      for (const file of uploads) {
        const fd = new FormData();
        fd.set('feedback_id', id);
        fd.set('file', file);
        const r = await apiFetch('/api/files', { method: 'POST', body: fd });
        if (!r.ok)
          throw new Error(
            ((await r.json()) as { error?: string }).error || '附件上传失败',
          );
        remaining = remaining.slice(1);
        setUploads(remaining);
      }
      await onSaved(form.id ? '修改已保存，历史版本已保留。' : '反馈已入库。');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function undo(id: string) {
    setBusy(true);
    setError('');
    try {
      await api('', { action: 'undo', event_id: id });
      const d = await api('?mode=detail&id=' + form.id);
      setForm(d.row);
      setBaseline(JSON.stringify(d.row));
      setDetail(d);
      await onSaved('已撤销修改，并保留撤销记录。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const parents = [...new Set(features.map((f) => f.parent))];
  const linkedDemand = demands.find((d) => d.id === form.request_id);
  return (
    <>
      <Sheet open={!!record} onOpenChange={(v) => !v && close()}>
        <SheetContent
          className="!w-[760px] !max-w-[96vw]"
          showCloseButton={!busy}
        >
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>
              {form.id ? '反馈档案 · ' + form.id.slice(0, 8) : '新增反馈'}
            </SheetTitle>
            <SheetDescription>
              保留真实原声，逐步完善诉求与分类。未知字段可以留空。
            </SheetDescription>
          </SheetHeader>
            <div className="edit-panel">
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <fieldset disabled={busy} className="form-grid">
              <div className="wide flex items-center gap-3 flex-wrap">
                <Button type="button" variant="outline" onClick={suggestLabels} disabled={!form.raw?.trim()}><Tags size={15} />生成分类建议</Button>
                <span className="muted">按当前 Feature、诉求和主题关键词做本地匹配；建议需人工确认，不会自动提交。</span>
                {suggestion && <p className="wide notice">{suggestion}</p>}
              </div>
              <label className="wide">
                反馈原声 <span className="text-red-700">*</span>
                <Textarea
                  value={form.raw || ''}
                  onChange={(e) => change('raw', e.target.value)}
                  placeholder="粘贴帖子或评论原文，不替换为摘要"
                />
              </label>
              <div className="wide">
                <Choice
                  label="用户诉求 · 选择已有标准诉求"
                  value={form.request_id}
                  options={demands}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      request_id: v,
                      request_name: v
                        ? demands.find((d) => d.id === v)?.name || ''
                        : '',
                    }))
                  }
                  placeholder="未归纳 / 填写新诉求"
                />
                {!form.request_id && (
                  <Input
                    className="mt-2"
                    aria-label="新用户诉求"
                    placeholder="或输入新的标准诉求，保存时加入诉求库"
                    value={form.request_name || ''}
                    onChange={(e) => change('request_name', e.target.value)}
                  />
                )}
                {linkedDemand && (
                  <div className="wide notice mt-3">
                    <strong>已继承诉求标签（以诉求库为准）</strong>
                    <p className="mt-2">
                      UBA：{linkedDemand.uba || '—'} · 属性：{linkedDemand.attribute || '—'} ·
                      类型：{linkedDemand.request_type || '—'} · 硬件/软件：{linkedDemand.hardware_software || '—'}
                    </p>
                    <p className="mt-1">
                      Feature：{linkedDemand.feature1 || '—'} / {linkedDemand.feature2 || '—'}
                    </p>
                  </div>
                )}
              </div>
              <Choice
                label="用户声音主题"
                value={form.theme_id}
                options={themes.filter((t) => t.active)}
                onChange={(v) => setForm((f) => ({ ...f, theme_id: v, theme_confidence: 0, theme_reason: '' }))}
                placeholder="未归类"
              />
              <div>
                <span className="field-label">分类标注方式</span>
                <p className="mt-3">{form.theme_id ? form.theme_reason ? '关键词建议 · 待确认' : '人工标注' : '未推荐'}</p>
                {form.theme_reason && <p className="muted mt-1">{form.theme_reason}</p>}
              </div>
              {!linkedDemand && <>
                <Choice
                  label="一级 Feature"
                  value={form.feature1}
                  options={parents}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      feature1: v,
                      feature2: '',
                      feature_id: '',
                    }))
                  }
                />
                <Choice
                  label="二级 Feature"
                  value={form.feature_id}
                  options={features.filter((f) => f.parent === form.feature1)}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      feature_id: v,
                      feature2: features.find((x) => x.id === v)?.name || '',
                    }))
                  }
                />
              </>}
              <Choice
                label="表达类型"
                value={form.expression_type}
                options={expressionTypes}
                onChange={(v) => change('expression_type', v)}
              />
              <Choice
                label="体验 / 质量"
                value={form.kind}
                options={kinds}
                onChange={(v) => change('kind', v)}
              />
              <Choice
                label="审核状态"
                value={form.status}
                options={statuses}
                onChange={(v) => change('status', v)}
              />
              <label>
                软件版本
                <Input
                  value={form.version || ''}
                  onChange={(e) => change('version', e.target.value)}
                  placeholder="未知则留空，不按发帖时间推断"
                />
              </label>
              <label>
                发帖 / 评论时间
                <Input
                  type="datetime-local"
                  step="1"
                  value={form.published_at?.replace(' ', 'T') || ''}
                  onChange={(e) => change('published_at', e.target.value)}
                />
              </label>
              <label>
                声音来源
                <Input
                  value={form.source || ''}
                  onChange={(e) => change('source', e.target.value)}
                />
              </label>
              <Choice
                label="内容类型"
                value={form.source_type}
                options={types}
                onChange={(v) => change('source_type', v)}
              />
              <label>
                来源编号
                <Input
                  value={form.external_id || ''}
                  onChange={(e) => change('external_id', e.target.value)}
                  placeholder="帖子 ID / 评论 ID / 原表搜索口令"
                />
              </label>
              <label>
                IP城市
                <Input
                  value={form.city || ''}
                  onChange={(e) => change('city', e.target.value)}
                  placeholder="仅记录平台展示的 IP 属地"
                />
              </label>
              <label className="wide">
                原文链接
                <Input
                  type="url"
                  value={form.url || ''}
                  onChange={(e) => change('url', e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="wide">
                附件链接 / 备注
                <Textarea
                  value={form.attachment_links || ''}
                  onChange={(e) => change('attachment_links', e.target.value)}
                  placeholder="图片、视频、音频链接；每行一项"
                />
              </label>
              <label className="wide">
                上传附件（每个不超过 20 MB）
                <Input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    if (list.some((f) => f.size > 20000000)) {
                      setError('单个附件不能超过 20 MB');
                      return;
                    }
                    setUploads(list);
                  }}
                />
                {uploads.length > 0 && (
                  <span className="muted">
                    待保存：{uploads.map((f) => f.name).join('、')}
                  </span>
                )}
              </label>
            </fieldset>
            {detail?.files?.length > 0 && (
              <div className="file-list mt-4">
                {detail.files.map((f: any) => (
                  <a key={f.id} href={'#attachment-' + f.id} onClick={e => { e.preventDefault(); downloadAttachment(f.id, f.name).catch(e => setError(e.message)); }}>
                    {f.name} ↗ · {(f.size / 1024).toFixed(0)} KB
                  </a>
                ))}
              </div>
            )}
            {form.external_id && (
              <details className="mt-5">
                <summary>采集关系与互动快照</summary>
                <div className="detail-evidence mt-3">
                  {[
                    `所属帖子 ID：${form.post_id || '未记录'}`,
                    `父评论 ID：${form.parent_comment_id || '无（帖子或一级评论）'}`,
                    `采集关键词：${form.crawl_keyword || '未记录'}`,
                    `采集时间：${form.captured_at || '未记录'}`,
                    `点赞：${form.like_count ?? '未记录'} · 帖子评论：${form.comment_count ?? '未记录'} · 收藏：${form.collect_count ?? '未记录'} · 分享：${form.share_count ?? '未记录'} · 评论回复：${form.reply_count ?? '未记录'}`,
                  ].join('\n')}
                </div>
              </details>
            )}
            <div className="notice mt-5">
              “质量”表示用户报告的失效或异常，尚不等于已验证缺陷。一级、二级
              Feature 为临时归纳，可在分类页修订。
            </div>
            {detail && (
              <>
                <details className="mt-6">
                  <summary>查看首次入库原始证据（只读）</summary>
                  <div className="detail-evidence mt-3">
                    {JSON.parse(detail.row.original_snapshot).raw}
                  </div>
                  <div className="detail-evidence mt-2">
                    {Object.entries(JSON.parse(detail.row.original_snapshot))
                      .filter(
                        ([k, v]) =>
                          v &&
                          k !== 'raw' &&
                          !k.endsWith('_id') &&
                          k !== 'archived',
                      )
                      .map(
                        ([k, v]) =>
                          `${fieldLabels[k] || ({ request_name: '原始用户诉求', feature1: '原始一级 Feature', feature2: '原始二级 Feature' } as Record<string, string>)[k] || k}：${v}`,
                      )
                      .join('\n')}
                  </div>
                </details>
                <details className="mt-6">
                  <summary>修改历史 · 最近 50 次</summary>
                  <HistoryList
                    items={detail.history}
                    features={features}
                    demands={demands}
                    revision={dirty || busy ? -1 : form.revision}
                    onUndo={undo}
                  />
                </details>
              </>
            )}
          </div>
          <div className="sticky-actions">
            <Button variant="outline" onClick={close} disabled={busy}>
              取消
            </Button>
            <Button onClick={save} disabled={busy || !form.raw?.trim()}>
              {busy ? '正在保存 / 加载…' : '保存反馈'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={discard} onOpenChange={setDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>放弃尚未保存的修改？</DialogTitle>
            <DialogDescription>
              已入库的原始内容和历史记录不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              继续编辑
            </Button>
            <Button
              onClick={() => {
                setDiscard(false);
                onClose();
              }}
            >
              放弃修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
